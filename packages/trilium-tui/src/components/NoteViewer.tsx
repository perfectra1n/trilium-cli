import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, type DOMElement } from 'ink';
import type { Note } from '@trilium-cli/zod';
import { htmlToMarkdown, detectContentType } from '../utils/markdown.js';

interface NoteViewerProps {
  note: Note & { content?: string };
  onEdit: () => void;
  onRefresh: () => void;
}

export const NoteViewer: React.FC<NoteViewerProps> = ({ note, onEdit, onRefresh }) => {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(20);
  const [contentRef, setContentRef] = useState<DOMElement | null>(null);

  // Reset scroll when note changes
  useEffect(() => {
    setScrollOffset(0);
  }, [note.noteId]);

  // Measure viewport height dynamically
  useEffect(() => {
    if (contentRef) {
      // Use a fixed viewport height since ink doesn't support measureElement reliably
      // This would need proper terminal size detection in a real implementation
      const availableHeight = 20;
      setViewportHeight(availableHeight);
    }
  }, [contentRef]);

  // Format content based on note type
  const formatContent = useCallback((content: string, type: string): string[] => {
    if (!content) return ['(Empty note)'];
    
    // For text and HTML notes, convert to markdown for better readability
    if (type === 'text' || type === 'book' || type === 'render' || type === 'html') {
      const contentType = detectContentType(content);
      
      // Convert HTML to Markdown for better readability in terminal
      if (contentType === 'html') {
        const markdown = htmlToMarkdown(content);
        return markdown.split('\n');
      } else if (contentType === 'markdown') {
        // Already markdown, just split into lines
        return content.split('\n');
      } else {
        // Plain text, preserve as is
        return content.split('\n');
      }
    } else if (type === 'code') {
      // For code notes, add line numbers
      const lines = content.split('\n');
      return lines.map((line, i) => `${String(i + 1).padStart(4, ' ')} │ ${line}`);
    } else if (type === 'mermaid') {
      // For mermaid diagrams, show the source
      const lines = content.split('\n');
      return ['[Mermaid Diagram]', '---', ...lines];
    } else {
      // Default: just split into lines
      return content.split('\n');
    }
  }, []);

  const lines = formatContent(note.content || '', note.type);
  const maxScroll = Math.max(0, lines.length - viewportHeight);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportHeight);

  // Scroll handlers
  const scrollUp = useCallback((amount = 1) => {
    setScrollOffset(prev => Math.max(0, prev - amount));
  }, []);

  const scrollDown = useCallback((amount = 1) => {
    setScrollOffset(prev => Math.min(maxScroll, prev + amount));
  }, [maxScroll]);

  const scrollToTop = useCallback(() => {
    setScrollOffset(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    setScrollOffset(maxScroll);
  }, [maxScroll]);

  // Handle keyboard and mouse input for scrolling
  useInput((input, key) => {
    // Keyboard scrolling
    if (key.upArrow || input === 'k') {
      scrollUp();
    } else if (key.downArrow || input === 'j') {
      scrollDown();
    } else if (key.pageUp || (key.ctrl && input === 'b')) {
      scrollUp(Math.floor(viewportHeight / 2));
    } else if (key.pageDown || (key.ctrl && input === 'f')) {
      scrollDown(Math.floor(viewportHeight / 2));
    } else if (input === 'g') {
      scrollToTop();
    } else if (input === 'G') {
      scrollToBottom();
    } else if (input === 'e') {
      onEdit();
    } else if (input === 'r') {
      onRefresh();
    }
    
    // Mouse wheel scrolling support (if terminal supports it)
    // Mouse wheel events are typically sent as arrow keys in many terminals
    // Some terminals send specific escape sequences for mouse wheel
    if (typeof input === 'string' && input.includes('\x1b[<64;')) {
      // Scroll up
      scrollUp(3);
    } else if (typeof input === 'string' && input.includes('\x1b[<65;')) {
      // Scroll down
      scrollDown(3);
    }
  });

  // Metadata section
  const renderMetadata = () => (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      <Text bold color="cyan">{note.title}</Text>
      <Box>
        <Text dimColor>
          Type: {note.type} • 
          {note.dateCreated && ` Created: ${new Date(note.dateCreated).toLocaleDateString()}`}
          {note.dateModified && ` • Modified: ${new Date(note.dateModified).toLocaleDateString()}`}
        </Text>
      </Box>
      {note.isProtected && <Text color="yellow">🔒 Protected Note</Text>}
    </Box>
  );

  // Attributes section
  const renderAttributes = () => {
    if (!note.attributes || note.attributes.length === 0) return null;
    
    return (
      <Box flexDirection="column" marginBottom={1} paddingX={1}>
        <Text dimColor>Attributes:</Text>
        {note.attributes.slice(0, 5).map(attr => (
          <Text key={attr.attributeId}>
            • {attr.type === 'label' ? '#' : ''}{attr.name}
            {attr.type === 'relation' ? ` → ${attr.value}` : attr.value ? `: ${attr.value}` : ''}
          </Text>
        ))}
        {note.attributes.length > 5 && (
          <Text dimColor>... and {note.attributes.length - 5} more</Text>
        )}
      </Box>
    );
  };

  // Scroll indicator
  const renderScrollBar = () => {
    if (lines.length <= viewportHeight) return null;

    const scrollPercentage = scrollOffset / maxScroll;
    const barHeight = Math.max(1, Math.floor(viewportHeight * (viewportHeight / lines.length)));
    const barPosition = Math.floor((viewportHeight - barHeight) * scrollPercentage);

    return (
      <Box flexDirection="column" marginLeft={1}>
        {Array.from({ length: viewportHeight }).map((_, i) => {
          const isBar = i >= barPosition && i < barPosition + barHeight;
          return (
            <Text key={i} color={isBar ? 'blue' : 'gray'}>
              {isBar ? '█' : '│'}
            </Text>
          );
        })}
      </Box>
    );
  };

  // Content section
  const renderContent = () => (
    <Box flexGrow={1} flexDirection="row">
      <Box flexDirection="column" flexGrow={1} paddingX={1} ref={setContentRef}>
        <Box borderStyle="single" flexDirection="column" padding={1} flexGrow={1}>
          {visibleLines.length === 0 ? (
            <Text dimColor>(No content to display)</Text>
          ) : (
            visibleLines.map((line, index) => (
              <Text key={`${scrollOffset}-${index}`} wrap="truncate">
                {line || ' '}
              </Text>
            ))
          )}
        </Box>
      </Box>
      {renderScrollBar()}
    </Box>
  );

  // Footer with scroll info and shortcuts
  const renderFooter = () => (
    <Box paddingX={1} marginTop={1} justifyContent="space-between">
      <Text dimColor>
        e: edit • r: refresh • j/k: scroll • g/G: top/bottom
      </Text>
      {lines.length > viewportHeight && (
        <Text dimColor>
          {scrollOffset + 1}-{Math.min(scrollOffset + viewportHeight, lines.length)}/{lines.length}
        </Text>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" height="100%">
      {renderMetadata()}
      {renderAttributes()}
      {renderContent()}
      {renderFooter()}
    </Box>
  );
};