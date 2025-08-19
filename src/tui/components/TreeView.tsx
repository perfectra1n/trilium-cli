import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { TreeItem } from '../types.js';

interface TreeViewProps {
  items: TreeItem[];
  selectedId: string | null;
  expandedNodes: Set<string>;
  onSelect: (noteId: string) => void;
  onToggleExpand: (noteId: string) => void;
  isLoading?: boolean;
}

export const TreeView: React.FC<TreeViewProps> = ({
  items,
  selectedId,
  expandedNodes,
  onSelect,
  onToggleExpand,
  isLoading
}) => {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [flatItems, setFlatItems] = useState<Array<{ item: TreeItem; level: number }>>([]);

  // Flatten tree structure for navigation
  useEffect(() => {
    const flatten = (items: TreeItem[], level = 0): Array<{ item: TreeItem; level: number }> => {
      const result: Array<{ item: TreeItem; level: number }> = [];
      
      for (const item of items) {
        result.push({ item, level });
        if (item.isExpanded && item.children) {
          result.push(...flatten(item.children, level + 1));
        }
      }
      
      return result;
    };

    setFlatItems(flatten(items));
  }, [items, expandedNodes]);

  const renderTreeItem = (item: TreeItem, level: number, isFocused: boolean) => {
    const indent = '  '.repeat(level);
    const expandIcon = item.hasChildren ? (item.isExpanded ? '▼' : '▶') : ' ';
    const typeIcon = getTypeIcon(item.type);
    const isSelected = item.noteId === selectedId;
    
    return (
      <Box key={item.noteId}>
        <Text
          color={isSelected ? 'blue' : isFocused ? 'yellow' : undefined}
          bold={isSelected}
          inverse={isFocused}
        >
          {indent}{expandIcon} {typeIcon} {item.title}
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

  if (isLoading) {
    return (
      <Box padding={1} justifyContent="center" alignItems="center">
        <Text>
          <Spinner type="dots" /> Loading tree...
        </Text>
      </Box>
    );
  }

  if (flatItems.length === 0) {
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
        {flatItems.map(({ item, level }, index) => 
          renderTreeItem(item, level, index === focusedIndex)
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          {flatItems.length} items • Use ↑↓ to navigate • ←→ to expand/collapse • Enter to select
        </Text>
      </Box>
    </Box>
  );
};