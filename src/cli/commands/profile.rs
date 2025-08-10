use crate::cli::args::ProfileCommands;
use crate::cli::output::OutputFormat;
use crate::config::{Config, ProfileConfig};
use crate::error::{Result, TriliumError};
use colored::Colorize;
use comfy_table::{Cell, Color, Table};
use std::collections::HashMap;
use std::io::{self, Write};

pub async fn handle(command: ProfileCommands, config: &mut Config, output_format: &str) -> Result<()> {
    let output_format = OutputFormat::from_string(output_format)?;
    
    match command {
        ProfileCommands::List { detailed } => {
            list_profiles(config, detailed, &output_format).await
        }
        ProfileCommands::Show { name } => {
            show_profile(config, name.as_deref(), &output_format).await
        }
        ProfileCommands::Create { name, description, from, set_current } => {
            create_profile(config, &name, description, from, set_current).await
        }
        ProfileCommands::Delete { name, force } => {
            delete_profile(config, &name, force).await
        }
        ProfileCommands::Set { name } => {
            set_profile(config, &name).await
        }
        ProfileCommands::Copy { from, to, overwrite } => {
            copy_profile(config, &from, &to, overwrite).await
        }
        ProfileCommands::Configure { profile, key, value, interactive } => {
            configure_profile(config, profile.as_deref(), key, value, interactive).await
        }
    }
}

async fn list_profiles(config: &Config, detailed: bool, output_format: &OutputFormat) -> Result<()> {
    let profiles = config.list_profiles();
    
    match output_format {
        OutputFormat::Json => {
            let mut json_profiles: HashMap<&String, serde_json::Value> = HashMap::new();
            for (name, profile_config) in &profiles {
                if detailed {
                    json_profiles.insert(name, serde_json::to_value(profile_config)?);
                } else {
                    json_profiles.insert(name, serde_json::to_value(&profile_config.description)?);
                }
            }
            println!("{}", serde_json::to_string_pretty(&json_profiles)?);
        }
        OutputFormat::Table => {
            let mut table = Table::new();
            
            if detailed {
                table.set_header(vec![
                    Cell::new("Profile").fg(Color::Green),
                    Cell::new("Current").fg(Color::Green),
                    Cell::new("Server URL").fg(Color::Green),
                    Cell::new("Description").fg(Color::Green),
                    Cell::new("Inherits From").fg(Color::Green),
                ]);
                
                for (name, profile_config) in profiles {
                    let is_current = name == &config.current_profile;
                    table.add_row(vec![
                        Cell::new(name).fg(if is_current { Color::Yellow } else { Color::White }),
                        Cell::new(if is_current { "✓" } else { "" }).fg(Color::Green),
                        Cell::new(&profile_config.server_url),
                        Cell::new(profile_config.description.as_deref().unwrap_or("")),
                        Cell::new(profile_config.inherits_from.as_deref().unwrap_or("")),
                    ]);
                }
            } else {
                table.set_header(vec![
                    Cell::new("Profile").fg(Color::Green),
                    Cell::new("Current").fg(Color::Green),
                    Cell::new("Description").fg(Color::Green),
                ]);
                
                for (name, profile_config) in profiles {
                    let is_current = name == &config.current_profile;
                    table.add_row(vec![
                        Cell::new(name).fg(if is_current { Color::Yellow } else { Color::White }),
                        Cell::new(if is_current { "✓" } else { "" }).fg(Color::Green),
                        Cell::new(profile_config.description.as_deref().unwrap_or("")),
                    ]);
                }
            }
            
            println!("{}", table);
        }
        OutputFormat::Plain => {
            for (name, profile_config) in profiles {
                let is_current = name == &config.current_profile;
                let marker = if is_current { " (current)" } else { "" };
                
                if detailed {
                    println!("{}{}", name.green(), marker.yellow());
                    println!("  Server: {}", profile_config.server_url);
                    if let Some(description) = &profile_config.description {
                        println!("  Description: {}", description);
                    }
                    if let Some(inherits_from) = &profile_config.inherits_from {
                        println!("  Inherits from: {}", inherits_from);
                    }
                    println!("  Recent notes: {}", profile_config.recent_notes.len());
                    println!("  Bookmarks: {}", profile_config.bookmarked_notes.len());
                    println!();
                } else {
                    let description = profile_config.description.as_deref().unwrap_or("");
                    println!("{}{} - {}", name.green(), marker.yellow(), description);
                }
            }
        }
    }
    
    Ok(())
}

