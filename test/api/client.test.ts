import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TriliumApi } from '@/api/client';
import { TriliumConfig } from '@/types/config';

// Mock the got module
vi.mock('got', () => ({
  default: vi.fn(),
}));

describe('TriliumApi', () => {
  let api: TriliumApi;
  let mockConfig: TriliumConfig;

  beforeEach(() => {
    mockConfig = {
      server_url: 'http://localhost:8080',
      token: 'test-token',
      timeout: 30000,
      retry_attempts: 3,
      retry_delay: 1000,
    };
    api = new TriliumApi(mockConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      expect(api).toBeInstanceOf(TriliumApi);
    });

    it('should throw error with invalid config', () => {
      expect(() => new TriliumApi({} as TriliumConfig)).toThrow();
    });
  });

  describe('login', () => {
    it('should authenticate successfully with valid credentials', async () => {
      const mockResponse = { token: 'new-token' };
      vi.mocked(api['client'].post as any).mockResolvedValue({ body: mockResponse });

      const result = await api.login('password');
      expect(result).toEqual(mockResponse);
    });

    it('should handle authentication failure', async () => {
      vi.mocked(api['client'].post as any).mockRejectedValue(new Error('Unauthorized'));

      await expect(api.login('wrong-password')).rejects.toThrow('Unauthorized');
    });
  });

  describe('getNotes', () => {
    it('should fetch notes successfully', async () => {
      const mockNotes = [
        { noteId: '1', title: 'Test Note', type: 'text' },
        { noteId: '2', title: 'Another Note', type: 'text' },
      ];
      vi.mocked(api['client'].get as any).mockResolvedValue({ body: mockNotes });

      const result = await api.getNotes();
      expect(result).toEqual(mockNotes);
    });

    it('should handle network errors gracefully', async () => {
      vi.mocked(api['client'].get as any).mockRejectedValue(new Error('Network error'));

      await expect(api.getNotes()).rejects.toThrow('Network error');
    });
  });

  describe('createNote', () => {
    it('should create note with valid data', async () => {
      const noteData = {
        title: 'New Note',
        content: 'Note content',
        type: 'text' as const,
        parentNoteId: 'root',
      };
      const mockResponse = { noteId: 'new-note-id', ...noteData };
      vi.mocked(api['client'].post as any).mockResolvedValue({ body: mockResponse });

      const result = await api.createNote(noteData);
      expect(result).toEqual(mockResponse);
    });

    it('should validate note data before creation', async () => {
      const invalidNoteData = { title: '' } as any;

      await expect(api.createNote(invalidNoteData)).rejects.toThrow();
    });
  });

  describe('updateNote', () => {
    it('should update existing note', async () => {
      const updateData = { title: 'Updated Title', content: 'Updated content' };
      const mockResponse = { noteId: 'test-id', ...updateData };
      vi.mocked(api['client'].patch as any).mockResolvedValue({ body: mockResponse });

      const result = await api.updateNote('test-id', updateData);
      expect(result).toEqual(mockResponse);
    });

    it('should handle update of non-existent note', async () => {
      vi.mocked(api['client'].patch as any).mockRejectedValue(new Error('Note not found'));

      await expect(api.updateNote('non-existent', {})).rejects.toThrow('Note not found');
    });
  });

  describe('deleteNote', () => {
    it('should delete note successfully', async () => {
      vi.mocked(api['client'].delete as any).mockResolvedValue({ statusCode: 204 });

      await expect(api.deleteNote('test-id')).resolves.not.toThrow();
    });

    it('should handle deletion of non-existent note', async () => {
      vi.mocked(api['client'].delete as any).mockRejectedValue(new Error('Note not found'));

      await expect(api.deleteNote('non-existent')).rejects.toThrow('Note not found');
    });
  });

  describe('searchNotes', () => {
    it('should search notes with query', async () => {
      const mockResults = [
        { noteId: '1', title: 'Matching Note', score: 0.9 },
      ];
      vi.mocked(api['client'].get as any).mockResolvedValue({ body: mockResults });

      const result = await api.searchNotes('test query');
      expect(result).toEqual(mockResults);
    });

    it('should handle empty search results', async () => {
      vi.mocked(api['client'].get as any).mockResolvedValue({ body: [] });

      const result = await api.searchNotes('no matches');
      expect(result).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle rate limiting', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).response = { statusCode: 429 };
      vi.mocked(api['client'].get as any).mockRejectedValue(rateLimitError);

      await expect(api.getNotes()).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle server errors', async () => {
      const serverError = new Error('Internal server error');
      (serverError as any).response = { statusCode: 500 };
      vi.mocked(api['client'].get as any).mockRejectedValue(serverError);

      await expect(api.getNotes()).rejects.toThrow('Internal server error');
    });
  });

  describe('retry mechanism', () => {
    it('should retry failed requests', async () => {
      vi.mocked(api['client'].get as any)
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValue({ body: [] });

      const result = await api.getNotes();
      expect(result).toEqual([]);
      expect(api['client'].get).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      vi.mocked(api['client'].get as any).mockRejectedValue(new Error('Persistent error'));

      await expect(api.getNotes()).rejects.toThrow('Persistent error');
      expect(api['client'].get).toHaveBeenCalledTimes(mockConfig.retry_attempts + 1);
    });
  });
});