use crate::api::TriliumClient;
use crate::cli::output::{print_note, print_notes, print_success, print_tree, print_warning};
use crate::config::Config;
use crate::error::Result;
use crate::models::{CreateNoteRequest, NoteTreeItem, UpdateNoteRequest, CreateBranchRequest};
use crate::cli::args::NoteCommands;
use std::io::{self, Read, Write, IsTerminal};
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::future::Future;

pub async fn handle(command: NoteCommands, config: &Config, output_format: &str) -> Result<()> {
    let client = TriliumClient::new(config)?;

    match command {
        NoteCommands::Create {
            title,
            content,
            note_type,
            parent,
            edit,
        } => {
            let parent_id = parent.unwrap_or_else(|| config.default_parent_id.clone());
            
            let final_content = if edit {
                edit_content(content.as_deref(), config)?
            } else if content.is_none() && !io::stdin().is_terminal() {
                // Read from stdin if no content provided and stdin is piped
                let mut buffer = String::new();
                io::stdin().read_to_string(&mut buffer)?;
                if buffer.is_empty() {
                    return Err(crate::error::TriliumError::ApiError("No content provided and stdin is empty".to_string()));
                }
                buffer
            } else {
                content.unwrap_or_default()
            };

            let request = CreateNoteRequest {
                parent_note_id: parent_id,
                title: title.clone(),
                note_type,
                content: final_content,
                note_position: None,
                prefix: None,
                is_expanded: None,
                is_protected: None,
            };

            let note = client.create_note(request).await?;
            print_success(&format!("Created note: {} ({})", note.title, note.note_id));
            print_note(&note, output_format, false);
            Ok(())
        }

        NoteCommands::Get { note_id, content } => {
            let mut note = client.get_note(&note_id).await?;
            
            if content {
                let note_content = client.get_note_content(&note_id).await?;
                note.content = Some(note_content);
            }

            print_note(&note, output_format, content);
            Ok(())
        }

        NoteCommands::Update {
            note_id,
            title,
            content,
            edit,
        } => {
            let final_content = if edit {
                let existing = client.get_note_content(&note_id).await?;
                Some(edit_content(Some(&existing), config)?)
            } else {
                content
            };

            if title.is_none() && final_content.is_none() {
                print_warning("No changes specified");
                return Ok(());
            }

            let request = UpdateNoteRequest {
                title,
                note_type: None,
                mime: None,
                content: final_content.clone(),
                is_protected: None,
            };

            let note = client.update_note(&note_id, request).await?;
            
            // Update content separately if provided
            if let Some(content) = final_content {
                client.update_note_content(&note_id, &content).await?;
            }

            print_success(&format!("Updated note: {} ({})", note.title, note.note_id));
            Ok(())
        }

        NoteCommands::Delete { note_id, force } => {
            if !force {
                print!("Are you sure you want to delete note {}? [y/N] ", note_id);
                io::stdout().flush()
                    .map_err(|e| crate::error::TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
                let mut input = String::new();
                io::stdin().read_line(&mut input)
                    .map_err(|e| crate::error::TriliumError::InputError(format!("Failed to read user input: {}", e)))?;
                if !input.trim().eq_ignore_ascii_case("y") {
                    print_warning("Deletion cancelled");
                    return Ok(());
                }
            }

            client.delete_note(&note_id).await?;
            print_success(&format!("Deleted note: {}", note_id));
            Ok(())
        }

        NoteCommands::List { parent_id, tree, depth } => {
            let notes = client.get_child_notes(&parent_id).await?;
            
            if tree {
                let mut tree_items = Vec::new();
                for note in notes {
                    let mut item = NoteTreeItem::new(note, 0);
                    build_tree(&client, &mut item, depth, 1).await?;
                    tree_items.push(item);
                }
                print_tree(&tree_items, None);
            } else {
                print_notes(&notes, output_format);
            }
            Ok(())
        }

        NoteCommands::Export { note_id, output, format } => {
            let data = client.export_note(&note_id, &format).await?;
            
            let output_path = output.unwrap_or_else(|| {
                let extension = match format.as_str() {
                    "html" => "html",
                    "markdown" => "md",
                    "zip" => "zip",
                    _ => "txt",
                };
                PathBuf::from(format!("{}.{}", note_id, extension))
            });

            std::fs::write(&output_path, data)?;
            print_success(&format!("Exported note to: {}", output_path.display()));
            Ok(())
        }

        NoteCommands::Import { file, parent, format } => {
            let content = std::fs::read(&file)?;
            
            let actual_format = if format == "auto" {
                detect_format(&file)
            } else {
                format
            };

            let parent_id = parent.as_deref().unwrap_or("root");
            let note = client.import_note(parent_id, content, &actual_format).await?;
            print_success(&format!("Imported note: {} ({})", note.title, note.note_id));
            Ok(())
        }

        NoteCommands::Move { note_id, parent_id } => {
            // For moving notes, we need to create a new branch and delete the old one
            let note = client.get_note(&note_id).await?;
            let current_branches = client.get_note_branches(&note_id).await?;
            
            // Create new branch
            let request = CreateBranchRequest {
                note_id: note_id.clone(),
                parent_note_id: parent_id.clone(),
                note_position: None,
                prefix: None,
                is_expanded: None,
            };
            
            let _new_branch = client.create_branch(request).await?;
            print_success(&format!("Moved note {} to parent {}", note.title, parent_id));
            
            // Optionally delete old branches if specified by the user
            if !current_branches.is_empty() {
                print_warning(&format!("Note still has {} other branch(es). Use branch commands to manage them.", current_branches.len()));
            }
            
            Ok(())
        }

        NoteCommands::Clone { note_id, clone_type } => {
            let note = client.get_note(&note_id).await?;
            
            let clone_request = CreateNoteRequest {
                parent_note_id: "root".to_string(),
                title: format!("{} (clone)", note.title),
                note_type: note.note_type.clone(),
                content: note.content.unwrap_or_default(),
                note_position: None,
                prefix: None,
                is_expanded: None,
                is_protected: None,
            };
            
            let cloned_note = client.create_note(clone_request).await?;
            
            if clone_type == "deep" {
                // For deep clone, we would need to recursively clone children
                print_warning("Deep cloning not fully implemented - only note content was cloned");
            }
            
            print_success(&format!("Cloned note: {} ({})", cloned_note.title, cloned_note.note_id));
            Ok(())
        }
    }
}

fn build_tree<'a>(
    client: &'a TriliumClient,
    item: &'a mut NoteTreeItem,
    max_depth: usize,
    current_depth: usize,
) -> Pin<Box<dyn Future<Output = Result<()>> + 'a>> {
    Box::pin(async move {
        if current_depth >= max_depth {
            return Ok(());
        }

        let children = client.get_child_notes(&item.note.note_id).await?;
        for child in children {
            let mut child_item = NoteTreeItem::new(child, current_depth);
            build_tree(client, &mut child_item, max_depth, current_depth + 1).await?;
            item.children.push(child_item);
        }

        Ok(())
    })
}

