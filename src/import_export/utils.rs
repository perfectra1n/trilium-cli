//! Utility functions for import/export operations
//! 
//! This module provides common utilities for file handling, validation,
//! and processing during import/export operations.

#![allow(dead_code)]

use crate::error::{TriliumError, Result};
use crate::utils::resource_limits::ResourceLimits;
use anyhow::Context;
use indicatif::{ProgressBar, ProgressStyle};
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf, Component};

/// Detect file type based on extension and content
pub fn detect_file_type(path: &Path) -> Option<String> {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        match ext.to_lowercase().as_str() {
            "md" | "markdown" => Some("markdown".to_string()),
            "txt" => Some("text".to_string()),
            "html" | "htm" => Some("html".to_string()),
            "json" => Some("json".to_string()),
            "csv" => Some("csv".to_string()),
            "xml" => Some("xml".to_string()),
            "js" | "ts" | "py" | "rs" | "java" | "cpp" | "c" | "go" => Some("code".to_string()),
            "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" => Some("image".to_string()),
            "pdf" => Some("pdf".to_string()),
            _ => Some("file".to_string()),
        }
    } else {
        None
    }
}

/// Sanitize filename for cross-platform compatibility with enhanced security
pub fn sanitize_filename(filename: &str) -> String {
    if filename.is_empty() {
        return "unnamed_file".to_string();
    }
    
    // Create a safe regex with error handling
    let invalid_chars = match Regex::new(r#"[<>:"/\\|?*\x00-\x1f\x7f]"#) {
        Ok(regex) => regex,
        Err(_) => {
            // Fallback to manual character filtering
            return filename.chars()
                .filter(|c| c.is_alphanumeric() || " -_.".contains(*c))
                .collect::<String>()
                .trim()
                .to_string();
        }
    };
    
    let sanitized = invalid_chars.replace_all(filename, "_");
    
    // Check for Windows reserved names
    let reserved_names = [
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
    ];
    
    let mut result = sanitized.to_string();
    
    // Check if it's a reserved name (case insensitive)
    let name_without_ext = result.split('.').next().unwrap_or(&result).to_uppercase();
    if reserved_names.contains(&name_without_ext.as_str()) {
        result = format!("_{}", result);
    }
    
    // Limit length more conservatively
    if result.len() > 180 { // Leave room for extensions and numbering
        result.truncate(180);
    }
    
    // Ensure it doesn't start/end with whitespace, dots, or dangerous characters
    result = result.trim().trim_matches('.').trim_matches('-').to_string();
    
    // Ensure minimum length
    if result.is_empty() || result.len() < 1 {
        result = "unnamed_file".to_string();
    }
    
    result
}

/// Create a progress bar with consistent styling
pub fn create_progress_bar(total: u64, prefix: &str) -> ProgressBar {
    let pb = ProgressBar::new(total);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{prefix:.cyan.bold} [{elapsed_precise}] {bar:40.cyan/blue} {pos:>7}/{len:7} {msg}")
            .unwrap()
            .progress_chars("█▉▊▋▌▍▎▏  "),
    );
    pb.set_prefix(prefix.to_string());
    pb
}

/// Extract title from content with security limits
pub fn extract_title_from_content(content: &str, fallback: &str) -> String {
    let limits = ResourceLimits::default();
    
    // Prevent processing of extremely large content
    if content.len() > limits.max_content_size {
        return sanitize_title(fallback);
    }
    
    // Limit the number of lines we examine to prevent resource exhaustion
    let max_lines_to_examine = 50;
    let mut lines_examined = 0;
    
    // Try to find first heading
    for line in content.lines() {
        lines_examined += 1;
        if lines_examined > max_lines_to_examine {
            break;
        }
        
        let trimmed = line.trim();
        
        // Skip excessively long lines
        if trimmed.len() > 500 {
            continue;
        }
        
        if trimmed.starts_with('#') {
            let title = trimmed.trim_start_matches('#').trim();
            if !title.is_empty() && title.len() <= 200 {
                return sanitize_title(title);
            }
        }
        
        // Try HTML title with safety
        if let Some(title) = extract_html_title_safe(trimmed) {
            return sanitize_title(&title);
        }
        
        // If no heading found, use first non-empty line
        if !trimmed.is_empty() && !trimmed.starts_with("---") {
            // Truncate if too long
            let safe_title = if trimmed.len() > 100 {
                format!("{}...", &trimmed[..97])
            } else {
                trimmed.to_string()
            };
            return sanitize_title(&safe_title);
        }
    }
    
    sanitize_title(fallback)
}

