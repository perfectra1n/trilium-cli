use crate::api::client::TriliumClient;
use crate::error::{TriliumError, Result};
use crate::models::{Note, CreateNoteRequest, CreateAttributeRequest};
use crate::import_export::{ImportResult, ExportResult, ImportExportConfig};
use crate::import_export::utils::{
    sanitize_filename, extract_title_from_content, create_progress_bar, 
    normalize_title
};
use crate::utils::resource_limits::ResourceLimits;
use anyhow::Context;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, BufReader};
use std::path::{Path, PathBuf, Component};
use zip::ZipArchive;

/// Import a Notion export (ZIP format) into Trilium
pub async fn import_export(
    client: &TriliumClient,
    zip_path: &Path,
    parent_note_id: &str,
    dry_run: bool,
) -> Result<ImportResult> {
    let mut result = ImportResult::new();
    let config = ImportExportConfig::default();
    
    if !zip_path.exists() {
        return Err(TriliumError::NotFound(format!("Notion export file does not exist: {}", zip_path.display())));
    }

    // Extract the ZIP file
    let temp_dir = extract_notion_zip(zip_path)?;
    
    // Find all Notion files to import
    let notion_files = find_notion_files(&temp_dir)?;
    let progress = create_progress_bar(notion_files.len() as u64, "Importing Notion pages");

    // Create Notion import root note
    let notion_root_id = if !dry_run {
        let zip_name = zip_path.file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or("Notion Export");
            
        let create_request = CreateNoteRequest {
            parent_note_id: parent_note_id.to_string(),
            title: format!("🗂️ {}", zip_name),
            note_type: "text".to_string(),
            content: format!("Imported Notion export from: {}\n\nImported on: {}", 
                zip_path.display(), chrono::Utc::now().format("%Y-%m-%d %H:%M:%S")),
            note_position: None,
            prefix: None,
            is_expanded: Some(true),
            is_protected: None,
        };
        
        let note = client.create_note(create_request).await?;
        note.note_id
    } else {
        format!("dry-run-notion-{}", chrono::Utc::now().timestamp())
    };

    // Build file structure mapping
    let mut page_id_map = HashMap::new();
    let mut title_id_map = HashMap::new();

    // Process each Notion file
    for notion_file in notion_files {
        progress.inc(1);
        progress.set_message(format!("Processing {}", notion_file.title));
        
        match process_notion_file(
            &notion_file, 
            client, 
            &notion_root_id,
            &mut page_id_map,
            &mut title_id_map,
            &config, 
            dry_run
        ).await {
            Ok(_) => {
                result.notes_imported += 1;
                result.files_processed += 1;
                
                // Track content type
                *result.summary.note_types.entry("notion".to_string()).or_insert(0) += 1;
                result.summary.total_size_bytes += notion_file.size;
            }
            Err(e) => {
                result.add_error(format!("Failed to import {}: {}", notion_file.title, e));
            }
        }
    }

    // Clean up temporary directory
    if let Err(e) = fs::remove_dir_all(&temp_dir) {
        result.add_error(format!("Failed to clean up temp directory: {}", e));
    }

    progress.finish_with_message("Import completed");
    result.finalize();
    Ok(result)
}

/// Export Trilium notes to Notion-compatible format
pub async fn export_notes(
    client: &TriliumClient,
    note_id: &str,
    output_path: &Path,
    dry_run: bool,
) -> Result<ExportResult> {
    let mut result = ExportResult::new("notion".to_string());
    
    if !dry_run {
        fs::create_dir_all(output_path)
            .with_context(|| format!("Failed to create output directory: {}", output_path.display()))?;
    }

    // Get the root note and all descendants
    let notes = collect_notes_recursive(client, note_id).await?;
    let progress = create_progress_bar(notes.len() as u64, "Exporting to Notion format");

    // Export each note
    for note in notes {
        progress.inc(1);
        progress.set_message(format!("Exporting {}", note.title));
        
        match export_note_to_notion(&note, client, output_path, dry_run).await {
            Ok(_) => {
                result.notes_exported += 1;
                result.files_created += 1;
            }
            Err(e) => {
                result.add_error(format!("Failed to export note {}: {}", note.note_id, e));
            }
        }
    }

    progress.finish_with_message("Export completed");
    result.finalize();
    Ok(result)
}

