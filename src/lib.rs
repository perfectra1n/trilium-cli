// Re-export modules for testing
pub mod api;
pub mod cli;
pub mod completion;
pub mod config;
pub mod dx_integration;
pub mod error;
pub mod help;
pub mod import_export;
pub mod models;
pub mod plugins;
pub mod progress;
pub mod progress_integration;
pub mod tui;
pub mod utils;

// Re-export commonly used types
pub use api::TriliumClient;
pub use config::Config;
pub use error::{Result, TriliumError};