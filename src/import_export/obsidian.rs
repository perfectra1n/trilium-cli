use crate::api::client::TriliumClient;
use crate::error::{TriliumError, Result};
use crate::models::{Note, CreateNoteRequest, CreateAttributeRequest};
use crate::import_export::{ImportResult, ExportResult, ImportExportConfig};
use crate::import_export::utils::{sanitize_filename, create_progress_bar};
use crate::utils::resource_limits::ResourceLimits;
use anyhow::Context;
use gray_matter::Matter;
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Import an Obsidian vault into Trilium
pub async fn import_vault(
    client: &TriliumClient,
    vault_path: &Path,
    parent_note_id: &str,
    dry_run: bool,
) -> Result<ImportResult> {
    let mut result = ImportResult::new();
    let config = ImportExportConfig::default();
    
    if !vault_path.exists() {
        return Err(TriliumError::NotFound(format!("Vault path does not exist: {}", vault_path.display())));
    }

    // Find all markdown files in the vault
    let markdown_files = find_markdown_files(vault_path)?;
    let progress = create_progress_bar(markdown_files.len() as u64, "Importing notes");

    // Create vault root note
    let vault_root_id = if !dry_run {
        let vault_name = vault_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Obsidian Vault");
            
        let create_request = CreateNoteRequest {
            parent_note_id: parent_note_id.to_string(),
            title: format!("📁 {}", vault_name),
            note_type: "text".to_string(),
            content: format!("Imported Obsidian vault from: {}\n\nImported on: {}", 
                vault_path.display(), chrono::Utc::now().format("%Y-%m-%d %H:%M:%S")),
            note_position: None,
            prefix: None,
            is_expanded: Some(true),
            is_protected: None,
        };
        
        let note = client.create_note(create_request).await?;
        note.note_id
    } else {
        format!("dry-run-vault-{}", chrono::Utc::now().timestamp())
    };

    // Build directory structure mapping
    let mut dir_note_map = HashMap::new();
    dir_note_map.insert(vault_path.to_path_buf(), vault_root_id.clone());

    // Process each markdown file
    for file_path in markdown_files {
        progress.inc(1);
        
        match process_obsidian_file(&file_path, vault_path, client, &mut dir_note_map, &config, dry_run).await {
            Ok(_) => {
                result.notes_imported += 1;
                result.files_processed += 1;
            }
            Err(e) => {
                result.add_error(format!("Failed to import {}: {}", file_path.display(), e));
            }
        }
    }

    // Process attachments
    let attachment_result = process_obsidian_attachments(vault_path, client, &vault_root_id, dry_run).await;
    match attachment_result {
        Ok(count) => result.attachments_imported = count,
        Err(e) => result.add_error(format!("Failed to process attachments: {}", e)),
    }

    progress.finish_with_message("Import completed");
    result.finalize();
    Ok(result)
}

/// Export Trilium notes to Obsidian vault format
pub async fn export_vault(
    client: &TriliumClient,
    root_note_id: &str,
    vault_path: &Path,
    dry_run: bool,
) -> Result<ExportResult> {
    let mut result = ExportResult::new("obsidian".to_string());
    
    if !dry_run {
        fs::create_dir_all(vault_path)
            .with_context(|| format!("Failed to create vault directory: {}", vault_path.display()))?;
    }

    // Get the root note and all descendants
    let notes = collect_notes_recursive(client, root_note_id).await?;
    let progress = create_progress_bar(notes.len() as u64, "Exporting notes");

    // Create directory structure and export notes
    for note in notes {
        progress.inc(1);
        
        match export_note_to_obsidian(&note, client, vault_path, dry_run).await {
            Ok(_) => {
                result.notes_exported += 1;
                result.files_created += 1;
            }
            Err(e) => {
                result.add_error(format!("Failed to export note {}: {}", note.note_id, e));
            }
        }
    }

    // Export attachments
    match export_attachments_to_obsidian(client, root_note_id, vault_path, dry_run).await {
        Ok(count) => result.attachments_exported = count,
        Err(e) => result.add_error(format!("Failed to export attachments: {}", e)),
    }

    progress.finish_with_message("Export completed");
    result.finalize();
    Ok(result)
}

/// Find all markdown files in the vault
fn find_markdown_files(vault_path: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    
    for entry in WalkDir::new(vault_path).follow_links(false) {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "md" {
                    files.push(path.to_path_buf());
                }
            }
        }
    }
    
    Ok(files)
}

