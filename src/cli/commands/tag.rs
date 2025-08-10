use crate::api::TriliumClient;
use crate::cli::args::TagCommands;
use crate::cli::output::print_info;
use crate::config::Config;
use crate::error::Result;
use crate::models::CreateAttributeRequest;
use crate::utils::tags::{filter_tags_by_pattern, format_tag_tree, generate_tag_cloud};
use colored::*;
use comfy_table::{Table, Attribute, Cell, Color};

pub async fn handle(command: TagCommands, config: &Config, output_format: &str) -> Result<()> {
    let client = TriliumClient::new(config)?;
    
    match command {
        TagCommands::List { pattern, tree, counts } => {
            handle_list(&client, pattern, tree, counts, output_format).await
        }
        TagCommands::Search { pattern, include_children, limit } => {
            handle_search(&client, &pattern, include_children, limit, output_format).await
        }
        TagCommands::Cloud { min_count, max_tags } => {
            handle_cloud(&client, min_count, max_tags, output_format).await
        }
        TagCommands::Add { note_id, tag } => {
            handle_add(&client, &note_id, &tag, output_format).await
        }
        TagCommands::Remove { note_id, tag } => {
            handle_remove(&client, &note_id, &tag, output_format).await
        }
        TagCommands::Rename { old_tag, new_tag, dry_run } => {
            handle_rename(&client, &old_tag, &new_tag, dry_run, output_format).await
        }
    }
}

async fn handle_list(
    client: &TriliumClient,
    pattern: Option<String>,
    tree: bool,
    counts: bool,
    output_format: &str
) -> Result<()> {
    print_info("Retrieving tags...");
    
    let tag_infos = client.get_all_tags().await?;
    let filtered_tags = if let Some(pattern) = pattern {
        filter_tags_by_pattern(&tag_infos, &pattern)
    } else {
        tag_infos
    };
    
    if filtered_tags.is_empty() {
        print_info("No tags found");
        return Ok(());
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&filtered_tags)?);
        }
        "plain" => {
            for tag in &filtered_tags {
                if counts {
                    println!("{}({})", tag.name, tag.count);
                } else {
                    println!("{}", tag.name);
                }
            }
        }
        _ => {
            if tree {
                let tree_lines = format_tag_tree(&filtered_tags, "  ");
                for line in tree_lines {
                    println!("{}", line);
                }
            } else {
                let mut table = Table::new();
                if counts {
                    table.set_header(vec!["Tag", "Count", "Hierarchy Level"]);
                    for tag in &filtered_tags {
                        table.add_row(vec![
                            Cell::new(format!("#{}", tag.name)).fg(Color::Cyan),
                            Cell::new(tag.count.to_string()).fg(Color::Yellow),
                            Cell::new(tag.hierarchy.len().to_string()).add_attribute(Attribute::Dim),
                        ]);
                    }
                } else {
                    table.set_header(vec!["Tag", "Hierarchy Level"]);
                    for tag in &filtered_tags {
                        table.add_row(vec![
                            Cell::new(format!("#{}", tag.name)).fg(Color::Cyan),
                            Cell::new(tag.hierarchy.len().to_string()).add_attribute(Attribute::Dim),
                        ]);
                    }
                }
                println!("{}", table);
            }
        }
    }
    
    print_info(&format!("Found {} tags", filtered_tags.len()));
    Ok(())
}

async fn handle_search(
    client: &TriliumClient,
    pattern: &str,
    include_children: bool,
    limit: usize,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Searching notes with tag pattern: {}", pattern));
    
    let search_results = client.search_by_tags(pattern, include_children).await?;
    let limited_results: Vec<_> = search_results.into_iter().take(limit).collect();
    
    if limited_results.is_empty() {
        print_info("No notes found with matching tags");
        return Ok(());
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&limited_results)?);
        }
        "plain" => {
            for result in &limited_results {
                println!("{}:{}", result.note_id, result.title);
            }
        }
        _ => {
            let mut table = Table::new();
            table.set_header(vec!["Note ID", "Title", "Path", "Score"]);
            
            for result in &limited_results {
                table.add_row(vec![
                    Cell::new(&result.note_id).add_attribute(Attribute::Dim),
                    Cell::new(&result.title).fg(Color::Green),
                    Cell::new(&result.path).add_attribute(Attribute::Dim),
                    Cell::new(format!("{:.2}", result.score)).fg(Color::Yellow),
                ]);
            }
            
            println!("{}", table);
        }
    }
    
    print_info(&format!("Found {} notes", limited_results.len()));
    Ok(())
}

