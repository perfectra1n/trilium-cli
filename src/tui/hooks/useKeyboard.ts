/**
 * Keyboard handling hook for TUI navigation
 */

import { useInput } from 'ink';
import { useCallback } from 'react';

import type { ViewMode, SplitPane } from '../types/index.js';
import { InputMode } from '../types/index.js';

export interface KeyboardHandlers {
  // Navigation
  onMoveUp: () => void;
  onMoveDown: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onMoveTop: () => void;
  onMoveBottom: () => void;
  
  // Selection and interaction
  onSelect: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  
  // Mode switching
  onSwitchView: () => void;
  onSwitchViewReverse: () => void;
  onToggleSplitView: () => void;
  onToggleHelp: () => void;
  
  // Search
  onStartSearch: () => void;
  onStartFuzzySearch: () => void;
  onNextSearchResult: () => void;
  onPrevSearchResult: () => void;
  
  // Input modes
  onStartCommand: () => void;
  onStartEdit: () => void;
  
  // Content operations
  onRefresh: () => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
  
  // Bookmarks and recent
  onToggleBookmark: () => void;
  onShowRecent: () => void;
  onShowBookmarks: () => void;
  
  // Split view
  onSwitchPane: () => void;
  onResizePaneLeft: () => void;
  onResizePaneRight: () => void;
  
  // Debug
  onToggleDebug: () => void;
  onShowLogs: () => void;
  onClearLogs: () => void;
  
  // General
  onEscape: () => void;
  onQuit: () => void;
  
  // Input handling for text input modes
  onTextInput: (input: string) => void;
  onSubmitInput: () => void;
  onClearInput: () => void;
}

export interface UseKeyboardOptions {
  currentMode: InputMode;
  viewMode: ViewMode;
  splitPane?: SplitPane;
  handlers: KeyboardHandlers;
  disabled?: boolean;
}

export function useKeyboard({ currentMode, viewMode, handlers, disabled = false }: UseKeyboardOptions) {
  
  useInput(useCallback((input, key) => {
    if (disabled) return;
    
    // Handle different input modes
    switch (currentMode) {
      case InputMode.Normal:
        handleNormalMode(input, key, handlers);
        break;
        
      case InputMode.Search:
      case InputMode.FuzzySearch:
      case InputMode.Command:
      case InputMode.Editing:
        handleInputMode(input, key, handlers);
        break;
        
      case InputMode.Help:
        handleHelpMode(input, key, handlers);
        break;
        
      case InputMode.LogViewer:
        handleLogViewerMode(input, key, handlers);
        break;
    }
  }, [currentMode, handlers, disabled]));
}

function handleNormalMode(input: string, key: any, handlers: KeyboardHandlers) {
  // Handle special keys first
  if (key.ctrl && key.shift) {
    // Ctrl+Shift combinations
    return;
  }
  
  if (key.ctrl && key.alt) {
    // Ctrl+Alt combinations
    if (input === 'd') {
      handlers.onToggleDebug();
      return;
    }
    return;
  }
  
  if (key.ctrl) {
    // Ctrl combinations
    if (input === 'c') {
      handlers.onQuit();
      return;
    }
    if (input === 'l') {
      handlers.onShowLogs();
      return;
    }
    return;
  }
  
  if (key.shift) {
    // Shift combinations
    if (key.tab) {
      handlers.onSwitchViewReverse();
      return;
    }
    return;
  }
  
  // Handle regular keys
  switch (input) {
    // Movement
    case 'j':
      if (key.downArrow) return;
      handlers.onMoveDown();
      break;
    case 'k':
      if (key.upArrow) return;
      handlers.onMoveUp();
      break;
    case 'h':
      if (key.leftArrow) return;
      handlers.onMoveLeft();
      break;
    case 'l':
      if (key.rightArrow) return;
      handlers.onMoveRight();
      break;
    case 'g':
      handlers.onMoveTop();
      break;
    case 'G':
      handlers.onMoveBottom();
      break;
      
    // Selection and interaction
    case 'o':
    case '\r': // Enter key
      handlers.onSelect();
      break;
    case 'c':
      handlers.onCollapse();
      break;
      
    // Mode switching
    case '\t': // Tab
      handlers.onSwitchView();
      break;
    case 's':
      handlers.onToggleSplitView();
      break;
    case '?':
      handlers.onToggleHelp();
      break;
      
    // Search
    case '/':
      handlers.onStartFuzzySearch();
      break;
    case '*':
      handlers.onStartSearch();
      break;
    case 'n':
      handlers.onNextSearchResult();
      break;
    case 'N':
      handlers.onPrevSearchResult();
      break;
      
    // Input modes
    case ':':
      handlers.onStartCommand();
      break;
    case 'e':
    case 'i':
      handlers.onStartEdit();
      break;
      
    // Content operations
    case 'r':
      handlers.onRefresh();
      break;
      
    // Bookmarks and recent
    case 'b':
      handlers.onToggleBookmark();
      break;
    case 'R':
      handlers.onShowRecent();
      break;
    case 'B':
      handlers.onShowBookmarks();
      break;
      
    // Split view controls
    case '<':
      handlers.onResizePaneLeft();
      break;
    case '>':
      handlers.onResizePaneRight();
      break;
      
    // General
    case 'q':
      handlers.onQuit();
      break;
  }
  
  // Handle special keys
  if (key.upArrow) handlers.onMoveUp();
  if (key.downArrow) handlers.onMoveDown();
  if (key.leftArrow) handlers.onMoveLeft();
  if (key.rightArrow) handlers.onMoveRight();
  if (key.escape) handlers.onEscape();
  if (key.pageUp) handlers.onScrollUp();
  if (key.pageDown) handlers.onScrollDown();
}

function handleInputMode(input: string, key: any, handlers: KeyboardHandlers) {
  if (key.ctrl) {
    if (input === 'c') {
      handlers.onEscape();
      return;
    }
  }
  
  if (key.escape) {
    handlers.onEscape();
    return;
  }
  
  if (key.return) {
    handlers.onSubmitInput();
    return;
  }
  
  if (key.backspace || key.delete) {
    handlers.onClearInput();
    return;
  }
  
  // Regular character input
  if (input && input.length === 1) {
    handlers.onTextInput(input);
  }
}

function handleHelpMode(input: string, key: any, handlers: KeyboardHandlers) {
  // Any key exits help mode
  if (key.escape || input === 'q' || input === '?') {
    handlers.onEscape();
  }
}

function handleLogViewerMode(input: string, key: any, handlers: KeyboardHandlers) {
  if (key.ctrl) {
    if (input === 'c') {
      handlers.onClearLogs();
      return;
    }
  }
  
  if (key.escape || input === 'q') {
    handlers.onEscape();
    return;
  }
  
  // Navigation in log viewer
  switch (input) {
    case 'j':
      handlers.onMoveDown();
      break;
    case 'k':
      handlers.onMoveUp();
      break;
    case 'g':
      handlers.onMoveTop();
      break;
    case 'G':
      handlers.onMoveBottom();
      break;
  }
  
  if (key.upArrow) handlers.onMoveUp();
  if (key.downArrow) handlers.onMoveDown();
}