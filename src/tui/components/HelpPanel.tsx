import React from 'react';
import { Box, Text } from 'ink';
import type { KeyBinding } from '../types.js';

interface HelpPanelProps {
  keyBindings: KeyBinding[];
  onClose: () => void;
}

export const HelpPanel: React.FC<HelpPanelProps> = ({ keyBindings, onClose }) => {
  const categorizeBindings = () => {
    const categories: Record<string, KeyBinding[]> = {
      'Navigation': [],
      'View Modes': [],
      'Note Operations': [],
      'Search': [],
      'General': []
    };

    keyBindings.forEach(binding => {
      const key = binding.key.toLowerCase();
      if (['j', 'k', 'h', 'l', '[', ']', 'up', 'down', 'left', 'right'].includes(key)) {
        categories['Navigation']?.push(binding);
      } else if (['t', 'v', 'e', 's'].includes(key)) {
        categories['View Modes']?.push(binding);
      } else if (['n', 'a', 'd', 'r'].includes(key) || (binding.ctrl && key === 'n')) {
        categories['Note Operations']?.push(binding);
      } else if (key === '/') {
        categories['Search']?.push(binding);
      } else {
        categories['General']?.push(binding);
      }
    });

    return categories;
  };

  const formatKey = (binding: KeyBinding): string => {
    let key = '';
    if (binding.ctrl) key += '^';
    if (binding.alt) key += 'Alt+';
    if (binding.shift) key += 'Shift+';
    key += binding.key.toUpperCase();
    return key;
  };

  const categories = categorizeBindings();

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      padding={1}
      width="80%"
      height="80%"
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">📚 TRILIUM CLI - KEYBOARD SHORTCUTS</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {Object.entries(categories).map(([category, bindings]) => (
          bindings.length > 0 && (
            <Box key={category} flexDirection="column" marginBottom={1}>
              <Text bold color="yellow">{category}:</Text>
              {bindings.map(binding => (
                <Box key={binding.key + (binding.ctrl ? 'ctrl' : '')}>
                  <Text color="green">{formatKey(binding).padEnd(12)}</Text>
                  <Text>{binding.description}</Text>
                </Box>
              ))}
            </Box>
          )
        ))}

        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">Vim-like Navigation:</Text>
          <Text color="green">{'j/k'.padEnd(12)}</Text>
          <Text>Move down/up in lists</Text>
          <Text color="green">{'h/l'.padEnd(12)}</Text>
          <Text>Collapse/expand tree nodes</Text>
          <Text color="green">{'gg/G'.padEnd(12)}</Text>
          <Text>Jump to first/last item</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold color="yellow">Search Operators:</Text>
          <Text dimColor>
            • Use # for labels (e.g., #todo)
          </Text>
          <Text dimColor>
            • Use quotes for exact match (e.g., "exact phrase")
          </Text>
          <Text dimColor>
            • Combine with AND/OR operators
          </Text>
        </Box>
      </Box>

      <Box justifyContent="center">
        <Text dimColor>Press ESC or 'h' to close help</Text>
      </Box>
    </Box>
  );
};