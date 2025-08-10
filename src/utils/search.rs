//! Search utilities and result formatting
//! 
//! This module provides utilities for enhanced search functionality,
//! including result highlighting and formatting.

#![allow(dead_code)]

use crate::models::{EnhancedSearchResult, HighlightedSnippet, TextHighlight};
use crate::error::{Result, TriliumError};
use regex::Regex;
use colored::*;
use std::time::{Duration, Instant};

/// Generate highlighted snippets from search results
pub fn generate_highlighted_snippets(
    content: &str,
    query: &str,
    context_lines: usize,
    regex_mode: bool
) -> Result<Vec<HighlightedSnippet>> {
    let lines: Vec<&str> = content.lines().collect();
    let mut snippets = Vec::new();
    
    // Validate and create regex with timeout protection
    let search_regex = if regex_mode {
        validate_and_create_regex(query)?
    } else {
        // Escape special regex characters for literal search
        let escaped = regex::escape(query);
        match Regex::new(&format!("(?i){}", escaped)) { // Case-insensitive
            Ok(regex) => regex,
            Err(_) => return Ok(snippets),
        }
    };
    
    let mut matched_lines = Vec::new();
    let search_start = Instant::now();
    const SEARCH_TIMEOUT: Duration = Duration::from_millis(5000); // 5 second timeout
    
    // Find all lines that match with timeout protection
    for (line_num, line) in lines.iter().enumerate() {
        // Check timeout periodically
        if line_num % 1000 == 0 && search_start.elapsed() > SEARCH_TIMEOUT {
            return Err(TriliumError::SecurityError(
                "Search operation timed out - regex may be too complex".to_string()
            ));
        }
        
        if search_regex.is_match(line) {
            matched_lines.push(line_num);
        }
    }
    
    // Group adjacent matches and generate snippets
    let mut i = 0;
    while i < matched_lines.len() {
        let start_line = matched_lines[i];
        let mut end_line = start_line;
        
        // Find consecutive matches
        while i + 1 < matched_lines.len() && matched_lines[i + 1] <= end_line + context_lines * 2 + 1 {
            i += 1;
            end_line = matched_lines[i];
        }
        
        // Generate snippet with context
        let context_start = start_line.saturating_sub(context_lines);
        let context_end = (end_line + context_lines + 1).min(lines.len());
        
        let mut snippet_lines = Vec::new();
        let mut highlights = Vec::new();
        
        for line_idx in context_start..context_end {
            let line = lines[line_idx];
            snippet_lines.push(line.to_string());
            
            // Find highlights in this line if it's a match line
            if matched_lines.contains(&line_idx) {
                // Limit number of highlights per line to prevent DoS
                let mut highlight_count = 0;
                const MAX_HIGHLIGHTS_PER_LINE: usize = 50;
                
                for mat in search_regex.find_iter(line) {
                    if highlight_count >= MAX_HIGHLIGHTS_PER_LINE {
                        break;
                    }
                    highlights.push(TextHighlight {
                        start: mat.start(),
                        end: mat.end(),
                        match_text: mat.as_str().to_string(),
                    });
                    highlight_count += 1;
                }
            }
        }
        
        if !snippet_lines.is_empty() {
            let main_line_idx = start_line - context_start;
            snippets.push(HighlightedSnippet {
                line_number: start_line + 1, // 1-based line numbers
                content: if main_line_idx < snippet_lines.len() {
                    snippet_lines[main_line_idx].clone()
                } else {
                    snippet_lines[0].clone()
                },
                highlights,
                context_before: snippet_lines[..main_line_idx.min(snippet_lines.len())].to_vec(),
                context_after: snippet_lines[(main_line_idx + 1).min(snippet_lines.len())..].to_vec(),
            });
        }
        
        i += 1;
    }
    
    Ok(snippets)
}

