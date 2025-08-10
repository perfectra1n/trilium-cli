use crate::api::TriliumClient;
use crate::cli::args::TemplateCommands;
use crate::cli::output::print_info;
use crate::config::Config;
use crate::error::{Result, TriliumError};
use crate::models::{CreateNoteRequest, CreateAttributeRequest};
use crate::utils::templates::{
    process_template, validate_template, 
    create_template_from_content, get_builtin_templates
};
use colored::*;
use comfy_table::{Table, Attribute, Cell, Color};
use std::collections::HashMap;
use std::io::{self, Write};

pub async fn handle(command: TemplateCommands, config: &Config, output_format: &str) -> Result<()> {
    let client = TriliumClient::new(config)?;
    
    match command {
        TemplateCommands::List { detailed } => {
            handle_list(&client, detailed, output_format).await
        }
        TemplateCommands::Create { title, content, description, edit } => {
            handle_create(&client, &title, content, description, edit, config, output_format).await
        }
        TemplateCommands::Show { template, variables } => {
            handle_show(&client, &template, variables, output_format).await
        }
        TemplateCommands::Use { template, parent, variables, interactive, edit } => {
            handle_use(&client, &template, parent, variables, interactive, edit, config, output_format).await
        }
        TemplateCommands::Update { template_id, title, description, edit } => {
            handle_update(&client, &template_id, title, description, edit, config, output_format).await
        }
        TemplateCommands::Delete { template_id, force } => {
            handle_delete(&client, &template_id, force, output_format).await
        }
        TemplateCommands::Validate { template } => {
            handle_validate(&client, &template, output_format).await
        }
    }
}

async fn handle_list(
    client: &TriliumClient,
    detailed: bool,
    output_format: &str
) -> Result<()> {
    print_info("Retrieving templates...");
    
    let mut templates = client.get_templates().await?;
    
    // Add built-in templates
    templates.extend(get_builtin_templates());
    
    if templates.is_empty() {
        print_info("No templates found");
        return Ok(());
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&templates)?);
        }
        "plain" => {
            for template in &templates {
                if detailed {
                    println!("{}:{}:{}", template.id, template.title, template.description);
                } else {
                    println!("{}:{}", template.id, template.title);
                }
            }
        }
        _ => {
            let mut table = Table::new();
            if detailed {
                table.set_header(vec!["ID", "Title", "Description", "Variables"]);
                for template in &templates {
                    table.add_row(vec![
                        Cell::new(&template.id).add_attribute(Attribute::Dim),
                        Cell::new(&template.title).fg(Color::Green),
                        Cell::new(&template.description),
                        Cell::new(template.variables.len().to_string()).fg(Color::Yellow),
                    ]);
                }
            } else {
                table.set_header(vec!["ID", "Title", "Variables"]);
                for template in &templates {
                    table.add_row(vec![
                        Cell::new(&template.id).add_attribute(Attribute::Dim),
                        Cell::new(&template.title).fg(Color::Green),
                        Cell::new(template.variables.len().to_string()).fg(Color::Yellow),
                    ]);
                }
            }
            
            println!("{}", table);
        }
    }
    
    print_info(&format!("Found {} templates", templates.len()));
    Ok(())
}

async fn handle_create(
    client: &TriliumClient,
    title: &str,
    content: Option<String>,
    description: Option<String>,
    edit: bool,
    config: &Config,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Creating template: {}", title));
    
    let template_content = if let Some(content) = content {
        content
    } else if edit {
        // Open editor for template content
        let temp_content = "# Template Content\n\n{{content:Main template content}}\n\n---\n*Created: {{datetime}}*";
        edit::edit(temp_content)?
    } else {
        return Err(TriliumError::ValidationError(
            "Template content must be provided or use --edit flag".to_string()
        ));
    };
    
    let template = create_template_from_content(
        uuid::Uuid::new_v4().to_string(),
        title.to_string(),
        template_content.clone()
    );
    
    // Validate template
    let issues = validate_template(&template);
    if !issues.is_empty() {
        print_info("Template validation issues:");
        for issue in &issues {
            println!("  {} {}", "⚠".yellow(), issue);
        }
        
        print!("Continue anyway? (y/N): ");
        io::stdout().flush()?;
        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        if !input.trim().to_lowercase().starts_with('y') {
            return Ok(());
        }
    }
    
    // Create note for template
    let request = CreateNoteRequest {
        parent_note_id: config.current_profile().unwrap().default_parent_id.clone(),
        title: format!("Template: {}", title),
        note_type: "text".to_string(),
        content: template_content,
        note_position: None,
        prefix: None,
        is_expanded: Some(false),
        is_protected: Some(false),
    };
    
    let note = client.create_note(request).await?;
    
    // Add template attribute
    let template_attr = CreateAttributeRequest {
        note_id: note.note_id.clone(),
        attr_type: "label".to_string(),
        name: "template".to_string(),
        value: String::new(),
        is_inheritable: Some(false),
        position: None,
    };
    client.create_attribute(template_attr).await?;
    
    // Add description if provided
    if let Some(desc) = description {
        let desc_attr = CreateAttributeRequest {
            note_id: note.note_id.clone(),
            attr_type: "label".to_string(),
            name: "templateDescription".to_string(),
            value: desc,
            is_inheritable: Some(false),
            position: None,
        };
        client.create_attribute(desc_attr).await?;
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&note)?);
        }
        _ => {
            println!("{} Created template '{}' with ID: {}", 
                "✓".green(), 
                title.cyan(), 
                note.note_id.dimmed()
            );
        }
    }
    
    Ok(())
}

