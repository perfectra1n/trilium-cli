use crate::config::Config;
use crate::error::Result;
use crate::progress::{ProgressManager, ProgressIndicator, ProgressType};
use crate::models::SearchResult;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Progress integration helper for common operations
pub struct ProgressIntegration {
    manager: Arc<Mutex<ProgressManager>>,
}

impl ProgressIntegration {
    /// Create a new progress integration
    pub fn new(config: &Config, quiet: bool) -> Self {
        let manager = ProgressManager::new(config, quiet);
        Self {
            manager: Arc::new(Mutex::new(manager)),
        }
    }
    
    /// Create progress for API operations
    pub async fn api_progress(
        &self,
        operation: &str,
        total_operations: Option<u64>,
    ) -> Result<ProgressIndicator> {
        let manager = self.manager.lock().await;
        
        if let Some(total) = total_operations {
            Ok(manager.create_api_progress(total, operation).await)
        } else {
            Ok(manager.create_network_spinner(operation).await)
        }
    }
    
    /// Create progress for file operations
    pub async fn file_progress(
        &self,
        operation: &str,
        total_bytes: Option<u64>,
    ) -> Result<ProgressIndicator> {
        let manager = self.manager.lock().await;
        
        if let Some(total) = total_bytes {
            Ok(manager.create_file_progress(total, operation).await)
        } else {
            Ok(manager.create_spinner(&format!("{}...", operation)).await)
        }
    }
    
    /// Create progress for import/export operations
    pub async fn import_export_progress(
        &self,
        operation: &str,
        total_items: Option<u64>,
    ) -> Result<ProgressIndicator> {
        let manager = self.manager.lock().await;
        
        if let Some(total) = total_items {
            Ok(manager.create_progress_bar(
                total,
                &format!("{} items", operation),
                ProgressType::Bar,
            ).await)
        } else {
            Ok(manager.create_stream_counter(operation).await)
        }
    }
    
    /// Create progress for search operations
    pub async fn search_progress(&self, operation: &str) -> Result<ProgressIndicator> {
        let manager = self.manager.lock().await;
        Ok(manager.create_spinner(&format!("{}...", operation)).await)
    }
    
    /// Suspend all progress bars temporarily (for user input or output)
    pub async fn suspend<F, R>(&self, f: F) -> R
    where
        F: FnOnce() -> R,
    {
        let manager = self.manager.lock().await;
        manager.suspend(f).await
    }
    
    /// Wait for all progress indicators to complete
    pub async fn join(&self) -> Result<()> {
        let manager = self.manager.lock().await;
        manager.join().await
    }
}

/// Macro for easy progress creation
#[macro_export]
macro_rules! with_progress {
    ($progress_integration:expr, $operation:expr, $total:expr, $code:block) => {{
        let progress = $progress_integration.api_progress($operation, $total).await?;
        let result = $code;
        progress.finish();
        result
    }};
    
    ($progress_integration:expr, $operation:expr, $code:block) => {{
        let progress = $progress_integration.api_progress($operation, None).await?;
        let result = $code;
        progress.finish();
        result
    }};
}

/// Progress reporting utilities for long-running operations
pub mod utils {
    use super::*;
    use crate::api::TriliumClient;
    use tokio::time::Duration;
    
    /// Run API operation with progress reporting
    pub async fn with_api_progress<F, Fut, T>(
        progress: &ProgressIntegration,
        operation: &str,
        f: F,
    ) -> Result<T>
    where
        F: FnOnce(&ProgressIndicator) -> Fut,
        Fut: std::future::Future<Output = Result<T>>,
    {
        let indicator = progress.api_progress(operation, None).await?;
        let result = f(&indicator).await;
        
        match result {
            Ok(value) => {
                indicator.finish_with_message(&format!("{} completed", operation));
                Ok(value)
            }
            Err(e) => {
                indicator.abandon_with_message(&format!("{} failed", operation));
                Err(e)
            }
        }
    }
    
