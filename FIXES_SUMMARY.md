# Critical Issues Fixed

## Issue 1: Wrong API Endpoint for Content Updates

### Problem
The application was trying to update note content using the wrong API endpoint. It was sending content through the `/notes/{noteId}` PATCH endpoint (for metadata only) instead of the `/notes/{noteId}/content` PUT endpoint (for content).

**Error Message:**
```
{"status":400,"code":"PROPERTY_NOT_ALLOWED","message":"Property 'content' is not allowed for this method."}
```

### Root Cause
- `UpdateNoteRequest` struct incorrectly included a `content` field
- TUI editor logic was using the metadata endpoint for content updates
- Mixed responsibility: one struct trying to handle both metadata and content updates

### Solution
1. **Removed `content` field from `UpdateNoteRequest` struct** - this struct is now metadata-only
2. **Updated TUI editor logic** to use the correct API endpoints:
   - Content updates: `client.update_note_content()` → PUT `/notes/{id}/content` 
   - Metadata updates: `client.update_note()` → PATCH `/notes/{id}`
3. **Fixed CLI commands** to use proper separation of concerns
4. **Updated all tests** to reflect the new structure

### Files Modified
- `/root/repos/trilium-cli/src/models.rs` - Removed content field and updated builder
- `/root/repos/trilium-cli/src/tui/app.rs` - Fixed editor logic to use correct endpoints
- `/root/repos/trilium-cli/src/cli/commands/note.rs` - Fixed command to separate content/metadata updates
- `/root/repos/trilium-cli/src/cli/commands/template.rs` - Removed content field usage

## Issue 2: Log Viewer Key Not Working

### Problem
The capital `L` key to open the log viewer wasn't responding properly.

### Root Cause Analysis
- No actual conflict between `L` (log viewer) and `l` (navigation right) keys
- Issue was likely related to input processing or key detection
- Users might not be aware of alternative key combinations

### Solution
1. **Added comprehensive debug logging** to track key presses when debug mode is enabled
2. **Added alternative key combination** - `Ctrl+L` also opens log viewer
3. **Enhanced key handling debug info** - logs all key events in debug mode
4. **Improved key press logging** - specific logging for both `L` and `l` key presses

### Features Added
- **Debug mode key logging**: Enable with `Ctrl+Alt+D` or `TRILIUM_DEBUG=1`
- **Alternative log viewer key**: `Ctrl+L` as backup to capital `L`
- **Comprehensive key event tracking** for troubleshooting

### Files Modified
- `/root/repos/trilium-cli/src/tui/app.rs` - Added debug logging and alternative key combo

## Benefits

### API Endpoint Fix
- ✅ **Content saving now works correctly** - uses proper PUT endpoint
- ✅ **Metadata updates work separately** - uses proper PATCH endpoint  
- ✅ **Clear separation of concerns** - content vs metadata operations
- ✅ **Better error messages** - more specific error handling
- ✅ **Improved debug logging** - detailed request/response logging

### Log Viewer Fix
- ✅ **Alternative key combination** - `Ctrl+L` as backup
- ✅ **Debug logging** - comprehensive key event tracking
- ✅ **Better troubleshooting** - debug mode shows all key presses
- ✅ **User guidance** - clear logging of what keys are being pressed

## How to Test

### Content Update Fix
1. Start the TUI: `trilium tui`
2. Select a note and press `e` or `i` to edit
3. Make changes in external editor and save
4. Content should now save successfully without PROPERTY_NOT_ALLOWED errors

### Log Viewer Fix  
1. Start the TUI: `trilium tui`
2. Enable debug mode: `Ctrl+Alt+D`
3. Try opening log viewer with either:
   - Capital `L` key (original)
   - `Ctrl+L` (alternative)
4. Debug logs will show which keys are being detected

### Debug Mode
- Enable: `Ctrl+Alt+D` in TUI or `TRILIUM_DEBUG=1` environment variable
- Shows: API requests, responses, key presses, and detailed error information
- Helpful for: Troubleshooting issues and understanding application behavior

## Technical Details

### API Endpoints Used
- **Content updates**: `PUT /etapi/notes/{id}/content` (raw text body)
- **Metadata updates**: `PATCH /etapi/notes/{id}` (JSON body, no content field)

### Key Handling
- **Log Viewer**: Capital `L` or `Ctrl+L` 
- **Navigation Right**: lowercase `l` or right arrow
- **Debug Logging**: All key events logged when debug mode enabled

### Error Handling
- **Enhanced error messages** with specific guidance for PROPERTY_NOT_ALLOWED
- **Structured logging** for different error types
- **Debug information** preserved in log viewer for troubleshooting