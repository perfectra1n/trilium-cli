/**
 * TUI-specific types
 */

import type {
  EntityId,
  Note,
  Branch,
  Attribute,
  Attachment
} from '@trilium-cli/zod';

export type ViewMode = 'tree' | 'search' | 'editor' | 'viewer' | 'calendar' | 'inbox';

export interface NavigationState {
  history: EntityId[];
  currentIndex: number;
}

export interface TreeItem {
  id: EntityId;
  noteId: EntityId;  // Added for compatibility
  title: string;
  type: string;
  hasChildren: boolean;
  depth: number;
  parentId: EntityId | null;
  isExpanded?: boolean;
  isProtected?: boolean;
  children?: TreeItem[];  // Added for nested tree structure
  item?: TreeItem;  // Added for flattened structure
  parentNoteId?: EntityId;  // For compatibility with navigation
}

export interface SearchResult extends Note {
  excerpt?: string;
  matchCount?: number;
  score?: number;
}

export interface AppState {
  viewMode: ViewMode;
  selectedNoteId: EntityId | null;
  currentNote: Note | null;
  treeItems: TreeItem[];
  searchResults: SearchResult[];
  searchQuery: string;
  isLoading: boolean;
  error: string | null;
  showHelp: boolean;
  showCreateDialog: boolean;
  showAttributeManager: boolean;
  showCommandPalette: boolean;
  showAttachmentManager: boolean;
  showCalendar: boolean;
  expandedNodes: Set<string>;
  navigationHistory: EntityId[];
  navigationIndex: number;
  statusMessage: string;
  lastAction: string | null;
  focusedIndex: number;
  flattenedItems: Array<{ item: TreeItem; level: number; noteId: string }>;
  currentDate?: string;
  calendarView?: 'day' | 'week' | 'month' | 'year';
}

export interface KeyBinding {
  key: string;
  action: string | (() => void);
  description: string;
  context?: ViewMode | 'global';
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface Command {
  id: string;
  name: string;
  description?: string;
  shortcut?: string;
  category?: string;
  action: () => void | Promise<void>;
  isEnabled?: () => boolean;
}

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface EditorState {
  content: string;
  isDirty: boolean;
  cursorPosition: number;
  selection?: {
    start: number;
    end: number;
  };
}

export interface AttachmentListItem extends Attachment {
  isSelected?: boolean;
  downloadProgress?: number;
}

export interface CalendarEvent {
  noteId: EntityId;
  title: string;
  date: string;
  time?: string;
  type: 'task' | 'event' | 'reminder';
}