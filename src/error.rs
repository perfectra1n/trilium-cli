use thiserror::Error;
use std::collections::HashMap;

#[derive(Error, Debug)]
pub enum TriliumError {
    #[error("API request failed: {0}")]
    ApiError(String),

    #[error("Authentication failed: {0}")]
    AuthError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("YAML parsing error: {0}")]
    YamlError(#[from] serde_yaml::Error),

    #[error("File system traversal error: {0}")]
    WalkDirError(#[from] walkdir::Error),

    #[error("ZIP archive error: {0}")]
    ZipError(#[from] zip::result::ZipError),

    #[error("Note not found: {0}")]
    #[allow(dead_code)]
    NoteNotFound(String),

    #[error("Branch not found: {0}")]
    #[allow(dead_code)]
    BranchNotFound(String),

    #[error("Attribute not found: {0}")]
    #[allow(dead_code)]
    AttributeNotFound(String),

    #[error("Attachment not found: {0}")]
    #[allow(dead_code)]
    AttachmentNotFound(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Operation cancelled")]
    Cancelled,

    #[error("TUI error: {0}")]
    #[allow(dead_code)]
    TuiError(String),

    #[error("Unknown error: {0}")]
    #[allow(dead_code)]
    Unknown(String),

    #[error("General error: {0}")]
    General(#[from] anyhow::Error),

    #[error("Security violation: {0}")]
    SecurityError(String),

    #[error("Security violation: {0}")]
    Security(String),

    #[error("Validation error: {0}")]
    ValidationError(String),
    
    #[error("Resource limit exceeded: {0}")]
    ResourceLimitExceeded(String),
    
    #[error("Operation timed out: {0}")]
    TimeoutError(String),
    
    #[error("Content too large: {size} bytes (max {limit} bytes)")]
    ContentTooLarge { size: usize, limit: usize },
    
    #[error("Invalid regex pattern: {pattern} - {reason}")]
    InvalidRegexPattern { pattern: String, reason: String },
    
    #[error("Template processing error: {0}")]
    TemplateError(String),
    
    #[error("Link parsing error: {0}")]
    LinkParsingError(String),
    
    #[error("Tag processing error: {0}")]
    TagError(String),
    
    #[error("Quick capture error: {0}")]
    QuickCaptureError(String),
    
    #[error("Search operation failed: {0}")]
    SearchError(String),
    
    #[error("Configuration validation failed: {field} - {reason}")]
    ConfigValidationError { field: String, reason: String },
    
    #[error("Rate limit exceeded: {0}")]
    RateLimitError(String),
    
    #[error("Insufficient permissions: {0}")]
    PermissionDenied(String),
    
    #[error("Data corruption detected: {0}")]
    DataCorruption(String),
    
    #[error("Network error: {0}")]
    NetworkError(String),
    
    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Terminal error: {0}")]
    TerminalError(String),

    #[error("Editor error: {0}")]
    EditorError(String),

    #[error("Input error: {0}")]
    InputError(String),

    #[error("Not found: {0}")]
    NotFound(String),
    
    #[error("Plugin error: {0}")]
    PluginError(String),
    
    #[error("Completion error: {0}")]
    CompletionError(String),
    
    #[error("Profile error: {0}")]
    ProfileError(String),
    
    #[error("Import/Export error: {0}")]
    ImportExportError(String),
}

/// Enhanced error context with suggestions and help
#[derive(Debug, Clone)]
pub struct ErrorContext {
    /// Error code for programmatic handling
    pub code: Option<String>,
    
    /// Actionable suggestions for fixing the error
    pub suggestions: Vec<String>,
    
    /// Related help topics or commands
    pub help_topics: Vec<String>,
    
    /// Context about what the user was trying to do
    pub operation_context: Option<String>,
    
    /// Similar commands or options (for did-you-mean)
    pub similar_items: Vec<String>,
    
    /// Additional metadata
    pub metadata: HashMap<String, String>,
}

pub type Result<T> = std::result::Result<T, TriliumError>;

impl Default for ErrorContext {
    fn default() -> Self {
        Self {
            code: None,
            suggestions: Vec::new(),
            help_topics: Vec::new(),
            operation_context: None,
            similar_items: Vec::new(),
            metadata: HashMap::new(),
        }
    }
}

impl ErrorContext {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn with_code(mut self, code: &str) -> Self {
        self.code = Some(code.to_string());
        self
    }
    
    pub fn with_suggestion(mut self, suggestion: &str) -> Self {
        self.suggestions.push(suggestion.to_string());
        self
    }
    
    pub fn with_suggestions(mut self, suggestions: Vec<String>) -> Self {
        self.suggestions.extend(suggestions);
        self
    }
    
    pub fn with_help_topic(mut self, topic: &str) -> Self {
        self.help_topics.push(topic.to_string());
        self
    }
    
    pub fn with_operation_context(mut self, context: &str) -> Self {
        self.operation_context = Some(context.to_string());
        self
    }
    
    pub fn with_similar_items(mut self, items: Vec<String>) -> Self {
        self.similar_items = items;
        self
    }
    
    pub fn with_metadata(mut self, key: &str, value: &str) -> Self {
        self.metadata.insert(key.to_string(), value.to_string());
        self
    }
}

/// Enhanced error with context and suggestions
#[derive(Debug)]
pub struct EnhancedError {
    pub error: TriliumError,
    pub context: ErrorContext,
}

impl std::fmt::Display for EnhancedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.error)?;
        
        if let Some(context) = &self.context.operation_context {
            write!(f, "\n\nContext: {}", context)?;
        }
        
        if !self.context.suggestions.is_empty() {
            write!(f, "\n\nSuggestions:")?;
            for suggestion in &self.context.suggestions {
                write!(f, "\n  • {}", suggestion)?;
            }
        }
        
        if !self.context.similar_items.is_empty() {
            write!(f, "\n\nDid you mean:")?;
            for item in &self.context.similar_items {
                write!(f, "\n  • {}", item)?;
            }
        }
        
        if !self.context.help_topics.is_empty() {
            write!(f, "\n\nFor more help, try:")?;
            for topic in &self.context.help_topics {
                write!(f, "\n  trilium help {}", topic)?;
            }
        }
        
        Ok(())
    }
}

impl std::error::Error for EnhancedError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.error)
    }
}

