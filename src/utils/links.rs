//! Link management utilities
//! 
//! This module provides utilities for finding, validating, and manipulating
//! links within notes and between notes.

#![allow(dead_code)]

use crate::models::{ParsedLink, LinkType, LinkReference};
use crate::error::{Result, TriliumError};
use regex::Regex;
use std::collections::HashMap;
use std::sync::OnceLock;

/// Static regex for link parsing to avoid recompilation
static LINK_REGEX: OnceLock<Regex> = OnceLock::new();

/// Get or create the link regex pattern
fn get_link_regex() -> &'static Regex {
    LINK_REGEX.get_or_init(|| {
        Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap()
    })
}

/// Precomputed line offset cache for efficient line number lookups
#[derive(Debug, Clone)]
struct LineOffsetCache {
    line_starts: Vec<usize>,
    content_length: usize,
}

impl LineOffsetCache {
    fn new(content: &str) -> Self {
        let mut line_starts = vec![0];
        
        // Pre-compute all line start positions
        for (pos, byte) in content.bytes().enumerate() {
            if byte == b'\n' {
                line_starts.push(pos + 1);
            }
        }
        
        Self {
            line_starts,
            content_length: content.len(),
        }
    }
    
    /// Find line number for a given byte position using binary search
    fn find_line_number(&self, pos: usize) -> usize {
        if pos >= self.content_length {
            return self.line_starts.len().saturating_sub(1);
        }
        
        // Binary search for efficiency
        match self.line_starts.binary_search(&pos) {
            Ok(line) => line,
            Err(line) => line.saturating_sub(1),
        }
    }
    
    /// Get the content of a specific line
    fn get_line_content<'a>(&self, content: &'a str, line_num: usize) -> &'a str {
        if line_num >= self.line_starts.len() {
            return "";
        }
        
        let start = self.line_starts[line_num];
        let end = if line_num + 1 < self.line_starts.len() {
            self.line_starts[line_num + 1].saturating_sub(1) // Exclude newline
        } else {
            self.content_length
        };
        
        &content[start..end.min(self.content_length)]
    }
}

/// Parse wiki-style links from note content with optimized performance
/// Supports formats: [[note-id]], [[Note Title]], [[note-id|Custom Text]], [[Note Title|Custom Text]]
pub fn parse_links(content: &str) -> Result<Vec<ParsedLink>> {
    // Security: Validate content size to prevent memory exhaustion
    const MAX_CONTENT_SIZE: usize = 10_000_000; // 10MB limit
    if content.len() > MAX_CONTENT_SIZE {
        return Err(TriliumError::SecurityError(
            format!("Content too large for link parsing (max {} bytes)", MAX_CONTENT_SIZE)
        ));
    }
    
    let mut links = Vec::new();
    links.reserve(100); // Pre-allocate reasonable capacity
    
    // Use cached regex for better performance
    let link_regex = get_link_regex();
    
    // Security: Limit number of links to prevent DoS
    const MAX_LINKS: usize = 1000;
    let mut link_count = 0;
    
    for cap in link_regex.captures_iter(content) {
        if link_count >= MAX_LINKS {
            eprintln!("Warning: Too many links found, limiting to {}", MAX_LINKS);
            break;
        }
        
        let full_match = cap.get(0).unwrap();
        let target = cap.get(1).unwrap().as_str().trim();
        let display_text = cap.get(2).map(|m| m.as_str().trim().to_string());
        
        // Security: Validate link target length
        const MAX_TARGET_LENGTH: usize = 500;
        if target.len() > MAX_TARGET_LENGTH {
            continue; // Skip oversized targets
        }
        
        // Security: Validate display text length
        if let Some(ref text) = display_text {
            const MAX_DISPLAY_TEXT_LENGTH: usize = 500;
            if text.len() > MAX_DISPLAY_TEXT_LENGTH {
                continue; // Skip oversized display text
            }
        }
        
        // Determine if target is likely an ID (contains numbers/hyphens) or a title
        let link_type = if is_likely_note_id(target) {
            LinkType::NoteId
        } else {
            LinkType::NoteTitle
        };
        
        links.push(ParsedLink {
            link_type,
            target: target.to_string(),
            display_text,
            start_pos: full_match.start(),
            end_pos: full_match.end(),
        });
        
        link_count += 1;
    }
    
    Ok(links)
}

/// Check if a string looks like a Trilium note ID
fn is_likely_note_id(s: &str) -> bool {
    // Trilium note IDs are typically alphanumeric strings
    s.len() >= 10 && s.chars().all(|c| c.is_ascii_alphanumeric())
}

