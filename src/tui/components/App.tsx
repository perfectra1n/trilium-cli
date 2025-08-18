import * as fuzzy from 'fuzzy';
import { Box, Text, useApp } from 'ink';
import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { TriliumClient } from '../../api/client.js';
import type { Config } from '../../config/index.js';
import type { GlobalOptions } from '../../types/cli.js';
import { useAppState, useKeyboard, useApi } from '../hooks/index.js';
import type { KeyboardHandlers } from '../hooks/index.js';
import { 
  InputMode, 
  ViewMode, 
  LogLevel, 
  SplitPane,
  ContentFormat,
  type FuzzySearchResult,
  type RecentNote,
  type BookmarkedNote,
} from '../types/index.js';

import { ContentView } from './ContentView.js';
import { InputModal } from './InputModal.js';
import { SearchView } from './SearchView.js';
import { SplitView } from './SplitView.js';
import { StatusBar } from './StatusBar.js';
import { TreeView } from './TreeView.js';

interface AppProps {
  config: Config;
  options: GlobalOptions;
}

export function App({ config, options }: AppProps): JSX.Element {
  const { exit } = useApp();
  
  // Initialize API client
  const [client, setClient] = useState<TriliumClient | null>(null);
  
  // Initialize app state
  const {
    state,
    setConnected,
    setInputMode,
    setViewMode,
    setSelectedIndex,
    moveSelection,
    setTreeItems,
    setCurrentNote,
    setCurrentContent,
    setSearchQuery,
    setSearchResults,
    setFuzzySearchQuery,
    setFuzzySearchResults,
    addRecentNote,
    addBookmark,
    removeBookmark,
    setSplitPaneFocused,
    adjustSplitRatio,
    setInput,
    scrollContent,
    setStatusMessage,
    addLogEntry,
    clearLogEntries,
    toggleDebugMode,
    logOperation,
  } = useAppState();
  
  // Initialize API operations
  const api = useApi({
    client: client!,
    onLogOperation: logOperation,
    debugMode: state.debugMode,
  });

  // Initialize connection
  useEffect(() => {
    const initializeConnection = async () => {
      try {
        const profile = config.getCurrentProfile();
        const triliumClient = new TriliumClient({
          baseUrl: profile.serverUrl,
          apiToken: profile.apiToken || '',
          debugMode: state.debugMode,
        });
        
        setClient(triliumClient);
        
        // Test connection
        await triliumClient.testConnection();
        setConnected(true);
        setStatusMessage('Connected to Trilium server', 3000);
        
        // Load initial data
        const treeItems = await api.loadNoteTree();
        setTreeItems(treeItems);
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setConnected(false, errorMessage);
        setStatusMessage(`Connection failed: ${errorMessage}`, 0);
      }
    };

    initializeConnection();
  }, [config, state.debugMode]);

  // Load note content when selection changes
  const loadSelectedNote = useCallback(async () => {
    if (!api || !state.isConnected) return;
    
    const getSelectedItem = () => {
      switch (state.viewMode) {
        case ViewMode.Recent:
          return state.recentNotes[state.selectedIndex];
        case ViewMode.Bookmarks:
          return state.bookmarkedNotes[state.selectedIndex];
        case ViewMode.Search:
          return state.searchResults[state.selectedIndex];
        default:
          return getVisibleTreeItems()[state.selectedIndex];
      }
    };
    
    const selectedItem = getSelectedItem();
    if (!selectedItem) return;
    
    try {
      let noteId: string;
      
      if ('noteId' in selectedItem) {
        noteId = selectedItem.noteId;
      } else if ('note' in selectedItem) {
        noteId = selectedItem.note.noteId;
      } else {
        return;
      }
      
      const [note, content] = await Promise.all([
        api.loadNote(noteId),
        api.loadNoteContent(noteId),
      ]);
      
      setCurrentNote(note);
      setCurrentContent(content, detectContentFormat(note, content));
      
      // Add to recent notes
      addRecentNote({
        ownerId: note.noteId,
        title: note.title,
        accessedAt: new Date(),
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load note';
      setStatusMessage(`Error loading note: ${errorMessage}`, 5000);
    }
  }, [api, state.isConnected, state.viewMode, state.selectedIndex]);

  // Get visible tree items (flattened for navigation)
  const getVisibleTreeItems = useCallback(() => {
    const items: any[] = [];
    
    function collectVisible(treeItems: any[], depth = 0) {
      for (const item of treeItems) {
        items.push({ ...item, depth });
        if (item.isExpanded && item.children?.length > 0) {
          collectVisible(item.children, depth + 1);
        }
      }
    }
    
    collectVisible(state.treeItems);
    return items;
  }, [state.treeItems]);

  // Fuzzy search implementation
  const performFuzzySearch = useCallback((query: string) => {
    if (!query.trim()) {
      setFuzzySearchResults([]);
      return;
    }
    
    const allItems = getVisibleTreeItems();
    const results: FuzzySearchResult[] = [];
    
    for (const item of allItems) {
      const match = fuzzy.filter(query, [item.note?.title || '']);
      if (match.length > 0) {
        results.push({
          item,
          score: match[0]?.score || 0,
          indices: match[0]?.original ? [] : [], // Simplified for now
        });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    setFuzzySearchResults(results.slice(0, 50)); // Limit results
  }, [getVisibleTreeItems, setFuzzySearchResults]);

  // Keyboard handlers
  const keyboardHandlers: KeyboardHandlers = useMemo(() => ({
    // Navigation
    onMoveUp: () => moveSelection(-1),
    onMoveDown: () => moveSelection(1),
    onMoveLeft: () => {
      if (state.viewMode === ViewMode.Split && state.splitPaneFocused === SplitPane.Right) {
        setSplitPaneFocused(SplitPane.Left);
      }
    },
    onMoveRight: () => {
      if (state.viewMode === ViewMode.Split && state.splitPaneFocused === SplitPane.Left) {
        setSplitPaneFocused(SplitPane.Right);
      }
    },
    onMoveTop: () => setSelectedIndex(0),
    onMoveBottom: () => {
      const maxIndex = (() => {
        switch (state.viewMode) {
          case ViewMode.Recent:
            return state.recentNotes.length - 1;
          case ViewMode.Bookmarks:
            return state.bookmarkedNotes.length - 1;
          case ViewMode.Search:
            return state.searchResults.length - 1;
          default:
            return getVisibleTreeItems().length - 1;
        }
      })();
      setSelectedIndex(Math.max(0, maxIndex));
    },
    
    // Selection and interaction
    onSelect: () => loadSelectedNote(),
    onExpand: () => {}, // TODO: Implement
    onCollapse: () => {}, // TODO: Implement
    
    // Mode switching
    onSwitchView: () => {
      const modes = [ViewMode.Tree, ViewMode.Content, ViewMode.Attributes, ViewMode.Search];
      const currentIndex = modes.indexOf(state.viewMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      setViewMode(modes[nextIndex]!);
    },
    onSwitchViewReverse: () => {
      const modes = [ViewMode.Tree, ViewMode.Content, ViewMode.Attributes, ViewMode.Search];
      const currentIndex = modes.indexOf(state.viewMode);
      const prevIndex = (currentIndex - 1 + modes.length) % modes.length;
      setViewMode(modes[prevIndex]!);
    },
    onToggleSplitView: () => {
      setViewMode(state.viewMode === ViewMode.Split ? ViewMode.Tree : ViewMode.Split);
    },
    onToggleHelp: () => {
      setInputMode(state.currentMode === InputMode.Help ? InputMode.Normal : InputMode.Help);
    },
    
    // Search
    onStartSearch: () => {
      setInputMode(InputMode.Search);
      setInput('');
    },
    onStartFuzzySearch: () => {
      setInputMode(InputMode.FuzzySearch);
      setFuzzySearchQuery('');
      setInput('');
    },
    onNextSearchResult: () => {}, // TODO: Implement
    onPrevSearchResult: () => {}, // TODO: Implement
    
    // Input modes
    onStartCommand: () => {
      setInputMode(InputMode.Command);
      setInput('');
    },
    onStartEdit: () => {
      setStatusMessage('External editor integration not yet implemented', 3000);
    },
    
    // Content operations
    onRefresh: async () => {
      if (!api) return;
      try {
        const treeItems = await api.refreshNoteTree();
        setTreeItems(treeItems);
        setStatusMessage('Tree refreshed', 2000);
      } catch (err) {
        setStatusMessage('Failed to refresh tree', 3000);
      }
    },
    onScrollUp: () => scrollContent(-5),
    onScrollDown: () => scrollContent(5),
    
    // Bookmarks and recent
    onToggleBookmark: () => {
      if (!state.currentNote) return;
      
      const isBookmarked = state.bookmarkedNotes.some(b => b.ownerId === state.currentNote!.noteId);
      
      if (isBookmarked) {
        removeBookmark(state.currentNote.noteId);
        setStatusMessage('Bookmark removed', 2000);
      } else {
        addBookmark({
          ownerId: state.currentNote.noteId,
          title: state.currentNote.title,
          bookmarkedAt: new Date(),
        });
        setStatusMessage('Bookmark added', 2000);
      }
    },
    onShowRecent: () => setViewMode(ViewMode.Recent),
    onShowBookmarks: () => setViewMode(ViewMode.Bookmarks),
    
    // Split view
    onSwitchPane: () => {
      setSplitPaneFocused(
        state.splitPaneFocused === SplitPane.Left ? SplitPane.Right : SplitPane.Left
      );
    },
    onResizePaneLeft: () => adjustSplitRatio(-0.05),
    onResizePaneRight: () => adjustSplitRatio(0.05),
    
    // Debug
    onToggleDebug: () => {
      toggleDebugMode();
      setStatusMessage(`Debug mode ${!state.debugMode ? 'enabled' : 'disabled'}`, 3000);
    },
    onShowLogs: () => setInputMode(InputMode.LogViewer),
    onClearLogs: () => {
      clearLogEntries();
      setStatusMessage('Log entries cleared', 2000);
    },
    
    // General
    onEscape: () => {
      if (state.currentMode !== InputMode.Normal) {
        setInputMode(InputMode.Normal);
        setInput('');
      } else {
        setViewMode(ViewMode.Tree);
      }
    },
    onQuit: () => {
      exit();
    },
    
    // Input handling
    onTextInput: (input: string) => {
      const newInput = state.input + input;
      setInput(newInput);
      
      // Real-time fuzzy search
      if (state.currentMode === InputMode.FuzzySearch) {
        setFuzzySearchQuery(newInput);
        performFuzzySearch(newInput);
      }
    },
    onSubmitInput: async () => {
      const input = state.input.trim();
      
      switch (state.currentMode) {
        case InputMode.Search:
          if (api && input) {
            try {
              const results = await api.searchNotes(input);
              setSearchResults(results);
              setViewMode(ViewMode.Search);
              setStatusMessage(`Found ${results.length} results`, 3000);
            } catch (err) {
              setStatusMessage('Search failed', 3000);
            }
          }
          break;
          
        case InputMode.FuzzySearch:
          // Select current fuzzy search result
          if (state.fuzzySearchResults.length > 0) {
            const selected = state.fuzzySearchResults[state.fuzzySelectedIndex || 0];
            if (selected) {
              // Load the selected note
              setCurrentNote(selected.item.note);
              loadSelectedNote();
            }
          }
          break;
          
        case InputMode.Command:
          // Handle command
          setStatusMessage(`Command not implemented: ${input}`, 3000);
          break;
      }
      
      setInputMode(InputMode.Normal);
      setInput('');
    },
    onClearInput: () => {
      const newInput = state.input.slice(0, -1);
      setInput(newInput);
      
      // Real-time fuzzy search
      if (state.currentMode === InputMode.FuzzySearch) {
        setFuzzySearchQuery(newInput);
        performFuzzySearch(newInput);
      }
    },
  }), [state, api, exit, moveSelection, setSelectedIndex, setInputMode, setViewMode, loadSelectedNote, getVisibleTreeItems]);

  // Set up keyboard handling
  useKeyboard({
    currentMode: state.currentMode,
    viewMode: state.viewMode,
    splitPane: state.splitPaneFocused,
    handlers: keyboardHandlers,
    disabled: !state.isConnected,
  });

  // Render loading state
  if (!state.isConnected && !state.connectionError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Trilium CLI - Terminal User Interface
          </Text>
        </Box>
        <Box>
          <Text>Connecting to Trilium server...</Text>
        </Box>
      </Box>
    );
  }

  // Render error state
  if (state.connectionError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Trilium CLI - Terminal User Interface
          </Text>
        </Box>
        <Box flexDirection="column">
          <Text color="red">✗ Connection failed</Text>
          <Text color="red">Error: {state.connectionError}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press Ctrl+C to exit</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Render main TUI interface
  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Title bar */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          Trilium CLI - {getViewModeTitle(state.viewMode)}
          {state.currentMode === InputMode.FuzzySearch && ' [SEARCHING]'}
        </Text>
      </Box>
      
      {/* Main content area */}
      <Box flexGrow={1}>
        {state.viewMode === ViewMode.Split ? (
          <SplitView
            treeItems={state.treeItems}
            selectedIndex={state.selectedIndex}
            currentNote={state.currentNote}
            currentContent={state.currentContent}
            contentScroll={state.contentScroll}
            splitRatio={state.splitRatio}
            focusedPane={state.splitPaneFocused}
          />
        ) : (
          <Box flexDirection="row" height="100%">
            {/* Tree panel */}
            <Box width="30%" borderStyle="single" borderColor="white">
              <TreeView
                items={getVisibleTreeItems()}
                selectedIndex={state.selectedIndex}
                bookmarkedNotes={state.bookmarkedNotes}
              />
            </Box>
            
            {/* Content panel */}
            <Box flexGrow={1} borderStyle="single" borderColor="white">
              {state.viewMode === ViewMode.Search ? (
                <SearchView
                  results={state.searchResults}
                  query={state.searchQuery}
                  selectedIndex={state.selectedIndex}
                />
              ) : (
                <ContentView
                  note={state.currentNote}
                  content={state.currentContent}
                  contentScroll={state.contentScroll}
                  viewMode={state.viewMode}
                  recentNotes={state.recentNotes}
                  bookmarkedNotes={state.bookmarkedNotes}
                  selectedIndex={state.selectedIndex}
                />
              )}
            </Box>
          </Box>
        )}
      </Box>
      
      {/* Status bar */}
      <StatusBar
        mode={state.currentMode}
        viewMode={state.viewMode}
        statusMessage={state.statusMessage}
        debugMode={state.debugMode}
      />
      
      {/* Input modals */}
      {(state.currentMode === InputMode.Search || 
        state.currentMode === InputMode.Command || 
        state.currentMode === InputMode.Editing) && (
        <InputModal
          mode={state.currentMode}
          input={state.input}
        />
      )}
      
      {/* Fuzzy search modal */}
      {state.currentMode === InputMode.FuzzySearch && (
        <InputModal
          mode={state.currentMode}
          input={state.fuzzySearchQuery}
          searchResults={state.fuzzySearchResults}
          selectedIndex={state.fuzzySelectedIndex}
        />
      )}
      
      {/* Help modal */}
      {state.currentMode === InputMode.Help && (
        <HelpModal />
      )}
      
      {/* Log viewer modal */}
      {state.currentMode === InputMode.LogViewer && (
        <LogViewerModal
          logEntries={state.logEntries}
          selectedIndex={state.logSelectedIndex}
          scrollOffset={state.logScrollOffset}
        />
      )}
    </Box>
  );
}

// Helper functions
function getViewModeTitle(mode: ViewMode): string {
  switch (mode) {
    case ViewMode.Tree:
      return 'Tree View';
    case ViewMode.Content:
      return 'Note Content';
    case ViewMode.Attributes:
      return 'Attributes';
    case ViewMode.Search:
      return 'Search Results';
    case ViewMode.Recent:
      return 'Recent Notes';
    case ViewMode.Bookmarks:
      return 'Bookmarked Notes';
    case ViewMode.Split:
      return 'Split View';
    case ViewMode.LogViewer:
      return 'Log Viewer';
    default:
      return 'Unknown';
  }
}

function detectContentFormat(note: any, content: string): ContentFormat {
  // Check MIME type first
  if (note.mime) {
    if (note.mime.includes('html')) return ContentFormat.Html;
    if (note.mime.includes('markdown')) return ContentFormat.Markdown;
  }
  
  // Analyze content
  if (looksLikeHtml(content)) return ContentFormat.Html;
  if (looksLikeMarkdown(content)) return ContentFormat.Markdown;
  
  return ContentFormat.PlainText;
}

function looksLikeHtml(content: string): boolean {
  const htmlTags = /<\/?[a-z][\s\S]*>/i;
  return htmlTags.test(content);
}

function looksLikeMarkdown(content: string): boolean {
  const mdPatterns = [
    /^#+\s/, // Headers
    /\*\*.*\*\*/, // Bold
    /__.*__/, // Bold
    /\*.*\*/, // Italic
    /_.*_/, // Italic
    /```/, // Code blocks
    /^[-*+]\s/m, // Lists
    /^\d+\.\s/m, // Numbered lists
    /\[.*\]\(.*\)/, // Links
  ];
  
  return mdPatterns.some(pattern => pattern.test(content));
}

// Temporary placeholder components - will be implemented separately
function HelpModal() {
  return (
    <Box 
      borderStyle="single" 
      borderColor="yellow"
      padding={1}
    >
      <Text>Help modal - TODO: Implement full help system</Text>
    </Box>
  );
}

function LogViewerModal({ logEntries }: { logEntries: any[], selectedIndex: number, scrollOffset: number }) {
  return (
    <Box 
      borderStyle="single" 
      borderColor="yellow"
      padding={1}
    >
      <Text>Log Viewer - {logEntries.length} entries</Text>
    </Box>
  );
}