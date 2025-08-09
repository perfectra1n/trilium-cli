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
    NoteNotFound(String),

    #[error("Branch not found: {0}")]
    BranchNotFound(String),

    #[error("Attribute not found: {0}")]
    AttributeNotFound(String),

    #[error("Attachment not found: {0}")]
    AttachmentNotFound(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Operation cancelled")]
    Cancelled,

    #[error("TUI error: {0}")]
    TuiError(String),

    #[error("Unknown error: {0}")]
    Unknown(String),

    #[error("General error: {0}")]
    General(#[from] anyhow::Error),
}

pub type Result<T> = std::result::Result<T, TriliumError>;