async fn handle_show(
    client: &TriliumClient,
    template: &str,
    show_variables: bool,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Showing template: {}", template));
    
    // Try to find template by ID or title
    let mut templates = client.get_templates().await?;
    templates.extend(get_builtin_templates());
    
    let template_obj = templates
        .iter()
        .find(|t| t.id == template || t.title == template)
        .ok_or_else(|| TriliumError::NotFound(format!("Template not found: {}", template)))?;
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(template_obj)?);
        }
        _ => {
            println!("{}", template_obj.title.bold().underline());
            
            if !template_obj.description.is_empty() {
                println!("{}", template_obj.description);
                println!();
            }
            
            if show_variables && !template_obj.variables.is_empty() {
                println!("{}", "Variables:".bold());
                for var in &template_obj.variables {
                    let required = if var.required { " (required)" } else { "" };
                    let default = if let Some(default) = &var.default_value {
                        format!(" [default: {}]", default)
                    } else {
                        String::new()
                    };
                    
                    println!("  {} {}: {}{}{}", 
                        "•".cyan(), 
                        var.name.bold(),
                        var.description,
                        default.dimmed(),
                        required.red()
                    );
                }
                println!();
            }
            
            println!("{}", "Content:".bold());
            println!("{}", template_obj.content);
        }
    }
    
    Ok(())
}

async fn handle_use(
    client: &TriliumClient,
    template: &str,
    parent: Option<String>,
    variables: Vec<String>,
    interactive: bool,
    edit: bool,
    config: &Config,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Using template: {}", template));
    
    // Find template
    let mut templates = client.get_templates().await?;
    templates.extend(get_builtin_templates());
    
    let template_obj = templates
        .iter()
        .find(|t| t.id == template || t.title == template)
        .ok_or_else(|| TriliumError::NotFound(format!("Template not found: {}", template)))?;
    
    // Parse provided variables
    let mut var_map = HashMap::new();
    for var_str in variables {
        let parts: Vec<&str> = var_str.splitn(2, '=').collect();
        if parts.len() == 2 {
            var_map.insert(parts[0].to_string(), parts[1].to_string());
        }
    }
    
    // Interactive variable input
    if interactive {
        println!("{}", "Template Variables:".bold());
        for var in &template_obj.variables {
            if var_map.contains_key(&var.name) {
                continue; // Skip if already provided
            }
            
            let prompt = if let Some(default) = &var.default_value {
                format!("{} [{}]: ", var.description, default)
            } else if var.required {
                format!("{} (required): ", var.description)
            } else {
                format!("{}: ", var.description)
            };
            
            print!("{}", prompt);
            io::stdout().flush()?;
            
            let mut input = String::new();
            io::stdin().read_line(&mut input)?;
            let input = input.trim();
            
            if !input.is_empty() {
                var_map.insert(var.name.clone(), input.to_string());
            } else if var.required && var.default_value.is_none() {
                return Err(TriliumError::ValidationError(
                    format!("Required variable '{}' not provided", var.name)
                ));
            }
        }
    }
    
    // Process template
    let processed_content = process_template(&template_obj.content, &var_map, None)?;
    let _processed_title = process_template(&template_obj.title, &var_map, None)?;
    
    let final_content = if edit {
        edit::edit(&processed_content)?
    } else {
        processed_content
    };
    
    // Create note from template
    let parent_id = parent.unwrap_or_else(|| config.current_profile().unwrap().default_parent_id.clone());
    let note = client.create_note_from_template(&template_obj.id, var_map, &parent_id).await?;
    
    // Update with processed content if different
    if final_content != template_obj.content {
        client.update_note_content(&note.note_id, &final_content).await?;
    }
    
    match output_format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(&note)?);
        }
        _ => {
            println!("{} Created note from template '{}' with ID: {}", 
                "✓".green(), 
                template_obj.title.cyan(), 
                note.note_id.dimmed()
            );
        }
    }
    
    Ok(())
}

