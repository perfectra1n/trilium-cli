import { useCallback, useEffect, useMemo } from 'react';
import type { TriliumClient } from '../../api/client.js';
import type { AppState, TreeItem } from '../types.js';

// Helper function to flatten tree items for navigation
const flattenTree = (items: TreeItem[], expandedNodes: Set<string>, level = 0): Array<{ item: TreeItem; level: number; noteId: string }> => {
  const result: Array<{ item: TreeItem; level: number; noteId: string }> = [];
  
  for (const item of items) {
    result.push({ item, level, noteId: item.noteId });
    if (expandedNodes.has(item.noteId) && item.children && item.children.length > 0) {
      result.push(...flattenTree(item.children, expandedNodes, level + 1));
    }
  }
  
  return result;
};

export const useNavigation = (
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  client: TriliumClient
) => {
  // Memoize flattened items to avoid recalculating on every render
  const flattenedItems = useMemo(() => 
    flattenTree(state.treeItems, state.expandedNodes),
    [state.treeItems, state.expandedNodes]
  );

  // Update state with flattened items when they change
  useEffect(() => {
    setState(prev => ({
      ...prev,
      flattenedItems
    }));
  }, [flattenedItems, setState]);

  // Load a note's content - defined early to avoid circular dependency
  const loadNote = useCallback(async (noteId: string): Promise<void> => {
    const abortController = new AbortController();
    
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const note = await client.getNoteWithContent(noteId);
      
      if (!abortController.signal.aborted) {
        setState(prev => ({
          ...prev,
          currentNote: note,
          statusMessage: `Loaded: ${note.title}`,
          isLoading: false,
          error: null
        }));
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to load note',
          isLoading: false
        }));
      }
    }
  }, [client, setState]);

  // Navigate back in history
  const goBack = useCallback(() => {
    if (state.navigationIndex > 0) {
      const newIndex = state.navigationIndex - 1;
      const noteId = state.navigationHistory[newIndex];
      
      if (noteId) {
        setState(prev => ({
          ...prev,
          navigationIndex: newIndex,
          selectedNoteId: noteId
        }));
        
        // Load the note
        void loadNote(noteId);
      }
    }
  }, [state.navigationHistory, state.navigationIndex, setState, loadNote]);

  // Navigate forward in history
  const goForward = useCallback(() => {
    if (state.navigationIndex < state.navigationHistory.length - 1) {
      const newIndex = state.navigationIndex + 1;
      const noteId = state.navigationHistory[newIndex];
      
      if (noteId) {
        setState(prev => ({
          ...prev,
          navigationIndex: newIndex,
          selectedNoteId: noteId
        }));
        
        // Load the note
        void loadNote(noteId);
      }
    }
  }, [state.navigationHistory, state.navigationIndex, setState, loadNote]);

  // Expand a tree node
  const expandNode = useCallback(async (noteId?: string): Promise<void> => {
    const targetId = noteId || state.selectedNoteId;
    if (!targetId) return;

    // Check if already expanded
    if (state.expandedNodes.has(targetId)) return;

    setState(prev => {
      const newExpanded = new Set(prev.expandedNodes);
      newExpanded.add(targetId);
      return { ...prev, expandedNodes: newExpanded };
    });
    
    // Load children if not already loaded
    try {
      const children = await client.getChildNotes(targetId);
      
      setState(prev => {
        // Update tree items with children
        const updateTreeItems = (items: TreeItem[]): TreeItem[] => {
          return items.map(item => {
            if (item.noteId === targetId) {
              return {
                ...item,
                isExpanded: true,
                children: children.map(child => ({
                  noteId: child.noteId,
                  parentNoteId: targetId,
                  title: child.title,
                  type: child.type || 'text',
                  isProtected: child.isProtected || false,
                  hasChildren: true, // Assume children until proven otherwise
                  isExpanded: false,
                  children: []
                }))
              };
            }
            if (item.children && item.children.length > 0) {
              return {
                ...item,
                children: updateTreeItems(item.children)
              };
            }
            return item;
          });
        };

        return {
          ...prev,
          treeItems: updateTreeItems(prev.treeItems),
          statusMessage: 'Expanded node'
        };
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load children'
      }));
    }
  }, [state.selectedNoteId, state.expandedNodes, client, setState]);

  // Collapse a tree node
  const collapseNode = useCallback((noteId?: string): void => {
    const targetId = noteId || state.selectedNoteId;
    if (!targetId) return;

    // Check if already collapsed
    if (!state.expandedNodes.has(targetId)) return;

    setState(prev => {
      const newExpanded = new Set(prev.expandedNodes);
      newExpanded.delete(targetId);
      
      // Update tree items
      const updateTreeItems = (items: TreeItem[]): TreeItem[] => {
        return items.map(item => {
          if (item.noteId === targetId) {
            return { ...item, isExpanded: false };
          }
          if (item.children && item.children.length > 0) {
            return {
              ...item,
              children: updateTreeItems(item.children)
            };
          }
          return item;
        });
      };

      return {
        ...prev,
        expandedNodes: newExpanded,
        treeItems: updateTreeItems(prev.treeItems),
        statusMessage: 'Collapsed node'
      };
    });
  }, [state.selectedNoteId, state.expandedNodes, setState]);

  // Toggle node expansion
  const toggleNode = useCallback((noteId: string): void => {
    if (state.expandedNodes.has(noteId)) {
      collapseNode(noteId);
    } else {
      void expandNode(noteId);
    }
  }, [state.expandedNodes, expandNode, collapseNode]);

  // Move selection up in the tree
  const moveUp = useCallback((): void => {
    const currentIndex = state.focusedIndex;
    const flatItems = state.flattenedItems;
    
    if (currentIndex > 0 && flatItems.length > 0) {
      const newIndex = currentIndex - 1;
      const newSelectedItem = flatItems[newIndex];
      
      if (newSelectedItem) {
        setState(prev => ({
          ...prev,
          focusedIndex: newIndex,
          selectedNoteId: newSelectedItem.noteId,
          statusMessage: `Selected: ${newSelectedItem.item.title}`
        }));
      }
    }
  }, [state.focusedIndex, state.flattenedItems, setState]);

  // Move selection down in the tree
  const moveDown = useCallback((): void => {
    const currentIndex = state.focusedIndex;
    const flatItems = state.flattenedItems;
    
    if (currentIndex < flatItems.length - 1 && flatItems.length > 0) {
      const newIndex = currentIndex + 1;
      const newSelectedItem = flatItems[newIndex];
      
      if (newSelectedItem) {
        setState(prev => ({
          ...prev,
          focusedIndex: newIndex,
          selectedNoteId: newSelectedItem.noteId,
          statusMessage: `Selected: ${newSelectedItem.item.title}`
        }));
      }
    }
  }, [state.focusedIndex, state.flattenedItems, setState]);

  // Select the currently focused item
  const selectFocusedItem = useCallback((): void => {
    const focusedItem = state.flattenedItems[state.focusedIndex];
    if (focusedItem) {
      void loadNote(focusedItem.noteId);
      
      // Update navigation history
      setState(prev => {
        const newHistory = [
          ...prev.navigationHistory.slice(0, prev.navigationIndex + 1),
          focusedItem.noteId
        ];
        return {
          ...prev,
          navigationHistory: newHistory,
          navigationIndex: newHistory.length - 1,
          currentNote: null, // Will be loaded by loadNote
          viewMode: 'viewer'
        };
      });
    }
  }, [state.flattenedItems, state.focusedIndex, loadNote, setState]);

  return {
    goBack,
    goForward,
    expandNode,
    collapseNode,
    toggleNode,
    moveUp,
    moveDown,
    loadNote,
    selectFocusedItem
  };
};