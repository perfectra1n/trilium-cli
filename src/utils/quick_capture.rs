use crate::models::{QuickCaptureRequest, CreateNoteRequest};
use crate::utils::tags::extract_tags_from_content;
use crate::error::{Result, TriliumError};
use chrono::{Local, Utc};
use std::collections::HashMap;

/// Process quick capture input and extract metadata with size validation
pub fn process_quick_capture(
    input: &str,
    default_inbox_id: Option<&str>
) -> Result<QuickCaptureRequest> {
    // Security: Validate input size to prevent memory exhaustion
    const MAX_INPUT_SIZE: usize = 10_000; // 10KB limit for individual capture
    if input.len() > MAX_INPUT_SIZE {
        return Err(TriliumError::SecurityError(
            format!("Input too large (max {} bytes)", MAX_INPUT_SIZE)
        ));
    }
    let mut request = QuickCaptureRequest {
        content: input.to_string(),
        tags: Vec::new(),
        title: None,
        inbox_note_id: default_inbox_id.map(|s| s.to_string()),
        metadata: HashMap::new(),
    };
    
    // Extract title from first line if it looks like a title
    let lines: Vec<&str> = input.lines().collect();
    if !lines.is_empty() {
        let first_line = lines[0].trim();
        if is_likely_title(first_line) {
            request.title = Some(first_line.to_string());
            // Remove title from content if we extracted it
            if lines.len() > 1 {
                request.content = lines[1..].join("\n").trim().to_string();
            } else {
                request.content = String::new();
            }
        }
    }
    
    // Extract tags from content
    request.tags = extract_tags_from_content(&request.content);
    
    // Add capture metadata
    request.metadata.insert("captured_at".to_string(), Utc::now().to_rfc3339());
    request.metadata.insert("capture_method".to_string(), "quick".to_string());
    
    Ok(request)
}

/// Determine if a line looks like a title
fn is_likely_title(line: &str) -> bool {
    if line.is_empty() {
        return false;
    }
    
    // Title patterns:
    // - Starts with # (markdown header)
    // - Is relatively short (< 100 chars)
    // - Doesn't end with punctuation suggesting continuation
    // - First character is uppercase or special
    
    if line.starts_with('#') {
        return true;
    }
    
    if line.len() > 100 {
        return false;
    }
    
    // Avoid treating lines ending with sentence punctuation as titles
    if line.ends_with('.') || line.ends_with(',') || line.ends_with(';') {
        return false;
    }
    
    // Check if first character suggests a title
    let first_char = line.chars().next().unwrap();
    first_char.is_uppercase() || first_char.is_numeric() || "\"'([{".contains(first_char)
}

/// Create a note request from quick capture data
pub fn quick_capture_to_note_request(
    capture: &QuickCaptureRequest,
    parent_id: &str,
    note_type: &str
) -> CreateNoteRequest {
    let title = capture.title.clone().unwrap_or_else(|| {
        generate_auto_title(&capture.content, &capture.tags)
    });
    
    CreateNoteRequest {
        parent_note_id: parent_id.to_string(),
        title,
        note_type: note_type.to_string(),
        content: capture.content.clone(),
        note_position: None,
        prefix: None,
        is_expanded: Some(false),
        is_protected: Some(false),
    }
}

/// Generate an automatic title for captured content
fn generate_auto_title(content: &str, tags: &[String]) -> String {
    // Try to extract title from content patterns
    let lines: Vec<&str> = content.lines().collect();
    
    if lines.is_empty() {
        return format!("Quick Note {}", Local::now().format("%Y-%m-%d %H:%M"));
    }
    
    let first_line = lines[0].trim();
    
    // If first line is short and doesn't end with punctuation, use it
    if !first_line.is_empty() && first_line.len() <= 60 && !first_line.ends_with('.') {
        return first_line.to_string();
    }
    
    // Try to find a sentence or phrase to use as title
    let words: Vec<&str> = content.split_whitespace().collect();
    if !words.is_empty() {
        let mut title_words = Vec::new();
        for word in words.iter().take(8) {
            title_words.push(*word);
            if word.ends_with('.') || word.ends_with('!') || word.ends_with('?') {
                break;
            }
        }
        
        let candidate_title = title_words.join(" ");
        if !candidate_title.is_empty() {
            return candidate_title.trim_end_matches('.').to_string();
        }
    }
    
    // Use primary tag if available
    if !tags.is_empty() {
        return format!("{} Note {}", tags[0].replace('/', " "), Local::now().format("%m-%d"));
    }
    
    // Default fallback
    format!("Quick Note {}", Local::now().format("%Y-%m-%d %H:%M"))
}

