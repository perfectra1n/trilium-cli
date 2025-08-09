use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "trilium")]
#[command(author, version, about = "A CLI and TUI client for Trilium Notes", long_about = None)]
pub struct Cli {
    /// Path to configuration file
    #[arg(short, long, global = true)]
    pub config: Option<PathBuf>,

    /// Trilium server URL (overrides config)
    #[arg(long, global = true, env = "TRILIUM_SERVER_URL")]
    pub server_url: Option<String>,

    /// API token (overrides config)
    #[arg(long, global = true, env = "TRILIUM_API_TOKEN")]
    pub api_token: Option<String>,

    /// Enable verbose logging
    #[arg(short, long, global = true)]
    pub verbose: bool,

    /// Output format (json, table, plain)
    #[arg(long, global = true, default_value = "table")]
    pub output: String,

    #[command(subcommand)]
    pub command: Option<Commands>,
}

#[derive(Subcommand)]
pub enum Commands {
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

    /// Get app info
    Info,

    /// Calendar operations
    Calendar {
        /// Date in YYYY-MM-DD format
        date: String,

        /// Create if doesn't exist
        #[arg(long)]
        create: bool,
    },

    /// Pipe content from stdin to create a note
    Pipe {
        /// Note title
        #[arg(short = 't', long)]
        title: Option<String>,

        /// Parent note ID
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
pub enum ConfigCommands {
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
pub enum NoteCommands {
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

        /// Export format (html, markdown, pdf)
        #[arg(short, long, default_value = "html")]
        format: String,

        /// Output file
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Import note
    Import {
        /// File to import
        file: PathBuf,

        /// Parent note ID
        #[arg(short, long)]
        parent: Option<String>,

        /// Import format (auto, html, markdown)
        #[arg(short, long, default_value = "auto")]
        format: String,
    },

    /// Move note to another parent
    Move {
        /// Note ID
        note_id: String,

        /// New parent note ID
        parent_id: String,
    },

    /// Clone note
    Clone {
        /// Note ID to clone
        note_id: String,

        /// Clone type (deep, shallow)
        #[arg(short = 't', long, default_value = "deep")]
        clone_type: String,
    },
}

#[derive(Subcommand)]
pub enum BranchCommands {
    /// Create a new branch
    Create {
        /// Note ID
        note_id: String,

        /// Parent note ID
        parent_id: String,

        /// Position
        #[arg(short, long)]
        position: Option<i32>,

        /// Prefix
        #[arg(long)]
        prefix: Option<String>,
    },

    /// List branches for a note
    List {
        /// Note ID
        note_id: String,
    },

    /// Update branch
    Update {
        /// Branch ID
        branch_id: String,

        /// New position
        #[arg(short, long)]
        position: Option<i32>,

        /// New prefix
        #[arg(long)]
        prefix: Option<String>,

        /// Expanded state
        #[arg(short, long)]
        expanded: Option<bool>,
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
pub enum AttributeCommands {
    /// Create a new attribute
    Create {
        /// Note ID
        note_id: String,

        /// Attribute type (label, relation)
        #[arg(short = 't', long)]
        attr_type: String,

        /// Attribute name
        name: String,

        /// Attribute value
        #[arg(short, long, default_value = "")]
        value: String,

        /// Inheritable
        #[arg(short, long)]
        inheritable: bool,
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
        #[arg(short, long)]
        value: Option<String>,

        /// Inheritable
        #[arg(short, long)]
        inheritable: Option<bool>,
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
pub enum AttachmentCommands {
    /// Upload attachment to a note
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

    /// Get attachment info
    Info {
        /// Attachment ID
        attachment_id: String,
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