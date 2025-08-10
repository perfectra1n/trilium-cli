/// Developer Experience Integration Module
/// 
/// This module demonstrates how all the DX features work together to create
/// a professional, user-friendly CLI experience.

use crate::completion::CompletionProvider;
use crate::config::Config;
use crate::error::{EnhancedError, ErrorContext, TriliumError};
use crate::help::{HelpSystem, CommandSuggestions};
use crate::plugins::PluginManager;
use crate::progress_integration::ProgressIntegration;
use colored::Colorize;

/// Main DX coordinator that brings together all developer experience features
pub struct DXCoordinator {
    pub config: Config,
    pub help_system: HelpSystem,
    pub command_suggestions: CommandSuggestions,
    pub completion_provider: CompletionProvider,
    pub plugin_manager: PluginManager,
    pub progress: ProgressIntegration,
}

impl DXCoordinator {
    /// Initialize the DX coordinator with all systems
    pub async fn new(config: Config, quiet: bool) -> crate::error::Result<Self> {
        let help_system = HelpSystem::new();
        let command_suggestions = CommandSuggestions::new();
        let mut completion_provider = CompletionProvider::new(config.clone());
        let mut plugin_manager = PluginManager::new(config.clone());
        let progress = ProgressIntegration::new(&config, quiet);
        
        // Initialize plugins
        if let Err(e) = plugin_manager.discover_plugins().await {
            eprintln!("Warning: Failed to discover plugins: {}", e);
        }
        
        Ok(Self {
            config,
            help_system,
            command_suggestions,
            completion_provider,
            plugin_manager,
            progress,
        })
    }
    
    /// Handle command with full DX features
    pub async fn handle_command_with_dx(
        &mut self,
        args: Vec<String>,
    ) -> crate::error::Result<()> {
        // This would integrate with the actual command parsing
        // For now, demonstrate the DX features
        
        if args.is_empty() {
            return self.show_interactive_help().await;
        }
        
        let command = &args[0];
        
        // Check if it's a plugin command
        if let Some(plugin_commands) = self.plugin_manager.get_plugin_commands().get(command) {
            return self.execute_plugin_command(command, &args[1..]).await;
        }
        
        // Handle built-in commands with enhanced error reporting
        match self.execute_builtin_command(command, &args[1..]).await {
            Ok(()) => Ok(()),
            Err(e) => {
                self.handle_error_with_suggestions(e, command, &args).await
            }
        }
    }
    
    /// Show interactive help with context
    async fn show_interactive_help(&self) -> crate::error::Result<()> {
        println!("{}", "Welcome to Trilium CLI!".bright_blue().bold());
        println!();
        
        // Show current profile
        println!("Current profile: {}", self.config.current_profile.yellow());
        
        // Show quick start
        println!("{}", "Quick start:".green().bold());
        println!("  trilium tui                 # Interactive mode");
        println!("  trilium help setup          # Getting started guide");
        println!("  trilium note list           # List your notes");
        println!("  trilium search \"keyword\"     # Search notes");
        println!();
        
        // Show available plugins
        let plugins = self.plugin_manager.list_plugins();
        if !plugins.is_empty() {
            println!("{} ({} available):", "Plugins".green().bold(), plugins.len());
            for plugin in plugins.iter().take(3) {
                println!("  {} - {}", 
                    plugin.name.cyan(), 
                    plugin.description.as_deref().unwrap_or("No description")
                );
            }
            if plugins.len() > 3 {
                println!("  ... and {} more (use 'trilium plugin list' to see all)", plugins.len() - 3);
            }
            println!();
        }
        
        println!("For detailed help: {}", "trilium help".yellow());
        Ok(())
    }
    
