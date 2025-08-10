use crate::api::client::TriliumClient;
use crate::cli::output::OutputFormat;
use crate::error::{TriliumError, Result};
use crate::models::{Note, CreateNoteRequest, Attribute, CreateAttributeRequest};
use anyhow::Context;
use colored::Colorize;
use indicatif::{ProgressBar, ProgressStyle};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub async fn import_obsidian(
    client: &TriliumClient,
    vault_path: &Path,
    parent_note_id: Option<String>,
    dry_run: bool,
    output_format: &OutputFormat,
) -> Result<()> {
    let parent_id = parent_note_id.unwrap_or_else(|| "root".to_string());
    
    println!("{}", "Starting Obsidian vault import...".cyan());
    
    if dry_run {
        println!("{}", "DRY RUN MODE - No changes will be made".yellow());
    }

    let import_result = super::super::super::import_export::obsidian::import_vault(
        client, vault_path, &parent_id, dry_run
    ).await?;

    match output_format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&import_result)?);
        }
        OutputFormat::Table | OutputFormat::Plain => {
            println!("Import completed:");
            println!("  Notes imported: {}", import_result.notes_imported);
            println!("  Attachments imported: {}", import_result.attachments_imported);
            println!("  Errors: {}", import_result.errors.len());
            
            if !import_result.errors.is_empty() {
                println!("\nErrors encountered:");
                for error in &import_result.errors {
                    println!("  - {}", error.red());
                }
            }
        }
    }

    Ok(())
}

pub async fn export_obsidian(
    client: &TriliumClient,
    note_id: &str,
    vault_path: &Path,
    dry_run: bool,
    output_format: &OutputFormat,
) -> Result<()> {
    println!("{}", "Starting Obsidian vault export...".cyan());
    
    if dry_run {
        println!("{}", "DRY RUN MODE - No changes will be made".yellow());
    }

    let export_result = super::super::super::import_export::obsidian::export_vault(
        client, note_id, vault_path, dry_run
    ).await?;

    match output_format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&export_result)?);
        }
        OutputFormat::Table | OutputFormat::Plain => {
            println!("Export completed:");
            println!("  Notes exported: {}", export_result.notes_exported);
            println!("  Attachments exported: {}", export_result.attachments_exported);
            println!("  Errors: {}", export_result.errors.len());
            
            if !export_result.errors.is_empty() {
                println!("\nErrors encountered:");
                for error in &export_result.errors {
                    println!("  - {}", error.red());
                }
            }
        }
    }

    Ok(())
}

pub async fn import_notion(
    client: &TriliumClient,
    zip_path: &Path,
    parent_note_id: Option<String>,
    dry_run: bool,
    output_format: &OutputFormat,
) -> Result<()> {
    let parent_id = parent_note_id.unwrap_or_else(|| "root".to_string());
    
    println!("{}", "Starting Notion export import...".cyan());
    
    if dry_run {
        println!("{}", "DRY RUN MODE - No changes will be made".yellow());
    }

    let import_result = super::super::super::import_export::notion::import_export(
        client, zip_path, &parent_id, dry_run
    ).await?;

    match output_format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&import_result)?);
        }
        OutputFormat::Table | OutputFormat::Plain => {
            println!("Import completed:");
            println!("  Notes imported: {}", import_result.notes_imported);
            println!("  Attachments imported: {}", import_result.attachments_imported);
            println!("  Errors: {}", import_result.errors.len());
            
            if !import_result.errors.is_empty() {
                println!("\nErrors encountered:");
                for error in &import_result.errors {
                    println!("  - {}", error.red());
                }
            }
        }
    }

    Ok(())
}

pub async fn export_notion(
    client: &TriliumClient,
    note_id: &str,
    output_path: &Path,
    dry_run: bool,
    output_format: &OutputFormat,
) -> Result<()> {
    println!("{}", "Starting Notion export...".cyan());
    
    if dry_run {
        println!("{}", "DRY RUN MODE - No changes will be made".yellow());
    }

    let export_result = super::super::super::import_export::notion::export_notes(
        client, note_id, output_path, dry_run
    ).await?;

    match output_format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&export_result)?);
        }
        OutputFormat::Table | OutputFormat::Plain => {
            println!("Export completed:");
            println!("  Notes exported: {}", export_result.notes_exported);
            println!("  Files created: {}", export_result.files_created);
            println!("  Errors: {}", export_result.errors.len());
            
            if !export_result.errors.is_empty() {
                println!("\nErrors encountered:");
                for error in &export_result.errors {
                    println!("  - {}", error.red());
                }
            }
        }
    }

    Ok(())
}

pub async fn import_directory(
    client: &TriliumClient,
    dir_path: &Path,
    parent_note_id: Option<String>,
    max_depth: Option<usize>,
    file_patterns: Vec<String>,
    dry_run: bool,
    output_format: &OutputFormat,
) -> Result<()> {
    let parent_id = parent_note_id.unwrap_or_else(|| "root".to_string());
    
    println!("{}", "Starting directory bulk import...".cyan());
    
    if dry_run {
        println!("{}", "DRY RUN MODE - No changes will be made".yellow());
    }

    let import_result = super::super::super::import_export::directory::import_directory(
        client, dir_path, &parent_id, max_depth, file_patterns, dry_run
    ).await?;

    match output_format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&import_result)?);
        }
        OutputFormat::Table | OutputFormat::Plain => {
            println!("Import completed:");
            println!("  Notes imported: {}", import_result.notes_imported);
            println!("  Directories processed: {}", import_result.directories_processed);
            println!("  Files processed: {}", import_result.files_processed);
            println!("  Errors: {}", import_result.errors.len());
            
            if !import_result.errors.is_empty() {
                println!("\nErrors encountered:");
                for error in &import_result.errors {
                    println!("  - {}", error.red());
                }
            }
        }
    }

    Ok(())
}

pub async fn sync_git(
    client: &TriliumClient,
    repo_path: &Path,
    note_id: Option<String>,
    branch: Option<String>,
    operation: GitOperation,
    dry_run: bool,
    output_format: &OutputFormat,
) -> Result<()> {
    println!("{}", "Starting git synchronization...".cyan());
    
    if dry_run {
        println!("{}", "DRY RUN MODE - No changes will be made".yellow());
    }

    let sync_result = super::super::super::import_export::git::sync_repository(
        client, repo_path, note_id, branch, operation.clone(), dry_run
    ).await?;

    match output_format {
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&sync_result)?);
        }
        OutputFormat::Table | OutputFormat::Plain => {
            println!("Git sync completed:");
            println!("  Operation: {:?}", operation);
            println!("  Files processed: {}", sync_result.files_processed);
            println!("  Commits: {}", sync_result.commits_processed);
            println!("  Errors: {}", sync_result.errors.len());
            
            if !sync_result.errors.is_empty() {
                println!("\nErrors encountered:");
                for error in &sync_result.errors {
                    println!("  - {}", error.red());
                }
            }
        }
    }

    Ok(())
}

#[derive(Debug, Clone)]
pub enum GitOperation {
    Import,
    Export,
    Sync,
}