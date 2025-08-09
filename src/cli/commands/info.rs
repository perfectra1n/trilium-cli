use crate::api::TriliumClient;
use crate::config::Config;
use crate::error::Result;
use colored::Colorize;

pub async fn handle(config: &Config) -> Result<()> {
    let client = TriliumClient::new(config)?;
    
    match client.get_app_info().await {
        Ok(info) => {
            println!("{}", "Trilium Server Information".bold().blue());
            println!("{}", "─".repeat(50));
            println!("{}: {}", "Version".bold(), info.app_version);
            println!("{}: {}", "Database Version".bold(), info.db_version);
            println!("{}: {}", "Sync Version".bold(), info.sync_version);
            println!("{}: {}", "Build Date".bold(), info.build_date);
            println!("{}: {}", "Build Revision".bold(), info.build_revision);
            println!("{}: {}", "Data Directory".bold(), info.data_directory);
            println!("{}: {}", "Server Time".bold(), info.utc_date_time.format("%Y-%m-%d %H:%M:%S UTC"));
            println!("\n{}", "Connection Information".bold().blue());
            println!("{}", "─".repeat(50));
            println!("{}: {}", "Server URL".bold(), config.server_url);
            println!("{}: {}", "Authentication".bold(), 
                if config.api_token.is_some() { 
                    "Configured".green().to_string() 
                } else { 
                    "Not configured".red().to_string() 
                }
            );
        }
        Err(e) => {
            eprintln!("{} Failed to connect to Trilium server: {}", "✗".red().bold(), e);
            eprintln!("Server URL: {}", config.server_url);
            eprintln!("Please check your configuration and ensure the server is running.");
        }
    }
    
    Ok(())
}