async fn show_profile(config: &Config, name: Option<&str>, output_format: &OutputFormat) -> Result<()> {
    let profile_name = name.unwrap_or(&config.current_profile);
    let profile = config.profiles.get(profile_name)
        .ok_or_else(|| TriliumError::profile_error(&format!("Profile '{}' not found", profile_name)))?;
        
    match output_format {
        OutputFormat::Json => {
            let mut profile_data = serde_json::json!({
                "name": profile_name,
                "current": profile_name == config.current_profile,
                "config": profile
            });
            
            println!("{}", serde_json::to_string_pretty(&profile_data)?);
        }
        OutputFormat::Table => {
            let mut table = Table::new();
            table.set_header(vec![
                Cell::new("Setting").fg(Color::Green),
                Cell::new("Value").fg(Color::Green),
            ]);
            
            let is_current = profile_name == config.current_profile;
            table.add_row(vec!["Name", profile_name]);
            table.add_row(vec!["Current", if is_current { "Yes" } else { "No" }]);
            table.add_row(vec!["Server URL", &profile.server_url]);
            table.add_row(vec!["Default Parent", &profile.default_parent_id]);
            table.add_row(vec!["Default Note Type", &profile.default_note_type]);
            if let Some(editor) = &profile.editor {
                table.add_row(vec!["Editor", editor]);
            }
            table.add_row(vec!["Timeout", &profile.timeout_seconds.to_string()]);
            table.add_row(vec!["Max Retries", &profile.max_retries.to_string()]);
            if let Some(description) = &profile.description {
                table.add_row(vec!["Description", description]);
            }
            if let Some(inherits_from) = &profile.inherits_from {
                table.add_row(vec!["Inherits From", inherits_from]);
            }
            table.add_row(vec!["Recent Notes", &profile.recent_notes.len().to_string()]);
            table.add_row(vec!["Bookmarks", &profile.bookmarked_notes.len().to_string()]);
            table.add_row(vec!["Plugin Directories", &profile.plugin_directories.len().to_string()]);
            
            println!("{}", table);
        }
        OutputFormat::Plain => {
            let is_current = profile_name == config.current_profile;
            println!("{}{}", 
                format!("Profile: {}", profile_name).green(), 
                if is_current { " (current)".yellow() } else { "".normal() }
            );
            println!("Server URL: {}", profile.server_url);
            println!("Default Parent: {}", profile.default_parent_id);
            println!("Default Note Type: {}", profile.default_note_type);
            if let Some(editor) = &profile.editor {
                println!("Editor: {}", editor);
            }
            println!("Timeout: {}s", profile.timeout_seconds);
            println!("Max Retries: {}", profile.max_retries);
            if let Some(description) = &profile.description {
                println!("Description: {}", description);
            }
            if let Some(inherits_from) = &profile.inherits_from {
                println!("Inherits from: {}", inherits_from);
            }
            println!("Recent notes: {}", profile.recent_notes.len());
            println!("Bookmarks: {}", profile.bookmarked_notes.len());
            println!("Plugin directories: {}", profile.plugin_directories.len());
        }
    }
    
    Ok(())
}

async fn create_profile(
    config: &mut Config,
    name: &str,
    description: Option<String>,
    from: Option<String>,
    set_current: bool,
) -> Result<()> {
    // Validate profile name
    if config.profiles.contains_key(name) {
        return Err(TriliumError::profile_error(&format!("Profile '{}' already exists", name)));
    }
    
    let mut new_profile = if let Some(source_name) = from {
        // Copy from existing profile
        let source_profile = config.profiles.get(&source_name)
            .ok_or_else(|| TriliumError::profile_error(&format!("Source profile '{}' not found", source_name)))?;
        
        let mut copied = source_profile.clone();
        // Clear profile-specific data
        copied.recent_notes.clear();
        copied.bookmarked_notes.clear();
        copied.description = description;
        copied
    } else {
        // Create new default profile
        let mut profile = ProfileConfig::default();
        profile.description = description;
        profile
    };
    
    config.profiles.insert(name.to_string(), new_profile);
    
    if set_current {
        config.current_profile = name.to_string();
    }
    
    config.save(None)?;
    
    println!("{}", format!("Created profile '{}'", name).green());
    if set_current {
        println!("{}", format!("Set '{}' as current profile", name).yellow());
    }
    
    Ok(())
}

async fn delete_profile(config: &mut Config, name: &str, force: bool) -> Result<()> {
    if !config.profiles.contains_key(name) {
        return Err(TriliumError::profile_error(&format!("Profile '{}' not found", name)));
    }
    
    if name == "default" {
        return Err(TriliumError::profile_error("Cannot delete the default profile"));
    }
    
    if !force {
        print!("Are you sure you want to delete profile '{}'? [y/N]: ", name);
        io::stdout().flush()?;
        
        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        
        if input.trim().to_lowercase() != "y" && input.trim().to_lowercase() != "yes" {
            println!("Cancelled.");
            return Ok(());
        }
    }
    
    config.delete_profile(name)?;
    config.save(None)?;
    
    println!("{}", format!("Deleted profile '{}'", name).green());
    
    Ok(())
}

async fn set_profile(config: &mut Config, name: &str) -> Result<()> {
    config.set_current_profile(name)?;
    config.save(None)?;
    
    println!("{}", format!("Set '{}' as current profile", name).green());
    
    Ok(())
}