#[derive(Debug, Clone)]
struct NotionFile {
    path: PathBuf,
    title: String,
    content: String,
    properties: Option<Value>,
    blocks: Vec<NotionBlock>,
    size: u64,
    created_time: Option<String>,
    last_edited_time: Option<String>,
}

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
struct NotionBlock {
    #[serde(rename = "type")]
    block_type: String,
    content: Option<String>,
    children: Option<Vec<NotionBlock>>,
    properties: Option<Value>,
}

/// Extract Notion ZIP export with security controls
fn extract_notion_zip(zip_path: &Path) -> Result<PathBuf> {
    let limits = ResourceLimits::default();
    let max_extraction_size = 500_000_000u64; // 500MB total extraction limit
    let max_file_size = 50_000_000u64; // 50MB per file limit
    let max_compression_ratio = 100u64; // Max 100:1 compression ratio
    let max_files = 10000u64; // Maximum number of files to extract
    
    let file = fs::File::open(zip_path)
        .with_context(|| format!("Failed to open ZIP file: {}", zip_path.display()))?;
    
    let mut archive = ZipArchive::new(file)?;
    let temp_dir_handle = tempfile::tempdir()
        .context("Failed to create temporary directory")?;
    let temp_dir = temp_dir_handle.path().to_path_buf();
    
    if archive.len() > max_files as usize {
        return Err(TriliumError::ValidationError(format!("ZIP file contains too many files: {} (max: {})", archive.len(), max_files)));
    }
    
    let mut total_extracted_size = 0u64;
    
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let file_name = file.name().to_string();
        
        // Validate file path to prevent directory traversal
        let sanitized_path = validate_zip_entry_path(&file_name, &temp_dir)?;
        
        // Check file size limits
        let compressed_size = file.compressed_size();
        let uncompressed_size = file.size();
        
        if uncompressed_size > max_file_size {
            return Err(TriliumError::ContentTooLarge { size: uncompressed_size as usize, limit: max_file_size as usize });
        }
        
        // Check compression ratio to detect zip bombs
        if compressed_size > 0 {
            let compression_ratio = uncompressed_size / compressed_size;
            if compression_ratio > max_compression_ratio {
                return Err(TriliumError::SecurityError(format!("Suspicious compression ratio for {}: {}:1 (max: {}:1)", 
                     file_name, compression_ratio, max_compression_ratio)));
            }
        }
        
        // Check total extraction size
        total_extracted_size = total_extracted_size.saturating_add(uncompressed_size);
        if total_extracted_size > max_extraction_size {
            return Err(TriliumError::InvalidInput(
                format!("Total extraction size too large: {} bytes (max: {})", 
                       total_extracted_size, max_extraction_size)
            ));
        }
        
        if file_name.ends_with('/') {
            // Directory entry
            fs::create_dir_all(&sanitized_path)?;
        } else {
            // File entry
            if let Some(parent) = sanitized_path.parent() {
                fs::create_dir_all(parent)?;
            }
            
            // Use limited reader to prevent memory exhaustion
            let mut reader = BufReader::new(file.take(max_file_size));
            let mut outfile = fs::File::create(&sanitized_path)?;
            
            // Copy with size tracking to prevent zip bombs
            let mut buffer = [0; 8192];
            let mut bytes_written = 0u64;
            
            loop {
                let bytes_read = reader.read(&mut buffer)?;
                if bytes_read == 0 {
                    break;
                }
                
                bytes_written = bytes_written.saturating_add(bytes_read as u64);
                if bytes_written > uncompressed_size {
                    return Err(TriliumError::InvalidInput(
                        format!("File {} exceeded expected size during extraction", file_name)
                    ));
                }
                
                std::io::Write::write_all(&mut outfile, &buffer[..bytes_read])?;
            }
            
            if bytes_written != uncompressed_size {
                return Err(TriliumError::InvalidInput(
                    format!("File {} size mismatch: expected {}, got {}", 
                           file_name, uncompressed_size, bytes_written)
                ));
            }
        }
    }
    
    Ok(temp_dir)
}

