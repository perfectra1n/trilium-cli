import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { SearchResult } from '../../types/api.js';

interface SearchPanelProps {
  results: SearchResult[];
  query: string;
  selectedId: string | null;
  onSelect: (noteId: string) => void;
  onSearch: (query: string) => void;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({
  results,
  query,
  selectedId,
  onSelect,
  onSearch
}) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchInput, setSearchInput] = useState(query);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const handleSearchSubmit = () => {
    setIsSearching(false);
    onSearch(searchInput);
  };

  const renderSearchBox = () => (
    <Box marginBottom={1}>
      <Text bold color="green">🔍 Search: </Text>
      {isSearching ? (
        <TextInput
          value={searchInput}
          onChange={setSearchInput}
          onSubmit={handleSearchSubmit}
          placeholder="Enter search query..."
        />
      ) : (
        <Text>{searchInput || '(Press / to search)'}</Text>
      )}
    </Box>
  );

  const renderSearchResult = (result: SearchResult, index: number) => {
    const isFocused = index === focusedIndex;
    const isSelected = result.noteId === selectedId;
    
    // Extract snippet or preview
    const preview = result.title || '(No preview available)';
    
    return (
      <Box key={result.noteId} flexDirection="column" marginBottom={1}>
        <Text
          color={isSelected ? 'blue' : isFocused ? 'yellow' : undefined}
          bold={isSelected}
          inverse={isFocused}
        >
          {result.title || 'Untitled'}
        </Text>
        <Text dimColor wrap="truncate">
          {preview.substring(0, 50)}...
        </Text>
        {result.score !== undefined && (
          <Text dimColor>
            Score: {result.score.toFixed(2)}
          </Text>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" padding={1}>
      {renderSearchBox()}
      
      {results.length > 0 ? (
        <>
          <Box marginBottom={1}>
            <Text dimColor>Found {results.length} results</Text>
          </Box>
          <Box flexDirection="column">
            {results.map((result, index) => renderSearchResult(result, index))}
          </Box>
        </>
      ) : query ? (
        <Text dimColor>No results found for "{query}"</Text>
      ) : (
        <Text dimColor>Enter a search query to find notes</Text>
      )}
      
      <Box marginTop={1}>
        <Text dimColor>
          Press '/' to search • Enter to select • ↑↓ to navigate
        </Text>
      </Box>
    </Box>
  );
};