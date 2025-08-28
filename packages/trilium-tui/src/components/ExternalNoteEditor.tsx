import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Note } from '@trilium-cli/zod';
import type { ETAPIClient } from '../api/client.js';
import { openNoteInExternalEditor } from '../utils/editor.js';
import { spawn } from 'child_process';

interface ExternalNoteEditorProps {
  note: Note & { content?: string };
  client: ETAPIClient;
  onSave: (note: Note & { content?: string }) => void;
  onCancel: () => void;
  onExit: () => void;
}

export const ExternalNoteEditor: React.FC<ExternalNoteEditorProps> = ({
  note,
  client,
  onSave,
  onCancel,
  onExit
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Launch external editor immediately when component mounts
  useEffect(() => {
    const launchEditor = async () => {
      setIsEditing(true);
      setStatusMessage('Launching external editor...');
      
      try {
        // Clear the terminal and show status
        console.clear();
        
        const editorResult = await openNoteInExternalEditor(
          note.content || '',
          note.type
        );
        
        if ((editorResult as any).cancelled) {
          setStatusMessage('Edit cancelled - no changes saved');
          setTimeout(() => onCancel(), 1500);
          return;
        }
        
        if (!(editorResult as any).changed) {
          setStatusMessage('No changes detected');
          setTimeout(() => onExit(), 1500);
          return;
        }
        
        // Save the changes
        setStatusMessage('Saving changes...');
        
        // Update content
        await client.updateNoteContent(note.noteId, editorResult as string);
        
        const updatedNote: Note & { content?: string } = {
          ...note,
          content: editorResult as string
        };
        
        setStatusMessage('Changes saved successfully!');
        setTimeout(() => onSave(updatedNote), 1500);
        
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Failed to save note');
        setIsEditing(false);
      }
    };
    
    launchEditor();
  }, [note, client, onSave, onCancel, onExit]);

  // Handle keyboard input for cancelling
  useInput((input, key) => {
    if (key.escape && !isEditing) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="green">External Editor Mode</Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text>Note: {note.title}</Text>
      </Box>
      
      {statusMessage && (
        <Box marginBottom={1}>
          <Text color="cyan">{statusMessage}</Text>
        </Box>
      )}
      
      {saveError && (
        <Box marginBottom={1}>
          <Text color="red">Error: {saveError}</Text>
        </Box>
      )}
      
      {!isEditing && (
        <Box marginTop={1}>
          <Text dimColor>Press ESC to return to note viewer</Text>
        </Box>
      )}
    </Box>
  );
};