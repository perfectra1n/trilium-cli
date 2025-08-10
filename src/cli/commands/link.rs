use crate::api::TriliumClient;
use crate::cli::args::LinkCommands;
use crate::cli::output::print_info;
use crate::config::Config;
use crate::error::Result;
use crate::utils::links::{parse_links, replace_links, find_broken_links};
use colored::*;
use comfy_table::{Table, Attribute, Cell, Color};
use std::collections::HashMap;

pub async fn handle(command: LinkCommands, config: &Config, output_format: &str) -> Result<()> {
    let client = TriliumClient::new(config)?;
    
    match command {
        LinkCommands::Backlinks { note_id, context } => {
            handle_backlinks(&client, &note_id, context, output_format).await
        }
        LinkCommands::Outgoing { note_id } => {
            handle_outgoing(&client, &note_id, output_format).await
        }
        LinkCommands::Broken { note_id, fix } => {
            handle_broken(&client, note_id, fix, output_format).await
        }
        LinkCommands::Update { old_target, new_target, dry_run } => {
            handle_update(&client, &old_target, &new_target, dry_run, output_format).await
        }
        LinkCommands::Validate { note_id } => {
            handle_validate(&client, &note_id, output_format).await
        }
    }
}

async fn handle_backlinks(
    client: &TriliumClient, 
    note_id: &str, 
    show_context: bool,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Finding backlinks to note: {}", note_id));
    
    let backlinks = client.get_backlinks(note_id).await?;
    
    if backlinks.is_empty() {
        print_info("No backlinks found");
        return Ok(());
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&backlinks)?);
        }
        "plain" => {
            for link in &backlinks {
                if show_context {
                    println!("{}:{} -> {}", link.from_note_id, link.from_title, link.context);
                } else {
                    println!("{}:{}", link.from_note_id, link.from_title);
                }
            }
        }
        _ => {
            let mut table = Table::new();
            table.set_header(vec!["From Note", "Title", if show_context { "Context" } else { "Link Text" }]);
            
            for link in &backlinks {
                let context_or_text = if show_context { &link.context } else { &link.link_text };
                table.add_row(vec![
                    Cell::new(&link.from_note_id).add_attribute(Attribute::Dim),
                    Cell::new(&link.from_title).fg(Color::Green),
                    Cell::new(context_or_text),
                ]);
            }
            
            println!("{}", table);
        }
    }
    
    print_info(&format!("Found {} backlinks", backlinks.len()));
    Ok(())
}

async fn handle_outgoing(
    client: &TriliumClient,
    note_id: &str,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Finding outgoing links from note: {}", note_id));
    
    let outgoing_links = client.get_outgoing_links(note_id).await?;
    let note_content = client.get_note_content(note_id).await?;
    let note = client.get_note(note_id).await?;
    
    // Parse links from content
    let parsed_links = parse_links(&note_content)?;
    
    if parsed_links.is_empty() {
        print_info("No outgoing links found");
        return Ok(());
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&parsed_links)?);
        }
        "plain" => {
            for link in &parsed_links {
                println!("{} -> {}", link.target, link.display_text.as_ref().unwrap_or(&link.target));
            }
        }
        _ => {
            let mut table = Table::new();
            table.set_header(vec!["Target", "Display Text", "Type"]);
            
            for link in &parsed_links {
                table.add_row(vec![
                    Cell::new(&link.target).fg(Color::Blue),
                    Cell::new(link.display_text.as_ref().unwrap_or(&link.target)),
                    Cell::new(format!("{:?}", link.link_type)).add_attribute(Attribute::Dim),
                ]);
            }
            
            println!("{}", table);
        }
    }
    
    print_info(&format!("Found {} outgoing links", parsed_links.len()));
    Ok(())
}

