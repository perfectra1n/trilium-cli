use crate::api::TriliumClient;
use crate::cli::output::{print_info, print_search_results};
use crate::config::Config;
use crate::error::Result;
use crate::models::SearchOptions;
use crate::utils::search::{generate_highlighted_snippets, highlight_search_results, generate_search_stats, rank_search_results};
use serde_json;
use std::time::Instant;

pub async fn handle(
    query: &str,
    limit: usize,
    fast: bool,
    archived: bool,
    regex: bool,
    context: usize,
    include_content: bool,
    highlight: bool,
    config: &Config,
    output_format: &str,
) -> Result<()> {
    let client = TriliumClient::new(config)?;
    
    let start_time = Instant::now();
    
    print_info(&format!("Searching for: {}", query));
    
    // Use enhanced search if highlighting or content is requested
    if highlight || include_content {
        let options = SearchOptions {
            fast_search: fast,
            include_archived: archived,
            limit,
            regex_mode: regex,
            include_content,
            context_lines: context,
        };
        
        let mut enhanced_results = client.search_notes_enhanced(query, options).await?;
        
        if enhanced_results.is_empty() {
            print_info("No results found");
            return Ok(());
        }
        
        // Rank results by relevance
        rank_search_results(&mut enhanced_results, query);
        
        // Generate highlighted snippets for results that have content
        for result in &mut enhanced_results {
            if let Some(ref content) = result.content {
                result.highlighted_snippets = generate_highlighted_snippets(
                    content, query, context, regex
                )?;
            }
        }
        
        let search_time_ms = start_time.elapsed().as_millis() as u64;
        
        match output_format {
            "json" => {
                println!("{}", serde_json::to_string_pretty(&enhanced_results)?);
            }
            "plain" => {
                for result in &enhanced_results {
                    if result.highlighted_snippets.is_empty() {
                        println!("{}:{}", result.note_id, result.title);
                    } else {
                        for snippet in &result.highlighted_snippets {
                            println!("{}:{}:{}: {}", 
                                result.note_id, 
                                result.title, 
                                snippet.line_number, 
                                snippet.content
                            );
                        }
                    }
                }
            }
            _ => {
                if highlight {
                    let highlighted_output = highlight_search_results(&enhanced_results, query, context > 0)?;
                    for line in highlighted_output {
                        println!("{}", line);
                    }
                } else {
                    // Fall back to simple table output
                    print_search_results(&enhanced_results.iter().map(|r| crate::models::SearchResult {
                        note_id: r.note_id.clone(),
                        title: r.title.clone(),
                        path: r.path.clone(),
                        score: r.score,
                    }).collect::<Vec<_>>(), output_format);
                }
                
                println!("\n{}", generate_search_stats(&enhanced_results, query, search_time_ms));
            }
        }
    } else {
        // Use simple search for backwards compatibility
        let results = client.search_notes(query, fast, archived, limit).await?;
        
        if results.is_empty() {
            print_info("No results found");
        } else {
            print_info(&format!("Found {} results", results.len()));
            print_search_results(&results, output_format);
        }
    }
    
    Ok(())
}