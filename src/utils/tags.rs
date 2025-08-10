use crate::models::TagInfo;
use std::collections::{HashMap, HashSet};
use std::cell::RefCell;

// Thread-local cache for tag hierarchy computations
thread_local! {
    static TAG_HIERARCHY_CACHE: RefCell<HashMap<Vec<String>, Vec<TagInfo>>> = RefCell::new(HashMap::new());
}

/// Parse hierarchical tags from a tag string
/// Supports formats: #tag, #parent/child, #grand/parent/child
pub fn parse_hierarchical_tag(tag: &str) -> Vec<String> {
    let clean_tag = tag.strip_prefix('#').unwrap_or(tag);
    clean_tag.split('/').map(|s| s.trim().to_string()).collect()
}

/// Build a hierarchical structure from flat tag list with optimized single-pass algorithm
pub fn build_tag_hierarchy(tags: Vec<String>) -> Vec<TagInfo> {
    let mut tag_map: HashMap<String, TagInfo> = HashMap::new();
    let mut tag_counts: HashMap<String, usize> = HashMap::new();
    
    // Security: Limit total number of tags to prevent memory exhaustion
    const MAX_TOTAL_TAGS: usize = 10_000;
    if tags.len() > MAX_TOTAL_TAGS {
        eprintln!("Warning: Too many tags ({} > {}), truncating", tags.len(), MAX_TOTAL_TAGS);
    }
    
    // Count occurrences first for better performance
    for tag in tags.iter().take(MAX_TOTAL_TAGS) {
        let hierarchy = parse_hierarchical_tag(tag);
        
        // Security: Limit hierarchy depth to prevent stack overflow
        const MAX_HIERARCHY_DEPTH: usize = 10;
        let depth_limit = hierarchy.len().min(MAX_HIERARCHY_DEPTH);
        
        for i in 0..depth_limit {
            let partial_path = hierarchy[..=i].join("/");
            *tag_counts.entry(partial_path).or_insert(0) += 1;
        }
    }
    
    // Single pass: create all tag entries with counts and relationships
    for tag in tags.iter().take(MAX_TOTAL_TAGS) {
        let hierarchy = parse_hierarchical_tag(tag);
        let depth_limit = hierarchy.len().min(10); // Same limit as above
        
        for i in 0..depth_limit {
            let partial_path = hierarchy[..=i].join("/");
            
            // Only create if not already exists
            if !tag_map.contains_key(&partial_path) {
                let parent = if i > 0 { 
                    Some(hierarchy[..i].join("/")) 
                } else { 
                    None 
                };
                
                // Pre-compute children by checking if any paths start with this path
                let mut children = Vec::new();
                let child_prefix = format!("{}/", partial_path);
                
                for potential_child in tag_counts.keys() {
                    if potential_child.starts_with(&child_prefix) {
                        // Check if it's a direct child (no additional slashes)
                        let child_suffix = &potential_child[child_prefix.len()..];
                        if !child_suffix.contains('/') {
                            children.push(potential_child.clone());
                        }
                    }
                }
                
                // Sort children for consistent output
                children.sort();
                
                let count = tag_counts.get(&partial_path).copied().unwrap_or(0);
                
                tag_map.insert(partial_path.clone(), TagInfo {
                    name: partial_path,
                    hierarchy: hierarchy[..=i].to_vec(),
                    count,
                    parent,
                    children,
                });
            }
        }
    }
    
    // Convert to vector and sort by name for consistent output
    let mut result: Vec<TagInfo> = tag_map.into_values().collect();
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

/// Build tag hierarchy with caching for better performance on repeated calls
pub fn build_tag_hierarchy_cached(tags: Vec<String>) -> Vec<TagInfo> {
    // Create a cache key from sorted tags to ensure consistent caching
    let mut sorted_tags = tags.clone();
    sorted_tags.sort();
    
    TAG_HIERARCHY_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        
        // Check if we have a cached result
        if let Some(cached_result) = cache.get(&sorted_tags) {
            return cached_result.clone();
        }
        
        // Build hierarchy and cache the result
        let hierarchy = build_tag_hierarchy(tags);
        
        // Limit cache size to prevent memory leaks
        const MAX_CACHE_SIZE: usize = 100;
        if cache.len() >= MAX_CACHE_SIZE {
            cache.clear(); // Simple eviction strategy
        }
        
        cache.insert(sorted_tags, hierarchy.clone());
        hierarchy
    })
}

