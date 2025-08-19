import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import type { NoteWithContent } from '../../types/api.js';

interface NoteViewerProps {
  note: NoteWithContent;
  onEdit: () => void;
  onRefresh: () => void;
}

export const NoteViewer: React.FC<NoteViewerProps> = ({ note, onEdit, onRefresh }) => {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [viewportHeight] = useState(20); // This would be dynamic in a real implementation

  // Format content based on note type
  const formatContent = (content: string, type: string): string[] => {
    if (!content) return ['(Empty note)'];
    
    if (type === 'text' || type === 'book') {
      // For text notes, preserve line breaks and formatting
      return content.split('\n');
    } else if (type === 'code') {
      // For code notes, add line numbers
      return content.split('\n').map((line, i) => `${String(i + 1).padStart(4, ' ')} │ ${line}`);
    } else if (type === 'render' || type === 'html') {
      // For HTML/render notes, strip tags for now (in real app, would render properly)
      const stripped = content.replace(/<[^>]*>/g, '');
      return stripped.split('\n');
    } else {
      return [content];
    }
  };

  const lines = formatContent(note.content || '', note.type);
  const visibleLines = lines.slice(scrollOffset, scrollOffset + viewportHeight);

  // Metadata section
  const renderMetadata = () => (
    <Box flexDirection="column" marginBottom={1} paddingX={1}>
      <Text bold color="cyan">{note.title}</Text>
      <Text dimColor>
        Type: {note.type} • 
        Created: {note.dateCreated ? new Date(note.dateCreated).toLocaleDateString() : 'Unknown'} • 
        Modified: {note.dateModified ? new Date(note.dateModified).toLocaleDateString() : 'Unknown'}
      </Text>
      {note.isProtected && <Text color="yellow">🔒 Protected Note</Text>}
    </Box>
  );

  // Attributes section
  const renderAttributes = () => {
    if (!note.attributes || note.attributes.length === 0) return null;
    
    return (
      <Box flexDirection="column" marginBottom={1} paddingX={1}>
        <Text dimColor>Attributes:</Text>
        {note.attributes.map(attr => (
          <Text key={attr.attributeId}>
            • {attr.type === 'label' ? '#' : ''}{attr.name}
            {attr.type === 'relation' ? ` → ${attr.value}` : attr.value ? `: ${attr.value}` : ''}
          </Text>
        ))}
      </Box>
    );
  };

  // Content section
  const renderContent = () => (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      <Box borderStyle="single" flexDirection="column" padding={1}>
        {visibleLines.map((line, index) => (
          <Text key={scrollOffset + index} wrap="truncate">
            {line}
          </Text>
        ))}
      </Box>
      {lines.length > viewportHeight && (
        <Text dimColor>
          Lines {scrollOffset + 1}-{Math.min(scrollOffset + viewportHeight, lines.length)} of {lines.length}
        </Text>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" height="100%">
      {renderMetadata()}
      {renderAttributes()}
      {renderContent()}
      
      <Box paddingX={1} marginTop={1}>
        <Text dimColor>
          Press 'e' to edit • 'r' to refresh • '↑↓' to scroll
        </Text>
      </Box>
    </Box>
  );
};