/// Process a single Obsidian markdown file with memory limits
async fn process_obsidian_file(
    file_path: &Path,
    vault_root: &Path,
    client: &TriliumClient,
    dir_note_map: &mut HashMap<PathBuf, String>,
    _config: &ImportExportConfig,
    dry_run: bool,
) -> Result<String> {
    let limits = ResourceLimits::default();
    
    // Check file size before reading to prevent memory exhaustion
    let metadata = fs::metadata(file_path)
        .with_context(|| format!("Failed to read metadata: {}", file_path.display()))?;
    
    let file_size = metadata.len();
    if file_size > limits.max_content_size as u64 {
        return Err(TriliumError::ContentTooLarge { 
            size: file_size as usize, 
            limit: limits.max_content_size 
        });
    }
    
    let content = if file_size > 1_000_000 { // 1MB limit for direct reading
        // For large files, read with buffering to prevent memory spikes
        read_large_file_safely(file_path, limits.max_content_size)?
    } else {
        fs::read_to_string(file_path)
            .with_context(|| format!("Failed to read file: {}", file_path.display()))?
    };

    // Parse frontmatter
    let matter = Matter::<gray_matter::engine::YAML>::new();
    let parsed = matter.parse(&content);
    
    // Extract title from frontmatter or filename
    let title = parsed.data.as_ref()
        .and_then(|_data| {
            // Try to convert Pod to string and then parse as YAML
            None // For now, skip frontmatter title extraction due to Pod serialization issues
        })
        .or_else(|| {
            file_path.file_stem()
                .and_then(|name| name.to_str())
        })
        .unwrap_or("Untitled")
        .to_string();

    // Get or create parent note for directory
    let parent_dir = file_path.parent().unwrap_or(vault_root);
    let parent_note_id = ensure_directory_note(parent_dir, vault_root, client, dir_note_map, dry_run).await?;

    // Convert Obsidian-specific syntax
    let converted_content = convert_obsidian_syntax(&parsed.content);

    if dry_run {
        println!("Would import: {} -> {}", file_path.display(), title);
        return Ok(format!("dry-run-note-{}", chrono::Utc::now().timestamp()));
    }

    // Create the note
    let create_request = CreateNoteRequest {
        parent_note_id,
        title,
        note_type: "text".to_string(),
        content: converted_content,
        note_position: None,
        prefix: None,
        is_expanded: None,
        is_protected: None,
    };

    let note = client.create_note(create_request).await?;

    // Add attributes from frontmatter
    // Skip frontmatter attributes for now due to Pod serialization issues
    // TODO: Implement proper Pod to Value conversion

    Ok(note.note_id)
}

/// Convert Obsidian-specific syntax to Trilium format with safety controls
fn convert_obsidian_syntax(content: &str) -> String {
    let limits = ResourceLimits::default();
    
    // Prevent processing of extremely large content
    if content.len() > limits.max_content_size {
        return format!("Content too large ({} bytes, max: {}) - conversion skipped", 
                      content.len(), limits.max_content_size);
    }
    
    let mut converted = content.to_string();

    // Convert wikilinks [[Link]] to markdown links with safety limits
    match create_safe_obsidian_regex(r"\[\[([^\]]{1,200})\]\]") {
        Ok(wikilink_re) => {
            converted = wikilink_re.replace_all(&converted, |caps: &regex::Captures| {
                let link_text = caps.get(1).map_or("", |m| m.as_str());
                if let Some(pipe_pos) = link_text.find('|') {
                    let (target, display) = link_text.split_at(pipe_pos);
                    let display = if display.len() > 1 { &display[1..] } else { "" }; // Remove the pipe safely
                    format!("[{}]({})", display, sanitize_link_target(target))
                } else {
                    format!("[{}]({})", link_text, sanitize_link_target(link_text))
                }
            }).to_string();
        }
        Err(e) => {
            eprintln!("Failed to create wikilink regex: {}", e);
        }
    }

    // Convert Obsidian tags #tag to Trilium format with limits
    match create_safe_obsidian_regex(r"#(\w{1,50})") {
        Ok(tag_re) => {
            converted = tag_re.replace_all(&converted, "#$1").to_string();
        }
        Err(e) => {
            eprintln!("Failed to create tag regex: {}", e);
        }
    }

    // Convert block references ^blockid with limits
    match create_safe_obsidian_regex(r"\^(\w{1,50})") {
        Ok(block_ref_re) => {
            converted = block_ref_re.replace_all(&converted, "<span id=\"$1\"></span>").to_string();
        }
        Err(e) => {
            eprintln!("Failed to create block reference regex: {}", e);
        }
    }

    converted
}

