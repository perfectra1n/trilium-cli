use crate::api::client::TriliumClient;
use crate::error::{TriliumError, Result};
use crate::models::{Note, CreateNoteRequest, CreateAttributeRequest};
use crate::import_export::{GitSyncResult, ImportExportConfig};
use crate::import_export::utils::{
    detect_file_type, sanitize_filename, extract_title_from_content,
    create_progress_bar, should_ignore_file, normalize_title
};
use crate::cli::commands::import_export::GitOperation;
use crate::utils::resource_limits::ResourceLimits;
use anyhow::Context;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use regex::Regex;

/// Git integration for version control of notes
pub async fn sync_repository(
    client: &TriliumClient,
    repo_path: &Path,
    note_id: Option<String>,
    branch: Option<String>,
    operation: GitOperation,
    dry_run: bool,
) -> Result<GitSyncResult> {
    let branch_name = branch.unwrap_or_else(|| "main".to_string());
    let mut result = GitSyncResult::new(
        repo_path.to_string_lossy().to_string(), 
        branch_name.clone()
    );

    if !repo_path.exists() {
        if matches!(operation, GitOperation::Import) {
            return Err(TriliumError::NotFound(format!("Repository path does not exist: {}", repo_path.display())));
        }
        // For export, create the directory
        if !dry_run {
            fs::create_dir_all(repo_path)?;
        }
    }

    match operation {
        GitOperation::Import => {
            import_from_git(client, repo_path, &branch_name, note_id, &mut result, dry_run).await?;
        }
        GitOperation::Export => {
            export_to_git(client, repo_path, &branch_name, note_id, &mut result, dry_run).await?;
        }
        GitOperation::Sync => {
            sync_bidirectional(client, repo_path, &branch_name, note_id, &mut result, dry_run).await?;
        }
    }

    result.finalize();
    Ok(result)
}

/// Import notes from a git repository
async fn import_from_git(
    client: &TriliumClient,
    repo_path: &Path,
    branch: &str,
    parent_note_id: Option<String>,
    result: &mut GitSyncResult,
    dry_run: bool,
) -> Result<()> {
    let parent_id = parent_note_id.unwrap_or_else(|| "root".to_string());
    
    // Validate git repository
    validate_git_repo(repo_path)?;
    
    // Checkout the specified branch
    if !dry_run {
        checkout_branch(repo_path, branch)?;
    }
    
    // Get commit history
    let commits = get_commit_history(repo_path, Some(10))?; // Last 10 commits
    result.commits_processed = commits.len();
    
    if let Some(latest_commit) = commits.first() {
        result.last_commit_hash = Some(latest_commit.hash.clone());
    }
    
    // Find all markdown files
    let files = find_git_files(repo_path)?;
    let progress = create_progress_bar(files.len() as u64, "Importing from git");
    
    // Create git import root note
    let git_root_id = if !dry_run {
        let repo_name = repo_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("Git Repository");
            
        let create_request = CreateNoteRequest {
            parent_note_id: parent_id,
            title: format!("🗂️ {} ({})", repo_name, branch),
            note_type: "text".to_string(),
            content: format!(
                "Imported git repository from: {}\nBranch: {}\nLast commit: {}\nImported on: {}", 
                repo_path.display(),
                branch,
                result.last_commit_hash.as_deref().unwrap_or("unknown"),
                chrono::Utc::now().format("%Y-%m-%d %H:%M:%S")
            ),
            note_position: None,
            prefix: None,
            is_expanded: Some(true),
            is_protected: None,
        };
        
        let note = client.create_note(create_request).await?;
        note.note_id
    } else {
        format!("dry-run-git-{}", chrono::Utc::now().timestamp())
    };

    // Build directory structure mapping
    let mut dir_note_map = HashMap::new();
    dir_note_map.insert(repo_path.to_path_buf(), git_root_id);

    // Process each file
    for file_path in files {
        progress.inc(1);
        progress.set_message(format!("Processing {}", file_path.file_name().unwrap_or_default().to_string_lossy()));
        
        match process_git_file(&file_path, repo_path, client, &mut dir_note_map, dry_run).await {
            Ok(_) => {
                result.files_processed += 1;
            }
            Err(e) => {
                result.add_error(format!("Failed to import {}: {}", file_path.display(), e));
            }
        }
    }

    progress.finish_with_message("Git import completed");
    Ok(())
}