/// Extract link references with context from content using optimized line lookup
pub fn extract_link_references(
    content: &str, 
    from_note_id: &str, 
    from_title: &str
) -> Result<Vec<LinkReference>> {
    // Security: Validate input sizes
    const MAX_ID_LENGTH: usize = 100;
    const MAX_TITLE_LENGTH: usize = 500;
    
    if from_note_id.len() > MAX_ID_LENGTH {
        return Err(TriliumError::ValidationError(
            "from_note_id too long".to_string()
        ));
    }
    if from_title.len() > MAX_TITLE_LENGTH {
        return Err(TriliumError::ValidationError(
            "from_title too long".to_string()
        ));
    }
    
    let links = parse_links(content)?;
    
    // Pre-compute line offsets for efficient line number lookups
    let line_cache = LineOffsetCache::new(content);
    
    let mut references = Vec::new();
    references.reserve(links.len()); // Pre-allocate for efficiency
    
    for link in links {
        // Use optimized line lookup
        let line_num = line_cache.find_line_number(link.start_pos);
        let context = line_cache.get_line_content(content, line_num).to_string();
        
        let link_text = link.display_text.unwrap_or_else(|| link.target.clone());
        
        references.push(LinkReference {
            from_note_id: from_note_id.to_string(),
            to_note_id: link.target.clone(),
            from_title: from_title.to_string(),
            link_text,
            context,
        });
    }
    
    Ok(references)
}

/// Replace or update links in content with validation
pub fn replace_links(content: &str, replacements: &HashMap<String, String>) -> Result<String> {
    // Security: Validate content size
    const MAX_CONTENT_SIZE: usize = 10_000_000; // 10MB limit
    if content.len() > MAX_CONTENT_SIZE {
        return Err(TriliumError::SecurityError(
            format!("Content too large for link replacement (max {} bytes)", MAX_CONTENT_SIZE)
        ));
    }
    
    // Security: Validate replacements map size
    const MAX_REPLACEMENTS: usize = 10_000;
    if replacements.len() > MAX_REPLACEMENTS {
        return Err(TriliumError::SecurityError(
            format!("Too many replacements (max {})", MAX_REPLACEMENTS)
        ));
    }
    
    // Use cached regex
    let link_regex = get_link_regex();
    
    let result = link_regex.replace_all(content, |caps: &regex::Captures| {
        let target = caps.get(1).unwrap().as_str().trim();
        let display_text = caps.get(2).map(|m| m.as_str().trim());
        
        if let Some(new_target) = replacements.get(target) {
            // Security: Validate replacement target length
            if new_target.len() > 500 {
                return caps.get(0).unwrap().as_str().to_string(); // Skip replacement if too long
            }
            
            if let Some(display) = display_text {
                format!("[[{}|{}]]", new_target, display)
            } else {
                format!("[[{}]]", new_target)
            }
        } else {
            caps.get(0).unwrap().as_str().to_string()
        }
    });
    
    Ok(result.to_string())
}

/// Generate markdown-style links from wiki links for export with validation
pub fn convert_to_markdown_links(content: &str, note_titles: &HashMap<String, String>) -> Result<String> {
    // Security: Validate content size
    const MAX_CONTENT_SIZE: usize = 10_000_000; // 10MB limit
    if content.len() > MAX_CONTENT_SIZE {
        return Err(TriliumError::SecurityError(
            format!("Content too large for markdown conversion (max {} bytes)", MAX_CONTENT_SIZE)
        ));
    }
    
    // Security: Validate note titles map size
    const MAX_TITLES: usize = 10_000;
    if note_titles.len() > MAX_TITLES {
        return Err(TriliumError::SecurityError(
            format!("Too many note titles (max {})", MAX_TITLES)
        ));
    }
    
    // Use cached regex
    let link_regex = get_link_regex();
    
    let result = link_regex.replace_all(content, |caps: &regex::Captures| {
        let target = caps.get(1).unwrap().as_str().trim();
        let display_text = caps.get(2).map(|m| m.as_str().trim());
        
        let link_text = display_text.unwrap_or(
            note_titles.get(target).map(|s| s.as_str()).unwrap_or(target)
        );
        
        // Security: Validate lengths to prevent output bloat
        if link_text.len() > 200 || target.len() > 100 {
            return caps.get(0).unwrap().as_str().to_string(); // Keep original if too long
        }
        
        format!("[{}](trilium://note/{})", link_text, target)
    });
    
    Ok(result.to_string())
}

/// Find broken links (links that point to non-existent notes)
pub fn find_broken_links<'a>(links: &'a [ParsedLink], existing_note_ids: &[String]) -> Vec<&'a ParsedLink> {
    let existing_set: std::collections::HashSet<&String> = existing_note_ids.iter().collect();
    
    links.iter()
        .filter(|link| match link.link_type {
            LinkType::NoteId => !existing_set.contains(&link.target),
            LinkType::NoteTitle => false, // Title-based links are harder to validate without full lookup
        })
        .collect()
}

