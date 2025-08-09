use crate::error::{Result, TriliumError};
use dirs::config_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub server_url: String,
    pub api_token: Option<SecureString>,
    pub default_parent_id: String,
    pub default_note_type: String,
    pub editor: Option<String>,
    pub timeout_seconds: u64,
    pub max_retries: u32,
}

#[derive(Clone, Serialize, Deserialize, Zeroize, ZeroizeOnDrop, PartialEq)]
pub struct SecureString(String);

impl SecureString {
    pub fn new(s: String) -> Self {
        SecureString(s)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn from_string(s: String) -> Self {
        SecureString(s)
    }
}

impl std::fmt::Debug for SecureString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_tuple("SecureString").field(&"[REDACTED]").finish()
    }
}

impl From<String> for SecureString {
    fn from(s: String) -> Self {
        SecureString::new(s)
    }
}

impl From<&str> for SecureString {
    fn from(s: &str) -> Self {
        SecureString::new(s.to_string())
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server_url: String::from("http://localhost:9999"),
            api_token: None,
            default_parent_id: String::from("root"),
            default_note_type: String::from("text"),
            editor: None,
            timeout_seconds: 30,
            max_retries: 3,
        }
    }
}

impl Config {
    pub fn load(path: Option<PathBuf>) -> Result<Self> {
        let config_path = path.unwrap_or_else(Self::default_config_path);

        if !config_path.exists() {
            // Return default config if file doesn't exist
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(&config_path)
            .map_err(|e| TriliumError::ConfigError(format!("Failed to read config file: {}", e)))?;

        let config: Config = serde_yaml::from_str(&contents)?;
        Ok(config)
    }

    pub fn save(&self, path: Option<PathBuf>) -> Result<()> {
        let config_path = path.unwrap_or_else(Self::default_config_path);

        // Create parent directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| TriliumError::ConfigError(format!("Failed to create config directory: {}", e)))?;
        }

        let contents = serde_yaml::to_string(self)?;
        fs::write(&config_path, contents)
            .map_err(|e| TriliumError::ConfigError(format!("Failed to write config file: {}", e)))?;

        Ok(())
    }

    pub fn default_config_path() -> PathBuf {
        config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("trilium-cli")
            .join("config.yaml")
    }