/// Validate ZIP entry path to prevent directory traversal attacks
fn validate_zip_entry_path(entry_path: &str, base_dir: &Path) -> Result<PathBuf> {
    // Normalize the path and check for dangerous patterns
    let path = Path::new(entry_path);
    
    // Check for absolute paths
    if path.is_absolute() {
        return Err(TriliumError::Security(
            format!("Absolute paths not allowed in ZIP entries: {}", entry_path)
        ));
    }
    
    // Check each component for traversal attempts
    let mut result_path = base_dir.to_path_buf();
    for component in path.components() {
        match component {
            Component::Normal(name) => {
                // Convert to string for validation
                let name_str = name.to_string_lossy();
                
                // Check for suspicious patterns
                if name_str.contains("..") || name_str.starts_with('.') && name_str.len() > 1 {
                    return Err(TriliumError::Security(
                        format!("Suspicious path component in ZIP entry: {}", name_str)
                    ));
                }
                
                // Sanitize the filename
                let sanitized = sanitize_filename(&name_str);
                if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
                    return Err(TriliumError::InvalidInput(
                        format!("Invalid filename after sanitization: {}", name_str)
                    ));
                }
                
                result_path.push(sanitized);
            }
            Component::CurDir => {
                // Skip current directory references
                continue;
            }
            Component::ParentDir => {
                return Err(TriliumError::Security(
                    format!("Parent directory traversal not allowed: {}", entry_path)
                ));
            }
            _ => {
                return Err(TriliumError::InvalidInput(
                    format!("Unsupported path component in ZIP entry: {}", entry_path)
                ));
            }
        }
    }
    
    // Ensure the final path is still within the base directory
    let canonical_base = base_dir.canonicalize()
        .with_context(|| format!("Failed to canonicalize base directory: {}", base_dir.display()))?;
    
    // For safety, check that the path would be within bounds if it existed
    if let Some(parent) = result_path.parent() {
        if !parent.starts_with(&canonical_base) {
            return Err(TriliumError::Security(
                format!("Path traversal attempt detected: {}", entry_path)
            ));
        }
    }
    
    Ok(result_path)
}

/// Find all Notion files in the extracted directory
fn find_notion_files(dir_path: &Path) -> Result<Vec<NotionFile>> {
    let mut files = Vec::new();
    
    for entry in walkdir::WalkDir::new(dir_path).follow_links(false) {
        let entry = entry?;
        let path = entry.path();
        
        if !path.is_file() {
            continue;
        }

        // Look for markdown files (Notion exports to markdown)
        if let Some(ext) = path.extension() {
            if ext == "md" {
                if let Ok(notion_file) = parse_notion_file(path) {
                    files.push(notion_file);
                }
            }
        }
        
        // Look for CSV files (database exports)
        if let Some(ext) = path.extension() {
            if ext == "csv" {
                if let Ok(notion_file) = parse_notion_csv(path) {
                    files.push(notion_file);
                }
            }
        }
    }
    
    Ok(files)
}

