use crate::api::TriliumClient;
use crate::config::Config;
use crate::error::{Result, TriliumError};
use clap::{Command, CommandFactory};
use clap_complete::{generate, Generator, Shell};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Completion cache entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionCacheEntry {
    pub items: Vec<String>,
    pub generated_at: u64,
    pub ttl: u64,
}

/// Dynamic completion provider
pub struct CompletionProvider {
    config: Config,
    cache: HashMap<String, CompletionCacheEntry>,
    cache_path: PathBuf,
}

/// Types of completable items
#[derive(Debug, Clone)]
pub enum CompletionType {
    NoteId,
    NoteTitle,
    TagName,
    ProfileName,
    TemplateName,
    BranchId,
    AttributeName,
    AttachmentId,
    Command,
    Subcommand(String),
}

impl CompletionProvider {
    /// Create a new completion provider
    pub fn new(config: Config) -> Self {
        let cache_path = dirs::cache_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("trilium-cli")
            .join("completion_cache.json");

        let mut provider = Self {
            config,
            cache: HashMap::new(),
            cache_path,
        };

        // Load existing cache
        if let Err(e) = provider.load_cache() {
            eprintln!("Warning: Failed to load completion cache: {}", e);
        }

        provider
    }

    /// Generate shell completion scripts
    pub fn generate_completion_script<G: Generator>(
        gen: G,
        cmd: &mut Command,
        bin_name: &str,
        writer: &mut dyn io::Write,
    ) {
        generate(gen, cmd, bin_name.to_string(), writer);
    }

    /// Get completion suggestions for a specific type
    pub async fn get_completions(
        &mut self,
        completion_type: CompletionType,
        prefix: &str,
        limit: usize,
    ) -> Result<Vec<String>> {
        let cache_key = format!("{:?}", completion_type);

        // Check if we have cached data that's still valid
        if let Some(entry) = self.cache.get(&cache_key) {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();

            if now < entry.generated_at + entry.ttl {
                // Cache hit - filter and return
                return Ok(self.filter_completions(&entry.items, prefix, limit));
            }
        }

        // Cache miss or expired - fetch fresh data
        let items = self.fetch_completions(completion_type.clone()).await?;

        // Update cache
        let ttl = self.config.global.completion.cache_ttl;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let cache_entry = CompletionCacheEntry {
            items: items.clone(),
            generated_at: now,
            ttl,
        };

        self.cache.insert(cache_key, cache_entry);

        // Save cache asynchronously (don't block on errors)
        let _ = self.save_cache();

        Ok(self.filter_completions(&items, prefix, limit))
    }

