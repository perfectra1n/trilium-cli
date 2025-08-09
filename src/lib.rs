// Re-export modules for testing
pub mod api;
pub mod cli;
pub mod config;
pub mod error;
pub mod models;
pub mod tui;

// Re-export commonly used types
pub use api::TriliumClient;
pub use config::Config;
pub use error::{Result, TriliumError};