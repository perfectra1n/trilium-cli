# Trilium CLI TypeScript

A comprehensive TypeScript CLI and TUI client for [Trilium Notes](https://github.com/zadam/trilium), providing powerful command-line access to your notes and a beautiful terminal user interface.

This TypeScript implementation offers complete feature parity with enterprise-grade reliability, type safety, and extensive testing coverage.

## 🚀 Features

### Core Functionality
- **📝 Complete Note Management**: Create, read, update, delete notes with full metadata support
- **🌳 Hierarchical Structure**: Full support for note trees, branches, and relationships
- **🔍 Advanced Search**: Powerful search with highlighting, fuzzy matching, and filters
- **🏷️ Tags & Attributes**: Complete attribute system with labels and relations
- **📎 Attachment Support**: Upload, download, and manage file attachments
- **🔗 Link Management**: Wiki-style links with validation and broken link detection

### Interface Options
- **🖥️ Command Line Interface (CLI)**: Full-featured command-line tool for automation
- **🖼️ Terminal User Interface (TUI)**: Interactive terminal interface with vim-like navigation
- **👥 Multi-Profile Support**: Connect to multiple Trilium instances with profile management

### Import/Export Capabilities
- **📦 Obsidian Integration**: Import from and export to Obsidian vaults
- **📋 Notion Support**: Import Notion exports with full content preservation
- **📁 Directory Operations**: Bulk import/export with directory structures
- **🔄 Git Integration**: Version control integration for note synchronization

### Developer Experience
- **🔒 Full Type Safety**: Complete TypeScript coverage with strict type checking
- **🧪 Comprehensive Testing**: Unit, integration, and end-to-end test coverage
- **🔌 Plugin System**: Extensible architecture for custom functionality
- **📚 Complete API Coverage**: Full implementation of Trilium's ETAPI specification

## 📦 Installation

### From npm (Recommended)
```bash
npm install -g trilium-cli-ts

# Or using yarn
yarn global add trilium-cli-ts

# Or using pnpm
pnpm install -g trilium-cli-ts
```

### From Source
```bash
git clone https://github.com/yourusername/trilium-cli-ts
cd trilium-cli-ts
npm install
npm run build
npm link
```

## 🚀 Quick Start

### Initial Setup
```bash
# Configure your Trilium server connection
trilium config init

# You'll be prompted for:
# - Server URL (e.g., http://localhost:8080)
# - ETAPI Token (from Trilium Settings → ETAPI)
```

### Basic CLI Usage
```bash
# Search for notes
trilium search "project ideas"

# Create a new note
trilium note create --title "Meeting Notes" --content "Discussion points..."

# View a note
trilium note get <noteId>

# List all notes in tree view
trilium note list --tree
```

### Launch the TUI
```bash
# Start the interactive terminal interface
trilium tui

# Or with a specific profile
trilium tui --profile work
```

## 🖥️ Command Line Interface (CLI)

### Note Management

#### Creating Notes
```bash
# Create a simple text note
trilium note create --title "My Note" --content "Note content here"

# Create with specific type
trilium note create --title "Code Snippet" --type code --mime "application/javascript"

# Create as child of specific note
trilium note create --title "Sub-note" --parent <parentNoteId>

# Create from file
trilium note create --title "Documentation" --file ./docs/README.md

# Create with tags
trilium note create --title "Project" --tags "work,important,project-x"
```

#### Reading Notes
```bash
# Get note by ID
trilium note get <noteId>

# Get note with content
trilium note get <noteId> --content

# Export note to file
trilium note export <noteId> --format markdown --output note.md

# List child notes
trilium note list --parent <parentNoteId>

# Tree view of entire hierarchy
trilium note list --tree --depth 3
```

#### Updating Notes
```bash
# Update note title
trilium note update <noteId> --title "New Title"

# Update content from file
trilium note update <noteId> --file updated-content.md

# Move note to different parent
trilium note move <noteId> --to <newParentId>

# Clone note
trilium note clone <noteId> --type "deep-clone"
```

#### Deleting Notes
```bash
# Delete a note (with confirmation)
trilium note delete <noteId>

# Force delete without confirmation
trilium note delete <noteId> --force

# Delete multiple notes
trilium note delete <id1> <id2> <id3> --force
```

### Search Operations

```bash
# Basic text search
trilium search "kubernetes deployment"

# Search with options
trilium search "docker" --limit 20 --fast

# Search in archived notes
trilium search "old project" --archived

# Regex search
trilium search "error.*fatal" --regex

# Search with content preview
trilium search "config" --content --context 2

# Search by tags
trilium search --tags "work AND urgent"

# Complex attribute search
trilium search --query "#book #status=reading @author=*Tolkien*"
```

### Tag Management

```bash
# List all tags
trilium tag list

# Show tag hierarchy
trilium tag list --tree

# Search notes by tag
trilium tag search "important"

# Add tag to note
trilium tag add <noteId> "reviewed"

# Remove tag from note
trilium tag remove <noteId> "draft"

# Rename tag across all notes
trilium tag rename "old-name" "new-name"

# Show tag statistics
trilium tag list --counts
```

### Attachment Operations

```bash
# List attachments for a note
trilium attachment list <noteId>

# Upload attachment
trilium attachment upload <noteId> --file ./document.pdf --title "Report"

# Download attachment
trilium attachment download <attachmentId> --output ./downloads/

# Delete attachment
trilium attachment delete <attachmentId>

# Get attachment info
trilium attachment info <attachmentId>
```

### Import/Export

#### Obsidian Integration
```bash
# Import from Obsidian vault
trilium import obsidian --vault ~/Documents/ObsidianVault --parent <parentNoteId>

# Export to Obsidian format
trilium export obsidian <noteId> --output ~/Documents/NewVault

# Sync with Obsidian (bidirectional)
trilium sync obsidian --vault ~/Documents/ObsidianVault --note <noteId>
```

#### Notion Import
```bash
# Import Notion export
trilium import notion --zip ~/Downloads/notion-export.zip --parent <parentId>

# With options
trilium import notion --zip export.zip --parent root --preserve-dates --skip-empty
```

#### Directory Operations
```bash
# Import directory structure
trilium import dir --path ~/Documents/Notes --parent <parentId>

# Export note tree to directory
trilium export dir <noteId> --output ~/Export/Notes

# Watch directory for changes
trilium import dir --path ~/Notes --watch --auto-sync
```

### Profile Management

```bash
# List all profiles
trilium profile list

# Create new profile
trilium profile create --name "work" --server https://work.trilium.example.com

# Switch profile
trilium profile set work

# Clone profile
trilium profile copy work personal

# Delete profile
trilium profile delete old-profile
```

### Advanced Features

#### Templates
```bash
# List available templates
trilium template list

# Create note from template
trilium template use "meeting-template" --title "Team Standup"

# Create custom template
trilium template create --title "Bug Report" --content-file ./templates/bug.md

# Apply template to existing note
trilium template apply <templateId> --to <noteId>
```

#### Quick Capture
```bash
# Quick note creation
trilium quick "Remember to review PR #123"

# Quick note with tags
trilium quick "Call client at 3pm" --tags "urgent,calls"

# Pipe content to quick note
echo "Server logs" | trilium pipe --title "Debug Output"

# Capture from clipboard
trilium quick --clipboard --title "Saved from clipboard"
```

#### Batch Operations
```bash
# Batch tag addition
trilium batch tag add --notes <id1>,<id2>,<id3> --tag "reviewed"

# Batch move
trilium batch move --notes <id1>,<id2> --to <parentId>

# Batch export
trilium batch export --notes <id1>,<id2>,<id3> --format markdown --output ./export/
```

## 🖼️ Terminal User Interface (TUI)

### Launching the TUI
```bash
# Start TUI with default profile
trilium tui

# Start with specific profile
trilium tui --profile personal

# Start in search mode
trilium tui --search "project"

# Start at specific note
trilium tui --note <noteId>
```

### TUI Navigation

#### Keyboard Shortcuts

**Global Navigation:**
- `?` - Show help
- `q` - Quit application
- `Tab` - Switch between panels
- `Ctrl+s` - Save current note
- `Ctrl+f` - Focus search
- `Ctrl+t` - Toggle tree view
- `Ctrl+n` - Create new note
- `Esc` - Cancel/Back

**Tree View Navigation:**
- `j`/`↓` - Move down
- `k`/`↑` - Move up
- `h`/`←` - Collapse node
- `l`/`→` - Expand node
- `Enter` - Select note
- `Space` - Preview note
- `d` - Delete note
- `r` - Rename note
- `m` - Move note
- `c` - Create child note
- `t` - Add tag
- `/` - Search in tree

**Note Editor:**
- `i` - Enter insert mode
- `Esc` - Exit insert mode
- `Ctrl+s` - Save note
- `Ctrl+z` - Undo
- `Ctrl+y` - Redo
- `Ctrl+b` - Bold
- `Ctrl+i` - Italic
- `Ctrl+k` - Insert link
- `Ctrl+d` - Delete line

**Search Panel:**
- `Enter` - Execute search
- `Tab` - Cycle through results
- `Enter` (on result) - Open note
- `Ctrl+Space` - Preview result
- `Ctrl+o` - Change search options
- `Ctrl+r` - Recent searches

### TUI Features

#### Split View
The TUI provides a three-panel layout:
1. **Tree Panel** (Left): Hierarchical note navigation
2. **Content Panel** (Center): Note viewing and editing
3. **Info Panel** (Right): Metadata, tags, and attributes

#### Search Interface
- Real-time search with highlighting
- Filter by type, tags, or attributes
- Search history and saved searches
- Quick filters for recent, starred, or modified notes

#### Note Editing
- Syntax highlighting for code notes
- Markdown preview mode
- Auto-save functionality
- Multiple cursor support
- Find and replace

#### Visual Indicators
- 📎 - Has attachments
- 🔒 - Protected note
- ⭐ - Bookmarked
- 🏷️ - Has tags
- 📝 - Recently modified
- 🔗 - Has many links

### TUI Configuration

Create a configuration file at `~/.config/trilium-cli/tui.json`:

```json
{
  "theme": "dark",
  "keyBindings": "vim",
  "panels": {
    "tree": { "width": 30 },
    "content": { "width": 50 },
    "info": { "width": 20 }
  },
  "editor": {
    "tabSize": 2,
    "wordWrap": true,
    "lineNumbers": true,
    "autoSave": true,
    "autoSaveDelay": 5000
  },
  "search": {
    "caseSensitive": false,
    "highlightResults": true,
    "maxResults": 50
  }
}
```

## 🔧 Configuration

### Configuration File
The CLI stores configuration at `~/.config/trilium-cli/config.json`:

```json
{
  "profiles": {
    "default": {
      "serverUrl": "http://localhost:8080",
      "apiToken": "your-api-token-here",
      "timeout": 30000,
      "retryAttempts": 3
    },
    "work": {
      "serverUrl": "https://work-trilium.example.com",
      "apiToken": "work-api-token"
    }
  },
  "currentProfile": "default",
  "output": {
    "format": "table",
    "color": true,
    "pager": true
  },
  "editor": {
    "command": "vim",
    "tempDir": "/tmp/trilium-cli"
  }
}
```

### Environment Variables
```bash
# Override server URL
export TRILIUM_SERVER_URL=http://localhost:8080

# Set API token
export TRILIUM_API_TOKEN=your-token-here

# Set default profile
export TRILIUM_PROFILE=work

# Set output format
export TRILIUM_OUTPUT=json

# Disable colors
export NO_COLOR=1
```

### Command Aliases
Add to your shell configuration:

```bash
# Quick aliases
alias tn='trilium note'
alias ts='trilium search'
alias tt='trilium tui'
alias tq='trilium quick'

# Common operations
alias tnew='trilium note create --edit'
alias tsearch='trilium search --content --limit 10'
alias ttree='trilium note list --tree --depth 3'

# Functions for complex operations
trilium-backup() {
  trilium export dir root --output ~/TriliumBackup/$(date +%Y%m%d)
}

trilium-journal() {
  trilium note create --title "Journal - $(date +%Y-%m-%d)" \
    --parent journal --template daily-journal --edit
}
```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- test/api/client.test.ts

# Run in watch mode
npm test -- --watch

# Run integration tests
npm run test:integration

# Run with live Trilium instance
TRILIUM_TEST_URL=http://localhost:8080 \
TRILIUM_TEST_TOKEN=your-token \
npm run test:live
```

### Test Coverage
The project maintains >90% test coverage across:
- API client methods
- CLI commands
- TUI components
- Import/export functions
- Utility functions

## 🔌 Plugin Development

### Creating a Plugin
```typescript
// my-plugin.ts
import { Plugin, PluginContext } from 'trilium-cli-ts';

export default class MyPlugin implements Plugin {
  name = 'my-plugin';
  version = '1.0.0';

  async init(context: PluginContext) {
    // Register command
    context.registerCommand({
      name: 'my-command',
      description: 'Custom command',
      handler: async (args) => {
        const client = context.getClient();
        // Your logic here
      }
    });

    // Hook into events
    context.on('note:created', async (note) => {
      console.log('Note created:', note.title);
    });
  }
}
```

### Installing Plugins
```bash
# Install from npm
trilium plugin install trilium-plugin-example

# Install from file
trilium plugin install ./my-plugin.js

# List installed plugins
trilium plugin list

# Remove plugin
trilium plugin uninstall my-plugin
```

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup
```bash
# Clone repository
git clone https://github.com/yourusername/trilium-cli-ts
cd trilium-cli-ts

# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Build project
npm run build
```

## 📚 API Documentation

For detailed API documentation, see [API.md](docs/API.md).

## 🐛 Troubleshooting

### Common Issues

**Connection Refused**
```bash
# Check if Trilium is running
curl http://localhost:8080/api/health

# Verify ETAPI is enabled in Trilium settings
```

**Authentication Failed**
```bash
# Regenerate token in Trilium settings
# Update configuration
trilium config set apiToken <new-token>
```

**TUI Display Issues**
```bash
# Check terminal capabilities
echo $TERM

# Try different terminal
TERM=xterm-256color trilium tui
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Trilium Notes](https://github.com/zadam/trilium) for the amazing note-taking application
- Built with [Commander.js](https://github.com/tj/commander.js), [Ink](https://github.com/vadimdemedes/ink), and [TypeScript](https://www.typescriptlang.org/)

## 📞 Support

- 📖 [Documentation](https://github.com/yourusername/trilium-cli-ts/wiki)
- 🐛 [Issue Tracker](https://github.com/yourusername/trilium-cli-ts/issues)
- 💬 [Discussions](https://github.com/yourusername/trilium-cli-ts/discussions)
- 📧 Email: support@example.com