/// Ensure a directory note exists for the given path
async fn ensure_directory_note(
    dir_path: &Path,
    vault_root: &Path,
    client: &TriliumClient,
    dir_note_map: &mut HashMap<PathBuf, String>,
    dry_run: bool,
) -> Result<String> {
    if let Some(note_id) = dir_note_map.get(dir_path) {
        return Ok(note_id.clone());
    }

    if dir_path == vault_root {
        // Should already be in the map
        return Err(TriliumError::ValidationError("Vault root not found in directory map".to_string()));
    }

    // Ensure parent directory exists first
    let parent_dir = dir_path.parent().unwrap_or(vault_root);
    let parent_note_id = Box::pin(ensure_directory_note(parent_dir, vault_root, client, dir_note_map, dry_run)).await?;

    let dir_name = dir_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown Directory");

    if dry_run {
        let note_id = format!("dry-run-dir-{}", chrono::Utc::now().timestamp());
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

/// Add attributes from frontmatter
async fn add_frontmatter_attributes(
    client: &TriliumClient,
    note_id: &str,
    frontmatter: &Value,
) -> Result<()> {
    if let Some(obj) = frontmatter.as_object() {
        for (key, value) in obj {
            // Skip standard fields
            if matches!(key.as_str(), "title" | "id") {
                continue;
            }

            let attr_value = match value {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => b.to_string(),
                Value::Array(arr) => {
                    arr.iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                }
                _ => serde_json::to_string(value).unwrap_or_default(),
            };

            let create_attr_request = CreateAttributeRequest {
                note_id: note_id.to_string(),
                attr_type: "label".to_string(),
                name: key.clone(),
                value: attr_value,
                is_inheritable: None,
                position: None,
            };

            if let Err(e) = client.create_attribute(create_attr_request).await {
                eprintln!("Failed to create attribute {}: {}", key, e);
            }
        }
    }
    Ok(())
}

/// Process attachments in the vault
async fn process_obsidian_attachments(
    vault_path: &Path,
    client: &TriliumClient,
    vault_root_id: &str,
    dry_run: bool,
) -> Result<usize> {
    let attachment_dirs = vec!["attachments", "assets", "files"];
    let mut processed = 0;

    for dir_name in attachment_dirs {
        let attachment_path = vault_path.join(dir_name);
        if attachment_path.exists() && attachment_path.is_dir() {
            processed += process_attachment_directory(&attachment_path, client, vault_root_id, dry_run).await?;
        }
    }

    Ok(processed)
}

/// Process a single attachment directory
async fn process_attachment_directory(
    dir_path: &Path,
    _client: &TriliumClient,
    _parent_note_id: &str,
    dry_run: bool,
) -> Result<usize> {
    let mut count = 0;
    
    for entry in WalkDir::new(dir_path).follow_links(false) {
        let entry = entry?;
        let path = entry.path();
        
        if path.is_file() {
            if !dry_run {
                // In a real implementation, we'd upload the attachment
                // For now, just count it
                count += 1;
            } else {
                println!("Would import attachment: {}", path.display());
                count += 1;
            }
        }
    }

    Ok(count)
}

/// Collect all notes recursively from a root note
async fn collect_notes_recursive(client: &TriliumClient, root_note_id: &str) -> Result<Vec<Note>> {
    let mut notes = Vec::new();
    let mut queue = vec![root_note_id.to_string()];

    while let Some(note_id) = queue.pop() {
        // Get note details
        let note = client.get_note(&note_id).await?;
        
        // Get child notes
        if let Some(child_ids) = &note.child_note_ids {
            queue.extend(child_ids.clone());
        }
        
        notes.push(note);
    }

    Ok(notes)
}

/// Export a single note to Obsidian format
async fn export_note_to_obsidian(
    note: &Note,
    _client: &TriliumClient,
    vault_path: &Path,
    dry_run: bool,
) -> Result<()> {
    // Generate filename
    let filename = format!("{}.md", sanitize_filename(&note.title));
    let file_path = vault_path.join(filename);

    if dry_run {
        println!("Would export: {} -> {}", note.title, file_path.display());
        return Ok(());
    }

    // Build frontmatter
    let mut frontmatter = serde_json::Map::new();
    frontmatter.insert("title".to_string(), Value::String(note.title.clone()));
    frontmatter.insert("created".to_string(), Value::String(note.date_created.to_rfc3339()));
    frontmatter.insert("modified".to_string(), Value::String(note.date_modified.to_rfc3339()));
    frontmatter.insert("trilium_id".to_string(), Value::String(note.note_id.clone()));

    // Add attributes to frontmatter
    if let Some(attributes) = &note.attributes {
        for attr in attributes {
            frontmatter.insert(attr.name.clone(), Value::String(attr.value.clone()));
        }
    }

    // Convert content
    let default_content = String::new();
    let content = note.content.as_ref().unwrap_or(&default_content);
    let converted_content = convert_trilium_to_obsidian_syntax(content);

    // Build the full file content
    let yaml_frontmatter = serde_yaml::to_string(&frontmatter)?;
    let file_content = format!("---\n{}---\n\n{}", yaml_frontmatter, converted_content);

    // Write to file
    fs::write(&file_path, file_content)
        .with_context(|| format!("Failed to write file: {}", file_path.display()))?;

    Ok(())
}

/// Convert Trilium syntax back to Obsidian format with safety controls
fn convert_trilium_to_obsidian_syntax(content: &str) -> String {
    let limits = ResourceLimits::default();
    
    if content.len() > limits.max_content_size {
        return format!("Content too large ({} bytes, max: {}) - conversion skipped", 
                      content.len(), limits.max_content_size);
    }
    
    let mut converted = content.to_string();

    // Convert markdown links back to wikilinks where appropriate with limits
    match create_safe_obsidian_regex(r"\[([^\]]{1,200})\]\(([^)]{1,500})\)") {
        Ok(link_re) => {
            converted = link_re.replace_all(&converted, |caps: &regex::Captures| {
                let display = caps.get(1).map_or("", |m| m.as_str());
                let target = caps.get(2).map_or("", |m| m.as_str());
                
                // Only convert internal links (not URLs)
                if target.starts_with("http") || target.contains("://") {
                    format!("[{}]({})", display, target)
                } else {
                    let clean_target = target.replace("%20", " ");
                    if display == clean_target {
                        format!("[[{}]]", clean_target)
                    } else {
                        format!("[[{}|{}]]", clean_target, display)
                    }
                }
            }).to_string();
        }
        Err(e) => {
            eprintln!("Failed to create link conversion regex: {}", e);
        }
    }

    converted
}

/// Export attachments to Obsidian format
async fn export_attachments_to_obsidian(
    _client: &TriliumClient,
    _root_note_id: &str,
    vault_path: &Path,
    dry_run: bool,
) -> Result<usize> {
    // Create attachments directory
    let attachments_dir = vault_path.join("attachments");
    
    if !dry_run {
        fs::create_dir_all(&attachments_dir)?;
    }

    // In a real implementation, we'd collect and export all attachments
    // For now, return 0
    Ok(0)
}

/// Read large files safely with buffering to prevent memory exhaustion
fn read_large_file_safely(file_path: &Path, max_size: usize) -> Result<String> {
    let file = fs::File::open(file_path)?;
    let mut reader = BufReader::new(file);
    let mut content = String::new();
    let mut total_read = 0;
    
    // Read line by line to control memory usage
    loop {
        let mut line = String::new();
        let bytes_read = reader.read_line(&mut line)?;
        
        if bytes_read == 0 {
            break; // EOF
        }
        
        total_read += bytes_read;
        if total_read > max_size {
            content.push_str(&format!("\n\n[Content truncated at {} bytes due to size limits]", max_size));
            break;
        }
        
        content.push_str(&line);
    }
    
    Ok(content)
}

/// Create a safe regex for Obsidian syntax processing
fn create_safe_obsidian_regex(pattern: &str) -> Result<Regex> {
    let limits = ResourceLimits::default();
    
    if pattern.len() > limits.max_regex_pattern_length {
        return Err(TriliumError::ValidationError(format!("Regex pattern too long: {} characters (max: {})", 
             pattern.len(), limits.max_regex_pattern_length)));
    }
    
    // Check for dangerous patterns that could cause ReDoS
    if pattern.contains("(.*)*") || pattern.contains("(.+)+") || pattern.contains("(.*)+") {
        return Err(TriliumError::ValidationError(format!("Potentially dangerous regex pattern detected: {}", pattern)));
    }
    
    regex::RegexBuilder::new(pattern)
        .size_limit(10 * 1024 * 1024) // 10MB size limit
        .dfa_size_limit(10 * 1024 * 1024) // 10MB DFA size limit
        .build()
        .map_err(|e| TriliumError::InvalidRegexPattern { 
            pattern: pattern.to_string(), 
            reason: e.to_string() 
        })
}

/// Sanitize link targets to prevent injection attacks
fn sanitize_link_target(target: &str) -> String {
    // Limit target length
    let target = if target.len() > 200 {
        &target[..200]
    } else {
        target
    };
    
    // Replace potentially dangerous characters
    target
        .replace(' ', "%20")
        .chars()
        .filter(|c| c.is_alphanumeric() || "-._~:/?#[]@!$&'()*+,;=%".contains(*c))
        .collect()
}