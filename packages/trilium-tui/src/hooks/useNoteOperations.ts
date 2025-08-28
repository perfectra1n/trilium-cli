import { useCallback } from 'react';
import type { ETAPIClient } from '../api/client.js';
import type { AppState } from '../types.js';
import type { CreateNoteDef, UpdateNoteDef } from '@trilium-cli/zod';

export const useNoteOperations = (
  client: ETAPIClient,
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>
) => {
  // Create a new note
  const createNote = useCallback(async (params: CreateNoteDef) => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const result = await client.createNote(params);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        statusMessage: `Created note: ${result.note.title}`,
        selectedNoteId: result.note.noteId
      }));
      
      return result.note.noteId;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to create note'
      }));
      throw error;
    }
  }, [client]);

  // Update current note
  const updateNote = useCallback(async (params: UpdateNoteDef) => {
    if (!state.currentNote) return;
    
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      await client.updateNote(state.currentNote.noteId, params);
      
      // Reload the note to get updated content
      const updated = await client.getNote(state.currentNote.noteId);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        currentNote: updated,
        statusMessage: `Updated: ${updated.title}`
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to update note'
      }));
      throw error;
    }
  }, [client, state.currentNote]);

  // Delete a note
  const deleteNote = useCallback(async (noteId: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      await client.deleteNote(noteId);
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        statusMessage: `Deleted note`,
        selectedNoteId: null,
        currentNote: null
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to delete note'
      }));
      throw error;
    }
  }, [client]);

  // Clone/duplicate a note
  const cloneNote = useCallback(async (noteId: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const original = await client.getNoteWithContent(noteId);
      
      const result = await client.createNote({
        parentNoteId: original.parentNoteIds?.[0] || 'root',
        title: `${original.title} (Copy)`,
        type: original.type,
        content: original.content
      });
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        statusMessage: `Cloned note: ${result.note.title}`,
        selectedNoteId: result.note.noteId
      }));
      
      return result.note.noteId;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to clone note'
      }));
      throw error;
    }
  }, [client]);

  // Move a note to a different parent
  const moveNote = useCallback(async (noteId: string, newParentId: string) => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      // Get current branches
      const branches = await client.getNoteBranches(noteId);
      
      if (branches.length > 0) {
        // For moving, we need to create a new branch and delete the old one
        // since parentNoteId is read-only in UpdateBranchDef
        const oldBranch = branches[0];
        if (oldBranch) {
          await client.createBranch({
            noteId: noteId,
            parentNoteId: newParentId,
            prefix: oldBranch.prefix,
            isExpanded: oldBranch.isExpanded,
            notePosition: oldBranch.notePosition
          });
          await client.deleteBranch(oldBranch.branchId);
        }
      }
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        statusMessage: `Moved note to new parent`
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to move note'
      }));
      throw error;
    }
  }, [client]);

  // Add a label to the current note
  const addLabel = useCallback(async (name: string, value?: string) => {
    if (!state.currentNote) return;
    
    try {
      await client.createAttribute({
        noteId: state.currentNote.noteId,
        type: 'label',
        name,
        value: value || '',
        isInheritable: false
      });
      
      setState(prev => ({
        ...prev,
        statusMessage: `Added label: #${name}`
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to add label'
      }));
      throw error;
    }
  }, [client, state.currentNote]);

  // Export a note
  const exportNote = useCallback(async (noteId: string, format: 'html' | 'markdown' | 'txt' = 'markdown') => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const note = await client.getNoteWithContent(noteId);
      
      let content = note.content || '';
      let filename = `${note.title}.${format}`;
      
      // Simple export - in real implementation would handle formatting
      if (format === 'markdown' && note.type === 'text') {
        content = `# ${note.title}\n\n${content}`;
      } else if (format === 'html') {
        content = `<html><head><title>${note.title}</title></head><body>${content}</body></html>`;
      }
      
      setState(prev => ({
        ...prev,
        isLoading: false,
        statusMessage: `Exported: ${filename}`
      }));
      
      return { filename, content };
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to export note'
      }));
      throw error;
    }
  }, [client]);

  return {
    createNote,
    updateNote,
    deleteNote,
    cloneNote,
    moveNote,
    addLabel,
    exportNote
  };
};