use crate::config::{Config, ProgressConfig};
use crate::error::{Result, TriliumError};
use indicatif::{ProgressBar, ProgressStyle, MultiProgress, ProgressDrawTarget};
use std::time::Duration;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Progress indicator types
#[derive(Debug, Clone)]
pub enum ProgressType {
    Bar,
    Spinner,
    Dots,
    Counter,
}

/// Progress manager that handles multiple progress indicators
#[derive(Debug, Clone)]
pub struct ProgressManager {
    multi: Arc<Mutex<MultiProgress>>,
    config: ProgressConfig,
    quiet: bool,
}

/// Individual progress indicator
#[derive(Debug)]
pub struct ProgressIndicator {
    bar: ProgressBar,
    progress_type: ProgressType,
}

impl ProgressManager {
    /// Create a new progress manager
    pub fn new(config: &Config, quiet: bool) -> Self {
        let multi = if config.global.progress.enabled && !quiet && !config.global.progress.quiet_mode {
            MultiProgress::new()
        } else {
            MultiProgress::with_draw_target(ProgressDrawTarget::hidden())
        };

        Self {
            multi: Arc::new(Mutex::new(multi)),
            config: config.global.progress.clone(),
            quiet: quiet || config.global.progress.quiet_mode,
        }
    }

    /// Create a new progress bar
    pub async fn create_progress_bar(
        &self,
        len: u64,
        message: &str,
        progress_type: ProgressType,
    ) -> ProgressIndicator {
        let multi = self.multi.lock().await;
        
        let bar = if self.quiet || !self.config.enabled {
            ProgressBar::hidden()
        } else {
            let pb = multi.add(ProgressBar::new(len));
            pb.set_message(message.to_string());
            
            let style = match progress_type {
                ProgressType::Bar => {
                    let mut template = "{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} {msg}";
                    if self.config.show_speed {
                        template = "{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({per_sec}) {msg}";
                    }
                    if self.config.show_eta {
                        template = "{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} (ETA: {eta}) {msg}";
                    }
                    if self.config.show_speed && self.config.show_eta {
                        template = "{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({per_sec}, ETA: {eta}) {msg}";
                    }
                    
                    ProgressStyle::with_template(template)
                        .unwrap()
                        .progress_chars("█▉▊▋▌▍▎▏  ")
                }
                ProgressType::Spinner => {
                    ProgressStyle::with_template("{spinner:.green} {elapsed} {msg}")
                        .unwrap()
                        .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"])
                }
                ProgressType::Dots => {
                    ProgressStyle::with_template("{spinner:.green} [{elapsed}] {pos}/{len} {msg}")
                        .unwrap()
                        .tick_strings(&["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"])
                }
                ProgressType::Counter => {
                    ProgressStyle::with_template("{elapsed} {pos}/{len} {msg}")
                        .unwrap()
                }
            };
            
            pb.set_style(style);
            pb.enable_steady_tick(Duration::from_millis(100));
            pb
        };

        ProgressIndicator {
            bar,
            progress_type,
        }
    }