    /// Fetch completions from the API or local sources
    async fn fetch_completions(&self, completion_type: CompletionType) -> Result<Vec<String>> {
        match completion_type {
            CompletionType::NoteId => {
                if let Ok(profile) = self.config.current_profile() {
                    let client = TriliumClient::new(&self.config)?;
                    // Get recent notes for quick completion
                    let mut note_ids: Vec<String> = profile.recent_notes
                        .iter()
                        .map(|note| note.note_id.clone())
                        .collect();

                    // Add bookmarked notes
                    note_ids.extend(profile.bookmarked_notes
                        .iter()
                        .map(|note| note.note_id.clone()));

                    // Try to get additional notes from API (if available)
                    if let Ok(search_results) = client.search_notes("", false, false, 100).await {
                        for result in search_results {
                            if !note_ids.contains(&result.note_id) {
                                note_ids.push(result.note_id);
                            }
                        }
                    }

                    Ok(note_ids)
                } else {
                    Ok(Vec::new())
                }
            }

            CompletionType::NoteTitle => {
                if let Ok(profile) = self.config.current_profile() {
                    let client = TriliumClient::new(&self.config)?;
                    let mut titles: Vec<String> = profile.recent_notes
                        .iter()
                        .map(|note| note.title.clone())
                        .collect();

                    titles.extend(profile.bookmarked_notes
                        .iter()
                        .map(|note| note.title.clone()));

                    // Try to get additional notes from API
                    if let Ok(search_results) = client.search_notes("", false, false, 100).await {
                        for result in search_results {
                            if !titles.contains(&result.title) {
                                titles.push(result.title);
                            }
                        }
                    }

                    Ok(titles)
                } else {
                    Ok(Vec::new())
                }
            }

            CompletionType::TagName => {
                // This would require an API endpoint for getting all tags
                // For now, return empty - could be enhanced later
                Ok(Vec::new())
            }

            CompletionType::ProfileName => {
                let profiles: Vec<String> = self.config.profiles.keys().cloned().collect();
                Ok(profiles)
            }

            CompletionType::TemplateName => {
                // This would require loading available templates
                Ok(Vec::new())
            }

            CompletionType::BranchId => {
                // This would require API integration
                Ok(Vec::new())
            }

            CompletionType::AttributeName => {
                // Common attribute names
                Ok(vec![
                    "label".to_string(),
                    "relation".to_string(),
                    "iconClass".to_string(),
                    "cssClass".to_string(),
                    "keyboardShortcut".to_string(),
                    "displayRelations".to_string(),
                    "run".to_string(),
                    "runOnInstance".to_string(),
                    "runOnStart".to_string(),
                ])
            }

            CompletionType::AttachmentId => {
                // This would require API integration
                Ok(Vec::new())
            }

            CompletionType::Command => {
                Ok(vec![
                    "tui".to_string(),
                    "config".to_string(),
                    "profile".to_string(),
                    "note".to_string(),
                    "search".to_string(),
                    "branch".to_string(),
                    "attribute".to_string(),
                    "attachment".to_string(),
                    "backup".to_string(),
                    "info".to_string(),
                    "calendar".to_string(),
                    "pipe".to_string(),
                    "link".to_string(),
                    "tag".to_string(),
                    "template".to_string(),
                    "quick".to_string(),
                    "plugin".to_string(),
                    "completion".to_string(),
                    "help".to_string(),
                ])
            }

            CompletionType::Subcommand(parent) => {
                match parent.as_str() {
                    "config" => Ok(vec![
                        "init".to_string(),
                        "show".to_string(),
                        "set".to_string(),
                    ]),
                    "profile" => Ok(vec![
                        "list".to_string(),
                        "show".to_string(),
                        "create".to_string(),
                        "delete".to_string(),
                        "set".to_string(),
                        "copy".to_string(),
                    ]),
                    "note" => Ok(vec![
                        "create".to_string(),
                        "get".to_string(),
                        "update".to_string(),
                        "delete".to_string(),
                        "list".to_string(),
                        "export".to_string(),
                        "import".to_string(),
                        "move".to_string(),
                        "clone".to_string(),
                    ]),
                    "branch" => Ok(vec![
                        "create".to_string(),
                        "list".to_string(),
                        "update".to_string(),
                        "delete".to_string(),
                    ]),
                    "attribute" => Ok(vec![
                        "create".to_string(),
                        "list".to_string(),
                        "update".to_string(),
                        "delete".to_string(),
                    ]),
                    "attachment" => Ok(vec![
                        "upload".to_string(),
                        "download".to_string(),
                        "list".to_string(),
                        "info".to_string(),
                        "delete".to_string(),
                    ]),
                    "link" => Ok(vec![
                        "backlinks".to_string(),
                        "outgoing".to_string(),
                        "broken".to_string(),
                        "update".to_string(),
                        "validate".to_string(),
                    ]),
                    "tag" => Ok(vec![
                        "list".to_string(),
                        "search".to_string(),
                        "cloud".to_string(),
                        "add".to_string(),
                        "remove".to_string(),
                        "rename".to_string(),
                    ]),
                    "template" => Ok(vec![
                        "list".to_string(),
                        "create".to_string(),
                        "show".to_string(),
                        "use".to_string(),
                        "update".to_string(),
                        "delete".to_string(),
                        "validate".to_string(),
                    ]),
                    "plugin" => Ok(vec![
                        "list".to_string(),
                        "install".to_string(),
                        "uninstall".to_string(),
                        "enable".to_string(),
                        "disable".to_string(),
                        "info".to_string(),
                        "run".to_string(),
                    ]),
                    "completion" => Ok(vec![
                        "generate".to_string(),
                        "install".to_string(),
                        "cache".to_string(),
                    ]),
                    _ => Ok(Vec::new()),
                }
            }
        }
    }

    /// Filter completions based on prefix and limit
    fn filter_completions(&self, items: &[String], prefix: &str, limit: usize) -> Vec<String> {
        let mut filtered: Vec<String> = items
            .iter()
            .filter(|item| item.starts_with(prefix))
            .cloned()
            .collect();

        filtered.sort();
        filtered.truncate(limit);
        filtered
    }

    /// Load completion cache from disk
    fn load_cache(&mut self) -> Result<()> {
        if !self.cache_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&self.cache_path)
            .map_err(|e| TriliumError::completion_error(&format!("Failed to read cache: {}", e)))?;

        let cache: HashMap<String, CompletionCacheEntry> = serde_json::from_str(&content)
            .map_err(|e| TriliumError::completion_error(&format!("Failed to parse cache: {}", e)))?;

