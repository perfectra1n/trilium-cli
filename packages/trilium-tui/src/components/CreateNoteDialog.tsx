import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import type { ETAPIClient } from '../api/client.js';

interface CreateNoteDialogProps {
  client: ETAPIClient;
  parentNoteId: string;
  onClose: () => void;
  onCreated: (noteId: string) => void;
}

type CreateStep = 'title' | 'type' | 'content' | 'confirm';

const noteTypes = [
  { label: '📝 Text', value: 'text' },
  { label: '💻 Code', value: 'code' },
  { label: '📚 Book', value: 'book' },
  { label: '🎨 Render', value: 'render' },
  { label: '🔍 Search', value: 'search' },
  { label: '📎 File', value: 'file' },
];

export const CreateNoteDialog: React.FC<CreateNoteDialogProps> = ({
  client,
  parentNoteId,
  onClose,
  onCreated
}) => {
  const [step, setStep] = useState<CreateStep>('title');
  const [title, setTitle] = useState('');
  const [noteType, setNoteType] = useState('text');
  const [content, setContent] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTitleSubmit = (value: string) => {
    setTitle(value);
    setStep('type');
  };

  const handleTypeSelect = (item: { value: string }) => {
    setNoteType(item.value);
    setStep('content');
  };

  const handleContentSubmit = (value: string) => {
    setContent(value);
    setStep('confirm');
  };

  const createNote = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const result = await client.createNote({
        parentNoteId,
        title,
        type: noteType as any,
        content
      });

      onCreated(result.note.noteId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create note');
      setIsCreating(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'title':
        return (
          <Box flexDirection="column">
            <Text>Enter note title:</Text>
            <Box marginTop={1}>
              <TextInput
                value={title}
                onChange={setTitle}
                onSubmit={handleTitleSubmit}
                placeholder="My New Note"
              />
            </Box>
          </Box>
        );

      case 'type':
        return (
          <Box flexDirection="column">
            <Text>Select note type:</Text>
            <Box marginTop={1}>
              <SelectInput
                items={noteTypes}
                onSelect={handleTypeSelect}
              />
            </Box>
          </Box>
        );

      case 'content':
        return (
          <Box flexDirection="column">
            <Text>Enter initial content (optional):</Text>
            <Box marginTop={1}>
              <TextInput
                value={content}
                onChange={setContent}
                onSubmit={handleContentSubmit}
                placeholder="Start typing..."
              />
            </Box>
            <Box marginTop={1}>
              <Text dimColor>
                Press Enter to skip or continue
              </Text>
            </Box>
          </Box>
        );

      case 'confirm':
        return (
          <Box flexDirection="column">
            <Text bold color="green">Review new note:</Text>
            <Box flexDirection="column" marginTop={1}>
              <Text>Title: {title}</Text>
              <Text>Type: {noteType}</Text>
              <Text>Content: {content || '(empty)'}</Text>
              <Text>Parent: {parentNoteId}</Text>
            </Box>
            {error && (
              <Box marginTop={1}>
                <Text color="red">Error: {error}</Text>
              </Box>
            )}
            {isCreating ? (
              <Box marginTop={1}><Text>Creating note...</Text></Box>
            ) : (
              <Box marginTop={1}>
                <SelectInput
                  items={[
                    { label: '✅ Create Note', value: 'create' },
                    { label: '❌ Cancel', value: 'cancel' },
                    { label: '✏️ Edit', value: 'edit' }
                  ]}
                  onSelect={(item) => {
                    if (item.value === 'create') {
                      createNote();
                    } else if (item.value === 'cancel') {
                      onClose();
                    } else {
                      setStep('title');
                    }
                  }}
                />
              </Box>
            )}
          </Box>
        );
    }
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="green"
      padding={1}
      width={60}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="green">📝 Create New Note</Text>
      </Box>
      
      {renderStep()}
      
      <Box marginTop={1}>
        <Text dimColor>
          Press ESC to cancel at any time
        </Text>
      </Box>
    </Box>
  );
};