/// Export notes to a git repository
async fn export_to_git(
    client: &TriliumClient,
    repo_path: &Path,
    branch: &str,
    root_note_id: Option<String>,
    result: &mut GitSyncResult,
    dry_run: bool,
) -> Result<()> {
    let note_id = root_note_id.unwrap_or_else(|| "root".to_string());
    
    // Initialize git repository if it doesn't exist
    if !repo_path.join(".git").exists() && !dry_run {
        init_git_repo(repo_path)?;
    }
    
    // Checkout or create branch
    if !dry_run {
        checkout_or_create_branch(repo_path, branch)?;
    }
    
    // Get all notes to export
    let notes = collect_notes_recursive(client, &note_id).await?;
    let progress = create_progress_bar(notes.len() as u64, "Exporting to git");
    
    // Create docs directory
    let docs_dir = repo_path.join("docs");
    if !dry_run {
        fs::create_dir_all(&docs_dir)?;
    }
    
    // Export each note
    for note in &notes {
        progress.inc(1);
        progress.set_message(format!("Exporting {}", note.title));
        
        match export_note_to_git(&note, &docs_dir, dry_run).await {
            Ok(_) => {
                result.files_processed += 1;
            }
            Err(e) => {
                result.add_error(format!("Failed to export note {}: {}", note.note_id, e));
            }
        }
    }
    
    // Create README.md with index
    if !dry_run {
        create_git_readme(repo_path, &notes).await?;
        result.files_processed += 1;
    }
    
    // Commit changes
    if !dry_run {
        let commit_message = format!(
            "Update notes from Trilium\n\nExported {} notes on {}",
            notes.len(),
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S")
        );
        
        if let Ok(commit_hash) = commit_changes(repo_path, &commit_message) {
            result.last_commit_hash = Some(commit_hash);
            result.commits_processed = 1;
        }
    }
    
    progress.finish_with_message("Git export completed");
    Ok(())
}

/// Bidirectional sync between Trilium and git repository
async fn sync_bidirectional(
    client: &TriliumClient,
    repo_path: &Path,
    branch: &str,
    note_id: Option<String>,
    result: &mut GitSyncResult,
    dry_run: bool,
) -> Result<()> {
    // First, pull any changes from remote
    if !dry_run {
        if let Err(e) = pull_changes(repo_path, branch) {
            result.add_error(format!("Failed to pull changes: {}", e));
        }
    }
    
    // Then export current notes
    export_to_git(client, repo_path, branch, note_id, result, dry_run).await?;
    
    // Finally, push changes to remote
    if !dry_run {
        if let Err(e) = push_changes(repo_path, branch) {
            result.add_error(format!("Failed to push changes: {}", e));
        }
    }
    
    Ok(())
}

/// Validate that a directory is a git repository
fn validate_git_repo(repo_path: &Path) -> Result<()> {
    if !repo_path.join(".git").exists() {
        return Err(TriliumError::NotFound(
            format!("Directory is not a git repository: {}", repo_path.display())
        ));
    }
    Ok(())
}

/// Initialize a new git repository
fn init_git_repo(repo_path: &Path) -> Result<()> {
    let output = Command::new("git")
        .arg("init")
        .current_dir(repo_path)
        .output()
        .context("Failed to run git init")?;
    
    if !output.status.success() {
        return Err(TriliumError::General(anyhow::anyhow!("Git init failed: {}", String::from_utf8_lossy(&output.stderr))));
    }
    
    Ok(())
}

/// Checkout a branch with input validation
fn checkout_branch(repo_path: &Path, branch: &str) -> Result<()> {
    // Validate branch name to prevent command injection
    validate_git_branch_name(branch)?;
    validate_git_repo_path(repo_path)?;
    
    let output = Command::new("git")
        .args(&["checkout", branch])
        .current_dir(repo_path)
        .output()
        .context("Failed to run git checkout")?;
    
    if !output.status.success() {
        return Err(TriliumError::General(anyhow::anyhow!("Git checkout failed: {}", String::from_utf8_lossy(&output.stderr))));
    }
    
    Ok(())
}