        self.cache = cache;
        Ok(())
    }

    /// Save completion cache to disk
    fn save_cache(&self) -> Result<()> {
        if let Some(parent) = self.cache_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| TriliumError::completion_error(&format!("Failed to create cache directory: {}", e)))?;
        }

        let content = serde_json::to_string_pretty(&self.cache)
            .map_err(|e| TriliumError::completion_error(&format!("Failed to serialize cache: {}", e)))?;

        fs::write(&self.cache_path, content)
            .map_err(|e| TriliumError::completion_error(&format!("Failed to write cache: {}", e)))?;

        Ok(())
    }

    /// Clear completion cache
    pub fn clear_cache(&mut self) -> Result<()> {
        self.cache.clear();

        if self.cache_path.exists() {
            fs::remove_file(&self.cache_path)
                .map_err(|e| TriliumError::completion_error(&format!("Failed to remove cache file: {}", e)))?;
        }

        Ok(())
    }

    /// Refresh cache for specific completion type
    pub async fn refresh_cache(&mut self, completion_type: CompletionType) -> Result<()> {
        let cache_key = format!("{:?}", completion_type);
        self.cache.remove(&cache_key);
        self.get_completions(completion_type, "", 1000).await?;
        Ok(())
    }

    /// Install completion script for a shell
    pub fn install_completion_script(shell: Shell) -> Result<()> {
        let shell_name = match shell {
            Shell::Bash => "bash",
            Shell::Zsh => "zsh",
            Shell::Fish => "fish",
            Shell::PowerShell => "powershell",
            Shell::Elvish => "elvish",
            _ => return Err(TriliumError::completion_error("Unsupported shell")),
        };

        // Generate completion script
        let mut cmd = crate::cli::args::Cli::command();
        let mut script = Vec::new();
        Self::generate_completion_script(shell, &mut cmd, "trilium", &mut script);

        let script_content = String::from_utf8(script)
            .map_err(|e| TriliumError::completion_error(&format!("Invalid UTF-8 in completion script: {}", e)))?;

        // Determine installation path based on shell
        let install_path = match shell {
            Shell::Bash => {
                // Try system completions directory first
                let system_dir = PathBuf::from("/usr/share/bash-completion/completions");
                let user_dir = dirs::home_dir()
                    .map(|home| home.join(".local/share/bash-completion/completions"))
                    .unwrap_or_else(|| PathBuf::from("completions"));

                if system_dir.exists() && system_dir.is_dir() {
                    system_dir.join("trilium")
                } else {
                    user_dir.join("trilium")
                }
            }
            Shell::Zsh => {
                // Try to find site-functions directory
                let site_functions = PathBuf::from("/usr/share/zsh/site-functions");
                let user_functions = dirs::home_dir()
                    .map(|home| home.join(".local/share/zsh/site-functions"))
                    .unwrap_or_else(|| PathBuf::from("zsh-completions"));

                if site_functions.exists() && site_functions.is_dir() {
                    site_functions.join("_trilium")
                } else {
                    user_functions.join("_trilium")
                }
            }
            Shell::Fish => {
                let fish_dir = dirs::home_dir()
                    .map(|home| home.join(".config/fish/completions"))
                    .unwrap_or_else(|| PathBuf::from("fish-completions"));
                fish_dir.join("trilium.fish")
            }
            Shell::PowerShell => {
                let ps_dir = dirs::home_dir()
                    .map(|home| home.join("Documents/PowerShell/Scripts"))
                    .unwrap_or_else(|| PathBuf::from("powershell-completions"));
                ps_dir.join("trilium-completion.ps1")
            }
            Shell::Elvish => {
                let elvish_dir = dirs::home_dir()
                    .map(|home| home.join(".config/elvish/lib"))
                    .unwrap_or_else(|| PathBuf::from("elvish-completions"));
                elvish_dir.join("trilium-completion.elv")
            }
            _ => return Err(TriliumError::completion_error("Unsupported shell")),
        };

        // Create directory if it doesn't exist
        if let Some(parent) = install_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| TriliumError::completion_error(&format!("Failed to create completion directory: {}", e)))?;
        }

        // Write completion script
        fs::write(&install_path, script_content)
            .map_err(|e| TriliumError::completion_error(&format!("Failed to write completion script: {}", e)))?;

        println!("Completion script installed to: {}", install_path.display());
        println!();
        println!("To enable completions, add the following to your shell configuration:");
        println!();

        match shell {
            Shell::Bash => {
                println!("# Add to ~/.bashrc or ~/.bash_profile:");
                println!("source {}", install_path.display());
            }
            Shell::Zsh => {
                println!("# Add to ~/.zshrc:");
                if let Some(parent) = install_path.parent() {
                    println!("fpath=({} $fpath)", parent.display());
                }
                println!("autoload -U compinit && compinit");
            }
            Shell::Fish => {
                println!("# Fish will automatically load completions from the config directory");
                println!("# Restart your shell or run: source {}", install_path.display());
            }
            Shell::PowerShell => {
                println!("# Add to your PowerShell profile:");
                println!(". {}", install_path.display());
            }
            Shell::Elvish => {
                println!("# Add to ~/.config/elvish/rc.elv:");
                println!("use {}", install_path.file_stem().unwrap().to_string_lossy());
            }
            _ => {}
        }

        Ok(())
    }
}