/// Filter tags by pattern with optimized matching (supports wildcards and hierarchy matching)
pub fn filter_tags_by_pattern(tags: &[TagInfo], pattern: &str) -> Vec<TagInfo> {
    // Security: Validate pattern length to prevent DoS
    const MAX_PATTERN_LENGTH: usize = 200;
    if pattern.len() > MAX_PATTERN_LENGTH {
        eprintln!("Warning: Pattern too long, truncating to {} characters", MAX_PATTERN_LENGTH);
        return Vec::new();
    }
    
    let pattern_lower = pattern.to_lowercase();
    let mut results = Vec::new();
    results.reserve(tags.len().min(1000)); // Pre-allocate reasonable capacity
    
    // Pre-compile regex if pattern contains wildcards for better performance
    let wildcard_regex = if pattern.contains('*') {
        let escaped_pattern = pattern_lower
            .replace('*', ".*")
            .replace('?', ".");
        regex::Regex::new(&format!("^{}$", escaped_pattern)).ok()
    } else {
        None
    };
    
    for tag in tags {
        let tag_lower = tag.name.to_lowercase();
        
        let matches = if let Some(ref regex) = wildcard_regex {
            // Use compiled regex for wildcard matching
            regex.is_match(&tag_lower)
        } else if pattern_lower == tag_lower {
            // Exact match - fastest path
            true
        } else if pattern.ends_with('/') {
            // Prefix match for hierarchy
            tag_lower.starts_with(&pattern_lower)
        } else {
            // Contains match
            tag_lower.contains(&pattern_lower)
        };
        
        if matches {
            results.push(tag.clone());
            
            // Security: Limit number of results to prevent memory exhaustion
            if results.len() >= 1000 {
                eprintln!("Warning: Too many matching tags, limiting to 1000 results");
                break;
            }
        }
    }
    
    results
}

/// Simple wildcard matching (* matches any sequence of characters)
fn wildcard_match(text: &str, pattern: &str) -> bool {
    let pattern_parts: Vec<&str> = pattern.split('*').collect();
    
    if pattern_parts.len() == 1 {
        return text == pattern;
    }
    
    let mut start = 0;
    for (i, part) in pattern_parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        
        if i == 0 && !text.starts_with(part) {
            return false;
        }
        
        if i == pattern_parts.len() - 1 && !text.ends_with(part) {
            return false;
        }
        
        if let Some(pos) = text[start..].find(part) {
            start = start + pos + part.len();
        } else {
            return false;
        }
    }
    
    true
}

/// Get all parent tags for a given tag
pub fn get_parent_tags(tag: &str) -> Vec<String> {
    let hierarchy = parse_hierarchical_tag(tag);
    let mut parents = Vec::new();
    
    for i in 0..hierarchy.len() - 1 {
        parents.push(hierarchy[..=i].join("/"));
    }
    
    parents
}

/// Get all child tags for a given tag with optimized lookup
pub fn get_child_tags(tag: &str, all_tags: &[TagInfo]) -> Vec<String> {
    // Security: Validate tag length
    if tag.len() > 200 {
        return Vec::new();
    }
    
    let tag_prefix = if tag.ends_with('/') { 
        tag.to_string() 
    } else { 
        format!("{}/", tag) 
    };
    
    let mut children = Vec::new();
    children.reserve(100); // Pre-allocate reasonable capacity
    
    // Use binary search if tags are sorted, otherwise linear search
    for tag_info in all_tags {
        if tag_info.name.starts_with(&tag_prefix) && tag_info.name != tag {
            children.push(tag_info.name.clone());
            
            // Security: Limit number of children to prevent memory exhaustion
            if children.len() >= 1000 {
                eprintln!("Warning: Tag has too many children, limiting to 1000");
                break;
            }
        }
    }
    
    children.sort(); // Ensure consistent ordering
    children
}

