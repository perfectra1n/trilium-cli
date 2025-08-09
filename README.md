# Trilium CLI

A powerful command-line interface and terminal user interface (TUI) for interacting with [Trilium Notes](https://github.com/zadam/trilium) instances.

## Features

- **Comprehensive CLI**: Full support for all Trilium ETAPI operations
- **Interactive TUI**: Browse and manage notes with an intuitive terminal interface
- **Note Management**: Create, read, update, and delete notes
- **Tree Navigation**: Navigate the note hierarchy with expandable/collapsible tree view
- **Search**: Fast and flexible note searching capabilities
- **Attributes & Attachments**: Manage note attributes and file attachments
- **Import/Export**: Import and export notes in various formats
- **Calendar Integration**: Create and manage calendar notes
- **Backup**: Create database backups
- **Configuration Management**: Store server URL and API tokens for easy access

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/trilium-cli.git
cd trilium-cli

# Build and install
cargo install --path .
```

### Prerequisites

- Rust 1.70 or higher
- A running Trilium instance with ETAPI enabled
- An ETAPI token from your Trilium instance

## Configuration

### Initial Setup

Run the configuration wizard:

```bash
trilium config init
```

This will prompt you for:
- Trilium server URL
- ETAPI token
- Default settings

### Manual Configuration

The configuration file is stored at `~/.config/trilium-cli/config.yaml`:

```yaml
server_url: http://localhost:9999
api_token: your_etapi_token_here
default_parent_id: root
default_note_type: text
editor: vim
timeout_seconds: 30
max_retries: 3
```

### Environment Variables

You can override configuration with environment variables:

```bash
export TRILIUM_SERVER_URL=http://localhost:9999
export TRILIUM_API_TOKEN=your_token_here
```

## Usage

### Interactive TUI Mode

Launch the interactive terminal interface:

```bash
trilium tui
# or simply
trilium
```

#### TUI Keyboard Shortcuts

- `↑/↓` or `j/k` - Navigate tree
- `←/→` or `h/l` - Collapse/Expand nodes
- `Enter` - Load selected note
- `Tab` - Switch view mode
- `/` - Search notes
- `:` - Command mode
- `n` - Create new note
- `e` - Edit note
- `d` - Delete note
- `r` - Refresh tree
- `q` - Quit

### CLI Commands

#### Piping Input

The CLI provides powerful piping functionality to create notes from any input source:

```bash
# Basic piping - auto-detects format
echo "Hello World" | trilium pipe

# Pipe with custom title
echo "Note content" | trilium pipe --title "My Note"

# Pipe markdown content
cat README.md | trilium pipe --format markdown

# Pipe HTML and convert to markdown
curl https://example.com | trilium pipe --format html --strip-html

# Pipe JSON with formatting
curl https://api.example.com/data | trilium pipe --format json

# Pipe code with syntax detection
cat script.py | trilium pipe --format code --language python

# Pipe to specific parent note
echo "Child content" | trilium pipe --parent <parent-id>

# Add tags and labels
echo "Tagged content" | trilium pipe --tags "important,todo" --labels "project-x"

# Add custom attributes
echo "Content" | trilium pipe -a "priority=high" -a "status=draft"

# Append to existing note
echo "Additional content" | trilium pipe --append-to <note-id>

# Use template for formatting
echo "Raw data" | trilium pipe --template <template-note-id>

# Batch mode - create multiple notes
cat multi-doc.txt | trilium pipe --batch-delimiter "---" --title "Part"

# Quiet mode - only output note IDs
echo "Content" | trilium pipe --quiet

# Complex example: pipe from clipboard with attributes
pbpaste | trilium pipe \
  --title "Clipboard Note" \
  --tags "clipboard,temp" \
  --labels "review" \
  --format auto \
  --parent daily-notes
```

##### Format Detection

The pipe command automatically detects content format:

- **Markdown**: Headers (#), links, lists, code blocks
- **HTML**: DOCTYPE, common HTML tags
- **JSON**: Valid JSON structure
- **Code**: Shebangs, import statements, syntax patterns
- **Plain Text**: Default fallback

You can override detection with `--format`:
- `auto` (default): Auto-detect format
- `markdown` or `md`: Markdown content
- `html`: HTML content
- `json`: JSON data
- `code`: Source code (use `--language` for hint)
- `text`: Plain text

##### Batch Mode

Create multiple notes from delimited input:

```bash
# Split by custom delimiter
cat <<EOF | trilium pipe --batch-delimiter "===" --title "Section"
First note content
===
Second note content
===
Third note content
EOF

# Process multiple JSON objects
cat data.jsonl | trilium pipe --batch-delimiter "\n" --format json
```

##### Template Support

Use template notes to wrap piped content:

```bash
# Create a template note first with {{content}} placeholder
echo "# Daily Log\nDate: {{date}}\n\n{{content}}" | trilium note create "Template"

# Use template when piping
echo "Today's activities..." | trilium pipe --template <template-id>
```

##### Common Use Cases

```bash
# Save command output as note
ls -la | trilium pipe --title "Directory Listing" --format code --language bash

# Archive web page
curl -s https://example.com/article | trilium pipe --format html --strip-html

# Save API response
curl -s https://api.github.com/user/repos | trilium pipe --format json

# Create note from file
cat document.md | trilium pipe --format markdown

# Save clipboard (macOS)
pbpaste | trilium pipe --title "Clipboard $(date +%Y-%m-%d)"

# Save clipboard (Linux)
xclip -o | trilium pipe --title "Clipboard $(date +%Y-%m-%d)"

# Pipe from another command with jq processing
curl -s https://api.example.com | jq '.data' | trilium pipe --format json

# Create daily journal entry
echo "$(date)\n\nToday's thoughts..." | trilium pipe \
  --title "Journal $(date +%Y-%m-%d)" \
  --parent journal \
  --tags "daily,journal"

# Save error logs
./script.sh 2>&1 | trilium pipe --title "Script Errors" --format code

# Chain with grep
grep ERROR /var/log/app.log | trilium pipe --title "Error Log" --format text
```

##### Stdin Support in Note Create

The `note create` command also supports stdin when no content is provided:

```bash
# Create note from piped input
echo "Note content" | trilium note create "My Note"

# Pipe file content
cat file.txt | trilium note create "File Content" --parent <parent-id>
```

#### Note Operations

```bash
# Create a note
trilium note create "My Note Title" --content "Note content" --parent root

# Create and edit in external editor
trilium note create "My Note" --edit

# Get note details
trilium note get <note-id>
trilium note get <note-id> --content  # Include content

# Update note
trilium note update <note-id> --title "New Title" --content "New content"
trilium note update <note-id> --edit  # Edit in external editor

# Delete note
trilium note delete <note-id>
trilium note delete <note-id> --force  # Skip confirmation

# List child notes
trilium note list
trilium note list <parent-id> --tree --depth 3

# Export note
trilium note export <note-id> --format markdown --output note.md
trilium note export <note-id> --format html --output note.html

# Import note
trilium note import file.md --parent root --format markdown
```

#### Search

```bash
# Search notes
trilium search "query"
trilium search "query" --limit 100 --fast --archived

# Output formats
trilium search "query" --output json
trilium search "query" --output table
```

#### Branches

```bash
# Create branch (clone note to another location)
trilium branch create <note-id> <parent-id>

# Get branch info
trilium branch get <branch-id>

# Update branch
trilium branch update <branch-id> --prefix "Prefix: "

# Delete branch
trilium branch delete <branch-id>
```

#### Attributes

```bash
# Create attribute
trilium attribute create <note-id> --type label "myLabel"
trilium attribute create <note-id> --type relation "myRelation" --value <target-note-id>

# List attributes
trilium attribute list <note-id>

# Update attribute
trilium attribute update <attribute-id> "new value"

# Delete attribute
trilium attribute delete <attribute-id>
```

#### Attachments

```bash
# Upload attachment
trilium attachment upload <note-id> file.pdf
trilium attachment upload <note-id> image.png --title "Screenshot"

# Download attachment
trilium attachment download <attachment-id>
trilium attachment download <attachment-id> --output custom-name.pdf

# List attachments
trilium attachment list <note-id>

# Delete attachment
trilium attachment delete <attachment-id>
```

#### Other Operations

```bash
# Create backup
trilium backup
trilium backup --name "manual-backup-2024"

# Calendar operations
trilium calendar 2024-01-15  # Create/get calendar note for date

# Show server info
trilium info

# Configuration management
trilium config show
trilium config set server_url http://new-server:9999
trilium config set api_token new_token
```

### Output Formats

Most commands support multiple output formats:

```bash
--output table  # Default - formatted table
--output json   # JSON output for scripting
--output plain  # Simple text output
```

### Global Options

```bash
--config <path>           # Use alternative config file
--server-url <url>        # Override server URL
--api-token <token>       # Override API token
--verbose                 # Enable debug logging
```

## Examples

### Scripting Example

```bash
#!/bin/bash

# Create daily journal note
DATE=$(date +%Y-%m-%d)
CONTENT="# Daily Journal - $DATE\n\n## Tasks\n- [ ] \n\n## Notes\n"

NOTE_ID=$(trilium note create "Journal $DATE" \
  --content "$CONTENT" \
  --parent daily-notes \
  --output json | jq -r '.noteId')

echo "Created journal note: $NOTE_ID"

# Add label
trilium attribute create $NOTE_ID --type label journal
```

### Batch Operations

```bash
# Export all search results
trilium search "project" --output json | \
  jq -r '.[]noteId' | \
  xargs -I {} trilium note export {} --format markdown --output {}.md

# Delete all notes with specific label
trilium search "#archived" --output json | \
  jq -r '.[]noteId' | \
  xargs -I {} trilium note delete {} --force
```

### Advanced Piping Examples

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

# Archive webpage with metadata
function archive_webpage() {
    URL="$1"
    TITLE=$(curl -s "$URL" | grep -o '<title>[^<]*' | sed 's/<title>//')
    
    curl -s "$URL" | trilium pipe \
        --title "$TITLE" \
        --format html \
        --strip-html \
        --tags "web-archive" \
        --attributes "url=$URL" \
        --attributes "archived=$(date +%Y-%m-%d)"
}

# Create notes from CSV data
function csv_to_notes() {
    cat data.csv | while IFS=, read -r title content tags; do
        echo "$content" | trilium pipe \
            --title "$title" \
            --tags "$tags" \
            --quiet
    done
}

# Git commit to note
function git_log_note() {
    git log --oneline -10 | trilium pipe \
        --title "Git Log $(date +%Y-%m-%d)" \
        --format code \
        --language git \
        --parent project-notes
}

# RSS feed to notes (requires xmlstarlet)
function rss_to_notes() {
    curl -s "$1" | xmlstarlet sel -t -m "//item" \
        -v "title" -o "|" \
        -v "description" -o "|" \
        -v "link" -n | \
    while IFS='|' read -r title desc link; do
        echo -e "$desc\n\nSource: $link" | trilium pipe \
            --title "$title" \
            --tags "rss,news" \
            --parent news-feed \
            --quiet
    done
}

# Docker logs to note
function docker_logs_note() {
    CONTAINER="$1"
    docker logs "$CONTAINER" 2>&1 | tail -500 | trilium pipe \
        --title "Docker Logs: $CONTAINER - $(date +%Y-%m-%d)" \
        --format code \
        --language log \
        --tags "docker,logs" \
        --parent docker-logs
}

# Screenshot to note (macOS)
function screenshot_note() {
    TMPFILE="/tmp/screenshot_$(date +%s).png"
    screencapture -i "$TMPFILE"
    if [ -f "$TMPFILE" ]; then
        # First create note with description
        NOTE_ID=$(echo "Screenshot taken at $(date)" | trilium pipe \
            --title "Screenshot $(date +%Y-%m-%d_%H-%M)" \
            --tags "screenshot" \
            --quiet)
        
        # Then attach the image
        trilium attachment upload "$NOTE_ID" "$TMPFILE"
        rm "$TMPFILE"
    fi
}

# Database query results to note
function query_to_note() {
    DB="$1"
    QUERY="$2"
    
    mysql -u user -p "$DB" -e "$QUERY" | trilium pipe \
        --title "Query Results: $(date +%Y-%m-%d)" \
        --format code \
        --language sql \
        --attributes "database=$DB" \
        --attributes "query=$QUERY"
}
```

### Automation with Cron

```bash
# Add to crontab for daily system reports
0 9 * * * df -h | trilium pipe --title "Disk Usage $(date +%Y-%m-%d)" --parent daily-reports --quiet

# Backup important config files
0 2 * * * cat /etc/nginx/nginx.conf | trilium pipe --title "Nginx Config Backup $(date +%Y-%m-%d)" --format code --language nginx --parent backups --quiet

# Monitor error logs
*/30 * * * * tail -100 /var/log/error.log | grep ERROR | trilium pipe --title "Error Log $(date +%Y-%m-%d_%H-%M)" --parent error-logs --quiet
```

## Security

- ETAPI tokens are stored in the configuration file
- Use environment variables for sensitive data in scripts
- The config file permissions should be set to 600 (user read/write only)

## Troubleshooting

### Connection Issues

```bash
# Test connection
trilium info

# Enable verbose logging
trilium --verbose search "test"

# Check configuration
trilium config show
```

### Common Issues

1. **Authentication Failed**: Ensure your ETAPI token is correct
2. **Connection Refused**: Check if Trilium server is running and accessible
3. **Timeout Errors**: Increase timeout in configuration

## Development

### Building from Source

```bash
# Debug build
cargo build

# Release build
cargo build --release

# Run tests
cargo test

# Run with debug logging
RUST_LOG=debug cargo run -- search "test"
```

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

Built for [Trilium Notes](https://github.com/zadam/trilium) - an excellent hierarchical note-taking application.