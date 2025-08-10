pub mod obsidian;
pub mod notion;
pub mod directory;
pub mod git;
pub mod formats;
pub mod utils;

#[cfg(test)]
mod tests;

use crate::error::Result;
use serde::{Deserialize, Serialize};

/// Common result structure for import operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub notes_imported: usize,
    pub attachments_imported: usize,
    pub directories_processed: usize,
    pub files_processed: usize,
    pub errors: Vec<String>,
    pub summary: ImportSummary,
}

/// Common result structure for export operations  
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub notes_exported: usize,
    pub attachments_exported: usize,
    pub files_created: usize,
    pub errors: Vec<String>,
    pub summary: ExportSummary,
}

/// Import operation summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSummary {
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub duration_seconds: Option<f64>,
    pub total_size_bytes: u64,
    pub note_types: std::collections::HashMap<String, usize>,
}

/// Export operation summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSummary {
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub duration_seconds: Option<f64>,
    pub total_size_bytes: u64,
    pub export_format: String,
}

/// Git sync result structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitSyncResult {
    pub files_processed: usize,
    pub commits_processed: usize,
    pub branches_processed: Vec<String>,
    pub last_commit_hash: Option<String>,
    pub errors: Vec<String>,
    pub summary: GitSyncSummary,
}

/// Git sync operation summary
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitSyncSummary {
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub duration_seconds: Option<f64>,
    pub repository_path: String,
    pub branch: String,
}

impl ImportResult {
    pub fn new() -> Self {
        Self {
            notes_imported: 0,
            attachments_imported: 0,
            directories_processed: 0,
            files_processed: 0,
            errors: Vec::new(),
            summary: ImportSummary {
                start_time: chrono::Utc::now(),
                end_time: None,
                duration_seconds: None,
                total_size_bytes: 0,
                note_types: std::collections::HashMap::new(),
            },
        }
    }

    pub fn add_error(&mut self, error: String) {
        self.errors.push(error);
    }

    pub fn finalize(&mut self) {
        let now = chrono::Utc::now();
        self.summary.end_time = Some(now);
        self.summary.duration_seconds = Some(
            (now - self.summary.start_time).num_milliseconds() as f64 / 1000.0
        );
    }
}

impl ExportResult {
    pub fn new(format: String) -> Self {
        Self {
            notes_exported: 0,
            attachments_exported: 0,
            files_created: 0,
            errors: Vec::new(),
            summary: ExportSummary {
                start_time: chrono::Utc::now(),
                end_time: None,
                duration_seconds: None,
                total_size_bytes: 0,
                export_format: format,
            },
        }
    }

    pub fn add_error(&mut self, error: String) {
        self.errors.push(error);
    }

    pub fn finalize(&mut self) {
        let now = chrono::Utc::now();
        self.summary.end_time = Some(now);
        self.summary.duration_seconds = Some(
            (now - self.summary.start_time).num_milliseconds() as f64 / 1000.0
        );
    }
}

impl GitSyncResult {
    pub fn new(repo_path: String, branch: String) -> Self {
        Self {
            files_processed: 0,
            commits_processed: 0,
            branches_processed: Vec::new(),
            last_commit_hash: None,
            errors: Vec::new(),
            summary: GitSyncSummary {
                start_time: chrono::Utc::now(),
                end_time: None,
                duration_seconds: None,
                repository_path: repo_path,
                branch,
            },
        }
    }

    pub fn add_error(&mut self, error: String) {
        self.errors.push(error);
    }

    pub fn finalize(&mut self) {
        let now = chrono::Utc::now();
        self.summary.end_time = Some(now);
        self.summary.duration_seconds = Some(
            (now - self.summary.start_time).num_milliseconds() as f64 / 1000.0
        );
    }
}

/// Configuration for import/export operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportExportConfig {
    pub max_file_size_mb: usize,
    pub supported_extensions: Vec<String>,
    pub preserve_timestamps: bool,
    pub create_index_notes: bool,
    pub handle_duplicates: DuplicateHandling,
    pub batch_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DuplicateHandling {
    Skip,
    Overwrite,
    Rename,
    Merge,
}

impl Default for ImportExportConfig {
    fn default() -> Self {
        Self {
            max_file_size_mb: 100,
            supported_extensions: vec![
                "md".to_string(),
                "txt".to_string(),
                "html".to_string(),
                "json".to_string(),
                "csv".to_string(),
            ],
            preserve_timestamps: true,
            create_index_notes: true,
            handle_duplicates: DuplicateHandling::Skip,
            batch_size: 50,
        }
    }
}