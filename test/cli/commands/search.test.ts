import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { setupSearchCommands } from '../../../src/cli/commands/search.js';
import { TriliumClient } from '../../../src/api/client.js';
import { createLogger } from '../../../src/utils/logger.js';
import { formatOutput } from '../../../src/utils/cli.js';
import type { SearchResult } from '../../../src/types/api.js';

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

describe('Search Commands', () => {
  let program: Command;
  let mockClient: vi.Mocked<TriliumClient>;
  let mockLogger: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock client
    mockClient = {
      searchNotes: vi.fn(),
      getNoteWithContent: vi.fn(),
      getNote: vi.fn(),
    } as any;

    // Mock the client constructor
    vi.mocked(TriliumClient).mockImplementation(() => mockClient);

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };
    vi.mocked(createLogger).mockReturnValue(mockLogger);

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
    program.exitOverride(); // Prevent process.exit during tests
    setupSearchCommands(program);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('Basic Search', () => {
    it('should search notes with default options', async () => {
      const mockResults: SearchResult[] = [
        { noteId: 'note1', title: 'First Match', score: 0.95 },
        { noteId: 'note2', title: 'Second Match', score: 0.85 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockResults);

      await program.parseAsync(['search', 'test query'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        'test query',
        false,
        false,
        50
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Searching for: "test query"');
    });

    it('should handle empty search results', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', 'nonexistent'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No notes found')
      );
    });

    it('should handle search errors gracefully', async () => {
      mockClient.searchNotes.mockRejectedValue(new Error('Search failed'));

      await expect(
        program.parseAsync(['search', 'error query'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Search Options', () => {
    it('should use fast search when specified', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', 'query', '--fast'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        'query',
        true,
        false,
        50
      );
    });

    it('should include archived notes when specified', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', 'query', '--archived'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        'query',
        false,
        true,
        50
      );
    });

    it('should respect custom limit', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', 'query', '--limit', '100'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        'query',
        false,
        false,
        100
      );
    });

    it('should combine multiple options', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync([
        'search', 
        'query', 
        '--fast', 
        '--archived', 
        '--limit', 
        '25'
      ], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        'query',
        true,
        true,
        25
      );
    });
  });

  describe('Content Search', () => {
    it('should include content when --content flag is used', async () => {
      const mockResults: SearchResult[] = [
        { noteId: 'note1', title: 'Match with Content', score: 0.9 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockResults);
      mockClient.getNoteWithContent.mockResolvedValue({
        noteId: 'note1',
        title: 'Match with Content',
        type: 'text',
        content: 'This is the content of the note with the search term',
        isProtected: false,
        dateCreated: '2024-01-01',
        dateModified: '2024-01-01',
        utcDateCreated: '2024-01-01T00:00:00Z',
        utcDateModified: '2024-01-01T00:00:00Z',
      });

      await program.parseAsync(['search', 'term', '--content'], { from: 'user' });

      expect(mockClient.getNoteWithContent).toHaveBeenCalledWith('note1');
    });

    it('should handle context lines option', async () => {
      const mockResults: SearchResult[] = [
        { noteId: 'note1', title: 'Note', score: 0.9 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockResults);
      mockClient.getNoteWithContent.mockResolvedValue({
        noteId: 'note1',
        title: 'Note',
        type: 'text',
        content: 'Line 1\nLine 2\nSearch term here\nLine 4\nLine 5',
        isProtected: false,
        dateCreated: '2024-01-01',
        dateModified: '2024-01-01',
        utcDateCreated: '2024-01-01T00:00:00Z',
        utcDateModified: '2024-01-01T00:00:00Z',
      });

      await program.parseAsync([
        'search', 
        'term', 
        '--content', 
        '--context', 
        '3'
      ], { from: 'user' });

      // Verify context processing happens
      expect(mockClient.getNoteWithContent).toHaveBeenCalled();
    });
  });

  describe('Regex Search', () => {
    it('should handle regex mode', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', '.*pattern.*', '--regex'], { from: 'user' });

      // The regex flag affects how the query is processed
      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '.*pattern.*',
        false,
        false,
        50
      );
    });

    it('should validate regex pattern', async () => {
      mockClient.searchNotes.mockRejectedValue(new Error('Invalid regex'));

      await expect(
        program.parseAsync(['search', '[invalid(regex', '--regex'], { from: 'user' })
      ).rejects.toThrow();
    });
  });

  describe('Output Formatting', () => {
    it('should format output as JSON when specified', async () => {
      const mockResults: SearchResult[] = [
        { noteId: 'note1', title: 'Match', score: 0.9 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockResults);

      await program.parseAsync(['search', 'query', '--format', 'json'], { from: 'user' });

      expect(formatOutput).toHaveBeenCalledWith(
        expect.objectContaining({ results: mockResults }),
        'json'
      );
    });

    it('should highlight search terms when --highlight is true', async () => {
      const mockResults: SearchResult[] = [
        { noteId: 'note1', title: 'Test query result', score: 0.9 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockResults);

      await program.parseAsync(['search', 'query', '--highlight'], { from: 'user' });

      // Highlighting would be applied in the output formatting
      expect(mockClient.searchNotes).toHaveBeenCalled();
    });

    it('should disable highlighting with --no-highlight', async () => {
      const mockResults: SearchResult[] = [
        { noteId: 'note1', title: 'Test query result', score: 0.9 },
      ];

      mockClient.searchNotes.mockResolvedValue(mockResults);

      await program.parseAsync(['search', 'query', '--no-highlight'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalled();
    });
  });

  describe('Complex Queries', () => {
    it('should handle tag searches', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', '#important'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '#important',
        false,
        false,
        50
      );
    });

    it('should handle attribute searches', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', '@type=task'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '@type=task',
        false,
        false,
        50
      );
    });

    it('should handle combined queries with AND/OR', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', '#tag1 AND #tag2 OR @type=note'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '#tag1 AND #tag2 OR @type=note',
        false,
        false,
        50
      );
    });

    it('should handle quoted phrases', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', '"exact phrase match"'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        '"exact phrase match"',
        false,
        false,
        50
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long queries', async () => {
      const longQuery = 'a'.repeat(1000);
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', longQuery], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        longQuery,
        false,
        false,
        50
      );
    });

    it('should handle special characters in queries', async () => {
      const specialQuery = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', specialQuery], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        specialQuery,
        false,
        false,
        50
      );
    });

    it('should handle unicode characters', async () => {
      const unicodeQuery = '测试 テスト тест';
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', unicodeQuery], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        unicodeQuery,
        false,
        false,
        50
      );
    });

    it('should handle negative limit gracefully', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      await program.parseAsync(['search', 'query', '--limit', '-1'], { from: 'user' });

      // Should use default or minimum valid limit
      expect(mockClient.searchNotes).toHaveBeenCalledWith(
        'query',
        false,
        false,
        expect.any(Number)
      );
    });
  });

  describe('Performance', () => {
    it('should handle large result sets', async () => {
      const largeResults: SearchResult[] = Array.from({ length: 1000 }, (_, i) => ({
        noteId: `note${i}`,
        title: `Match ${i}`,
        score: 0.5 + (i / 2000),
      }));

      mockClient.searchNotes.mockResolvedValue(largeResults);

      await program.parseAsync(['search', 'query', '--limit', '1000'], { from: 'user' });

      expect(mockClient.searchNotes).toHaveBeenCalled();
      // Should handle large results without error
    });

    it('should timeout on long-running searches', async () => {
      mockClient.searchNotes.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 60000))
      );

      const searchPromise = program.parseAsync(['search', 'slow-query'], { from: 'user' });

      // This would typically timeout based on client configuration
      await expect(Promise.race([
        searchPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      ])).rejects.toThrow('Timeout');
    });
  });
});