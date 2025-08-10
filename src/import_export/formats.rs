use crate::error::Result;
use anyhow::{Context, bail};
use pulldown_cmark::{Parser, html, Options, Event, Tag};
use regex::Regex;
use std::collections::HashMap;

/// Convert markdown to HTML
pub fn markdown_to_html(markdown: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_FOOTNOTES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);

    let parser = Parser::new_ext(markdown, options);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    html_output
}

/// Convert HTML to markdown
pub fn html_to_markdown(html: &str) -> String {
    html2md::parse_html(html)
}

/// Convert CSV to markdown table
pub fn csv_to_markdown(csv_content: &str) -> Result<String> {
    let mut lines = csv_content.lines();
    let header = lines.next().context("Empty CSV file")?;
    let header_cols: Vec<&str> = parse_csv_line(header);
    
    if header_cols.is_empty() {
        return Ok(csv_content.to_string());
    }
    
    let mut markdown = String::new();
    
    // Header row
    markdown.push_str("| ");
    markdown.push_str(&header_cols.join(" | "));
    markdown.push_str(" |\n");
    
    // Separator row
    markdown.push_str("| ");
    markdown.push_str(&vec!["---"; header_cols.len()].join(" | "));
    markdown.push_str(" |\n");
    
    // Data rows
    for line in lines {
        let cols = parse_csv_line(line);
        if !cols.is_empty() {
            // Pad with empty cells if needed
            let mut padded_cols = cols;
            while padded_cols.len() < header_cols.len() {
                padded_cols.push("");
            }
            padded_cols.truncate(header_cols.len());
            
            markdown.push_str("| ");
            markdown.push_str(&padded_cols.join(" | "));
            markdown.push_str(" |\n");
        }
    }
    
    Ok(markdown)
}

/// Parse a CSV line handling quoted fields
fn parse_csv_line(line: &str) -> Vec<&str> {
    // Simple CSV parser - doesn't handle all edge cases but good enough for basic use
    let mut fields = Vec::new();
    let mut current_field = "";
    let mut in_quotes = false;
    let mut start = 0;
    
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    
    while i < chars.len() {
        match chars[i] {
            '"' => {
                in_quotes = !in_quotes;
                if !in_quotes && i + 1 < chars.len() && chars[i + 1] == ',' {
                    // End of quoted field
                    fields.push(line[start..i].trim_matches('"').trim());
                    i += 2; // Skip comma
                    start = i;
                    continue;
                }
            }
            ',' if !in_quotes => {
                fields.push(line[start..i].trim());
                i += 1;
                start = i;
                continue;
            }
            _ => {}
        }
        i += 1;
    }
    
    // Add the last field
    if start < line.len() {
        fields.push(line[start..].trim_matches('"').trim());
    }
    
    fields
}

/// Convert JSON to markdown
pub fn json_to_markdown(json_content: &str) -> Result<String> {
    let value: serde_json::Value = serde_json::from_str(json_content)
        .context("Invalid JSON content")?;
    
    let mut markdown = String::new();
    json_value_to_markdown(&value, &mut markdown, 0);
    Ok(markdown)
}

/// Recursively convert JSON value to markdown
fn json_value_to_markdown(value: &serde_json::Value, output: &mut String, depth: usize) {
    let indent = "  ".repeat(depth);
    
    match value {
        serde_json::Value::Object(obj) => {
            if depth > 0 {
                output.push_str("{\n");
            }
            for (key, val) in obj {
                output.push_str(&format!("{}**{}**: ", indent, key));
                match val {
                    serde_json::Value::Object(_) | serde_json::Value::Array(_) => {
                        output.push('\n');
                        json_value_to_markdown(val, output, depth + 1);
                    }
                    _ => {
                        json_value_to_markdown(val, output, 0);
                        output.push('\n');
                    }
                }
            }
            if depth > 0 {
                output.push_str(&format!("{}}}\n", indent.get(..indent.len().saturating_sub(2)).unwrap_or("")));
            }
        }
        serde_json::Value::Array(arr) => {
            for (i, item) in arr.iter().enumerate() {
                output.push_str(&format!("{}{}. ", indent, i + 1));
                json_value_to_markdown(item, output, depth);
            }
        }
        serde_json::Value::String(s) => {
            output.push_str(s);
        }
        serde_json::Value::Number(n) => {
            output.push_str(&n.to_string());
        }
        serde_json::Value::Bool(b) => {
            output.push_str(&b.to_string());
        }
        serde_json::Value::Null => {
            output.push_str("_null_");
        }
    }
}

