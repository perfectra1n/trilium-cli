use crate::api::TriliumClient;
use crate::cli::output::{print_info, print_search_results};
use crate::config::Config;
use crate::error::Result;

pub async fn handle(
    query: &str,
    limit: usize,
    fast: bool,
    archived: bool,
    config: &Config,
    output_format: &str,
) -> Result<()> {
    let client = TriliumClient::new(config)?;
    
    print_info(&format!("Searching for: {}", query));
    
    let results = client.search_notes(query, fast, archived, limit).await?;
    
    if results.is_empty() {
        print_info("No results found");
    } else {
        print_info(&format!("Found {} results", results.len()));
        print_search_results(&results, output_format);
    }
    
    Ok(())
}