    /// Batch operation with progress reporting
    pub async fn batch_operation<T, F, Fut>(
        progress: &ProgressIntegration,
        operation: &str,
        items: Vec<T>,
        f: F,
    ) -> Result<Vec<Result<()>>>
    where
        F: Fn(T, &ProgressIndicator) -> Fut,
        Fut: std::future::Future<Output = Result<()>>,
    {
        let total = items.len() as u64;
        let indicator = progress.api_progress(operation, Some(total)).await?;
        
        let mut results = Vec::new();
        for (i, item) in items.into_iter().enumerate() {
            indicator.set_position(i as u64);
            indicator.set_message(&format!("{} item {}/{}", operation, i + 1, total));
            
            let result = f(item, &indicator).await;
            results.push(result);
            
            // Small delay to prevent overwhelming the server
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        
        indicator.finish_with_message(&format!("{} batch completed", operation));
        Ok(results)
    }
    
    /// Search operation with progress reporting
    pub async fn search_with_progress(
        progress: &ProgressIntegration,
        client: &TriliumClient,
        query: &str,
        limit: Option<usize>,
    ) -> Result<Vec<SearchResult>> {
        let indicator = progress.search_progress("Searching").await?;
        
        // Simulate progressive search (in real implementation, this would depend on the API)
        let result = tokio::time::timeout(
            Duration::from_secs(30),
            client.search_notes(query, false, false, limit.unwrap_or(100))
        ).await;
        
        match result {
            Ok(Ok(notes)) => {
                indicator.finish_with_message(&format!("Found {} notes", notes.len()));
                Ok(notes)
            }
            Ok(Err(e)) => {
                indicator.abandon_with_message("Search failed");
                Err(e)
            }
            Err(_) => {
                indicator.abandon_with_message("Search timed out");
                Err(crate::error::TriliumError::timeout("Search"))
            }
        }
    }
    
    /// Import operation with detailed progress
    pub async fn import_with_progress<T, F, Fut>(
        progress: &ProgressIntegration,
        operation: &str,
        items: Vec<T>,
        processor: F,
    ) -> Result<usize>
    where
        F: Fn(T) -> Fut,
        Fut: std::future::Future<Output = Result<()>>,
    {
        let total = items.len() as u64;
        let indicator = progress.import_export_progress(operation, Some(total)).await?;
        
        let mut successful = 0;
        let mut failed = 0;
        
        for (i, item) in items.into_iter().enumerate() {
            indicator.set_position(i as u64);
            indicator.set_message(&format!("{}: {} successful, {} failed", operation, successful, failed));
            
            match processor(item).await {
                Ok(_) => successful += 1,
                Err(_) => failed += 1,
            }
            
            // Update progress message with current stats
            indicator.set_message(&format!("{}: {} successful, {} failed", operation, successful, failed));
        }
        
        indicator.finish_with_message(&format!(
            "{} completed: {} successful, {} failed", 
            operation, 
            successful, 
            failed
        ));
        
        Ok(successful)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn test_progress_integration() {
        let config = Config::default();
        let progress = ProgressIntegration::new(&config, false);
        
        // Test API progress
        let api_indicator = progress.api_progress("Test API", Some(100)).await.unwrap();
        api_indicator.set_position(50);
        api_indicator.finish_with_message("API test completed");
        
        // Test file progress
        let file_indicator = progress.file_progress("Test File", None).await.unwrap();
        file_indicator.finish_with_message("File test completed");
    }

    #[tokio::test]
    async fn test_with_progress_macro() {
        let config = Config::default();
        let progress = ProgressIntegration::new(&config, false);
        
        let result = with_progress!(progress, "test operation", Some(10), {
            sleep(Duration::from_millis(100)).await;
            Ok::<i32, crate::error::TriliumError>(42)
        });
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_batch_operation() {
        let config = Config::default();
        let progress = ProgressIntegration::new(&config, false);
        
        let items = vec![1, 2, 3, 4, 5];
        let results = utils::batch_operation(
            &progress,
            "Processing",
            items,
            |item, indicator| async move {
                indicator.tick();
                tokio::time::sleep(Duration::from_millis(10)).await;
                if item % 2 == 0 {
                    Ok(())
                } else {
                    Err(crate::error::TriliumError::validation("odd number"))
                }
            }
        ).await.unwrap();
        
        assert_eq!(results.len(), 5);
        assert!(results[1].is_ok()); // item 2 should succeed
        assert!(results[0].is_err()); // item 1 should fail
    }

    #[tokio::test]
    async fn test_suspend_functionality() {
        let config = Config::default();
        let progress = ProgressIntegration::new(&config, false);
        
        let result = progress.suspend(|| {
            // This would normally print to stdout without interfering with progress bars
            "suspended operation result"
        }).await;
        
        assert_eq!(result, "suspended operation result");
    }
}