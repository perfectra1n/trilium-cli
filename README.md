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
# Configure connection to your Trilium server
trilium profile create my-trilium --server-url http://localhost:8080 --api-token YOUR_API_TOKEN

# Test the connection
trilium profile test

# Start the TUI
trilium tui

# Or use CLI commands
trilium note list
```

### Basic Usage Examples

#### Note Management
```bash
# Create a new note
trilium note create "My Note" --content "Hello, Trilium!" --parent root

# List all notes
trilium note list --tree

# Search notes
trilium search "project" --limit 10 --context

# Export notes
trilium export obsidian my-note-id ./my-vault
```

#### Profile Management
```bash
# Create multiple profiles
trilium profile create work --server-url https://work-trilium.com --api-token WORK_TOKEN
trilium profile create personal --server-url https://personal-trilium.com --api-token PERSONAL_TOKEN

# Switch between profiles
trilium profile switch work
trilium note list

trilium profile switch personal
trilium note list
```

## 🖥️ Command Line Interface

### Core Commands

#### Notes
```bash
trilium note create <title>           # Create a new note
trilium note list [parent-id]         # List notes
trilium note get <note-id>            # Get note details
trilium note update <note-id>         # Update note
trilium note delete <note-id>         # Delete note
trilium note search <query>           # Search notes
trilium note move <note-id> <parent>  # Move note
trilium note clone <note-id>          # Clone note
```

#### Search
```bash
trilium search <query>                # Basic search
trilium search <query> --fast         # Fast search
trilium search <query> --regex        # Regex search
trilium search <query> --content      # Include content in results
trilium search <query> --limit 50     # Limit results
```

#### Import/Export
```bash
trilium import obsidian <vault-path>   # Import Obsidian vault
trilium export obsidian <note-id> <output-path>  # Export to Obsidian
trilium import notion <zip-path>       # Import Notion export
trilium import directory <dir-path>    # Import directory
trilium export directory <note-id> <output-path>  # Export as directory
```

#### Profiles
```bash
trilium profile create <name>         # Create new profile
trilium profile list                  # List profiles
trilium profile switch <name>         # Switch active profile
trilium profile show [name]           # Show profile details
trilium profile test [name]           # Test profile connection
trilium profile delete <name>         # Delete profile
```

#### Tags & Attributes
```bash
trilium tag list                      # List all tags
trilium tag search <pattern>          # Search by tags
trilium tag add <note-id> <tag>       # Add tag to note
trilium tag remove <note-id> <tag>    # Remove tag from note
trilium attribute create <note-id> <type> <name> <value>  # Create attribute
trilium attribute list <note-id>      # List note attributes
```

## 🖼️ Terminal User Interface (TUI)

Launch the interactive TUI with:
```bash
trilium tui
```

### TUI Features
- **📁 Tree Navigation**: Browse note hierarchy with collapsible folders
- **📖 Content Viewer**: View and edit note content with syntax highlighting
- **🔍 Interactive Search**: Real-time search with result highlighting
- **⌨️ Vim-like Keybindings**: Efficient keyboard navigation
- **📑 Multiple Panels**: Split view for tree and content
- **🔖 Bookmarks**: Quick access to frequently used notes

### Key Bindings
```
j/k or ↓/↑     Navigate up/down
h/l or ←/→     Collapse/expand or move between panels
Enter          Open selected note
/              Start search
n              Create new note
d              Delete selected note
e              Edit note in external editor
q              Quit TUI
?              Show help
```

## ⚙️ Configuration

### Configuration File
The CLI stores configuration in `~/.config/trilium-cli/config.json` (Linux/macOS) or `%APPDATA%/trilium-cli/config.json` (Windows).

```json
{
  "currentProfile": "default",
  "profiles": {
    "default": {
      "name": "default",
      "serverUrl": "http://localhost:8080",
      "apiToken": "etapi_...",
      "timeout": 30000,
      "retries": 3
    }
  },
  "defaults": {
    "outputFormat": "table",
    "pageSize": 50,
    "editor": "vim"
  }
}
```

### Environment Variables
- `TRILIUM_SERVER_URL`: Override server URL
- `TRILIUM_API_TOKEN`: Override API token
- `TRILIUM_CONFIG_PATH`: Override config file path
- `TRILIUM_DEBUG`: Enable debug logging
- `EDITOR`: External editor for note editing

## 🔌 API Integration

### Programmatic Usage
```typescript
import { TriliumClient } from 'trilium-cli-ts';

const client = new TriliumClient({
  serverUrl: 'http://localhost:8080',
  apiToken: 'your-api-token'
});

