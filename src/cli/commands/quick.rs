use crate::api::TriliumClient;
use crate::cli::output::print_info;
use crate::config::Config;
use crate::error::{Result, TriliumError};
use crate::models::CreateAttributeRequest;
use crate::utils::quick_capture::{
    batch_process_captures, detect_and_process_format,
    quick_capture_to_note_request, validate_capture_request, get_or_create_inbox_config
};
use atty::Stream;
use colored::*;
use std::io::{self, Read};

pub async fn handle(
    content: Option<String>,
    title: Option<String>,
    tags: Option<String>,
    format: String,
    batch: Option<String>,
    quiet: bool,
    inbox: Option<String>,
    config: &Config,
    output_format: &str
) -> Result<()> {
    let client = TriliumClient::new(config)?;
    
    // Get input content
    let input_content = if let Some(content) = content {
        content
    } else if atty::is(Stream::Stdin) {
        return Err(TriliumError::ValidationError(
            "No content provided. Use --help to see usage or pipe content via stdin".to_string()
        ));
    } else {
        // Read from stdin
        let mut buffer = String::new();
        io::stdin().read_to_string(&mut buffer)?;
        buffer
    };
    
    if input_content.trim().is_empty() {
        return Err(TriliumError::ValidationError(
            "Empty content provided".to_string()
        ));
    }
    
    // Get inbox configuration
    let inbox_config = get_or_create_inbox_config();
    let inbox_id = inbox
        .or_else(|| config.current_profile().unwrap().bookmarked_notes.first().map(|b| b.note_id.clone())) // Use first bookmarked note as inbox
        .unwrap_or_else(|| config.current_profile().unwrap().default_parent_id.clone());
    
    // Process captures
    let captures = if let Some(delimiter) = batch {
        batch_process_captures(&input_content, &delimiter, Some(&inbox_id))?
    } else {
        let format_hint = if format == "auto" { None } else { Some(format.as_str()) };
        vec![detect_and_process_format(&input_content, format_hint)?]
    };
    
    let mut created_notes = Vec::new();
    
    for mut capture in captures {
        // Override with command-line options
        if let Some(ref title) = title {
            capture.title = Some(title.clone());
        }
        
        if let Some(ref tags_str) = tags {
            let additional_tags: Vec<String> = tags_str
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            capture.tags.extend(additional_tags);
        }
        
        capture.inbox_note_id = Some(inbox_id.clone());
        
        // Validate capture
        let issues = validate_capture_request(&capture);
        if !issues.is_empty() {
            if !quiet {
                eprintln!("{} Validation issues:", "⚠".yellow());
                for issue in &issues {
                    eprintln!("  {}", issue);
                }
            }
            continue;
        }
        
        // Create note
        let note_request = quick_capture_to_note_request(
            &capture, 
            &inbox_id, 
            &inbox_config.get("note_type").unwrap_or(&"text".to_string())
        );
        
        match client.create_note(note_request).await {
            Ok(note) => {
                // Add tags as attributes
                for tag in &capture.tags {
                    let tag_request = CreateAttributeRequest {
                        note_id: note.note_id.clone(),
                        attr_type: "label".to_string(),
                        name: tag.clone(),
                        value: String::new(),
                        is_inheritable: Some(false),
                        position: None,
                    };
                    
                    if let Err(e) = client.create_attribute(tag_request).await {
                        if !quiet {
                            eprintln!("{} Failed to add tag '{}': {}", "⚠".yellow(), tag, e);
                        }
                    }
                }
                
                // Add quick capture metadata
                let capture_attr = CreateAttributeRequest {
                    note_id: note.note_id.clone(),
                    attr_type: "label".to_string(),
                    name: "quickCapture".to_string(),
                    value: chrono::Utc::now().to_rfc3339(),
                    is_inheritable: Some(false),
                    position: None,
                };
                
                let _ = client.create_attribute(capture_attr).await;
                
                created_notes.push(note);
            }
            Err(e) => {
                if !quiet {
                    eprintln!("{} Failed to create note: {}", "✗".red(), e);
                }
            }
        }
    }
    
    if created_notes.is_empty() {
        if !quiet {
            print_info("No notes were created");
        }
        return Ok(());
    }
    
    // Output results
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&created_notes)?);
        }
        "plain" => {
            for note in &created_notes {
                if quiet {
                    println!("{}", note.note_id);
                } else {
                    println!("{}:{}", note.note_id, note.title);
                }
            }
        }
        _ => {
            if quiet {
                for note in &created_notes {
                    println!("{}", note.note_id);
                }
            } else {
                println!("{} {} quick note(s):", 
                    "✓".green(), 
                    if created_notes.len() == 1 { "Created" } else { "Created" }
                );
                
                for note in &created_notes {
                    println!("  {} {} {}", 
                        "•".cyan(), 
                        note.title.green(),
                        note.note_id.dimmed()
                    );
                }
                
                if created_notes.len() > 1 {
                    println!("\n{} Created {} notes in inbox", 
                        "📝".to_string(),
                        created_notes.len().to_string().bold()
                    );
                }
            }
        }
    }
    
    Ok(())
}