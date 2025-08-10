use crate::error::Result;
use crate::help::{HelpSystem, CommandSuggestions};

pub async fn handle(topic: Option<String>) -> Result<()> {
    let help_system = HelpSystem::new();
    
    match topic {
        Some(topic_name) => {
            match help_system.display_help(&topic_name) {
                Ok(_) => Ok(()),
                Err(e) => {
                    // Try to provide suggestions
                    eprintln!("Error: {}", e);
                    
                    // Show similar topics
                    let suggestions = CommandSuggestions::new();
                    let similar = suggestions.suggest_command(&topic_name);
                    if !similar.is_empty() {
                        eprintln!("\nDid you mean one of these topics?");
                        for suggestion in similar {
                            eprintln!("  trilium help {}", suggestion);
                        }
                    }
                    
                    eprintln!("\nTo see all available topics, run: trilium help");
                    Err(e)
                }
            }
        }
        None => {
            help_system.display_index()?;
            Ok(())
        }
    }
}