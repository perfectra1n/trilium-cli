# Trilium CLI - Working TUI Demo

This document shows how to run the simplified but functional TUI that demonstrates core Trilium API integration.

## What Works

✅ **Simple TUI that compiles and runs**
✅ **TypeScript compilation without critical errors** 
✅ **React/Ink based terminal interface**
✅ **API client integration**
✅ **Note listing and content viewing**
✅ **Keyboard navigation**

## Quick Start

1. **Set up environment variables:**
   ```bash
   export TRILIUM_SERVER_URL="http://localhost:8080"
   export TRILIUM_API_TOKEN="your_api_token_here"
   ```

2. **Run the working TUI:**
   ```bash
   node dist/tui-simple.js
   ```

## Features

The simplified TUI includes:

- **Connection Management**: Connects to Trilium server using API token
- **Note List View**: Shows available notes with keyboard navigation
- **Note Content View**: Displays note content when selected
- **Keyboard Navigation**: 
  - `j/k` or arrow keys: Navigate up/down
  - `Enter/o`: Open selected note
  - `b/Esc`: Back to list
  - `q`: Quit
  - `?/h`: Help

## File Structure

- `src/tui-simple.tsx` - Simplified working TUI implementation
- `dist/tui-simple.js` - Compiled TUI ready to run
- `test-simple-tui.js` - Test script to verify TUI loads

## Architecture

The working TUI demonstrates:

1. **Clean API Integration**: Uses the TriliumClient class properly
2. **React/Ink Components**: Proper terminal UI components
3. **State Management**: Simple but effective state handling
4. **Error Handling**: Graceful error handling and user feedback
5. **TypeScript Compilation**: Compiles without critical errors

## What's Different from Complex TUI

The full TUI in `src/tui/` has more features but also more complexity:
- Advanced keyboard shortcuts
- Multiple view modes (tree, split, search)
- Complex state management hooks
- Debug logging and help systems
- Fuzzy search and bookmarks

The simplified TUI focuses on core functionality:
- Basic note listing
- Note content viewing  
- Simple navigation
- Clean, working codebase

This provides a solid foundation for building more advanced features.