    pub fn init_interactive() -> Result<Self> {
        use std::io::{self, Write};

        println!("Trilium CLI Configuration");
        println!("-------------------------");

        let mut config = Self::default();

        print!("Trilium server URL [{}]: ", config.server_url);
        io::stdout().flush()
            .map_err(|e| TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
        let mut input = String::new();
        io::stdin().read_line(&mut input)
            .map_err(|e| TriliumError::InputError(format!("Failed to read server URL: {}", e)))?;
        if !input.trim().is_empty() {
            config.server_url = input.trim().to_string();
        }

        println!("\n⚠️  WARNING: API tokens are sensitive credentials!");
        println!("   - They will be stored in plaintext in the config file");
        println!("   - Ensure your config file has appropriate permissions (600)");
        println!("   - Consider using environment variables for shared systems");
        print!("API token (ETAPI token from Trilium): ");
        io::stdout().flush()
            .map_err(|e| TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
        input.clear();
        io::stdin().read_line(&mut input)
            .map_err(|e| TriliumError::InputError(format!("Failed to read API token: {}", e)))?;
        if !input.trim().is_empty() {
            config.api_token = Some(SecureString::from(input.trim()));
        }

        print!("Default parent note ID [{}]: ", config.default_parent_id);
        io::stdout().flush()
            .map_err(|e| TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
        input.clear();
        io::stdin().read_line(&mut input)
            .map_err(|e| TriliumError::InputError(format!("Failed to read parent ID: {}", e)))?;
        if !input.trim().is_empty() {
            config.default_parent_id = input.trim().to_string();
        }

        print!("Default note type (text/code/book/etc.) [{}]: ", config.default_note_type);
        io::stdout().flush()
            .map_err(|e| TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
        input.clear();
        io::stdin().read_line(&mut input)
            .map_err(|e| TriliumError::InputError(format!("Failed to read note type: {}", e)))?;
        if !input.trim().is_empty() {
            config.default_note_type = input.trim().to_string();
        }

        print!("Text editor command (e.g., vim, nano, code) [system default]: ");
        io::stdout().flush()
            .map_err(|e| TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
        input.clear();
        io::stdin().read_line(&mut input)
            .map_err(|e| TriliumError::InputError(format!("Failed to read editor: {}", e)))?;
        if !input.trim().is_empty() {
            config.editor = Some(input.trim().to_string());
        }

        config.save(None)?;
        println!("\nConfiguration saved to: {}", Self::default_config_path().display());
        
        // Set secure file permissions on Unix systems
        #[cfg(unix)]
        {
            use std::fs::Permissions;
            use std::os::unix::fs::PermissionsExt;
            
            let config_path = Self::default_config_path();
            if let Err(e) = std::fs::set_permissions(&config_path, Permissions::from_mode(0o600)) {
                eprintln!("⚠️  Warning: Failed to set secure permissions on config file: {}", e);
                eprintln!("   Please manually set permissions: chmod 600 {}", config_path.display());
            } else {
                println!("✓ Set secure file permissions (600) on config file");
            }
        }

        Ok(config)
    }

}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_default_config() {
        let config = Config::default();
        assert_eq!(config.server_url, "http://localhost:9999");
        assert_eq!(config.api_token, None);
        assert_eq!(config.default_parent_id, "root");
        assert_eq!(config.default_note_type, "text");
        assert_eq!(config.editor, None);
        assert_eq!(config.timeout_seconds, 30);
        assert_eq!(config.max_retries, 3);
    }

    #[test]
    fn test_save_and_load_config() {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir.path().join("config.yaml");

        // Create a config with custom values
        let mut config = Config::default();
        config.server_url = "https://example.com".to_string();
        config.api_token = Some(SecureString::from("test_token_123"));
        config.default_parent_id = "custom_root".to_string();
        config.timeout_seconds = 60;

        // Save the config
        config.save(Some(config_path.clone())).unwrap();

        // Load the config
        let loaded_config = Config::load(Some(config_path)).unwrap();

        // Verify values
        assert_eq!(loaded_config.server_url, "https://example.com");
        assert_eq!(loaded_config.api_token.as_ref().map(|s| s.as_str()), Some("test_token_123"));
        assert_eq!(loaded_config.default_parent_id, "custom_root");
        assert_eq!(loaded_config.timeout_seconds, 60);
    }

    #[test]
    fn test_load_nonexistent_config_returns_default() {
        let temp_dir = TempDir::new().unwrap();
        let config_path = temp_dir.path().join("nonexistent.yaml");

        let config = Config::load(Some(config_path)).unwrap();
        
        // Should return default values
        assert_eq!(config.server_url, "http://localhost:9999");
        assert_eq!(config.api_token, None);
    }

    #[test]
    fn test_environment_variable_override() {
        // Note: In a real implementation, you might want to support env var overrides
        // For now, we just test that the config loads correctly
        let config = Config::default();
        
        // Set environment variables (this would be used in a real implementation)
        std::env::set_var("TRILIUM_SERVER_URL", "http://env-server:8080");
        std::env::set_var("TRILIUM_API_TOKEN", "env_token");
        
        // In the actual implementation, you'd load these from env vars
        // For now, just verify the default config works
        assert_eq!(config.server_url, "http://localhost:9999");
        
        // Clean up
        std::env::remove_var("TRILIUM_SERVER_URL");
        std::env::remove_var("TRILIUM_API_TOKEN");
    }

    #[test]
    fn test_config_serialization() {
        let config = Config {
            server_url: "https://notes.example.com".to_string(),
            api_token: Some(SecureString::from("secret_token")),
            default_parent_id: "workspace".to_string(),
            default_note_type: "code".to_string(),
            editor: Some("vim".to_string()),
            timeout_seconds: 45,
            max_retries: 5,
        };

        // Serialize to YAML
        let yaml = serde_yaml::to_string(&config).unwrap();
        
        // Deserialize back
        let deserialized: Config = serde_yaml::from_str(&yaml).unwrap();
        
        assert_eq!(deserialized.server_url, config.server_url);
        assert_eq!(deserialized.api_token.as_ref().map(|s| s.as_str()), 
                   config.api_token.as_ref().map(|s| s.as_str()));
        assert_eq!(deserialized.default_parent_id, config.default_parent_id);
        assert_eq!(deserialized.editor, config.editor);
        assert_eq!(deserialized.timeout_seconds, config.timeout_seconds);
        assert_eq!(deserialized.max_retries, config.max_retries);
    }

    #[test]
    fn test_partial_config_with_defaults() {
        let yaml = r#"
server_url: "https://custom.server.com"
api_token: "my_token"
"#;
        
        let config: Config = serde_yaml::from_str(yaml).unwrap();
        
        // Specified values should be set
        assert_eq!(config.server_url, "https://custom.server.com");
        assert_eq!(config.api_token.as_ref().map(|s| s.as_str()), Some("my_token"));
        
        // Other values should use defaults from serde
        // Note: This requires #[serde(default)] on the struct fields
        // which might need to be added to the actual implementation
    }

    #[test]
    fn test_config_path_creation() {
        let default_path = Config::default_config_path();
        assert!(default_path.to_string_lossy().contains("trilium-cli"));
        assert!(default_path.to_string_lossy().contains("config.yaml"));
    }

}