/// Parse a Notion markdown file with size limits
fn parse_notion_file(path: &Path) -> Result<NotionFile> {
    let limits = ResourceLimits::default();
    let max_file_size = limits.max_content_size as u64;
    
    let metadata = fs::metadata(path)?;
    let size = metadata.len();
    
    // Check file size before reading
    if size > max_file_size {
        return Err(TriliumError::InvalidInput(
            format!("File too large: {} ({} bytes, max: {})", 
                   path.display(), size, max_file_size)
        ));
    }
    
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read file: {}", path.display()))?;
    
    // Extract title from filename or content
    let title = extract_notion_title(path, &content);
    
    // Parse Notion blocks (simplified)
    let blocks = parse_notion_blocks(&content);
    
    Ok(NotionFile {
        path: path.to_path_buf(),
        title,
        content: content.clone(),
        properties: None,
        blocks,
        size,
        created_time: None,
        last_edited_time: None,
    })
}

/// Parse a Notion CSV file (database export) with size limits
fn parse_notion_csv(path: &Path) -> Result<NotionFile> {
    let limits = ResourceLimits::default();
    let max_file_size = limits.max_content_size as u64;
    
    let metadata = fs::metadata(path)?;
    let size = metadata.len();
    
    // Check file size before reading
    if size > max_file_size {
        return Err(TriliumError::InvalidInput(
            format!("File too large: {} ({} bytes, max: {})", 
                   path.display(), size, max_file_size)
        ));
    }
    
    let content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read CSV file: {}", path.display()))?;
    
    let title = format!("📊 {}", path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Database"));
    
    // Convert CSV to markdown table
    let table_content = convert_csv_to_markdown(&content)?;
    
    Ok(NotionFile {
        path: path.to_path_buf(),
        title,
        content: table_content,
        properties: None,
        blocks: vec![],
        size,
        created_time: None,
        last_edited_time: None,
    })
}

/// Extract title from Notion file
fn extract_notion_title(path: &Path, content: &str) -> String {
    // Try to extract from first heading
    let title = extract_title_from_content(content, "");
    if !title.is_empty() {
        return title;
    }
    
    // Use filename
    path.file_stem()
        .and_then(|s| s.to_str())
        .map(|s| {
            // Clean up Notion's file naming
            s.replace("%20", " ")
             .replace("_", " ")
             .trim()
             .to_string()
        })
        .unwrap_or_else(|| "Untitled".to_string())
}

/// Parse Notion blocks from markdown content
fn parse_notion_blocks(content: &str) -> Vec<NotionBlock> {
    let mut blocks = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        
        if line.starts_with('#') {
            // Heading block
            let level = line.chars().take_while(|&c| c == '#').count();
            let text = line.trim_start_matches('#').trim();
            blocks.push(NotionBlock {
                block_type: format!("heading_{}", level),
                content: Some(text.to_string()),
                children: None,
                properties: None,
            });
        } else if line.starts_with("- ") || line.starts_with("* ") {
            // List item
            let text = line.trim_start_matches(&['-', '*'][..]).trim();
            blocks.push(NotionBlock {
                block_type: "bulleted_list_item".to_string(),
                content: Some(text.to_string()),
                children: None,
                properties: None,
            });
        } else if line.starts_with("```") {
            // Code block
            let mut code_content = String::new();
            i += 1; // Skip opening ```
            
            while i < lines.len() && !lines[i].trim().starts_with("```") {
                code_content.push_str(lines[i]);
                code_content.push('\n');
                i += 1;
            }
            
            blocks.push(NotionBlock {
                block_type: "code".to_string(),
                content: Some(code_content),
                children: None,
                properties: None,
            });
        } else if !line.is_empty() {
            // Paragraph
            blocks.push(NotionBlock {
                block_type: "paragraph".to_string(),
                content: Some(line.to_string()),
                children: None,
                properties: None,
            });
        }
        
        i += 1;
    }
    
    blocks
}