/// Sanitize extracted title content
fn sanitize_title(title: &str) -> String {
    if title.is_empty() {
        return "Untitled".to_string();
    }
    
    // Remove control characters and normalize whitespace
    let cleaned: String = title.chars()
        .filter(|c| !c.is_control() || c == &'\n' || c == &'\t')
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    
    // Limit length
    let result = if cleaned.len() > 200 {
        format!("{}...", &cleaned[..197])
    } else {
        cleaned
    };
    
    if result.trim().is_empty() {
        "Untitled".to_string()
    } else {
        result
    }
}

/// Extract HTML title tag content safely
fn extract_html_title_safe(html: &str) -> Option<String> {
    // Limit HTML length to prevent ReDoS
    if html.len() > 10000 {
        return None;
    }
    
    // Use a simple and safe regex pattern
    let title_re = Regex::new(r"<title[^>]{0,100}>([^<]{1,200})</title>").ok()?;
    
    title_re.captures(html)
        .and_then(|caps| caps.get(1))
        .map(|m| {
            let title = m.as_str();
            // Basic HTML entity decoding for common cases
            title.replace("&lt;", "<")
                 .replace("&gt;", ">")
                 .replace("&amp;", "&")
                 .replace("&quot;", "\"")
                 .replace("&#39;", "'")
        })
}

/// Convert file size to human readable format
pub fn format_file_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;
    
    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    
    if unit_index == 0 {
        format!("{} {}", bytes, UNITS[unit_index])
    } else {
        format!("{:.1} {}", size, UNITS[unit_index])
    }
}

/// Check if file should be ignored based on patterns with security enhancements
pub fn should_ignore_file(path: &Path, ignore_patterns: &[String]) -> bool {
    let path_str = path.to_string_lossy();
    
    // Security check: reject paths that are too long
    if path_str.len() > 4096 {
        return true;
    }
    
    // Check for dangerous path patterns
    if path_str.contains("../") || path_str.contains("..\\") {
        return true;
    }
    
    // Limit the number of custom ignore patterns to process
    let patterns_to_check = if ignore_patterns.len() > 100 {
        &ignore_patterns[..100]
    } else {
        ignore_patterns
    };
    
    for pattern in patterns_to_check {
        // Limit pattern length to prevent resource exhaustion
        if pattern.len() > 200 {
            continue;
        }
        
        if let Ok(glob_pattern) = glob::Pattern::new(pattern) {
            if glob_pattern.matches(&path_str) {
                return true;
            }
        }
    }
    
    // Enhanced default ignore patterns
    let default_ignores = [
        ".git", ".svn", ".hg", // Version control
        ".DS_Store", "Thumbs.db", "desktop.ini", // OS files
        ".obsidian", ".notion", ".vscode", // App directories
        "node_modules", ".npm", "bower_components", // Package managers
        ".cache", ".tmp", "temp", ".temp", // Cache/temp
        "*.tmp", "*.temp", "*.log", "*.bak", // Temp file extensions
        "*.exe", "*.dll", "*.so", "*.dylib", // Executables
        "*.zip", "*.rar", "*.7z", "*.tar", // Archives (for security)
    ];
    
    for ignore in &default_ignores {
        if ignore.contains('*') {
            // Simple wildcard matching
            if ignore.starts_with('*') {
                let suffix = &ignore[1..];
                if path_str.ends_with(suffix) {
                    return true;
                }
            } else if ignore.ends_with('*') {
                let prefix = &ignore[..ignore.len()-1];
                if path_str.contains(prefix) {
                    return true;
                }
            }
        } else if path_str.contains(ignore) {
            return true;
        }
    }
    
    false
}

