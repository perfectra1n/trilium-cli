import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useApp, useInput, useStdin, useStdout } from 'ink';
import { TriliumClient } from '../api/client.js';
import { Config } from '../config/index.js';
import type { Note, NoteWithContent, Branch, SearchResult } from '../types/api.js';
import { TreeView } from './components/TreeView.js';
import { NoteViewer } from './components/NoteViewer.js';
import { NoteEditor } from './components/NoteEditor.js';
import { SearchPanel } from './components/SearchPanel.js';
import { StatusBar } from './components/StatusBar.js';
import { HelpPanel } from './components/HelpPanel.js';
import { CreateNoteDialog } from './components/CreateNoteDialog.js';
import { AttributeManager } from './components/AttributeManager.js';
import { CommandPalette } from './components/CommandPalette.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { LoadingIndicator, LoadingOverlay } from './components/LoadingIndicator.js';
import { useRetry } from './hooks/useRetry.js';
import type { AppState, ViewMode, NavigationState, KeyBinding } from './types.js';
import { useKeyBindings } from './hooks/useKeyBindings.js';
import { useNavigation } from './hooks/useNavigation.js';
import { useNoteOperations } from './hooks/useNoteOperations.js';

interface AppProps {
  config: Config;
}

export const App: React.FC<AppProps> = ({ config }) => {
  const { exit } = useApp();
  const { stdin, setRawMode } = useStdin();
  const { stdout } = useStdout();
  const profile = config.getCurrentProfile();
  
  // Initialize API client
  const client = useMemo(() => new TriliumClient({
    baseUrl: profile.serverUrl,
    apiToken: profile.apiToken,
    debugMode: false
  }), [profile.serverUrl, profile.apiToken]);
  
  // Enable mouse support in terminal (if supported)
  useEffect(() => {
    // Only enable mouse support if we're in a proper TTY environment
    if (!stdin || !stdout || !setRawMode || !stdin.isTTY || !stdout.isTTY) {
      return;
    }
    
    try {
      // Enable mouse reporting for better terminal interaction
      const enableMouseSupport = () => {
        // Enable mouse tracking
        stdout.write('\x1b[?1000h'); // Enable mouse reporting
        stdout.write('\x1b[?1002h'); // Enable mouse drag tracking
        stdout.write('\x1b[?1015h'); // Enable urxvt mouse mode
        stdout.write('\x1b[?1006h'); // Enable SGR mouse mode
      };
      
      const disableMouseSupport = () => {
        // Disable mouse tracking
        stdout.write('\x1b[?1000l');
        stdout.write('\x1b[?1002l');
        stdout.write('\x1b[?1015l');
        stdout.write('\x1b[?1006l');
      };
      
      enableMouseSupport();
      
      return () => {
        disableMouseSupport();
      };
    } catch (error) {
      // Silently ignore errors if mouse support can't be enabled
      console.debug('Mouse support not available:', error);
      return;
    }
  }, [stdin, stdout, setRawMode]);

  // Application state
  const [state, setState] = useState<AppState>({
    viewMode: 'tree',
    selectedNoteId: null,
    currentNote: null,
    treeItems: [],
    searchResults: [],
    searchQuery: '',
    isLoading: false,
    error: null,
    showHelp: false,
    showCreateDialog: false,
    showAttributeManager: false,
    showCommandPalette: false,
    expandedNodes: new Set(['root']),
    navigationHistory: [],
    navigationIndex: -1,
    statusMessage: 'Ready',
    lastAction: null,
    focusedIndex: 0,
    flattenedItems: []
  });

  // Navigation hooks
  const navigation = useNavigation(state, setState, client);
  
  // Note operations hooks
  const noteOps = useNoteOperations(client, state, setState);

  // Load initial tree structure
  useEffect(() => {
    loadTreeStructure();
  }, []);

  // Use retry mechanism for loading tree structure
  const treeRetry = useRetry(async () => {
    // Load root note and its children
    const rootNote = await client.getNote('root');
    const children = await client.getChildNotes('root');
    
    return {
      rootNote,
      children
    };
  }, {
    maxAttempts: 3,
    delay: 1000,
    onRetry: (attempt, error) => {
      setState(prev => ({
        ...prev,
        statusMessage: `Retrying connection (attempt ${attempt}/3)...`,
        error: error.message
      }));
    }
  });

  const loadTreeStructure = async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const result = await treeRetry.execute();
      
      if (result) {
        const { rootNote, children } = result;
        
        setState(prev => ({
          ...prev,
          treeItems: [{
            noteId: 'root',
            title: rootNote.title || 'Trilium Notes',
            type: rootNote.type,
            isProtected: rootNote.isProtected || false,
            children: children.map((child) => ({
              noteId: child.noteId,
              parentNoteId: 'root',
              title: child.title,
              type: child.type || 'text',
              isProtected: child.isProtected || false,
              hasChildren: true,
              isExpanded: false,
              children: []
            })),
            hasChildren: children.length > 0,
            isExpanded: true
          }],
          isLoading: false,
          error: null,
          statusMessage: 'Tree loaded successfully'
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load tree after multiple attempts'
      }));
    }
  };

  // View mode switching
  const switchViewMode = useCallback((mode: ViewMode) => {
    setState(prev => ({
      ...prev,
      viewMode: mode,
      statusMessage: `Switched to ${mode} view`
    }));
  }, []);

  // Search handler
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setState(prev => ({ ...prev, searchResults: [], searchQuery: '' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, searchQuery: query }));
    try {
      const results = await client.searchNotes(query, false, false);
      
      setState(prev => ({
        ...prev,
        searchResults: results,
        isLoading: false,
        viewMode: 'search',
        statusMessage: `Found ${results.length} results`
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Search failed'
      }));
    }
  }, [client]);

  // Note selection handler
  const selectNote = useCallback(async (noteId: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const note = await client.getNoteWithContent(noteId);
      
      // Update navigation history
      setState(prev => {
        const newHistory = [...prev.navigationHistory.slice(0, prev.navigationIndex + 1), noteId];
        return {
          ...prev,
          selectedNoteId: noteId,
          currentNote: note,
          navigationHistory: newHistory,
          navigationIndex: newHistory.length - 1,
          isLoading: false,
          viewMode: 'viewer',
          statusMessage: `Viewing: ${note.title}`
        };
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load note'
      }));
    }
  }, [client]);

  // Keyboard shortcuts
  const keyBindings: KeyBinding[] = [
    { key: 'q', ctrl: true, action: () => exit(), description: 'Quit application' },
    { key: 'h', action: () => setState(prev => ({ ...prev, showHelp: !prev.showHelp })), description: 'Toggle help' },
    { key: 'n', ctrl: true, action: () => setState(prev => ({ ...prev, showCreateDialog: true })), description: 'Create new note' },
    { key: '/', action: () => switchViewMode('search'), description: 'Search notes' },
    { key: 't', action: () => switchViewMode('tree'), description: 'Tree view' },
    { key: 'v', action: () => state.selectedNoteId && switchViewMode('viewer'), description: 'View note' },
    { key: 'e', action: () => state.selectedNoteId && switchViewMode('editor'), description: 'Edit note' },
    { key: 'a', action: () => setState(prev => ({ ...prev, showAttributeManager: true })), description: 'Manage attributes' },
    { key: 'p', ctrl: true, action: () => setState(prev => ({ ...prev, showCommandPalette: true })), description: 'Command palette' },
    { key: '[', action: () => navigation.goBack(), description: 'Navigate back' },
    { key: ']', action: () => navigation.goForward(), description: 'Navigate forward' },
    { key: 'r', ctrl: true, action: () => loadTreeStructure(), description: 'Refresh tree' },
  ];

  useKeyBindings(keyBindings, state);

  // Main input handler for vim-like navigation
  useInput((input, key) => {
    // Global shortcuts
    if (input === 'q' && key.ctrl) {
      exit();
    }
    
    // Vim-like navigation in tree/list views
    if (state.viewMode === 'tree' || state.viewMode === 'search') {
      if (input === 'j' || key.downArrow) {
        navigation.moveDown();
      } else if (input === 'k' || key.upArrow) {
        navigation.moveUp();
      } else if (input === 'l' || key.rightArrow) {
        navigation.expandNode();
      } else if (input === 'h' || key.leftArrow) {
        navigation.collapseNode();
      } else if (key.return) {
        navigation.selectFocusedItem();
      }
    }
    
    // Editor mode shortcuts
    if (state.viewMode === 'editor') {
      if (key.escape) {
        switchViewMode('viewer');
      }
    }
  });

  // Render main layout
  return (
    <ErrorBoundary>

    <Box flexDirection="column" height="100%">
      {/* Main content area */}
      <Box flexGrow={1} flexDirection="row">
        {/* Left panel - Tree or Search Results */}
        <Box width="30%" borderStyle="single" flexDirection="column">
          <LoadingOverlay isLoading={state.isLoading && state.treeItems.length === 0} message="Loading tree structure...">
            {state.viewMode === 'search' ? (
              <SearchPanel
                results={state.searchResults}
                query={state.searchQuery}
                selectedId={state.selectedNoteId}
                onSelect={selectNote}
                onSearch={handleSearch}
              />
            ) : (
              <TreeView
                items={state.treeItems}
                selectedId={state.selectedNoteId}
                expandedNodes={state.expandedNodes}
                onSelect={selectNote}
                onToggleExpand={navigation.toggleNode}
                isLoading={state.isLoading && state.treeItems.length > 0}
                focusedIndex={state.focusedIndex}
                flattenedItems={state.flattenedItems}
              />
            )}
          </LoadingOverlay>
        </Box>

        {/* Right panel - Note viewer/editor */}
        <Box width="70%" borderStyle="single" flexDirection="column">
          {state.currentNote ? (
            state.viewMode === 'editor' ? (
              <ErrorBoundary>
                <NoteEditor
                  note={state.currentNote}
                  client={client}
                  onSave={(updatedNote) => {
                    setState(prev => ({
                      ...prev,
                      currentNote: updatedNote,
                      statusMessage: 'Note saved successfully'
                    }));
                  }}
                  onCancel={() => switchViewMode('viewer')}
                  onExit={() => switchViewMode('viewer')}
                />
              </ErrorBoundary>
            ) : (
              <NoteViewer
                note={state.currentNote}
                onEdit={() => switchViewMode('editor')}
                onRefresh={() => state.selectedNoteId && selectNote(state.selectedNoteId)}
              />
            )
          ) : (
            <Box padding={1} justifyContent="center" alignItems="center" flexGrow={1}>
              {state.isLoading ? (
                <LoadingIndicator message="Loading note..." />
              ) : (
                <Text dimColor>Select a note to view its content</Text>
              )}
            </Box>
          )}
        </Box>
      </Box>

      {/* Status bar */}
      <StatusBar
        mode={state.viewMode}
        message={state.statusMessage}
        noteTitle={state.currentNote?.title}
        isLoading={state.isLoading}
        error={state.error}
      />

      {/* Overlays */}
      {state.showHelp && (
        <HelpPanel
          keyBindings={keyBindings}
          onClose={() => setState(prev => ({ ...prev, showHelp: false }))}
        />
      )}

      {state.showCreateDialog && (
        <CreateNoteDialog
          client={client}
          parentNoteId={state.selectedNoteId || 'root'}
          onClose={() => setState(prev => ({ ...prev, showCreateDialog: false }))}
          onCreated={(noteId) => {
            setState(prev => ({ ...prev, showCreateDialog: false }));
            void selectNote(noteId);
            void loadTreeStructure();
          }}
        />
      )}

      {state.showAttributeManager && state.currentNote && (
        <AttributeManager
          client={client}
          noteId={state.currentNote.noteId}
          onClose={() => setState(prev => ({ ...prev, showAttributeManager: false }))}
        />
      )}

      {state.showCommandPalette && (
        <CommandPalette
          onCommand={(cmd) => {
            // Handle command execution
            setState(prev => ({ ...prev, showCommandPalette: false }));
          }}
          onClose={() => setState(prev => ({ ...prev, showCommandPalette: false }))}
        />
      )}
    </Box>
    </ErrorBoundary>
  );
};