/// Convert CSV content to markdown table with security controls
fn convert_csv_to_markdown(csv_content: &str) -> Result<String> {
    let limits = ResourceLimits::default();
    
    // Limit CSV content size
    if csv_content.len() > limits.max_content_size {
        return Err(TriliumError::InvalidInput(
            format!("CSV content too large: {} bytes (max: {})", 
                   csv_content.len(), limits.max_content_size)
        ));
    }
    
    let mut lines = csv_content.lines().take(10000); // Limit number of lines
    let header = lines.next().unwrap_or("");
    let header_cols: Vec<&str> = header.split(',').take(100).map(|s| s.trim()).collect(); // Limit columns
    
    if header_cols.is_empty() {
        return Ok(csv_content.to_string());
    }
    
    let mut markdown = String::new();
    
    // Header row
    markdown.push_str("| ");
    markdown.push_str(&header_cols.join(" | "));
    markdown.push_str(" |\n");
    
    // Separator row
    markdown.push_str("| ");
    markdown.push_str(&vec!["---"; header_cols.len()].join(" | "));
    markdown.push_str(" |\n");
    
    // Data rows
    for line in lines {
        let cols: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        if cols.len() == header_cols.len() {
            markdown.push_str("| ");
            markdown.push_str(&cols.join(" | "));
            markdown.push_str(" |\n");
        }
    }
    
    Ok(markdown)
}

/// Process a single Notion file
async fn process_notion_file(
    notion_file: &NotionFile,
    client: &TriliumClient,
    parent_note_id: &str,
    _page_id_map: &mut HashMap<String, String>,
    title_id_map: &mut HashMap<String, String>,
    _config: &ImportExportConfig,
    dry_run: bool,
) -> Result<String> {
    let title = notion_file.title.clone();
    let content = convert_notion_to_trilium(&notion_file.content);

    if dry_run {
        println!("Would import Notion page: {}", title);
        let note_id = format!("dry-run-notion-{}", chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0));
        title_id_map.insert(normalize_title(&title), note_id.clone());
        return Ok(note_id);
    }

    // Create the note
    let create_request = CreateNoteRequest {
        parent_note_id: parent_note_id.to_string(),
        title: title.clone(),
        note_type: "text".to_string(),
        content,
        note_position: None,
        prefix: None,
        is_expanded: None,
        is_protected: None,
    };

    let note = client.create_note(create_request).await?;

    // Add Notion-specific metadata
    add_notion_metadata(client, &note.note_id, notion_file).await?;

    // Update maps
    title_id_map.insert(normalize_title(&title), note.note_id.clone());
    
    Ok(note.note_id)
}

/// Convert Notion-specific syntax to Trilium format with security controls
fn convert_notion_to_trilium(content: &str) -> String {
    let limits = ResourceLimits::default();
    
    // Limit content size to prevent memory exhaustion
    if content.len() > limits.max_content_size {
        return format!("Content too large ({} bytes, max: {}) - truncated", 
                      content.len(), limits.max_content_size);
    }
    
    let mut converted = content.to_string();
    
    // Use timeout-protected regex with limited complexity
    match create_safe_regex(r">[!(\w{1,50})]\s*(.{0,500})") {
        Ok(callout_re) => {
            converted = callout_re.replace_all(&converted, |caps: &regex::Captures| {
                let callout_type = caps.get(1).map_or("", |m| m.as_str());
                let text = caps.get(2).map_or("", |m| m.as_str());
                format!("**{}:** {}", callout_type.to_uppercase(), text)
            }).to_string();
        }
        Err(e) => {
            eprintln!("Failed to create callout regex: {}", e);
        }
    }
    
    // Convert Notion toggles with limited complexity
    match create_safe_regex(r"<details>\s*<summary>(.{0,200}?)</summary>\s*(.{0,1000}?)</details>") {
        Ok(toggle_re) => {
            converted = toggle_re.replace_all(&converted, |caps: &regex::Captures| {
                let summary = caps.get(1).map_or("", |m| m.as_str());
                let content = caps.get(2).map_or("", |m| m.as_str());
                format!("### {}\n\n{}", summary, content)
            }).to_string();
        }
        Err(e) => {
            eprintln!("Failed to create toggle regex: {}", e);
        }
    }
    
    converted
}

