use crate::models::{Template, TemplateVariable};
use crate::error::{Result, TriliumError};
use chrono::Local;
use regex::Regex;
use std::collections::HashMap;

/// Parse template variables from content
/// Supports formats: {{variable}}, {{variable:description}}, {{variable:description:default}}
pub fn extract_template_variables(content: &str) -> Vec<TemplateVariable> {
    let var_regex = Regex::new(r"\{\{([^}]+)\}\}").unwrap();
    let mut variables = Vec::new();
    let mut seen_names = std::collections::HashSet::new();
    
    for cap in var_regex.captures_iter(content) {
        if let Some(var_match) = cap.get(1) {
            let var_spec = var_match.as_str().trim();
            let parts: Vec<&str> = var_spec.split(':').collect();
            
            let name = parts[0].trim().to_string();
            if seen_names.contains(&name) {
                continue; // Skip duplicates
            }
            seen_names.insert(name.clone());
            
            let description = if parts.len() > 1 {
                parts[1].trim().to_string()
            } else {
                format!("Value for {}", name)
            };
            
            let default_value = if parts.len() > 2 {
                Some(parts[2].trim().to_string())
            } else {
                None
            };
            
            let required = default_value.is_none() && !is_built_in_variable(&name);
            
            variables.push(TemplateVariable {
                name,
                description,
                default_value,
                required,
            });
        }
    }
    
    variables
}

/// Process template content by substituting variables with security validation
pub fn process_template(
    content: &str, 
    variables: &HashMap<String, String>,
    metadata: Option<&HashMap<String, String>>
) -> Result<String> {
    // Security: Validate input sizes
    const MAX_CONTENT_SIZE: usize = 1_000_000; // 1MB limit
    if content.len() > MAX_CONTENT_SIZE {
        return Err(TriliumError::SecurityError(
            format!("Template content too large (max {} bytes)", MAX_CONTENT_SIZE)
        ));
    }
    
    // Security: Validate variable values
    for (name, value) in variables {
        validate_template_variable(name, value)?;
    }
    
    if let Some(meta) = metadata {
        for (name, value) in meta {
            validate_template_variable(name, value)?;
        }
    }
    let var_regex = Regex::new(r"\{\{([^}]+)\}\}").unwrap();
    
    // Security: Limit number of variable substitutions to prevent DoS
    let mut substitution_count = 0;
    const MAX_SUBSTITUTIONS: usize = 1000;
    
    let result = var_regex.replace_all(content, |caps: &regex::Captures| {
        substitution_count += 1;
        if substitution_count > MAX_SUBSTITUTIONS {
            return "[TOO_MANY_SUBSTITUTIONS]".to_string();
        }
        
        if let Some(var_match) = caps.get(1) {
            let var_spec = var_match.as_str().trim();
            let parts: Vec<&str> = var_spec.split(':').collect();
            let var_name = parts[0].trim();
            
            // Security: Validate variable name
            if !is_valid_variable_name_secure(var_name) {
                return "[INVALID_VARIABLE_NAME]".to_string();
            }
            
            // Check user-provided variables first
            if let Some(value) = variables.get(var_name) {
                return sanitize_variable_value(value);
            }
            
            // Check metadata if provided
            if let Some(meta) = metadata {
                if let Some(value) = meta.get(var_name) {
                    return sanitize_variable_value(value);
                }
            }
            
            // Check built-in variables
            if let Some(value) = get_built_in_variable(var_name) {
                return sanitize_variable_value(&value);
            }
            
            // Use default value if available
            if parts.len() > 2 {
                let default_val = parts[2].trim().to_string();
                return sanitize_variable_value(&default_val);
            }
            
            // Return placeholder if no value found
            format!("{{{{ {} }}}}", sanitize_variable_name(var_name))
        } else {
            caps.get(0).unwrap().as_str().to_string()
        }
    });
    
    // Check if we hit the substitution limit
    if substitution_count > MAX_SUBSTITUTIONS {
        return Err(TriliumError::SecurityError(
            "Too many template variable substitutions - possible DoS attempt".to_string()
        ));
    }
    
    Ok(result.to_string())
}