/// Batch process multiple quick captures from delimited input with size limits
pub fn batch_process_captures(
    input: &str,
    delimiter: &str,
    default_inbox_id: Option<&str>
) -> Result<Vec<QuickCaptureRequest>> {
    // Security: Validate total batch size to prevent memory exhaustion
    const MAX_BATCH_SIZE: usize = 100_000; // 100KB total limit for batch operations
    const MAX_BATCH_COUNT: usize = 50; // Maximum number of captures in a batch
    
    if input.len() > MAX_BATCH_SIZE {
        return Err(TriliumError::SecurityError(
            format!("Batch input too large (max {} bytes)", MAX_BATCH_SIZE)
        ));
    }
    
    let sections: Vec<&str> = input.split(delimiter).collect();
    
    if sections.len() > MAX_BATCH_COUNT {
        return Err(TriliumError::SecurityError(
            format!("Too many captures in batch (max {})", MAX_BATCH_COUNT)
        ));
    }
    
    let mut captures = Vec::new();
    
    for section in sections {
        let section = section.trim();
        if !section.is_empty() {
            let capture = process_quick_capture(section, default_inbox_id)?;
            captures.push(capture);
        }
    }
    
    Ok(captures)
}

/// Detect and process different input formats with validation
pub fn detect_and_process_format(input: &str, format_hint: Option<&str>) -> Result<QuickCaptureRequest> {
    let format = format_hint.unwrap_or("auto");
    
    match format {
        "json" => process_json_capture(input),
        "markdown" => process_markdown_capture(input),
        "todo" => process_todo_capture(input),
        _ => process_quick_capture(input, None),
    }
}

/// Process JSON-formatted quick capture with validation
fn process_json_capture(input: &str) -> Result<QuickCaptureRequest> {
    // Security: Validate JSON size before parsing
    const MAX_JSON_SIZE: usize = 50_000; // 50KB limit for JSON input
    if input.len() > MAX_JSON_SIZE {
        return Err(TriliumError::SecurityError(
            format!("JSON input too large (max {} bytes)", MAX_JSON_SIZE)
        ));
    }
    
    // Try to parse as JSON first
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(input) {
        let mut request = QuickCaptureRequest::default();
        
        if let Some(content) = value.get("content").and_then(|v| v.as_str()) {
            // Security: Validate content size
            if content.len() > 10_000 {
                return Err(TriliumError::SecurityError(
                    "Content field too large in JSON input".to_string()
                ));
            }
            request.content = content.to_string();
        } else {
            request.content = input.to_string();
        }
        
        if let Some(title) = value.get("title").and_then(|v| v.as_str()) {
            // Security: Validate title size
            if title.len() > 500 {
                return Err(TriliumError::SecurityError(
                    "Title field too large in JSON input".to_string()
                ));
            }
            request.title = Some(title.to_string());
        }
        
        if let Some(tags) = value.get("tags").and_then(|v| v.as_array()) {
            // Security: Limit number of tags
            const MAX_TAGS: usize = 20;
            if tags.len() > MAX_TAGS {
                return Err(TriliumError::SecurityError(
                    format!("Too many tags in JSON input (max {})", MAX_TAGS)
                ));
            }
            
            request.tags = tags.iter()
                .filter_map(|v| v.as_str())
                .take(MAX_TAGS) // Additional safety limit
                .map(|s| s.to_string())
                .collect();
        }
        
        return Ok(request);
    }
    
    // Fall back to regular processing
    process_quick_capture(input, None)
}

/// Process markdown-formatted input with validation
fn process_markdown_capture(input: &str) -> Result<QuickCaptureRequest> {
    let mut request = process_quick_capture(input, None)?;
    
    // Parse markdown headers for title
    let lines: Vec<&str> = input.lines().collect();
    for line in &lines {
        if line.starts_with("# ") {
            request.title = Some(line[2..].trim().to_string());
            break;
        }
    }
    
    // Extract tags from markdown format (#tag)
    let additional_tags = extract_tags_from_content(input);
    
    // Security: Limit total number of tags
    const MAX_TOTAL_TAGS: usize = 30;
    request.tags.extend(additional_tags);
    if request.tags.len() > MAX_TOTAL_TAGS {
        request.tags.truncate(MAX_TOTAL_TAGS);
    }
    
    Ok(request)
}

/// Process todo list format with validation
fn process_todo_capture(input: &str) -> Result<QuickCaptureRequest> {
    let mut request = process_quick_capture(input, None)?;
    
    // Convert bullet points to proper todo format
    let lines: Vec<&str> = input.lines().collect();
    
    // Security: Limit number of todo lines to prevent memory exhaustion
    const MAX_TODO_LINES: usize = 200;
    if lines.len() > MAX_TODO_LINES {
        return Err(TriliumError::SecurityError(
            format!("Too many lines in todo input (max {})", MAX_TODO_LINES)
        ));
    }
    
    let mut todo_lines = Vec::new();
    
    for line in lines {
        let trimmed = line.trim();
        if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
            todo_lines.push(format!("- [ ] {}", &trimmed[2..]));
        } else if trimmed.starts_with("+ ") {
            todo_lines.push(format!("- [ ] {}", &trimmed[2..]));
        } else {
            todo_lines.push(line.to_string());
        }
    }
    
    request.content = todo_lines.join("\n");
    
    if request.title.is_none() {
        request.title = Some(format!("Todo List {}", Local::now().format("%Y-%m-%d")));
    }
    
    Ok(request)
}