/// Checkout or create a branch with input validation
fn checkout_or_create_branch(repo_path: &Path, branch: &str) -> Result<()> {
    // Validate inputs to prevent command injection
    validate_git_branch_name(branch)?;
    validate_git_repo_path(repo_path)?;
    
    // Try to checkout existing branch
    let checkout_output = Command::new("git")
        .args(&["checkout", branch])
        .current_dir(repo_path)
        .output()
        .context("Failed to run git checkout")?;
    
    if !checkout_output.status.success() {
        // Branch doesn't exist, create it
        let create_output = Command::new("git")
            .args(&["checkout", "-b", branch])
            .current_dir(repo_path)
            .output()
            .context("Failed to run git checkout -b")?;
        
        if !create_output.status.success() {
            return Err(TriliumError::General(anyhow::anyhow!("Git checkout -b failed: {}", String::from_utf8_lossy(&create_output.stderr))));
        }
    }
    
    Ok(())
}

/// Get commit history with input validation
fn get_commit_history(repo_path: &Path, limit: Option<usize>) -> Result<Vec<GitCommit>> {
    validate_git_repo_path(repo_path)?;
    
    // Validate and limit the number of commits to prevent resource exhaustion
    let safe_limit = match limit {
        Some(n) if n > 1000 => 1000, // Cap at 1000 commits
        Some(n) => n,
        None => 100, // Default to 100 commits
    };
    
    let limit_str = safe_limit.to_string();
    let args = vec!["log", "--oneline", "--format=%H|%s|%an|%ad", "-n", &limit_str];
    
    let output = Command::new("git")
        .args(&args)
        .current_dir(repo_path)
        .output()
        .context("Failed to run git log")?;
    
    if !output.status.success() {
        return Err(TriliumError::General(anyhow::anyhow!("Git log failed: {}", String::from_utf8_lossy(&output.stderr))));
    }
    
    let log_output = String::from_utf8_lossy(&output.stdout);
    let mut commits = Vec::new();
    
    // Limit output processing to prevent resource exhaustion
    for (i, line) in log_output.lines().enumerate() {
        if i >= safe_limit {
            break;
        }
        
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 4 {
            // Sanitize commit data
            commits.push(GitCommit {
                hash: sanitize_git_hash(parts[0])?,
                message: sanitize_commit_message(parts[1])?,
                author: sanitize_git_author(parts[2])?,
                date: sanitize_git_date(parts[3])?,
            });
        }
    }
    
    Ok(commits)
}

/// Find all relevant files in git repository
fn find_git_files(repo_path: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    
    for entry in walkdir::WalkDir::new(repo_path).follow_links(false) {
        let entry = entry?;
        let path = entry.path();
        
        if !path.is_file() {
            continue;
        }
        
        // Skip git directory
        if path.to_string_lossy().contains(".git/") {
            continue;
        }
        
        // Check if it's a supported file type
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            match ext.to_lowercase().as_str() {
                "md" | "txt" | "html" | "json" => {
                    files.push(path.to_path_buf());
                }
                _ => {}
            }
        }
    }
    
    Ok(files)
}

/// Process a single git file
async fn process_git_file(
    file_path: &Path,
    repo_root: &Path,
    client: &TriliumClient,
    dir_note_map: &mut HashMap<PathBuf, String>,
    dry_run: bool,
) -> Result<String> {
    let content = fs::read_to_string(file_path)
        .with_context(|| format!("Failed to read file: {}", file_path.display()))?;
    
    // Extract title
    let base_title = file_path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled");
    
    let title = extract_title_from_content(&content, base_title);
    
    // Get parent directory note
    let parent_dir = file_path.parent().unwrap_or(repo_root);
    let parent_note_id = ensure_directory_note(parent_dir, repo_root, client, dir_note_map, dry_run).await?;
    
    if dry_run {
        println!("Would import git file: {} -> {}", file_path.display(), title);
        return Ok(format!("dry-run-git-{}", chrono::Utc::now().timestamp_nanos()));
    }
    
    // Create the note
    let create_request = CreateNoteRequest {
        parent_note_id,
        title,
        note_type: "text".to_string(),
        content,
        note_position: None,
        prefix: None,
        is_expanded: None,
        is_protected: None,
    };
    
    let note = client.create_note(create_request).await?;
    
    // Add git metadata
    add_git_metadata(client, &note.note_id, file_path, repo_root).await?;
    
    Ok(note.note_id)
}

