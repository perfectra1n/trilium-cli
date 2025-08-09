use chrono::Utc;
use serde_json::json;
use std::collections::HashMap;

// Test fixture data
pub mod fixtures {
    use super::*;

    pub fn markdown_content() -> String {
        r#"# Main Title

This is a paragraph with **bold** and *italic* text.

## Subtitle

- Item 1
- Item 2
- Item 3

[Link to example](https://example.com)

```rust
fn main() {
    println!("Hello, world!");
}
```

> This is a blockquote

| Column 1 | Column 2 |
|----------|----------|
| Cell 1   | Cell 2   |
"#.to_string()
    }

    pub fn html_content() -> String {
        r#"<!DOCTYPE html>
<html>
<head>
    <title>Test Page</title>
</head>
<body>
    <h1>Main Heading</h1>
    <p>This is a paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
    <ul>
        <li>Item 1</li>
        <li>Item 2</li>
    </ul>
    <a href="https://example.com">Link</a>
</body>
</html>"#.to_string()
    }

    pub fn json_content() -> String {
        json!({
            "title": "Test JSON",
            "name": "Test Name",
            "data": {
                "field1": "value1",
                "field2": 42,
                "nested": {
                    "deep": true
                }
            },
            "array": [1, 2, 3]
        }).to_string()
    }

    pub fn python_code() -> String {
        r#"#!/usr/bin/env python3
import sys
from datetime import datetime

class Example:
    def __init__(self, name):
        self.name = name
    
    def greet(self):
        print(f"Hello, {self.name}!")

if __name__ == "__main__":
    example = Example("World")
    example.greet()
"#.to_string()
    }

    pub fn rust_code() -> String {
        r#"use std::collections::HashMap;

fn main() {
    let mut map = HashMap::new();
    map.insert("key", "value");
    
    println!("Map: {:?}", map);
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_example() {
        assert_eq!(2 + 2, 4);
    }
}
"#.to_string()
    }

    pub fn javascript_code() -> String {
        r#"const express = require('express');
const app = express();

function greet(name) {
    return `Hello, ${name}!`;
}

const server = app.listen(3000, () => {
    console.log('Server running on port 3000');
});

export { greet };
"#.to_string()
    }

    pub fn sql_code() -> String {
        r#"SELECT u.id, u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at > '2024-01-01'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 5
ORDER BY order_count DESC;

CREATE TABLE products (
    id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2)
);
"#.to_string()
    }

    pub fn plain_text() -> String {
        r#"This is plain text content.
It has multiple lines.
But no special formatting or syntax.
Just regular text content."#.to_string()
    }

    pub fn ambiguous_content() -> String {
        r#"function example() {
    // This could be JavaScript
    return true;
}

# But also has a markdown header

And some regular text."#.to_string()
    }

    pub fn large_content() -> String {
        let mut content = String::new();
        for i in 0..10000 {
            content.push_str(&format!("Line {}: This is a test line with some content.\n", i));
        }
        content
    }

    pub fn batch_content() -> String {
        r#"First section content
with multiple lines
---DELIMITER---
Second section content
also with multiple lines
---DELIMITER---
Third section content
final section"#.to_string()
    }
}

// Helper functions for creating test data
pub fn create_test_note_id() -> String {
    format!("test_note_{}", Utc::now().timestamp_millis())
}

pub fn create_test_attributes() -> Vec<(String, String)> {
    vec![
        ("test_key1".to_string(), "test_value1".to_string()),
        ("test_key2".to_string(), "test_value2".to_string()),
    ]
}

pub fn create_test_tags() -> Vec<String> {
    vec!["tag1".to_string(), "tag2".to_string(), "tag3".to_string()]
}

// Assertion helpers
pub fn assert_contains_markdown_elements(content: &str) {
    assert!(content.contains("#") || content.contains("**") || content.contains("*") || 
            content.contains("[") || content.contains("```"),
            "Content should contain markdown elements");
}

pub fn assert_valid_json(content: &str) {
    let result = serde_json::from_str::<serde_json::Value>(content);
    assert!(result.is_ok(), "Content should be valid JSON");
}

pub fn assert_valid_html(content: &str) {
    assert!(content.contains("<") && content.contains(">"), 
            "Content should contain HTML tags");
}

pub fn assert_title_extracted(title: Option<String>, expected: &str) {
    assert_eq!(title, Some(expected.to_string()), 
               "Title should be extracted correctly");
}

// Mock stdin helper
pub struct MockStdin {
    content: String,
}

impl MockStdin {
    pub fn new(content: String) -> Self {
        Self { content }
    }

    pub fn as_bytes(&self) -> &[u8] {
        self.content.as_bytes()
    }
}

// Test configuration helper
pub fn test_config() -> trilium_cli::config::Config {
    trilium_cli::config::Config {
        server_url: mockito::server_url(),
        api_token: Some("test_token".to_string()),
        default_parent_id: "root".to_string(),
        default_note_type: "text".to_string(),
        editor: None,
        timeout_seconds: 30,
        max_retries: 3,
    }
}

// Create a temporary config file for integration tests
pub fn create_temp_config(dir: &std::path::Path) -> std::path::PathBuf {
    let config_path = dir.join("config.yaml");
    let config = test_config();
    let yaml = serde_yaml::to_string(&config).unwrap();
    std::fs::write(&config_path, yaml).unwrap();
    config_path
}

// Mock API response helpers
pub fn mock_note_response() -> serde_json::Value {
    serde_json::json!({
        "noteId": "test123",
        "title": "Test Note",
        "type": "text",
        "mime": "text/html",
        "isProtected": false,
        "dateCreated": "2024-01-01T00:00:00.000Z",
        "dateModified": "2024-01-01T00:00:00.000Z",
        "utcDateCreated": "2024-01-01T00:00:00.000Z",
        "utcDateModified": "2024-01-01T00:00:00.000Z"
    })
}

pub fn mock_search_response() -> serde_json::Value {
    serde_json::json!({
        "results": [
            {
                "noteId": "result1",
                "title": "Search Result 1",
                "score": 0.95
            },
            {
                "noteId": "result2",
                "title": "Search Result 2",
                "score": 0.85
            }
        ]
    })
}

pub fn mock_create_note_response() -> serde_json::Value {
    serde_json::json!({
        "note": {
            "noteId": "new123",
            "title": "New Note",
            "type": "text"
        },
        "branch": {
            "branchId": "branch123",
            "parentNoteId": "root"
        }
    })
}