async fn handle_update(
    client: &TriliumClient,
    template_id: &str,
    title: Option<String>,
    description: Option<String>,
    edit: bool,
    _config: &Config,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Updating template: {}", template_id));
    
    let _note = client.get_note(template_id).await?;
    
    let mut updates = Vec::new();
    
    if let Some(new_title) = title {
        updates.push(("title", new_title.clone()));
        let update_request = crate::models::UpdateNoteRequest {
            title: Some(format!("Template: {}", new_title)),
            note_type: None,
            mime: None,
            content: None,
            is_protected: None,
        };
        client.update_note(template_id, update_request).await?;
    }
    
    if let Some(new_desc) = description {
        updates.push(("description", new_desc.clone()));
        
        // Update or create description attribute
        let attributes = client.get_note_attributes(template_id).await?;
        let desc_attr = attributes.iter().find(|a| a.name == "templateDescription");
        
        if let Some(attr) = desc_attr {
            let update_request = crate::models::UpdateAttributeRequest {
                value: new_desc,
                position: None,
            };
            client.update_attribute(&attr.attribute_id, update_request).await?;
        } else {
            let create_request = CreateAttributeRequest {
                note_id: template_id.to_string(),
                attr_type: "label".to_string(),
                name: "templateDescription".to_string(),
                value: new_desc,
                is_inheritable: Some(false),
                position: None,
            };
            client.create_attribute(create_request).await?;
        }
    }
    
    if edit {
        let current_content = client.get_note_content(template_id).await?;
        let new_content = edit::edit(&current_content)?;
        
        if new_content != current_content {
            client.update_note_content(template_id, &new_content).await?;
            updates.push(("content", "updated".to_string()));
        }
    }
    
    if updates.is_empty() {
        print_info("No updates specified");
        return Ok(());
    }
    
    match output_format {
        "json" => {
            let result = serde_json::json!({
                "template_id": template_id,
                "updates": updates
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        }
        _ => {
            println!("{} Updated template {}", 
                "✓".green(), 
                template_id.dimmed()
            );
            for (field, value) in updates {
                println!("  {} {}: {}", "•".cyan(), field, value);
            }
        }
    }
    
    Ok(())
}

async fn handle_delete(
    client: &TriliumClient,
    template_id: &str,
    force: bool,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Deleting template: {}", template_id));
    
    let note = client.get_note(template_id).await?;
    
    if !force {
        print!("Delete template '{}' ({})?", note.title, template_id);
        print!(" This action cannot be undone. (y/N): ");
        io::stdout().flush()?;
        
        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        if !input.trim().to_lowercase().starts_with('y') {
            print_info("Template deletion cancelled");
            return Ok(());
        }
    }
    
    client.delete_note(template_id).await?;
    
    match output_format {
        "json" => {
            let result = serde_json::json!({
                "status": "deleted",
                "template_id": template_id,
                "title": note.title
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        }
        _ => {
            println!("{} Deleted template '{}' ({})", 
                "✓".green(), 
                note.title.cyan(), 
                template_id.dimmed()
            );
        }
    }
    
    Ok(())
}

async fn handle_validate(
    client: &TriliumClient,
    template: &str,
    output_format: &str
) -> Result<()> {
    print_info(&format!("Validating template: {}", template));
    
    // Try to find template by ID or check if it's a file path
    let template_obj = if std::path::Path::new(template).exists() {
        // Read from file
        let content = std::fs::read_to_string(template)?;
        create_template_from_content(
            "file".to_string(),
            template.to_string(),
            content
        )
    } else {
        // Find in Trilium
        let mut templates = client.get_templates().await?;
        templates.extend(get_builtin_templates());
        
        templates
            .into_iter()
            .find(|t| t.id == template || t.title == template)
            .ok_or_else(|| TriliumError::NotFound(format!("Template not found: {}", template)))?
    };
    
    let issues = validate_template(&template_obj);
    
    match output_format {
        "json" => {
            let result = serde_json::json!({
                "template_id": template_obj.id,
                "template_title": template_obj.title,
                "valid": issues.is_empty(),
                "issues": issues,
                "variables": template_obj.variables
            });
            println!("{}", serde_json::to_string_pretty(&result)?);
        }
        _ => {
            if issues.is_empty() {
                println!("{} Template '{}' is valid", 
                    "✓".green(), 
                    template_obj.title.cyan()
                );
            } else {
                println!("{} Template '{}' has issues:", 
                    "⚠".yellow(), 
                    template_obj.title.cyan()
                );
                for issue in &issues {
                    println!("  {} {}", "•".red(), issue);
                }
            }
            
            if !template_obj.variables.is_empty() {
                println!("\n{}", "Variables:".bold());
                for var in &template_obj.variables {
                    let status = if var.required { "required".red() } else { "optional".green() };
                    println!("  {} {}: {} ({})", 
                        "•".cyan(), 
                        var.name.bold(),
                        var.description,
                        status
                    );
                }
            }
        }
    }
    
    Ok(())
}