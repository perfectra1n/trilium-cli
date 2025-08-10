# External Editor Integration Fix

## Summary

The Trilium CLI TUI application has been updated to use external editors (like vim, nano, etc.) instead of the built-in text editor. This provides a much better editing experience and follows standard CLI tool conventions.

## Changes Made

### 1. Removed Built-in Editor
- Removed the `NoteEdit` input mode that implemented a custom in-TUI text editor
- Removed all cursor movement and text editing logic from the TUI
- Removed the note editor UI components

### 2. Added External Editor Support
- Integrated the `edit` crate for automatic editor detection
- Added fallback manual editor launching using `std::process::Command`
- Properly suspends the TUI when launching the external editor
- Resumes the TUI after the editor closes

### 3. Editor Detection Order
The application now detects and uses editors in the following order:
1. `$EDITOR` environment variable
2. `$VISUAL` environment variable
3. Platform-specific defaults:
   - Linux/macOS: `nano`
   - Windows: `notepad`

### 4. Terminal State Management
When launching an external editor:
1. The TUI properly exits raw mode
2. Leaves the alternate screen
3. Shows the cursor
4. Launches the editor
5. After editor closes, restores raw mode and alternate screen
6. Redraws the TUI

## Usage

### Setting Your Preferred Editor

```bash
# Set your preferred editor (examples)
export EDITOR=vim
export EDITOR=nano
export EDITOR="code --wait"  # VS Code
export EDITOR="subl --wait"  # Sublime Text
```

### Editing Notes in the TUI

1. Navigate to a note using arrow keys or vim-style navigation (j/k/h/l)
2. Press `e` or `i` to edit the selected note
3. Your external editor will open with the note content
4. Edit the content and save using your editor's save command
5. Exit the editor to return to the TUI
6. The note will be automatically saved if changes were made

## Technical Implementation

### Key Components

1. **`launch_external_editor()`**: Main function that handles editor launching
   - First tries the `edit` crate for automatic handling
   - Falls back to manual implementation if needed

2. **`suspend_and_edit_note()`**: Manages terminal state transitions
   - Suspends the TUI before launching editor
   - Resumes the TUI after editor closes
   - Handles save/cancel scenarios

3. **Temporary File Handling**:
   - Creates temp files with appropriate extensions (.txt, .md, .html)
   - Uses descriptive filenames with note title
   - Cleans up temp files after editing

### Error Handling

The implementation includes robust error handling for:
- Missing editor commands
- Failed editor launches
- Non-zero exit codes from editors
- File I/O errors
- Terminal state restoration failures

## Benefits

1. **Better Editing Experience**: Users can use their familiar editor with all its features
2. **Standard Behavior**: Follows conventions used by git, crontab, and other CLI tools
3. **No Learning Curve**: No need to learn custom key bindings for the built-in editor
4. **Feature Rich**: Access to syntax highlighting, multi-cursor, macros, etc. from your editor
5. **Customizable**: Users can configure any editor they prefer

## Troubleshooting

### Editor Not Opening
- Check that `$EDITOR` or `$VISUAL` is set correctly
- Ensure the editor command is in your PATH
- Try setting the full path to the editor

### Terminal Corrupted After Editing
- The TUI should automatically restore the terminal
- If issues persist, press `Ctrl+L` to redraw
- As a last resort, run `reset` in your terminal

### Changes Not Saving
- Ensure you save the file in your editor before closing
- Check that the editor exits with status code 0
- Some editors require flags like `--wait` to work properly

## Examples

### Common Editor Configurations

```bash
# Vim
export EDITOR=vim

# Neovim
export EDITOR=nvim

# Emacs
export EDITOR="emacs -nw"

# VS Code (must wait for close)
export EDITOR="code --wait"

# Sublime Text (must wait for close)
export EDITOR="subl --wait"

# Nano (default fallback)
export EDITOR=nano
```

## Future Improvements

Potential enhancements for the external editor integration:
1. Add a configuration option to disable external editor and use simple inline editing
2. Support for diff viewing before saving changes
3. Integration with system clipboard for copy/paste
4. Support for opening multiple notes in tabs (if the editor supports it)
5. Template support with placeholders