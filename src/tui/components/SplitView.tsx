/**
 * SplitView component for split pane layout
 */

import React from 'react';
import { Box } from 'ink';
import type { Note, NoteTreeItem } from '../../types/api.js';
import { SplitPane } from '../types/index.js';
import { TreeView } from './TreeView.js';
import { ContentView } from './ContentView.js';

interface SplitViewProps {
  treeItems: NoteTreeItem[];
  selectedIndex: number;
  currentNote: Note | null;
  currentContent: string | null;
  contentScroll: number;
  splitRatio: number;
  focusedPane: SplitPane;
}

export function SplitView({
  treeItems,
  selectedIndex,
  currentNote,
  currentContent,
  contentScroll,
  splitRatio,
  focusedPane,
}: SplitViewProps): JSX.Element {
  // Convert split ratio to percentage
  const leftPercentage = Math.round(splitRatio * 100);
  const rightPercentage = 100 - leftPercentage;
  
  // Flatten tree items for TreeView
  const flatTreeItems = flattenTreeItems(treeItems);
  
  return (
    <Box flexDirection="row" height="100%">
      {/* Left pane - Tree */}
      <Box 
        width={`${leftPercentage}%`} 
        borderStyle="single" 
        borderColor={focusedPane === SplitPane.Left ? 'yellow' : 'white'}
      >
        <TreeView
          items={flatTreeItems}
          selectedIndex={selectedIndex}
          bookmarkedNotes={[]} // TODO: Pass bookmarked notes from parent
        />
      </Box>
      
      {/* Right pane - Content */}
      <Box 
        flexGrow={1}
        borderStyle="single" 
        borderColor={focusedPane === SplitPane.Right ? 'yellow' : 'white'}
        borderLeft={false}
      >
        <ContentView
          note={currentNote}
          content={currentContent}
          contentScroll={contentScroll}
          viewMode="Content" as any // Force content view mode
          recentNotes={[]}
          bookmarkedNotes={[]}
          selectedIndex={0}
        />
      </Box>
    </Box>
  );
}

// Helper function to flatten tree items for display
function flattenTreeItems(items: NoteTreeItem[]): Array<NoteTreeItem & { depth: number }> {
  const result: Array<NoteTreeItem & { depth: number }> = [];
  
  function traverse(nodes: NoteTreeItem[], depth = 0) {
    for (const node of nodes) {
      result.push({ ...node, depth });
      
      if (node.isExpanded && node.children.length > 0) {
        traverse(node.children, depth + 1);
      }
    }
  }
  
  traverse(items);
  return result;
}