    /// Execute plugin command with progress reporting
    async fn execute_plugin_command(&self, plugin_name: &str, args: &[String]) -> crate::error::Result<()> {
        if args.is_empty() {
            return Err(TriliumError::validation("Plugin command required"));
        }
        
        let command_name = &args[0];
        let command_args = args[1..].to_vec();
        
        // Show progress for plugin execution
        let progress = self.progress.api_progress("Running plugin", None).await?;
        
        let result = self.plugin_manager.execute_plugin_command(
            plugin_name,
            command_name,
            command_args.iter().map(|s| s.clone()).collect(),
            None,
        ).await;
        
        match result {
            Ok(plugin_result) => {
                progress.finish_with_message("Plugin completed");
                
                if plugin_result.success {
                    println!("{}", serde_json::to_string_pretty(&plugin_result.output)?);
                } else {
                    eprintln!("Plugin failed: {}", plugin_result.error.unwrap_or("Unknown error".to_string()));
                }
                Ok(())
            }
            Err(e) => {
                progress.abandon_with_message("Plugin failed");
                Err(e)
            }
        }
    }
    
    /// Execute built-in command (placeholder)
    async fn execute_builtin_command(&self, command: &str, args: &[String]) -> crate::error::Result<()> {
        // This would integrate with actual command execution
        // For demo purposes, simulate some commands
        match command {
            "help" => {
                let topic = args.first().map(|s| s.as_str());
                match topic {
                    Some(topic) => self.help_system.display_help(topic),
                    None => self.help_system.display_index(),
                }
            }
            "profile" => {
                if args.is_empty() {
                    return Err(TriliumError::validation("Profile subcommand required"));
                }
                // Simulate profile command
                println!("Profile command: {} {:?}", args[0], &args[1..]);
                Ok(())
            }
            _ => {
                Err(TriliumError::NotFound(format!("Unknown command: {}", command)))
            }
        }
    }
    
    /// Handle errors with enhanced context and suggestions
    async fn handle_error_with_suggestions(
        &self,
        error: TriliumError,
        command: &str,
        args: &[String],
    ) -> crate::error::Result<()> {
        let mut context = ErrorContext::new()
            .with_operation_context(&format!("Executing command: {} {}", command, args.join(" ")));
        
        // Add command-specific suggestions
        if let TriliumError::NotFound(_) = error {
            let similar_commands = self.command_suggestions.suggest_command(command);
            if !similar_commands.is_empty() {
                context = context.with_similar_items(similar_commands);
            }
            
            // Check if it might be a subcommand
            if !args.is_empty() {
                let similar_subcommands = self.command_suggestions.suggest_subcommand(command, &args[0]);
                if !similar_subcommands.is_empty() {
                    context = context.with_suggestion(&format!(
                        "Try: trilium {} {}", 
                        command, 
                        similar_subcommands.join(" or ")
                    ));
                }
            }
        }
        
        // Add contextual help topics
        let help_topics = error.get_help_topics();
        if !help_topics.is_empty() {
            context = context.with_help_topic(&help_topics[0]);
        }
        
        // Add general suggestions from error type
        let suggestions = error.get_suggestions();
        context = context.with_suggestions(suggestions);
        
        let enhanced_error = error.with_context(context);
        eprintln!("{}", enhanced_error);
        
        Err(enhanced_error.error)
    }
    
    /// Provide contextual completions
    pub async fn get_contextual_completions(
        &mut self,
        partial_command: &[String],
        current_arg: &str,
    ) -> crate::error::Result<Vec<String>> {
        use crate::completion::{CompletionType};
        
        if partial_command.is_empty() {
            // Complete main commands
            return self.completion_provider.get_completions(
                CompletionType::Command,
                current_arg,
                10,
            ).await;
        }
        
        let command = &partial_command[0];
        
        match command.as_str() {
            "note" => {
                if partial_command.len() == 1 {
                    // Complete note subcommands
                    self.completion_provider.get_completions(
                        CompletionType::Subcommand("note".to_string()),
                        current_arg,
                        10,
                    ).await
                } else {
                    // Complete note IDs
                    self.completion_provider.get_completions(
                        CompletionType::NoteId,
                        current_arg,
                        20,
                    ).await
                }
            }
            "profile" => {
                if partial_command.len() == 1 {
                    self.completion_provider.get_completions(
                        CompletionType::Subcommand("profile".to_string()),
                        current_arg,
                        10,
                    ).await
                } else {
                    self.completion_provider.get_completions(
                        CompletionType::ProfileName,
                        current_arg,
                        10,
                    ).await
                }
            }
            "search" => {
                // For search, we might complete recent searches or common patterns
                Ok(vec![
                    "#tag".to_string(),
                    "TODO".to_string(),
                    "FIXME".to_string(),
                    "meeting".to_string(),
                    "project".to_string(),
                ])
            }
            _ => {
                // Default to note IDs for most commands that might take them
                self.completion_provider.get_completions(
                    CompletionType::NoteId,
                    current_arg,
                    10,
                ).await
            }
        }
    }
    