/// Validate quick capture request
pub fn validate_capture_request(request: &QuickCaptureRequest) -> Vec<String> {
    let mut issues = Vec::new();
    
    if request.content.is_empty() && request.title.is_none() {
        issues.push("No content or title provided".to_string());
    }
    
    if let Some(title) = &request.title {
        if title.len() > 200 {
            issues.push("Title is too long (max 200 characters)".to_string());
        }
    }
    
    // Reduced content size limit for better security
    if request.content.len() > 10_000 {
        issues.push("Content is too large (max 10KB)".to_string());
    }
    
    // Validate tags with limits
    if request.tags.len() > 50 {
        issues.push("Too many tags (max 50)".to_string());
    }
    
    for tag in &request.tags {
        if !crate::utils::tags::is_valid_tag_name(tag) {
            issues.push(format!("Invalid tag name: '{}'", tag));
        }
        
        // Security: Check tag length
        if tag.len() > 100 {
            issues.push(format!("Tag name too long: '{}' (max 100 chars)", tag));
        }
    }
    
    issues
}

/// Get inbox configuration or create default
pub fn get_or_create_inbox_config() -> HashMap<String, String> {
    let mut config = HashMap::new();
    
    config.insert("default_parent".to_string(), "root".to_string());
    config.insert("note_type".to_string(), "text".to_string());
    config.insert("auto_title".to_string(), "true".to_string());
    config.insert("extract_tags".to_string(), "true".to_string());
    config.insert("batch_delimiter".to_string(), "---".to_string());
    
    config
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_likely_title() {
        assert!(is_likely_title("Project Meeting Notes"));
        assert!(is_likely_title("# Markdown Header"));
        assert!(is_likely_title("Important Task"));
        assert!(is_likely_title("123 Numbered Title"));
        
        assert!(!is_likely_title("This is a long sentence that ends with a period."));
        assert!(!is_likely_title(""));
        assert!(!is_likely_title("lowercase start sentence."));
    }

    #[test]
    fn test_generate_auto_title() {
        let content = "Buy groceries and walk the dog";
        let title = generate_auto_title(content, &[]);
        assert_eq!(title, "Buy groceries and walk the dog");
        
        let content = "This is a very long line that should be truncated because it's way too long for a title and contains multiple sentences.";
        let title = generate_auto_title(content, &[]);
        assert!(title.len() < content.len());
        
        let content = "Some content";
        let tags = vec!["project/work".to_string()];
        let title = generate_auto_title("", &tags);
        assert!(title.contains("project work"));
    }

    #[test]
    fn test_process_quick_capture() {
        let input = "Project Meeting Notes\n\nDiscussed #project tasks and #urgent items.";
        let capture = process_quick_capture(input, Some("inbox123")).unwrap();
        
        assert_eq!(capture.title, Some("Project Meeting Notes".to_string()));
        assert!(capture.tags.contains(&"project".to_string()));
        assert!(capture.tags.contains(&"urgent".to_string()));
        assert_eq!(capture.inbox_note_id, Some("inbox123".to_string()));
    }

    #[test]
    fn test_batch_process_captures() {
        let input = "First note content\n#tag1\n---\nSecond note content\n#tag2";
        let captures = batch_process_captures(input, "---", None).unwrap();
        
        assert_eq!(captures.len(), 2);
        assert!(captures[0].tags.contains(&"tag1".to_string()));
        assert!(captures[1].tags.contains(&"tag2".to_string()));
    }

    #[test]
    fn test_process_json_capture() {
        let json_input = r#"{"title": "Test Note", "content": "Test content", "tags": ["test", "json"]}"#;
        let capture = process_json_capture(json_input).unwrap();
        
        assert_eq!(capture.title, Some("Test Note".to_string()));
        assert_eq!(capture.content, "Test content");
        assert!(capture.tags.contains(&"test".to_string()));
        assert!(capture.tags.contains(&"json".to_string()));
    }
    
    #[test]
    fn test_size_limits() {
        // Test input size limit
        let large_input = "a".repeat(15000);
        let result = process_quick_capture(&large_input, None);
        assert!(result.is_err());
        
        // Test batch size limit
        let large_batch = "content".repeat(20000);
        let result = batch_process_captures(&large_batch, "---", None);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_json_security_validation() {
        // Test large JSON
        let large_json = format!("{{\"content\": \"{}\"}}", "a".repeat(15000));
        let result = process_json_capture(&large_json);
        assert!(result.is_err());
        
        // Test too many tags
        let many_tags: Vec<String> = (0..25).map(|i| format!("\"tag{}\"", i)).collect();
        let json_with_many_tags = format!("{{\"tags\": [{}]}}", many_tags.join(","));
        let result = process_json_capture(&json_with_many_tags);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_validation_improvements() {
        let request = QuickCaptureRequest {
            content: "a".repeat(15000), // Too large
            tags: (0..60).map(|i| format!("tag{}", i)).collect(), // Too many tags
            title: Some("Test".to_string()),
            inbox_note_id: None,
            metadata: std::collections::HashMap::new(),
        };
        
        let issues = validate_capture_request(&request);
        assert!(!issues.is_empty());
        assert!(issues.iter().any(|issue| issue.contains("too large")));
        assert!(issues.iter().any(|issue| issue.contains("Too many tags")));
    }
}