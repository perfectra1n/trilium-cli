/**
 * SearchView component for displaying search results
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { Note } from '../../types/api.js';

interface SearchViewProps {
  results: Note[];
  query: string;
  selectedIndex: number;
}

export function SearchView({ results, query, selectedIndex }: SearchViewProps): JSX.Element {
  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="white" paddingX={1}>
        <Text bold>
          {' '} Search Results: {query || '(no query)'} {' '}
        </Text>
      </Box>
      
      <Box flexDirection="column" padding={1} flexGrow={1}>
        {results.length === 0 ? (
          <Box flexDirection="column">
            <Text dimColor>No search results</Text>
            {query && (
              <Box marginTop={1}>
                <Text dimColor>
                  No notes found matching "{query}"
                </Text>
              </Box>
            )}
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text color="green">
              Found {results.length} result{results.length === 1 ? '' : 's'}
            </Text>
            
            <Box flexDirection="column" marginTop={1}>
              {results.map((note, index) => (
                <SearchResultItem
                  key={note.note.noteId}
                  note={note}
                  isSelected={index === selectedIndex}
                  query={query}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

interface SearchResultItemProps {
  note: Note;
  isSelected: boolean;
  query: string;
}

function SearchResultItem({ note, isSelected, query }: SearchResultItemProps): JSX.Element {
  const textColor = isSelected ? 'black' : 'white';
  const backgroundColor = isSelected ? 'white' : undefined;
  
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text 
          color={textColor}
          backgroundColor={backgroundColor}
          bold={isSelected}
        >
          {highlightText(note.title, query)}
        </Text>
      </Box>
      
      <Box marginLeft={2}>
        <Text dimColor>
          ID: {note.note.noteId} | Type: {note.type}
        </Text>
      </Box>
      
      {note.dateModified && (
        <Box marginLeft={2}>
          <Text dimColor>
            Modified: {formatDate(note.dateModified)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// Helper functions
function highlightText(text: string, query: string): string {
  if (!query || !text) return text;
  
  // Simple highlighting - in a real implementation, you might want more sophisticated highlighting
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(regex, '[$1]'); // Wrap matches in brackets for visibility
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString();
  } catch {
    return dateString;
  }
}