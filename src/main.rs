use anyhow::Result;
use clap::{Parser, Subcommand};
use std::path::PathBuf;
use tracing_subscriber::EnvFilter;

mod api;
mod cli;
mod config;
mod error;
mod models;
mod tui;

use cli::commands;
use config::Config;

#[derive(Parser)]
#[command(name = "trilium")]
#[command(author, version, about = "A CLI and TUI client for Trilium Notes", long_about = None)]
struct Cli {
    /// Path to configuration file
    #[arg(short, long, global = true)]
    config: Option<PathBuf>,

    /// Trilium server URL (overrides config)
    #[arg(long, global = true, env = "TRILIUM_SERVER_URL")]
    server_url: Option<String>,

    /// API token (overrides config)
    #[arg(long, global = true, env = "TRILIUM_API_TOKEN")]
    api_token: Option<String>,

    /// Enable verbose logging
    #[arg(short, long, global = true)]
    verbose: bool,

    /// Output format (json, table, plain)
    #[arg(long, global = true, default_value = "table")]
    output: String,

    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Interactive TUI mode
    Tui,

    /// Configure the CLI
    Config {
        #[command(subcommand)]
        command: ConfigCommands,
    },

    /// Note operations
    Note {
        #[command(subcommand)]
        command: NoteCommands,
    },

    /// Search notes
    Search {
        /// Search query
        query: String,

        /// Limit number of results
        #[arg(short, long, default_value = "50")]
        limit: usize,

        /// Enable fast search
        #[arg(short, long)]
        fast: bool,

        /// Include archived notes
        #[arg(short, long)]
        archived: bool,
    },

    /// Branch operations
    Branch {
        #[command(subcommand)]
        command: BranchCommands,
    },

    /// Attribute operations
    Attribute {
        #[command(subcommand)]
        command: AttributeCommands,
    },

    /// Attachment operations
    Attachment {
        #[command(subcommand)]
        command: AttachmentCommands,
    },

    /// Create a backup
    Backup {
        /// Backup name
        #[arg(short, long)]
        name: Option<String>,
    },

    /// Calendar operations
    Calendar {
        /// Date in YYYY-MM-DD format
        date: String,
    },

    /// Show app info
    Info,

    /// Create note from piped input
    Pipe {
        /// Note title (defaults to first line or auto-generated)
        #[arg(short = 't', long)]
        title: Option<String>,

        /// Parent note ID (defaults to root)
        #[arg(short, long)]
        parent: Option<String>,

        /// Note type (text, code, html, markdown, etc.)
        #[arg(long, default_value = "auto")]
        note_type: String,

        /// Input format (auto, markdown, html, json, code, text)
        #[arg(short = 'f', long, default_value = "auto")]
        format: String,

        /// Tags to add to the note (comma-separated)
        #[arg(long)]
        tags: Option<String>,

        /// Labels to add to the note (comma-separated)
        #[arg(short = 'l', long)]
        labels: Option<String>,

        /// Custom attributes in key=value format
        #[arg(short = 'a', long)]
        attributes: Vec<String>,

        /// Append to existing note instead of creating new
        #[arg(long)]
        append_to: Option<String>,

        /// Template note ID to use for wrapping content
        #[arg(long)]
        template: Option<String>,

        /// Delimiter for batch mode (creates multiple notes)
        #[arg(long)]
        batch_delimiter: Option<String>,

        /// Language hint for code detection
        #[arg(long)]
        language: Option<String>,

        /// Strip HTML tags when format is HTML
        #[arg(long)]
        strip_html: bool,

        /// Extract title from content (first heading or HTML title)
        #[arg(long, default_value = "true")]
        extract_title: bool,

        /// Quiet mode - only output note ID
        #[arg(short, long)]
        quiet: bool,
    },
}

#[derive(Subcommand)]
enum ConfigCommands {
    /// Initialize configuration
    Init,
    /// Show current configuration
    Show,
    /// Set configuration value
    Set {
        /// Configuration key
        key: String,
        /// Configuration value
        value: String,
    },
}

#[derive(Subcommand)]
enum NoteCommands {
    /// Create a new note
    Create {
        /// Note title
        title: String,

        /// Note content
        #[arg(short, long)]
        content: Option<String>,

        /// Note type (text, code, etc.)
        #[arg(short = 't', long, default_value = "text")]
        note_type: String,

        /// Parent note ID
        #[arg(short, long)]
        parent: Option<String>,

        /// Open in editor
        #[arg(short, long)]
        edit: bool,
    },

    /// Get note by ID
    Get {
        /// Note ID
        note_id: String,

        /// Include content
        #[arg(short, long)]
        content: bool,
    },

    /// Update existing note
    Update {
        /// Note ID
        note_id: String,

        /// New title
        #[arg(short = 't', long)]
        title: Option<String>,

        /// New content
        #[arg(short, long)]
        content: Option<String>,

        /// Open in editor
        #[arg(short, long)]
        edit: bool,
    },

