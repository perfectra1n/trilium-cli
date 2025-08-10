# TUI Improvements for Trilium CLI

## Summary of Fixes and Enhancements

This document describes the improvements made to the Trilium CLI TUI (Terminal User Interface) to address interaction issues and enhance usability.

## Issues Fixed

### 1. Help Window (? Key)
**Issue**: The "?" key wasn't properly opening a help window.
**Fix**: 
- Added a new `InputMode::Help` state
- Implemented `draw_help_popup()` function that displays a comprehensive help overlay
- The help popup shows all keyboard shortcuts organized by category
- Can be closed with ESC, q, or ? keys

### 2. Text Editing Capability
**Issue**: No text editing capability when working from the Note tree view.
**Fix**:
- Added `InputMode::NoteEdit` state for editing mode
- Implemented `handle_note_edit_mode()` with full text editing features:
  - Cursor movement (arrow keys, Home, End)
  - Text insertion and deletion (typing, Backspace, Delete)
  - Multi-line editing support with Enter for new lines
  - Visual cursor indicator in the editor
  - F2 to save without exiting, ESC to save and exit
- Both 'e' and 'i' keys trigger edit mode (vim-like behavior)

### 3. HTML Content Rendering
**Issue**: HTML content in notes was showing as raw HTML instead of being properly rendered.
**Fix**:
- Added `html_to_text()` function that converts HTML to readable text
- Uses the `html2md` crate to convert HTML to Markdown
- Further processes the Markdown for optimal terminal display
- Preserves code blocks and formatting
- Removes excessive whitespace for cleaner display

### 4. Improved Navigation
**Issue**: Navigation throughout the TUI needed to be more intuitive.
**Fixes implemented:

#### Vim-like Keys
- **j/k**: Navigate up/down (in addition to arrow keys)
- **h/l**: Navigate left/right (collapse/expand in tree view)
- **g**: Go to top of list
- **G**: Go to bottom of list

#### Pane Switching
- **Tab**: Switch between panes in split view
- **Shift+Tab**: Switch panes in reverse direction
- Split view focus is visually indicated with colored borders (yellow for active pane)

#### ESC Key Behavior
- **ESC** in content/attribute/search views returns to tree view
- **ESC** in edit mode saves and exits
- **ESC** in help closes the help window
- Provides consistent "go back" functionality

#### Visual Feedback
- Active pane in split view has a yellow border
- Selected items have a gray background
- Bold text for selected items
- Clear mode indicators in the title bar
- Status bar shows current mode and available actions

#### Scrolling
- **PageUp/PageDown**: Scroll content in large notes
- Content scrolling is preserved when switching between notes
- Edit mode supports scrolling for long documents

## Additional Features Added

### Help System
- Comprehensive help popup accessible with "?"
- Organized by categories: Navigation, Note Operations, Search, View Modes, etc.
- Shows all keyboard shortcuts with descriptions
- Clean, readable layout with colored headers

### Note Editor
- Full-screen editor mode for focused writing
- Visual cursor indicator showing exact position
- Line and column numbers in status bar
- Character count display
- Multi-line text editing with proper cursor navigation
- Save without exiting (F2) for continuous editing

### Enhanced Status Messages
- Clear feedback for all operations
- Mode indicators
- Helpful prompts for current context
- Error messages when operations fail

## Technical Implementation

### Key Components Modified

1. **src/tui/app.rs**:
   - Added new input modes (Help, NoteEdit)
   - Added edit buffer and cursor position tracking
   - Implemented new keyboard handlers
   - Added HTML to text conversion
   - Enhanced navigation methods

2. **src/tui/ui.rs**:
   - Added `draw_help_popup()` function
   - Added `draw_note_editor()` function
   - Enhanced visual feedback for active panes
   - Improved status bar information

### Dependencies Used
- `html2md`: For HTML to Markdown conversion
- `ratatui`: Core TUI framework (already present)
- `crossterm`: Terminal control (already present)

## Usage Guide

### Basic Navigation
1. Start TUI: `trilium tui`
2. Press `?` at any time to see help
3. Use `j/k` or arrow keys to navigate
4. Press `Tab` to switch between panes

### Editing Notes
1. Select a note in the tree
2. Press `o` or `Enter` to load it
3. Press `e` or `i` to enter edit mode
4. Make your changes
5. Press `ESC` to save and exit, or `F2` to save without exiting

### Searching
1. Press `/` for fuzzy search
2. Press `*` for full-text search
3. Use `n/N` to navigate search results

## Testing Recommendations

1. Test help popup in different terminal sizes
2. Verify HTML content is properly converted to text
3. Test editing with various note types
4. Verify vim-like navigation keys work as expected
5. Test pane switching in split view
6. Verify ESC key behavior in all modes

## Future Enhancements

Potential improvements for future iterations:
1. Syntax highlighting in the editor for Markdown
2. Undo/redo functionality in edit mode
3. Find and replace within the editor
4. Export edited content to different formats
5. Customizable key bindings
6. Mouse support for selection and scrolling