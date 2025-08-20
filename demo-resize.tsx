#!/usr/bin/env node
import React, { useState, useEffect } from 'react';
import { render, Box, Text, useApp } from 'ink';
import { useTerminalDimensions } from './src/tui/hooks/useTerminalDimensions.js';
import { useResponsiveLayout } from './src/tui/hooks/useResponsiveLayout.js';
import { truncateText, formatDateTime } from './src/tui/utils/responsiveFormat.js';

const ResizeDemo: React.FC = () => {
  const { exit } = useApp();
  const [content, setContent] = useState('Sample content for testing responsive layout');
  
  const { dimensions, breakpoint } = useTerminalDimensions({
    onResize: (event) => {
      console.log(`Terminal resized from ${event.previous.columns}x${event.previous.rows} to ${event.current.columns}x${event.current.rows}`);
    }
  });
  
  const layout = useResponsiveLayout();

  // Exit on Ctrl+C or q
  useEffect(() => {
    const handleInput = (data: Buffer) => {
      const input = data.toString();
      if (input === 'q' || input === '\x03') {
        exit();
      }
    };

    process.stdin.on('data', handleInput);
    return () => {
      process.stdin.off('data', handleInput);
    };
  }, [exit]);

  const getBreakpointColor = (bp: string) => {
    switch (bp) {
      case 'narrow': return 'red';
      case 'compact': return 'yellow';
      case 'normal': return 'green';
      case 'wide': return 'blue';
      default: return 'white';
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Box borderStyle="single" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">Terminal Resize Demo</Text>
      </Box>

      {/* Dimensions Info */}
      <Box marginBottom={1} paddingX={1}>
        <Text>
          Dimensions: <Text bold>{dimensions.columns}x{dimensions.rows}</Text> | 
          Breakpoint: <Text bold color={getBreakpointColor(breakpoint)}>{breakpoint}</Text>
        </Text>
      </Box>

      {/* Layout Configuration */}
      <Box flexDirection="column" marginBottom={1} paddingX={1}>
        <Text bold underline>Layout Configuration:</Text>
        <Text>• Sidebar: {layout.showSidebar ? `Visible (${layout.sidebarWidth})` : 'Hidden'}</Text>
        <Text>• Status Bar: {layout.statusBarCompact ? 'Compact' : 'Normal'}</Text>
        <Text>• Icons: {layout.showIcons ? 'Shown' : 'Hidden'}</Text>
        <Text>• Shortcuts: {layout.showShortcuts ? 'Shown' : 'Hidden'}</Text>
        <Text>• Max Item Length: {layout.maxTreeItemLength}</Text>
        <Text>• Panel Padding: {layout.panelPadding}</Text>
      </Box>

      {/* Main Content Area */}
      <Box flexGrow={1} flexDirection="row">
        {/* Sidebar (if shown) */}
        {layout.showSidebar && (
          <Box 
            width={layout.sidebarWidth} 
            borderStyle="single" 
            paddingX={layout.panelPadding}
            marginRight={1}
          >
            <Box flexDirection="column">
              <Text bold color="green">Sidebar</Text>
              <Text dimColor>
                {truncateText('This is a sample sidebar item that might be very long', layout.maxTreeItemLength)}
              </Text>
              <Text dimColor>
                {truncateText('Another item with a potentially long name', layout.maxTreeItemLength)}
              </Text>
            </Box>
          </Box>
        )}

        {/* Main Panel */}
        <Box 
          width={layout.mainPanelWidth} 
          borderStyle="single" 
          paddingX={layout.panelPadding}
        >
          <Box flexDirection="column">
            <Text bold color="blue">Main Content</Text>
            <Text wrap="wrap">
              {content}
            </Text>
            <Text marginTop={1} dimColor>
              Current time: {formatDateTime(new Date(), breakpoint)}
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Status Bar */}
      <Box 
        borderStyle="single" 
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingX={layout.statusBarCompact ? 0 : 1}
        justifyContent="space-between"
      >
        <Text bold color="cyan">
          {layout.statusBarCompact ? 'D' : 'DEMO'}
        </Text>
        
        {!layout.statusBarCompact && (
          <Text dimColor>
            {truncateText('Status message here', layout.maxStatusMessageLength)}
          </Text>
        )}
        
        {layout.showShortcuts && (
          <Text dimColor>
            Press 'q' to quit
          </Text>
        )}
      </Box>

      {/* Instructions */}
      <Box paddingX={1} marginTop={1}>
        <Text dimColor italic>
          Resize your terminal to see the responsive layout in action!
        </Text>
      </Box>
    </Box>
  );
};

// Run the demo
const { waitUntilExit } = render(<ResizeDemo />);
waitUntilExit().then(() => {
  console.log('Demo exited');
  process.exit(0);
});