async fn copy_profile(config: &mut Config, from: &str, to: &str, overwrite: bool) -> Result<()> {
    let source_profile = config.profiles.get(from)
        .ok_or_else(|| TriliumError::profile_error(&format!("Source profile '{}' not found", from)))?;
    
    if config.profiles.contains_key(to) && !overwrite {
        return Err(TriliumError::profile_error(&format!(
            "Profile '{}' already exists. Use --overwrite to replace it", to
        )));
    }
    
    let mut copied_profile = source_profile.clone();
    // Clear profile-specific data
    copied_profile.recent_notes.clear();
    copied_profile.bookmarked_notes.clear();
    
    config.profiles.insert(to.to_string(), copied_profile);
    config.save(None)?;
    
    println!("{}", format!("Copied profile '{}' to '{}'", from, to).green());
    
    Ok(())
}

async fn configure_profile(
    config: &mut Config,
    profile_name: Option<&str>,
    key: Option<String>,
    value: Option<String>,
    interactive: bool,
) -> Result<()> {
    let profile_name = profile_name.unwrap_or(&config.current_profile);
    
    let profile = config.profiles.get_mut(profile_name)
        .ok_or_else(|| TriliumError::profile_error(&format!("Profile '{}' not found", profile_name)))?;
    
    if interactive {
        configure_profile_interactive(profile, profile_name).await?;
    } else if let (Some(key), Some(value)) = (key, value) {
        set_profile_setting(profile, &key, &value)?;
        println!("{}", format!("Set {}.{} = {}", profile_name, key, value).green());
    } else {
        return Err(TriliumError::validation("Either specify --key and --value, or use --interactive"));
    }
    
    config.save(None)?;
    Ok(())
}

async fn configure_profile_interactive(profile: &mut ProfileConfig, profile_name: &str) -> Result<()> {
    println!("Configuring profile: {}", profile_name.green());
    println!("Press Enter to keep current value, or type new value:");
    println!();
    
    // Server URL
    print!("Server URL [{}]: ", profile.server_url);
    io::stdout().flush()?;
    let mut input = String::new();
    io::stdin().read_line(&mut input)?;
    if !input.trim().is_empty() {
        profile.server_url = input.trim().to_string();
    }
    
    // Default parent ID
    print!("Default parent ID [{}]: ", profile.default_parent_id);
    io::stdout().flush()?;
    input.clear();
    io::stdin().read_line(&mut input)?;
    if !input.trim().is_empty() {
        profile.default_parent_id = input.trim().to_string();
    }
    
    // Default note type
    print!("Default note type [{}]: ", profile.default_note_type);
    io::stdout().flush()?;
    input.clear();
    io::stdin().read_line(&mut input)?;
    if !input.trim().is_empty() {
        profile.default_note_type = input.trim().to_string();
    }
    
    // Editor
    print!("Editor [{}]: ", profile.editor.as_deref().unwrap_or("system default"));
    io::stdout().flush()?;
    input.clear();
    io::stdin().read_line(&mut input)?;
    if !input.trim().is_empty() {
        profile.editor = Some(input.trim().to_string());
    }
    
    // Timeout
    print!("Timeout seconds [{}]: ", profile.timeout_seconds);
    io::stdout().flush()?;
    input.clear();
    io::stdin().read_line(&mut input)?;
    if !input.trim().is_empty() {
        profile.timeout_seconds = input.trim().parse()
            .map_err(|_| TriliumError::validation("Invalid timeout value"))?;
    }
    
    // Max retries
    print!("Max retries [{}]: ", profile.max_retries);
    io::stdout().flush()?;
    input.clear();
    io::stdin().read_line(&mut input)?;
    if !input.trim().is_empty() {
        profile.max_retries = input.trim().parse()
            .map_err(|_| TriliumError::validation("Invalid max retries value"))?;
    }
    
    // Description
    print!("Description [{}]: ", profile.description.as_deref().unwrap_or(""));
    io::stdout().flush()?;
    input.clear();
    io::stdin().read_line(&mut input)?;
    if !input.trim().is_empty() {
        profile.description = Some(input.trim().to_string());
    }
    
    println!("{}", "Profile configuration updated!".green());
    
    Ok(())
}

fn set_profile_setting(profile: &mut ProfileConfig, key: &str, value: &str) -> Result<()> {
    match key {
        "server_url" => profile.server_url = value.to_string(),
        "default_parent_id" => profile.default_parent_id = value.to_string(),
        "default_note_type" => profile.default_note_type = value.to_string(),
        "editor" => profile.editor = Some(value.to_string()),
        "timeout_seconds" => {
            profile.timeout_seconds = value.parse()
                .map_err(|_| TriliumError::validation("Invalid timeout value"))?;
        }
        "max_retries" => {
            profile.max_retries = value.parse()
                .map_err(|_| TriliumError::validation("Invalid max retries value"))?;
        }
        "description" => profile.description = Some(value.to_string()),
        _ => return Err(TriliumError::validation(&format!("Unknown setting: {}", key))),
    }
    
    Ok(())
}