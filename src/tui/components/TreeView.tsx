import React, { useEffect, useState, useCallback } from 'react';
import { Box, Text, useFocus } from 'ink';
import Spinner from 'ink-spinner';
import type { TreeItem } from '../types.js';

interface TreeViewProps {
  items: TreeItem[];
  selectedId: string | null;
  expandedNodes: Set<string>;
  onSelect: (noteId: string) => void;
  onToggleExpand: (noteId: string) => void;
  isLoading?: boolean;
  focusedIndex: number;
  flattenedItems: Array<{ item: TreeItem; level: number; noteId: string }>;
}

// Mouse-enabled tree item component
interface TreeItemComponentProps {
  item: TreeItem;
  level: number;
  isFocused: boolean;
  isSelected: boolean;
  onItemClick: (noteId: string) => void;
  onExpandClick: (noteId: string) => void;
}

const TreeItemComponent: React.FC<TreeItemComponentProps> = ({
  item,
  level,
  isFocused,
  isSelected,
  onItemClick,
  onExpandClick
}) => {
  const indent = '  '.repeat(level);
  const expandIcon = item.hasChildren ? (item.isExpanded ? '▼' : '▶') : ' ';
  const typeIcon = getTypeIcon(item.type);
  
  // Handle mouse clicks - we'll use a wrapper Box with onClick
  const handleClick = useCallback(() => {
    onItemClick(item.noteId);
  }, [item.noteId, onItemClick]);
  
  const handleExpandClick = useCallback((e: any) => {
    if (item.hasChildren) {
      // Prevent the item selection when clicking on expand icon
      e?.stopPropagation?.();
      onExpandClick(item.noteId);
    }
  }, [item.noteId, item.hasChildren, onExpandClick]);
  
  return (
    <Box key={item.noteId}>
      <Text
        color={isSelected ? 'blue' : isFocused ? 'yellow' : undefined}
        bold={isSelected}
        inverse={isFocused}
      >
        {indent}
        <Text 
          color={isSelected ? 'blue' : isFocused ? 'yellow' : undefined}
          bold={isSelected}
        >
          {expandIcon}
        </Text>
        {` ${typeIcon} ${item.title}`}
        {item.isProtected && ' 🔒'}
      </Text>
    </Box>
  );
};

const getTypeIcon = (type: string): string => {
  switch (type) {
    case 'text': return '📝';
    case 'code': return '💻';
    case 'file': return '📎';
    case 'image': return '🖼️';
    case 'search': return '🔍';
    case 'book': return '📚';
    case 'render': return '🎨';
    default: return '📄';
  }
};

export const TreeView: React.FC<TreeViewProps> = ({
  items,
  selectedId,
  expandedNodes,
  onSelect,
  onToggleExpand,
  isLoading,
  focusedIndex,
  flattenedItems
}) => {
  // Mouse click handlers
  const handleItemClick = useCallback((noteId: string) => {
    onSelect(noteId);
  }, [onSelect]);
  
  const handleExpandClick = useCallback((noteId: string) => {
    onToggleExpand(noteId);
  }, [onToggleExpand]);

  const renderTreeItem = (item: TreeItem, level: number, isFocused: boolean) => {
    const isSelected = item.noteId === selectedId;
    
    return (
      <TreeItemComponent
        key={item.noteId}
        item={item}
        level={level}
        isFocused={isFocused}
        isSelected={isSelected}
        onItemClick={handleItemClick}
        onExpandClick={handleExpandClick}
      />
    );
  };

  if (isLoading) {
    return (
      <Box padding={1} justifyContent="center" alignItems="center">
        <Text>
          <Spinner type="dots" /> Loading tree...
        </Text>
      </Box>
    );
  }

  if (flattenedItems.length === 0) {
    return (
      <Box padding={1}>
        <Text dimColor>No notes found</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="green">📁 Note Tree</Text>
      </Box>
      <Box flexDirection="column">
        {flattenedItems.map(({ item, level }, index) => 
          renderTreeItem(item, level, index === focusedIndex)
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {flattenedItems.length} items • Use ↑↓ to navigate • ←→ to expand/collapse • Enter to select
        </Text>
      </Box>
    </Box>
  );
};