impl From<TriliumError> for EnhancedError {
    fn from(error: TriliumError) -> Self {
        let context = ErrorContext::default();
        Self { error, context }
    }
}

/// Helper functions for creating specific error types
impl TriliumError {
    /// Create a content size error with specific size information
    pub fn content_too_large(size: usize, limit: usize) -> Self {
        Self::ContentTooLarge { size, limit }
    }
    
    /// Create a regex error with pattern and reason
    pub fn invalid_regex(pattern: &str, reason: &str) -> Self {
        Self::InvalidRegexPattern {
            pattern: pattern.to_string(),
            reason: reason.to_string(),
        }
    }
    
    /// Create a config validation error with field and reason
    pub fn config_validation(field: &str, reason: &str) -> Self {
        Self::ConfigValidationError {
            field: field.to_string(),
            reason: reason.to_string(),
        }
    }
    
    /// Create a resource limit error
    pub fn resource_limit(message: &str) -> Self {
        Self::ResourceLimitExceeded(message.to_string())
    }
    
    /// Create a timeout error
    pub fn timeout(operation: &str) -> Self {
        Self::TimeoutError(format!("{} operation timed out", operation))
    }
    
    /// Create a security error
    pub fn security(message: &str) -> Self {
        Self::SecurityError(message.to_string())
    }
    
    /// Create a validation error
    pub fn validation(message: &str) -> Self {
        Self::ValidationError(message.to_string())
    }
    
    /// Create an enhanced error with context
    pub fn with_context(self, context: ErrorContext) -> EnhancedError {
        EnhancedError {
            error: self,
            context,
        }
    }
    