async fn handle_cloud(
    client: &TriliumClient,
    min_count: usize,
    max_tags: usize,
    output_format: &str
) -> Result<()> {
    print_info("Generating tag cloud...");
    
    let tag_infos = client.get_all_tags().await?;
    let cloud_data = generate_tag_cloud(&tag_infos);
    
    let filtered_cloud: Vec<_> = cloud_data
        .into_iter()
        .filter(|(_, weight)| *weight >= (min_count as f64 / 100.0))
        .take(max_tags)
        .collect();
    
    if filtered_cloud.is_empty() {
        print_info("No tags meet the minimum count requirement");
        return Ok(());
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&filtered_cloud)?);
        }
        "plain" => {
            for (tag, weight) in &filtered_cloud {
                println!("{} ({:.2})", tag, weight);
            }
        }
        _ => {
            println!("{}", "Tag Cloud".bold().underline());
            println!();
            
            // Create visual tag cloud with different sizes
            let mut line = String::new();
            let mut line_length = 0;
            
            for (tag, weight) in &filtered_cloud {
                let tag_display = if *weight > 0.8 {
                    tag.bold().to_string()
                } else if *weight > 0.5 {
                    tag.to_string()
                } else {
                    tag.dimmed().to_string()
                };
                
                let tag_with_space = format!("{} ", tag_display);
                
                if line_length + tag.len() + 1 > 80 {
                    println!("{}", line);
                    line = tag_with_space;
                    line_length = tag.len() + 1;
                } else {
                    line.push_str(&tag_with_space);
                    line_length += tag.len() + 1;
                }
            }
            
            if !line.is_empty() {
                println!("{}", line);
            }
            
            println!();
        }
    }
    
    print_info(&format!("Generated cloud with {} tags", filtered_cloud.len()));
    Ok(())
}

async fn handle_add(
    client: &TriliumClient,
    note_id: &str,
    tag: &str,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Adding tag '{}' to note: {}", tag, note_id));
    
    // Validate tag name
    if !crate::utils::tags::is_valid_tag_name(tag) {
        return Err(crate::error::TriliumError::ValidationError(
            format!("Invalid tag name: '{}'", tag)
        ));
    }
    
    let request = CreateAttributeRequest {
        note_id: note_id.to_string(),
        attr_type: "label".to_string(),
        name: tag.to_string(),
        value: String::new(),
        is_inheritable: Some(false),
        position: None,
    };
    
    let attribute = client.create_attribute(request).await?;
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&attribute)?);
        }
        _ => {
            println!("{} Added tag '{}' to note {}", 
                "✓".green(), 
                tag.cyan(), 
                note_id.dimmed()
            );
        }
    }
    
    Ok(())
}

async fn handle_remove(
    client: &TriliumClient,
    note_id: &str,
    tag: &str,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Removing tag '{}' from note: {}", tag, note_id));
    
    let attributes = client.get_note_attributes(note_id).await?;
    let tag_attributes: Vec<_> = attributes
        .into_iter()
        .filter(|attr| attr.attr_type == "label" && attr.name == tag)
        .collect();
    
    if tag_attributes.is_empty() {
        print_info(&format!("Tag '{}' not found on note", tag));
        return Ok(());
    }
    
    for attr in tag_attributes {
        client.delete_attribute(&attr.attribute_id).await?;
    }
    
    match output_format {
        "json" => {
            let result = serde_json::json!({
                "status": "removed",
                "note_id": note_id,
                "tag": tag
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        }
        _ => {
            println!("{} Removed tag '{}' from note {}", 
                "✓".green(), 
                tag.cyan(), 
                note_id.dimmed()
            );
        }
    }
    
    Ok(())
}

async fn handle_rename(
    client: &TriliumClient,
    old_tag: &str,
    new_tag: &str,
    dry_run: bool,
    output_format: &str
) -> Result<()> {
    let action = if dry_run { "Would rename" } else { "Renaming" };
    print_info(&format!("{} tag '{}' to '{}'", action, old_tag, new_tag));
    
    // Validate new tag name
    if !crate::utils::tags::is_valid_tag_name(new_tag) {
        return Err(crate::error::TriliumError::ValidationError(
            format!("Invalid new tag name: '{}'", new_tag)
        ));
    }
    
    // Search for notes with the old tag
    let search_results = client.search_by_tags(old_tag, false).await?;
    let mut updates = Vec::new();
    
    for result in search_results {
        let attributes = client.get_note_attributes(&result.note_id).await?;
        let tag_attributes: Vec<_> = attributes
            .into_iter()
            .filter(|attr| attr.attr_type == "label" && attr.name == old_tag)
            .collect();
        
        if !tag_attributes.is_empty() {
            let note_id = result.note_id.clone();
            updates.push((result.note_id, result.title, tag_attributes.len()));
            
            if !dry_run {
                // Remove old tag attributes
                for attr in &tag_attributes {
                    client.delete_attribute(&attr.attribute_id).await?;
                }
                
                // Add new tag attribute
                let request = CreateAttributeRequest {
                    note_id,
                    attr_type: "label".to_string(),
                    name: new_tag.to_string(),
                    value: String::new(),
                    is_inheritable: Some(false),
                    position: None,
                };
                client.create_attribute(request).await?;
            }
        }
    }
    
    if updates.is_empty() {
        print_info(&format!("No notes found with tag '{}'", old_tag));
        return Ok(());
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&updates)?);
        }
        "plain" => {
            for (note_id, title, _count) in &updates {
                println!("{}:{}", note_id, title);
            }
        }
        _ => {
            let mut table = Table::new();
            table.set_header(vec!["Note ID", "Title", "Status"]);
            
            for (note_id, title, _count) in &updates {
                let status = if dry_run { "Would rename" } else { "Renamed" };
                table.add_row(vec![
                    Cell::new(note_id).add_attribute(Attribute::Dim),
                    Cell::new(title),
                    Cell::new(status).fg(if dry_run { Color::Yellow } else { Color::Green }),
                ]);
            }
            
            println!("{}", table);
        }
    }
    
    let verb = if dry_run { "would be updated" } else { "updated" };
    print_info(&format!("{} notes {} with new tag", updates.len(), verb));
    
    Ok(())
}