/// Create a regex with safety limits to prevent ReDoS attacks
fn create_safe_regex(pattern: &str) -> Result<regex::Regex> {
    let limits = ResourceLimits::default();
    
    if pattern.len() > limits.max_regex_pattern_length {
        return Err(TriliumError::InvalidInput(
            format!("Regex pattern too long: {} characters (max: {})", 
                   pattern.len(), limits.max_regex_pattern_length)
        ));
    }
    
    // Check for dangerous patterns that could cause ReDoS
    if pattern.contains("(.*)*") || pattern.contains("(.+)+") || pattern.contains("(.*)+") {
        return Err(TriliumError::Security(
            format!("Potentially dangerous regex pattern detected: {}", pattern)
        ));
    }
    
    Ok(regex::RegexBuilder::new(pattern)
        .size_limit(10 * 1024 * 1024) // 10MB size limit
        .dfa_size_limit(10 * 1024 * 1024) // 10MB DFA size limit
        .build()
        .with_context(|| format!("Failed to compile regex: {}", pattern))?)
}

/// Add Notion-specific metadata as attributes
async fn add_notion_metadata(
    client: &TriliumClient,
    note_id: &str,
    notion_file: &NotionFile,
) -> Result<()> {
    let attributes = vec![
        ("importedFrom", "notion".to_string()),
        ("originalPath", notion_file.path.to_string_lossy().to_string()),
        ("fileSize", notion_file.size.to_string()),
        ("importDate", chrono::Utc::now().to_rfc3339()),
        ("blockCount", notion_file.blocks.len().to_string()),
    ];

    for (name, value) in attributes {
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

/// Collect all notes recursively from a root note
async fn collect_notes_recursive(client: &TriliumClient, root_note_id: &str) -> Result<Vec<Note>> {
    let mut notes = Vec::new();
    let mut queue = vec![root_note_id.to_string()];

    while let Some(note_id) = queue.pop() {
        let note = client.get_note(&note_id).await?;
        
        if let Some(child_ids) = &note.child_note_ids {
            queue.extend(child_ids.clone());
        }
        
        notes.push(note);
    }

    Ok(notes)
}

/// Export a single note to Notion format
async fn export_note_to_notion(
    note: &Note,
    _client: &TriliumClient,
    output_path: &Path,
    dry_run: bool,
) -> Result<()> {
    let filename = format!("{}.md", sanitize_filename(&note.title));
    let file_path = output_path.join(filename);

    if dry_run {
        println!("Would export to Notion format: {} -> {}", note.title, file_path.display());
        return Ok(());
    }

    // Convert content to Notion-style markdown
    let default_content = String::new();
    let content = note.content.as_ref().unwrap_or(&default_content);
    let converted_content = convert_trilium_to_notion(content);

    // Add Notion-style properties header
    let mut file_content = String::new();
    
    // Add title as H1
    file_content.push_str(&format!("# {}\n\n", note.title));
    
    // Add metadata as properties (Notion style)
    file_content.push_str("**Properties:**\n");
    file_content.push_str(&format!("- Created: {}\n", note.date_created.format("%Y-%m-%d %H:%M")));
    file_content.push_str(&format!("- Modified: {}\n", note.date_modified.format("%Y-%m-%d %H:%M")));
    file_content.push_str(&format!("- Type: {}\n", note.note_type));
    
    if let Some(attributes) = &note.attributes {
        for attr in attributes {
            file_content.push_str(&format!("- {}: {}\n", attr.name, attr.value));
        }
    }
    
    file_content.push_str("\n---\n\n");
    file_content.push_str(&converted_content);

    fs::write(&file_path, file_content)
        .with_context(|| format!("Failed to write file: {}", file_path.display()))?;

    Ok(())
}

/// Convert Trilium content to Notion-style markdown
fn convert_trilium_to_notion(content: &str) -> String {
    // For now, just return the content as-is
    // In a more complete implementation, you'd convert Trilium-specific syntax
    content.to_string()
}