/// Auto-complete suggestions for link typing
pub fn suggest_link_completions(
    input: &str, 
    available_notes: &[(String, String)] // (id, title) pairs
) -> Vec<(String, String)> {
    let input_lower = input.to_lowercase();
    let mut suggestions = Vec::new();
    
    for (id, title) in available_notes {
        // Match by title (partial, case-insensitive)
        if title.to_lowercase().contains(&input_lower) {
            suggestions.push((id.clone(), title.clone()));
        }
        // Match by ID prefix
        else if id.to_lowercase().starts_with(&input_lower) {
            suggestions.push((id.clone(), title.clone()));
        }
    }
    
    // Sort by relevance (exact matches first, then prefix matches, then contains)
    suggestions.sort_by(|a, b| {
        let a_title_lower = a.1.to_lowercase();
        let b_title_lower = b.1.to_lowercase();
        
        let a_score = if a_title_lower == input_lower { 0 }
                     else if a_title_lower.starts_with(&input_lower) { 1 }
                     else { 2 };
        
        let b_score = if b_title_lower == input_lower { 0 }
                     else if b_title_lower.starts_with(&input_lower) { 1 }
                     else { 2 };
        
        a_score.cmp(&b_score).then_with(|| a.1.cmp(&b.1))
    });
    
    suggestions.truncate(10); // Limit to top 10 suggestions
    suggestions
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_links() {
        let content = "See [[important-note]] and [[Another Note]] for details.";
        let links = parse_links(content).unwrap();
        
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].target, "important-note");
        assert_eq!(links[0].link_type, LinkType::NoteId);
        assert_eq!(links[1].target, "Another Note");
        assert_eq!(links[1].link_type, LinkType::NoteTitle);
    }

    #[test]
    fn test_parse_links_with_display_text() {
        let content = "Check [[note123|Custom Label]] and [[Long Note Title|Short]]";
        let links = parse_links(content).unwrap();
        
        assert_eq!(links.len(), 2);
        assert_eq!(links[0].target, "note123");
        assert_eq!(links[0].display_text, Some("Custom Label".to_string()));
        assert_eq!(links[1].target, "Long Note Title");
        assert_eq!(links[1].display_text, Some("Short".to_string()));
    }

    #[test]
    fn test_is_likely_note_id() {
        assert!(is_likely_note_id("abc123def456"));
        assert!(is_likely_note_id("1234567890"));
        assert!(!is_likely_note_id("Note Title"));
        assert!(!is_likely_note_id("short"));
        assert!(!is_likely_note_id("has spaces"));
    }

    #[test]
    fn test_replace_links() {
        let content = "See [[old-id]] and [[old-title|Display]] for info.";
        let mut replacements = HashMap::new();
        replacements.insert("old-id".to_string(), "new-id".to_string());
        replacements.insert("old-title".to_string(), "new-title".to_string());
        
        let result = replace_links(content, &replacements).unwrap();
        assert_eq!(result, "See [[new-id]] and [[new-title|Display]] for info.");
    }
    
    #[test]
    fn test_line_offset_cache() {
        let content = "Line 1\nLine 2\nLine 3\nLine 4";
        let cache = LineOffsetCache::new(content);
        
        // Test line number finding
        assert_eq!(cache.find_line_number(0), 0); // Start of line 1
        assert_eq!(cache.find_line_number(7), 1); // Start of line 2
        assert_eq!(cache.find_line_number(14), 2); // Start of line 3
        
        // Test line content extraction
        assert_eq!(cache.get_line_content(content, 0), "Line 1");
        assert_eq!(cache.get_line_content(content, 1), "Line 2");
        assert_eq!(cache.get_line_content(content, 2), "Line 3");
        assert_eq!(cache.get_line_content(content, 3), "Line 4");
    }
    
    #[test]
    fn test_extract_link_references_optimized() {
        let content = "First line\nSee [[test-note]] for details\nLast line";
        let references = extract_link_references(content, "source123", "Source Note").unwrap();
        
        assert_eq!(references.len(), 1);
        assert_eq!(references[0].to_note_id, "test-note");
        assert_eq!(references[0].context, "See [[test-note]] for details");
        assert_eq!(references[0].from_note_id, "source123");
    }
    
    #[test]
    fn test_security_limits() {
        // Test content size limit for parsing
        let large_content = "a".repeat(15_000_000); // 15MB
        let result = parse_links(&large_content);
        assert!(result.is_err());
        
        // Test too many replacements
        let content = "[[test]]";
        let mut replacements = HashMap::new();
        for i in 0..15_000 {
            replacements.insert(format!("key{}", i), format!("value{}", i));
        }
        let result = replace_links(content, &replacements);
        assert!(result.is_err());
    }
    
    #[test]
    fn test_performance_with_many_links() {
        // Test performance with many links
        let mut content = String::new();
        for i in 0..500 {
            content.push_str(&format!("Link to [[note{}]] here. ", i));
        }
        
        let start = std::time::Instant::now();
        let links = parse_links(&content).unwrap();
        let duration = start.elapsed();
        
        assert_eq!(links.len(), 500);
        assert!(duration.as_millis() < 100, "Link parsing took too long: {:?}", duration);
    }
}