//! Resource limits and security constraints
//! 
//! This module defines resource limits to prevent abuse and ensure
//! safe operation of import/export functionality.

#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Centralized resource limits configuration for security and performance
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ResourceLimits {
    /// Maximum content size for various operations (in bytes)
    pub max_content_size: usize,
    
    /// Maximum size for template content (in bytes)
    pub max_template_content_size: usize,
    
    /// Maximum size for quick capture input (in bytes)
    pub max_quick_capture_size: usize,
    
    /// Maximum size for batch operations (in bytes)
    pub max_batch_size: usize,
    
    /// Maximum number of captures in a batch
    pub max_batch_count: usize,
    
    /// Maximum JSON input size (in bytes)
    pub max_json_size: usize,
    
    /// Maximum regex pattern length
    pub max_regex_pattern_length: usize,
    
    /// Maximum regex nesting depth
    pub max_regex_nesting_depth: i32,
    
    /// Maximum number of regex alternations
    pub max_regex_alternations: usize,
    
    /// Maximum number of regex repetition operators
    pub max_regex_repetitions: usize,
    
    /// Search operation timeout
    pub search_timeout: Duration,
    
    /// Maximum number of highlights per line
    pub max_highlights_per_line: usize,
    
    /// Maximum number of snippets per search result
    pub max_snippets_per_result: usize,
    
    /// Maximum variable name length
    pub max_variable_name_length: usize,
    
    /// Maximum variable value length
    pub max_variable_value_length: usize,
    
    /// Maximum number of template substitutions
    pub max_template_substitutions: usize,
    
    /// Maximum number of tags
    pub max_tags_count: usize,
    
    /// Maximum tag name length
    pub max_tag_name_length: usize,
    
    /// Maximum number of todo lines
    pub max_todo_lines: usize,
    
    /// Maximum note ID length
    pub max_note_id_length: usize,
    
    /// Maximum note title length
    pub max_note_title_length: usize,
    
    /// Maximum number of recent notes
    pub max_recent_notes: usize,
    
    /// Maximum number of bookmarks
    pub max_bookmarks: usize,
    
    /// Maximum timeout for operations (seconds)
    pub max_timeout_seconds: u64,
    
    /// Maximum number of retries
    pub max_retries: u32,
    
    /// Maximum number of links in content
    pub max_links_count: usize,
    
    /// Maximum link target length
    pub max_link_target_length: usize,
    
    /// Maximum link display text length
    pub max_link_display_text_length: usize,
    
    /// Maximum number of replacements in link operations
    pub max_replacements_count: usize,
    
    /// Maximum number of note titles in maps
    pub max_note_titles_count: usize,
    
    /// Maximum total number of tags in hierarchy operations
    pub max_total_tags: usize,
    
    /// Maximum tag hierarchy depth
    pub max_tag_hierarchy_depth: usize,
    
    /// Maximum pattern length for tag filtering
    pub max_tag_pattern_length: usize,
    
    /// Maximum number of tag filter results
    pub max_tag_filter_results: usize,
    
    /// Maximum input length for tag suggestions
    pub max_tag_suggestion_input_length: usize,
    
    /// Maximum number of tag children
    pub max_tag_children: usize,
    
    /// Maximum cache size for tag hierarchy
    pub max_tag_cache_size: usize,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            // Content size limits (conservative defaults for security)
            max_content_size: 10_000_000, // 10MB
            max_template_content_size: 1_000_000, // 1MB
            max_quick_capture_size: 10_000, // 10KB
            max_batch_size: 100_000, // 100KB
            max_batch_count: 50,
            max_json_size: 50_000, // 50KB
            
            // Regex security limits
            max_regex_pattern_length: 1000,
            max_regex_nesting_depth: 10,
            max_regex_alternations: 20,
            max_regex_repetitions: 30,
            search_timeout: Duration::from_millis(5000), // 5 seconds
            
            // Search result limits
            max_highlights_per_line: 50,
            max_snippets_per_result: 10,
            
            // Template limits
            max_variable_name_length: 100,
            max_variable_value_length: 10_000, // 10KB per variable
            max_template_substitutions: 1000,
            
            // Tag limits
            max_tags_count: 50,
            max_tag_name_length: 100,
            max_todo_lines: 200,
            
            // Note limits
            max_note_id_length: 100,
            max_note_title_length: 500,
            max_recent_notes: 100,
            max_bookmarks: 100,
            
            // Configuration limits
            max_timeout_seconds: 300, // 5 minutes
            max_retries: 10,
            
            // Link parsing limits
            max_links_count: 1000,
            max_link_target_length: 500,
            max_link_display_text_length: 500,
            max_replacements_count: 10_000,
            max_note_titles_count: 10_000,
            
            // Tag hierarchy limits
            max_total_tags: 10_000,
            max_tag_hierarchy_depth: 10,
            max_tag_pattern_length: 200,
            max_tag_filter_results: 1000,
            max_tag_suggestion_input_length: 100,
            max_tag_children: 1000,
            max_tag_cache_size: 100,
        }
    }
}