/// Parse shell from string
pub fn parse_shell(shell_str: &str) -> Result<Shell> {
    match shell_str.to_lowercase().as_str() {
        "bash" => Ok(Shell::Bash),
        "zsh" => Ok(Shell::Zsh),
        "fish" => Ok(Shell::Fish),
        "powershell" | "pwsh" => Ok(Shell::PowerShell),
        "elvish" => Ok(Shell::Elvish),
        _ => Err(TriliumError::completion_error(&format!("Unsupported shell: {}", shell_str))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_completion_cache() {
        let temp_dir = TempDir::new().unwrap();
        let cache_path = temp_dir.path().join("cache.json");

        let mut config = Config::default();
        config.global.completion.cache_ttl = 3600;

        let mut provider = CompletionProvider {
            config,
            cache: HashMap::new(),
            cache_path,
        };

        // Add test cache entry
        let cache_entry = CompletionCacheEntry {
            items: vec!["item1".to_string(), "item2".to_string(), "item3".to_string()],
            generated_at: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            ttl: 3600,
        };

        provider.cache.insert("test".to_string(), cache_entry);

        // Test save and load
        provider.save_cache().unwrap();
        provider.cache.clear();
        provider.load_cache().unwrap();

        assert!(provider.cache.contains_key("test"));
        assert_eq!(provider.cache.get("test").unwrap().items.len(), 3);
    }

    #[tokio::test]
    async fn test_profile_name_completion() {
        let mut config = Config::default();
        config.profiles.insert("work".to_string(), Default::default());
        config.profiles.insert("personal".to_string(), Default::default());

        let mut provider = CompletionProvider::new(config);

        let completions = provider
            .get_completions(CompletionType::ProfileName, "", 10)
            .await
            .unwrap();

        assert!(completions.contains(&"work".to_string()));
        assert!(completions.contains(&"personal".to_string()));
        assert!(completions.contains(&"default".to_string()));
    }

    #[tokio::test]
    async fn test_completion_filtering() {
        let mut config = Config::default();
        config.profiles.insert("work-project".to_string(), Default::default());
        config.profiles.insert("work-notes".to_string(), Default::default());
        config.profiles.insert("personal".to_string(), Default::default());

        let mut provider = CompletionProvider::new(config);

        let completions = provider
            .get_completions(CompletionType::ProfileName, "work", 10)
            .await
            .unwrap();

        assert_eq!(completions.len(), 2);
        assert!(completions.contains(&"work-project".to_string()));
        assert!(completions.contains(&"work-notes".to_string()));
        assert!(!completions.contains(&"personal".to_string()));
    }

    #[test]
    fn test_shell_parsing() {
        assert!(matches!(parse_shell("bash"), Ok(Shell::Bash)));
        assert!(matches!(parse_shell("zsh"), Ok(Shell::Zsh)));
        assert!(matches!(parse_shell("fish"), Ok(Shell::Fish)));
        assert!(matches!(parse_shell("powershell"), Ok(Shell::PowerShell)));
        assert!(matches!(parse_shell("pwsh"), Ok(Shell::PowerShell)));
        assert!(matches!(parse_shell("elvish"), Ok(Shell::Elvish)));
        assert!(parse_shell("invalid").is_err());
    }

    #[tokio::test]
    async fn test_command_completion() {
        let config = Config::default();
        let mut provider = CompletionProvider::new(config);

        let completions = provider
            .get_completions(CompletionType::Command, "no", 10)
            .await
            .unwrap();

        assert!(completions.contains(&"note".to_string()));
        assert!(!completions.contains(&"config".to_string()));
    }

    #[tokio::test]
    async fn test_subcommand_completion() {
        let config = Config::default();
        let mut provider = CompletionProvider::new(config);

        let completions = provider
            .get_completions(CompletionType::Subcommand("note".to_string()), "", 10)
            .await
            .unwrap();

        assert!(completions.contains(&"create".to_string()));
        assert!(completions.contains(&"get".to_string()));
        assert!(completions.contains(&"update".to_string()));
        assert!(completions.contains(&"delete".to_string()));
    }
}