#!/usr/bin/env node
/**
 * Simplified TUI demo for Trilium CLI
 * Focus on basic functionality without complex features
 */

import { render, Box, Text, useInput, useApp } from 'ink';
import React, { useState, useEffect, useCallback } from 'react';

import { TriliumClient } from './api/client.js';
import type { Note, NoteTreeItem } from './types/api.js';

interface SimpleTuiState {
  isConnected: boolean;
  connectionError: string | null;
  notes: Note[];
  selectedIndex: number;
  currentNote: Note | null;
  currentContent: string | null;
  mode: 'list' | 'content' | 'loading';
  statusMessage: string;
}

const INITIAL_STATE: SimpleTuiState = {
  isConnected: false,
  connectionError: null,
  notes: [],
  selectedIndex: 0,
  currentNote: null,
  currentContent: null,
  mode: 'loading',
  statusMessage: 'Connecting...',
};

function SimpleTui() {
  const [state, setState] = useState<SimpleTuiState>(INITIAL_STATE);
  const [client, setClient] = useState<TriliumClient | null>(null);
  const { exit } = useApp();

  // Initialize connection
  useEffect(() => {
    const initConnection = async () => {
      try {
        // Use environment variables or defaults for connection
        const serverUrl = process.env.TRILIUM_SERVER_URL || 'http://localhost:8080';
        const apiToken = process.env.TRILIUM_API_TOKEN || '';

        if (!apiToken) {
          setState(prev => ({
            ...prev,
            connectionError: 'No API token provided. Set TRILIUM_API_TOKEN environment variable.',
            mode: 'list',
            statusMessage: 'Connection failed: No API token'
          }));
          return;
        }

        const triliumClient = new TriliumClient({
          baseUrl: serverUrl,
          apiToken: apiToken,
          debugMode: false,
        });

        setClient(triliumClient);

        // Test connection
        await triliumClient.testConnection();

        // Load some initial notes by searching for all notes
        const searchResults = await triliumClient.searchNotes('*', true, false, 20);
        const notes: Note[] = [];

        // Convert search results to notes
        for (const result of searchResults) {
          try {
            const note = await triliumClient.getNote(result.noteId);
            notes.push(note);
          } catch (error) {
            // Skip notes we can't access
            continue;
          }
        }

        setState(prev => ({
          ...prev,
          isConnected: true,
          notes,
          mode: 'list',
          statusMessage: `Loaded ${notes.length} notes`
        }));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setState(prev => ({
          ...prev,
          connectionError: errorMessage,
          mode: 'list',
          statusMessage: `Connection failed: ${errorMessage}`
        }));
      }
    };

    initConnection();
  }, []);

  // Load content for selected note
  const loadNoteContent = useCallback(async (note: Note) => {
    if (!client) return;

    try {
      setState(prev => ({ ...prev, statusMessage: 'Loading note content...' }));
      const content = await client.getNoteContent(note.noteId);
      setState(prev => ({
        ...prev,
        currentNote: note,
        currentContent: content,
        mode: 'content',
        statusMessage: `Loaded: ${note.title}`
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load content';
      setState(prev => ({
        ...prev,
        statusMessage: `Error: ${errorMessage}`
      }));
    }
  }, [client]);

  // Handle keyboard input
  useInput(useCallback((input, key) => {
    if (state.mode === 'loading') return;

    // Global shortcuts
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }

    if (input === 'q') {
      exit();
      return;
    }

    if (state.mode === 'list') {
      // List mode navigation
      if (key.downArrow || input === 'j') {
        setState(prev => ({
          ...prev,
          selectedIndex: Math.min(prev.notes.length - 1, prev.selectedIndex + 1)
        }));
      }

      if (key.upArrow || input === 'k') {
        setState(prev => ({
          ...prev,
          selectedIndex: Math.max(0, prev.selectedIndex - 1)
        }));
      }

      if (key.return || input === 'o') {
        const selectedNote = state.notes[state.selectedIndex];
        if (selectedNote) {
          loadNoteContent(selectedNote);
        }
      }
    }

    if (state.mode === 'content') {
      // Content mode navigation
      if (key.escape || input === 'b') {
        setState(prev => ({
          ...prev,
          mode: 'list',
          statusMessage: 'Back to list'
        }));
      }
    }

    // Help
    if (input === '?' || input === 'h') {
      setState(prev => ({
        ...prev,
        statusMessage: 'Keys: j/k=nav, Enter=open, b/Esc=back, q=quit, ?=help'
      }));
    }

  }, [state, exit, loadNoteContent]));

  // Render loading screen
  if (state.mode === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text bold color="cyan">Trilium CLI - Simple TUI</Text>
        </Box>
        <Box marginTop={1}>
          <Text>{state.statusMessage}</Text>
        </Box>
      </Box>
    );
  }

  // Render error screen
  if (state.connectionError) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box>
          <Text bold color="cyan">Trilium CLI - Simple TUI</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="red">✗ Connection Error:</Text>
          <Text color="red">{state.connectionError}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press 'q' or Ctrl+C to exit</Text>
        </Box>
      </Box>
    );
  }

  // Render main interface
  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          Trilium CLI - Simple TUI ({state.mode === 'list' ? 'Notes List' : 'Note Content'})
        </Text>
      </Box>

      {/* Main content */}
      <Box flexGrow={1} paddingX={1} paddingY={1}>
        {state.mode === 'list' && (
          <Box flexDirection="column">
            <Text bold>Notes ({state.notes.length}):</Text>
            <Box marginTop={1} flexDirection="column">
              {state.notes.map((note, index) => (
                <Box key={note.noteId}>
                  <Text color={index === state.selectedIndex ? 'yellow' : undefined}>
                    {index === state.selectedIndex ? '> ' : '  '}
                    {note.title}
                  </Text>
                </Box>
              ))}
              {state.notes.length === 0 && (
                <Text color="gray">No notes found</Text>
              )}
            </Box>
          </Box>
        )}

        {state.mode === 'content' && state.currentNote && (
          <Box flexDirection="column">
            <Text bold color="green">{state.currentNote.title}</Text>
            <Box marginTop={1} borderStyle="single" padding={1}>
              {state.currentContent ? (
                <Text>{state.currentContent}</Text>
              ) : (
                <Text color="gray">No content</Text>
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Status bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text>{state.statusMessage}</Text>
      </Box>
    </Box>
  );
}

// Main execution
async function main() {
  try {
    render(<SimpleTui />);
  } catch (error) {
    console.error('Failed to start TUI:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SimpleTui };