/// Ensure directory note exists
async fn ensure_directory_note(
    dir_path: &Path,
    repo_root: &Path,
    client: &TriliumClient,
    dir_note_map: &mut HashMap<PathBuf, String>,
    dry_run: bool,
) -> Result<String> {
    if let Some(note_id) = dir_note_map.get(dir_path) {
        return Ok(note_id.clone());
    }

    if dir_path == repo_root {
        return Err(TriliumError::ValidationError("Repository root not found in directory map".to_string()));
    }

    let parent_dir = dir_path.parent().unwrap_or(repo_root);
    let parent_note_id = Box::pin(ensure_directory_note(parent_dir, repo_root, client, dir_note_map, dry_run)).await?;

    let dir_name = dir_path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown Directory");

    if dry_run {
        let note_id = format!("dry-run-git-dir-{}", chrono::Utc::now().timestamp_nanos());
        dir_note_map.insert(dir_path.to_path_buf(), note_id.clone());
        return Ok(note_id);
    }

    let create_request = CreateNoteRequest {
        parent_note_id,
        title: format!("📁 {}", dir_name),
        note_type: "text".to_string(),
        content: format!("Git directory: {}", dir_path.display()),
        note_position: None,
        prefix: None,
        is_expanded: Some(true),
        is_protected: None,
    };

    let note = client.create_note(create_request).await?;
    dir_note_map.insert(dir_path.to_path_buf(), note.note_id.clone());
    
    Ok(note.note_id)
}

