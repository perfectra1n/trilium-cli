#!/usr/bin/env node

/**
 * Standalone TUI demo for Trilium CLI
 * This demonstrates the TUI functionality without dependencies on the full CLI
 */

import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { useState, useEffect } from 'react';

// Simple demo data
const mockNotes = [
  { id: '1', title: 'Welcome to Trilium', type: 'text', content: 'Welcome to your knowledge base!' },
  { id: '2', title: 'Getting Started', type: 'text', content: 'Here are some tips to get started...' },
  { id: '3', title: 'Advanced Features', type: 'text', content: 'Trilium has many advanced features...' },
  { id: '4', title: 'API Documentation', type: 'text', content: 'Learn how to use the API...' },
  { id: '5', title: 'Shortcuts', type: 'text', content: 'Keyboard shortcuts for efficiency...' },
];

interface AppState {
  selectedIndex: number;
  viewMode: 'tree' | 'content' | 'split';
  inputMode: 'normal' | 'search';
  searchQuery: string;
  statusMessage: string;
}

function TriliumTUI(): JSX.Element {
  const { exit } = useApp();
  const [state, setState] = useState<AppState>({
    selectedIndex: 0,
    viewMode: 'split',
    inputMode: 'normal',
    searchQuery: '',
    statusMessage: 'Press ? for help, q to quit',
  });

  // Keyboard handling
  useInput((input, key) => {
    if (state.inputMode === 'normal') {
      switch (input) {
        case 'q':
          exit();
          break;
        case 'j':
          setState(s => ({ 
            ...s, 
            selectedIndex: Math.min(mockNotes.length - 1, s.selectedIndex + 1) 
          }));
          break;
        case 'k':
          setState(s => ({ 
            ...s, 
            selectedIndex: Math.max(0, s.selectedIndex - 1) 
          }));
          break;
        case 's':
          setState(s => ({ 
            ...s, 
            viewMode: s.viewMode === 'split' ? 'tree' : 'split',
            statusMessage: `Switched to ${s.viewMode === 'split' ? 'tree' : 'split'} view`
          }));
          break;
        case '/':
          setState(s => ({ 
            ...s, 
            inputMode: 'search', 
            searchQuery: '',
            statusMessage: 'Search mode - type to search, ESC to cancel'
          }));
          break;
        case '?':
          setState(s => ({ 
            ...s, 
            statusMessage: 'Help: j/k=navigate, s=toggle split, /=search, q=quit'
          }));
          break;
      }
    } else if (state.inputMode === 'search') {
      if (key.escape) {
        setState(s => ({ 
          ...s, 
          inputMode: 'normal', 
          searchQuery: '',
          statusMessage: 'Search cancelled'
        }));
      } else if (key.return) {
        setState(s => ({ 
          ...s, 
          inputMode: 'normal',
          statusMessage: `Searched for: ${s.searchQuery}`
        }));
      } else if (input) {
        setState(s => ({ 
          ...s, 
          searchQuery: s.searchQuery + input
        }));
      }
    }
  });

  const currentNote = mockNotes[state.selectedIndex];
  const filteredNotes = state.searchQuery 
    ? mockNotes.filter(note => 
        note.title.toLowerCase().includes(state.searchQuery.toLowerCase())
      )
    : mockNotes;

  return (
    <Box flexDirection="column" height="100%">
      {/* Title Bar */}
      <Box borderStyle="single" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          Trilium CLI - TypeScript TUI Demo ({state.viewMode} mode)
          {state.inputMode === 'search' && ' [SEARCH]'}
        </Text>
      </Box>

      {/* Main Content */}
      <Box flexGrow={1}>
        {state.viewMode === 'split' ? (
          <Box flexDirection="row" height="100%">
            {/* Tree Panel */}
            <Box width="40%" borderStyle="single" borderColor="white">
              <Box flexDirection="column" padding={1}>
                <Text bold> Notes Tree </Text>
                {filteredNotes.map((note, index) => (
                  <Text 
                    key={note.id}
                    backgroundColor={index === state.selectedIndex ? 'white' : undefined}
                    color={index === state.selectedIndex ? 'black' : 'white'}
                    bold={index === state.selectedIndex}
                  >
                    {index === state.selectedIndex ? '> ' : '  '}{note.title}
                  </Text>
                ))}
              </Box>
            </Box>

            {/* Content Panel */}
            <Box flexGrow={1} borderStyle="single" borderColor="white" borderLeft={false}>
              <Box flexDirection="column" padding={1}>
                <Text bold color="cyan"> Content </Text>
                {currentNote && (
                  <>
                    <Text bold>Title: {currentNote.title}</Text>
                    <Text dimColor>ID: {currentNote.id} | Type: {currentNote.type}</Text>
                    <Text>{"─".repeat(40)}</Text>
                    <Text>{currentNote.noteContent}</Text>
                  </>
                )}
              </Box>
            </Box>
          </Box>
        ) : (
          /* Tree Only Mode */
          <Box borderStyle="single" borderColor="white" padding={1}>
            <Text bold> Notes Tree </Text>
            {filteredNotes.map((note, index) => (
              <Text 
                key={note.id}
                backgroundColor={index === state.selectedIndex ? 'white' : undefined}
                color={index === state.selectedIndex ? 'black' : 'white'}
                bold={index === state.selectedIndex}
              >
                {index === state.selectedIndex ? '> ' : '  '}{note.title}
              </Text>
            ))}
          </Box>
        )}
      </Box>

      {/* Search Input */}
      {state.inputMode === 'search' && (
        <Box 
          position="absolute" 
          top={3} 
          left={2} 
          right={2}
          borderStyle="single" 
          borderColor="yellow" 
          backgroundColor="black"
          paddingX={1}
        >
          <Text color="yellow">Search: {state.searchQuery}</Text>
        </Box>
      )}

      {/* Status Bar */}
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text>{state.statusMessage}</Text>
      </Box>
    </Box>
  );
}

// Run the TUI
console.log('Starting Trilium CLI TUI Demo...');
render(React.createElement(TriliumTUI));