use crate::api::TriliumClient;
use crate::cli::output::{print_attributes, print_success, print_warning};
use crate::config::Config;
use crate::error::Result;
use crate::models::{CreateAttributeRequest, UpdateAttributeRequest};
use crate::cli::args::AttributeCommands;
use std::io::{self, Write};

pub async fn handle(command: AttributeCommands, config: &Config, output_format: &str) -> Result<()> {
    let client = TriliumClient::new(config)?;

    match command {
        AttributeCommands::Create {
            note_id,
            attr_type,
            name,
            value,
            inheritable,
        } => {
            let attr_value = value;
            
            let request = CreateAttributeRequest {
                note_id: note_id.clone(),
                attr_type: attr_type.clone(),
                name: name.clone(),
                value: attr_value,
                is_inheritable: Some(inheritable),
                position: None,
            };

            let attribute = client.create_attribute(request).await?;
            print_success(&format!("Created attribute: {} = {}", attribute.name, attribute.value));
            print_attributes(&[attribute], output_format);
            Ok(())
        }

        AttributeCommands::List { note_id } => {
            let attributes = client.get_note_attributes(&note_id).await?;
            
            if attributes.is_empty() {
                print_warning(&format!("No attributes found for note: {}", note_id));
            } else {
                print_attributes(&attributes, output_format);
            }
            Ok(())
        }

        AttributeCommands::Update { attribute_id, value, inheritable: _ } => {
            let request = UpdateAttributeRequest {
                value: value.unwrap_or_default(),
                position: None,
            };

            let attribute = client.update_attribute(&attribute_id, request).await?;
            print_success(&format!("Updated attribute: {} = {}", attribute.name, attribute.value));
            Ok(())
        }

        AttributeCommands::Delete { attribute_id, force } => {
            if !force {
                print!("Are you sure you want to delete attribute {}? [y/N] ", attribute_id);
                io::stdout().flush()
                    .map_err(|e| crate::error::TriliumError::InputError(format!("Failed to flush stdout: {}", e)))?;
                let mut input = String::new();
                io::stdin().read_line(&mut input)
                    .map_err(|e| crate::error::TriliumError::InputError(format!("Failed to read user input: {}", e)))?;
                if !input.trim().eq_ignore_ascii_case("y") {
                    print_warning("Deletion cancelled");
                    return Ok(());
                }
            }

            client.delete_attribute(&attribute_id).await?;
            print_success(&format!("Deleted attribute: {}", attribute_id));
            Ok(())
        }
    }
}