/// Validate regex pattern and create regex with security checks
fn validate_and_create_regex(pattern: &str) -> Result<Regex> {
    // Security: Limit pattern length to prevent memory exhaustion
    const MAX_PATTERN_LENGTH: usize = 1000;
    if pattern.len() > MAX_PATTERN_LENGTH {
        return Err(TriliumError::SecurityError(
            format!("Regex pattern too long (max {} characters)", MAX_PATTERN_LENGTH)
        ));
    }
    
    // Security: Check for dangerous patterns that can cause catastrophic backtracking
    let dangerous_patterns = [
        r"(.+)*",
        r"(.*)*", 
        r"(.*)+(.*)+",
        r"(.+)+(.*)+",
        r"(.*)+.*",
        r"(.+)+.*",
        r".*(.+)+",
        r".*(.*)+",
        r"(a*)*",
        r"(a+)+",
        r"(a|a)*",
        r"(a|b)*a*b*",
    ];
    
    let pattern_lower = pattern.to_lowercase();
    for dangerous in &dangerous_patterns {
        if pattern_lower.contains(&dangerous.replace("a", ".").replace("b", ".")) ||
           pattern_lower.contains(dangerous) {
            return Err(TriliumError::SecurityError(
                "Regex pattern contains potentially dangerous constructs that could cause performance issues".to_string()
            ));
        }
    }
    
    // Security: Limit nesting depth
    let paren_depth = pattern.chars().fold((0i32, 0i32), |(max_depth, current_depth), c| {
        match c {
            '(' => (max_depth.max(current_depth + 1), current_depth + 1),
            ')' => (max_depth, current_depth.saturating_sub(1)),
            _ => (max_depth, current_depth),
        }
    }).0;
    
    const MAX_NESTING_DEPTH: i32 = 10;
    if paren_depth > MAX_NESTING_DEPTH {
        return Err(TriliumError::SecurityError(
            format!("Regex nesting depth too high (max {})", MAX_NESTING_DEPTH)
        ));
    }
    
    // Security: Limit number of alternations to prevent exponential blowup
    let alternation_count = pattern.matches('|').count();
    const MAX_ALTERNATIONS: usize = 20;
    if alternation_count > MAX_ALTERNATIONS {
        return Err(TriliumError::SecurityError(
            format!("Too many alternations in regex (max {})", MAX_ALTERNATIONS)
        ));
    }
    
    // Security: Limit repetition quantifiers
    let repetition_patterns = ["*", "+", "?", "{"];
    let repetition_count = repetition_patterns.iter()
        .map(|p| pattern.matches(p).count())
        .sum::<usize>();
    const MAX_REPETITIONS: usize = 30;
    if repetition_count > MAX_REPETITIONS {
        return Err(TriliumError::SecurityError(
            format!("Too many repetition operators in regex (max {})", MAX_REPETITIONS)
        ));
    }
    
    // Try to create the regex with timeout
    match Regex::new(pattern) {
        Ok(regex) => Ok(regex),
        Err(e) => Err(TriliumError::ValidationError(
            format!("Invalid regex pattern: {}", e)
        )),
    }
}

