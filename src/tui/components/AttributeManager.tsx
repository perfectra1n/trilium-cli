import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import type { TriliumClient } from '../../api/client.js';
import type { Attribute } from '../../types/api.js';

interface AttributeManagerProps {
  client: TriliumClient;
  noteId: string;
  onClose: () => void;
}

type AttributeAction = 'view' | 'add' | 'edit' | 'delete';

export const AttributeManager: React.FC<AttributeManagerProps> = ({
  client,
  noteId,
  onClose
}) => {
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [action, setAction] = useState<AttributeAction>('view');
  const [selectedAttribute, setSelectedAttribute] = useState<Attribute | null>(null);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');
  const [newAttrType, setNewAttrType] = useState<'label' | 'relation'>('label');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAttributes();
  }, [noteId]);

  const loadAttributes = async () => {
    setIsLoading(true);
    try {
      const attrs = await client.getNoteAttributes(noteId);
      setAttributes(attrs);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attributes');
      setIsLoading(false);
    }
  };

  const addAttribute = async () => {
    try {
      await client.createAttribute({
        noteId,
        type: newAttrType,
        name: newAttrName,
        value: newAttrValue,
        isInheritable: false
      });
      await loadAttributes();
      setAction('view');
      setNewAttrName('');
      setNewAttrValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add attribute');
    }
  };

  const deleteAttribute = async (attributeId: string) => {
    try {
      await client.deleteAttribute(attributeId);
      await loadAttributes();
      setAction('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete attribute');
    }
  };

  const renderAttributeList = () => (
    <Box flexDirection="column">
      {attributes.length === 0 ? (
        <Text dimColor>No attributes</Text>
      ) : (
        attributes.map(attr => (
          <Box key={attr.attributeId} marginBottom={1}>
            <Text color={attr.type === 'label' ? 'yellow' : 'blue'}>
              {attr.type === 'label' ? '#' : '~'}{attr.name}
            </Text>
            {attr.value && <Text>: {attr.value}</Text>}
            {attr.isInheritable && <Text dimColor> (inherited)</Text>}
          </Box>
        ))
      )}
    </Box>
  );

  const renderAddForm = () => (
    <Box flexDirection="column">
      <Text>Attribute Type:</Text>
      <SelectInput
        items={[
          { label: '🏷️ Label', value: 'label' },
          { label: '🔗 Relation', value: 'relation' }
        ]}
        onSelect={(item) => setNewAttrType(item.value as 'label' | 'relation')}
      />
      
      <Box marginTop={1}><Text>Name:</Text></Box>
      <TextInput
        value={newAttrName}
        onChange={setNewAttrName}
        placeholder="attribute-name"
      />
      
      {newAttrType === 'relation' && (
        <>
          <Box marginTop={1}><Text>Target Note ID:</Text></Box>
          <TextInput
            value={newAttrValue}
            onChange={setNewAttrValue}
            placeholder="noteId"
          />
        </>
      )}
      
      <Box marginTop={1}>
        <SelectInput
          items={[
            { label: '✅ Add', value: 'add' },
            { label: '❌ Cancel', value: 'cancel' }
          ]}
          onSelect={(item) => {
            if (item.value === 'add') {
              addAttribute();
            } else {
              setAction('view');
            }
          }}
        />
      </Box>
    </Box>
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      padding={1}
      width={60}
      height={30}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="blue">🏷️ Attribute Manager</Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {isLoading ? (
        <Text>Loading attributes...</Text>
      ) : action === 'view' ? (
        <>
          {renderAttributeList()}
          <Box marginTop={1}>
            <SelectInput
              items={[
                { label: '➕ Add Attribute', value: 'add' },
                { label: '❌ Close', value: 'close' }
              ]}
              onSelect={(item) => {
                if (item.value === 'add') {
                  setAction('add');
                } else {
                  onClose();
                }
              }}
            />
          </Box>
        </>
      ) : action === 'add' ? (
        renderAddForm()
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>
          Labels organize notes • Relations link notes
        </Text>
      </Box>
    </Box>
  );
};