    /// Delete a note
    Delete {
        /// Note ID
        note_id: String,

        /// Force delete without confirmation
        #[arg(short, long)]
        force: bool,
    },

    /// List child notes
    List {
        /// Parent note ID (defaults to root)
        #[arg(default_value = "root")]
        parent_id: String,

        /// Show as tree
        #[arg(short = 't', long)]
        tree: bool,

        /// Maximum depth for tree view
        #[arg(short, long, default_value = "3")]
        depth: usize,
    },

    /// Export note
    Export {
        /// Note ID
        note_id: String,

        /// Output file
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Export format (html, markdown, zip)
        #[arg(short, long, default_value = "markdown")]
        format: String,
    },

    /// Import content
    Import {
        /// Input file
        file: PathBuf,

        /// Parent note ID
        #[arg(short, long, default_value = "root")]
        parent: String,

        /// Import format (auto, html, markdown, zip)
        #[arg(short, long, default_value = "auto")]
        format: String,
    },
}

#[derive(Subcommand)]
enum BranchCommands {
    /// Create a new branch
    Create {
        /// Note ID
        note_id: String,

        /// Parent note ID
        parent_id: String,

        /// Prefix
        #[arg(short, long)]
        prefix: Option<String>,
    },

    /// Get branch by ID
    Get {
        /// Branch ID
        branch_id: String,
    },

    /// Update branch
    Update {
        /// Branch ID
        branch_id: String,

        /// New prefix
        #[arg(short, long)]
        prefix: Option<String>,

        /// New parent ID
        #[arg(short = 'p', long)]
        parent: Option<String>,
    },

    /// Delete branch
    Delete {
        /// Branch ID
        branch_id: String,

        /// Force delete without confirmation
        #[arg(short, long)]
        force: bool,
    },
}

#[derive(Subcommand)]
enum AttributeCommands {
    /// Create attribute
    Create {
        /// Note ID
        note_id: String,

        /// Attribute type (label or relation)
        #[arg(short = 't', long)]
        attr_type: String,

        /// Attribute name
        name: String,

        /// Attribute value (for relations)
        #[arg(short, long)]
        value: Option<String>,
    },

    /// List attributes for a note
    List {
        /// Note ID
        note_id: String,
    },

    /// Update attribute
    Update {
        /// Attribute ID
        attribute_id: String,

        /// New value
        value: String,
    },

    /// Delete attribute
    Delete {
        /// Attribute ID
        attribute_id: String,

        /// Force delete without confirmation
        #[arg(short, long)]
        force: bool,
    },
}

#[derive(Subcommand)]
enum AttachmentCommands {
    /// Upload attachment
    Upload {
        /// Note ID
        note_id: String,

        /// File to upload
        file: PathBuf,

        /// Title for the attachment
        #[arg(short, long)]
        title: Option<String>,
    },

    /// Download attachment
    Download {
        /// Attachment ID
        attachment_id: String,

        /// Output file
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// List attachments for a note
    List {
        /// Note ID
        note_id: String,
    },

    /// Delete attachment
    Delete {
        /// Attachment ID
        attachment_id: String,

        /// Force delete without confirmation
        #[arg(short, long)]
        force: bool,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Initialize logging
    let filter = if cli.verbose {
        EnvFilter::new("debug")
    } else {
        EnvFilter::from_default_env()
    };
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .init();

    // Load configuration
    let mut config = Config::load(cli.config)?;

    // Override with CLI arguments
    if let Some(url) = cli.server_url {
        config.server_url = url;
    }
    if let Some(token) = cli.api_token {
        config.api_token = Some(token);
    }

    // Execute command
    match cli.command {
        None | Some(Commands::Tui) => {
            tui::run(config).await?;
        }
        Some(Commands::Config { command }) => {
            commands::config::handle(command, &config).await?;
        }
        Some(Commands::Note { command }) => {
            commands::note::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Search { query, limit, fast, archived }) => {
            commands::search::handle(&query, limit, fast, archived, &config, &cli.output).await?;
        }
        Some(Commands::Branch { command }) => {
            commands::branch::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Attribute { command }) => {
            commands::attribute::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Attachment { command }) => {
            commands::attachment::handle(command, &config, &cli.output).await?;
        }
        Some(Commands::Backup { name }) => {
            commands::backup::handle(name, &config).await?;
        }
        Some(Commands::Calendar { date }) => {
            commands::calendar::handle(&date, &config, &cli.output).await?;
        }
        Some(Commands::Info) => {
            commands::info::handle(&config).await?;
        }
        Some(Commands::Pipe { 
            title,
            parent,
            note_type,
            format,
            tags,
            labels,
            attributes,
            append_to,
            template,
            batch_delimiter,
            language,
            strip_html,
            extract_title,
            quiet,
        }) => {
            commands::pipe::handle(
                title,
                parent,
                note_type,
                format,
                tags,
                labels,
                attributes,
                append_to,
                template,
                batch_delimiter,
                language,
                strip_html,
                extract_title,
                quiet,
                &config,
            ).await?;
        }
    }

    Ok(())
}