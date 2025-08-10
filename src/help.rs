use crate::error::{Result, TriliumError};
use colored::Colorize;
use std::collections::HashMap;

/// Comprehensive help system for Trilium CLI
pub struct HelpSystem {
    topics: HashMap<String, HelpTopic>,
}

/// Individual help topic
#[derive(Debug, Clone)]
pub struct HelpTopic {
    pub title: String,
    pub description: String,
    pub content: String,
    pub examples: Vec<HelpExample>,
    pub see_also: Vec<String>,
    pub aliases: Vec<String>,
}

/// Help example with description and command
#[derive(Debug, Clone)]
pub struct HelpExample {
    pub description: String,
    pub command: String,
    pub output: Option<String>,
}

impl HelpSystem {
    /// Create a new help system with all topics
    pub fn new() -> Self {
        let mut system = Self {
            topics: HashMap::new(),
        };
        
        system.register_all_topics();
        system
    }
    
    /// Register all help topics
    fn register_all_topics(&mut self) {
        self.register_setup_topics();
        self.register_command_topics();
        self.register_workflow_topics();
        self.register_troubleshooting_topics();
    }
    
    /// Register setup and configuration topics
    fn register_setup_topics(&mut self) {
        self.topics.insert("setup".to_string(), HelpTopic {
            title: "Getting Started with Trilium CLI".to_string(),
            description: "Initial setup and configuration".to_string(),
            content: r#"
To get started with Trilium CLI:

1. Initialize configuration:
   trilium config init

2. Set up your server connection and API token

3. Test the connection:
   trilium info

4. Start exploring:
   trilium tui          # Interactive mode
   trilium note list    # List notes
   trilium search "your query"  # Search notes
"#.to_string(),
            examples: vec![
                HelpExample {
                    description: "Initialize configuration interactively".to_string(),
                    command: "trilium config init".to_string(),
                    output: None,
                },
                HelpExample {
                    description: "Test your connection".to_string(),
                    command: "trilium info".to_string(),
                    output: Some("Trilium version: 0.50.1\nServer: https://your-trilium.com".to_string()),
                },
            ],
            see_also: vec!["config".to_string(), "authentication".to_string(), "profiles".to_string()],
            aliases: vec!["getting-started".to_string(), "quickstart".to_string()],
        });
        
        self.topics.insert("config".to_string(), HelpTopic {
            title: "Configuration Management".to_string(),
            description: "Managing CLI configuration and settings".to_string(),
            content: r#"
Configuration is stored in YAML format at:
- Linux/macOS: ~/.config/trilium-cli/config.yaml
- Windows: %APPDATA%/trilium-cli/config.yaml

Key configuration options:
- server_url: Your Trilium server URL
- api_token: ETAPI token from Trilium
- default_parent_id: Default parent for new notes
- default_note_type: Default type for new notes (text, code, etc.)
- editor: Text editor command
- timeout_seconds: API request timeout
- max_retries: Number of retry attempts

Use profiles to manage multiple Trilium instances:
trilium profile create work --description "Work notes"
trilium profile set work
"#.to_string(),
            examples: vec![
                HelpExample {
                    description: "Show current configuration".to_string(),
                    command: "trilium config show".to_string(),
                    output: None,
                },
                HelpExample {
                    description: "Set a configuration value".to_string(),
                    command: "trilium config set timeout_seconds 60".to_string(),
                    output: None,
                },
            ],
            see_also: vec!["profiles".to_string(), "authentication".to_string()],
            aliases: vec!["configuration".to_string(), "settings".to_string()],
        });
        
        self.topics.insert("profiles".to_string(), HelpTopic {
            title: "Profile Management".to_string(),
            description: "Working with multiple Trilium instances using profiles".to_string(),
            content: r#"
Profiles allow you to manage multiple Trilium instances with different configurations.

Profile commands:
- trilium profile list              # List all profiles
- trilium profile show [name]       # Show profile details
- trilium profile create <name>     # Create new profile
- trilium profile delete <name>     # Delete profile
- trilium profile set <name>        # Switch to profile
- trilium profile copy <from> <to>  # Copy profile settings

You can also specify a profile for a single command:
trilium --profile work note list
"#.to_string(),
            examples: vec![
                HelpExample {
                    description: "Create a work profile".to_string(),
                    command: r#"trilium profile create work --description "Work Trilium instance""#.to_string(),
                    output: None,
                },
                HelpExample {
                    description: "Use a specific profile for one command".to_string(),
                    command: "trilium --profile work note list".to_string(),
                    output: None,
                },
            ],
            see_also: vec!["config".to_string(), "authentication".to_string()],
            aliases: vec!["profile".to_string()],
        });
    }
    
