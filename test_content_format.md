# Content Format Handling Test

This document demonstrates the new content format handling implementation that fixes the external editor integration.

## Features Implemented

### 1. Content Format Detection
- **HTML Detection**: Looks for HTML tags like `<div>`, `<p>`, `<strong>`, etc.
- **Markdown Detection**: Identifies markdown syntax like headers (`#`), lists (`-`, `*`), code blocks (````), etc.
- **MIME Type Support**: Uses note MIME type metadata to determine format
- **Fallback to Plain Text**: When content doesn't match HTML or Markdown patterns

### 2. Bidirectional Conversion System
- **HTML → Markdown**: For editing (using `html2md` crate)
- **Markdown → HTML**: For saving back to Trilium (using `pulldown-cmark` crate)
- **Plain Text Handling**: Preserved as-is or optionally wrapped in basic HTML

### 3. Smart File Extensions
- **`.md`** for Markdown content (converted from HTML)
- **`.html`** for pure HTML content
- **`.txt`** for plain text content
- Enables proper syntax highlighting in external editors

### 4. User Experience Improvements
- Status messages show what format conversion is happening
- Debug mode shows detailed content length information during conversion
- Proper error handling for conversion failures

## Technical Implementation

### Key Components

1. **ContentFormat Enum**: Tracks content types (Html, Markdown, PlainText)
2. **ContentConversionResult**: Stores conversion metadata for round-trip consistency
3. **ContentFormatHandler**: Handles all format detection and conversion logic
4. **Enhanced External Editor**: Uses conversion system for proper file extensions and content

### Integration Points

- **load_current_note()**: Detects format and stores conversion metadata
- **suspend_and_edit_note()**: Prepares content for editing with proper format
- **launch_external_editor_secure()**: Uses correct file extension based on editing format
- **Content Saving**: Converts edited content back to Trilium-compatible HTML format

## Benefits

1. **Data Integrity**: No more corruption of HTML content when editing
2. **Better UX**: Users edit in human-friendly Markdown instead of raw HTML
3. **Editor Support**: Proper file extensions enable syntax highlighting
4. **Backwards Compatible**: Handles existing plain text and HTML content properly
5. **Round-trip Safe**: Content maintains formatting through edit cycles

## Usage

When editing notes in the TUI:
1. Press `e` or `i` to edit a note
2. System detects content format and converts HTML to Markdown for editing
3. External editor opens with appropriate file extension (`.md`, `.html`, `.txt`)
4. User edits in human-friendly format
5. On save, system converts back to HTML for storage in Trilium
6. Status messages inform user of conversions happening

This ensures that users can edit notes in a comfortable format while maintaining full compatibility with Trilium's HTML-based storage system.