async fn handle_broken(
    client: &TriliumClient,
    note_id: Option<String>,
    fix: bool,
    output_format: &str
) -> Result<()> {
    let notes_to_check = if let Some(id) = note_id {
        vec![client.get_note(&id).await?]
    } else {
        // For now, just check a sample of notes. In a full implementation,
        // you'd want to iterate through all notes or use a search approach.
        print_info("Checking all notes for broken links...");
        let search_results = client.search_notes("[[", false, true, 1000).await?;
        let mut notes = Vec::new();
        for result in search_results {
            if let Ok(note) = client.get_note(&result.note_id).await {
                notes.push(note);
            }
        }
        notes
    };
    
    let mut all_broken_links = Vec::new();
    let mut all_existing_ids = Vec::new();
    
    // Collect existing note IDs for validation
    // In a real implementation, this would be more efficient
    let search_results = client.search_notes("", false, true, 10000).await?;
    for result in search_results {
        all_existing_ids.push(result.note_id);
    }
    
    for note in &notes_to_check {
        if let Ok(content) = client.get_note_content(&note.note_id).await {
            if let Ok(links) = parse_links(&content) {
                let broken = find_broken_links(&links, &all_existing_ids);
            
                for broken_link in broken {
                    all_broken_links.push((note.note_id.clone(), note.title.clone(), broken_link.clone()));
                }
            }
        }
    }
    
    if all_broken_links.is_empty() {
        print_info("No broken links found");
        return Ok(());
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&all_broken_links)?);
        }
        "plain" => {
            for (note_id, note_title, broken_link) in &all_broken_links {
                println!("{}:{} -> BROKEN: {}", note_id, note_title, broken_link.target);
            }
        }
        _ => {
            let mut table = Table::new();
            table.set_header(vec!["Note", "Title", "Broken Link", "Type"]);
            
            for (note_id, note_title, broken_link) in &all_broken_links {
                table.add_row(vec![
                    Cell::new(note_id).add_attribute(Attribute::Dim),
                    Cell::new(note_title),
                    Cell::new(&broken_link.target).fg(Color::Red),
                    Cell::new(format!("{:?}", broken_link.link_type)).add_attribute(Attribute::Dim),
                ]);
            }
            
            println!("{}", table);
        }
    }
    
    print_info(&format!("Found {} broken links", all_broken_links.len()));
    
    if fix {
        print_info("Interactive fixing not implemented yet. Use 'trilium link update' for bulk updates.");
    }
    
    Ok(())
}

async fn handle_update(
    client: &TriliumClient,
    old_target: &str,
    new_target: &str,
    dry_run: bool,
    output_format: &str
) -> Result<()> {
    let action = if dry_run { "Would update" } else { "Updating" };
    print_info(&format!("{} links from '{}' to '{}'", action, old_target, new_target));
    
    // Search for notes containing the old target
    let search_query = format!("[[{}]]", old_target);
    let search_results = client.search_notes(&search_query, false, true, 1000).await?;
    
    let mut updates = Vec::new();
    
    for result in search_results {
        if let Ok(content) = client.get_note_content(&result.note_id).await {
            let mut replacements = HashMap::new();
            replacements.insert(old_target.to_string(), new_target.to_string());
            
            let new_content = replace_links(&content, &replacements)?;
            
            if new_content != content {
                let note_id = result.note_id.clone();
                updates.push((result.note_id, result.title, content.len(), new_content.len()));
                
                if !dry_run {
                    client.update_note_content(&note_id, &new_content).await?;
                }
            }
        }
    }
    
    if updates.is_empty() {
        print_info("No links to update found");
        return Ok(());
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&updates)?);
        }
        "plain" => {
            for (note_id, title, _old_len, _new_len) in &updates {
                println!("{}:{}", note_id, title);
            }
        }
        _ => {
            let mut table = Table::new();
            table.set_header(vec!["Note ID", "Title", "Status"]);
            
            for (note_id, title, _old_len, _new_len) in &updates {
                let status = if dry_run { "Would update" } else { "Updated" };
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
    print_info(&format!("{} notes {}", updates.len(), verb));
    
    Ok(())
}

async fn handle_validate(
    client: &TriliumClient,
    note_id: &str,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Validating links in note: {}", note_id));
    
    let content = client.get_note_content(note_id).await?;
    let note = client.get_note(note_id).await?;
    
    let links = parse_links(&content)?;
    
    if links.is_empty() {
        print_info("No links found in note");
        return Ok(());
    }
    
    // Get all existing note IDs for validation
    let search_results = client.search_notes("", false, true, 10000).await?;
    let existing_ids: Vec<String> = search_results.into_iter().map(|r| r.note_id).collect();
    
    let broken_links = find_broken_links(&links, &existing_ids);
    let valid_links = links.len() - broken_links.len();
    
    match output_format {
        "json" => {
            let validation_result = serde_json::json!({
                "note_id": note_id,
                "note_title": note.title,
                "total_links": links.len(),
                "valid_links": valid_links,
                "broken_links": broken_links.len(),
                "links": links,
                "broken": broken_links
            });
            println!("{}", serde_json::to_string_pretty(&validation_result)?);
        }
        "plain" => {
            println!("Total links: {}", links.len());
            println!("Valid links: {}", valid_links);
            println!("Broken links: {}", broken_links.len());
            
            for broken in &broken_links {
                println!("BROKEN: {}", broken.target);
            }
        }
        _ => {
            println!("Link Validation for: {}", note.title.green().bold());
            println!("Total links: {}", links.len());
            println!("Valid links: {}", valid_links.to_string().green());
            println!("Broken links: {}", broken_links.len().to_string().red());
            
            if !broken_links.is_empty() {
                println!("\nBroken Links:");
                for broken in &broken_links {
                    println!("  {} {}", "✗".red(), broken.target.red());
                }
            }
            
            if valid_links > 0 {
                println!("\nValid Links:");
                for link in &links {
                    if !broken_links.contains(&link) {
                        println!("  {} {}", "✓".green(), link.target);
                    }
                }
            }
        }
    }
    
    Ok(())
}