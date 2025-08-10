# Debugging API Errors in Trilium CLI

This document explains how to use the enhanced debugging features to troubleshoot API errors, particularly the "PROPERTY_NOT_ALLOWED" error that can occur when updating notes.

## Quick Debug Mode

### In TUI Mode
1. Start the TUI: `trilium tui`
2. Press `Ctrl+Alt+D` to toggle debug mode
3. Try the operation that's causing errors
4. Debug information will be displayed in:
   - Status messages (more detailed)
   - stderr output (immediate)
   - ~/.trilium-debug.log file (persistent)

### Environment Variable
Set the debug environment variable before starting:
```bash
TRILIUM_DEBUG=1 trilium tui
```

### Full Debug Logging
For comprehensive logging to file:
```bash
RUST_LOG=debug trilium tui 2> trilium-debug.log
```

## Understanding the "PROPERTY_NOT_ALLOWED" Error

This error occurs when the UpdateNoteRequest contains invalid or read-only properties.

### Common Causes:
1. **Read-only fields**: Attempting to set `noteId`, `dateCreated`, `dateModified`, etc.
2. **Field naming**: Using incorrect camelCase (e.g., `noteType` instead of `type`)
3. **Invalid fields**: Including fields not accepted by the Trilium ETAPI
4. **Empty/null values**: Sending empty strings or null for required fields

### Debug Information Provided:
- **Request JSON**: Exact JSON payload being sent to the API
- **Field count**: Number of fields in the UpdateNoteRequest
- **Content length**: Size of content being updated
- **Full API response**: Complete error message from Trilium server
- **Error categorization**: Type of error for easier troubleshooting

### Valid UpdateNoteRequest Fields:
Only these fields should be included in update requests:
- `title` (string)
- `type` (string) - note the field name is "type", not "noteType"
- `mime` (string)
- `content` (string)
- `isProtected` (boolean)

## Debug Log Locations

1. **stderr**: Immediate output while using the TUI
2. **~/.trilium-debug.log**: Persistent log file (when debug mode is enabled)
3. **RUST_LOG file**: When using `RUST_LOG=debug trilium tui 2> file.log`

## Example Debug Output

When debug mode is enabled, you'll see output like:
```
[2024-01-01 12:00:00 UTC] Note Update Request: Sending UpdateNoteRequest for note abc123: field_count=1, content_length=150
[2024-01-01 12:00:00 UTC] Request JSON: {
  "content": "Updated note content"
}
[2024-01-01 12:00:01 UTC] Note Save Error: Note save failed - Note ID: abc123, Error: ValidationError("Property not allowed: ..."), Error Type: validation
```

## Troubleshooting Steps

1. **Enable debug mode** (Ctrl+Alt+D in TUI)
2. **Reproduce the error**
3. **Check the debug logs** for:
   - Request JSON payload
   - Full error message
   - API response details
4. **Verify the request contains only valid fields**
5. **Check field naming** (use "type" not "noteType", "isProtected" not "is_protected")
6. **Ensure no read-only fields** are included

## Advanced Debugging

For developers or advanced troubleshooting:

```bash
# Enable tracing for the API client specifically
RUST_LOG=trilium_cli::api=trace trilium tui

# Enable all debug logging
RUST_LOG=debug trilium tui

# Capture all logs to file
RUST_LOG=trace trilium tui 2>&1 | tee trilium-full-debug.log
```

## Common Solutions

### For "PROPERTY_NOT_ALLOWED" errors:
1. Remove any read-only fields from the request
2. Verify field names match the API specification exactly
3. Use the builder pattern: `UpdateNoteRequest::builder().content(content).build()`
4. Check that content is not empty if that's the only field being updated

### For truncated error messages:
1. Enable debug mode to see full error details
2. Check ~/.trilium-debug.log for complete messages
3. Use RUST_LOG=debug for comprehensive logging

## Reporting Issues

When reporting API errors, please include:
1. Full debug log output
2. The exact operation that failed
3. Your Trilium server version
4. The complete error message (not truncated)