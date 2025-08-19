import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ViewMode } from '../types.js';

interface StatusBarProps {
  mode: ViewMode;
  message: string;
  noteTitle?: string;
  isLoading?: boolean;
  error?: string | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  message,
  noteTitle,
  isLoading,
  error
}) => {
  const getModeDisplay = (mode: ViewMode): string => {
    switch (mode) {
      case 'tree': return '🌳 TREE';
      case 'search': return '🔍 SEARCH';
      case 'viewer': return '👁️ VIEW';
      case 'editor': return '✏️ EDIT';
      case 'help': return '❓ HELP';
      default: 
        const exhaustiveCheck: never = mode;
        return (mode as string).toUpperCase();
    }
  };

  return (
    <Box
      borderStyle="single"
      borderTop={true}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
      justifyContent="space-between"
    >
      {/* Left side - mode and note info */}
      <Box>
        <Text bold color="cyan">{getModeDisplay(mode)}</Text>
        {noteTitle && (
          <>
            <Text> │ </Text>
            <Text color="white">{noteTitle}</Text>
          </>
        )}
      </Box>

      {/* Center - status message or error */}
      <Box>
        {error ? (
          <Text color="red">⚠️ {error}</Text>
        ) : isLoading ? (
          <Text>
            <Spinner type="dots" /> {message}
          </Text>
        ) : (
          <Text dimColor>{message}</Text>
        )}
      </Box>

      {/* Right side - shortcuts hint */}
      <Box>
        <Text dimColor>
          ^Q: Quit • h: Help • ^P: Commands
        </Text>
      </Box>
    </Box>
  );
};