use crate::cli::output::{print_error, print_success};
use crate::config::Config;
use crate::error::Result;
use crate::cli::args::ConfigCommands;
use colored::Colorize;

pub async fn handle(command: ConfigCommands, config: &Config) -> Result<()> {
    match command {
        ConfigCommands::Init => {
            let _new_config = Config::init_interactive()?;
            print_success("Configuration initialized successfully");
            Ok(())
        }
        ConfigCommands::Show => {
            let profile = config.current_profile()?;
            println!("{}", "Current Configuration".bold().blue());
            println!("{}", "─".repeat(50));
            println!("{}: {} ({})", "Current Profile".bold(), config.current_profile.green(), "active");
            println!("{}: {}", "Server URL".bold(), profile.server_url);
            println!(
                "{}: {}",
                "API Token".bold(),
                if profile.api_token.is_some() {
                    "***configured***".green().to_string()
                } else {
                    "not configured".red().to_string()
                }
            );
            println!("{}: {}", "Default Parent ID".bold(), profile.default_parent_id);
            println!("{}: {}", "Default Note Type".bold(), profile.default_note_type);
            println!(
                "{}: {}",
                "Editor".bold(),
                profile.editor.clone().unwrap_or_else(|| "system default".to_string())
            );
            println!("{}: {} seconds", "Timeout".bold(), profile.timeout_seconds);
            println!("{}: {}", "Max Retries".bold(), profile.max_retries);
            println!("\n{}: {}", "Config File".bold(), Config::default_config_path().display());
            Ok(())
        }
        ConfigCommands::Set { key, value } => {
            let mut new_config = config.clone();
            let value_display = value.clone();
            {
                let profile = new_config.current_profile_mut()?;
                match key.as_str() {
                    "server_url" | "server-url" => profile.server_url = value,
                    "api_token" | "api-token" | "token" => profile.api_token = Some(crate::config::SecureString::from(value)),
                    "default_parent_id" | "default-parent-id" | "parent" => profile.default_parent_id = value,
                    "default_note_type" | "default-note-type" | "type" => profile.default_note_type = value,
                    "editor" => profile.editor = Some(value),
                    "timeout" | "timeout_seconds" => {
                        profile.timeout_seconds = value.parse().map_err(|_| {
                            crate::error::TriliumError::InvalidInput("Timeout must be a number".to_string())
                        })?;
                    }
                    "max_retries" | "retries" => {
                        profile.max_retries = value.parse().map_err(|_| {
                            crate::error::TriliumError::InvalidInput("Max retries must be a number".to_string())
                        })?;
                    }
                    _ => {
                        print_error(&format!("Unknown configuration key: {}", key));
                        return Ok(());
                    }
                }
            }
            new_config.save(None)?;
            print_success(&format!("Configuration updated: {} = {}", key, value_display));
            Ok(())
        }
    }
}