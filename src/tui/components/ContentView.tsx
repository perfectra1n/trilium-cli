/**
 * ContentView component for displaying note content and metadata
 */

import { Box, Text } from 'ink';
import React from 'react';

import type { Note } from '../../types/api.js';
import { ViewMode } from '../types/index.js';
import type { RecentNote, BookmarkedNote } from '../types/index.js';

interface ContentViewProps {
  note: Note | null;
  content: string | null;
  contentScroll: number;
  viewMode: ViewMode;
  recentNotes: RecentNote[];
  bookmarkedNotes: BookmarkedNote[];
  selectedIndex: number;
}

export function ContentView({ 
  note, 
  content, 
  contentScroll, 
  viewMode, 
  recentNotes, 
  bookmarkedNotes, 
  selectedIndex 
}: ContentViewProps): JSX.Element {
  
  // Render different views based on mode
  switch (viewMode) {
    case ViewMode.Recent:
      return <RecentNotesView notes={recentNotes} selectedIndex={selectedIndex} />;
    case ViewMode.Bookmarks:
      return <BookmarksView notes={bookmarkedNotes} selectedIndex={selectedIndex} />;
    case ViewMode.Attributes:
      return <AttributesView note={note} />;
    default:
      return <NoteContentView note={note} content={content} contentScroll={contentScroll} />;
  }
}

interface NoteContentViewProps {
  note: Note | null;
  content: string | null;
  contentScroll: number;
}

function NoteContentView({ note, content, contentScroll }: NoteContentViewProps): JSX.Element {
  if (!note) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="single" borderColor="white" paddingX={1}>
          <Text bold> Content </Text>
        </Box>
        
        <Box flexDirection="column" padding={1} flexGrow={1}>
          <Text dimColor>Select a note to view its content</Text>
          <Box marginTop={2}>
            <Text bold color="cyan">Enhanced Navigation Features:</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>  j/k or ↑/↓    - Navigate up/down</Text>
              <Text>  h/l or ←/→    - Left/right (collapse/expand)</Text>
              <Text>  g/G           - Go to top/bottom</Text>
              <Text>  o/Enter       - Open/load note</Text>
              <Text>  c             - Collapse current</Text>
              <Text></Text>
              <Text>  /             - Fuzzy search (real-time)</Text>
              <Text>  n/N           - Next/previous search match</Text>
              <Text></Text>
              <Text>  R             - Recent notes</Text>
              <Text>  B             - Bookmarks</Text>
              <Text>  b             - Toggle bookmark</Text>
              <Text></Text>
              <Text>  s             - Split view</Text>
              <Text>  &lt; / &gt;         - Resize split panes</Text>
              <Text></Text>
              <Text>  Tab           - Cycle views</Text>
              <Text>  r             - Refresh tree</Text>
              <Text>  q             - Quit</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  }

  const contentLines = content ? content.split('\n') : [];
  const visibleLines = contentLines.slice(contentScroll);

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="white" paddingX={1}>
        <Text bold> Content </Text>
      </Box>
      
      <Box flexDirection="column" padding={1} flexGrow={1}>
        {/* Note metadata */}
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold color="cyan">Title: </Text>
            <Text>{note.title}</Text>
          </Box>
          <Box>
            <Text bold color="cyan">ID: </Text>
            <Text>{note.noteId}</Text>
          </Box>
          <Box>
            <Text bold color="cyan">Type: </Text>
            <Text>{note.type}</Text>
          </Box>
          <Box>
            <Text bold color="cyan">Created: </Text>
            <Text>{formatDate(note.dateCreated)}</Text>
          </Box>
          <Box>
            <Text bold color="cyan">Modified: </Text>
            <Text>{formatDate(note.dateModified)}</Text>
          </Box>
        </Box>
        
        {/* Content separator */}
        <Box marginBottom={1}>
          <Text>{'─'.repeat(50)}</Text>
        </Box>
        
        {/* Note content */}
        <Box flexDirection="column">
          {content ? (
            visibleLines.map((line, index) => (
              <Text key={index}>{line || ' '}</Text>
            ))
          ) : (
            <Text dimColor>Loading content...</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

interface RecentNotesViewProps {
  notes: RecentNote[];
  selectedIndex: number;
}

function RecentNotesView({ notes, selectedIndex }: RecentNotesViewProps): JSX.Element {
  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="white" paddingX={1}>
        <Text bold> Recent Notes </Text>
      </Box>
      
      <Box flexDirection="column" padding={1} flexGrow={1}>
        {notes.length === 0 ? (
          <Text dimColor>No recent notes</Text>
        ) : (
          notes.map((note, index) => (
            <Box key={note.ownerId}>
              <Text 
                color={index === selectedIndex ? 'black' : 'white'}
                backgroundColor={index === selectedIndex ? 'white' : undefined}
                bold={index === selectedIndex}
              >
                {note.title} ({formatTimeAgo(note.accessedAt)})
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

interface BookmarksViewProps {
  notes: BookmarkedNote[];
  selectedIndex: number;
}

function BookmarksView({ notes, selectedIndex }: BookmarksViewProps): JSX.Element {
  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <Text bold color="yellow"> Bookmarked Notes </Text>
      </Box>
      
      <Box flexDirection="column" padding={1} flexGrow={1}>
        {notes.length === 0 ? (
          <Text dimColor>No bookmarked notes</Text>
        ) : (
          notes.map((note, index) => (
            <Box key={note.ownerId}>
              <Text 
                color={index === selectedIndex ? 'black' : 'white'}
                backgroundColor={index === selectedIndex ? 'white' : undefined}
                bold={index === selectedIndex}
              >
                ★ {note.title} ({formatTimeAgo(note.bookmarkedAt)})
              </Text>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

interface AttributesViewProps {
  note: Note | null;
}

function AttributesView({ note }: AttributesViewProps): JSX.Element {
  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="white" paddingX={1}>
        <Text bold> Attributes </Text>
      </Box>
      
      <Box flexDirection="column" padding={1} flexGrow={1}>
        {!note ? (
          <Text dimColor>Select a note to view its attributes</Text>
        ) : (
          <Box flexDirection="column">
            <Text bold color="cyan">
              Attributes for: {note.title}
            </Text>
            
            <Box marginTop={1}>
              {note.attributes && note.attributes.length > 0 ? (
                note.attributes.map((attr, index) => (
                  <Box key={index}>
                    <Text>
                      {attr.type}: {attr.name} = {attr.value || '(empty)'}
                    </Text>
                  </Box>
                ))
              ) : (
                <Text dimColor>No attributes</Text>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// Helper functions
function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString();
  } catch {
    return dateString;
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  
  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return 'just now';
  }
}