fn edit_content(initial_content: Option<&str>, config: &Config) -> Result<String> {
    use tempfile::NamedTempFile;
    use std::process::Command;
    use std::path::Path;

    let mut temp_file = NamedTempFile::new()?;
    if let Some(content) = initial_content {
        temp_file.write_all(content.as_bytes())?;
    }
    temp_file.flush()?;

    let editor = config.editor.clone()
        .or_else(|| std::env::var("EDITOR").ok())
        .unwrap_or_else(|| "vi".to_string());

    // Validate and sanitize the editor command
    let validated_editor = validate_editor(&editor)?;

    let status = Command::new(&validated_editor.command)
        .args(&validated_editor.args)
        .arg(temp_file.path())
        .status()?;

    if !status.success() {
        return Err(crate::error::TriliumError::Cancelled);
    }

    let content = std::fs::read_to_string(temp_file.path())?;
    Ok(content)
}

pub struct ValidatedEditor {
    pub command: String,
    pub args: Vec<String>,
}

pub fn validate_editor(editor_string: &str) -> Result<ValidatedEditor> {
    use crate::error::TriliumError;
    
    // First check the entire string for dangerous characters before splitting
    if editor_string.contains(';') || editor_string.contains('&') || editor_string.contains('|') 
        || editor_string.contains('$') || editor_string.contains('`') || editor_string.contains('<') 
        || editor_string.contains('>') || editor_string.contains('\n') || editor_string.contains('\r')
        || editor_string.contains('\'') || editor_string.contains('"') {
        return Err(TriliumError::SecurityError(
            "Editor command contains potentially dangerous characters".to_string()
        ));
    }
    
    // Split editor command and arguments safely
    let parts: Vec<&str> = editor_string.split_whitespace().collect();
    if parts.is_empty() {
        return Err(TriliumError::SecurityError("Empty editor command".to_string()));
    }

    let command = parts[0];
    let args: Vec<String> = parts[1..].iter().map(|&s| s.to_string()).collect();

    // Whitelist of allowed editors (common secure editors)
    let allowed_editors = &[
        "vi", "vim", "nvim", "nano", "emacs", "code", "gedit", "kate", 
        "subl", "atom", "notepad", "micro", "joe", "pico", "ed"
    ];

    // Extract just the executable name from the path
    let exe_name = Path::new(command)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(command);

    // Check if the editor is in the whitelist
    if !allowed_editors.contains(&exe_name) {
        return Err(TriliumError::SecurityError(
            format!("Editor '{}' is not in the allowed list. Allowed editors: {}", 
                    exe_name, allowed_editors.join(", "))
        ));
    }

    // Note: We already validated the entire string for dangerous characters above

    Ok(ValidatedEditor {
        command: command.to_string(),
        args,
    })
}

fn detect_format(path: &PathBuf) -> String {
    match path.extension().and_then(|s| s.to_str()) {
        Some("html") | Some("htm") => "html".to_string(),
        Some("md") | Some("markdown") => "markdown".to_string(),
        Some("zip") => "zip".to_string(),
        _ => "text".to_string(),
    }
}