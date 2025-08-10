# Trilium CLI

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Rust](https://img.shields.io/badge/rust-1.70%2B-orange)

A powerful command-line interface and terminal user interface (TUI) for [Trilium Notes](https://github.com/zadam/trilium) with advanced navigation, content management, and interoperability features.

## ✨ Features Overview

### 🖥️ **Core CLI Operations**
- Complete ETAPI coverage for all Trilium operations
- Note management (create, read, update, delete, list)
- Search with highlighting and context
- Attachment and attribute management
- Backup and calendar operations
- Multiple output formats (table, JSON, plain text)

### 🔍 **Enhanced TUI Navigation**
- **Fuzzy Search**: Real-time search with `/` key and highlighted matches
- **Vim-like Keybindings**: Navigate with `hjkl`, `g`/`G` for top/bottom
- **Recent Notes**: Quick access with `R` key, automatic tracking
- **Bookmarks System**: Toggle with `b`, view with `B`, persistent storage
- **Split Panes**: Toggle with `s`, resize with `<>`/`>`, dual focus

### 📝 **Content Management**
- **Wiki-style Links**: `[[note-id]]` and `[[Note Title]]` syntax with validation
- **Hierarchical Tags**: `#project/work/urgent` organization with search
- **Enhanced Search**: Regex patterns, context lines, result highlighting
- **Note Templates**: Variables like `{{title}}`, `{{date}}` with built-in templates
- **Quick Capture**: Rapid note creation with auto-formatting and inbox mode

### 🔄 **Import/Export Extensions**
- **Obsidian Vault**: Full import/export with wikilink and frontmatter support
- **Notion Database**: ZIP import with block parsing and property mapping
- **Directory Import**: Bulk import with pattern matching and duplicate handling
- **Git Integration**: Bidirectional sync, branch management, version control

### 🛠️ **Developer Experience**
- **Configuration Profiles**: Multiple Trilium instances support
- **Progress Indicators**: Real-time progress bars for long operations
- **Enhanced Error Messages**: Detailed errors with suggestions
- **Shell Completion**: Bash, Zsh, Fish completion support
- **Plugin Architecture**: Extensible system for custom functionality

### 🔧 **Pipe Functionality**
- **Smart Format Detection**: Auto-detect Markdown, HTML, JSON, code
- **Content Processing**: Title extraction, tag detection, batch mode
- **Template Integration**: Use templates with piped content
- **Shell Workflows**: Seamless integration with Unix tools

## 📦 Installation

### Prerequisites

- **Rust 1.70+**: [Install Rust](https://rustup.rs/)
- **Trilium Notes**: Running instance with ETAPI enabled
- **ETAPI Token**: Generated from your Trilium instance

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/trilium-cli.git
cd trilium-cli

# Build and install
cargo install --path .

# Or build for development
cargo build --release
```

### Generate ETAPI Token

1. Open Trilium Notes
2. Go to Options → ETAPI
3. Click "Create new token"
4. Copy the generated token
5. Note your server URL (default: `http://localhost:9999`)

## ⚙️ Configuration

### Quick Setup

```bash
# Run configuration wizard
trilium config init
```

This will prompt for:
- Trilium server URL
- ETAPI token
- Default settings and preferences

### Manual Configuration

Configuration file: `~/.config/trilium-cli/config.yaml`

```yaml
server_url: http://localhost:9999
api_token: your_etapi_token_here
default_parent_id: root
default_note_type: text
editor: vim
timeout_seconds: 30
max_retries: 3

# Enhanced features
max_recent_notes: 15
templates_folder: templates
quick_capture:
  auto_title: true
  extract_tags: true
  batch_delimiter: "---"

# Import/Export settings
import_export:
  max_file_size_mb: 100
  batch_size: 50
  preserve_timestamps: true
  handle_duplicates: rename
```

### Environment Variables

Override configuration with environment variables:

```bash
export TRILIUM_SERVER_URL=http://localhost:9999
export TRILIUM_API_TOKEN=your_token_here
export TRILIUM_DEFAULT_PARENT=root
```

### Configuration Profiles

Manage multiple Trilium instances:

```bash
# Create profiles for different instances
trilium profile create work --server http://work-trilium:9999 --token work_token
trilium profile create personal --server http://personal:9999 --token personal_token

# Use specific profile
trilium --profile work search "project"
trilium --profile personal note create "Personal Note"

# List and manage profiles
trilium profile list
trilium profile set-default work
```

## 🚀 Usage

### Interactive TUI Mode

Launch the powerful terminal interface:

```bash
trilium tui
# or simply
trilium
```

#### TUI Navigation

```
┌─ Navigation ─────────────────────────────────────────────┐
│ j/k or ↑/↓    Navigate up/down                          │
│ h/l or ←/→    Navigate left/right or collapse/expand    │
│ g/G           Go to top/bottom                          │
│ o/Enter       Open note                                 │
│ c             Collapse current                          │
├─ Search & Filtering ──────────────────────────────────────│
│ /             Fuzzy search mode                         │
│ n/N           Next/Previous search match                │
├─ Quick Access ────────────────────────────────────────────│
│ R             Recent notes                              │
│ B             Bookmarks view                            │
│ b             Toggle bookmark                           │
├─ Views & Layout ──────────────────────────────────────────│
│ s             Toggle split view                         │
│ </> Decrease/increase left pane                         │
│ Tab           Cycle view modes                          │
├─ General ─────────────────────────────────────────────────│
│ r             Refresh                                   │
│ q             Quit                                      │
│ ?             Show help                                 │
└───────────────────────────────────────────────────────────┘
```

#### Enhanced Features

- **Fuzzy Search**: Press `/` and start typing for real-time filtered results
- **Split View**: Press `s` to see tree and content simultaneously
- **Bookmarks**: Star important notes with `b`, access quickly with `B`
- **Recent Notes**: Press `R` to see recently accessed notes with timestamps

### CLI Commands

#### Note Operations

```bash
# Create notes
trilium note create "My Note Title" --content "Note content" --parent root
trilium note create "My Note" --edit  # Edit in external editor
echo "Note content" | trilium note create "My Note"  # From stdin

# Read notes
trilium note get <note-id>
trilium note get <note-id> --content  # Include content

# Update notes
trilium note update <note-id> --title "New Title" --content "New content"
trilium note update <note-id> --edit  # Edit in external editor

# Delete notes
trilium note delete <note-id>
trilium note delete <note-id> --force  # Skip confirmation

# List notes
trilium note list
trilium note list <parent-id> --tree --depth 3
```

#### Advanced Search

```bash
# Basic search
trilium search "query"
trilium search "query" --limit 100 --fast --archived

# Advanced search with highlighting
trilium search "pattern" --regex --context 3 --content --highlight

# Search options
trilium search "query" \
    --regex \              # Enable regex mode
    --context 3 \          # Show 3 context lines around matches
    --content \            # Include note content in search
    --highlight \          # Highlight search terms
    --fast \               # Enable fast search
    --archived             # Include archived notes

# Output formats
trilium search "query" --output json
trilium search "query" --output table
```

#### Pipe Functionality

The pipe command provides powerful content processing:

```bash
# Basic piping with auto-format detection
echo "Hello World" | trilium pipe
cat README.md | trilium pipe --title "Documentation"

# Format-specific processing
curl https://example.com | trilium pipe --format html --strip-html
curl https://api.example.com/data | trilium pipe --format json
cat script.py | trilium pipe --format code --language python

# Advanced options
echo "Content" | trilium pipe \
    --title "My Note" \
    --tags "important,todo" \
    --labels "project-x" \
    --parent <parent-id> \
    -a "priority=high" \
    -a "status=draft"

# Batch mode - create multiple notes
cat multi-doc.txt | trilium pipe --batch-delimiter "---" --title "Part"

# Template integration
echo "Content" | trilium pipe --template <template-note-id>

# Append to existing note
echo "Additional content" | trilium pipe --append-to <note-id>
```

##### Pipe Use Cases

```bash
# Save command output
ls -la | trilium pipe --title "Directory Listing" --format code --language bash

# Archive web content
curl -s https://example.com/article | trilium pipe --format html --strip-html

# Daily journal
echo "$(date)\n\nToday's thoughts..." | trilium pipe \
    --title "Journal $(date +%Y-%m-%d)" \
    --parent journal \
    --tags "daily,journal"

# System monitoring
(echo "# System Status - $(date)" && df -h && free -h) | \
    trilium pipe --title "System Status" --format code
```

#### Wiki-style Links

```bash
# Show backlinks to a note
trilium link backlinks <note-id> --context

# Show outgoing links from a note
trilium link outgoing <note-id>

# Find and fix broken links
trilium link broken --fix
trilium link broken <note-id>

# Update links in bulk
trilium link update <old-target> <new-target> --dry-run
trilium link update <old-target> <new-target>

# Validate all links
trilium link validate <note-id>
```

#### Hierarchical Tags

```bash
# List tags with hierarchy
trilium tag list --tree --counts
trilium tag list --pattern "project/*"

# Search by tags
trilium tag search "project/work" --include-children
trilium tag search "#urgent" --limit 50

# Tag management
trilium tag add <note-id> "project/work/urgent"
trilium tag remove <note-id> "project/work"
trilium tag rename "old-tag" "new-tag" --dry-run

# Tag visualization
trilium tag cloud --min-count 5 --max-tags 50
```

#### Note Templates

```bash
# List available templates
trilium template list --detailed

# Create template
trilium template create "Daily Journal" --edit
trilium template create "Meeting Notes" --content "# Meeting\n\nDate: {{date}}\nAttendees: {{custom:attendees}}"

# Use templates
trilium template use "Daily Journal" --interactive
trilium template use "Meeting Notes" --parent meetings --edit

# Template management
trilium template show <template> --variables
trilium template update <template-id> --edit
trilium template delete <template-id>
trilium template validate <template>
```

#### Quick Capture

```bash
# Quick note creation
trilium quick "Meeting notes from today" --tags "work,meeting"
echo "Task: Buy groceries" | trilium quick --tags "personal,todo"

# Batch processing
trilium quick --batch "---" < multi-note-file.txt

# Format-specific capture
trilium quick --format json < data.json
trilium quick --format todo < task-list.txt

# Options
trilium quick [content] \
    --title "Custom Title" \
    --tags "tag1,tag2" \
    --format auto \
    --batch "---" \
    --quiet \
    --inbox <note-id>
```

### Import/Export Operations

#### Obsidian Integration

```bash
# Import entire Obsidian vault
trilium import-obsidian ~/Documents/MyVault --parent root
trilium import-obsidian ~/Documents/MyVault --parent root --dry-run

# Export to Obsidian format
trilium export-obsidian <note-id> ~/exports/obsidian-vault
trilium export-obsidian <note-id> ~/exports/obsidian-vault --dry-run
```

Features:
- Preserves folder structure as note hierarchy
- Converts wikilinks to proper markdown links
- Processes YAML frontmatter as note attributes
- Handles attachments and images
- Converts Obsidian tags to Trilium tags

#### Notion Integration

```bash
# Import Notion export (ZIP)
trilium import-notion ~/Downloads/notion_export.zip --parent notion-notes
trilium import-notion ~/Downloads/notion_export.zip --dry-run

# Export to Notion format
trilium export-notion <note-id> ~/exports/notion-format
trilium export-notion <note-id> ~/exports/notion-format --dry-run
```

Features:
- Handles Notion ZIP exports
- Converts blocks (text, headings, lists, code, tables)
- Maps Notion properties to Trilium attributes
- Preserves hierarchical structure
- Handles callouts and toggles

#### Directory Bulk Import

```bash
# Import directory with filtering
trilium import-dir ~/Documents/Notes --patterns "*.md" "*.txt" --max-depth 3
trilium import-dir ~/Documents/Notes --parent archive --dry-run

# Advanced options
trilium import-dir ~/Archives \
    --parent archive_root \
    --max-depth 5 \
    --patterns "*.md" "*.txt" "*.json" \
    --exclude "*.tmp" \
    --max-size 50MB
```

Features:
- Recursive directory traversal with depth control
- Glob pattern matching for file filtering
- Automatic format detection
- Duplicate handling strategies
- Progress tracking with file counts
- Batch processing for large imports

#### Git Integration

```bash
# Export notes to git repository
trilium sync-git ~/notes-repo --operation export --branch main

# Import from git repository
trilium sync-git ~/existing-notes --operation import --parent imported_notes

# Bidirectional sync
trilium sync-git ~/notes-repo --note-id projects --operation sync

# Branch-specific operations
trilium sync-git ~/repo --operation export --branch feature-branch --dry-run
```

Features:
- Bidirectional synchronization
- Branch management and switching
- Commit history tracking
- Conflict detection and resolution
- Remote repository integration
- Frontmatter generation with metadata

#### Attributes & Relationships

```bash
# Create attributes
trilium attribute create <note-id> --type label "important"
trilium attribute create <note-id> --type relation "child-of" --value <parent-note-id>

# List and manage
trilium attribute list <note-id>
trilium attribute update <attribute-id> "new-value"
trilium attribute delete <attribute-id>
```

#### Attachments

```bash
# Upload attachments
trilium attachment upload <note-id> document.pdf
trilium attachment upload <note-id> image.png --title "Screenshot"

# Download and manage
trilium attachment download <attachment-id> --output custom-name.pdf
trilium attachment list <note-id>
trilium attachment delete <attachment-id>
```

#### Other Operations

```bash
# Branches (note cloning)
trilium branch create <note-id> <parent-id>
trilium branch update <branch-id> --prefix "Copy: "
trilium branch delete <branch-id>

# Calendar integration
trilium calendar 2024-01-15  # Create/get calendar note
trilium calendar today       # Today's calendar note

# Backups
trilium backup --name "manual-backup-2024"

# Server information
trilium info
```

### Output Formats

All commands support multiple output formats:

```bash
--output table  # Default - formatted table
--output json   # JSON for scripting
--output plain  # Simple text for piping
```

### Global Options

```bash
--config <path>           # Alternative config file
--profile <name>          # Use specific profile
--server-url <url>        # Override server URL
--api-token <token>       # Override API token
--verbose                 # Enable debug logging
--quiet                   # Suppress non-essential output
--timeout <seconds>       # Request timeout
```

## 🔧 Advanced Examples

### Automation Scripts

#### Daily Workflow

```bash
#!/bin/bash

# Create daily journal from template
DATE=$(date +%Y-%m-%d)
NOTE_ID=$(trilium template use "daily-journal" \
    --title "Journal $DATE" \
    --parent daily-notes \
    --output json | jq -r '.noteId')

echo "Created journal: $NOTE_ID"

# Quick capture throughout the day
echo "Meeting with client at 3pm" | trilium quick --tags "work,meeting"
echo "Buy groceries" | trilium quick --tags "personal,todo"
```

#### System Monitoring

```bash
#!/bin/bash

# Monitor system and save to Trilium
function save_system_status() {
    (echo "# System Status - $(date)"
     echo ""
     echo "## Disk Usage"
     df -h
     echo ""
     echo "## Memory"
     free -h
     echo ""
     echo "## Top Processes"
     ps aux | head -20) | trilium pipe \
        --title "System Status $(date +%Y-%m-%d_%H-%M)" \
        --format code \
        --language bash \
        --tags "monitoring,system" \
        --parent system-logs
}

# Schedule with cron
# 0 */4 * * * /path/to/save_system_status.sh
```

#### Web Content Archiving

```bash
#!/bin/bash

function archive_webpage() {
    URL="$1"
    TITLE=$(curl -s "$URL" | grep -o '<title>[^<]*' | sed 's/<title>//')
    
    curl -s "$URL" | trilium pipe \
        --title "$TITLE" \
        --format html \
        --strip-html \
        --tags "web-archive" \
        -a "url=$URL" \
        -a "archived=$(date +%Y-%m-%d)"
}

# Usage: archive_webpage "https://example.com/article"
```

### Batch Operations

```bash
# Export all project notes
trilium search "#project" --output json | \
    jq -r '.[].noteId' | \
    xargs -I {} trilium note export {} --format markdown --output {}.md

# Bulk tag application
trilium search "meeting" --output json | \
    jq -r '.[].noteId' | \
    xargs -I {} trilium tag add {} "work/meetings"

# Backup important notes
trilium tag search "#important" --output json | \
    jq -r '.[].noteId' | \
    while read -r note_id; do
        trilium note export "$note_id" --format json --output "backup_${note_id}.json"
    done
```

### Git Workflow Integration

```bash
#!/bin/bash

# Export notes for documentation
trilium sync-git ~/project-docs \
    --note-id documentation-root \
    --operation export \
    --branch main

# Commit and push
cd ~/project-docs
git add .
git commit -m "Update documentation from Trilium"
git push origin main

# Import external documentation
trilium sync-git ~/external-docs \
    --operation import \
    --parent imported-docs \
    --branch main
```

## 🔐 Security & Best Practices

### Security Considerations

- **API Token Storage**: Tokens are stored in config file with 600 permissions
- **Environment Variables**: Use environment variables for sensitive data in scripts
- **Rate Limiting**: Built-in API rate limiting to prevent server overload
- **Input Validation**: All inputs are validated before processing
- **Secure Defaults**: Conservative security settings by default

### Best Practices

```bash
# Use profiles for different environments
trilium profile create prod --server https://trilium.company.com
trilium profile create dev --server http://localhost:9999

# Always use dry-run for destructive operations
trilium import-dir ~/sensitive-data --dry-run
trilium link update old-id new-id --dry-run

# Regular backups
trilium backup --name "weekly-$(date +%Y-%m-%d)"

# Monitor configuration
trilium config show
```

### Configuration Security

```bash
# Set proper permissions
chmod 600 ~/.config/trilium-cli/config.yaml

# Use environment variables for tokens
export TRILIUM_API_TOKEN=$(pass show trilium/api-token)
trilium search "project"  # Uses env token
```

## 🛠️ Development & Contributing

### Building from Source

```bash
# Development build
cargo build

# Release build
cargo build --release

# Run tests
cargo test

# Run with debug logging
RUST_LOG=debug cargo run -- search "test"

# Integration tests
cargo test --test integration_test

# Security tests
cargo test --test security_tests
```

### Architecture Overview

```
src/
├── cli/                  # CLI argument parsing and commands
│   ├── args.rs          # Command definitions
│   └── commands/        # Individual command implementations
├── tui/                 # Terminal user interface
│   ├── app.rs          # Application state management
│   ├── ui.rs           # UI rendering
│   └── event.rs        # Event handling
├── api/                 # Trilium API client
│   └── client.rs       # HTTP client and API methods
├── import_export/       # Import/export functionality
│   ├── obsidian.rs     # Obsidian integration
│   ├── notion.rs       # Notion integration
│   ├── directory.rs    # Directory bulk import
│   └── git.rs          # Git integration
├── utils/              # Utility modules
│   ├── links.rs        # Link processing
│   ├── tags.rs         # Tag management
│   ├── templates.rs    # Template system
│   └── search.rs       # Enhanced search
└── lib.rs              # Library root
```

### Contributing Guidelines

1. **Fork the repository** and create a feature branch
2. **Write tests** for new functionality
3. **Follow Rust conventions** and run `cargo fmt`
4. **Add documentation** for new features
5. **Submit a pull request** with clear description

### Running Tests

```bash
# Unit tests
cargo test --lib

# Integration tests
cargo test --test "*"

# Specific test modules
cargo test test_import_export
cargo test test_tui_navigation
cargo test test_pipe_functionality

# Test with features
cargo test --features git
```

## 📊 Performance & Scalability

### Performance Features

- **Async Operations**: Non-blocking I/O for all network operations
- **Batch Processing**: Configurable batch sizes for large operations
- **Memory Efficiency**: Streaming for large files and datasets
- **Caching**: Intelligent caching of frequently accessed data
- **Progress Tracking**: Real-time progress without performance impact

### Scalability

The CLI is designed to handle large Trilium installations:

- **Large Note Trees**: Efficient tree navigation with lazy loading
- **Bulk Operations**: Handle thousands of files in import operations
- **Memory Management**: Configurable limits and efficient resource usage
- **API Rate Limiting**: Respect server limits and prevent overload

## 🐛 Troubleshooting

### Common Issues

#### Connection Problems

```bash
# Test connectivity
trilium info
trilium --verbose info

# Check configuration
trilium config show

# Test with curl
curl -H "Authorization: $TRILIUM_API_TOKEN" \
     $TRILIUM_SERVER_URL/etapi/app-info
```

#### Authentication Issues

```bash
# Verify token
trilium config show | grep api_token

# Re-initialize configuration
trilium config init

# Use environment variable
export TRILIUM_API_TOKEN=your_token
trilium info
```

#### Import/Export Issues

```bash
# Check file permissions
ls -la /path/to/import/directory

# Test with dry-run
trilium import-dir /path/to/files --dry-run

# Enable verbose logging
trilium --verbose import-obsidian ~/vault --dry-run
```

#### TUI Issues

```bash
# Terminal compatibility
echo $TERM
tput colors

# Clear terminal state
reset
stty sane

# Alternative terminal
TERM=xterm-256color trilium tui
```

### Error Messages

| Error | Solution |
|-------|----------|
| `Connection refused` | Check if Trilium server is running |
| `Authentication failed` | Verify ETAPI token |
| `Timeout` | Increase timeout in config or use `--timeout` |
| `Permission denied` | Check file permissions |
| `Invalid JSON` | Check API response format |

### Debug Mode

```bash
# Enable debug logging
RUST_LOG=debug trilium search "test"

# Full trace logging
RUST_LOG=trace trilium --verbose import-dir ~/notes

# Log to file
RUST_LOG=debug trilium search "test" 2> debug.log
```

## 📈 Roadmap

### Planned Features

- [ ] **Real-time Sync**: Live synchronization with external systems
- [ ] **Plugin Ecosystem**: Extensible plugin architecture
- [ ] **Web Interface**: Browser-based management interface
- [ ] **Mobile Companion**: Mobile app integration
- [ ] **Advanced Analytics**: Note usage and relationship analytics
- [ ] **Collaboration Features**: Multi-user workflow support

### Integration Targets

- [ ] **Roam Research**: Import/export support
- [ ] **LogSeq**: Bidirectional sync
- [ ] **Dendron**: VSCode workspace integration
- [ ] **Zettlr**: Academic writing workflow
- [ ] **Standard Notes**: Encrypted sync support

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Trilium Notes](https://github.com/zadam/trilium)** - The excellent knowledge management system
- **[Ratatui](https://ratatui.rs/)** - Terminal user interface framework
- **[Clap](https://clap.rs/)** - Command line argument parsing
- **Rust Community** - For the amazing ecosystem and tools

## 🔗 Links

- **Documentation**: [Full CLI Reference](docs/cli-reference.md)
- **API Documentation**: [Rust Docs](https://docs.rs/trilium-cli)
- **Issue Tracker**: [GitHub Issues](https://github.com/yourusername/trilium-cli/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/trilium-cli/discussions)
- **Trilium ETAPI**: [API Documentation](https://github.com/zadam/trilium/wiki/ETAPI)

---

**Happy note-taking!** 📝✨