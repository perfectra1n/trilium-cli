use crate::api::TriliumClient;
use crate::cli::output::{print_info, print_success};
use crate::config::Config;
use crate::error::Result;
use colored::Colorize;

pub async fn handle(date: &str, config: &Config, _output_format: &str) -> Result<()> {
    let client = TriliumClient::new(config)?;
    
    // Try to get existing calendar note
    match client.get_calendar_note(date).await {
        Ok(calendar_note) => {
            if calendar_note.exists {
                println!("{}", "Calendar Note Information".bold().blue());
                println!("{}", "─".repeat(50));
                println!("{}: {}", "Date Note ID".bold(), calendar_note.date_note_id);
                println!("{}: {}", "Month Note ID".bold(), calendar_note.month_note_id);
                println!("{}: {}", "Year Note ID".bold(), calendar_note.year_note_id);
                println!("{}: {}", "Week Note ID".bold(), calendar_note.week_note_id);
                print_info("Calendar note already exists");
            } else {
                // Create new calendar note
                let created = client.create_calendar_note(date).await?;
                print_success(&format!("Created calendar note for date: {}", date));
                println!("{}: {}", "Date Note ID".bold(), created.date_note_id);
                println!("{}: {}", "Month Note ID".bold(), created.month_note_id);
                println!("{}: {}", "Year Note ID".bold(), created.year_note_id);
                println!("{}: {}", "Week Note ID".bold(), created.week_note_id);
            }
        }
        Err(_) => {
            // Try to create if getting failed
            let created = client.create_calendar_note(date).await?;
            print_success(&format!("Created calendar note for date: {}", date));
            println!("{}: {}", "Date Note ID".bold(), created.date_note_id);
        }
    }
    
    Ok(())
}