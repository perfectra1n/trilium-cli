import type { Note, NoteWithContent, SearchResult } from '../types/api.js';

export type ViewMode = 'tree' | 'search' | 'viewer' | 'editor' | 'help';

export interface TreeItem {
  noteId: string;
  parentNoteId?: string;
  title: string;
  type: string;
  isProtected: boolean;
  children?: TreeItem[];
  hasChildren: boolean;
  isExpanded: boolean;
}

export interface AppState {
  viewMode: ViewMode;
  selectedNoteId: string | null;
  currentNote: NoteWithContent | null;
  treeItems: TreeItem[];
  searchResults: SearchResult[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  showHelp: boolean;
  showCreateDialog: boolean;
  showAttributeManager: boolean;
  showCommandPalette: boolean;
  expandedNodes: Set<string>;
  navigationHistory: string[];
  navigationIndex: number;
  statusMessage: string;
  lastAction: string | null;
  focusedIndex: number;
  flattenedItems: Array<{ item: TreeItem; level: number; noteId: string }>;
}

export interface NavigationState {
  currentIndex: number;
  totalItems: number;
  currentPath: string[];
}

export interface KeyBinding {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

export interface Command {
  id: string;
  name: string;
  shortcut?: string;
  action: () => void | Promise<void>;
  category?: string;
}

export interface NoteMetadata {
  noteId: string;
  title: string;
  type: string;
  dateCreated: string;
  dateModified: string;
  isProtected: boolean;
  attributes?: Array<{
    attributeId: string;
    name: string;
    value: string;
    type: string;
  }>;
}

export interface SearchOptions {
  query: string;
  searchType: 'fulltext' | 'attribute' | 'title';
  includeArchived: boolean;
  ancestorNoteId?: string;
  limit?: number;
}

export interface TUIConfig {
  theme: 'default' | 'dark' | 'light';
  showLineNumbers: boolean;
  wrapText: boolean;
  tabSize: number;
  vimMode: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
}

export interface NotificationMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  duration?: number;
  timestamp: Date;
}