/// Calculate checksum for duplicate detection with size limits
pub fn calculate_file_checksum(path: &Path) -> Result<String> {
    let limits = ResourceLimits::default();
    
    // Check file size before reading
    let metadata = fs::metadata(path)
        .with_context(|| format!("Failed to read metadata: {}", path.display()))?;
    
    let file_size = metadata.len();
    if file_size > limits.max_content_size as u64 {
        return Ok(format!("large-file-{}-{}", file_size, 
                         path.file_name().unwrap_or_default().to_string_lossy()));
    }
    
    let content = fs::read(path)
        .with_context(|| format!("Failed to read file: {}", path.display()))?;
    
    // Use SHA-256 instead of MD5 for better security
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(&content);
    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

/// Normalize note title for comparison
pub fn normalize_title(title: &str) -> String {
    title.trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Validate that a directory is safe to work with enhanced security checks
pub fn validate_directory(path: &Path) -> Result<()> {
    let path_str = path.to_string_lossy();
    
    // Length check
    if path_str.len() > 4096 {
        return Err(TriliumError::InvalidInput(
            format!("Directory path too long: {} characters (max: 4096)", path_str.len())
        ));
    }
    
    // Path traversal check
    if path_str.contains("..") {
        return Err(TriliumError::Security(
            format!("Directory path contains parent directory references: {}", path.display())
        ));
    }
    
    // Check for dangerous path components
    for component in path.components() {
        match component {
            Component::Normal(name) => {
                let name_str = name.to_string_lossy();
                if name_str.starts_with('.') && name_str.len() > 1 {
                    // Allow common hidden directories but be cautious
                    let allowed_hidden = [".git", ".svn", ".obsidian"];
                    if !allowed_hidden.iter().any(|&allowed| name_str.starts_with(allowed)) {
                        eprintln!("Warning: accessing hidden directory: {}", name_str);
                    }
                }
            }
            Component::ParentDir => {
                return Err(TriliumError::Security(
                    format!("Directory path contains parent directory traversal: {}", path.display())
                ));
            }
            _ => {}
        }
    }
    
    if !path.exists() {
        return Err(TriliumError::NotFound(
            format!("Directory does not exist: {}", path.display())
        ));
    }
    
    if !path.is_dir() {
        return Err(TriliumError::InvalidInput(
            format!("Path is not a directory: {}", path.display())
        ));
    }
    
    // Canonicalize to resolve symlinks and get absolute path
    let canonical = path.canonicalize()
        .with_context(|| format!("Failed to canonicalize directory: {}", path.display()))?;
    
    // Check if we can read the directory
    match fs::read_dir(&canonical) {
        Ok(_) => Ok(()),
        Err(e) => return Err(TriliumError::General(
            anyhow::anyhow!("Cannot read directory {}: {}", canonical.display(), e)
        )),
    }
}

/// Create directory structure if it doesn't exist
pub fn ensure_directory(path: &Path) -> Result<()> {
    if !path.exists() {
        fs::create_dir_all(path)
            .with_context(|| format!("Failed to create directory: {}", path.display()))?;
    }
    Ok(())
}

/// Clean up temporary files and directories with secure deletion
pub fn cleanup_temp_files(temp_paths: &[PathBuf]) -> Result<()> {
    for path in temp_paths {
        if path.exists() {
            if let Err(e) = secure_delete_path(path) {
                eprintln!("Warning: failed to securely delete {}: {}", path.display(), e);
                // Continue with other files even if one fails
            }
        }
    }
    Ok(())
}

/// Securely delete a file or directory
fn secure_delete_path(path: &Path) -> Result<()> {
    // Validate the path to prevent deletion of important files
    let path_str = path.to_string_lossy();
    
    // Prevent deletion of system directories or files outside expected locations
    let dangerous_paths = ["/", "/bin", "/usr", "/etc", "/var", "/sys", "/proc", "C:\\", "C:\\Windows"];
    for dangerous in &dangerous_paths {
        if path_str.starts_with(dangerous) {
            return Err(TriliumError::Security(
                format!("Refusing to delete potentially dangerous path: {}", path.display())
            ));
        }
    }
    
    // Only delete files in known temp locations
    let allowed_temp_prefixes = ["/tmp/", "/var/tmp/", "temp", ".tmp"];
    let is_in_temp = allowed_temp_prefixes.iter().any(|prefix| path_str.contains(prefix));
    
    if !is_in_temp {
        eprintln!("Warning: path {} is not in recognized temp location", path.display());
    }
    
    if path.is_file() {
        secure_delete_file(path)?;
    } else if path.is_dir() {
        secure_delete_directory(path)?;
    }
    
    Ok(())
}

/// Securely delete a single file with overwriting
fn secure_delete_file(path: &Path) -> Result<()> {
    // First try to overwrite the file with random data
    if let Ok(metadata) = fs::metadata(path) {
        let file_size = metadata.len();
        
        // Only overwrite files smaller than 100MB to avoid resource exhaustion
        if file_size < 100_000_000 {
            if let Ok(mut file) = fs::OpenOptions::new().write(true).open(path) {
                use std::io::Write;
                
                // Overwrite with zeros (simple but effective)
                let zero_chunk = vec![0u8; 8192];
                let mut remaining = file_size;
                
                while remaining > 0 {
                    let to_write = std::cmp::min(remaining, 8192);
                    if let Err(_) = file.write_all(&zero_chunk[..to_write as usize]) {
                        break; // If write fails, just proceed to delete
                    }
                    remaining -= to_write;
                }
                
                let _ = file.flush(); // Ignore flush errors
            }
        }
    }
    
    // Then delete the file
    Ok(fs::remove_file(path)
        .with_context(|| format!("Failed to remove temp file: {}", path.display()))?)
}

/// Securely delete a directory and all its contents
fn secure_delete_directory(path: &Path) -> Result<()> {
    // Recursively delete contents first
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries {
            if let Ok(entry) = entry {
                let entry_path = entry.path();
                if let Err(e) = secure_delete_path(&entry_path) {
                    eprintln!("Warning: failed to delete {}: {}", entry_path.display(), e);
                }
            }
        }
    }
    
    // Then delete the directory itself
    Ok(fs::remove_dir_all(path)
        .with_context(|| format!("Failed to remove temp directory: {}", path.display()))?)
}

/// Parse tags from content with security limits
pub fn extract_tags(content: &str) -> Vec<String> {
    let limits = ResourceLimits::default();
    
    // Limit content size to prevent resource exhaustion
    if content.len() > limits.max_content_size {
        return Vec::new();
    }
    
    // Create safe regex with error handling
    let tag_re = match Regex::new(r"#(\w{1,50})") {
        Ok(regex) => regex,
        Err(_) => return Vec::new(),
    };
    
    let mut tags = Vec::new();
    
    // Limit the number of tags extracted
    for cap in tag_re.captures_iter(content).take(100) {
        if let Some(tag_match) = cap.get(1) {
            let tag = tag_match.as_str().to_string();
            if !tag.is_empty() && tag.len() <= 50 {
                tags.push(tag);
            }
        }
        
        // Stop if we have enough tags
        if tags.len() >= limits.max_tags_count {
            break;
        }
    }
    
    tags
}

/// Scan content for potential security issues
pub fn scan_content_security(content: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    
    // Limit content size for scanning
    if content.len() > 10_000_000 { // 10MB limit for security scanning
        warnings.push("Content too large for security scanning".to_string());
        return warnings;
    }
    
    // Check for potential script injections
    let dangerous_patterns = [
        r"<script[^>]*>",
        r"javascript:",
        r"vbscript:",
        r"data:text/html",
        r"eval\s*\(",
        r"document\.write",
        r"innerHTML\s*=",
        r"onclick\s*=",
        r"onload\s*=",
    ];
    
    for pattern in &dangerous_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            if regex.is_match(content) {
                warnings.push(format!("Potentially dangerous pattern detected: {}", pattern));
            }
        }
    }
    
    // Check for suspicious file paths
    if content.contains("../") || content.contains("..\\") {
        warnings.push("Potential path traversal detected in content".to_string());
    }
    
    // Check for potential data exfiltration attempts
    let data_patterns = [
        r"https?://[^\s]+",
        r"ftp://[^\s]+",
        r"file://[^\s]+",
    ];
    
    let mut url_count = 0;
    for pattern in &data_patterns {
        if let Ok(regex) = Regex::new(pattern) {
            url_count += regex.find_iter(content).count();
        }
    }
    
    if url_count > 50 {
        warnings.push(format!("High number of URLs detected: {} (potential data exfiltration)", url_count));
    }
    
    warnings
}

