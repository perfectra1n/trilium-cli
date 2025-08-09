use crate::api::TriliumClient;
use crate::cli::output::{print_branches, print_success, print_warning};
use crate::config::Config;
use crate::error::Result;
use crate::models::{CreateBranchRequest, UpdateBranchRequest};
use crate::cli::args::BranchCommands;
use std::io::{self, Write};

pub async fn handle(command: BranchCommands, config: &Config, output_format: &str) -> Result<()> {
    let client = TriliumClient::new(config)?;

    match command {
        BranchCommands::Create {
            note_id,
            parent_id,
            prefix,
            position,
        } => {
            let request = CreateBranchRequest {
                note_id: note_id.clone(),
                parent_note_id: parent_id,
                note_position: position,
                prefix,
                is_expanded: None,
            };

            let branch = client.create_branch(request).await?;
            print_success(&format!("Created branch: {}", branch.branch_id));
            print_branches(&[branch], output_format);
            Ok(())
        }

        BranchCommands::List { note_id } => {
            let branches = client.get_note_branches(&note_id).await?;
            if branches.is_empty() {
                print_warning(&format!("No branches found for note: {}", note_id));
            } else {
                print_branches(&branches, output_format);
            }
            Ok(())
        }

        BranchCommands::Update {
            branch_id,
            prefix,
            position,
            expanded,
        } => {
            if prefix.is_none() && position.is_none() && expanded.is_none() {
                print_warning("No changes specified");
                return Ok(());
            }

            let request = UpdateBranchRequest {
                note_position: position,
                prefix,
                is_expanded: expanded,
            };

            let branch = client.update_branch(&branch_id, request).await?;
            print_success(&format!("Updated branch: {}", branch.branch_id));
            Ok(())
        }

        BranchCommands::Delete { branch_id, force } => {
            if !force {
                print!("Are you sure you want to delete branch {}? [y/N] ", branch_id);
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

            client.delete_branch(&branch_id).await?;
            print_success(&format!("Deleted branch: {}", branch_id));
            Ok(())
        }
    }
}