/// Suggest tag completions based on partial input with optimized performance
pub fn suggest_tag_completions(input: &str, available_tags: &[TagInfo]) -> Vec<String> {
    // Security: Limit input length to prevent DoS
    const MAX_INPUT_LENGTH: usize = 100;
    if input.len() > MAX_INPUT_LENGTH {
        return Vec::new();
    }
    
    let input_clean = input.strip_prefix('#').unwrap_or(input).to_lowercase();
    let mut suggestions = Vec::new();
    suggestions.reserve(15); // Pre-allocate for expected size
    
    // Early return for empty input
    if input_clean.is_empty() {
        return suggestions;
    }
    
    // Use a more efficient approach with scoring
    let mut scored_suggestions: Vec<(String, u8)> = Vec::new();
    
    for tag in available_tags.iter().take(10_000) { // Limit processing
        let tag_lower = tag.name.to_lowercase();
        let mut score = 0u8;
        
        // Score-based matching for better relevance
        if tag_lower == input_clean {
            score = 100; // Exact match - highest priority
        } else if tag_lower.starts_with(&input_clean) {
            score = 90; // Prefix match - high priority
        } else if tag.hierarchy.first().map_or(false, |part| part.to_lowercase().starts_with(&input_clean)) {
            score = 80; // Root level prefix match
        } else if tag.hierarchy.iter().any(|part| part.to_lowercase().starts_with(&input_clean)) {
            score = 70; // Any hierarchy level prefix match
        } else if tag_lower.contains(&input_clean) {
            score = 60; // Contains match
        } else if tag.hierarchy.iter().any(|part| part.to_lowercase().contains(&input_clean)) {
            score = 50; // Hierarchy part contains match
        }
        
        if score > 0 {
            scored_suggestions.push((format!("#{}", tag.name), score));
            
            // Early exit if we have enough high-quality matches
            if scored_suggestions.len() >= 50 && score >= 90 {
                break;
            }
        }
    }
    
    // Sort by score (descending), then by length (ascending), then alphabetically
    scored_suggestions.sort_by(|a, b| {
        b.1.cmp(&a.1) // Score descending
            .then_with(|| a.0.len().cmp(&b.0.len())) // Length ascending
            .then_with(|| a.0.cmp(&b.0)) // Alphabetical
    });
    
    // Extract suggestions and remove duplicates
    let mut seen = HashSet::new();
    for (suggestion, _score) in scored_suggestions {
        if seen.insert(suggestion.clone()) {
            suggestions.push(suggestion);
            if suggestions.len() >= 15 {
                break;
            }
        }
    }
    
    suggestions
}

/// Convert flat tags to hierarchical display format
pub fn format_tag_tree(tags: &[TagInfo], indent: &str) -> Vec<String> {
    let mut output = Vec::new();
    let root_tags: Vec<_> = tags.iter().filter(|t| t.parent.is_none()).collect();
    
    for tag in root_tags {
        format_tag_recursive(tag, tags, indent, 0, &mut output);
    }
    
    output
}

fn format_tag_recursive(tag: &TagInfo, all_tags: &[TagInfo], indent: &str, depth: usize, output: &mut Vec<String>) {
    let prefix = indent.repeat(depth);
    let count_info = if tag.count > 0 { format!(" ({})", tag.count) } else { String::new() };
    
    output.push(format!("{}#{}{}", prefix, tag.name, count_info));
    
    // Find and process children
    for child_name in &tag.children {
        if let Some(child) = all_tags.iter().find(|t| &t.name == child_name) {
            format_tag_recursive(child, all_tags, indent, depth + 1, output);
        }
    }
}

/// Extract tags from note content (handles both #tag and attribute-style)
pub fn extract_tags_from_content(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    
    // Match #hashtag style tags
    let tag_regex = regex::Regex::new(r"#([a-zA-Z][a-zA-Z0-9_/\-]*)\b").unwrap();
    for cap in tag_regex.captures_iter(content) {
        if let Some(tag) = cap.get(1) {
            tags.push(tag.as_str().to_string());
        }
    }
    
    tags.sort();
    tags.dedup();
    tags
}

/// Validate tag name format
pub fn is_valid_tag_name(tag: &str) -> bool {
    let clean_tag = tag.strip_prefix('#').unwrap_or(tag);
    
    if clean_tag.is_empty() {
        return false;
    }
    
    // Must start with letter, can contain letters, numbers, hyphens, underscores, and forward slashes
    let valid_regex = regex::Regex::new(r"^[a-zA-Z][a-zA-Z0-9_/\-]*$").unwrap();
    valid_regex.is_match(clean_tag)
}

