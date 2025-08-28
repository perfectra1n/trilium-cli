import React, { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type { Command } from '../types.js';

interface CommandPaletteProps {
  onCommand: (command: Command) => void;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onCommand, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: Command[] = [
    // Note operations
    { id: 'create-note', name: 'Create New Note', shortcut: '^N', category: 'Note', action: () => {} },
    { id: 'delete-note', name: 'Delete Current Note', category: 'Note', action: () => {} },
    { id: 'duplicate-note', name: 'Duplicate Note', category: 'Note', action: () => {} },
    { id: 'move-note', name: 'Move Note', category: 'Note', action: () => {} },
    { id: 'protect-note', name: 'Toggle Note Protection', category: 'Note', action: () => {} },
    
    // Search operations
    { id: 'search-fulltext', name: 'Full Text Search', shortcut: '/', category: 'Search', action: () => {} },
    { id: 'search-labels', name: 'Search by Labels', category: 'Search', action: () => {} },
    { id: 'search-recent', name: 'Recently Modified Notes', category: 'Search', action: () => {} },
    
    // View operations
    { id: 'toggle-tree', name: 'Toggle Tree View', shortcut: 'T', category: 'View', action: () => {} },
    { id: 'toggle-preview', name: 'Toggle Preview', category: 'View', action: () => {} },
    { id: 'zoom-in', name: 'Zoom In', shortcut: '^+', category: 'View', action: () => {} },
    { id: 'zoom-out', name: 'Zoom Out', shortcut: '^-', category: 'View', action: () => {} },
    
    // Export/Import
    { id: 'export-note', name: 'Export Note', category: 'Export', action: () => {} },
    { id: 'export-branch', name: 'Export Branch', category: 'Export', action: () => {} },
    { id: 'import-file', name: 'Import File', category: 'Import', action: () => {} },
    
    // System
    { id: 'reload-config', name: 'Reload Configuration', category: 'System', action: () => {} },
    { id: 'clear-cache', name: 'Clear Cache', category: 'System', action: () => {} },
    { id: 'show-logs', name: 'Show Logs', category: 'System', action: () => {} },
    { id: 'about', name: 'About Trilium CLI', category: 'System', action: () => {} },
  ];

  const filteredCommands = useMemo(() => {
    if (!searchQuery) return commands;
    
    const query = searchQuery.toLowerCase();
    return commands.filter(cmd => 
      cmd.name.toLowerCase().includes(query) ||
      cmd.category?.toLowerCase().includes(query) ||
      cmd.shortcut?.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    filteredCommands.forEach(cmd => {
      const category = cmd.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  const handleSelect = () => {
    if (filteredCommands[selectedIndex]) {
      onCommand(filteredCommands[selectedIndex]);
    }
  };

  let currentIndex = 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="magenta"
      padding={1}
      width={70}
      height={40}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="magenta">⚡ Command Palette</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>Search: </Text>
        <TextInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Type to filter commands..."
        />
      </Box>

      <Box flexDirection="column" flexGrow={1}>
        {Object.entries(groupedCommands).map(([category, cmds]) => (
          <Box key={category} flexDirection="column" marginBottom={1}>
            <Text bold color="yellow">{category}</Text>
            {cmds.map(cmd => {
              const isSelected = currentIndex === selectedIndex;
              const cmdIndex = currentIndex++;
              
              return (
                <Box key={cmd.id}>
                  <Text
                    color={isSelected ? 'blue' : undefined}
                    inverse={isSelected}
                  >
                    {cmd.name}
                  </Text>
                  {cmd.shortcut && (
                    <Text dimColor> ({cmd.shortcut})</Text>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}
        
        {filteredCommands.length === 0 && (
          <Text dimColor>No commands match your search</Text>
        )}
      </Box>

      <Box>
        <Text dimColor>
          ↑↓ Navigate • Enter: Execute • ESC: Cancel
        </Text>
      </Box>
    </Box>
  );
};