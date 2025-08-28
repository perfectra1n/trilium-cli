import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { NoteWithContent } from '../../types/api.js';
import type { TriliumClient } from '../../api/client.js';
import { openNoteInExternalEditor } from '../../utils/editor.js';
import { spawn } from 'child_process';

interface ExternalNoteEditorProps {
  note: NoteWithContent;
  client: TriliumClient;
  onSave: (note: NoteWithContent) => void;
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
        
        if (editorResult.cancelled) {
          setStatusMessage('Edit cancelled - no changes saved');
          setTimeout(() => onCancel(), 1500);
          return;
        }
        
        if (!editorResult.changed) {
          setStatusMessage('No changes detected');
          setTimeout(() => onExit(), 1500);
          return;
        }
        
        // Save the changes
        setStatusMessage('Saving changes...');
        
        // Update content
        await client.updateNoteContent(note.noteId, editorResult.content);
        
        const updatedNote: NoteWithContent = {
          ...note,
          content: editorResult.content
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