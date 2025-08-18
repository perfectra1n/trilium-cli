/**
 * StatusBar component for displaying status information and help
 */

import { Box, Text } from 'ink';
import React from 'react';

import { InputMode, ViewMode } from '../types/index.js';

interface StatusBarProps {
  mode: InputMode;
  viewMode: ViewMode;
  statusMessage: string | null;
  debugMode: boolean;
}

export function StatusBar({ mode, viewMode, statusMessage, debugMode }: StatusBarProps): JSX.Element {
  const displayMessage = statusMessage || getDefaultStatusMessage(mode, viewMode, debugMode);
  
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text color="white">
        {displayMessage}
      </Text>
    </Box>
  );
}

function getDefaultStatusMessage(mode: InputMode, viewMode: ViewMode, debugMode: boolean): string {
  const modeText = getModeText(mode);
  const viewText = getViewText(viewMode);
  const debugText = debugMode ? ' | DEBUG' : '';
  
  return `Mode: ${modeText} | View: ${viewText}${debugText} | Press ? for help, q to quit`;
}

function getModeText(mode: InputMode): string {
  switch (mode) {
    case InputMode.Normal:
      return 'NORMAL';
    case InputMode.Editing:
      return 'EDITING';
    case InputMode.Search:
      return 'SEARCH';
    case InputMode.FuzzySearch:
      return 'FUZZY SEARCH';
    case InputMode.Command:
      return 'COMMAND';
    case InputMode.Help:
      return 'HELP';
    case InputMode.LogViewer:
      return 'LOG VIEWER';
    default:
      return 'UNKNOWN';
  }
}

function getViewText(viewMode: ViewMode): string {
  switch (viewMode) {
    case ViewMode.Tree:
      return 'Tree';
    case ViewMode.Content:
      return 'Content';
    case ViewMode.Attributes:
      return 'Attributes';
    case ViewMode.Search:
      return 'Search';
    case ViewMode.Recent:
      return 'Recent';
    case ViewMode.Bookmarks:
      return 'Bookmarks';
    case ViewMode.Split:
      return 'Split';
    case ViewMode.LogViewer:
      return 'LogViewer';
    default:
      return 'Unknown';
  }
}