    /// Register command-specific topics
    fn register_command_topics(&mut self) {
        self.topics.insert("notes".to_string(), HelpTopic {
            title: "Note Management".to_string(),
            description: "Creating, editing, and managing notes".to_string(),
            content: r#"
Note operations:
- Create: trilium note create "Title" --content "Content"
- Read: trilium note get <note-id>
- Update: trilium note update <note-id> --title "New Title"
- Delete: trilium note delete <note-id>
- List: trilium note list [parent-id]
- Export: trilium note export <note-id> --format html
- Import: trilium note import file.md

Note types:
- text: Plain text notes
- code: Source code with syntax highlighting
- markdown: Markdown formatted text
- html: Rich HTML content
- image: Image attachments
- file: File attachments
- book: Container notes for organization
"#.to_string(),
            examples: vec![
                HelpExample {
                    description: "Create a quick text note".to_string(),
                    command: r#"trilium note create "Meeting Notes" --content "Discussion points:""#.to_string(),
                    output: Some("Created note: abc123".to_string()),
                },
                HelpExample {
                    description: "Create a code note".to_string(),
                    command: r#"trilium note create "Script" --type code --edit"#.to_string(),
                    output: None,
                },
            ],
            see_also: vec!["search".to_string(), "templates".to_string(), "editing".to_string()],
            aliases: vec!["note".to_string(), "notes-management".to_string()],
        });
        
        self.topics.insert("search".to_string(), HelpTopic {
            title: "Searching Notes".to_string(),
            description: "Finding notes using search queries".to_string(),
            content: r#"
Search syntax:
- Simple text: trilium search "meeting"
- Phrase search: trilium search "project planning"
- Regex search: trilium search --regex "bug-\d+"

Search options:
- --limit N: Limit results to N notes
- --fast: Use fast search (title only)
- --archived: Include archived notes
- --regex: Use regular expressions
- --context N: Show N lines of context around matches
- --content: Search note content (slower but more thorough)

Advanced search features:
- Use quotes for exact phrases
- Use * for wildcards (in regex mode)
- Combine with other commands using pipes
"#.to_string(),
            examples: vec![
                HelpExample {
                    description: "Basic text search".to_string(),
                    command: r#"trilium search "project documentation""#.to_string(),
                    output: None,
                },
                HelpExample {
                    description: "Regex search with context".to_string(),
                    command: r#"trilium search --regex "TODO|FIXME" --context 3"#.to_string(),
                    output: None,
                },
            ],
            see_also: vec!["notes".to_string(), "tags".to_string()],
            aliases: vec!["searching".to_string(), "find".to_string()],
        });
        
        self.topics.insert("import-export".to_string(), HelpTopic {
            title: "Import and Export".to_string(),
            description: "Moving data in and out of Trilium".to_string(),
            content: r#"
Import options:
- Obsidian vault: trilium import-obsidian /path/to/vault
- Notion export: trilium import-notion export.zip
- Directory: trilium import-dir /path/to/notes --patterns "*.md" "*.txt"
- Single file: trilium note import file.md

Export options:
- HTML: trilium note export <note-id> --format html
- Markdown: trilium note export <note-id> --format markdown
- To Obsidian: trilium export-obsidian <note-id> /path/to/vault

Supported formats:
- Markdown (.md, .markdown)
- HTML (.html, .htm)
- Text (.txt)
- JSON (structured data)
- Code files (various extensions)
"#.to_string(),
            examples: vec![
                HelpExample {
                    description: "Import an Obsidian vault".to_string(),
                    command: "trilium import-obsidian ~/Documents/MyVault --parent root".to_string(),
                    output: None,
                },
                HelpExample {
                    description: "Export a note branch to Obsidian format".to_string(),
                    command: "trilium export-obsidian abc123 ~/Exports/trilium-export".to_string(),
                    output: None,
                },
            ],
            see_also: vec!["notes".to_string(), "formats".to_string()],
            aliases: vec!["importing".to_string(), "exporting".to_string()],
        });
    }
    
