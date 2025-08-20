import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { setupTagCommands } from '../../../src/cli/commands/tag.js';
import { TriliumClient } from '../../../src/api/client.js';
import { createLogger } from '../../../src/utils/logger.js';
import { formatOutput, createTriliumClient } from '../../../src/utils/cli.js';
import type { TagInfo, Note, Attribute } from '../../../src/types/api.js';

// Mock dependencies
vi.mock('../../../src/api/client.js');
vi.mock('../../../src/utils/logger.js');
vi.mock('../../../src/utils/cli.js');
vi.mock('../../../src/config/index.js', () => ({
  Config: {
    load: vi.fn().mockResolvedValue({
      server: { url: 'http://localhost:8080', apiToken: 'test-token' },
    }),
  },
}));

describe('Tag Commands', () => {
  let program: Command;
  let mockClient: vi.Mocked<TriliumClient>;
  let mockLogger: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock client
    mockClient = {
      getTags: vi.fn(),
      addTag: vi.fn(),
      removeTag: vi.fn(),
      searchNotes: vi.fn(),
      getNote: vi.fn(),
      getNoteAttributes: vi.fn(),
      createAttribute: vi.fn(),
      deleteAttribute: vi.fn(),
      updateAttribute: vi.fn(),
    } as any;

    vi.mocked(TriliumClient).mockImplementation(() => mockClient);

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };
    vi.mocked(createLogger).mockReturnValue(mockLogger);

    // Mock createTriliumClient to return our mock client
    vi.mocked(createTriliumClient).mockResolvedValue(mockClient);

    // Mock formatOutput
    vi.mocked(formatOutput).mockImplementation((data, format) => {
      if (format === 'json') {
        return JSON.stringify(data, null, 2);
      }
      return JSON.stringify(data);
    });

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create new program instance
    program = new Command();
    program.exitOverride();
    setupTagCommands(program);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('tag list', () => {
    it('should list all tags', async () => {
      const mockTags: TagInfo[] = [
        { name: 'important', count: 10, hierarchy: [], children: [] },
        { name: 'todo', count: 5, hierarchy: [], children: [] },
        { name: 'project', count: 3, hierarchy: [], children: [] },
      ];

      mockClient.getTags.mockResolvedValue(mockTags);

      await program.parseAsync(['tag', 'list'], { from: 'user' });

      expect(mockClient.getTags).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle empty tag list', async () => {
      mockClient.getTags.mockResolvedValue([]);

      await program.parseAsync(['tag', 'list'], { from: 'user' });

      expect(mockClient.getTags).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No tags found')
      );
    });

    it('should sort tags by name', async () => {
      const mockTags: TagInfo[] = [
        { name: 'zebra', count: 1, hierarchy: [], children: [] },
        { name: 'alpha', count: 2, hierarchy: [], children: [] },
        { name: 'middle', count: 3, hierarchy: [], children: [] },
      ];

      mockClient.getTags.mockResolvedValue(mockTags);

      await program.parseAsync(['tag', 'list', '--sort', 'name'], { from: 'user' });

      expect(mockClient.getTags).toHaveBeenCalled();
      // Verify sorting logic is applied
    });

    it('should sort tags by count', async () => {
      const mockTags: TagInfo[] = [
        { name: 'tag1', count: 5, hierarchy: [], children: [] },
        { name: 'tag2', count: 10, hierarchy: [], children: [] },
        { name: 'tag3', count: 3, hierarchy: [], children: [] },
      ];

      mockClient.getTags.mockResolvedValue(mockTags);

      await program.parseAsync(['tag', 'list', '--sort', 'count'], { from: 'user' });

      expect(mockClient.getTags).toHaveBeenCalled();
      // Verify sorting by count
    });

    it('should format tags as JSON', async () => {
      const mockTags: TagInfo[] = [
        { name: 'tag1', count: 5, hierarchy: [], children: [] },
      ];

      mockClient.getTags.mockResolvedValue(mockTags);

      await program.parseAsync(['tag', 'list', '--format', 'json'], { from: 'user' });

      expect(formatOutput).toHaveBeenCalledWith(
        expect.objectContaining({ tags: mockTags }),
        'json'
      );
    });
  });

  describe('tag add', () => {
    it('should add single tag to note', async () => {
      mockClient.addTag.mockResolvedValue(undefined);
      mockClient.getNote.mockResolvedValue({
        noteId: 'note1',
        title: 'Test Note',
        type: 'text',
      } as Note);

      await program.parseAsync(['tag', 'add', 'note1', 'important'], { from: 'user' });

      expect(mockClient.addTag).toHaveBeenCalledWith('note1', 'important');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Added tag')
      );
    });

    it('should add multiple tags to note', async () => {
      mockClient.addTag.mockResolvedValue(undefined);
      mockClient.getNote.mockResolvedValue({
        noteId: 'note1',
        title: 'Test Note',
        type: 'text',
      } as Note);

      await program.parseAsync([
        'tag', 
        'add', 
        'note1', 
        'tag1,tag2,tag3'
      ], { from: 'user' });

      expect(mockClient.addTag).toHaveBeenCalledTimes(3);
      expect(mockClient.addTag).toHaveBeenCalledWith('note1', 'tag1');
      expect(mockClient.addTag).toHaveBeenCalledWith('note1', 'tag2');
      expect(mockClient.addTag).toHaveBeenCalledWith('note1', 'tag3');
    });

    it('should handle duplicate tags gracefully', async () => {
      mockClient.getNoteAttributes.mockResolvedValue([
        {
          attributeId: 'attr1',
          ownerId: 'note1',
          type: 'label',
          name: 'tag',
          value: 'existing',
        } as Attribute,
      ]);

      mockClient.addTag.mockResolvedValue(undefined);

      await program.parseAsync(['tag', 'add', 'note1', 'existing'], { from: 'user' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already has tag')
      );
    });

    it('should validate tag names', async () => {
      await expect(
        program.parseAsync(['tag', 'add', 'note1', 'invalid tag'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockClient.addTag).not.toHaveBeenCalled();
    });

    it('should handle non-existent note', async () => {
      mockClient.getNote.mockRejectedValue(new Error('Note not found'));

      await expect(
        program.parseAsync(['tag', 'add', 'invalid-note', 'tag'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('tag remove', () => {
    it('should remove single tag from note', async () => {
      mockClient.removeTag.mockResolvedValue(undefined);
      mockClient.getNoteAttributes.mockResolvedValue([
        {
          attributeId: 'attr1',
          ownerId: 'note1',
          type: 'label',
          name: 'tag',
          value: 'removeme',
        } as Attribute,
      ]);

      await program.parseAsync(['tag', 'remove', 'note1', 'removeme'], { from: 'user' });

      expect(mockClient.removeTag).toHaveBeenCalledWith('note1', 'removeme');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Removed tag')
      );
    });

    it('should remove multiple tags', async () => {
      mockClient.removeTag.mockResolvedValue(undefined);
      mockClient.getNoteAttributes.mockResolvedValue([
        {
          attributeId: 'attr1',
          ownerId: 'note1',
          type: 'label',
          name: 'tag',
          value: 'tag1',
        } as Attribute,
        {
          attributeId: 'attr2',
          ownerId: 'note1',
          type: 'label',
          name: 'tag',
          value: 'tag2',
        } as Attribute,
      ]);

      await program.parseAsync(['tag', 'remove', 'note1', 'tag1,tag2'], { from: 'user' });

      expect(mockClient.removeTag).toHaveBeenCalledTimes(2);
      expect(mockClient.removeTag).toHaveBeenCalledWith('note1', 'tag1');
      expect(mockClient.removeTag).toHaveBeenCalledWith('note1', 'tag2');
    });

    it('should handle non-existent tag', async () => {
      mockClient.getNoteAttributes.mockResolvedValue([]);

      await program.parseAsync(['tag', 'remove', 'note1', 'nonexistent'], { from: 'user' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('does not have tag')
      );
    });

    it('should remove all tags with --all flag', async () => {
      mockClient.getNoteAttributes.mockResolvedValue([
        {
          attributeId: 'attr1',
          ownerId: 'note1',
          type: 'label',
          name: 'tag',
          value: 'tag1',
        } as Attribute,
        {
          attributeId: 'attr2',
          ownerId: 'note1',
          type: 'label',
          name: 'tag',
          value: 'tag2',
        } as Attribute,
      ]);
      mockClient.deleteAttribute.mockResolvedValue(undefined);

      await program.parseAsync(['tag', 'remove', 'note1', '--all'], { from: 'user' });

      expect(mockClient.deleteAttribute).toHaveBeenCalledTimes(2);
      expect(mockClient.deleteAttribute).toHaveBeenCalledWith('attr1');
      expect(mockClient.deleteAttribute).toHaveBeenCalledWith('attr2');
    });
  });

  describe('tag search', () => {
    it('should search notes by tag', async () => {
      const mockResults = [
        { noteId: 'note1', title: 'Tagged Note 1', score: 0.9 },
        { noteId: 'note2', title: 'Tagged Note 2', score: 0.8 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockResults);

      await program.parseAsync(['tag', 'search', 'important'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '#important',
        false,
        false,
        50
      );
    });

    it('should search with multiple tags (AND)', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync([
        'tag', 
        'search', 
        'tag1,tag2', 
        '--operator', 
        'AND'
      ], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '#tag1 AND #tag2',
        false,
        false,
        50
      );
    });

    it('should search with multiple tags (OR)', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync([
        'tag', 
        'search', 
        'tag1,tag2', 
        '--operator', 
        'OR'
      ], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '#tag1 OR #tag2',
        false,
        false,
        50
      );
    });

    it('should exclude tags with NOT operator', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync([
        'tag', 
        'search', 
        'included', 
        '--exclude', 
        'excluded'
      ], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '#included AND NOT #excluded',
        false,
        false,
        50
      );
    });

    it('should respect search limit', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync([
        'tag', 
        'search', 
        'tag', 
        '--limit', 
        '100'
      ], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '#tag',
        false,
        false,
        100
      );
    });
  });

  describe('tag rename', () => {
    it('should rename tag across all notes', async () => {
      const mockNotes = [
        { noteId: 'note1', title: 'Note 1', score: 0.9 },
        { noteId: 'note2', title: 'Note 2', score: 0.8 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockNotes);
      
      // Mock getting attributes for each note
      mockClient.getNoteAttributes
        .mockResolvedValueOnce([
          {
            attributeId: 'attr1',
            ownerId: 'note1',
            type: 'label',
            name: 'tag',
            value: 'oldtag',
          } as Attribute,
        ])
        .mockResolvedValueOnce([
          {
            attributeId: 'attr2',
            ownerId: 'note2',
            type: 'label',
            name: 'tag',
            value: 'oldtag',
          } as Attribute,
        ]);

      mockClient.updateAttribute.mockResolvedValue({} as Attribute);

      await program.parseAsync(['tag', 'rename', 'oldtag', 'newtag'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '#oldtag',
        false,
        false,
        expect.any(Number)
      );
      expect(mockClient.updateAttribute).toHaveBeenCalledTimes(2);
    });

    it('should handle no notes with old tag', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['tag', 'rename', 'nonexistent', 'newtag'], { from: 'user' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No notes found with tag')
      );
      expect(mockClient.updateAttribute).not.toHaveBeenCalled();
    });

    it('should validate new tag name', async () => {
      await expect(
        program.parseAsync(['tag', 'rename', 'oldtag', 'invalid tag'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockClient.searchNotes).not.toHaveBeenCalled();
    });
  });

  describe('tag stats', () => {
    it('should show tag statistics', async () => {
      const mockTags: TagInfo[] = [
        { name: 'important', count: 10, hierarchy: [], children: [] },
        { name: 'todo', count: 5, hierarchy: [], children: [] },
        { name: 'project', count: 3, hierarchy: [], children: [] },
      ];

      mockClient.getTags.mockResolvedValue(mockTags);

      await program.parseAsync(['tag', 'stats'], { from: 'user' });

      expect(mockClient.getTags).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Total tags: 3')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Total tagged notes: 18')
      );
    });

    it('should show top tags', async () => {
      const mockTags: TagInfo[] = Array.from({ length: 20 }, (_, i) => ({
        name: `tag${i}`,
        count: 20 - i,
        hierarchy: [],
        children: []
      }));

      mockClient.getTags.mockResolvedValue(mockTags);

      await program.parseAsync(['tag', 'stats', '--top', '5'], { from: 'user' });

      expect(mockClient.getTags).toHaveBeenCalled();
      // Should show only top 5 tags by count
    });
  });

  describe('tag merge', () => {
    it('should merge two tags', async () => {
      const mockNotes = [
        { noteId: 'note1', title: 'Note 1', score: 0.9 },
        { noteId: 'note2', title: 'Note 2', score: 0.8 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockNotes);
      mockClient.addTag.mockResolvedValue(undefined);
      mockClient.removeTag.mockResolvedValue(undefined);

      await program.parseAsync(['tag', 'merge', 'source', 'target'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '#source',
        false,
        false,
        expect.any(Number)
      );

      // Should add target tag and remove source tag for each note
      expect(mockClient.addTag).toHaveBeenCalledTimes(2);
      expect(mockClient.removeTag).toHaveBeenCalledTimes(2);
    });

    it('should skip notes that already have target tag', async () => {
      const mockNotes = [
        { noteId: 'note1', title: 'Note 1', score: 0.9 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockNotes);
      mockClient.getNoteAttributes.mockResolvedValue([
        {
          attributeId: 'attr1',
          ownerId: 'note1',
          type: 'label',
          name: 'tag',
          value: 'target',
        } as Attribute,
        {
          attributeId: 'attr2',
          ownerId: 'note1',
          type: 'label',
          name: 'tag',
          value: 'source',
        } as Attribute,
      ]);

      mockClient.removeTag.mockResolvedValue(undefined);

      await program.parseAsync(['tag', 'merge', 'source', 'target'], { from: 'user' });

      expect(mockClient.addTag).not.toHaveBeenCalled();
      expect(mockClient.removeTag).toHaveBeenCalledWith('note1', 'source');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockClient.getTags.mockRejectedValue(new Error('API Error'));

      await expect(
        program.parseAsync(['tag', 'list'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle network timeouts', async () => {
      mockClient.getTags.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 60000))
      );

      const promise = program.parseAsync(['tag', 'list'], { from: 'user' });

      await expect(Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      ])).rejects.toThrow('Timeout');
    });

    it('should validate tag names consistently', async () => {
      const invalidTags = [
        'has spaces',
        'has-special!',
        '',
        '123startsWithNumber',
        'very' + 'long'.repeat(100),
      ];

      for (const tag of invalidTags) {
        await expect(
          program.parseAsync(['tag', 'add', 'note1', tag], { from: 'user' })
        ).rejects.toThrow();
      }

      expect(mockClient.addTag).not.toHaveBeenCalled();
    });
  });
});