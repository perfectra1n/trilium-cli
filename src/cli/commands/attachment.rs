use crate::api::TriliumClient;
use crate::cli::output::{print_attachments, print_error, print_success, print_warning};
use crate::config::Config;
use crate::error::Result;
use crate::cli::args::AttachmentCommands;
use std::io::{self, Write};
use std::path::PathBuf;

pub async fn handle(command: AttachmentCommands, config: &Config, output_format: &str) -> Result<()> {
    let client = TriliumClient::new(config)?;

    match command {
        AttachmentCommands::Upload { note_id, file, title } => {
            if !file.exists() {
                print_error(&format!("File not found: {}", file.display()));
                return Ok(());
            }

            let attachment = client.upload_attachment(&note_id, &file, title).await?;
            print_success(&format!("Uploaded attachment: {} ({})", attachment.title, attachment.attachment_id));
            print_attachments(&[attachment], output_format);
            Ok(())
        }

        AttachmentCommands::Download { attachment_id, output } => {
            // Get attachment info first
            let attachment = client.get_attachment(&attachment_id).await?;
            
            let output_path = output.unwrap_or_else(|| {
                PathBuf::from(&attachment.title)
            });

            let data = client.download_attachment(&attachment_id).await?;
            std::fs::write(&output_path, data)?;
            
            print_success(&format!("Downloaded attachment to: {}", output_path.display()));
            Ok(())
        }

        AttachmentCommands::List { note_id } => {
            let attachments = client.get_note_attachments(&note_id).await?;
            
            if attachments.is_empty() {
                print_warning(&format!("No attachments found for note: {}", note_id));
            } else {
                print_attachments(&attachments, output_format);
            }
            Ok(())
        }

        AttachmentCommands::Delete { attachment_id, force } => {
            if !force {
                print!("Are you sure you want to delete attachment {}? [y/N] ", attachment_id);
                io::stdout().flush().unwrap();
                let mut input = String::new();
                io::stdin().read_line(&mut input).unwrap();
                if !input.trim().eq_ignore_ascii_case("y") {
                    print_warning("Deletion cancelled");
                    return Ok(());
                }
            }

            client.delete_attachment(&attachment_id).await?;
            print_success(&format!("Deleted attachment: {}", attachment_id));
            Ok(())
        }
    }
}