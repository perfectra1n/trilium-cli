/**
 * InputModal component for various input modes (search, command, fuzzy search)
 */

import React from 'react';
import { Box, Text } from 'ink';
import { InputMode, type FuzzySearchResult } from '../types/index.js';

interface InputModalProps {
  mode: InputMode;
  input: string;
  searchResults?: FuzzySearchResult[];
  selectedIndex?: number;
}

export function InputModal({ mode, input, searchResults, selectedIndex = 0 }: InputModalProps): JSX.Element {
  const title = getModalTitle(mode);
  const placeholder = getPlaceholderText(mode);
  
  return (
    <Box 
      position="absolute" 
      top={3} 
      left={2} 
      right={2} 
      bottom={3}
      flexDirection="column"
    >
      {/* Input box */}
      <Box 
        borderStyle="single" 
        borderColor="yellow" 
        backgroundColor="black"
        paddingX={1}
      >
        <Text bold color="yellow">
          {title}
        </Text>
      </Box>
      
      <Box 
        borderStyle="single" 
        borderColor="yellow" 
        backgroundColor="black"
        paddingX={1}
        borderTop={false}
      >
        <Text>
          {input || <Text dimColor>{placeholder}</Text>}
        </Text>
      </Box>
      
      {/* Search results for fuzzy search */}
      {mode === InputMode.FuzzySearch && searchResults && (
        <Box 
          flexGrow={1}
          borderStyle="single" 
          borderColor="white" 
          backgroundColor="black"
          borderTop={false}
          flexDirection="column"
          paddingX={1}
        >
          <Box borderBottom={true} borderBottomColor="white" marginBottom={1}>
            <Text bold>
              Results ({searchResults.length})
            </Text>
          </Box>
          
          <Box flexDirection="column" flexGrow={1}>
            {searchResults.length === 0 ? (
              input.trim() === '' ? (
                <Text dimColor>Type to search notes...</Text>
              ) : (
                <Text dimColor>No matches found</Text>
              )
            ) : (
              searchResults.map((result, index) => (
                <FuzzySearchResultItem
                  key={result.item.note.note.noteId}
                  result={result}
                  isSelected={index === selectedIndex}
                />
              ))
            )}
          </Box>
        </Box>
      )}
      
      {/* Instructions */}
      <Box 
        borderStyle="single" 
        borderColor="gray" 
        backgroundColor="black"
        paddingX={1}
        borderTop={false}
      >
        <Text dimColor>
          {getInstructionText(mode)}
        </Text>
      </Box>
    </Box>
  );
}

interface FuzzySearchResultItemProps {
  result: FuzzySearchResult;
  isSelected: boolean;
}

function FuzzySearchResultItem({ result, isSelected }: FuzzySearchResultItemProps): JSX.Element {
  const textColor = isSelected ? 'black' : 'white';
  const backgroundColor = isSelected ? 'white' : undefined;
  
  return (
    <Box>
      <Text 
        color={textColor}
        backgroundColor={backgroundColor}
        bold={isSelected}
      >
        {highlightFuzzyMatches(result.item.note.title, result.indices)}
      </Text>
    </Box>
  );
}

// Helper functions
function getModalTitle(mode: InputMode): string {
  switch (mode) {
    case InputMode.Search:
      return ' Search ';
    case InputMode.FuzzySearch:
      return ' Fuzzy Search ';
    case InputMode.Command:
      return ' Command ';
    case InputMode.Editing:
      return ' Edit ';
    default:
      return ' Input ';
  }
}

function getPlaceholderText(mode: InputMode): string {
  switch (mode) {
    case InputMode.Search:
      return 'Enter search query...';
    case InputMode.FuzzySearch:
      return 'Start typing to search...';
    case InputMode.Command:
      return 'Enter command...';
    case InputMode.Editing:
      return 'Enter text...';
    default:
      return 'Enter input...';
  }
}

function getInstructionText(mode: InputMode): string {
  switch (mode) {
    case InputMode.Search:
      return 'Enter: Search | Escape: Cancel';
    case InputMode.FuzzySearch:
      return 'Enter: Select | ↑/↓: Navigate | Escape: Cancel';
    case InputMode.Command:
      return 'Enter: Execute | Escape: Cancel';
    case InputMode.Editing:
      return 'Enter: Save | Escape: Cancel';
    default:
      return 'Enter: Submit | Escape: Cancel';
  }
}

function highlightFuzzyMatches(text: string, indices: number[]): string {
  // Simple highlighting - wrap matched characters in brackets
  // In a real implementation, you'd use proper text styling
  if (!indices || indices.length === 0) return text;
  
  let result = '';
  let lastIndex = 0;
  
  for (const index of indices) {
    if (index >= text.length) continue;
    
    // Add text before the match
    if (index > lastIndex) {
      result += text.slice(lastIndex, index);
    }
    
    // Add highlighted character
    result += `[${text[index]}]`;
    lastIndex = index + 1;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    result += text.slice(lastIndex);
  }
  
  return result;
}