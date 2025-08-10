use crate::config::Config;
use crate::error::{Result, TriliumError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::fs;
use tokio::process::Command as TokioCommand;

/// Plugin metadata loaded from plugin.toml
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMetadata {
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub homepage: Option<String>,
    pub license: Option<String>,
    
    /// Minimum CLI version required
    pub min_cli_version: Option<String>,
    
    /// Plugin capabilities
    pub capabilities: Vec<PluginCapability>,
    
    /// Commands this plugin provides
    pub commands: Vec<PluginCommand>,
    
    /// Formatters this plugin provides
    pub formatters: Vec<PluginFormatter>,
    
    /// Processors this plugin provides
    pub processors: Vec<PluginProcessor>,
    
    /// Plugin entry point
    pub entry_point: PluginEntryPoint,
    
    /// Security settings
    pub security: PluginSecurity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PluginCapability {
    Command,
    Formatter,
    Processor,
    ApiAccess,
    FileSystem,
    Network,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginCommand {
    pub name: String,
    pub description: String,
    pub usage: Option<String>,
    pub aliases: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginFormatter {
    pub name: String,
    pub description: String,
    pub input_formats: Vec<String>,
    pub output_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginProcessor {
    pub name: String,
    pub description: String,
    pub input_types: Vec<String>,
    pub output_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PluginEntryPoint {
    Script { path: String },
    Executable { path: String },
    Library { path: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSecurity {
    /// Whether this plugin is trusted
    pub trusted: bool,
    
    /// Permissions requested by the plugin
    pub permissions: Vec<PluginPermission>,
    
    /// Sandbox settings
    pub sandbox: SandboxConfig,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum PluginPermission {
    ReadNotes,
    WriteNotes,
    DeleteNotes,
    ReadFiles,
    WriteFiles,
    NetworkAccess,
    ProcessExecution,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    /// Enable sandboxing
    pub enabled: bool,
    
    /// Timeout in seconds
    pub timeout: u64,
    
    /// Memory limit in MB
    pub memory_limit: Option<u64>,
    
    /// CPU time limit in seconds
    pub cpu_limit: Option<u64>,
    
    /// Allowed file paths
    pub allowed_paths: Vec<PathBuf>,
    
    /// Network restrictions
    pub network_restrictions: NetworkRestrictions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkRestrictions {
    /// Allow outbound connections
    pub allow_outbound: bool,
    
    /// Allowed domains
    pub allowed_domains: Vec<String>,
    
    /// Blocked domains
    pub blocked_domains: Vec<String>,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            timeout: 30,
            memory_limit: Some(100), // 100MB
            cpu_limit: Some(10),     // 10 seconds
            allowed_paths: Vec::new(),
            network_restrictions: NetworkRestrictions {
                allow_outbound: false,
                allowed_domains: Vec::new(),
                blocked_domains: Vec::new(),
            },
        }
    }
}

impl Default for PluginSecurity {
    fn default() -> Self {
        Self {
            trusted: false,
            permissions: Vec::new(),
            sandbox: SandboxConfig::default(),
        }
    }
}

/// Plugin manager handles loading and executing plugins
pub struct PluginManager {
    plugins: HashMap<String, LoadedPlugin>,
    plugin_directories: Vec<PathBuf>,
    config: Config,
}

/// A loaded plugin with its metadata and execution state
#[derive(Debug)]
pub struct LoadedPlugin {
    pub metadata: PluginMetadata,
    pub path: PathBuf,
    pub loaded: bool,
    pub last_error: Option<String>,
}

/// Plugin execution context passed to plugins
#[derive(Debug, Serialize, Deserialize)]
pub struct PluginContext {
    /// CLI configuration (filtered for security)
    pub config: PluginConfig,
    
    /// Current operation context
    pub operation: String,
    
    /// Input data
    pub input: serde_json::Value,
    
    /// Environment variables
    pub env: HashMap<String, String>,
}

/// Filtered configuration for plugins
#[derive(Debug, Serialize, Deserialize)]
pub struct PluginConfig {
    pub server_url: String,
    pub current_profile: String,
    // Note: API tokens are never passed to plugins for security
}

/// Plugin execution result
#[derive(Debug, Serialize, Deserialize)]
pub struct PluginResult {
    pub success: bool,
    pub output: serde_json::Value,
    pub error: Option<String>,
    pub logs: Vec<String>,
}

impl PluginManager {
    /// Create a new plugin manager
    pub fn new(config: Config) -> Self {
        let plugin_directories = Self::collect_plugin_directories(&config);
        
        Self {
            plugins: HashMap::new(),
            plugin_directories,
            config,
        }
    }
    
    /// Collect plugin directories from configuration
    fn collect_plugin_directories(config: &Config) -> Vec<PathBuf> {
        let mut dirs = config.global.plugin_directories.clone();
        
        if let Ok(profile) = config.current_profile() {
            dirs.extend(profile.plugin_directories.clone());
        }
        
        // Add default system directories
        if let Some(config_dir) = dirs::config_dir() {
            dirs.push(config_dir.join("trilium-cli").join("plugins"));
        }
        
        dirs
    }
    
    /// Discover and load all plugins
    pub async fn discover_plugins(&mut self) -> Result<()> {
        for plugin_dir in &self.plugin_directories.clone() {
            if plugin_dir.exists() && plugin_dir.is_dir() {
                self.discover_plugins_in_directory(plugin_dir).await?;
            }
        }
        Ok(())
    }
    
    /// Discover plugins in a specific directory
    async fn discover_plugins_in_directory(&mut self, dir: &Path) -> Result<()> {
        let entries = fs::read_dir(dir)
            .map_err(|e| TriliumError::plugin_error(&format!("Failed to read plugin directory: {}", e)))?;
            
        for entry in entries {
            let entry = entry.map_err(|e| TriliumError::plugin_error(&format!("Failed to read directory entry: {}", e)))?;
            let path = entry.path();
            
            if path.is_dir() {
                let plugin_file = path.join("plugin.toml");
                if plugin_file.exists() {
                    match self.load_plugin_metadata(&plugin_file).await {
                        Ok(metadata) => {
                            let plugin = LoadedPlugin {
                                metadata: metadata.clone(),
                                path: path.clone(),
                                loaded: false,
                                last_error: None,
                            };
                            self.plugins.insert(metadata.name.clone(), plugin);
                        }
                        Err(e) => {
                            eprintln!("Failed to load plugin from {}: {}", plugin_file.display(), e);
                        }
                    }
                }
            }
        }
        
        Ok(())
    }
    
    /// Load plugin metadata from plugin.toml
    async fn load_plugin_metadata(&self, plugin_file: &Path) -> Result<PluginMetadata> {
        let content = fs::read_to_string(plugin_file)
            .map_err(|e| TriliumError::plugin_error(&format!("Failed to read plugin file: {}", e)))?;
            
        let metadata: PluginMetadata = toml::from_str(&content)
            .map_err(|e| TriliumError::plugin_error(&format!("Failed to parse plugin metadata: {}", e)))?;
            
        // Validate plugin metadata
        self.validate_plugin_metadata(&metadata)?;
        
        Ok(metadata)
    }
    
    /// Validate plugin metadata for security and correctness
    fn validate_plugin_metadata(&self, metadata: &PluginMetadata) -> Result<()> {
        // Check name
        if metadata.name.is_empty() {
            return Err(TriliumError::plugin_error("Plugin name cannot be empty"));
        }
        
        if !metadata.name.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
            return Err(TriliumError::plugin_error("Plugin name contains invalid characters"));
        }
        
        // Check version
        if metadata.version.is_empty() {
            return Err(TriliumError::plugin_error("Plugin version cannot be empty"));
        }
        
        // Validate security permissions
        if metadata.security.permissions.contains(&PluginPermission::ProcessExecution) {
            if !metadata.security.trusted {
                return Err(TriliumError::plugin_error(
                    "Process execution permission requires trusted plugin"
                ));
            }
        }
        
        // Validate entry point
        match &metadata.entry_point {
            PluginEntryPoint::Script { path } => {
                if path.is_empty() {
                    return Err(TriliumError::plugin_error("Script path cannot be empty"));
                }
                // Additional script validation could be added here
            }
            PluginEntryPoint::Executable { path } => {
                if path.is_empty() {
                    return Err(TriliumError::plugin_error("Executable path cannot be empty"));
                }
            }
            PluginEntryPoint::Library { path } => {
                if path.is_empty() {
                    return Err(TriliumError::plugin_error("Library path cannot be empty"));
                }
                if !metadata.security.trusted {
                    return Err(TriliumError::plugin_error(
                        "Library plugins require trusted status"
                    ));
                }
            }
        }
        
        Ok(())
    }
    
    /// Execute a plugin command
    pub async fn execute_plugin_command(
        &self,
        plugin_name: &str,
        command_name: &str,
        args: Vec<String>,
        input: Option<serde_json::Value>,
    ) -> Result<PluginResult> {
        let plugin = self.plugins.get(plugin_name)
            .ok_or_else(|| TriliumError::plugin_error(&format!("Plugin '{}' not found", plugin_name)))?;
            
        // Check if command exists
        if !plugin.metadata.commands.iter().any(|cmd| cmd.name == command_name) {
            return Err(TriliumError::plugin_error(&format!(
                "Command '{}' not found in plugin '{}'", command_name, plugin_name
            )));
        }
        
        // Create execution context
        let context = PluginContext {
            config: PluginConfig {
                server_url: self.config.current_profile()?.server_url.clone(),
                current_profile: self.config.current_profile.clone(),
            },
            operation: command_name.to_string(),
            input: input.unwrap_or(serde_json::Value::Null),
            env: std::env::vars().collect(),
        };
        
        // Execute based on entry point type
        match &plugin.metadata.entry_point {
            PluginEntryPoint::Script { path } => {
                self.execute_script_plugin(&plugin.path, path, &context, &args).await
            }
            PluginEntryPoint::Executable { path } => {
                self.execute_executable_plugin(&plugin.path, path, &context, &args).await
            }
            PluginEntryPoint::Library { .. } => {
                // Library plugins would require unsafe code and dynamic loading
                // For security reasons, we'll return an error for now
                Err(TriliumError::plugin_error("Library plugins not yet supported"))
            }
        }
    }
    
    /// Execute a script-based plugin
    async fn execute_script_plugin(
        &self,
        plugin_dir: &Path,
        script_path: &str,
        context: &PluginContext,
        args: &[String],
    ) -> Result<PluginResult> {
        let script_full_path = plugin_dir.join(script_path);
        
        if !script_full_path.exists() {
            return Err(TriliumError::plugin_error(&format!(
                "Plugin script not found: {}", script_full_path.display()
            )));
        }
        
        // Serialize context to JSON for passing to script
        let context_json = serde_json::to_string(context)
            .map_err(|e| TriliumError::plugin_error(&format!("Failed to serialize context: {}", e)))?;
        
        // Determine interpreter based on file extension
        let interpreter = self.get_script_interpreter(&script_full_path)?;
        
        // Build command
        let mut cmd = TokioCommand::new(&interpreter);
        cmd.arg(&script_full_path);
        cmd.args(args);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        // Set environment variables
        cmd.env("TRILIUM_PLUGIN_CONTEXT", context_json);
        
        // Execute with timeout
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            cmd.output()
        ).await
        .map_err(|_| TriliumError::plugin_error("Plugin execution timed out"))?
        .map_err(|e| TriliumError::plugin_error(&format!("Failed to execute plugin: {}", e)))?;
        
        // Parse output
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        
        if output.status.success() {
            // Try to parse stdout as JSON result
            match serde_json::from_str::<PluginResult>(&stdout) {
                Ok(result) => Ok(result),
                Err(_) => {
                    // If not JSON, treat as plain text output
                    Ok(PluginResult {
                        success: true,
                        output: serde_json::Value::String(stdout.to_string()),
                        error: None,
                        logs: if stderr.is_empty() { Vec::new() } else { vec![stderr.to_string()] },
                    })
                }
            }
        } else {
            Ok(PluginResult {
                success: false,
                output: serde_json::Value::Null,
                error: Some(stderr.to_string()),
                logs: Vec::new(),
            })
        }
    }
    
    /// Execute an executable plugin
    async fn execute_executable_plugin(
        &self,
        plugin_dir: &Path,
        exe_path: &str,
        context: &PluginContext,
        args: &[String],
    ) -> Result<PluginResult> {
        let exe_full_path = plugin_dir.join(exe_path);
        
        if !exe_full_path.exists() {
            return Err(TriliumError::plugin_error(&format!(
                "Plugin executable not found: {}", exe_full_path.display()
            )));
        }
        
        // Serialize context to JSON
        let context_json = serde_json::to_string(context)
            .map_err(|e| TriliumError::plugin_error(&format!("Failed to serialize context: {}", e)))?;
        
        // Build command
        let mut cmd = TokioCommand::new(&exe_full_path);
        cmd.args(args);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        cmd.env("TRILIUM_PLUGIN_CONTEXT", context_json);
        
        // Execute with timeout
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(60),
            cmd.output()
        ).await
        .map_err(|_| TriliumError::plugin_error("Plugin execution timed out"))?
        .map_err(|e| TriliumError::plugin_error(&format!("Failed to execute plugin: {}", e)))?;
        
        // Parse output
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        
        if output.status.success() {
            match serde_json::from_str::<PluginResult>(&stdout) {
                Ok(result) => Ok(result),
                Err(_) => {
                    Ok(PluginResult {
                        success: true,
                        output: serde_json::Value::String(stdout.to_string()),
                        error: None,
                        logs: if stderr.is_empty() { Vec::new() } else { vec![stderr.to_string()] },
                    })
                }
            }
        } else {
            Ok(PluginResult {
                success: false,
                output: serde_json::Value::Null,
                error: Some(stderr.to_string()),
                logs: Vec::new(),
            })
        }
    }
    
    /// Determine script interpreter from file extension
    fn get_script_interpreter(&self, script_path: &Path) -> Result<String> {
        let extension = script_path.extension()
            .and_then(|ext| ext.to_str())
            .ok_or_else(|| TriliumError::plugin_error("Script file has no extension"))?;
            
        match extension {
            "py" => Ok("python3".to_string()),
            "js" => Ok("node".to_string()),
            "sh" => Ok("bash".to_string()),
            "rb" => Ok("ruby".to_string()),
            "pl" => Ok("perl".to_string()),
            _ => Err(TriliumError::plugin_error(&format!("Unsupported script type: {}", extension)))
        }
    }
    
    /// List all available plugins
    pub fn list_plugins(&self) -> Vec<&PluginMetadata> {
        self.plugins.values().map(|p| &p.metadata).collect()
    }
    
    /// Get plugin metadata by name
    pub fn get_plugin(&self, name: &str) -> Option<&LoadedPlugin> {
        self.plugins.get(name)
    }
    
    /// Check if a plugin provides a specific command
    pub fn has_command(&self, plugin_name: &str, command_name: &str) -> bool {
        self.plugins.get(plugin_name)
            .map(|plugin| plugin.metadata.commands.iter().any(|cmd| cmd.name == command_name))
            .unwrap_or(false)
    }
    
    /// Get all available plugin commands
    pub fn get_plugin_commands(&self) -> HashMap<String, Vec<&PluginCommand>> {
        let mut commands = HashMap::new();
        
        for (plugin_name, plugin) in &self.plugins {
            if !plugin.metadata.commands.is_empty() {
                let plugin_commands: Vec<&PluginCommand> = plugin.metadata.commands.iter().collect();
                commands.insert(plugin_name.clone(), plugin_commands);
            }
        }
        
        commands
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs;

    fn create_test_plugin(dir: &Path, name: &str, trusted: bool) -> Result<()> {
        let plugin_dir = dir.join(name);
        fs::create_dir_all(&plugin_dir).unwrap();
        
        let metadata = PluginMetadata {
            name: name.to_string(),
            version: "1.0.0".to_string(),
            description: Some("Test plugin".to_string()),
            author: Some("Test Author".to_string()),
            homepage: None,
            license: Some("MIT".to_string()),
            min_cli_version: Some("0.1.0".to_string()),
            capabilities: vec![PluginCapability::Command],
            commands: vec![PluginCommand {
                name: "test".to_string(),
                description: "Test command".to_string(),
                usage: None,
                aliases: Vec::new(),
            }],
            formatters: Vec::new(),
            processors: Vec::new(),
            entry_point: PluginEntryPoint::Script {
                path: "main.py".to_string(),
            },
            security: PluginSecurity {
                trusted,
                permissions: Vec::new(),
                sandbox: SandboxConfig::default(),
            },
        };
        
        let plugin_toml = toml::to_string(&metadata).unwrap();
        fs::write(plugin_dir.join("plugin.toml"), plugin_toml).unwrap();
        
        // Create a simple test script
        fs::write(
            plugin_dir.join("main.py"),
            r#"#!/usr/bin/env python3
import json
import sys
result = {
    "success": True,
    "output": "Hello from test plugin!",
    "error": None,
    "logs": []
}
print(json.dumps(result))
"#,
        ).unwrap();
        
        Ok(())
    }

    #[tokio::test]
    async fn test_plugin_discovery() {
        let temp_dir = TempDir::new().unwrap();
        let plugin_dir = temp_dir.path().join("plugins");
        fs::create_dir_all(&plugin_dir).unwrap();
        
        // Create test plugins
        create_test_plugin(&plugin_dir, "test-plugin", true).unwrap();
        create_test_plugin(&plugin_dir, "another-plugin", false).unwrap();
        
        let mut config = Config::default();
        config.global.plugin_directories = vec![plugin_dir];
        
        let mut plugin_manager = PluginManager::new(config);
        plugin_manager.discover_plugins().await.unwrap();
        
        assert_eq!(plugin_manager.plugins.len(), 2);
        assert!(plugin_manager.plugins.contains_key("test-plugin"));
        assert!(plugin_manager.plugins.contains_key("another-plugin"));
    }

    #[tokio::test]
    async fn test_plugin_metadata_validation() {
        let temp_dir = TempDir::new().unwrap();
        let plugin_dir = temp_dir.path().join("invalid-plugin");
        fs::create_dir_all(&plugin_dir).unwrap();
        
        // Create plugin with invalid name
        let metadata = PluginMetadata {
            name: "invalid plugin name!".to_string(), // Invalid characters
            version: "1.0.0".to_string(),
            description: None,
            author: None,
            homepage: None,
            license: None,
            min_cli_version: None,
            capabilities: Vec::new(),
            commands: Vec::new(),
            formatters: Vec::new(),
            processors: Vec::new(),
            entry_point: PluginEntryPoint::Script {
                path: "main.py".to_string(),
            },
            security: PluginSecurity::default(),
        };
        
        let plugin_toml = toml::to_string(&metadata).unwrap();
        fs::write(plugin_dir.join("plugin.toml"), plugin_toml).unwrap();
        
        let config = Config::default();
        let plugin_manager = PluginManager::new(config);
        
        let result = plugin_manager.load_plugin_metadata(&plugin_dir.join("plugin.toml")).await;
        assert!(result.is_err());
    }

    #[test]
    fn test_security_validation() {
        let config = Config::default();
        let plugin_manager = PluginManager::new(config);
        
        // Test untrusted plugin requesting dangerous permissions
        let mut metadata = PluginMetadata {
            name: "dangerous-plugin".to_string(),
            version: "1.0.0".to_string(),
            description: None,
            author: None,
            homepage: None,
            license: None,
            min_cli_version: None,
            capabilities: Vec::new(),
            commands: Vec::new(),
            formatters: Vec::new(),
            processors: Vec::new(),
            entry_point: PluginEntryPoint::Script {
                path: "main.py".to_string(),
            },
            security: PluginSecurity {
                trusted: false,
                permissions: vec![PluginPermission::ProcessExecution],
                sandbox: SandboxConfig::default(),
            },
        };
        
        let result = plugin_manager.validate_plugin_metadata(&metadata);
        assert!(result.is_err());
        
        // Same plugin but trusted should work
        metadata.security.trusted = true;
        let result = plugin_manager.validate_plugin_metadata(&metadata);
        assert!(result.is_ok());
    }
}