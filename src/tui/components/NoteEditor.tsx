import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { NoteWithContent } from '../../types/api.js';
import type { TriliumClient } from '../../api/client.js';

interface NoteEditorProps {
  note: NoteWithContent;
  client: TriliumClient;
  onSave: (note: NoteWithContent) => void;
  onCancel: () => void;
  onExit: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  client,
  onSave,
  onCancel,
  onExit
}) => {
  const [editMode, setEditMode] = useState<'title' | 'content'>('content');
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content || '');
  const [lines, setLines] = useState<string[]>([]);
  const [cursorLine, setCursorLine] = useState(0);
  const [cursorCol, setCursorCol] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Split content into lines on mount
  useEffect(() => {
    const contentLines = (note.content || '').split('\n');
    setLines(contentLines);
    setCursorLine(0);
    setCursorCol(0);
  }, [note.content]);

  // Save the note
  const saveNote = useCallback(async () => {
    if (!isDirty) return;
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      const updatedContent = lines.join('\n');
      
      // Update metadata if title changed
      if (title !== note.title) {
        await client.updateNote(note.noteId, {
          title,
          type: note.type
        });
      }
      
      // Update content separately
      await client.updateNoteContent(note.noteId, updatedContent);
      
      const updatedNote: NoteWithContent = {
        ...note,
        title,
        content: updatedContent
      };
      
      onSave(updatedNote);
      setIsDirty(false);
      setIsSaving(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save note');
      setIsSaving(false);
    }
  }, [lines, title, note, client, onSave, isDirty]);

  // Handle character input
  const handleCharInput = useCallback((char: string) => {
    if (editMode === 'title') {
      setTitle(prev => prev + char);
      setIsDirty(true);
    } else {
      const newLines = [...lines];
      const currentLine = newLines[cursorLine] || '';
      newLines[cursorLine] = 
        currentLine.slice(0, cursorCol) + 
        char + 
        currentLine.slice(cursorCol);
      setLines(newLines);
      setCursorCol(prev => prev + 1);
      setIsDirty(true);
    }
  }, [editMode, lines, cursorLine, cursorCol]);

  // Handle backspace
  const handleBackspace = useCallback(() => {
    if (editMode === 'title') {
      setTitle(prev => prev.slice(0, -1));
      setIsDirty(true);
    } else {
      if (cursorCol > 0) {
        const newLines = [...lines];
        const currentLine = newLines[cursorLine] || '';
        newLines[cursorLine] = 
          currentLine.slice(0, cursorCol - 1) + 
          currentLine.slice(cursorCol);
        setLines(newLines);
        setCursorCol(prev => prev - 1);
        setIsDirty(true);
      } else if (cursorLine > 0) {
        // Join with previous line
        const newLines = [...lines];
        const prevLine = newLines[cursorLine - 1] || '';
        const currentLine = newLines[cursorLine] || '';
        newLines[cursorLine - 1] = prevLine + currentLine;
        newLines.splice(cursorLine, 1);
        setLines(newLines);
        setCursorLine(prev => prev - 1);
        setCursorCol(prevLine.length);
        setIsDirty(true);
      }
    }
  }, [editMode, lines, cursorLine, cursorCol]);

  // Handle enter key
  const handleEnter = useCallback(() => {
    if (editMode === 'content') {
      const newLines = [...lines];
      const currentLine = newLines[cursorLine] || '';
      const beforeCursor = currentLine.slice(0, cursorCol);
      const afterCursor = currentLine.slice(cursorCol);
      
      newLines[cursorLine] = beforeCursor;
      newLines.splice(cursorLine + 1, 0, afterCursor);
      
      setLines(newLines);
      setCursorLine(prev => prev + 1);
      setCursorCol(0);
      setIsDirty(true);
    }
  }, [lines, cursorLine, cursorCol, editMode]);

  // Keyboard input handler
  useInput((input, key) => {
    // Save shortcut
    if (key.ctrl && input === 's') {
      saveNote();
      return;
    }

    // Exit without saving
    if (key.escape) {
      if (isDirty) {
        // In a real app, we'd show a confirmation dialog
        onCancel();
      } else {
        onExit();
      }
      return;
    }

    // Switch between title and content
    if (key.tab) {
      setEditMode(prev => prev === 'title' ? 'content' : 'title');
      return;
    }

    // Navigation in content mode
    if (editMode === 'content') {
      if (key.upArrow && cursorLine > 0) {
        setCursorLine(prev => prev - 1);
        const newLineLength = lines[cursorLine - 1]?.length || 0;
        setCursorCol(prev => Math.min(prev, newLineLength));
      } else if (key.downArrow && cursorLine < lines.length - 1) {
        setCursorLine(prev => prev + 1);
        const newLineLength = lines[cursorLine + 1]?.length || 0;
        setCursorCol(prev => Math.min(prev, newLineLength));
      } else if (key.leftArrow && cursorCol > 0) {
        setCursorCol(prev => prev - 1);
      } else if (key.rightArrow) {
        const lineLength = lines[cursorLine]?.length || 0;
        if (cursorCol < lineLength) {
          setCursorCol(prev => prev + 1);
        }
      } else if (key.return) {
        handleEnter();
      } else if (key.backspace || key.delete) {
        handleBackspace();
      } else if (input && !key.ctrl && !key.meta) {
        handleCharInput(input);
      }
    }

    // Title mode input
    if (editMode === 'title' && input && !key.ctrl && !key.meta) {
      if (key.backspace || key.delete) {
        handleBackspace();
      } else if (!key.return) {
        handleCharInput(input);
      }
    }
  });

  // Visual representation of cursor position
  const renderContent = () => {
    return lines.map((line, lineIndex) => {
      if (editMode === 'content' && lineIndex === cursorLine) {
        const beforeCursor = line.slice(0, cursorCol);
        const atCursor = line[cursorCol] || ' ';
        const afterCursor = line.slice(cursorCol + 1);
        
        return (
          <Box key={lineIndex}>
            <Text>
              {beforeCursor}
              <Text inverse>{atCursor}</Text>
              {afterCursor}
            </Text>
          </Box>
        );
      }
      
      return (
        <Box key={lineIndex}>
          <Text>{line || ' '}</Text>
        </Box>
      );
    });
  };

  return (
    <Box flexDirection="column" padding={1} height="100%">
      {/* Header */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text bold color="green">Editing: </Text>
          {editMode === 'title' ? (
            <Box>
              <Text inverse>{title}</Text>
              <Text dimColor> (TAB to edit content)</Text>
            </Box>
          ) : (
            <Box>
              <Text>{title}</Text>
              <Text dimColor> (TAB to edit title)</Text>
            </Box>
          )}
        </Box>
        
        {isDirty && (
          <Text color="yellow">* Modified</Text>
        )}
        
        {saveError && (
          <Text color="red">Error: {saveError}</Text>
        )}
        
        {isSaving && (
          <Text color="blue">Saving...</Text>
        )}
      </Box>

      {/* Content area */}
      <Box flexGrow={1} flexDirection="column" borderStyle="single">
        {renderContent()}
      </Box>

      {/* Footer with shortcuts */}
      <Box marginTop={1}>
        <Text dimColor>
          Ctrl+S: Save | ESC: Exit | TAB: Switch title/content | 
          Line {cursorLine + 1}, Col {cursorCol + 1}
        </Text>
      </Box>
    </Box>
  );
};