/// Add git-specific metadata to a note
async fn add_git_metadata(
    client: &TriliumClient,
    note_id: &str,
    file_path: &Path,
    repo_root: &Path,
) -> Result<()> {
    let relative_path = file_path.strip_prefix(repo_root)
        .unwrap_or(file_path)
        .to_string_lossy()
        .to_string();
    
    let attributes = vec![
        ("importedFrom", "git".to_string()),
        ("gitPath", relative_path),
        ("importDate", chrono::Utc::now().to_rfc3339()),
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

/// Collect all notes recursively
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

/// Export a note to git repository
async fn export_note_to_git(note: &Note, docs_dir: &Path, dry_run: bool) -> Result<()> {
    let filename = format!("{}.md", sanitize_filename(&note.title));
    let file_path = docs_dir.join(filename);

    if dry_run {
        println!("Would export to git: {} -> {}", note.title, file_path.display());
        return Ok(());
    }

    let default_content = String::new();
    let content = note.content.as_ref().unwrap_or(&default_content);
    
    // Create markdown file with frontmatter
    let mut file_content = String::new();
    file_content.push_str("---\n");
    file_content.push_str(&format!("title: \"{}\"\n", note.title.replace('"', "\\\"")));
    file_content.push_str(&format!("trilium_id: \"{}\"\n", note.note_id));
    file_content.push_str(&format!("created: \"{}\"\n", note.date_created.to_rfc3339()));
    file_content.push_str(&format!("modified: \"{}\"\n", note.date_modified.to_rfc3339()));
    file_content.push_str(&format!("type: \"{}\"\n", note.note_type));
    file_content.push_str("---\n\n");
    file_content.push_str(&format!("# {}\n\n", note.title));
    file_content.push_str(content);

    fs::write(&file_path, file_content)
        .with_context(|| format!("Failed to write file: {}", file_path.display()))?;

    Ok(())
}

/// Create README.md with index of all notes
async fn create_git_readme(repo_path: &Path, notes: &[Note]) -> Result<()> {
    let readme_path = repo_path.join("README.md");
    
    let mut content = String::new();
    content.push_str("# Trilium Notes Export\n\n");
    content.push_str(&format!("Generated on: {}\n\n", chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")));
    content.push_str(&format!("Total notes: {}\n\n", notes.len()));
    content.push_str("## Notes Index\n\n");
    
    for note in notes {
        let filename = format!("{}.md", sanitize_filename(&note.title));
        content.push_str(&format!("- [{}](docs/{})\n", note.title, filename));
    }
    
    fs::write(&readme_path, content)
        .with_context(|| format!("Failed to write README: {}", readme_path.display()))?;
    
    Ok(())
}

/// Commit changes to git repository with input validation
fn commit_changes(repo_path: &Path, message: &str) -> Result<String> {
    validate_git_repo_path(repo_path)?;
    let sanitized_message = sanitize_commit_message(message)?;
    
    // Add all changes
    let add_output = Command::new("git")
        .args(&["add", "."])
        .current_dir(repo_path)
        .output()
        .context("Failed to run git add")?;
    
    if !add_output.status.success() {
        return Err(TriliumError::General(anyhow::anyhow!("Git add failed: {}", String::from_utf8_lossy(&add_output.stderr))));
    }
    
    // Commit changes
    let commit_output = Command::new("git")
        .args(&["commit", "-m", &sanitized_message])
        .current_dir(repo_path)
        .output()
        .context("Failed to run git commit")?;
    
    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        if stderr.contains("nothing to commit") {
            return Ok("no-changes".to_string());
        }
        return Err(TriliumError::General(anyhow::anyhow!("Git commit failed: {}", stderr)));
    }
    
    // Get the commit hash
    let hash_output = Command::new("git")
        .args(&["rev-parse", "HEAD"])
        .current_dir(repo_path)
        .output()
        .context("Failed to get commit hash")?;
    
    if hash_output.status.success() {
        let hash = String::from_utf8_lossy(&hash_output.stdout).trim().to_string();
        Ok(sanitize_git_hash(&hash)?)
    } else {
        Ok("unknown".to_string())
    }
}

/// Pull changes from remote repository with input validation
fn pull_changes(repo_path: &Path, branch: &str) -> Result<()> {
    validate_git_repo_path(repo_path)?;
    validate_git_branch_name(branch)?;
    
    let output = Command::new("git")
        .args(&["pull", "origin", branch])
        .current_dir(repo_path)
        .output()
        .context("Failed to run git pull")?;
    
    if !output.status.success() {
        return Err(TriliumError::General(anyhow::anyhow!("Git pull failed: {}", String::from_utf8_lossy(&output.stderr))));
    }
    
    Ok(())
}

/// Push changes to remote repository with input validation
fn push_changes(repo_path: &Path, branch: &str) -> Result<()> {
    validate_git_repo_path(repo_path)?;
    validate_git_branch_name(branch)?;
    
    let output = Command::new("git")
        .args(&["push", "origin", branch])
        .current_dir(repo_path)
        .output()
        .context("Failed to run git push")?;
    
    if !output.status.success() {
        return Err(TriliumError::General(anyhow::anyhow!("Git push failed: {}", String::from_utf8_lossy(&output.stderr))));
    }
    
    Ok(())
}

#[derive(Debug, Clone)]
struct GitCommit {
    hash: String,
    message: String,
    author: String,
    date: String,
}

/// Validate git branch name to prevent command injection
fn validate_git_branch_name(branch: &str) -> Result<()> {
    if branch.is_empty() {
        return Err(TriliumError::General(anyhow::anyhow!("Branch name cannot be empty")));
    }
    
    if branch.len() > 250 {
        return Err(TriliumError::General(anyhow::anyhow!("Branch name too long: {} characters (max: 250)", branch.len())));
    }
    
    // Git branch name rules (simplified)
    let valid_branch_re = Regex::new(r"^[a-zA-Z0-9/_.-]+$").unwrap();
    if !valid_branch_re.is_match(branch) {
        return Err(TriliumError::General(anyhow::anyhow!("Invalid branch name: {}", branch)));
    }
    
    // Prevent dangerous patterns
    let dangerous_patterns = ["..", "//", "--", "~", "^", ":", "?", "*", "[", "\\"];
    for pattern in &dangerous_patterns {
        if branch.contains(pattern) {
            return Err(TriliumError::General(anyhow::anyhow!("Branch name contains dangerous pattern '{}': {}", pattern, branch)));
        }
    }
    
    // Prevent names that start with dangerous characters
    if branch.starts_with('-') || branch.starts_with('.') || branch.starts_with('/') {
        return Err(TriliumError::General(anyhow::anyhow!("Branch name starts with invalid character: {}", branch)));
    }
    
    // Prevent reserved branch names
    let reserved = ["HEAD", "ORIG_HEAD", "FETCH_HEAD", "MERGE_HEAD"];
    if reserved.contains(&branch) {
        return Err(TriliumError::General(anyhow::anyhow!("Reserved branch name not allowed: {}", branch)));
    }
    
    Ok(())
}

/// Validate git repository path to prevent path traversal
fn validate_git_repo_path(repo_path: &Path) -> Result<()> {
    if !repo_path.exists() {
        return Err(TriliumError::General(anyhow::anyhow!("Repository path does not exist: {}", repo_path.display())));
    }
    
    if !repo_path.is_dir() {
        return Err(TriliumError::General(anyhow::anyhow!("Repository path is not a directory: {}", repo_path.display())));
    }
    
    // Check if path is canonical (no symlinks or traversal)
    let canonical_path = repo_path.canonicalize()
        .with_context(|| format!("Failed to canonicalize path: {}", repo_path.display()))?;
    
    let path_str = canonical_path.to_string_lossy();
    
    // Prevent dangerous path patterns
    if path_str.contains("..") || path_str.contains("//") {
        return Err(TriliumError::General(anyhow::anyhow!("Repository path contains dangerous patterns: {}", path_str)));
    }
    
    // Ensure it's actually a git repository
    if !canonical_path.join(".git").exists() {
        return Err(TriliumError::General(anyhow::anyhow!("Directory is not a git repository: {}", canonical_path.display())));
    }
    
    Ok(())
}

/// Sanitize git commit hash
fn sanitize_git_hash(hash: &str) -> Result<String> {
    let hash = hash.trim();
    
    if hash.is_empty() {
        return Ok("unknown".to_string());
    }
    
    // Git hashes are 40-character hexadecimal (SHA-1) or 64-character (SHA-256)
    let valid_hash_re = Regex::new(r"^[a-f0-9]{7,64}$").unwrap();
    if !valid_hash_re.is_match(hash) {
        return Err(TriliumError::General(anyhow::anyhow!("Invalid git hash format: {}", hash)));
    }
    
    Ok(hash.to_string())
}

/// Sanitize git commit message
fn sanitize_commit_message(message: &str) -> Result<String> {
    let limits = ResourceLimits::default();
    
    if message.len() > 10000 {
        return Ok(format!("{}... (truncated)", &message[..9000]));
    }
    
    // Remove dangerous characters that could be used for command injection
    let mut sanitized = message.to_string();
    
    // Remove null bytes and control characters
    sanitized = sanitized.chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .collect();
    
    // Replace backticks and other shell metacharacters with safe alternatives
    sanitized = sanitized
        .replace('`', "'")
        .replace('$', " dollar ")
        .replace(';', " semicolon ")
        .replace('|', " pipe ")
        .replace('&', " and ");
    
    if sanitized.is_empty() {
        Ok("Automated commit".to_string())
    } else {
        Ok(sanitized.trim().to_string())
    }
}

/// Sanitize git author name
fn sanitize_git_author(author: &str) -> Result<String> {
    let author = author.trim();
    
    if author.is_empty() {
        return Ok("Unknown Author".to_string());
    }
    
    if author.len() > 255 {
        return Ok(format!("{}... (truncated)", &author[..250]));
    }
    
    // Remove dangerous characters
    let sanitized: String = author.chars()
        .filter(|c| c.is_alphanumeric() || " .-_@".contains(*c))
        .collect();
    
    if sanitized.is_empty() {
        Ok("Unknown Author".to_string())
    } else {
        Ok(sanitized)
    }
}

/// Sanitize git date string
fn sanitize_git_date(date: &str) -> Result<String> {
    let date = date.trim();
    
    if date.is_empty() {
        return Ok("unknown".to_string());
    }
    
    if date.len() > 100 {
        return Ok(format!("{}... (truncated)", &date[..95]));
    }
    
    // Only allow safe date characters
    let sanitized: String = date.chars()
        .filter(|c| c.is_alphanumeric() || " :+-/,".contains(*c))
        .collect();
    
    Ok(sanitized)
}