/// Extract and convert wikilinks
pub fn convert_wikilinks(content: &str, link_resolver: impl Fn(&str) -> Option<String>) -> String {
    let wikilink_re = Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    
    wikilink_re.replace_all(content, |caps: &regex::Captures| {
        let link_text = &caps[1];
        
        // Handle pipe syntax [[target|display]]
        if let Some(pipe_pos) = link_text.find('|') {
            let (target, display) = link_text.split_at(pipe_pos);
            let display = &display[1..]; // Remove the pipe
            
            if let Some(resolved_target) = link_resolver(target) {
                format!("[{}]({})", display, resolved_target)
            } else {
                format!("[{}]({})", display, target.replace(' ', "%20"))
            }
        } else {
            if let Some(resolved_target) = link_resolver(link_text) {
                format!("[{}]({})", link_text, resolved_target)
            } else {
                format!("[{}]({})", link_text, link_text.replace(' ', "%20"))
            }
        }
    }).to_string()
}

/// Convert markdown links back to wikilinks
pub fn convert_to_wikilinks(content: &str) -> String {
    let link_re = Regex::new(r"\[([^\]]+)\]\(([^)]+)\)").unwrap();
    
    link_re.replace_all(content, |caps: &regex::Captures| {
        let display = &caps[1];
        let target = &caps[2];
        
        // Only convert internal links (not URLs)
        if target.starts_with("http") || target.contains("://") {
            format!("[{}]({})", display, target)
        } else {
            let clean_target = target.replace("%20", " ");
            if display == clean_target {
                format!("[[{}]]", clean_target)
            } else {
                format!("[[{}|{}]]", clean_target, display)
            }
        }
    }).to_string()
}

/// Parse frontmatter from markdown content
pub fn parse_frontmatter(content: &str) -> Result<(Option<HashMap<String, serde_yaml::Value>>, String)> {
    if !content.starts_with("---") {
        return Ok((None, content.to_string()));
    }
    
    let rest = &content[3..];
    if let Some(end_pos) = rest.find("\n---\n") {
        let frontmatter_str = &rest[..end_pos];
        let content_str = &rest[end_pos + 5..]; // Skip \n---\n
        
        match serde_yaml::from_str::<HashMap<String, serde_yaml::Value>>(frontmatter_str) {
            Ok(frontmatter) => Ok((Some(frontmatter), content_str.to_string())),
            Err(_) => Ok((None, content.to_string())), // Invalid YAML, treat as regular content
        }
    } else {
        Ok((None, content.to_string()))
    }
}

/// Generate frontmatter YAML
pub fn generate_frontmatter(metadata: &HashMap<String, serde_yaml::Value>) -> Result<String> {
    if metadata.is_empty() {
        return Ok(String::new());
    }
    
    let yaml = serde_yaml::to_string(metadata)
        .context("Failed to serialize frontmatter to YAML")?;
    
    Ok(format!("---\n{}---\n\n", yaml))
}

/// Clean HTML content for better markdown conversion
pub fn clean_html(html: &str) -> String {
    let mut cleaned = html.to_string();
    
    // Remove script tags
    let script_re = Regex::new(r"<script[^>]*>.*?</script>").unwrap();
    cleaned = script_re.replace_all(&cleaned, "").to_string();
    
    // Remove style tags
    let style_re = Regex::new(r"<style[^>]*>.*?</style>").unwrap();
    cleaned = style_re.replace_all(&cleaned, "").to_string();
    
    // Remove comments
    let comment_re = Regex::new(r"<!--.*?-->").unwrap();
    cleaned = comment_re.replace_all(&cleaned, "").to_string();
    
    // Clean up excessive whitespace
    let whitespace_re = Regex::new(r"\s+").unwrap();
    cleaned = whitespace_re.replace_all(&cleaned, " ").to_string();
    
    cleaned.trim().to_string()
}

/// Extract text content from HTML
pub fn html_to_text(html: &str) -> String {
    let cleaned = clean_html(html);
    
    // Use a simple regex-based approach to strip HTML tags
    let tag_re = Regex::new(r"<[^>]+>").unwrap();
    let text = tag_re.replace_all(&cleaned, "");
    
    // Decode HTML entities
    html_escape::decode_html_entities(&text).to_string()
}