    /// Create a plugin error
    pub fn plugin_error(message: &str) -> Self {
        Self::PluginError(message.to_string())
    }
    
    /// Create a completion error
    pub fn completion_error(message: &str) -> Self {
        Self::CompletionError(message.to_string())
    }
    
    /// Create a profile error
    pub fn profile_error(message: &str) -> Self {
        Self::ProfileError(message.to_string())
    }
    
    /// Get contextual suggestions based on error type and details
    pub fn get_suggestions(&self) -> Vec<String> {
        match self {
            Self::ConfigError(msg) => {
                if msg.contains("not found") {
                    vec![
                        "Run 'trilium config init' to create a configuration file".to_string(),
                        "Check if the config file path is correct".to_string(),
                        "Verify file permissions".to_string(),
                    ]
                } else if msg.contains("invalid") {
                    vec![
                        "Check the configuration file format".to_string(),
                        "Validate YAML syntax".to_string(),
                        "Review the configuration documentation".to_string(),
                    ]
                } else {
                    vec!["Check your configuration settings".to_string()]
                }
            }
            Self::ApiError(msg) => {
                if msg.contains("connection") {
                    vec![
                        "Check your internet connection".to_string(),
                        "Verify the server URL is correct".to_string(),
                        "Ensure the Trilium server is running".to_string(),
                    ]
                } else if msg.contains("authentication") || msg.contains("401") {
                    vec![
                        "Check your API token".to_string(),
                        "Generate a new ETAPI token in Trilium".to_string(),
                        "Verify the token has necessary permissions".to_string(),
                    ]
                } else {
                    vec![
                        "Check server status and logs".to_string(),
                        "Try the operation again".to_string(),
                    ]
                }
            }
            Self::NotFound(item) => {
                vec![
                    format!("Check if '{}' exists", item),
                    "Use 'trilium search' to find the correct item".to_string(),
                    "List available items to see what's accessible".to_string(),
                ]
            }
            Self::ValidationError(_) => {
                vec![
                    "Check your input format".to_string(),
                    "Review the command usage with --help".to_string(),
                    "Use the TUI mode for guided input".to_string(),
                ]
            }
            Self::ProfileError(_) => {
                vec![
                    "List available profiles with 'trilium profile list'".to_string(),
                    "Create a new profile with 'trilium profile create'".to_string(),
                    "Check profile configuration".to_string(),
                ]
            }
            Self::PluginError(_) => {
                vec![
                    "Check plugin compatibility".to_string(),
                    "Verify plugin installation".to_string(),
                    "Check plugin permissions and dependencies".to_string(),
                ]
            }
            _ => Vec::new(),
        }
    }
    
    /// Get help topics related to this error
    pub fn get_help_topics(&self) -> Vec<String> {
        match self {
            Self::ConfigError(_) => vec!["config".to_string(), "setup".to_string()],
            Self::ApiError(_) => vec!["api".to_string(), "connection".to_string()],
            Self::AuthError(_) => vec!["authentication".to_string(), "tokens".to_string()],
            Self::NotFound(_) => vec!["search".to_string(), "navigation".to_string()],
            Self::ProfileError(_) => vec!["profiles".to_string(), "config".to_string()],
            Self::PluginError(_) => vec!["plugins".to_string(), "extensions".to_string()],
            Self::TemplateError(_) => vec!["templates".to_string(), "creation".to_string()],
            Self::ImportExportError(_) => vec!["import".to_string(), "export".to_string()],
            _ => Vec::new(),
        }
    }
    
    /// Generate did-you-mean suggestions for command/option typos
    pub fn suggest_similar_commands(typo: &str, available_commands: &[&str]) -> Vec<String> {
        use strsim::jaro_winkler;
        
        let mut suggestions: Vec<(f64, String)> = available_commands
            .iter()
            .map(|cmd| (jaro_winkler(typo, cmd), cmd.to_string()))
            .filter(|(score, _)| *score > 0.6) // Only suggest if similarity is decent
            .collect();
            
        suggestions.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        
        suggestions.into_iter()
            .take(3) // Limit to top 3 suggestions
            .map(|(_, cmd)| cmd)
            .collect()
    }
    