// Create a note
const note = await client.createNote({
  title: 'API Created Note',
  content: 'Content created via API',
  type: 'text',
  parentNoteId: 'root'
});

// Search notes
const results = await client.searchNotes('project');

// Get note with content
const noteWithContent = await client.getNoteWithContent(note.noteId);
```

### Available Methods
The `TriliumClient` provides complete coverage of Trilium's ETAPI:

- **Notes**: `createNote`, `getNote`, `updateNote`, `deleteNote`, `searchNotes`
- **Branches**: `createBranch`, `getBranch`, `updateBranch`, `deleteBranch`
- **Attributes**: `createAttribute`, `getAttribute`, `updateAttribute`, `deleteAttribute`
- **Attachments**: `createAttachment`, `getAttachment`, `updateAttachment`, `deleteAttachment`
- **Search**: `searchNotes`, `searchNotesAdvanced`, `searchNotesEnhanced`
- **Import/Export**: `exportNote`, `importNote`, various format-specific methods

## 🧪 Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run specific test files
npm test -- api/client.test.ts
```

### Test Categories
- **Unit Tests**: Individual component testing
- **Integration Tests**: API integration with mock server
- **CLI Tests**: Command-line interface testing
- **TUI Tests**: Terminal interface component testing
- **Import/Export Tests**: Format conversion and file handling

## 🛠️ Development

### Prerequisites
- Node.js 18+ (recommended: 20+)
- TypeScript 5.3+
- A running Trilium instance for testing

### Development Setup
```bash
# Clone and setup
git clone https://github.com/yourusername/trilium-cli-ts
cd trilium-cli-ts
npm install

# Development commands
npm run dev                    # Run in development mode
npm run dev:watch             # Watch mode with auto-reload
npm run build                 # Build for production
npm run test:watch            # Run tests in watch mode
npm run lint                  # Run linter
npm run typecheck            # Run type checking
```

### Project Structure
```
trilium-cli-ts/
├── src/
│   ├── api/                  # API client implementation
│   ├── cli/                  # CLI commands and parsing
│   ├── tui/                  # Terminal UI components
│   ├── import-export/        # Import/export functionality
│   ├── utils/                # Utility functions
│   ├── types/                # TypeScript type definitions
│   ├── config/               # Configuration management
│   └── bin/                  # Executable entry points
├── test/                     # Test suites
├── scripts/                  # Build and utility scripts
└── docs/                     # Additional documentation
```

### Contributing
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes with tests
4. Run the test suite: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to your branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📋 Migration from Rust Version

### Key Differences
- **Language**: TypeScript instead of Rust
- **Ecosystem**: npm/Node.js ecosystem vs Cargo/Rust
- **Performance**: Slightly higher memory usage but better integration with web tools
- **Development**: More accessible to web developers

### Migration Steps
1. **Export your current configuration**: The TypeScript version uses a different config format
2. **Reinstall**: `cargo uninstall trilium-cli && npm install -g trilium-cli-ts`
3. **Reconfigure**: Run `trilium profile create` to set up your profiles
4. **Test functionality**: All commands should work identically

### Feature Parity
✅ All CLI commands
✅ TUI interface
✅ Import/export functionality
✅ Profile management
✅ Search capabilities
✅ API coverage

## 🐛 Troubleshooting

### Common Issues

**Connection Issues**
```bash
# Test your connection
trilium profile test

# Check server URL and API token
trilium profile show

# Enable debug logging
TRILIUM_DEBUG=1 trilium note list
```

**Build Issues**
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Verify Node.js version
node --version  # Should be 18+
```

**TUI Issues**
```bash
# Check terminal compatibility
echo $TERM

# Run in compatibility mode
TERM=xterm trilium tui
```

### Getting Help
- 📖 [Full Documentation](./docs/)
- 🐛 [Issue Tracker](https://github.com/yourusername/trilium-cli-ts/issues)
- 💬 [Discussions](https://github.com/yourusername/trilium-cli-ts/discussions)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Trilium Notes](https://github.com/zadam/trilium)**: The amazing note-taking application this CLI supports
- **Original Rust Implementation**: Inspiration and feature reference
- **TypeScript Community**: Tools and libraries that make this project possible
- **Contributors**: Everyone who has contributed to making this project better

## 🔄 Changelog

### v0.1.0 (Current)
- ✨ Initial TypeScript implementation
- ✨ Complete CLI interface
- ✨ Interactive TUI
- ✨ Multi-profile support
- ✨ Import/export capabilities
- ✨ Comprehensive test suite
- ✨ Full API coverage

---

**Made with ❤️ for the Trilium community**