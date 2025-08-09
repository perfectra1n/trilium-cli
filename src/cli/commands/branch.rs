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
        } => {
            let request = CreateBranchRequest {
                note_id: note_id.clone(),
                parent_note_id: parent_id,
                note_position: None,
                prefix,
                is_expanded: None,
            };

            let branch = client.create_branch(request).await?;
            print_success(&format!("Created branch: {}", branch.branch_id));
            print_branches(&[branch], output_format);
            Ok(())
        }

        BranchCommands::Get { branch_id } => {
            let branch = client.get_branch(&branch_id).await?;
            print_branches(&[branch], output_format);
            Ok(())
        }

        BranchCommands::Update {
            branch_id,
            prefix,
            parent,
        } => {
            if prefix.is_none() && parent.is_none() {
                print_warning("No changes specified");
                return Ok(());
            }

            let request = UpdateBranchRequest {
                note_position: None,
                prefix,
                is_expanded: None,
            };

            let branch = client.update_branch(&branch_id, request).await?;
            print_success(&format!("Updated branch: {}", branch.branch_id));
            Ok(())
        }

        BranchCommands::Delete { branch_id, force } => {
            if !force {
                print!("Are you sure you want to delete branch {}? [y/N] ", branch_id);
                io::stdout().flush().unwrap();
                let mut input = String::new();
                io::stdin().read_line(&mut input).unwrap();
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