    /// Check if this is a user-facing error that should be displayed nicely
    pub fn is_user_facing(&self) -> bool {
        matches!(
            self,
            Self::ValidationError(_)
                | Self::ConfigError(_)
                | Self::InvalidInput(_)
                | Self::NotFound(_)
                | Self::ResourceLimitExceeded(_)
                | Self::ContentTooLarge { .. }
                | Self::InvalidRegexPattern { .. }
                | Self::ConfigValidationError { .. }
                | Self::PermissionDenied(_)
        )
    }
    
    /// Get a user-friendly error message
    pub fn user_message(&self) -> String {
        match self {
            Self::ValidationError(msg) => format!("Validation failed: {}", msg),
            Self::ConfigError(msg) => format!("Configuration issue: {}", msg),
            Self::InvalidInput(msg) => format!("Invalid input: {}", msg),
            Self::NotFound(msg) => format!("Not found: {}", msg),
            Self::ResourceLimitExceeded(msg) => format!("Resource limit exceeded: {}", msg),
            Self::ContentTooLarge { size, limit } => {
                format!(
                    "Content is too large ({:.1} KB). Maximum allowed is {:.1} KB.",
                    *size as f64 / 1000.0,
                    *limit as f64 / 1000.0
                )
            }
            Self::InvalidRegexPattern { pattern, reason } => {
                format!("Invalid regular expression '{}': {}", pattern, reason)
            }
            Self::ConfigValidationError { field, reason } => {
                format!("Configuration error in '{}': {}", field, reason)
            }
            Self::PermissionDenied(msg) => format!("Permission denied: {}", msg),
            Self::TimeoutError(msg) => format!("Operation timed out: {}", msg),
            _ => self.to_string(), // Fall back to default error message
        }
    }
    