    /// Register workflow topics
    fn register_workflow_topics(&mut self) {
        self.topics.insert("workflows".to_string(), HelpTopic {
            title: "Common Workflows".to_string(),
            description: "Typical usage patterns and workflows".to_string(),
            content: r#"
Daily note-taking workflow:
1. Use quick capture: echo "Meeting with John" | trilium pipe --title "$(date)"
2. Create structured notes with templates
3. Tag notes for organization: trilium tag add <note-id> meeting
4. Link related notes

Research workflow:
1. Create a research project note (book type)
2. Collect sources as child notes
3. Create summary notes linking to sources
4. Use search to find related content
5. Export final research as markdown/HTML

Task management workflow:
1. Create task notes with TODO items
2. Use labels for priority and status
3. Search for tasks: trilium search "tag:task tag:todo"
4. Update task status as work progresses

Documentation workflow:
1. Create documentation structure (book notes)
2. Write content in markdown format
3. Link between related documentation
4. Export as HTML for sharing
5. Keep documentation updated with version labels
"#.to_string(),
            examples: vec![
                HelpExample {
                    description: "Quick daily capture".to_string(),
                    command: r#"echo "Today's insights" | trilium pipe --title "Daily Notes $(date +%Y-%m-%d)""#.to_string(),
                    output: None,
                },
                HelpExample {
                    description: "Find all task notes".to_string(),
                    command: "trilium search \"#task\" --limit 20".to_string(),
                    output: None,
                },
            ],
            see_also: vec!["templates".to_string(), "tags".to_string(), "quick".to_string()],
            aliases: vec!["workflow".to_string(), "patterns".to_string()],
        });
    }
    
    /// Register troubleshooting topics
    fn register_troubleshooting_topics(&mut self) {
        self.topics.insert("troubleshooting".to_string(), HelpTopic {
            title: "Troubleshooting".to_string(),
            description: "Common issues and solutions".to_string(),
            content: r#"
Connection issues:
- Check server URL in config: trilium config show
- Verify ETAPI token is correct
- Test with: trilium info
- Check network connectivity

Authentication errors:
- Generate new ETAPI token in Trilium web interface
- Update token: trilium config set api_token "new_token"
- Ensure token has necessary permissions

Performance issues:
- Increase timeout: trilium config set timeout_seconds 60
- Use --fast flag for searches
- Limit search results with --limit
- Clear completion cache: trilium completion cache clear

Common error solutions:
- "Profile not found": Use trilium profile list to see available profiles
- "Note not found": Check note ID or use search to find correct ID
- "Permission denied": Verify ETAPI token permissions
- "Connection refused": Ensure Trilium server is running and accessible

Debug mode:
- Use --verbose flag for detailed logging
- Check configuration with trilium config show
- Test API connection with trilium info
"#.to_string(),
            examples: vec![
                HelpExample {
                    description: "Test API connection".to_string(),
                    command: "trilium info --verbose".to_string(),
                    output: None,
                },
                HelpExample {
                    description: "Clear all caches".to_string(),
                    command: "trilium completion cache clear".to_string(),
                    output: Some("Completion cache cleared".to_string()),
                },
            ],
            see_also: vec!["config".to_string(), "authentication".to_string()],
            aliases: vec!["debugging".to_string(), "issues".to_string(), "problems".to_string()],
        });
    }
    