/// Apply highlighting to search results for terminal output
pub fn highlight_search_results(
    results: &[EnhancedSearchResult],
    _query: &str,
    show_context: bool
) -> Result<Vec<String>> {
    let mut output = Vec::new();
    
    for result in results {
        // Format the header
        let header = format!(
            "{} {} {}",
            "●".blue().bold(),
            result.title.green().bold(),
            format!("({})", result.path).dimmed()
        );
        output.push(header);
        
        if !result.highlighted_snippets.is_empty() {
            // Limit number of snippets to display to prevent output overflow
            const MAX_SNIPPETS_PER_RESULT: usize = 10;
            let snippets_to_show = result.highlighted_snippets.iter().take(MAX_SNIPPETS_PER_RESULT);
            
            for snippet in snippets_to_show {
                if show_context {
                    // Show context before
                    for (i, context_line) in snippet.context_before.iter().enumerate() {
                        let line_num = snippet.line_number - snippet.context_before.len() + i;
                        output.push(format!("  {} {}", format!("{}:", line_num).dimmed(), context_line.dimmed()));
                    }
                }
                
                // Show the main matching line with highlights
                let highlighted_line = apply_highlights(&snippet.content, &snippet.highlights)?;
                output.push(format!("  {} {}", 
                    format!("{}:", snippet.line_number).yellow(),
                    highlighted_line
                ));
                
                if show_context {
                    // Show context after
                    for (i, context_line) in snippet.context_after.iter().enumerate() {
                        let line_num = snippet.line_number + 1 + i;
                        output.push(format!("  {} {}", format!("{}:", line_num).dimmed(), context_line.dimmed()));
                    }
                }
            }
            
            // Show truncation notice if there are more snippets
            if result.highlighted_snippets.len() > MAX_SNIPPETS_PER_RESULT {
                let remaining = result.highlighted_snippets.len() - MAX_SNIPPETS_PER_RESULT;
                output.push(format!("  {} ... and {} more matches", "...".dimmed(), remaining));
            }
        } else if let Some(content) = &result.content {
            // If no snippets generated, show truncated content
            let truncated = if content.len() > 200 {
                format!("{}...", &content[..200])
            } else {
                content.clone()
            };
            output.push(format!("  {}", truncated.dimmed()));
        }
        
        output.push(String::new()); // Empty line between results
    }
    
    Ok(output)
}

/// Apply text highlights to a string for terminal output
fn apply_highlights(text: &str, highlights: &[TextHighlight]) -> Result<String> {
    if highlights.is_empty() {
        return Ok(text.to_string());
    }
    
    // Validate highlights to prevent out-of-bounds access
    for highlight in highlights {
        if highlight.start > text.len() || highlight.end > text.len() || highlight.start > highlight.end {
            return Err(TriliumError::ValidationError(
                "Invalid highlight bounds detected".to_string()
            ));
        }
    }
    
    let mut result = String::new();
    let mut last_end = 0;
    
    for highlight in highlights {
        // Add text before highlight
        result.push_str(&text[last_end..highlight.start]);
        
        // Add highlighted text
        result.push_str(&text[highlight.start..highlight.end].yellow().bold().to_string());
        
        last_end = highlight.end;
    }
    
    // Add remaining text
    if last_end < text.len() {
        result.push_str(&text[last_end..]);
    }
    
    Ok(result)
}

/// Create search statistics summary
pub fn generate_search_stats(
    results: &[EnhancedSearchResult],
    query: &str,
    total_time_ms: u64
) -> String {
    let total_matches = results.iter()
        .map(|r| r.highlighted_snippets.len())
        .sum::<usize>();
    
    let unique_notes = results.len();
    
    format!(
        "Found {} matches in {} notes for '{}' ({} ms)",
        total_matches,
        unique_notes,
        query.bold(),
        total_time_ms
    )
}

/// Extract text around a match for context (used for simple search without full content)
pub fn extract_match_context(text: &str, match_start: usize, match_end: usize, context_chars: usize) -> String {
    let start = match_start.saturating_sub(context_chars);
    let end = (match_end + context_chars).min(text.len());
    
    let mut context = text[start..end].to_string();
    
    // Add ellipsis if we truncated
    if start > 0 {
        context = format!("...{}", context);
    }
    if end < text.len() {
        context = format!("{}...", context);
    }
    
    context
}

/// Rank search results by relevance
pub fn rank_search_results(results: &mut [EnhancedSearchResult], query: &str) {
    let query_lower = query.to_lowercase();
    
    results.sort_by(|a, b| {
        // Calculate relevance scores
        let score_a = calculate_relevance_score(a, &query_lower);
        let score_b = calculate_relevance_score(b, &query_lower);
        
        // Sort by score descending, then by original search score
        score_b.partial_cmp(&score_a)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal))
    });
}

