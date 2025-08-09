use thiserror::Error;

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

    #[error("Validation error: {0}")]
    ValidationError(String),

    #[error("Terminal error: {0}")]
    TerminalError(String),

    #[error("Editor error: {0}")]
    EditorError(String),

    #[error("Input error: {0}")]
    InputError(String),
}

pub type Result<T> = std::result::Result<T, TriliumError>;