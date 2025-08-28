/**
 * @trilium-cli/tui - Terminal User Interface for Trilium
 * 
 * This package provides React/Ink-based TUI components for
 * interacting with all Trilium ETAPI endpoints.
 */

// Export API client
export { ETAPIClient } from './api/client.js';
export type { ApiConfig } from './api/client.js';

// Export types
export * from './types.js';

// Export components (when they're properly adapted)
// These will need to be updated to use the new ETAPIClient
// export { App } from './components/App.js';
// export { TreeView } from './components/TreeView.js';
// export { NoteViewer } from './components/NoteViewer.js';
// export { NoteEditor } from './components/NoteEditor.js';
// export { SearchPanel } from './components/SearchPanel.js';
// export { StatusBar } from './components/StatusBar.js';
// export { HelpPanel } from './components/HelpPanel.js';
// export { CreateNoteDialog } from './components/CreateNoteDialog.js';
// export { AttributeManager } from './components/AttributeManager.js';
// export { CommandPalette } from './components/CommandPalette.js';
// export { ErrorBoundary } from './components/ErrorBoundary.js';
// export { LoadingIndicator, LoadingOverlay } from './components/LoadingIndicator.js';

// Export hooks (when they're properly adapted)
// export { useKeyBindings } from './hooks/useKeyBindings.js';
// export { useNavigation } from './hooks/useNavigation.js';
// export { useNoteOperations } from './hooks/useNoteOperations.js';
// export { useRetry } from './hooks/useRetry.js';

// Export utility functions for TUI operations
export * from './utils/index.js';