fn calculate_relevance_score(result: &EnhancedSearchResult, query: &str) -> f64 {
    let mut score = result.score;
    
    // Boost if query appears in title
    if result.title.to_lowercase().contains(query) {
        score += 2.0;
    }
    
    // Boost if exact title match
    if result.title.to_lowercase() == query {
        score += 5.0;
    }
    
    // Boost based on number of matches
    score += result.highlighted_snippets.len() as f64 * 0.5;
    
    // Boost for shorter paths (closer to root)
    let path_depth = result.path.matches('/').count();
    score += 10.0 / (path_depth as f64 + 1.0);
    
    score
}

/// Convert search results to plain text format for piping
pub fn format_search_results_plain(results: &[EnhancedSearchResult]) -> String {
    let mut output = String::new();
    
    for result in results {
        output.push_str(&format!("{}:{}\n", result.note_id, result.title));
        
        for snippet in &result.highlighted_snippets {
            output.push_str(&format!("  L{}: {}\n", snippet.line_number, snippet.content));
        }
        
        if !result.highlighted_snippets.is_empty() {
            output.push('\n');
        }
    }
    
    output
}

/// Convert search results to JSON format
pub fn format_search_results_json(results: &[EnhancedSearchResult]) -> Result<String> {
    Ok(serde_json::to_string_pretty(results)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_highlighted_snippets() {
        let content = "Line 1\nThis contains test word\nLine 3\nAnother test here\nLine 5";
        let snippets = generate_highlighted_snippets(content, "test", 1, false).unwrap();
        
        assert_eq!(snippets.len(), 2);
        assert_eq!(snippets[0].line_number, 2);
        assert_eq!(snippets[1].line_number, 4);
        assert!(!snippets[0].highlights.is_empty());
    }

    #[test]
    fn test_apply_highlights() {
        let highlights = vec![
            TextHighlight {
                start: 5,
                end: 9,
                match_text: "test".to_string(),
            }
        ];
        
        let result = apply_highlights("This test string", &highlights).unwrap();
        // We can't easily test colored output, but we can verify the structure
        assert!(result.len() > "This test string".len()); // Should have added ANSI codes
    }

    #[test]
    fn test_extract_match_context() {
        let text = "This is a very long string with the word test in the middle of it all";
        let context = extract_match_context(text, 45, 49, 10); // "test" match
        
        assert!(context.contains("test"));
        assert!(context.contains("...")); // Should have ellipsis
    }

    #[test]
    fn test_calculate_relevance_score() {
        let result = EnhancedSearchResult {
            note_id: "123".to_string(),
            title: "Test Title".to_string(),
            path: "root/folder".to_string(),
            score: 1.0,
            content: None,
            highlighted_snippets: vec![],
            context_lines: 2,
        };
        
        let score = calculate_relevance_score(&result, "test");
        assert!(score > 1.0); // Should be boosted for title match
    }
    
    #[test]
    fn test_validate_and_create_regex_security() {
        // Test pattern length limit
        let long_pattern = "a".repeat(1001);
        assert!(validate_and_create_regex(&long_pattern).is_err());
        
        // Test dangerous patterns
        assert!(validate_and_create_regex("(.+)*").is_err());
        assert!(validate_and_create_regex("(.*)*").is_err());
        
        // Test valid pattern
        assert!(validate_and_create_regex("test").is_ok());
        
        // Test nesting depth
        let deep_nested = "(".repeat(15) + "a" + &")".repeat(15);
        assert!(validate_and_create_regex(&deep_nested).is_err());
    }
    
    #[test]
    fn test_search_timeout_protection() {
        let content = "line\n".repeat(10000);
        // This should not timeout with a simple pattern
        let result = generate_highlighted_snippets(&content, "line", 1, false);
        assert!(result.is_ok());
    }
}