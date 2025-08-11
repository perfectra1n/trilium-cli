/**
 * Main application state hook for TUI
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  InputMode, 
  ViewMode, 
  LogLevel,
  SplitPane,
  ContentFormat,
  type AppState, 
  type LogEntry, 
  type RecentNote,
  type BookmarkedNote,
  type FuzzySearchResult,
} from '../types/index.js';
import type { Note, NoteTreeItem } from '../../types/api.js';

const DEFAULT_STATE: AppState = {
  // Connection state
  isConnected: false,
  connectionError: null,
  
  // Navigation state
  currentMode: InputMode.Normal,
  viewMode: ViewMode.Tree,
  selectedIndex: 0,
  
  // Note data
  treeItems: [],
  currentNote: null,
  currentContent: null,
  contentFormat: null,
  
  // Search state
  searchQuery: '',
  searchResults: [],
  fuzzySearchQuery: '',
  fuzzySearchResults: [],
  fuzzySelectedIndex: 0,
  
  // Recent notes
  recentNotes: [],
  recentSelectedIndex: 0,
  
  // Bookmarks
  bookmarkedNotes: [],
  bookmarkSelectedIndex: 0,
  
  // Split view state
  splitPaneFocused: SplitPane.Left,
  splitRatio: 0.3,
  
  // Input state
  input: '',
  
  // Content scrolling
  contentScroll: 0,
  
  // Status and messages
  statusMessage: null,
  statusTimeout: null,
  
  // Debug logging
  logEntries: [],
  logScrollOffset: 0,
  logSelectedIndex: 0,
  debugMode: false,
};

export function useAppState() {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clear status message timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  // Connection state actions
  const setConnected = useCallback((connected: boolean, error?: string) => {
    setState(prev => ({
      ...prev,
      isConnected: connected,
      connectionError: error || null,
    }));
  }, []);

  // Mode and view actions
  const setInputMode = useCallback((mode: InputMode) => {
    setState(prev => ({
      ...prev,
      currentMode: mode,
      input: mode === InputMode.Normal ? '' : prev.input,
    }));
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setState(prev => ({
      ...prev,
      viewMode: mode,
      selectedIndex: 0, // Reset selection when changing views
    }));
  }, []);

  // Navigation actions
  const setSelectedIndex = useCallback((index: number) => {
    setState(prev => ({
      ...prev,
      selectedIndex: Math.max(0, index),
    }));
  }, []);

  const moveSelection = useCallback((delta: number) => {
    setState(prev => {
      const maxIndex = (() => {
        switch (prev.viewMode) {
          case ViewMode.Recent:
            return Math.max(0, prev.recentNotes.length - 1);
          case ViewMode.Bookmarks:
            return Math.max(0, prev.bookmarkedNotes.length - 1);
          case ViewMode.Search:
            return Math.max(0, prev.searchResults.length - 1);
          default:
            return Math.max(0, prev.treeItems.length - 1);
        }
      })();
      
      const newIndex = Math.max(0, Math.min(maxIndex, prev.selectedIndex + delta));
      return {
        ...prev,
        selectedIndex: newIndex,
      };
    });
  }, []);

  // Note data actions
  const setTreeItems = useCallback((items: NoteTreeItem[]) => {
    setState(prev => ({
      ...prev,
      treeItems: items,
    }));
  }, []);

  const setCurrentNote = useCallback((note: Note | null) => {
    setState(prev => ({
      ...prev,
      currentNote: note,
    }));
  }, []);

  const setCurrentContent = useCallback((content: string | null, format?: ContentFormat) => {
    setState(prev => ({
      ...prev,
      currentContent: content,
      contentFormat: format || prev.contentFormat,
      contentScroll: 0, // Reset scroll when content changes
    }));
  }, []);

  // Search actions
  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({
      ...prev,
      searchQuery: query,
    }));
  }, []);

  const setSearchResults = useCallback((results: Note[]) => {
    setState(prev => ({
      ...prev,
      searchResults: results,
      selectedIndex: 0, // Reset selection for new results
    }));
  }, []);

  const setFuzzySearchQuery = useCallback((query: string) => {
    setState(prev => ({
      ...prev,
      fuzzySearchQuery: query,
    }));
  }, []);

  const setFuzzySearchResults = useCallback((results: FuzzySearchResult[]) => {
    setState(prev => ({
      ...prev,
      fuzzySearchResults: results,
      fuzzySelectedIndex: 0,
    }));
  }, []);

  // Recent notes actions
  const addRecentNote = useCallback((note: RecentNote) => {
    setState(prev => {
      const filtered = prev.recentNotes.filter(r => r.noteId !== note.noteId);
      return {
        ...prev,
        recentNotes: [note, ...filtered].slice(0, 50), // Keep last 50
      };
    });
  }, []);

  // Bookmark actions
  const addBookmark = useCallback((note: BookmarkedNote) => {
    setState(prev => {
      const exists = prev.bookmarkedNotes.some(b => b.noteId === note.noteId);
      if (exists) return prev;
      
      return {
        ...prev,
        bookmarkedNotes: [note, ...prev.bookmarkedNotes],
      };
    });
  }, []);

  const removeBookmark = useCallback((ownerId: string) => {
    setState(prev => ({
      ...prev,
      bookmarkedNotes: prev.bookmarkedNotes.filter(b => b.noteId !== noteId),
    }));
  }, []);

  // Split view actions
  const setSplitPaneFocused = useCallback((pane: SplitPane) => {
    setState(prev => ({
      ...prev,
      splitPaneFocused: pane,
    }));
  }, []);

  const adjustSplitRatio = useCallback((delta: number) => {
    setState(prev => ({
      ...prev,
      splitRatio: Math.max(0.1, Math.min(0.9, prev.splitRatio + delta)),
    }));
  }, []);

  // Input actions
  const setInput = useCallback((input: string) => {
    setState(prev => ({
      ...prev,
      input,
    }));
  }, []);

  // Content scroll actions
  const scrollContent = useCallback((delta: number) => {
    setState(prev => ({
      ...prev,
      contentScroll: Math.max(0, prev.contentScroll + delta),
    }));
  }, []);

  // Status message actions
  const setStatusMessage = useCallback((message: string | null, timeoutMs = 5000) => {
    setState(prev => {
      // Clear existing timeout
      if (prev.statusTimeout) {
        clearTimeout(prev.statusTimeout);
      }
      
      let timeout: NodeJS.Timeout | null = null;
      if (message && timeoutMs > 0) {
        timeout = setTimeout(() => {
          setState(current => ({
            ...current,
            statusMessage: null,
            statusTimeout: null,
          }));
        }, timeoutMs);
      }
      
      return {
        ...prev,
        statusMessage: message,
        statusTimeout: timeout,
      };
    });
  }, []);

  // Debug logging actions
  const addLogEntry = useCallback((entry: LogEntry) => {
    setState(prev => ({
      ...prev,
      logEntries: [...prev.logEntries, entry].slice(-1000), // Keep last 1000 entries
    }));
  }, []);

  const clearLogEntries = useCallback(() => {
    setState(prev => ({
      ...prev,
      logEntries: [],
      logScrollOffset: 0,
      logSelectedIndex: 0,
    }));
  }, []);

  const toggleDebugMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      debugMode: !prev.debugMode,
    }));
  }, []);

  // Helper to log operations
  const logOperation = useCallback((level: LogLevel, operation: string, message: string) => {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      operation,
      message,
    };
    addLogEntry(entry);
  }, [addLogEntry]);

  return {
    // State
    state,
    
    // Connection actions
    setConnected,
    
    // Mode and view actions
    setInputMode,
    setViewMode,
    
    // Navigation actions
    setSelectedIndex,
    moveSelection,
    
    // Note data actions
    setTreeItems,
    setCurrentNote,
    setCurrentContent,
    
    // Search actions
    setSearchQuery,
    setSearchResults,
    setFuzzySearchQuery,
    setFuzzySearchResults,
    
    // Recent notes actions
    addRecentNote,
    
    // Bookmark actions
    addBookmark,
    removeBookmark,
    
    // Split view actions
    setSplitPaneFocused,
    adjustSplitRatio,
    
    // Input actions
    setInput,
    
    // Content scroll actions
    scrollContent,
    
    // Status message actions
    setStatusMessage,
    
    // Debug logging actions
    addLogEntry,
    clearLogEntries,
    toggleDebugMode,
    logOperation,
  };
}