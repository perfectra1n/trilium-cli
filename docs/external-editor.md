# External Editor Integration

The Trilium CLI now supports using your preferred external editor (vim, nano, emacs, VS Code, etc.) for editing notes, providing a more comfortable and powerful editing experience.

## Features

- **Automatic HTML to Markdown Conversion**: When editing text notes, HTML content is automatically converted to Markdown for easier editing, then converted back to HTML when saving
- **Preserves Terminal State**: Properly manages terminal state when launching and returning from external editors
- **Configurable Editor**: Use any editor via environment variables or configuration
- **Smart Format Detection**: Automatically detects content type (HTML/Markdown/Plain text)
- **Error Handling**: Graceful handling of editor crashes, permission issues, and cancellations

## Quick Start

### Edit an existing note
```bash
# Open note in external editor
trilium note edit <note-id>

# Or use the --edit flag with get command
trilium note get <note-id> --edit
```

### Create a new note with editor
```bash
# Create and open in editor
trilium note create "My New Note" --edit
```

### Update note content
```bash
# Update with external editor
trilium note update <note-id> --edit
```

## Configuration

### Setting Your Preferred Editor

#### Method 1: Environment Variables (Recommended)
```bash
# Set in your shell profile (.bashrc, .zshrc, etc.)
export EDITOR=vim                    # Standard UNIX editor variable
export VISUAL=code                   # Visual editor variable
export TRILIUM_EDITOR=emacs          # Trilium-specific (highest priority)
```

#### Method 2: CLI Configuration
```bash
# Set editor command
trilium editor set vim
trilium editor set 'code --wait'
trilium editor set 'subl -w'

# Show current configuration
trilium editor show

# Test editor configuration
trilium editor test
```

### HTML/Markdown Conversion

By default, HTML content is converted to Markdown for editing:

```bash
# Enable conversion (default)
trilium editor convert true

# Disable conversion (edit raw HTML)
trilium editor convert false
```

### Command-line Options

When editing notes, you can override settings:

```bash
# Use specific editor for this command
trilium note edit <note-id> --editor vim

# Disable HTML to Markdown conversion for this edit
trilium note edit <note-id> --no-convert
```

## Editor Priority

The CLI determines which editor to use in this order:

1. Command-line `--editor` option
2. Profile-specific editor setting
3. Global editor configuration
4. `TRILIUM_EDITOR` environment variable
5. `VISUAL` environment variable
6. `EDITOR` environment variable
7. System defaults (nano on Linux, notepad on Windows, TextEdit on macOS)

## TUI Integration

When using the Terminal User Interface (TUI):

- Press `Ctrl+E` while viewing a note to open it in external editor
- The TUI will pause while the editor is open
- Changes are automatically saved when you close the editor
- Press `ESC` to cancel without saving

## Supported Editors

The following editors have been tested and work well:

### Terminal Editors
- **vim/neovim**: `export EDITOR=vim`
- **nano**: `export EDITOR=nano`
- **emacs**: `export EDITOR=emacs`
- **micro**: `export EDITOR=micro`

### GUI Editors (require wait flag)
- **VS Code**: `export EDITOR='code --wait'`
- **Sublime Text**: `export EDITOR='subl -w'`
- **Atom**: `export EDITOR='atom --wait'`
- **TextMate**: `export EDITOR='mate -w'`

## HTML/Markdown Conversion

### What Gets Converted

When editing text or book notes with HTML content:

- **HTML → Markdown**: Headings, bold, italic, links, lists, code blocks
- **Markdown → HTML**: Standard Markdown syntax converted back
- **Preserved**: Trilium-specific links (#noteId format)

### Example Conversion

HTML in Trilium:
```html
<h1>My Note</h1>
<p>This is <strong>bold</strong> and <em>italic</em> text.</p>
<ul>
  <li>Item 1</li>
  <li>Item 2</li>
</ul>
```

Markdown in Editor:
```markdown
# My Note

This is **bold** and _italic_ text.

- Item 1
- Item 2
```

## Troubleshooting

### Editor Not Found

If you get "editor not found" errors:

1. Check editor is installed: `which vim` (or your editor)
2. Use full path: `trilium editor set /usr/bin/vim`
3. Check environment: `echo $EDITOR`

### GUI Editors Not Waiting

GUI editors must be configured to wait for file close:

```bash
# Wrong - editor returns immediately
export EDITOR=code

# Correct - waits for file to be closed
export EDITOR='code --wait'
```

### Terminal Issues After Editing

If terminal behaves strangely after editing:

1. Press `Enter` a few times
2. Run `reset` or `clear`
3. Restart the terminal if needed

### Permission Denied

If you get permission errors:

1. Check temp directory permissions: `ls -la /tmp`
2. Set custom temp directory: `export TMPDIR=/path/to/writable/dir`

## Examples

### Quick Note Editing Workflow

```bash
# 1. Find a note
trilium search "meeting notes"

# 2. Edit it
trilium note edit abc123def

# 3. Editor opens with Markdown content
# 4. Make changes and save
# 5. Note is updated in Trilium
```

### Batch Editing

```bash
# Edit multiple notes in sequence
for note_id in abc123 def456 ghi789; do
    echo "Editing note: $note_id"
    trilium note edit "$note_id"
done
```

### Using with Git

```bash
# Export note as Markdown, edit, and track changes
trilium note get abc123 --content > note.md
$EDITOR note.md
git diff note.md
# ... make commits ...
trilium note update abc123 --content "$(cat note.md)"
```

## Tips and Best Practices

1. **Set EDITOR in shell profile**: Add to ~/.bashrc or ~/.zshrc for persistence
2. **Use wait flags for GUI editors**: Ensures proper saving
3. **Test configuration**: Run `trilium editor test` after setup
4. **Markdown for text notes**: Enable conversion for better editing experience
5. **Backup important notes**: Before bulk editing operations

## Security Considerations

- Temporary files are created in system temp directory
- Files are deleted after editing (even on error)
- File permissions are set to user-only (600)
- No content is logged or cached

## Limitations

- Binary attachments cannot be edited
- Some complex HTML may not convert perfectly to Markdown
- Large notes (>10MB) may be slow to open
- Terminal state restoration may vary by terminal emulator

## Reporting Issues

If you encounter problems:

1. Check your editor configuration: `trilium editor show`
2. Test the editor: `trilium editor test`
3. Run with verbose logging: `trilium note edit <id> --verbose`
4. Report issues with: OS, terminal, editor name, and error messages