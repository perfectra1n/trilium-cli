/**
 * API integration hook for TUI
 */

import { useCallback, useRef } from 'react';
import { TriliumClient } from '../../api/client.js';
import type { 
  Note, 
  NoteTreeItem, 
  CreateNoteDef, 
  UpdateNoteDef,
  SearchNotesParams,
} from '../../types/api.js';
import { LogLevel } from '../types/index.js';

export interface UseApiOptions {
  client: TriliumClient;
  onLogOperation?: (level: LogLevel, operation: string, message: string) => void;
  debugMode?: boolean;
}

export interface ApiOperations {
  // Connection
  testConnection: () => Promise<boolean>;
  
  // Note tree
  loadNoteTree: () => Promise<NoteTreeItem[]>;
  refreshNoteTree: () => Promise<NoteTreeItem[]>;
  
  // Notes
  loadNote: (ownerId: string) => Promise<Note>;
  loadNoteContent: (ownerId: string) => Promise<string>;
  createNote: (def: CreateNoteDef) => Promise<Note>;
  updateNote: (ownerId: string, def: UpdateNoteDef) => Promise<Note>;
  updateNoteContent: (ownerId: string, content: string) => Promise<void>;
  deleteNote: (ownerId: string) => Promise<void>;
  
  // Search
  searchNotes: (query: string, options?: Partial<SearchNotesParams>) => Promise<Note[]>;
  
  // Branches
  expandBranch: (branchId: string) => Promise<void>;
  collapseBranch: (branchId: string) => Promise<void>;
}

export function useApi({ client, onLogOperation, debugMode = false }: UseApiOptions): ApiOperations {
  const operationIdRef = useRef(0);
  
  const logOperation = useCallback((level: LogLevel, operation: string, message: string) => {
    if (onLogOperation && debugMode) {
      onLogOperation(level, operation, message);
    }
  }, [onLogOperation, debugMode]);
  
  const withErrorHandling = useCallback(async <T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    const opId = ++operationIdRef.current;
    const startTime = Date.now();
    
    logOperation(LogLevel.Info, operation, `Starting operation #${opId}`);
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      logOperation(LogLevel.Info, operation, `Operation #${opId} completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      logOperation(LogLevel.Error, operation, `Operation #${opId} failed after ${duration}ms: ${errorMsg}`);
      throw error;
    }
  }, [logOperation]);

  const testConnection = useCallback(async (): Promise<boolean> => {
    return withErrorHandling('testConnection', async () => {
      await client.testConnection();
      return true;
    });
  }, [client, withErrorHandling]);

  const loadNoteTree = useCallback(async (): Promise<NoteTreeItem[]> => {
    return withErrorHandling('loadNoteTree', async () => {
      // Get root note
      const rootNote = await client.getNote('root');
      return buildNoteTree(client, rootNote);
    });
  }, [client, withErrorHandling]);

  const refreshNoteTree = useCallback(async (): Promise<NoteTreeItem[]> => {
    return loadNoteTree(); // Same as initial load for now
  }, [loadNoteTree]);

  const loadNote = useCallback(async (ownerId: string): Promise<Note> => {
    return withErrorHandling('loadNote', async () => {
      return client.getNote(noteId);
    });
  }, [client, withErrorHandling]);

  const loadNoteContent = useCallback(async (ownerId: string): Promise<string> => {
    return withErrorHandling('loadNoteContent', async () => {
      return client.getNoteContent(noteId);
    });
  }, [client, withErrorHandling]);

  const createNote = useCallback(async (def: CreateNoteDef): Promise<Note> => {
    return withErrorHandling('createNote', async () => {
      const result = await client.createNote(def);
      return result.note;
    });
  }, [client, withErrorHandling]);

  const updateNote = useCallback(async (ownerId: string, def: UpdateNoteDef): Promise<Note> => {
    return withErrorHandling('updateNote', async () => {
      return client.updateNote(noteId, def);
    });
  }, [client, withErrorHandling]);

  const updateNoteContent = useCallback(async (ownerId: string, content: string): Promise<void> => {
    return withErrorHandling('updateNoteContent', async () => {
      await client.updateNoteContent(noteId, content);
    });
  }, [client, withErrorHandling]);

  const deleteNote = useCallback(async (ownerId: string): Promise<void> => {
    return withErrorHandling('deleteNote', async () => {
      await client.deleteNote(noteId);
    });
  }, [client, withErrorHandling]);

  const searchNotes = useCallback(async (
    query: string, 
    options: Partial<SearchNotesParams> = {}
  ): Promise<Note[]> => {
    return withErrorHandling('searchNotes', async () => {
      const results = await client.searchNotes(
        query,
        options.fastSearch ?? true,
        options.includeArchivedNotes ?? false,
        options.limit ?? 100
      );
      
      // Convert SearchResult[] to Note[] by fetching each note
      const notes: Note[] = [];
      for (const result of results) {
        try {
          const note = await client.getNote(result.noteId);
          notes.push(note);
        } catch (error) {
          // Skip inaccessible notes
          continue;
        }
      }
      
      return notes;
    });
  }, [client, withErrorHandling]);

  const expandBranch = useCallback(async (branchId: string): Promise<void> => {
    return withErrorHandling('expandBranch', async () => {
      await client.updateBranch(branchId, { isExpanded: true });
    });
  }, [client, withErrorHandling]);

  const collapseBranch = useCallback(async (branchId: string): Promise<void> => {
    return withErrorHandling('collapseBranch', async () => {
      await client.updateBranch(branchId, { isExpanded: false });
    });
  }, [client, withErrorHandling]);

  return {
    testConnection,
    loadNoteTree,
    refreshNoteTree,
    loadNote,
    loadNoteContent,
    createNote,
    updateNote,
    updateNoteContent,
    deleteNote,
    searchNotes,
    expandBranch,
    collapseBranch,
  };
}

/**
 * Build a hierarchical tree structure from flat note data
 */
async function buildNoteTree(client: TriliumClient, rootNote: Note): Promise<NoteTreeItem[]> {
  const visited = new Set<string>();
  
  async function buildChildren(note: Note, depth = 0): Promise<NoteTreeItem[]> {
    if (visited.has(note.noteId) || depth > 10) {
      return []; // Prevent infinite recursion
    }
    
    visited.add(note.noteId);
    
    const children: NoteTreeItem[] = [];
    
    if (note.childNoteIds && note.childNoteIds.length > 0) {
      for (const childId of note.childNoteIds) {
        try {
          const childNote = await client.getNote(childId);
          const grandChildren = await buildChildren(childNote, depth + 1);
          
          children.push({
            note: childNote,
            children: grandChildren,
            isExpanded: false, // Start collapsed
            depth: depth + 1,
          });
        } catch (error) {
          // Skip inaccessible notes
          continue;
        }
      }
    }
    
    return children;
  }
  
  return buildChildren(rootNote);
}