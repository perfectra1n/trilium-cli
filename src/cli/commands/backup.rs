use crate::api::TriliumClient;
use crate::cli::output::print_success;
use crate::config::Config;
use crate::error::Result;

pub async fn handle(name: Option<String>, config: &Config) -> Result<()> {
    let client = TriliumClient::new(config)?;
    
    let backup_name = client.create_backup(name).await?;
    print_success(&format!("Backup created: {}", backup_name));
    
    Ok(())
}