impl ResourceLimits {
    /// Create a new ResourceLimits instance with default values
    pub fn new() -> Self {
        Self::default()
    }
    
    /// Create a more restrictive configuration for high-security environments
    pub fn restrictive() -> Self {
        Self {
            max_content_size: 1_000_000, // 1MB
            max_template_content_size: 100_000, // 100KB
            max_quick_capture_size: 1_000, // 1KB
            max_batch_size: 10_000, // 10KB
            max_batch_count: 10,
            max_json_size: 5_000, // 5KB
            
            max_regex_pattern_length: 100,
            max_regex_nesting_depth: 5,
            max_regex_alternations: 5,
            max_regex_repetitions: 10,
            search_timeout: Duration::from_millis(2000), // 2 seconds
            
            max_highlights_per_line: 10,
            max_snippets_per_result: 5,
            
            max_variable_name_length: 50,
            max_variable_value_length: 1_000, // 1KB per variable
            max_template_substitutions: 100,
            
            max_tags_count: 20,
            max_tag_name_length: 50,
            max_todo_lines: 50,
            
            max_note_id_length: 50,
            max_note_title_length: 200,
            max_recent_notes: 20,
            max_bookmarks: 20,
            
            max_timeout_seconds: 60, // 1 minute
            max_retries: 3,
            
            max_links_count: 100,
            max_link_target_length: 200,
            max_link_display_text_length: 200,
            max_replacements_count: 1_000,
            max_note_titles_count: 1_000,
            
            max_total_tags: 1_000,
            max_tag_hierarchy_depth: 5,
            max_tag_pattern_length: 50,
            max_tag_filter_results: 100,
            max_tag_suggestion_input_length: 50,
            max_tag_children: 100,
            max_tag_cache_size: 20,
        }
    }
    
    /// Create a more permissive configuration for development environments
    pub fn permissive() -> Self {
        Self {
            max_content_size: 100_000_000, // 100MB
            max_template_content_size: 10_000_000, // 10MB
            max_quick_capture_size: 100_000, // 100KB
            max_batch_size: 1_000_000, // 1MB
            max_batch_count: 100,
            max_json_size: 500_000, // 500KB
            
            max_regex_pattern_length: 5000,
            max_regex_nesting_depth: 20,
            max_regex_alternations: 100,
            max_regex_repetitions: 100,
            search_timeout: Duration::from_millis(30000), // 30 seconds
            
            max_highlights_per_line: 200,
            max_snippets_per_result: 50,
            
            max_variable_name_length: 500,
            max_variable_value_length: 100_000, // 100KB per variable
            max_template_substitutions: 5000,
            
            max_tags_count: 200,
            max_tag_name_length: 200,
            max_todo_lines: 1000,
            
            max_note_id_length: 200,
            max_note_title_length: 1000,
            max_recent_notes: 500,
            max_bookmarks: 500,
            
            max_timeout_seconds: 1800, // 30 minutes
            max_retries: 20,
            
            max_links_count: 10_000,
            max_link_target_length: 1000,
            max_link_display_text_length: 1000,
            max_replacements_count: 100_000,
            max_note_titles_count: 100_000,
            
            max_total_tags: 100_000,
            max_tag_hierarchy_depth: 20,
            max_tag_pattern_length: 1000,
            max_tag_filter_results: 10_000,
            max_tag_suggestion_input_length: 500,
            max_tag_children: 10_000,
            max_tag_cache_size: 500,
        }
    }
    
