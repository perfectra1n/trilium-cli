#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use std::fs;
    
    #[test]
    fn test_import_result_creation() {
        let mut result = ImportResult::new();
        result.notes_imported = 5;
        result.files_processed = 10;
        result.add_error("Test error".to_string());
        result.finalize();
        
        assert_eq!(result.notes_imported, 5);
        assert_eq!(result.files_processed, 10);
        assert_eq!(result.errors.len(), 1);
        assert!(result.summary.end_time.is_some());
        assert!(result.summary.duration_seconds.is_some());
    }
    
    #[test]
    fn test_export_result_creation() {
        let mut result = ExportResult::new("obsidian".to_string());
        result.notes_exported = 3;
        result.files_created = 7;
        result.add_error("Export error".to_string());
        result.finalize();
        
        assert_eq!(result.notes_exported, 3);
        assert_eq!(result.files_created, 7);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.summary.export_format, "obsidian");
        assert!(result.summary.end_time.is_some());
    }
    
    #[test]
    fn test_git_sync_result_creation() {
        let mut result = GitSyncResult::new(
            "/path/to/repo".to_string(), 
            "main".to_string()
        );
        result.files_processed = 5;
        result.commits_processed = 2;
        result.last_commit_hash = Some("abc123".to_string());
        result.finalize();
        
        assert_eq!(result.files_processed, 5);
        assert_eq!(result.commits_processed, 2);
        assert_eq!(result.last_commit_hash, Some("abc123".to_string()));
        assert_eq!(result.summary.repository_path, "/path/to/repo");
        assert_eq!(result.summary.branch, "main");
    }
    
    #[test]
    fn test_import_export_config_default() {
        let config = ImportExportConfig::default();
        
        assert_eq!(config.max_file_size_mb, 100);
        assert!(config.supported_extensions.contains(&"md".to_string()));
        assert!(config.preserve_timestamps);
        assert!(config.create_index_notes);
        assert_eq!(config.batch_size, 50);
        
        match config.handle_duplicates {
            DuplicateHandling::Skip => {},
            _ => panic!("Expected Skip as default duplicate handling"),
        }
    }
    
    #[tokio::test]
    async fn test_utils_sanitize_filename() {
        use super::utils::sanitize_filename;
        
        assert_eq!(sanitize_filename("Hello World"), "Hello World");
        assert_eq!(sanitize_filename("Hello/World<>:\""), "Hello_World___");
        assert_eq!(sanitize_filename("   .test.   "), "test");
    }
    
    #[tokio::test]
    async fn test_utils_extract_title() {
        use super::utils::extract_title_from_content;
        
        assert_eq!(
            extract_title_from_content("# Main Title\n\nContent here", "fallback"),
            "Main Title"
        );
        assert_eq!(
            extract_title_from_content("No heading here", "fallback"),
            "No heading here"
        );
        assert_eq!(
            extract_title_from_content("", "fallback"),
            "fallback"
        );
    }
    
    #[test]
    fn test_formats_markdown_to_html() {
        use super::formats::markdown_to_html;
        
        let markdown = "# Hello\n\nThis is **bold** text.";
        let html = markdown_to_html(markdown);
        assert!(html.contains("<h1>"));
        assert!(html.contains("<strong>"));
    }
    
    #[test]
    fn test_formats_csv_to_markdown() {
        use super::formats::csv_to_markdown;
        
        let csv = "Name,Age,City\nJohn,30,NYC\nJane,25,LA";
        let result = csv_to_markdown(csv).unwrap();
        assert!(result.contains("| Name | Age | City |"));
        assert!(result.contains("| John | 30 | NYC |"));
    }
}