    /// Get help for a specific topic
    pub fn get_help(&self, topic: &str) -> Result<&HelpTopic> {
        // Try direct match first
        if let Some(help_topic) = self.topics.get(topic) {
            return Ok(help_topic);
        }
        
        // Try aliases
        for (_, help_topic) in &self.topics {
            if help_topic.aliases.contains(&topic.to_string()) {
                return Ok(help_topic);
            }
        }
        
        // Try fuzzy matching
        let similar = self.find_similar_topics(topic);
        if similar.is_empty() {
            Err(TriliumError::NotFound(format!("Help topic '{}' not found", topic)))
        } else {
            let suggestions = similar.join(", ");
            Err(TriliumError::NotFound(format!(
                "Help topic '{}' not found. Did you mean: {}?", 
                topic, 
                suggestions
            )))
        }
    }
    
    /// Find similar topic names using fuzzy matching
    fn find_similar_topics(&self, topic: &str) -> Vec<String> {
        use strsim::jaro_winkler;
        
        let mut matches: Vec<(f64, String)> = Vec::new();
        
        // Check main topic names
        for topic_name in self.topics.keys() {
            let similarity = jaro_winkler(topic, topic_name);
            if similarity > 0.6 {
                matches.push((similarity, topic_name.clone()));
            }
        }
        
        // Check aliases
        for (topic_name, help_topic) in &self.topics {
            for alias in &help_topic.aliases {
                let similarity = jaro_winkler(topic, alias);
                if similarity > 0.6 {
                    matches.push((similarity, topic_name.clone()));
                }
            }
        }
        
        // Sort by similarity and remove duplicates
        matches.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        matches.into_iter()
            .map(|(_, name)| name)
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .take(3)
            .collect()
    }
    
    /// List all available topics
    pub fn list_topics(&self) -> Vec<String> {
        let mut topics: Vec<String> = self.topics.keys().cloned().collect();
        topics.sort();
        topics
    }
    
    /// Display help topic in formatted way
    pub fn display_help(&self, topic: &str) -> Result<()> {
        let help_topic = self.get_help(topic)?;
        
        // Title
        println!("{}", help_topic.title.bright_blue().bold());
        println!("{}", "=".repeat(help_topic.title.len()).blue());
        println!();
        
        // Description
        println!("{}", help_topic.description.italic());
        println!();
        
        // Content
        println!("{}", help_topic.content);
        
        // Examples
        if !help_topic.examples.is_empty() {
            println!("{}", "Examples:".bright_green().bold());
            println!();
            
            for example in &help_topic.examples {
                println!("  {}", example.description.bold());
                println!("  {} {}", "$".green(), example.command.cyan());
                if let Some(output) = &example.output {
                    println!("  {}", output.dimmed());
                }
                println!();
            }
        }
        
        // See also
        if !help_topic.see_also.is_empty() {
            println!("{}", "See also:".bright_yellow().bold());
            println!("  {}", help_topic.see_also.join(", "));
            println!();
        }
        
        Ok(())
    }
    
    /// Display help index
    pub fn display_index(&self) -> Result<()> {
        println!("{}", "Trilium CLI Help Topics".bright_blue().bold());
        println!("{}", "=".repeat(23).blue());
        println!();
        
        let mut topics: Vec<_> = self.topics.iter().collect();
        topics.sort_by_key(|(name, _)| name.as_str());
        
        for (name, topic) in topics {
            println!("  {} - {}", name.green().bold(), topic.description);
        }
        
        println!();
        println!("{}", "Usage:".bright_yellow().bold());
        println!("  trilium help <topic>     Show help for a specific topic");
        println!("  trilium help             Show this help index");
        println!();
        println!("{}", "Examples:".bright_green().bold());
        println!("  trilium help setup       Getting started guide");
        println!("  trilium help notes       Note management");
        println!("  trilium help search       Search functionality");
        println!();
        
        Ok(())
    }
}