/// Validate template variable name and value for security
fn validate_template_variable(name: &str, value: &str) -> Result<()> {
    // Security: Limit variable name length
    const MAX_NAME_LENGTH: usize = 100;
    if name.len() > MAX_NAME_LENGTH {
        return Err(TriliumError::SecurityError(
            format!("Variable name too long (max {} characters)", MAX_NAME_LENGTH)
        ));
    }
    
    // Security: Limit variable value length to prevent memory exhaustion
    const MAX_VALUE_LENGTH: usize = 10_000; // 10KB per variable
    if value.len() > MAX_VALUE_LENGTH {
        return Err(TriliumError::SecurityError(
            format!("Variable value too long (max {} characters)", MAX_VALUE_LENGTH)
        ));
    }
    
    // Security: Check for potentially dangerous content
    if value.contains("<script") || value.contains("javascript:") || 
       value.contains("data:text/html") || value.contains("vbscript:") {
        return Err(TriliumError::SecurityError(
            "Variable value contains potentially dangerous content".to_string()
        ));
    }
    
    Ok(())
}

/// Secure validation of variable names with stricter rules
fn is_valid_variable_name_secure(name: &str) -> bool {
    if name.is_empty() || name.len() > 50 {
        return false;
    }
    
    // Only allow alphanumeric characters, underscores, and hyphens
    // Must start with a letter
    name.chars().next().map_or(false, |c| c.is_ascii_alphabetic()) &&
    name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// Sanitize variable values to prevent injection attacks
fn sanitize_variable_value(value: &str) -> String {
    // Remove or escape potentially dangerous characters
    value
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
        .replace('&', "&amp;")
        .chars()
        .filter(|&c| c.is_ascii_graphic() || c.is_ascii_whitespace())
        .collect()
}

/// Sanitize variable names for safe output
fn sanitize_variable_name(name: &str) -> String {
    name.chars()
        .filter(|&c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        .collect()
}

/// Check if a variable name is a built-in template variable
fn is_built_in_variable(name: &str) -> bool {
    matches!(name.to_lowercase().as_str(), 
        "date" | "time" | "datetime" | "year" | "month" | "day" | 
        "timestamp" | "user" | "title" | "id" | "uuid")
}

/// Get value for built-in template variables
fn get_built_in_variable(name: &str) -> Option<String> {
    let now = Local::now();
    
    match name.to_lowercase().as_str() {
        "date" => Some(now.format("%Y-%m-%d").to_string()),
        "time" => Some(now.format("%H:%M:%S").to_string()),
        "datetime" => Some(now.format("%Y-%m-%d %H:%M:%S").to_string()),
        "year" => Some(now.format("%Y").to_string()),
        "month" => Some(now.format("%m").to_string()),
        "day" => Some(now.format("%d").to_string()),
        "timestamp" => Some(now.timestamp().to_string()),
        "uuid" => Some(uuid::Uuid::new_v4().to_string()),
        _ => None,
    }
}

/// Create a new template from content
pub fn create_template_from_content(
    id: String,
    title: String, 
    content: String
) -> Template {
    let variables = extract_template_variables(&content);
    
    Template {
        id,
        title,
        content,
        variables,
        description: String::new(),
    }
}

/// Validate template content for common issues
pub fn validate_template(template: &Template) -> Vec<String> {
    let mut issues = Vec::new();
    
    // Check for unclosed variable brackets
    let open_count = template.content.matches("{{").count();
    let close_count = template.content.matches("}}").count();
    if open_count != close_count {
        issues.push("Mismatched variable brackets {{ }}".to_string());
    }
    
    // Check for empty variable names
    let empty_var_regex = Regex::new(r"\{\{\s*\}\}").unwrap();
    if empty_var_regex.is_match(&template.content) {
        issues.push("Empty variable definition found".to_string());
    }
    
    // Check for variables with special characters
    let var_regex = Regex::new(r"\{\{([^}]+)\}\}").unwrap();
    for cap in var_regex.captures_iter(&template.content) {
        if let Some(var_match) = cap.get(1) {
            let var_name = var_match.as_str().split(':').next().unwrap_or("").trim();
            if !is_valid_variable_name(var_name) {
                issues.push(format!("Invalid variable name: '{}'", var_name));
            }
        }
    }
    
    issues
}

/// Check if a variable name is valid
fn is_valid_variable_name(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

/// Get commonly used template examples
pub fn get_builtin_templates() -> Vec<Template> {
    vec![
        Template {
            id: "daily-journal".to_string(),
            title: "Daily Journal".to_string(),
            content: r#"# Daily Journal - {{date}}

## Tasks for Today
- [ ] 

## Notes
{{notes:Any important notes or observations}}

## Reflection
{{reflection:What went well today?}}

## Tomorrow's Focus
{{tomorrow:What's the main priority for tomorrow?}}

---
*Created: {{datetime}}*"#.to_string(),
            variables: extract_template_variables(r#"# Daily Journal - {{date}}

## Tasks for Today
- [ ] 

## Notes
{{notes:Any important notes or observations}}

## Reflection
{{reflection:What went well today?}}

## Tomorrow's Focus
{{tomorrow:What's the main priority for tomorrow?}}

---
*Created: {{datetime}}*"#),
            description: "Template for daily journal entries".to_string(),
        },
        Template {
            id: "meeting-notes".to_string(),
            title: "Meeting Notes".to_string(),
            content: r#"# {{title:Meeting Title}}

**Date:** {{date}}
**Time:** {{time:Meeting time}}
**Attendees:** {{attendees:List of attendees}}

## Agenda
{{agenda:Meeting agenda items}}

## Discussion Notes
{{notes:Key discussion points}}

## Action Items
- [ ] {{action1:First action item}}
- [ ] {{action2:Second action item}}

## Next Meeting
{{next:Next meeting date/time}}

---
*Notes taken: {{datetime}}*"#.to_string(),
            variables: extract_template_variables(r#"# {{title:Meeting Title}}

**Date:** {{date}}
**Time:** {{time:Meeting time}}
**Attendees:** {{attendees:List of attendees}}

## Agenda
{{agenda:Meeting agenda items}}

## Discussion Notes
{{notes:Key discussion points}}

## Action Items
- [ ] {{action1:First action item}}
- [ ] {{action2:Second action item}}

## Next Meeting
{{next:Next meeting date/time}}

---
*Notes taken: {{datetime}}*"#),
            description: "Template for meeting notes and action items".to_string(),
        },
        Template {
            id: "project-planning".to_string(),
            title: "Project Planning".to_string(),
            content: r#"# {{title:Project Name}}

## Overview
{{overview:Brief project description}}

## Goals & Objectives
{{goals:Primary goals and success criteria}}

## Timeline
- **Start Date:** {{start_date:Project start date}}
- **End Date:** {{end_date:Expected completion date}}
- **Milestones:** {{milestones:Key project milestones}}

## Resources
{{resources:Required resources and team members}}

## Risks & Mitigation
{{risks:Potential risks and mitigation strategies}}

## Status Updates
{{status:Current project status}}

---
*Project created: {{datetime}}*
*Project ID: {{uuid}}*"#.to_string(),
            variables: extract_template_variables(r#"# {{title:Project Name}}

## Overview
{{overview:Brief project description}}

## Goals & Objectives
{{goals:Primary goals and success criteria}}

## Timeline
- **Start Date:** {{start_date:Project start date}}
- **End Date:** {{end_date:Expected completion date}}
- **Milestones:** {{milestones:Key project milestones}}

## Resources
{{resources:Required resources and team members}}

## Risks & Mitigation
{{risks:Potential risks and mitigation strategies}}

## Status Updates
{{status:Current project status}}

---
*Project created: {{datetime}}*
*Project ID: {{uuid}}*"#),
            description: "Template for project planning and tracking".to_string(),
        },
    ]
}

/// Convert template to interactive form data for CLI input
pub fn template_to_form_fields(template: &Template) -> Vec<(String, String, Option<String>, bool)> {
    template.variables.iter()
        .map(|var| (
            var.name.clone(),
            var.description.clone(),
            var.default_value.clone(),
            var.required
        ))
        .collect()
}

/// Process template title with variables
pub fn process_template_title(
    title: &str,
    variables: &HashMap<String, String>,
    metadata: Option<&HashMap<String, String>>
) -> Result<String> {
    process_template(title, variables, metadata)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_template_variables() {
        let content = "Hello {{name}} on {{date}}! Your {{task:What to do}} is {{priority:Priority level:medium}}.";
        let variables = extract_template_variables(content);
        
        assert_eq!(variables.len(), 4);
        assert_eq!(variables[0].name, "name");
        assert!(variables[0].required);
        
        assert_eq!(variables[1].name, "date");
        assert!(!variables[1].required); // Built-in variable
        
        assert_eq!(variables[2].name, "task");
        assert_eq!(variables[2].description, "What to do");
        assert!(variables[2].required);
        
        assert_eq!(variables[3].name, "priority");
        assert_eq!(variables[3].description, "Priority level");
        assert_eq!(variables[3].default_value, Some("medium".to_string()));
        assert!(!variables[3].required);
    }

    #[test]
    fn test_process_template() {
        let content = "Hello {{name}}! Today is {{date}} and your task is {{task:What to do:default task}}.";
        let mut variables = HashMap::new();
        variables.insert("name".to_string(), "Alice".to_string());
        
        let result = process_template(content, &variables, None).unwrap();
        
        assert!(result.contains("Hello Alice!"));
        assert!(result.contains("your task is default task"));
        // Date should be filled with current date
        assert!(!result.contains("{{date}}"));
    }

    #[test]
    fn test_is_valid_variable_name() {
        assert!(is_valid_variable_name("valid_name"));
        assert!(is_valid_variable_name("test123"));
        assert!(is_valid_variable_name("my-var"));
        assert!(!is_valid_variable_name(""));
        assert!(!is_valid_variable_name("invalid name"));
        assert!(!is_valid_variable_name("special@char"));
    }

    #[test]
    fn test_validate_template() {
        let good_template = Template {
            id: "test".to_string(),
            title: "Test".to_string(),
            content: "Hello {{name}}!".to_string(),
            variables: vec![],
            description: "".to_string(),
        };
        assert!(validate_template(&good_template).is_empty());
        
        let bad_template = Template {
            id: "test".to_string(),
            title: "Test".to_string(),
            content: "Hello {{name}! Missing close bracket".to_string(),
            variables: vec![],
            description: "".to_string(),
        };
        assert!(!validate_template(&bad_template).is_empty());
    }
    
    #[test]
    fn test_template_security_validation() {
        let mut variables = HashMap::new();
        variables.insert("test".to_string(), "<script>alert('xss')</script>".to_string());
        
        let result = process_template("Hello {{test}}", &variables, None).unwrap();
        assert!(!result.contains("<script>"));
        assert!(result.contains("&lt;script&gt;"));
    }
    
    #[test]
    fn test_template_variable_limits() {
        // Test variable value length limit
        let mut variables = HashMap::new();
        let long_value = "a".repeat(20000);
        variables.insert("test".to_string(), long_value);
        
        let result = process_template("{{test}}", &variables, None);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_template_substitution_limit() {
        // Create a template with many variables to test substitution limit
        let template_parts: Vec<String> = (0..50).map(|i| format!("{{var{}}}", i)).collect();
        let template = template_parts.join(" ");
        
        let variables = HashMap::new();
        let result = process_template(&template, &variables, None);
        assert!(result.is_ok()); // Should be fine with 50 substitutions
    }
    
    #[test]
    fn test_secure_variable_name_validation() {
        assert!(is_valid_variable_name_secure("valid_name"));
        assert!(is_valid_variable_name_secure("test123"));
        assert!(!is_valid_variable_name_secure(""));
        assert!(!is_valid_variable_name_secure("123invalid"));
        assert!(!is_valid_variable_name_secure("invalid name"));
        assert!(!is_valid_variable_name_secure("very_long_variable_name_that_exceeds_the_maximum_allowed_length"));
    }
}