    /// Validate that all limits are within reasonable bounds
    pub fn validate(&self) -> Result<(), String> {
        // Check for zero values that would break functionality
        if self.max_content_size == 0 {
            return Err("max_content_size cannot be zero".to_string());
        }
        if self.max_recent_notes == 0 {
            return Err("max_recent_notes cannot be zero".to_string());
        }
        if self.max_timeout_seconds == 0 {
            return Err("max_timeout_seconds cannot be zero".to_string());
        }
        
        // Check for unreasonably large values that could cause issues
        if self.max_content_size > 1_000_000_000 { // 1GB
            return Err("max_content_size too large (max 1GB)".to_string());
        }
        if self.max_recent_notes > 10_000 {
            return Err("max_recent_notes too large (max 10,000)".to_string());
        }
        if self.max_timeout_seconds > 3600 { // 1 hour
            return Err("max_timeout_seconds too large (max 1 hour)".to_string());
        }
        if self.search_timeout > Duration::from_secs(300) { // 5 minutes
            return Err("search_timeout too large (max 5 minutes)".to_string());
        }
        
        Ok(())
    }
    
    /// Get a human-readable summary of the limits
    pub fn summary(&self) -> String {
        format!(
            "Resource Limits Summary:\n\
             - Content size: {:.1} MB\n\
             - Quick capture: {:.1} KB\n\
             - Search timeout: {:.1}s\n\
             - Max recent notes: {}\n\
             - Max bookmarks: {}\n\
             - Max tags: {}\n\
             - Max links: {}",
            self.max_content_size as f64 / 1_000_000.0,
            self.max_quick_capture_size as f64 / 1_000.0,
            self.search_timeout.as_secs_f64(),
            self.max_recent_notes,
            self.max_bookmarks,
            self.max_tags_count,
            self.max_links_count
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_limits_are_valid() {
        let limits = ResourceLimits::default();
        assert!(limits.validate().is_ok());
    }
    
    #[test]
    fn test_restrictive_limits_are_valid() {
        let limits = ResourceLimits::restrictive();
        assert!(limits.validate().is_ok());
        
        // Should be more restrictive than default
        let default = ResourceLimits::default();
        assert!(limits.max_content_size <= default.max_content_size);
        assert!(limits.max_recent_notes <= default.max_recent_notes);
    }
    
    #[test]
    fn test_permissive_limits_are_valid() {
        let limits = ResourceLimits::permissive();
        assert!(limits.validate().is_ok());
        
        // Should be more permissive than default
        let default = ResourceLimits::default();
        assert!(limits.max_content_size >= default.max_content_size);
        assert!(limits.max_recent_notes >= default.max_recent_notes);
    }
    
    #[test]
    fn test_validation_catches_zero_values() {
        let mut limits = ResourceLimits::default();
        limits.max_content_size = 0;
        assert!(limits.validate().is_err());
        
        limits = ResourceLimits::default();
        limits.max_recent_notes = 0;
        assert!(limits.validate().is_err());
    }
    
    #[test]
    fn test_validation_catches_large_values() {
        let mut limits = ResourceLimits::default();
        limits.max_content_size = 2_000_000_000; // 2GB
        assert!(limits.validate().is_err());
        
        limits = ResourceLimits::default();
        limits.max_recent_notes = 20_000;
        assert!(limits.validate().is_err());
        
        limits = ResourceLimits::default();
        limits.search_timeout = Duration::from_secs(600); // 10 minutes
        assert!(limits.validate().is_err());
    }
    
    #[test]
    fn test_summary_format() {
        let limits = ResourceLimits::default();
        let summary = limits.summary();
        assert!(summary.contains("Resource Limits Summary"));
        assert!(summary.contains("Content size"));
        assert!(summary.contains("MB"));
        assert!(summary.contains("KB"));
    }
    
    #[test]
    fn test_serialization() {
        let limits = ResourceLimits::default();
        let json = serde_json::to_string(&limits).unwrap();
        let deserialized: ResourceLimits = serde_json::from_str(&json).unwrap();
        
        assert_eq!(limits.max_content_size, deserialized.max_content_size);
        assert_eq!(limits.max_recent_notes, deserialized.max_recent_notes);
        assert_eq!(limits.search_timeout, deserialized.search_timeout);
    }
}