    /// Get an error category for logging/metrics
    pub fn category(&self) -> &'static str {
        match self {
            Self::ApiError(_) => "api",
            Self::AuthError(_) => "auth",
            Self::ConfigError(_) | Self::ConfigValidationError { .. } => "config",
            Self::IoError(_) => "io",
            Self::HttpError(_) => "http",
            Self::JsonError(_) | Self::YamlError(_) => "parsing",
            Self::ValidationError(_) | Self::InvalidInput(_) => "validation",
            Self::SecurityError(_) | Self::PermissionDenied(_) => "security",
            Self::ResourceLimitExceeded(_) | Self::ContentTooLarge { .. } => "resource_limit",
            Self::TimeoutError(_) => "timeout",
            Self::NetworkError(_) => "network",
            Self::TemplateError(_) => "template",
            Self::LinkParsingError(_) => "link_parsing",
            Self::TagError(_) => "tag",
            Self::QuickCaptureError(_) => "quick_capture",
            Self::SearchError(_) => "search",
            Self::InvalidRegexPattern { .. } => "regex",
            Self::RateLimitError(_) => "rate_limit",
            Self::DataCorruption(_) => "data_corruption",
            Self::ParseError(_) => "parsing",
            _ => "general",
        }
    }
    
    /// Check if this error suggests the operation should be retried
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::HttpError(_)
                | Self::NetworkError(_)
                | Self::TimeoutError(_)
                | Self::RateLimitError(_)
                | Self::ApiError(_)
        )
    }
    
    /// Get the appropriate exit code for this error
    pub fn exit_code(&self) -> i32 {
        match self {
            Self::ValidationError(_) | Self::InvalidInput(_) => 2,
            Self::ConfigError(_) | Self::ConfigValidationError { .. } => 3,
            Self::NotFound(_) | Self::NoteNotFound(_) | Self::BranchNotFound(_) | Self::AttributeNotFound(_) | Self::AttachmentNotFound(_) => 4,
            Self::PermissionDenied(_) | Self::AuthError(_) => 5,
            Self::SecurityError(_) => 6,
            Self::ResourceLimitExceeded(_) | Self::ContentTooLarge { .. } => 7,
            Self::TimeoutError(_) => 8,
            Self::IoError(_) => 9,
            Self::NetworkError(_) | Self::HttpError(_) => 10,
            _ => 1, // General error
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_content_too_large_error() {
        let error = TriliumError::content_too_large(1500, 1000);
        let message = error.user_message();
        assert!(message.contains("1.5 KB"));
        assert!(message.contains("1.0 KB"));
        assert!(error.is_user_facing());
    }
    
    #[test]
    fn test_invalid_regex_error() {
        let error = TriliumError::invalid_regex("(.+)*", "catastrophic backtracking");
        let message = error.user_message();
        assert!(message.contains("(.+)*"));
        assert!(message.contains("catastrophic backtracking"));
        assert!(error.is_user_facing());
    }
    
    #[test]
    fn test_config_validation_error() {
        let error = TriliumError::config_validation("max_retries", "value too high");
        let message = error.user_message();
        assert!(message.contains("max_retries"));
        assert!(message.contains("value too high"));
        assert!(error.is_user_facing());
    }
    
    #[test]
    fn test_error_categories() {
        assert_eq!(TriliumError::ApiError("test".to_string()).category(), "api");
        assert_eq!(TriliumError::SecurityError("test".to_string()).category(), "security");
        assert_eq!(TriliumError::ValidationError("test".to_string()).category(), "validation");
        assert_eq!(TriliumError::TimeoutError("test".to_string()).category(), "timeout");
    }
    
    #[test]
    fn test_retryable_errors() {
        assert!(TriliumError::TimeoutError("test".to_string()).is_retryable());
        assert!(TriliumError::NetworkError("test".to_string()).is_retryable());
        assert!(TriliumError::ApiError("test".to_string()).is_retryable());
        
        assert!(!TriliumError::ValidationError("test".to_string()).is_retryable());
        assert!(!TriliumError::SecurityError("test".to_string()).is_retryable());
    }
    
    #[test]
    fn test_exit_codes() {
        assert_eq!(TriliumError::ValidationError("test".to_string()).exit_code(), 2);
        assert_eq!(TriliumError::ConfigError("test".to_string()).exit_code(), 3);
        assert_eq!(TriliumError::NotFound("test".to_string()).exit_code(), 4);
        assert_eq!(TriliumError::PermissionDenied("test".to_string()).exit_code(), 5);
        assert_eq!(TriliumError::SecurityError("test".to_string()).exit_code(), 6);
        assert_eq!(TriliumError::content_too_large(1000, 500).exit_code(), 7);
        assert_eq!(TriliumError::TimeoutError("test".to_string()).exit_code(), 8);
    }
    
    #[test]
    fn test_user_facing_classification() {
        assert!(TriliumError::ValidationError("test".to_string()).is_user_facing());
        assert!(TriliumError::NotFound("test".to_string()).is_user_facing());
        assert!(TriliumError::content_too_large(1000, 500).is_user_facing());
        
        assert!(!TriliumError::General(anyhow::anyhow!("internal error")).is_user_facing());
        assert!(!TriliumError::Unknown("unknown".to_string()).is_user_facing());
    }
    
    #[test]
    fn test_helper_constructors() {
        let resource_error = TriliumError::resource_limit("too many items");
        assert!(matches!(resource_error, TriliumError::ResourceLimitExceeded(_)));
        
        let timeout_error = TriliumError::timeout("search");
        assert!(matches!(timeout_error, TriliumError::TimeoutError(_)));
        
        let security_error = TriliumError::security("potential attack");
        assert!(matches!(security_error, TriliumError::SecurityError(_)));
        
        let validation_error = TriliumError::validation("invalid format");
        assert!(matches!(validation_error, TriliumError::ValidationError(_)));
    }
}