    /// Create a spinner for indeterminate progress
    pub async fn create_spinner(&self, message: &str) -> ProgressIndicator {
        let multi = self.multi.lock().await;
        
        let bar = if self.quiet || !self.config.enabled {
            ProgressBar::hidden()
        } else {
            let pb = multi.add(ProgressBar::new_spinner());
            pb.set_message(message.to_string());
            
            let style = ProgressStyle::with_template("{spinner:.green} {elapsed} {msg}")
                .unwrap()
                .tick_strings(&["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]);
            
            pb.set_style(style);
            pb.enable_steady_tick(Duration::from_millis(100));
            pb
        };

        ProgressIndicator {
            bar,
            progress_type: ProgressType::Spinner,
        }
    }

    /// Create a counter for operations without known total
    pub async fn create_counter(&self, message: &str) -> ProgressIndicator {
        let multi = self.multi.lock().await;
        
        let bar = if self.quiet || !self.config.enabled {
            ProgressBar::hidden()
        } else {
            let pb = multi.add(ProgressBar::new(0));
            pb.set_message(message.to_string());
            
            let style = ProgressStyle::with_template("{elapsed} {pos} {msg}")
                .unwrap();
            
            pb.set_style(style);
            pb
        };

        ProgressIndicator {
            bar,
            progress_type: ProgressType::Counter,
        }
    }

    /// Suspend all progress bars temporarily
    pub async fn suspend<F, R>(&self, f: F) -> R
    where
        F: FnOnce() -> R,
    {
        let multi = self.multi.lock().await;
        multi.suspend(f)
    }

    /// Wait for all progress bars to complete
    pub async fn join(&self) -> Result<()> {
        let multi = self.multi.lock().await;
        multi.clear().map_err(|e| TriliumError::General(e.into()))?;
        Ok(())
    }
}

impl ProgressIndicator {
    /// Set the current position
    pub fn set_position(&self, pos: u64) {
        self.bar.set_position(pos);
    }

    /// Increment the position by 1
    pub fn inc(&self, delta: u64) {
        self.bar.inc(delta);
    }

    /// Set the message
    pub fn set_message(&self, message: &str) {
        self.bar.set_message(message.to_string());
    }

    /// Set the length (total items)
    pub fn set_length(&self, len: u64) {
        self.bar.set_length(len);
    }

    /// Finish the progress indicator
    pub fn finish(&self) {
        self.bar.finish();
    }

    /// Finish with a message
    pub fn finish_with_message(&self, message: &str) {
        self.bar.finish_with_message(message.to_string());
    }

    /// Abandon the progress indicator
    pub fn abandon(&self) {
        self.bar.abandon();
    }

    /// Abandon with a message
    pub fn abandon_with_message(&self, message: &str) {
        self.bar.abandon_with_message(message.to_string());
    }

    /// Check if the progress indicator is hidden
    pub fn is_hidden(&self) -> bool {
        self.bar.is_hidden()
    }

    /// Enable/disable steady tick
    pub fn enable_steady_tick(&self, interval: Duration) {
        self.bar.enable_steady_tick(interval);
    }

    /// Disable steady tick
    pub fn disable_steady_tick(&self) {
        self.bar.disable_steady_tick();
    }

    /// Reset the progress indicator
    pub fn reset(&self) {
        self.bar.reset();
    }

    /// Tick the progress indicator (useful for spinners)
    pub fn tick(&self) {
        self.bar.tick();
    }
}

/// Utility functions for common progress patterns
impl ProgressManager {
    /// Create a progress bar for file operations
    pub async fn create_file_progress(&self, total_bytes: u64, operation: &str) -> ProgressIndicator {
        self.create_progress_bar(
            total_bytes,
            &format!("{} files", operation),
            ProgressType::Bar,
        ).await
    }

    /// Create a progress bar for API operations
    pub async fn create_api_progress(&self, total_operations: u64, operation: &str) -> ProgressIndicator {
        self.create_progress_bar(
            total_operations,
            &format!("{} API calls", operation),
            ProgressType::Bar,
        ).await
    }

    /// Create a spinner for network operations
    pub async fn create_network_spinner(&self, operation: &str) -> ProgressIndicator {
        self.create_spinner(&format!("{}...", operation)).await
    }

    /// Create a counter for streaming operations
    pub async fn create_stream_counter(&self, operation: &str) -> ProgressIndicator {
        self.create_counter(&format!("{} items processed", operation)).await
    }
}

/// Progress reporting trait for operations that can report progress
pub trait ProgressReporter {
    fn report_progress(&self, current: u64, total: u64, message: &str);
}

impl ProgressReporter for ProgressIndicator {
    fn report_progress(&self, current: u64, total: u64, message: &str) {
        if total > 0 {
            self.set_length(total);
        }
        self.set_position(current);
        if !message.is_empty() {
            self.set_message(message);
        }
    }
}

/// Macro for easy progress reporting
#[macro_export]
macro_rules! progress_update {
    ($progress:expr, $current:expr, $total:expr) => {
        $progress.report_progress($current, $total, "");
    };
    ($progress:expr, $current:expr, $total:expr, $msg:expr) => {
        $progress.report_progress($current, $total, $msg);
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn test_progress_manager_creation() {
        let config = Config::default();
        let manager = ProgressManager::new(&config, false);
        
        // Should be able to create various types of progress indicators
        let _bar = manager.create_progress_bar(100, "Test progress", ProgressType::Bar).await;
        let _spinner = manager.create_spinner("Test spinner").await;
        let _counter = manager.create_counter("Test counter").await;
    }

    #[tokio::test]
    async fn test_progress_indicator_operations() {
        let config = Config::default();
        let manager = ProgressManager::new(&config, false);
        let progress = manager.create_progress_bar(100, "Test", ProgressType::Bar).await;
        
        // Test basic operations
        progress.set_position(50);
        progress.inc(10);
        progress.set_message("Updated message");
        progress.finish_with_message("Completed");
    }

    #[tokio::test]
    async fn test_quiet_mode() {
        let mut config = Config::default();
        config.global.progress.quiet_mode = true;
        
        let manager = ProgressManager::new(&config, false);
        let progress = manager.create_progress_bar(100, "Test", ProgressType::Bar).await;
        
        // Should be hidden in quiet mode
        assert!(progress.is_hidden());
    }

    #[tokio::test]
    async fn test_progress_types() {
        let config = Config::default();
        let manager = ProgressManager::new(&config, false);
        
        // Test different progress types
        let _bar = manager.create_progress_bar(100, "Bar", ProgressType::Bar).await;
        let _spinner = manager.create_progress_bar(0, "Spinner", ProgressType::Spinner).await;
        let _dots = manager.create_progress_bar(50, "Dots", ProgressType::Dots).await;
        let _counter = manager.create_progress_bar(0, "Counter", ProgressType::Counter).await;
    }

    #[tokio::test]
    async fn test_suspend_and_resume() {
        let config = Config::default();
        let manager = ProgressManager::new(&config, false);
        let _progress = manager.create_spinner("Test").await;
        
        // Test suspending progress to print something
        let result = manager.suspend(|| {
            println!("This should appear without interfering with progress");
            "test_result"
        }).await;
        
        assert_eq!(result, "test_result");
    }

    #[tokio::test]
    async fn test_progress_reporter_trait() {
        let config = Config::default();
        let manager = ProgressManager::new(&config, false);
        let progress = manager.create_progress_bar(100, "Test", ProgressType::Bar).await;
        
        // Test the ProgressReporter trait
        progress.report_progress(25, 100, "Quarter done");
        progress.report_progress(50, 100, "Half done");
        progress.report_progress(100, 100, "Complete");
    }
}