    /// Show comprehensive status
    pub async fn show_status(&self) -> crate::error::Result<()> {
        println!("{}", "Trilium CLI Status".bright_blue().bold());
        println!("{}", "==================".blue());
        println!();
        
        // Configuration status
        println!("{}", "Configuration:".green().bold());
        println!("  Current profile: {}", self.config.current_profile.yellow());
        println!("  Available profiles: {}", self.config.profiles.len());
        if let Ok(profile) = self.config.current_profile() {
            println!("  Server URL: {}", profile.server_url);
            println!("  Recent notes: {}", profile.recent_notes.len());
            println!("  Bookmarks: {}", profile.bookmarked_notes.len());
        }
        println!();
        
        // Plugin status
        let plugins = self.plugin_manager.list_plugins();
        println!("{}", "Plugins:".green().bold());
        println!("  Installed: {}", plugins.len());
        for plugin in plugins.iter().take(3) {
            println!("  - {} v{}", plugin.name, plugin.version);
        }
        if plugins.len() > 3 {
            println!("  ... and {} more", plugins.len() - 3);
        }
        println!();
        
        // Help topics
        let topics = self.help_system.list_topics();
        println!("{}", "Help:".green().bold());
        println!("  Available topics: {}", topics.len());
        println!("  Use 'trilium help' to explore");
        println!();
        
        // Quick actions
        println!("{}", "Quick actions:".green().bold());
        println!("  trilium tui              # Interactive mode");
        println!("  trilium help setup       # Getting started");
        println!("  trilium profile list     # Manage profiles");
        println!("  trilium completion install  # Enable shell completion");
        println!();
        
        Ok(())
    }
}

/// Example usage showing all DX features working together
pub async fn example_dx_integration() -> crate::error::Result<()> {
    // Initialize with full DX features
    let config = Config::default();
    let mut dx = DXCoordinator::new(config, false).await?;
    
    // Example 1: Enhanced error with suggestions
    println!("{}", "Example 1: Enhanced Error Handling".cyan().bold());
    let result = dx.handle_command_with_dx(vec!["noe".to_string(), "create".to_string()]).await;
    match result {
        Err(_) => println!("✓ Enhanced error with suggestions shown"),
        Ok(_) => println!("! Expected error but got success"),
    }
    println!();
    
    // Example 2: Contextual completions
    println!("{}", "Example 2: Contextual Completions".cyan().bold());
    let completions = dx.get_contextual_completions(&["note".to_string()], "cr").await?;
    println!("Completions for 'note cr': {:?}", completions);
    println!();
    
    // Example 3: Status overview
    println!("{}", "Example 3: Comprehensive Status".cyan().bold());
    dx.show_status().await?;
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_dx_coordinator() {
        let config = Config::default();
        let dx = DXCoordinator::new(config, true).await; // quiet mode for testing
        assert!(dx.is_ok());
    }

    #[tokio::test]
    async fn test_contextual_completions() {
        let config = Config::default();
        let mut dx = DXCoordinator::new(config, true).await.unwrap();
        
        // Test command completions
        let completions = dx.get_contextual_completions(&[], "no").await.unwrap();
        assert!(completions.contains(&"note".to_string()));
        
        // Test subcommand completions
        let completions = dx.get_contextual_completions(&["note".to_string()], "cr").await.unwrap();
        assert!(completions.contains(&"create".to_string()));
    }

    #[tokio::test]
    async fn test_error_enhancement() {
        let config = Config::default();
        let dx = DXCoordinator::new(config, true).await.unwrap();
        
        // Test error handling
        let result = dx.handle_command_with_dx(vec!["nonexistent".to_string()]).await;
        assert!(result.is_err());
    }
}