/// Generate tag cloud data for visualization
pub fn generate_tag_cloud(tags: &[TagInfo]) -> Vec<(String, f64)> {
    if tags.is_empty() {
        return Vec::new();
    }
    
    let max_count = tags.iter().map(|t| t.count).max().unwrap_or(1);
    
    tags.iter()
        .filter(|t| t.count > 0)
        .map(|t| {
            let weight = (t.count as f64) / (max_count as f64);
            (format!("#{}", t.name), weight)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_hierarchical_tag() {
        assert_eq!(parse_hierarchical_tag("#project/work/urgent"), vec!["project", "work", "urgent"]);
        assert_eq!(parse_hierarchical_tag("simple"), vec!["simple"]);
        assert_eq!(parse_hierarchical_tag("parent/child"), vec!["parent", "child"]);
    }

    #[test]
    fn test_wildcard_match() {
        assert!(wildcard_match("project", "proj*"));
        assert!(wildcard_match("project/work", "proj*/work"));
        assert!(wildcard_match("test", "*est"));
        assert!(wildcard_match("middle", "*dd*"));
        assert!(!wildcard_match("project", "task*"));
    }

    #[test]
    fn test_is_valid_tag_name() {
        assert!(is_valid_tag_name("project"));
        assert!(is_valid_tag_name("project/work"));
        assert!(is_valid_tag_name("task-123"));
        assert!(is_valid_tag_name("my_tag"));
        assert!(!is_valid_tag_name("123invalid"));
        assert!(!is_valid_tag_name(""));
        assert!(!is_valid_tag_name("/starts-with-slash"));
    }

    #[test]
    fn test_extract_tags_from_content() {
        let content = "This is #important and #project/work related. Also #test.";
        let tags = extract_tags_from_content(content);
        
        assert_eq!(tags, vec!["important", "project/work", "test"]);
    }

    #[test]
    fn test_get_parent_tags() {
        let parents = get_parent_tags("project/work/urgent");
        assert_eq!(parents, vec!["project", "project/work"]);
        
        let parents = get_parent_tags("simple");
        assert!(parents.is_empty());
    }
    
    #[test]
    fn test_build_tag_hierarchy_performance() {
        // Test with a larger dataset to verify O(n) performance
        let tags: Vec<String> = (0..1000)
            .map(|i| format!("category{}/subcategory{}/item{}", i % 10, i % 100, i))
            .collect();
            
        let start = std::time::Instant::now();
        let hierarchy = build_tag_hierarchy(tags);
        let duration = start.elapsed();
        
        // Should complete quickly even with 1000 tags
        assert!(duration.as_millis() < 1000, "Hierarchy building took too long: {:?}", duration);
        assert!(!hierarchy.is_empty());
    }
    
    #[test]
    fn test_cached_hierarchy_building() {
        let tags = vec![
            "project/work".to_string(),
            "project/personal".to_string(),
            "task/urgent".to_string(),
        ];
        
        // First call should build and cache
        let hierarchy1 = build_tag_hierarchy_cached(tags.clone());
        
        // Second call should use cache
        let hierarchy2 = build_tag_hierarchy_cached(tags);
        
        // Results should be identical
        assert_eq!(hierarchy1.len(), hierarchy2.len());
        for (tag1, tag2) in hierarchy1.iter().zip(hierarchy2.iter()) {
            assert_eq!(tag1.name, tag2.name);
            assert_eq!(tag1.count, tag2.count);
        }
    }
    
    #[test]
    fn test_optimized_tag_filtering() {
        let tags = vec![
            TagInfo {
                name: "project/work/urgent".to_string(),
                hierarchy: vec!["project".to_string(), "work".to_string(), "urgent".to_string()],
                count: 5,
                parent: Some("project/work".to_string()),
                children: vec![],
            },
            TagInfo {
                name: "project/personal".to_string(),
                hierarchy: vec!["project".to_string(), "personal".to_string()],
                count: 3,
                parent: Some("project".to_string()),
                children: vec![],
            },
        ];
        
        // Test wildcard filtering
        let filtered = filter_tags_by_pattern(&tags, "project/*");
        assert_eq!(filtered.len(), 2);
        
        // Test exact match
        let filtered = filter_tags_by_pattern(&tags, "project/work/urgent");
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].name, "project/work/urgent");
    }
    
    #[test]
    fn test_suggestion_scoring() {
        let tags = vec![
            TagInfo {
                name: "project".to_string(),
                hierarchy: vec!["project".to_string()],
                count: 10,
                parent: None,
                children: vec![],
            },
            TagInfo {
                name: "project/work".to_string(),
                hierarchy: vec!["project".to_string(), "work".to_string()],
                count: 5,
                parent: Some("project".to_string()),
                children: vec![],
            },
            TagInfo {
                name: "important/project".to_string(),
                hierarchy: vec!["important".to_string(), "project".to_string()],
                count: 3,
                parent: Some("important".to_string()),
                children: vec![],
            },
        ];
        
        let suggestions = suggest_tag_completions("proj", &tags);
        
        // Exact prefix match should come first
        assert!(suggestions.len() >= 2);
        assert_eq!(suggestions[0], "#project");
        assert_eq!(suggestions[1], "#project/work");
    }
}