/**
 * TreeView component for displaying the note tree
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { NoteTreeItem } from '../../types/api.js';
import type { BookmarkedNote } from '../types/index.js';

interface TreeViewProps {
  items: Array<NoteTreeItem & { depth: number }>;
  selectedIndex: number;
  bookmarkedNotes: BookmarkedNote[];
}

export function TreeView({ items, selectedIndex, bookmarkedNotes }: TreeViewProps): JSX.Element {
  if (items.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold> Notes Tree </Text>
        <Box marginTop={1}>
          <Text dimColor>No notes found. Press 'r' to refresh.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="white" paddingX={1}>
        <Text bold> Notes Tree </Text>
      </Box>
      
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {items.map((item, index) => (
          <TreeItem
            key={item.note.note.noteId}
            item={item}
            isSelected={index === selectedIndex}
            isBookmarked={bookmarkedNotes.some(b => b.noteId === item.note.noteId)}
          />
        ))}
      </Box>
    </Box>
  );
}

interface TreeItemProps {
  item: NoteTreeItem & { depth: number };
  isSelected: boolean;
  isBookmarked: boolean;
}

function TreeItem({ item, isSelected, isBookmarked }: TreeItemProps): JSX.Element {
  const indent = '  '.repeat(item.depth);
  
  const prefix = (() => {
    if (item.children.length === 0) {
      return '  '; // No expand/collapse for leaf nodes
    }
    return item.isExpanded ? '▼ ' : '▶ ';
  })();
  
  const bookmarkIndicator = isBookmarked ? '★ ' : '';
  
  const displayText = `${indent}${prefix}${bookmarkIndicator}${item.note.title}`;
  
  const textColor = (() => {
    if (isSelected) return 'black';
    if (isBookmarked) return 'yellow';
    return 'white';
  })();
  
  const backgroundColor = isSelected ? 'white' : undefined;
  
  return (
    <Box>
      <Text 
        color={textColor} 
        backgroundColor={backgroundColor}
        bold={isSelected}
      >
        {displayText}
      </Text>
    </Box>
  );
}