/// Convert code blocks to appropriate format
pub fn format_code_block(code: &str, language: Option<&str>) -> String {
    match language {
        Some(lang) => format!("```{}\n{}\n```", lang, code),
        None => format!("```\n{}\n```", code),
    }
}

/// Detect programming language from content
pub fn detect_code_language(content: &str, filename: Option<&str>) -> Option<String> {
    // First try to detect from filename extension
    if let Some(name) = filename {
        if let Some(ext) = std::path::Path::new(name).extension().and_then(|e| e.to_str()) {
            let lang = match ext.to_lowercase().as_str() {
                "rs" => "rust",
                "py" => "python",
                "js" => "javascript",
                "ts" => "typescript",
                "java" => "java",
                "cpp" | "cc" | "cxx" => "cpp",
                "c" => "c",
                "go" => "go",
                "rb" => "ruby",
                "php" => "php",
                "sh" | "bash" => "bash",
                "sql" => "sql",
                "html" => "html",
                "css" => "css",
                "json" => "json",
                "xml" => "xml",
                "yaml" | "yml" => "yaml",
                _ => return None,
            };
            return Some(lang.to_string());
        }
    }
    
    // Try to detect from content patterns
    if content.contains("fn main()") || content.contains("println!") {
        Some("rust".to_string())
    } else if content.contains("def ") && content.contains("print(") {
        Some("python".to_string())
    } else if content.contains("function ") || content.contains("console.log") {
        Some("javascript".to_string())
    } else if content.contains("public class ") || content.contains("System.out.println") {
        Some("java".to_string())
    } else if content.contains("#include") || content.contains("printf(") {
        Some("c".to_string())
    } else if content.contains("SELECT ") && content.contains("FROM ") {
        Some("sql".to_string())
    } else {
        None
    }
}

/// Convert tables between different formats
pub fn convert_table_format(content: &str, from_format: &str, to_format: &str) -> Result<String> {
    match (from_format, to_format) {
        ("csv", "markdown") => csv_to_markdown(content),
        ("markdown", "html") => {
            let html = markdown_to_html(content);
            Ok(html)
        }
        ("html", "markdown") => {
            Ok(html_to_markdown(content))
        }
        _ => Ok(content.to_string()), // No conversion needed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_markdown_to_html() {
        let markdown = "# Hello\n\nThis is **bold** text.";
        let html = markdown_to_html(markdown);
        assert!(html.contains("<h1>"));
        assert!(html.contains("<strong>"));
    }

    #[test]
    fn test_csv_to_markdown() {
        let csv = "Name,Age,City\nJohn,30,NYC\nJane,25,LA";
        let result = csv_to_markdown(csv).unwrap();
        assert!(result.contains("| Name | Age | City |"));
        assert!(result.contains("| John | 30 | NYC |"));
    }

    #[test]
    fn test_parse_csv_line() {
        let line = r#"John,"Doe, Jr.",30,NYC"#;
        let fields = parse_csv_line(line);
        assert_eq!(fields, vec!["John", "Doe, Jr.", "30", "NYC"]);
    }

    #[test]
    fn test_convert_wikilinks() {
        let content = "See [[Other Page]] and [[Target|Display Text]]";
        let result = convert_wikilinks(content, |_| None);
        assert!(result.contains("[Other Page](Other%20Page)"));
        assert!(result.contains("[Display Text](Target)"));
    }

    #[test]
    fn test_parse_frontmatter() {
        let content = "---\ntitle: Test\ndate: 2023-01-01\n---\n\nContent here";
        let (frontmatter, content_part) = parse_frontmatter(content).unwrap();
        
        assert!(frontmatter.is_some());
        assert_eq!(content_part.trim(), "Content here");
    }

    #[test]
    fn test_detect_code_language() {
        assert_eq!(detect_code_language("", Some("test.rs")), Some("rust".to_string()));
        assert_eq!(detect_code_language("fn main() {}", None), Some("rust".to_string()));
        assert_eq!(detect_code_language("def hello():", None), Some("python".to_string()));
    }

    #[test]
    fn test_json_to_markdown() {
        let json = r#"{"name": "John", "age": 30, "hobbies": ["reading", "coding"]}"#;
        let result = json_to_markdown(json).unwrap();
        assert!(result.contains("**name**:"));
        assert!(result.contains("**age**:"));
    }
}