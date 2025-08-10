use crate::error::{Result, TriliumError};
use dirs::config_dir;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Current active profile
    pub current_profile: String,
    
    /// Named configuration profiles
    pub profiles: HashMap<String, ProfileConfig>,
    
    /// Global settings that apply to all profiles
    pub global: GlobalConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ProfileConfig {
    pub server_url: String,
    pub api_token: Option<SecureString>,
    pub default_parent_id: String,
    pub default_note_type: String,
    pub editor: Option<String>,
    pub timeout_seconds: u64,
    pub max_retries: u32,
    // TUI-specific settings
    pub recent_notes: Vec<RecentNote>,
    pub bookmarked_notes: Vec<BookmarkedNote>,
    pub max_recent_notes: usize,
    
    /// Profile-specific plugin directories
    pub plugin_directories: Vec<PathBuf>,
    
    /// Profile-specific template directories
    pub template_directories: Vec<PathBuf>,
    
    /// Profile inheritance - inherits from this profile if set
    pub inherits_from: Option<String>,
    
    /// Environment variables to load for this profile
    pub env_vars: HashMap<String, String>,
    
    /// Profile description
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct GlobalConfig {
    /// Global plugin directories
    pub plugin_directories: Vec<PathBuf>,
    
    /// Progress bar preferences
    pub progress: ProgressConfig,
    
    /// Error handling preferences
    pub error_handling: ErrorHandlingConfig,
    
    /// Shell completion preferences
    pub completion: CompletionConfig,
    
    /// Theme and UI preferences
    pub ui: UiConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ProgressConfig {
    /// Enable progress bars
    pub enabled: bool,
    
    /// Progress bar style: "bar", "spinner", "dots"
    pub style: String,
    
    /// Show ETA in progress bars
    pub show_eta: bool,
    
    /// Show speed in progress bars
    pub show_speed: bool,
    
    /// Quiet mode disables all progress indicators
    pub quiet_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ErrorHandlingConfig {
    /// Enable did-you-mean suggestions
    pub suggestions: bool,
    
    /// Show error codes
    pub show_codes: bool,
    
    /// Maximum suggestion distance for fuzzy matching
    pub suggestion_threshold: usize,
    
    /// Enable context-aware help
    pub contextual_help: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CompletionConfig {
    /// Enable dynamic completion
    pub dynamic: bool,
    
    /// Cache completion data
    pub cache_enabled: bool,
    
    /// Cache TTL in seconds
    pub cache_ttl: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct UiConfig {
    /// Color scheme: "auto", "always", "never"
    pub colors: String,
    
    /// Default table format
    pub table_format: String,
    
    /// Enable unicode symbols
    pub unicode: bool,
    
    /// Terminal width override
    pub width: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RecentNote {
    pub note_id: String,
    pub title: String,
    pub accessed_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BookmarkedNote {
    pub note_id: String,
    pub title: String,
    pub bookmarked_at: chrono::DateTime<chrono::Utc>,
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
        let mut profiles = HashMap::new();
        profiles.insert("default".to_string(), ProfileConfig::default());
        
        Self {
            current_profile: "default".to_string(),
            profiles,
            global: GlobalConfig::default(),
        }
    }
}

impl Default for ProfileConfig {
    fn default() -> Self {
        Self {
            server_url: String::from("http://localhost:9999"),
            api_token: None,
            default_parent_id: String::from("root"),
            default_note_type: String::from("text"),
            editor: None,
            timeout_seconds: 30,
            max_retries: 3,
            recent_notes: Vec::new(),
            bookmarked_notes: Vec::new(),
            max_recent_notes: 15,
            plugin_directories: Vec::new(),
            template_directories: Vec::new(),
            inherits_from: None,
            env_vars: HashMap::new(),
            description: None,
        }
    }
}

impl Default for GlobalConfig {
    fn default() -> Self {
        let plugin_dirs = vec![
            config_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join("trilium-cli")
                .join("plugins"),
        ];
        
        Self {
            plugin_directories: plugin_dirs,
            progress: ProgressConfig::default(),
            error_handling: ErrorHandlingConfig::default(),
            completion: CompletionConfig::default(),
            ui: UiConfig::default(),
        }
    }
}

impl Default for ProgressConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            style: "bar".to_string(),
            show_eta: true,
            show_speed: true,
            quiet_mode: false,
        }
    }
}

impl Default for ErrorHandlingConfig {
    fn default() -> Self {
        Self {
            suggestions: true,
            show_codes: false,
            suggestion_threshold: 3,
            contextual_help: true,
        }
    }
}

impl Default for CompletionConfig {
    fn default() -> Self {
        Self {
            dynamic: true,
            cache_enabled: true,
            cache_ttl: 3600, // 1 hour
        }
    }
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            colors: "auto".to_string(),
            table_format: "table".to_string(),
            unicode: true,
            width: None,
        }
    }
}

impl Config {
    /// Get the current active profile
    pub fn current_profile(&self) -> Result<&ProfileConfig> {
        self.profiles.get(&self.current_profile)
            .ok_or_else(|| TriliumError::ConfigError(
                format!("Profile '{}' not found", self.current_profile)
            ))
    }
    
    /// Get mutable reference to current active profile
    pub fn current_profile_mut(&mut self) -> Result<&mut ProfileConfig> {
        let profile_name = self.current_profile.clone();
        self.profiles.get_mut(&profile_name)
            .ok_or_else(|| TriliumError::ConfigError(
                format!("Profile '{}' not found", profile_name)
            ))
    }
    
    /// Switch to a different profile
    pub fn set_current_profile(&mut self, profile_name: &str) -> Result<()> {
        if !self.profiles.contains_key(profile_name) {
            return Err(TriliumError::ConfigError(
                format!("Profile '{}' does not exist", profile_name)
            ));
        }
        self.current_profile = profile_name.to_string();
        Ok(())
    }
    
    /// Create a new profile
    pub fn create_profile(&mut self, name: &str, description: Option<String>) -> Result<()> {
        if self.profiles.contains_key(name) {
            return Err(TriliumError::ConfigError(
                format!("Profile '{}' already exists", name)
            ));
        }
        
        let mut profile = ProfileConfig::default();
        profile.description = description;
        self.profiles.insert(name.to_string(), profile);
        Ok(())
    }
    
    /// Delete a profile
    pub fn delete_profile(&mut self, name: &str) -> Result<()> {
        if name == "default" {
            return Err(TriliumError::ConfigError(
                "Cannot delete the default profile".to_string()
            ));
        }
        
        if !self.profiles.contains_key(name) {
            return Err(TriliumError::ConfigError(
                format!("Profile '{}' does not exist", name)
            ));
        }
        
        if self.current_profile == name {
            self.current_profile = "default".to_string();
        }
        
        self.profiles.remove(name);
        Ok(())
    }
    
    /// List all profiles
    pub fn list_profiles(&self) -> Vec<(&String, &ProfileConfig)> {
        self.profiles.iter().collect()
    }
    
    /// Apply profile inheritance by merging settings from parent profile
    pub fn resolve_profile(&self, profile_name: &str) -> Result<ProfileConfig> {
        let profile = self.profiles.get(profile_name)
            .ok_or_else(|| TriliumError::ConfigError(
                format!("Profile '{}' not found", profile_name)
            ))?;
            
        if let Some(parent_name) = &profile.inherits_from {
            let parent = self.resolve_profile(parent_name)?;
            Ok(self.merge_profiles(&parent, profile))
        } else {
            Ok(profile.clone())
        }
    }
    
    /// Merge two profiles (child overrides parent)
    fn merge_profiles(&self, parent: &ProfileConfig, child: &ProfileConfig) -> ProfileConfig {
        ProfileConfig {
            server_url: if child.server_url != ProfileConfig::default().server_url {
                child.server_url.clone()
            } else {
                parent.server_url.clone()
            },
            api_token: child.api_token.clone().or(parent.api_token.clone()),
            default_parent_id: if child.default_parent_id != ProfileConfig::default().default_parent_id {
                child.default_parent_id.clone()
            } else {
                parent.default_parent_id.clone()
            },
            default_note_type: if child.default_note_type != ProfileConfig::default().default_note_type {
                child.default_note_type.clone()
            } else {
                parent.default_note_type.clone()
            },
            editor: child.editor.clone().or(parent.editor.clone()),
            timeout_seconds: if child.timeout_seconds != ProfileConfig::default().timeout_seconds {
                child.timeout_seconds
            } else {
                parent.timeout_seconds
            },
            max_retries: if child.max_retries != ProfileConfig::default().max_retries {
                child.max_retries
            } else {
                parent.max_retries
            },
            recent_notes: child.recent_notes.clone(),
            bookmarked_notes: child.bookmarked_notes.clone(),
            max_recent_notes: if child.max_recent_notes != ProfileConfig::default().max_recent_notes {
                child.max_recent_notes
            } else {
                parent.max_recent_notes
            },
            plugin_directories: {
                let mut dirs = parent.plugin_directories.clone();
                dirs.extend(child.plugin_directories.clone());
                dirs
            },
            template_directories: {
                let mut dirs = parent.template_directories.clone();
                dirs.extend(child.template_directories.clone());
                dirs
            },
            inherits_from: child.inherits_from.clone(),
            env_vars: {
                let mut vars = parent.env_vars.clone();
                vars.extend(child.env_vars.clone());
                vars
            },
            description: child.description.clone().or(parent.description.clone()),
        }
    }
    
    /// Apply environment variable overrides
    pub fn apply_env_overrides(&mut self) -> Result<()> {
        if let Ok(server_url) = std::env::var("TRILIUM_SERVER_URL") {
            if let Ok(profile) = self.current_profile_mut() {
                profile.server_url = server_url;
            }
        }
        
        if let Ok(api_token) = std::env::var("TRILIUM_API_TOKEN") {
            if let Ok(profile) = self.current_profile_mut() {
                profile.api_token = Some(SecureString::from(api_token));
            }
        }
        
        if let Ok(parent_id) = std::env::var("TRILIUM_DEFAULT_PARENT") {
            if let Ok(profile) = self.current_profile_mut() {
                profile.default_parent_id = parent_id;
            }
        }
        
        if let Ok(profile_name) = std::env::var("TRILIUM_PROFILE") {
            self.set_current_profile(&profile_name)?;
        }
        
        Ok(())
    }
    pub fn load(path: Option<PathBuf>) -> Result<Self> {
        let config_path = path.unwrap_or_else(Self::default_config_path);

        if !config_path.exists() {
            // Return default config if file doesn't exist
            return Ok(Self::default());
        }

        let contents = fs::read_to_string(&config_path)
            .map_err(|e| TriliumError::ConfigError(format!("Failed to read config file: {}", e)))?;

        let mut config: Config = serde_yaml::from_str(&contents)?;
        
        // Validate and sanitize loaded config
        config.validate_and_sanitize()?;
        
        Ok(config)
    }

    pub fn save(&self, path: Option<PathBuf>) -> Result<()> {
        // Validate config before saving
        self.validate_config()?;
        
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

        let current_server_url = config.current_profile().map(|p| p.server_url.clone()).unwrap_or_default();
        print!("Trilium server URL [{}]: ", current_server_url);
        io::stdout().flush()
            .map_err(|e| TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
        let mut input = String::new();
        io::stdin().read_line(&mut input)
            .map_err(|e| TriliumError::InputError(format!("Failed to read server URL: {}", e)))?;
        if !input.trim().is_empty() {
            if let Ok(profile) = config.current_profile_mut() {
                profile.server_url = input.trim().to_string();
            }
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
            if let Ok(profile) = config.current_profile_mut() {
                profile.api_token = Some(SecureString::from(input.trim()));
            }
        }

        let current_parent_id = config.current_profile().map(|p| p.default_parent_id.clone()).unwrap_or_default();
        print!("Default parent note ID [{}]: ", current_parent_id);
        io::stdout().flush()
            .map_err(|e| TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
        input.clear();
        io::stdin().read_line(&mut input)
            .map_err(|e| TriliumError::InputError(format!("Failed to read parent ID: {}", e)))?;
        if !input.trim().is_empty() {
            if let Ok(profile) = config.current_profile_mut() {
                profile.default_parent_id = input.trim().to_string();
            }
        }

        let current_note_type = config.current_profile().map(|p| p.default_note_type.clone()).unwrap_or_default();
        print!("Default note type (text/code/book/etc.) [{}]: ", current_note_type);
        io::stdout().flush()
            .map_err(|e| TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
        input.clear();
        io::stdin().read_line(&mut input)
            .map_err(|e| TriliumError::InputError(format!("Failed to read note type: {}", e)))?;
        if !input.trim().is_empty() {
            if let Ok(profile) = config.current_profile_mut() {
                profile.default_note_type = input.trim().to_string();
            }
        }

        print!("Text editor command (e.g., vim, nano, code) [system default]: ");
        io::stdout().flush()
            .map_err(|e| TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
        input.clear();
        io::stdin().read_line(&mut input)
            .map_err(|e| TriliumError::InputError(format!("Failed to read editor: {}", e)))?;
        if !input.trim().is_empty() {
            if let Ok(profile) = config.current_profile_mut() {
                profile.editor = Some(input.trim().to_string());
            }
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

    pub fn add_recent_note(&mut self, note_id: String, title: String) -> Result<()> {
        // Security: Validate inputs
        if note_id.is_empty() {
            return Err(TriliumError::ValidationError(
                "Note ID cannot be empty".to_string()
            ));
        }
        if title.is_empty() {
            return Err(TriliumError::ValidationError(
                "Note title cannot be empty".to_string()
            ));
        }
        
        // Security: Validate input lengths to prevent memory exhaustion
        const MAX_NOTE_ID_LENGTH: usize = 100;
        const MAX_TITLE_LENGTH: usize = 500;
        
        if note_id.len() > MAX_NOTE_ID_LENGTH {
            return Err(TriliumError::ValidationError(
                format!("Note ID too long (max {} characters)", MAX_NOTE_ID_LENGTH)
            ));
        }
        if title.len() > MAX_TITLE_LENGTH {
            return Err(TriliumError::ValidationError(
                format!("Note title too long (max {} characters)", MAX_TITLE_LENGTH)
            ));
        }
        
        let profile = self.current_profile_mut()?;
        
        // Security: Ensure max_recent_notes is within safe bounds
        const MIN_RECENT_NOTES: usize = 1;
        const MAX_RECENT_NOTES_LIMIT: usize = 100; // Reduced from 1000 for better performance
        
        if profile.max_recent_notes == 0 {
            return Err(TriliumError::ValidationError(
                "max_recent_notes cannot be zero".to_string()
            ));
        }
        if profile.max_recent_notes > MAX_RECENT_NOTES_LIMIT {
            return Err(TriliumError::ValidationError(
                format!("max_recent_notes too large (max {})", MAX_RECENT_NOTES_LIMIT)
            ));
        }
        
        let now = chrono::Utc::now();
        
        // Remove existing entry if present
        profile.recent_notes.retain(|n| n.note_id != note_id);
        
        // Add to front
        profile.recent_notes.insert(0, RecentNote {
            note_id,
            title,
            accessed_at: now,
        });
        
        // Keep only max_recent_notes with bounds checking
        if profile.recent_notes.len() > profile.max_recent_notes {
            profile.recent_notes.truncate(profile.max_recent_notes);
        }
        
        // Final validation to ensure we never exceed bounds
        if profile.recent_notes.len() > profile.max_recent_notes {
            return Err(TriliumError::ValidationError(
                format!(
                    "Internal error: Recent notes exceeded max_recent_notes: {} > {}",
                    profile.recent_notes.len(),
                    profile.max_recent_notes
                )
            ));
        }
        
        Ok(())
    }

    pub fn toggle_bookmark(&mut self, note_id: String, title: String) -> Result<bool> {
        // Security: Validate inputs
        if note_id.is_empty() {
            return Err(TriliumError::ValidationError(
                "Note ID cannot be empty".to_string()
            ));
        }
        if title.is_empty() {
            return Err(TriliumError::ValidationError(
                "Note title cannot be empty".to_string()
            ));
        }
        
        // Security: Validate input lengths
        const MAX_NOTE_ID_LENGTH: usize = 100;
        const MAX_TITLE_LENGTH: usize = 500;
        
        if note_id.len() > MAX_NOTE_ID_LENGTH {
            return Err(TriliumError::ValidationError(
                format!("Note ID too long (max {} characters)", MAX_NOTE_ID_LENGTH)
            ));
        }
        if title.len() > MAX_TITLE_LENGTH {
            return Err(TriliumError::ValidationError(
                format!("Note title too long (max {} characters)", MAX_TITLE_LENGTH)
            ));
        }
        
        let profile = self.current_profile_mut()?;
        
        if let Some(pos) = profile.bookmarked_notes.iter().position(|n| n.note_id == note_id) {
            // Remove bookmark
            profile.bookmarked_notes.remove(pos);
            Ok(false)
        } else {
            // Security: Prevent excessive bookmarks to avoid memory issues
            const MAX_BOOKMARKS: usize = 100; // Reduced from 1000 for better performance
            if profile.bookmarked_notes.len() >= MAX_BOOKMARKS {
                return Err(TriliumError::ValidationError(
                    format!("Too many bookmarks (max {})", MAX_BOOKMARKS)
                ));
            }
            
            // Add bookmark
            profile.bookmarked_notes.push(BookmarkedNote {
                note_id,
                title,
                bookmarked_at: chrono::Utc::now(),
            });
            // Sort by bookmarked date (newest first)
            profile.bookmarked_notes.sort_by(|a, b| b.bookmarked_at.cmp(&a.bookmarked_at));
            Ok(true)
        }
    }

    pub fn is_bookmarked(&self, note_id: &str) -> bool {
        if let Ok(profile) = self.current_profile() {
            profile.bookmarked_notes.iter().any(|n| n.note_id == note_id)
        } else {
            false
        }
    }
    
    /// Validate configuration values for security and sanity
    pub fn validate_config(&self) -> Result<()> {
        // Validate all profiles
        for (profile_name, profile) in &self.profiles {
            // Validate server URL
            if profile.server_url.is_empty() {
                return Err(TriliumError::ConfigError(
                    format!("Profile '{}': Server URL cannot be empty", profile_name)
                ));
            }
            
            // Security: Validate URL format
            if !profile.server_url.starts_with("http://") && !profile.server_url.starts_with("https://") {
                return Err(TriliumError::ConfigError(
                    format!("Profile '{}': Server URL must start with http:// or https://", profile_name)
                ));
            }
            
            // Validate timeout and retry settings
            const MAX_TIMEOUT_SECONDS: u64 = 300; // 5 minutes
            const MAX_RETRIES: u32 = 10;
            
            if profile.timeout_seconds == 0 || profile.timeout_seconds > MAX_TIMEOUT_SECONDS {
                return Err(TriliumError::ConfigError(
                    format!("Profile '{}': Timeout must be between 1 and {} seconds", profile_name, MAX_TIMEOUT_SECONDS)
                ));
            }
            
            if profile.max_retries > MAX_RETRIES {
                return Err(TriliumError::ConfigError(
                    format!("Profile '{}': Max retries must be {} or less", profile_name, MAX_RETRIES)
                ));
            }
            
            // Validate collection sizes
            const MAX_RECENT_NOTES: usize = 100;
            const MAX_BOOKMARKS: usize = 100;
            
            if profile.max_recent_notes == 0 || profile.max_recent_notes > MAX_RECENT_NOTES {
                return Err(TriliumError::ConfigError(
                    format!("Profile '{}': max_recent_notes must be between 1 and {}", profile_name, MAX_RECENT_NOTES)
                ));
            }
            
            if profile.recent_notes.len() > MAX_RECENT_NOTES {
                return Err(TriliumError::ConfigError(
                    format!("Profile '{}': Too many recent notes stored (max {})", profile_name, MAX_RECENT_NOTES)
                ));
            }
            
            if profile.bookmarked_notes.len() > MAX_BOOKMARKS {
                return Err(TriliumError::ConfigError(
                    format!("Profile '{}': Too many bookmarks stored (max {})", profile_name, MAX_BOOKMARKS)
                ));
            }
            
            // Validate note IDs and titles in collections
            for (i, note) in profile.recent_notes.iter().enumerate() {
                if note.note_id.is_empty() {
                    return Err(TriliumError::ConfigError(
                        format!("Profile '{}': Recent note {} has empty note_id", profile_name, i)
                    ));
                }
                if note.title.is_empty() {
                    return Err(TriliumError::ConfigError(
                        format!("Profile '{}': Recent note {} has empty title", profile_name, i)
                    ));
                }
                if note.note_id.len() > 100 || note.title.len() > 500 {
                    return Err(TriliumError::ConfigError(
                        format!("Profile '{}': Recent note {} has oversized fields", profile_name, i)
                    ));
                }
            }
            
            for (i, bookmark) in profile.bookmarked_notes.iter().enumerate() {
                if bookmark.note_id.is_empty() {
                    return Err(TriliumError::ConfigError(
                        format!("Profile '{}': Bookmark {} has empty note_id", profile_name, i)
                    ));
                }
                if bookmark.title.is_empty() {
                    return Err(TriliumError::ConfigError(
                        format!("Profile '{}': Bookmark {} has empty title", profile_name, i)
                    ));
                }
                if bookmark.note_id.len() > 100 || bookmark.title.len() > 500 {
                    return Err(TriliumError::ConfigError(
                        format!("Profile '{}': Bookmark {} has oversized fields", profile_name, i)
                    ));
                }
            }
        }
        
        // Validate current profile exists
        if !self.profiles.contains_key(&self.current_profile) {
            return Err(TriliumError::ConfigError(
                format!("Current profile '{}' does not exist", self.current_profile)
            ));
        }
        
        Ok(())
    }
    
    /// Validate and sanitize loaded configuration
    fn validate_and_sanitize(&mut self) -> Result<()> {
        // Sanitize collections by removing invalid entries for all profiles
        for profile in self.profiles.values_mut() {
            profile.recent_notes.retain(|note| {
                !note.note_id.is_empty() && !note.title.is_empty() && 
                note.note_id.len() <= 100 && note.title.len() <= 500
            });
            
            profile.bookmarked_notes.retain(|bookmark| {
                !bookmark.note_id.is_empty() && !bookmark.title.is_empty() && 
                bookmark.note_id.len() <= 100 && bookmark.title.len() <= 500
            });
            
            // Enforce size limits
            const MAX_RECENT_NOTES: usize = 100;
            const MAX_BOOKMARKS: usize = 100;
            
            if profile.recent_notes.len() > MAX_RECENT_NOTES {
                profile.recent_notes.truncate(MAX_RECENT_NOTES);
            }
            
            if profile.bookmarked_notes.len() > MAX_BOOKMARKS {
                profile.bookmarked_notes.truncate(MAX_BOOKMARKS);
            }
            
            // Clamp max_recent_notes to reasonable bounds
            if profile.max_recent_notes == 0 {
                profile.max_recent_notes = 15; // Default
            } else if profile.max_recent_notes > MAX_RECENT_NOTES {
                profile.max_recent_notes = MAX_RECENT_NOTES;
            }
        }
        
        // Validate remaining config
        self.validate_config()
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
            recent_notes: Vec::new(),
            bookmarked_notes: Vec::new(),
            max_recent_notes: 15,
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
    
    #[test]
    fn test_add_recent_note_validation() {
        let mut config = Config::default();
        
        // Test empty note ID
        let result = config.add_recent_note("".to_string(), "Title".to_string());
        assert!(result.is_err());
        
        // Test empty title
        let result = config.add_recent_note("note123".to_string(), "".to_string());
        assert!(result.is_err());
        
        // Test oversized note ID
        let long_id = "a".repeat(150);
        let result = config.add_recent_note(long_id, "Title".to_string());
        assert!(result.is_err());
        
        // Test oversized title
        let long_title = "a".repeat(600);
        let result = config.add_recent_note("note123".to_string(), long_title);
        assert!(result.is_err());
        
        // Test valid input
        let result = config.add_recent_note("note123".to_string(), "Valid Title".to_string());
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_toggle_bookmark_validation() {
        let mut config = Config::default();
        
        // Test empty note ID
        let result = config.toggle_bookmark("".to_string(), "Title".to_string());
        assert!(result.is_err());
        
        // Test empty title
        let result = config.toggle_bookmark("note123".to_string(), "".to_string());
        assert!(result.is_err());
        
        // Test valid bookmark
        let result = config.toggle_bookmark("note123".to_string(), "Valid Title".to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), true); // Should return true for new bookmark
        
        // Test toggle off
        let result = config.toggle_bookmark("note123".to_string(), "Valid Title".to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), false); // Should return false for removed bookmark
    }
    
    #[test]
    fn test_config_validation() {
        let mut config = Config::default();
        
        // Test valid config
        assert!(config.validate_config().is_ok());
        
        // Test invalid server URL
        config.server_url = "".to_string();
        assert!(config.validate_config().is_err());
        
        config.server_url = "invalid-url".to_string();
        assert!(config.validate_config().is_err());
        
        config.server_url = "https://valid.com".to_string();
        assert!(config.validate_config().is_ok());
        
        // Test invalid timeout
        config.timeout_seconds = 0;
        assert!(config.validate_config().is_err());
        
        config.timeout_seconds = 400; // Too high
        assert!(config.validate_config().is_err());
        
        config.timeout_seconds = 30;
        assert!(config.validate_config().is_ok());
        
        // Test invalid max_recent_notes
        config.max_recent_notes = 0;
        assert!(config.validate_config().is_err());
        
        config.max_recent_notes = 200; // Too high
        assert!(config.validate_config().is_err());
        
        config.max_recent_notes = 15;
        assert!(config.validate_config().is_ok());
    }
    
    #[test]
    fn test_config_sanitization() {
        let mut config = Config::default();
        
        // Add some invalid recent notes that should be filtered out
        config.recent_notes.push(RecentNote {
            note_id: "".to_string(), // Invalid - empty
            title: "Valid Title".to_string(),
            accessed_at: chrono::Utc::now(),
        });
        
        config.recent_notes.push(RecentNote {
            note_id: "valid123".to_string(),
            title: "a".repeat(600), // Invalid - too long
            accessed_at: chrono::Utc::now(),
        });
        
        config.recent_notes.push(RecentNote {
            note_id: "valid456".to_string(),
            title: "Valid Title".to_string(),
            accessed_at: chrono::Utc::now(),
        });
        
        // Should have 3 notes before sanitization
        assert_eq!(config.recent_notes.len(), 3);
        
        // Sanitize
        assert!(config.validate_and_sanitize().is_ok());
        
        // Should have only 1 valid note after sanitization
        assert_eq!(config.recent_notes.len(), 1);
        assert_eq!(config.recent_notes[0].note_id, "valid456");
    }

}