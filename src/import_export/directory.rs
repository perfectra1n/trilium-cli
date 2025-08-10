use crate::api::client::TriliumClient;
use crate::error::{TriliumError, Result};
use crate::models::{Note, CreateNoteRequest, CreateAttributeRequest};
use crate::import_export::{ImportResult, ImportExportConfig};
use crate::import_export::utils::{
    detect_file_type, sanitize_filename, extract_title_from_content, 
    create_progress_bar, should_ignore_file, calculate_file_checksum,
    normalize_title, validate_directory
};
use crate::utils::resource_limits::ResourceLimits;
use anyhow::Context;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use walkdir::WalkDir;

/// Import a directory structure into Trilium with resource limits
pub async fn import_directory(
    client: &TriliumClient,
    dir_path: &Path,
    parent_note_id: &str,
    max_depth: Option<usize>,
    file_patterns: Vec<String>,
    dry_run: bool,
) -> Result<ImportResult> {
    let limits = ResourceLimits::default();
    let start_time = Instant::now();
    let timeout = Duration::from_secs(limits.max_timeout_seconds);
    
    let mut result = ImportResult::new();
    let config = ImportExportConfig::default();
    
    validate_directory(dir_path)?;

    // Find all files to import with limits
    let files = find_files_to_import(dir_path, max_depth, &file_patterns, &config)?;
    
    // Enforce file count limits
    if files.len() > 50000 {
        return Err(TriliumError::ValidationError(format!("Too many files to import: {} (max: 50000)", files.len())));
    }
    
    let progress = create_progress_bar(files.len() as u64, "Importing files");

    // Create directory root note
    let dir_root_id = if !dry_run {
        let dir_name = dir_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Imported Directory");
            
        let create_request = CreateNoteRequest {
            parent_note_id: parent_note_id.to_string(),
            title: format!("📂 {}", dir_name),
            note_type: "text".to_string(),
            content: format!("Imported directory from: {}\n\nImported on: {}", 
                dir_path.display(), chrono::Utc::now().format("%Y-%m-%d %H:%M:%S")),
            note_position: None,
            prefix: None,
            is_expanded: Some(true),
            is_protected: None,
        };
        
        let note = client.create_note(create_request).await?;
        note.note_id
    } else {
        format!("dry-run-dir-{}", chrono::Utc::now().timestamp())
    };

    // Build directory structure mapping
    let mut dir_note_map = HashMap::new();
    dir_note_map.insert(dir_path.to_path_buf(), dir_root_id.clone());

    // Track duplicates
    let mut checksum_map: HashMap<String, String> = HashMap::new();
    let mut title_map: HashMap<String, String> = HashMap::new();

    // Process each file with timeout and resource tracking
    for (index, file_info) in files.iter().enumerate() {
        // Check timeout
        if start_time.elapsed() > timeout {
            result.add_error("Import timeout reached, stopping processing".to_string());
            break;
        }
        
        // Check total size limits
        if result.summary.total_size_bytes > 1_000_000_000u64 { // 1GB limit
            result.add_error("Total import size limit exceeded (1GB)".to_string());
            break;
        }
        
        progress.inc(1);
        progress.set_message(format!("Processing {} ({}/{})", 
            file_info.path.file_name().unwrap_or_default().to_string_lossy(),
            index + 1,
            files.len()));
        
        match process_file_with_limits(
            &file_info,
            dir_path,
            client,
            &mut dir_note_map,
            &mut checksum_map,
            &mut title_map,
            &config,
            dry_run
        ).await {
            Ok(_) => {
                result.notes_imported += 1;
                result.files_processed += 1;
                
                // Track file type
                if let Some(file_type) = &file_info.file_type {
                    *result.summary.note_types.entry(file_type.clone()).or_insert(0) += 1;
                }
                
                result.summary.total_size_bytes += file_info.size;
            }
            Err(e) => {
                result.add_error(format!("Failed to import {}: {}", file_info.path.display(), e));
                // Continue processing other files instead of stopping
            }
        }
        
        // Add small delay between files to prevent resource exhaustion
        if index % 100 == 0 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    // Count directories processed
    result.directories_processed = dir_note_map.len();

    progress.finish_with_message("Import completed");
    result.finalize();
    Ok(result)
}

#[derive(Debug, Clone)]
struct FileInfo {
    path: PathBuf,
    relative_path: PathBuf,
    file_type: Option<String>,
    size: u64,
    modified: std::time::SystemTime,
}

/// Find all files to import based on patterns and filters with resource limits
fn find_files_to_import(
    dir_path: &Path,
    max_depth: Option<usize>,
    file_patterns: &[String],
    config: &ImportExportConfig,
) -> Result<Vec<FileInfo>> {
    let limits = ResourceLimits::default();
    let start_time = Instant::now();
    let timeout = Duration::from_secs(30); // 30 second timeout for directory traversal
    
    let mut files = Vec::new();
    let mut total_size = 0u64;
    let mut file_count = 0usize;
    
    // Limit max depth to prevent excessive recursion
    let safe_depth = match max_depth {
        Some(d) if d > 20 => 20, // Cap at 20 levels deep
        Some(d) => d,
        None => 10, // Default to 10 levels
    };
    
    let mut walker = WalkDir::new(dir_path)
        .follow_links(false)
        .max_depth(safe_depth)
        .into_iter();
    
    for entry_result in walker {
        // Check timeout
        if start_time.elapsed() > timeout {
            return Err(TriliumError::InvalidInput(
                "Directory traversal timeout reached".to_string()
            ));
        }
        
        // Check file count limit
        if file_count > 50000 {
            return Err(TriliumError::InvalidInput(
                format!("Too many files found: {} (max: 50000)", file_count)
            ));
        }
        
        let entry = entry_result.map_err(|e| {
            eprintln!("Error accessing directory entry: {}", e);
            e
        })?;
        
        let path = entry.path();
        
        if !path.is_file() {
            continue;
        }
        
        file_count += 1;

        // Check if file should be ignored
        if should_ignore_file(path, &[]) {
            continue;
        }

        // Check file size with enhanced limits
        let metadata = fs::metadata(path)?;
        let file_size = metadata.len();
        
        // Check individual file size
        if file_size > (config.max_file_size_mb * 1024 * 1024) as u64 {
            eprintln!("Skipping large file: {} ({} bytes)", path.display(), file_size);
            continue;
        }
        
        // Check total size accumulation
        total_size = total_size.saturating_add(file_size);
        if total_size > 2_000_000_000u64 { // 2GB total limit for discovery
            return Err(TriliumError::InvalidInput(
                format!("Total directory size too large: {} bytes (max: 2GB)", total_size)
            ));
        }

        // Check file extension
        let file_type = detect_file_type(path);
        if let Some(ref ft) = file_type {
            if !config.supported_extensions.is_empty() 
                && !config.supported_extensions.contains(ft) {
                continue;
            }
        }

        // Check patterns
        if !file_patterns.is_empty() {
            let matches_pattern = file_patterns.iter().any(|pattern| {
                if let Ok(glob_pattern) = glob::Pattern::new(pattern) {
                    glob_pattern.matches(&path.to_string_lossy())
                } else {
                    path.to_string_lossy().contains(pattern)
                }
            });
            
            if !matches_pattern {
                continue;
            }
        }

        let relative_path = path.strip_prefix(dir_path)
            .unwrap_or(path)
            .to_path_buf();

        files.push(FileInfo {
            path: path.to_path_buf(),
            relative_path,
            file_type,
            size: file_size,
            modified: metadata.modified().unwrap_or(std::time::UNIX_EPOCH),
        });
    }

    Ok(files)
}

/// Process a single file with resource limits
async fn process_file_with_limits(
    file_info: &FileInfo,
    dir_root: &Path,
    client: &TriliumClient,
    dir_note_map: &mut HashMap<PathBuf, String>,
    checksum_map: &mut HashMap<String, String>,
    title_map: &mut HashMap<String, String>,
    config: &ImportExportConfig,
    dry_run: bool,
) -> Result<String> {
    let limits = ResourceLimits::default();
    
    // Additional file size validation
    if file_info.size > limits.max_content_size as u64 {
        return Err(TriliumError::ContentTooLarge { 
            size: file_info.size as usize, 
            limit: limits.max_content_size 
        });
    }
    
    // Read file content with streaming for large files
    let content = match file_info.file_type.as_deref() {
        Some("image") | Some("pdf") => {
            // For binary files, we'll create a placeholder note
            format!("Binary file: {}\nSize: {} bytes\nType: {}", 
                file_info.path.display(),
                file_info.size,
                file_info.file_type.as_deref().unwrap_or("unknown")
            )
        }
        _ => {
            // Try to read as text with size limits
            if file_info.size > 1_000_000 { // 1MB limit for text files
                format!("Large text file ({}): {}\nSize: {} bytes\nContent not loaded due to size limits", 
                    file_info.file_type.as_deref().unwrap_or("unknown"),
                    file_info.path.display(), 
                    file_info.size)
            } else {
                match fs::read_to_string(&file_info.path) {
                    Ok(content) => {
                        // Validate content size after reading
                        if content.len() > limits.max_content_size {
                            format!("Content truncated - file too large after reading\nOriginal size: {} bytes", content.len())
                        } else {
                            content
                        }
                    },
                    Err(_) => {
                        // If it fails, treat as binary
                        format!("Binary file: {}\nSize: {} bytes", 
                            file_info.path.display(), file_info.size)
                    }
                }
            }
        }
    };

    // Check for duplicates with size limits
    if file_info.size < 10_000_000 { // Only checksum files under 10MB
        if let Ok(checksum) = calculate_file_checksum(&file_info.path) {
            if let Some(existing_note_id) = checksum_map.get(&checksum) {
                match config.handle_duplicates {
                    crate::import_export::DuplicateHandling::Skip => {
                        return Ok(existing_note_id.clone());
                    }
                    crate::import_export::DuplicateHandling::Rename => {
                        // Will handle renaming below
                    }
                    _ => {
                        // Continue with import
                    }
                }
            } else {
                // Limit checksum map size to prevent memory exhaustion
                if checksum_map.len() < 100000 {
                    checksum_map.insert(checksum, String::new()); // Will update with note ID later
                }
            }
        }
    }

    // Extract title
    let base_title = file_info.path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled");
    
    let mut title = match file_info.file_type.as_deref() {
        Some("markdown") | Some("text") | Some("html") => {
            extract_title_from_content(&content, base_title)
        }
        _ => base_title.to_string(),
    };

    // Handle duplicate titles
    let normalized_title = normalize_title(&title);
    if title_map.contains_key(&normalized_title) {
        match config.handle_duplicates {
            crate::import_export::DuplicateHandling::Skip => {
                return Ok(title_map[&normalized_title].clone());
            }
            crate::import_export::DuplicateHandling::Rename => {
                let mut counter = 1;
                loop {
                    let new_title = format!("{} ({})", title, counter);
                    let new_normalized = normalize_title(&new_title);
                    if !title_map.contains_key(&new_normalized) {
                        title = new_title;
                        break;
                    }
                    counter += 1;
                }
            }
            _ => {
                // Continue with original title
            }
        }
    }

    // Get or create parent note for directory
    let parent_dir = file_info.path.parent().unwrap_or(dir_root);
    let parent_note_id = ensure_directory_note(parent_dir, dir_root, client, dir_note_map, dry_run).await?;

    if dry_run {
        println!("Would import: {} -> {}", file_info.path.display(), title);
        let note_id = format!("dry-run-file-{}", chrono::Utc::now().timestamp_nanos());
        title_map.insert(normalize_title(&title), note_id.clone());
        return Ok(note_id);
    }

    // Determine note type
    let note_type = match file_info.file_type.as_deref() {
        Some("markdown") => "text",
        Some("code") => "code", 
        Some("html") => "html",
        Some("image") => "image",
        _ => "text",
    };

    // Create the note
    let create_request = CreateNoteRequest {
        parent_note_id,
        title: title.clone(),
        note_type: note_type.to_string(),
        content: content.clone(),
        note_position: None,
        prefix: None,
        is_expanded: None,
        is_protected: None,
    };

    let note = client.create_note(create_request).await?;

    // Add metadata attributes
    add_file_metadata(client, &note.note_id, file_info).await?;

    // Update maps
    title_map.insert(normalize_title(&title), note.note_id.clone());
    if let Ok(checksum) = calculate_file_checksum(&file_info.path) {
        checksum_map.insert(checksum, note.note_id.clone());
    }

    Ok(note.note_id)
}

/// Ensure a directory note exists for the given path
async fn ensure_directory_note(
    dir_path: &Path,
    dir_root: &Path,
    client: &TriliumClient,
    dir_note_map: &mut HashMap<PathBuf, String>,
    dry_run: bool,
) -> Result<String> {
    if let Some(note_id) = dir_note_map.get(dir_path) {
        return Ok(note_id.clone());
    }

    if dir_path == dir_root {
        // Should already be in the map
        return Err(TriliumError::ValidationError("Directory root not found in directory map".to_string()));
    }

    // Ensure parent directory exists first
    let parent_dir = dir_path.parent().unwrap_or(dir_root);
    let parent_note_id = Box::pin(ensure_directory_note(parent_dir, dir_root, client, dir_note_map, dry_run)).await?;

    let dir_name = dir_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown Directory");

    if dry_run {
        let note_id = format!("dry-run-dir-{}", chrono::Utc::now().timestamp_millis());
        dir_note_map.insert(dir_path.to_path_buf(), note_id.clone());
        return Ok(note_id);
    }

    let create_request = CreateNoteRequest {
        parent_note_id,
        title: format!("📁 {}", dir_name),
        note_type: "text".to_string(),
        content: format!("Directory: {}", dir_path.display()),
        note_position: None,
        prefix: None,
        is_expanded: Some(true),
        is_protected: None,
    };

    let note = client.create_note(create_request).await?;
    dir_note_map.insert(dir_path.to_path_buf(), note.note_id.clone());
    
    Ok(note.note_id)
}

/// Add file metadata as attributes
async fn add_file_metadata(
    client: &TriliumClient,
    note_id: &str,
    file_info: &FileInfo,
) -> Result<()> {
    let attributes = vec![
        ("originalPath", file_info.path.to_string_lossy().to_string()),
        ("fileSize", file_info.size.to_string()),
        ("importedFrom", "directory".to_string()),
        ("importDate", chrono::Utc::now().to_rfc3339()),
    ];

    // Add file type if available
    let mut all_attributes = attributes;
    if let Some(file_type) = &file_info.file_type {
        all_attributes.push(("fileType", file_type.clone()));
    }

    // Add file extension
    if let Some(ext) = file_info.path.extension().and_then(|e| e.to_str()) {
        all_attributes.push(("fileExtension", ext.to_string()));
    }

    for (name, value) in all_attributes {
        let create_attr_request = CreateAttributeRequest {
            note_id: note_id.to_string(),
            attr_type: "label".to_string(),
            name: name.to_string(),
            value,
            is_inheritable: None,
            position: None,
        };

        if let Err(e) = client.create_attribute(create_attr_request).await {
            eprintln!("Failed to create attribute {}: {}", name, e);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_find_files_to_import() {
        let temp_dir = tempdir().unwrap();
        let temp_path = temp_dir.path();

        // Create test files
        fs::write(temp_path.join("test.md"), "# Test").unwrap();
        fs::write(temp_path.join("test.txt"), "Text content").unwrap();
        fs::create_dir(temp_path.join("subdir")).unwrap();
        fs::write(temp_path.join("subdir/nested.md"), "# Nested").unwrap();

        let config = ImportExportConfig::default();
        let files = find_files_to_import(temp_path, None, &[], &config).unwrap();

        assert!(files.len() >= 3);
        assert!(files.iter().any(|f| f.path.file_name().unwrap() == "test.md"));
        assert!(files.iter().any(|f| f.path.file_name().unwrap() == "nested.md"));
    }

    #[test]
    fn test_file_info_creation() {
        let temp_dir = tempdir().unwrap();
        let temp_path = temp_dir.path();
        let test_file = temp_path.join("test.md");
        fs::write(&test_file, "# Test Content").unwrap();

        let file_type = detect_file_type(&test_file);
        assert_eq!(file_type, Some("markdown".to_string()));

        let metadata = fs::metadata(&test_file).unwrap();
        assert!(metadata.len() > 0);
    }
}