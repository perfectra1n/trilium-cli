use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "trilium")]
#[command(author, version, about = "A CLI and TUI client for Trilium Notes", long_about = None)]
pub struct Cli {
    /// Path to configuration file
    #[arg(short, long, global = true)]
    pub config: Option<PathBuf>,

    /// Configuration profile to use
    #[arg(short, long, global = true)]
    pub profile: Option<String>,

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

    /// Profile management
    Profile {
        #[command(subcommand)]
        command: ProfileCommands,
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

        /// Enable regex mode
        #[arg(short, long)]
        regex: bool,

        /// Show context lines around matches
        #[arg(short = 'C', long, default_value = "2")]
        context: usize,

        /// Include note content in search
        #[arg(long)]
        content: bool,

        /// Highlight search terms in output
        #[arg(long, default_value = "true")]
        highlight: bool,
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

    /// Link management operations
    Link {
        #[command(subcommand)]
        command: LinkCommands,
    },

    /// Tag management and filtering
    Tag {
        #[command(subcommand)]
        command: TagCommands,
    },

    /// Template management
    Template {
        #[command(subcommand)]
        command: TemplateCommands,
    },

    /// Quick capture mode for rapid note creation
    Quick {
        /// Note content (if not provided, reads from stdin)
        content: Option<String>,

        /// Note title (auto-generated if not provided)
        #[arg(short, long)]
        title: Option<String>,

        /// Tags to add (comma-separated)
        #[arg(long)]
        tags: Option<String>,

        /// Input format (auto, markdown, json, todo)
        #[arg(short, long, default_value = "auto")]
        format: String,

        /// Batch mode delimiter
        #[arg(long)]
        batch: Option<String>,

        /// Quiet mode - only output note IDs
        #[arg(short, long)]
        quiet: bool,

        /// Inbox note ID (overrides config)
        #[arg(long)]
        inbox: Option<String>,
    },

    /// Import from Obsidian vault
    ImportObsidian {
        /// Path to Obsidian vault directory
        vault_path: PathBuf,

        /// Parent note ID to import into
        #[arg(short, long)]
        parent: Option<String>,

        /// Dry run - show what would be imported without making changes
        #[arg(long)]
        dry_run: bool,
    },

    /// Export to Obsidian vault format
    ExportObsidian {
        /// Note ID to export (exports all descendants)
        note_id: String,

        /// Output vault directory path
        vault_path: PathBuf,

        /// Dry run - show what would be exported without making changes
        #[arg(long)]
        dry_run: bool,
    },

    /// Import from Notion export (ZIP format)
    ImportNotion {
        /// Path to Notion export ZIP file
        zip_path: PathBuf,

        /// Parent note ID to import into
        #[arg(short, long)]
        parent: Option<String>,

        /// Dry run - show what would be imported without making changes
        #[arg(long)]
        dry_run: bool,
    },

    /// Export to Notion-compatible format
    ExportNotion {
        /// Note ID to export (exports all descendants)
        note_id: String,

        /// Output directory path
        output_path: PathBuf,

        /// Dry run - show what would be exported without making changes
        #[arg(long)]
        dry_run: bool,
    },

    /// Bulk import from directory
    ImportDir {
        /// Directory path to import from
        dir_path: PathBuf,

        /// Parent note ID to import into
        #[arg(short, long)]
        parent: Option<String>,

        /// Maximum directory depth to traverse
        #[arg(short = 'd', long)]
        max_depth: Option<usize>,

        /// File patterns to match (glob patterns)
        #[arg(short = 'p', long)]
        patterns: Vec<String>,

        /// Dry run - show what would be imported without making changes
        #[arg(long)]
        dry_run: bool,
    },

    /// Git repository synchronization
    SyncGit {
        /// Git repository path
        repo_path: PathBuf,

        /// Note ID to sync (if not provided, uses root)
        #[arg(short, long)]
        note_id: Option<String>,

        /// Git branch to work with
        #[arg(short, long)]
        branch: Option<String>,

        /// Operation type: import, export, sync
        #[arg(short, long, default_value = "sync")]
        operation: String,

        /// Dry run - show what would be done without making changes
        #[arg(long)]
        dry_run: bool,
    },

    /// Plugin management
    Plugin {
        #[command(subcommand)]
        command: PluginCommands,
    },

    /// Shell completion management
    Completion {
        #[command(subcommand)]
        command: CompletionCommands,
    },

    /// Show help information
    Help {
        /// Command or topic to get help for
        topic: Option<String>,
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

#[derive(Subcommand)]
pub enum LinkCommands {
    /// Show backlinks to a note
    Backlinks {
        /// Note ID
        note_id: String,
        
        /// Show context around links
        #[arg(short, long)]
        context: bool,
    },

    /// Show outgoing links from a note
    Outgoing {
        /// Note ID
        note_id: String,
    },

    /// Find and report broken links
    Broken {
        /// Note ID to check (if not provided, checks all notes)
        note_id: Option<String>,
        
        /// Fix broken links interactively
        #[arg(short, long)]
        fix: bool,
    },

    /// Update links in bulk
    Update {
        /// Old target (note ID or title)
        old_target: String,
        
        /// New target (note ID or title)
        new_target: String,
        
        /// Dry run (show what would be changed)
        #[arg(short, long)]
        dry_run: bool,
    },

    /// Validate all links in a note
    Validate {
        /// Note ID
        note_id: String,
    },
}

#[derive(Subcommand)]
pub enum TagCommands {
    /// List all tags with hierarchy
    List {
        /// Filter pattern (supports wildcards)
        #[arg(short, long)]
        pattern: Option<String>,
        
        /// Show as tree view
        #[arg(short, long)]
        tree: bool,
        
        /// Include usage counts
        #[arg(short, long)]
        counts: bool,
    },

    /// Search notes by tags
    Search {
        /// Tag pattern to search for
        pattern: String,
        
        /// Include child tags
        #[arg(short, long)]
        include_children: bool,
        
        /// Limit number of results
        #[arg(short, long, default_value = "50")]
        limit: usize,
    },

    /// Show tag cloud/frequency visualization
    Cloud {
        /// Minimum tag frequency to show
        #[arg(short, long, default_value = "1")]
        min_count: usize,
        
        /// Maximum number of tags to show
        #[arg(short, long, default_value = "50")]
        max_tags: usize,
    },

    /// Add tag to note
    Add {
        /// Note ID
        note_id: String,
        
        /// Tag name (without # prefix)
        tag: String,
    },

    /// Remove tag from note
    Remove {
        /// Note ID
        note_id: String,
        
        /// Tag name (without # prefix)
        tag: String,
    },

    /// Rename tag across all notes
    Rename {
        /// Old tag name
        old_tag: String,
        
        /// New tag name
        new_tag: String,
        
        /// Dry run (show what would be changed)
        #[arg(short, long)]
        dry_run: bool,
    },
}

#[derive(Subcommand)]
pub enum TemplateCommands {
    /// List available templates
    List {
        /// Show template details
        #[arg(short, long)]
        detailed: bool,
    },

    /// Create a new template
    Create {
        /// Template title
        title: String,
        
        /// Template content (if not provided, opens editor)
        #[arg(short, long)]
        content: Option<String>,
        
        /// Template description
        #[arg(short, long)]
        description: Option<String>,
        
        /// Open in editor
        #[arg(short, long)]
        edit: bool,
    },

    /// Show template details
    Show {
        /// Template ID or title
        template: String,
        
        /// Show template variables
        #[arg(short, long)]
        variables: bool,
    },

    /// Create note from template
    Use {
        /// Template ID or title
        template: String,
        
        /// Parent note ID
        #[arg(short, long)]
        parent: Option<String>,
        
        /// Template variables in key=value format
        #[arg(short = 'v', long)]
        variables: Vec<String>,
        
        /// Interactive variable input
        #[arg(short, long)]
        interactive: bool,
        
        /// Open created note in editor
        #[arg(short, long)]
        edit: bool,
    },

    /// Update existing template
    Update {
        /// Template ID
        template_id: String,
        
        /// New title
        #[arg(short, long)]
        title: Option<String>,
        
        /// New description
        #[arg(short, long)]
        description: Option<String>,
        
        /// Open in editor
        #[arg(short, long)]
        edit: bool,
    },

    /// Delete template
    Delete {
        /// Template ID
        template_id: String,
        
        /// Force delete without confirmation
        #[arg(short, long)]
        force: bool,
    },

    /// Validate template syntax
    Validate {
        /// Template ID or path to template file
        template: String,
    },
}

#[derive(Subcommand)]
pub enum ProfileCommands {
    /// List all profiles
    List {
        /// Show detailed information
        #[arg(short, long)]
        detailed: bool,
    },
    
    /// Show profile information
    Show {
        /// Profile name (shows current if not specified)
        name: Option<String>,
    },
    
    /// Create a new profile
    Create {
        /// Profile name
        name: String,
        
        /// Profile description
        #[arg(short, long)]
        description: Option<String>,
        
        /// Copy settings from another profile
        #[arg(short, long)]
        from: Option<String>,
        
        /// Set as current profile after creation
        #[arg(long)]
        set_current: bool,
    },
    
    /// Delete a profile
    Delete {
        /// Profile name
        name: String,
        
        /// Force delete without confirmation
        #[arg(short, long)]
        force: bool,
    },
    
    /// Set current profile
    Set {
        /// Profile name
        name: String,
    },
    
    /// Copy profile settings
    Copy {
        /// Source profile name
        from: String,
        
        /// Destination profile name
        to: String,
        
        /// Overwrite destination if it exists
        #[arg(long)]
        overwrite: bool,
    },
    
    /// Configure profile settings
    Configure {
        /// Profile name (current profile if not specified)
        #[arg(short, long)]
        profile: Option<String>,
        
        /// Configuration key to set
        #[arg(short, long)]
        key: Option<String>,
        
        /// Configuration value
        #[arg(short, long)]
        value: Option<String>,
        
        /// Interactive configuration mode
        #[arg(short, long)]
        interactive: bool,
    },
}

#[derive(Subcommand)]
pub enum PluginCommands {
    /// List installed plugins
    List {
        /// Show detailed information
        #[arg(short, long)]
        detailed: bool,
        
        /// Filter by capability
        #[arg(short, long)]
        capability: Option<String>,
    },
    
    /// Install a plugin
    Install {
        /// Plugin path or URL
        source: String,
        
        /// Force installation
        #[arg(short, long)]
        force: bool,
        
        /// Trust the plugin (enables extended permissions)
        #[arg(long)]
        trust: bool,
    },
    
    /// Uninstall a plugin
    Uninstall {
        /// Plugin name
        name: String,
        
        /// Force uninstall without confirmation
        #[arg(short, long)]
        force: bool,
    },
    
    /// Enable a plugin
    Enable {
        /// Plugin name
        name: String,
    },
    
    /// Disable a plugin
    Disable {
        /// Plugin name
        name: String,
    },
    
    /// Show plugin information
    Info {
        /// Plugin name
        name: String,
    },
    
    /// Run a plugin command
    Run {
        /// Plugin name
        plugin: String,
        
        /// Command name
        command: String,
        
        /// Command arguments
        args: Vec<String>,
    },
}

#[derive(Subcommand)]
pub enum CompletionCommands {
    /// Generate completion script
    Generate {
        /// Shell type (bash, zsh, fish, powershell, elvish)
        shell: String,
        
        /// Output file (stdout if not specified)
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
    
    /// Install completion script for current shell
    Install {
        /// Shell type (auto-detect if not specified)
        #[arg(short, long)]
        shell: Option<String>,
    },
    
    /// Manage completion cache
    Cache {
        #[command(subcommand)]
        command: CompletionCacheCommands,
    },
}

#[derive(Subcommand)]
pub enum CompletionCacheCommands {
    /// Clear completion cache
    Clear,
    
    /// Show cache status
    Status,
    
    /// Refresh cache for specific completion type
    Refresh {
        /// Completion type (notes, profiles, commands, etc.)
        completion_type: String,
    },
}