/// Convert relative paths to absolute paths
pub fn resolve_path(path: &Path, base_dir: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        base_dir.join(path)
    }
}

/// Batch process items with a callback function
pub async fn batch_process<T, F, Fut, R>(
    items: Vec<T>,
    batch_size: usize,
    mut processor: F,
) -> Vec<Result<R>>
where
    T: Clone,
    F: FnMut(T) -> Fut,
    Fut: std::future::Future<Output = Result<R>>,
{
    let mut results = Vec::with_capacity(items.len());
    
    for chunk in items.chunks(batch_size) {
        let mut batch_results = Vec::new();
        
        for item in chunk {
            // Process items in the batch sequentially to avoid overwhelming the API
            batch_results.push(processor(item.clone()).await);
        }
        
        results.extend(batch_results);
        
        // Small delay between batches
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }
    
    results
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("Hello World"), "Hello World");
        assert_eq!(sanitize_filename("Hello/World<>:\""), "Hello_World___");
        assert_eq!(sanitize_filename("   .test.   "), "test");
    }

    #[test]
    fn test_extract_title_from_content() {
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
    fn test_normalize_title() {
        assert_eq!(normalize_title("  Hello World!  "), "hello world");
        assert_eq!(normalize_title("Test-123"), "test 123");
    }

    #[test]
    fn test_should_ignore_file() {
        let path = Path::new(".git/config");
        assert!(should_ignore_file(path, &[]));
        
        let path = Path::new("important.md");
        assert!(!should_ignore_file(path, &[]));
    }

    #[tokio::test]
    async fn test_batch_process() {
        let items = vec![1, 2, 3, 4, 5];
        let results = batch_process(items, 2, |item| async move {
            Ok::<i32, anyhow::Error>(item * 2)
        }).await;
        
        assert_eq!(results.len(), 5);
        assert_eq!(results[0].as_ref().unwrap(), &2);
        assert_eq!(results[4].as_ref().unwrap(), &10);
    }
}