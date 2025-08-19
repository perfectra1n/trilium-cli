#!/usr/bin/env node
/**
 * TUI Demo Showcase
 * 
 * This demonstrates the Trilium CLI TUI capabilities
 */

import React, { useState } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { UncontrolledTextInput } from 'ink-text-input';
import chalk from 'chalk';

interface DemoScreen {
  title: string;
  description: string;
  component: React.FC;
}

const TreeViewDemo: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const treeItems = [
    { label: '📁 Root', level: 0 },
    { label: '  📁 Projects', level: 1 },
    { label: '    📝 Project Alpha', level: 2 },
    { label: '    📝 Project Beta', level: 2 },
    { label: '  📁 Personal', level: 1 },
    { label: '    📝 Journal', level: 2 },
    { label: '    📝 Ideas', level: 2 },
    { label: '  📁 Archive', level: 1 },
  ];

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex(Math.min(treeItems.length - 1, selectedIndex + 1));
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Tree Navigation (use ↑/↓ or j/k)</Text>
      <Box marginTop={1} flexDirection="column">
        {treeItems.map((item, index) => (
          <Text
            key={index}
            color={selectedIndex === index ? 'green' : 'white'}
            bold={selectedIndex === index}
          >
            {selectedIndex === index ? '▶ ' : '  '}
            {item.label}
          </Text>
        ))}
      </Box>
    </Box>
  );
};

const SearchDemo: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results] = useState([
    { title: 'Meeting Notes 2024-01-15', match: '95%' },
    { title: 'Project Requirements', match: '87%' },
    { title: 'API Documentation', match: '73%' },
    { title: 'Development Guidelines', match: '65%' },
  ]);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Search Interface</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text>🔍 Search: </Text>
          <UncontrolledTextInput
            value={query}
            onChange={setQuery}
            placeholder="Enter search query..."
          />
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Results:</Text>
          {results.map((result, index) => (
            <Text key={index}>
              {chalk.green(result.match)} - {result.title}
            </Text>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

const EditorDemo: React.FC = () => {
  const [content] = useState([
    '# Meeting Notes',
    '',
    '## Attendees',
    '- Alice (Product Manager)',
    '- Bob (Developer)',
    '- Charlie (Designer)',
    '',
    '## Discussion Points',
    '1. Feature roadmap review',
    '2. Q1 goals alignment',
    '3. Technical debt prioritization',
    '',
    '## Action Items',
    '- [ ] Update project timeline',
    '- [ ] Schedule follow-up meeting',
    '- [ ] Share meeting notes',
  ]);

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Note Editor (Markdown)</Text>
      <Box marginTop={1} flexDirection="column" borderStyle="single" padding={1}>
        {content.map((line, index) => {
          let formatted = line;
          if (line.startsWith('#')) {
            formatted = chalk.bold.blue(line);
          } else if (line.startsWith('-')) {
            formatted = chalk.yellow(line);
          } else if (line.match(/^\d+\./)) {
            formatted = chalk.green(line);
          }
          return <Text key={index}>{formatted}</Text>;
        })}
      </Box>
      <Text dimColor marginTop={1}>
        Press 'i' to enter insert mode, 'Esc' to exit
      </Text>
    </Box>
  );
};

const MetadataDemo: React.FC = () => {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Note Metadata Panel</Text>
      <Box marginTop={1} flexDirection="column" borderStyle="single" padding={1}>
        <Text>📝 <Text bold>Title:</Text> Meeting Notes</Text>
        <Text>🆔 <Text bold>ID:</Text> note_abc123</Text>
        <Text>📅 <Text bold>Created:</Text> 2024-01-15 10:30</Text>
        <Text>✏️ <Text bold>Modified:</Text> 2024-01-15 14:22</Text>
        <Text>📁 <Text bold>Type:</Text> text/markdown</Text>
        <Box marginTop={1}>
          <Text bold>🏷️ Tags:</Text>
        </Box>
        <Text color="blue">  #meeting #important #q1-planning</Text>
        <Box marginTop={1}>
          <Text bold>🔗 Links:</Text>
        </Box>
        <Text>  → Project Requirements</Text>
        <Text>  → Q1 Roadmap</Text>
        <Box marginTop={1}>
          <Text bold>📎 Attachments:</Text>
        </Box>
        <Text>  • presentation.pdf (2.3 MB)</Text>
        <Text>  • whiteboard.jpg (450 KB)</Text>
      </Box>
    </Box>
  );
};

const DemoApp: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState(0);
  const { exit } = useApp();

  const screens: DemoScreen[] = [
    {
      title: 'Tree Navigation',
      description: 'Navigate through your note hierarchy',
      component: TreeViewDemo,
    },
    {
      title: 'Search Interface',
      description: 'Search notes with advanced filters',
      component: SearchDemo,
    },
    {
      title: 'Note Editor',
      description: 'Edit notes with syntax highlighting',
      component: EditorDemo,
    },
    {
      title: 'Metadata Panel',
      description: 'View and edit note metadata',
      component: MetadataDemo,
    },
  ];

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
    }
    if (key.leftArrow || input === 'h') {
      setCurrentScreen(Math.max(0, currentScreen - 1));
    }
    if (key.rightArrow || input === 'l') {
      setCurrentScreen(Math.min(screens.length - 1, currentScreen + 1));
    }
  });

  const CurrentComponent = screens[currentScreen].component;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="magenta">
          🖼️ Trilium CLI - TUI Demo Showcase
        </Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text>
          Screen {currentScreen + 1}/{screens.length}: {' '}
          <Text bold color="yellow">{screens[currentScreen].title}</Text>
          {' - '}
          <Text dimColor>{screens[currentScreen].description}</Text>
        </Text>
      </Box>

      <Box flexGrow={1}>
        <CurrentComponent />
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" padding={1}>
        <Text>
          Navigate: ←/→ or h/l | Switch screens | q: Quit | 
          {' '}Current: {chalk.cyan(screens[currentScreen].title)}
        </Text>
      </Box>
    </Box>
  );
};

// Run the demo
render(<DemoApp />);