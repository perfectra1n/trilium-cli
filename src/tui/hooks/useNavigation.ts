import { useCallback } from 'react';
import type { TriliumClient } from '../../api/client.js';
import type { AppState, TreeItem } from '../types.js';

export const useNavigation = (
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  client: TriliumClient
) => {
  // Navigate back in history
  const goBack = useCallback(() => {
    if (state.navigationIndex > 0) {
      const newIndex = state.navigationIndex - 1;
      const noteId = state.navigationHistory[newIndex]!;
      
      setState(prev => ({
        ...prev,
        navigationIndex: newIndex,
        selectedNoteId: noteId
      }));
      
      // Load the note
      loadNote(noteId);
    }
  }, [state.navigationHistory, state.navigationIndex]);

  // Navigate forward in history
  const goForward = useCallback(() => {
    if (state.navigationIndex < state.navigationHistory.length - 1) {
      const newIndex = state.navigationIndex + 1;
      const noteId = state.navigationHistory[newIndex]!;
      
      setState(prev => ({
        ...prev,
        navigationIndex: newIndex,
        selectedNoteId: noteId
      }));
      
      // Load the note
      loadNote(noteId);
    }
  }, [state.navigationHistory, state.navigationIndex]);

  // Load a note's content
  const loadNote = useCallback(async (noteId: string) => {
    try {
      const note = await client.getNoteWithContent(noteId);
      setState(prev => ({
        ...prev,
        currentNote: note,
        statusMessage: `Loaded: ${note.title}`
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load note'
      }));
    }
  }, [client]);

  // Expand a tree node
  const expandNode = useCallback(async (noteId?: string) => {
    const targetId = noteId || state.selectedNoteId;
    if (!targetId) return;

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
                  isExpanded: false
                }))
              };
            }
            if (item.children) {
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
          treeItems: updateTreeItems(prev.treeItems)
        };
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load children'
      }));
    }
  }, [state.selectedNoteId, client]);

  // Collapse a tree node
  const collapseNode = useCallback((noteId?: string) => {
    const targetId = noteId || state.selectedNoteId;
    if (!targetId) return;

    setState(prev => {
      const newExpanded = new Set(prev.expandedNodes);
      newExpanded.delete(targetId);
      
      // Update tree items
      const updateTreeItems = (items: TreeItem[]): TreeItem[] => {
        return items.map(item => {
          if (item.noteId === targetId) {
            return { ...item, isExpanded: false };
          }
          if (item.children) {
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
        treeItems: updateTreeItems(prev.treeItems)
      };
    });
  }, [state.selectedNoteId]);

  // Toggle node expansion
  const toggleNode = useCallback((noteId: string) => {
    if (state.expandedNodes.has(noteId)) {
      collapseNode(noteId);
    } else {
      expandNode(noteId);
    }
  }, [state.expandedNodes, expandNode, collapseNode]);

  // Move selection up
  const moveUp = useCallback(() => {
    // Implementation would track current selection index
    setState(prev => ({
      ...prev,
      statusMessage: 'Moved up'
    }));
  }, []);

  // Move selection down
  const moveDown = useCallback(() => {
    // Implementation would track current selection index
    setState(prev => ({
      ...prev,
      statusMessage: 'Moved down'
    }));
  }, []);

  return {
    goBack,
    goForward,
    expandNode,
    collapseNode,
    toggleNode,
    moveUp,
    moveDown,
    loadNote
  };
};