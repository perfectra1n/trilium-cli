/**
 * TUI-specific types and interfaces
 * Based on the Rust TUI implementation
 */

import type { EntityId, Note, NoteTreeItem } from '../../types/api.js';

/**
 * Input modes for TUI interaction
 */
export enum InputMode {
  Normal = 'Normal',
  Editing = 'Editing', 
  Search = 'Search',
  FuzzySearch = 'FuzzySearch',
  Command = 'Command',
  Help = 'Help',
  LogViewer = 'LogViewer',
}

/**
 * View modes for different TUI screens
 */
export enum ViewMode {
  Tree = 'Tree',
  Content = 'Content',
  Attributes = 'Attributes',
  Search = 'Search',
  Recent = 'Recent',
  Bookmarks = 'Bookmarks',
  Split = 'Split',
  LogViewer = 'LogViewer',
}

/**
 * Split pane focus states
 */
export enum SplitPane {
  Left = 'Left',
  Right = 'Right',
}

/**
 * Log levels for debug logging
 */
export enum LogLevel {
  Debug = 'Debug',
  Info = 'Info',
  Warn = 'Warn',
  Error = 'Error',
}

/**
 * Log entry for debug viewer
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  operation: string;
  message: string;
}

/**
 * Fuzzy search result with match information
 */
export interface FuzzySearchResult {
  item: NoteTreeItem;
  score: number;
  indices: number[];
}

/**
 * Recent note entry
 */
export interface RecentNote {
  ownerId: EntityId;
  title: string;
  accessedAt: Date;
}

/**
 * Bookmarked note entry
 */
export interface BookmarkedNote {
  ownerId: EntityId;
  title: string;
  bookmarkedAt: Date;
}

/**
 * Content format detection
 */
export enum ContentFormat {
  Html = 'Html',
  Markdown = 'Markdown', 
  PlainText = 'PlainText',
}

/**
 * Content conversion result
 */
export interface ContentConversionResult {
  content: string;
  originalFormat: ContentFormat;
  editingFormat: ContentFormat;
}

/**
 * Application state for TUI
 */
export interface AppState {
  // Connection state
  isConnected: boolean;
  connectionError: string | null;
  
  // Navigation state
  currentMode: InputMode;
  viewMode: ViewMode;
  selectedIndex: number;
  
  // Note data
  treeItems: NoteTreeItem[];
  currentNote: Note | null;
  currentContent: string | null;
  contentFormat: ContentFormat | null;
  
  // Search state
  searchQuery: string;
  searchResults: Note[];
  fuzzySearchQuery: string;
  fuzzySearchResults: FuzzySearchResult[];
  fuzzySelectedIndex: number;
  
  // Recent notes
  recentNotes: RecentNote[];
  recentSelectedIndex: number;
  
  // Bookmarks
  bookmarkedNotes: BookmarkedNote[];
  bookmarkSelectedIndex: number;
  
  // Split view state
  splitPaneFocused: SplitPane;
  splitRatio: number;
  
  // Input state
  input: string;
  
  // Content scrolling
  contentScroll: number;
  
  // Status and messages
  statusMessage: string | null;
  statusTimeout: NodeJS.Timeout | null;
  
  // Debug logging
  logEntries: LogEntry[];
  logScrollOffset: number;
  logSelectedIndex: number;
  debugMode: boolean;
}

/**
 * Keyboard shortcut definition
 */
export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  description: string;
  handler: () => void | Promise<void>;
  modes?: InputMode[];
}

/**
 * TUI configuration options
 */
export interface TuiConfig {
  // Editor settings
  externalEditor?: string;
  
  // Search settings
  fuzzySearchLimit: number;
  searchContextLines: number;
  
  // Display settings
  defaultSplitRatio: number;
  statusMessageTimeout: number;
  
  // Debug settings
  maxLogEntries: number;
  enableApiLogging: boolean;
}

/**
 * Component props for main App component
 */
export interface AppComponentProps {
  config: any; // Import from config module
  options: any; // Import from cli types
}

/**
 * Tree navigation context
 */
export interface TreeNavigationContext {
  selectedIndex: number;
  treeItems: NoteTreeItem[];
  expandedItems: Set<EntityId>;
  setSelectedIndex: (index: number) => void;
  toggleExpanded: (ownerId: EntityId) => void;
  loadNote: (ownerId: EntityId) => Promise<void>;
}

/**
 * Search context
 */
export interface SearchContext {
  query: string;
  results: Note[];
  selectedIndex: number;
  isLoading: boolean;
  performSearch: (query: string) => Promise<void>;
  clearSearch: () => void;
}

/**
 * Editor context for external editor integration
 */
export interface EditorContext {
  isEditing: boolean;
  editingNoteId: EntityId | null;
  openInEditor: (ownerId: EntityId) => Promise<void>;
  closeEditor: () => void;
}