impl Default for HelpSystem {
    fn default() -> Self {
        Self::new()
    }
}

/// Command suggestion system for did-you-mean functionality
pub struct CommandSuggestions {
    commands: Vec<String>,
    subcommands: HashMap<String, Vec<String>>,
}

impl CommandSuggestions {
    /// Create new command suggestions system
    pub fn new() -> Self {
        let mut system = Self {
            commands: Vec::new(),
            subcommands: HashMap::new(),
        };
        
        system.register_commands();
        system
    }
    
    /// Register all available commands
    fn register_commands(&mut self) {
        // Main commands
        self.commands = vec![
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
        ];
        
        // Subcommands
        self.subcommands.insert("config".to_string(), vec![
            "init".to_string(), "show".to_string(), "set".to_string()
        ]);
        
        self.subcommands.insert("profile".to_string(), vec![
            "list".to_string(), "show".to_string(), "create".to_string(),
            "delete".to_string(), "set".to_string(), "copy".to_string(), "configure".to_string()
        ]);
        
        self.subcommands.insert("note".to_string(), vec![
            "create".to_string(), "get".to_string(), "update".to_string(),
            "delete".to_string(), "list".to_string(), "export".to_string(),
            "import".to_string(), "move".to_string(), "clone".to_string()
        ]);
        
        // Add more subcommands as needed...
    }
    
    /// Get command suggestions for a typo
    pub fn suggest_command(&self, typo: &str) -> Vec<String> {
        TriliumError::suggest_similar_commands(typo, &self.commands.iter().map(|s| s.as_str()).collect::<Vec<_>>())
    }
    
    /// Get subcommand suggestions
    pub fn suggest_subcommand(&self, command: &str, typo: &str) -> Vec<String> {
        if let Some(subcommands) = self.subcommands.get(command) {
            TriliumError::suggest_similar_commands(typo, &subcommands.iter().map(|s| s.as_str()).collect::<Vec<_>>())
        } else {
            Vec::new()
        }
    }
}

impl Default for CommandSuggestions {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_help_system() {
        let help = HelpSystem::new();
        
        // Test direct topic access
        assert!(help.get_help("setup").is_ok());
        assert!(help.get_help("config").is_ok());
        assert!(help.get_help("nonexistent").is_err());
        
        // Test aliases
        assert!(help.get_help("getting-started").is_ok()); // alias for setup
        assert!(help.get_help("configuration").is_ok()); // alias for config
    }

    #[test]
    fn test_topic_listing() {
        let help = HelpSystem::new();
        let topics = help.list_topics();
        
        assert!(topics.contains(&"setup".to_string()));
        assert!(topics.contains(&"config".to_string()));
        assert!(topics.len() > 5);
    }

    #[test]
    fn test_fuzzy_matching() {
        let help = HelpSystem::new();
        
        // Should suggest similar topics
        let result = help.get_help("confi"); // typo for "config"
        assert!(result.is_err());
        
        let similar = help.find_similar_topics("confi");
        assert!(similar.contains(&"config".to_string()));
    }

    #[test]
    fn test_command_suggestions() {
        let suggestions = CommandSuggestions::new();
        
        let similar = suggestions.suggest_command("noe"); // typo for "note"
        assert!(similar.contains(&"note".to_string()));
        
        let subcommand_similar = suggestions.suggest_subcommand("note", "crete"); // typo for "create"
        assert!(subcommand_similar.contains(&"create".to_string()));
    }

    #[test]
    fn test_help_display() {
        let help = HelpSystem::new();
        
        // Should not panic when displaying help
        let result = help.display_help("setup");
        assert!(result.is_ok());
        
        let result = help.display_index();
        assert!(result.is_ok());
    }
}