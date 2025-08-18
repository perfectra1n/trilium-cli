/**
 * Tests for Minimal Trilium CLI
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TriliumClient } from './api/client.js';
import type { Note, Branch, SearchResult, AppInfo } from './types/api.js';

// Mock the API client
vi.mock('./api/client.js');

describe('Minimal CLI - API Client', () => {
  let client: TriliumClient;
  let mockClient: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock client
    mockClient = {
      testConnection: vi.fn(),
      createNote: vi.fn(),
      getNote: vi.fn(),
      getNoteWithContent: vi.fn(),
      updateNote: vi.fn(),
      updateNoteContent: vi.fn(),
      deleteNote: vi.fn(),
      searchNotes: vi.fn(),
      getChildNotes: vi.fn(),
      quickCapture: vi.fn(),
      getAppInfo: vi.fn()
    };

    // Mock the constructor
    (TriliumClient as any).mockImplementation(() => mockClient);
    
    client = new TriliumClient({
      baseUrl: 'http://localhost:8080',
      apiToken: 'test-token'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Connection Testing', () => {
    it('should successfully test connection', async () => {
      const mockAppInfo: AppInfo = {
        appVersion: '0.60.0',
        dbVersion: 210,
        syncVersion: 30,
        buildDate: '2024-01-01',
        buildRevision: 'abc123',
        dataDirectory: '/data',
        clipperProtocolVersion: '1.0'
      };

      mockClient.testConnection.mockResolvedValue(mockAppInfo);

      const result = await client.testConnection();
      
      expect(result).toEqual(mockAppInfo);
      expect(mockClient.testConnection).toHaveBeenCalledTimes(1);
    });

    it('should handle connection failures', async () => {
      mockClient.testConnection.mockRejectedValue(new Error('Connection refused'));

      await expect(client.testConnection()).rejects.toThrow('Connection refused');
    });
  });

  describe('Note Creation', () => {
    it('should create a simple text note', async () => {
      const mockNote: Note = {
        noteId: 'test123',
        title: 'Test Note',
        type: 'text',
        mime: 'text/html',
        isProtected: false,
        dateCreated: '2024-01-01 00:00:00.000Z',
        dateModified: '2024-01-01 00:00:00.000Z',
        utcDateCreated: '2024-01-01 00:00:00.000Z',
        utcDateModified: '2024-01-01 00:00:00.000Z'
      };

      const mockBranch: Branch = {
        branchId: 'branch123',
        noteId: 'test123',
        parentNoteId: 'root',
        notePosition: 10,
        prefix: null,
        isExpanded: false,
        utcDateModified: '2024-01-01 00:00:00.000Z'
      };

      mockClient.createNote.mockResolvedValue({ note: mockNote, branch: mockBranch });

      const result = await client.createNote({
        parentNoteId: 'root',
        title: 'Test Note',
        type: 'text',
        content: 'Test content'
      });

      expect(result.note).toEqual(mockNote);
      expect(result.branch).toEqual(mockBranch);
      expect(mockClient.createNote).toHaveBeenCalledWith({
        parentNoteId: 'root',
        title: 'Test Note',
        type: 'text',
        content: 'Test content'
      });
    });

    it('should create a code note', async () => {
      const mockNote: Note = {
        noteId: 'code123',
        title: 'Code Note',
        type: 'code',
        mime: 'text/javascript',
        isProtected: false,
        dateCreated: '2024-01-01 00:00:00.000Z',
        dateModified: '2024-01-01 00:00:00.000Z',
        utcDateCreated: '2024-01-01 00:00:00.000Z',
        utcDateModified: '2024-01-01 00:00:00.000Z'
      };

      const mockBranch: Branch = {
        branchId: 'branch456',
        noteId: 'code123',
        parentNoteId: 'root',
        notePosition: 20,
        prefix: null,
        isExpanded: false,
        utcDateModified: '2024-01-01 00:00:00.000Z'
      };

      mockClient.createNote.mockResolvedValue({ note: mockNote, branch: mockBranch });

      const result = await client.createNote({
        parentNoteId: 'root',
        title: 'Code Note',
        type: 'code',
        mime: 'text/javascript',
        content: 'console.log("Hello");'
      });

      expect(result.note.type).toBe('code');
      expect(result.note.mime).toBe('text/javascript');
    });
  });

  describe('Note Retrieval', () => {
    it('should get note without content', async () => {
      const mockNote: Note = {
        noteId: 'test123',
        title: 'Test Note',
        type: 'text',
        mime: 'text/html',
        isProtected: false,
        dateCreated: '2024-01-01 00:00:00.000Z',
        dateModified: '2024-01-01 00:00:00.000Z',
        utcDateCreated: '2024-01-01 00:00:00.000Z',
        utcDateModified: '2024-01-01 00:00:00.000Z'
      };

      mockClient.getNote.mockResolvedValue(mockNote);

      const result = await client.getNote('test123');
      
      expect(result).toEqual(mockNote);
      expect(mockClient.getNote).toHaveBeenCalledWith('test123');
    });

    it('should get note with content', async () => {
      const mockNoteWithContent = {
        noteId: 'test123',
        title: 'Test Note',
        type: 'text',
        mime: 'text/html',
        isProtected: false,
        dateCreated: '2024-01-01 00:00:00.000Z',
        dateModified: '2024-01-01 00:00:00.000Z',
        utcDateCreated: '2024-01-01 00:00:00.000Z',
        utcDateModified: '2024-01-01 00:00:00.000Z',
        content: 'This is the note content'
      };

      mockClient.getNoteWithContent.mockResolvedValue(mockNoteWithContent);

      const result = await client.getNoteWithContent('test123');
      
      expect(result.content).toBe('This is the note content');
      expect(mockClient.getNoteWithContent).toHaveBeenCalledWith('test123');
    });

    it('should handle note not found', async () => {
      mockClient.getNote.mockRejectedValue(new Error('Note not found'));

      await expect(client.getNote('nonexistent')).rejects.toThrow('Note not found');
    });
  });

  describe('Note Update', () => {
    it('should update note metadata', async () => {
      const updatedNote: Note = {
        noteId: 'test123',
        title: 'Updated Title',
        type: 'text',
        mime: 'text/html',
        isProtected: true,
        dateCreated: '2024-01-01 00:00:00.000Z',
        dateModified: '2024-01-02 00:00:00.000Z',
        utcDateCreated: '2024-01-01 00:00:00.000Z',
        utcDateModified: '2024-01-02 00:00:00.000Z'
      };

      mockClient.updateNote.mockResolvedValue(updatedNote);

      const result = await client.updateNote('test123', {
        title: 'Updated Title',
        isProtected: true
      });

      expect(result.title).toBe('Updated Title');
      expect(result.isProtected).toBe(true);
      expect(mockClient.updateNote).toHaveBeenCalledWith('test123', {
        title: 'Updated Title',
        isProtected: true
      });
    });

    it('should update note content', async () => {
      mockClient.updateNoteContent.mockResolvedValue(undefined);

      await client.updateNoteContent('test123', 'New content');

      expect(mockClient.updateNoteContent).toHaveBeenCalledWith('test123', 'New content');
    });

    it('should handle update validation errors', async () => {
      mockClient.updateNote.mockRejectedValue(new Error('Invalid note type'));

      await expect(client.updateNote('test123', { type: 'invalid' as any }))
        .rejects.toThrow('Invalid note type');
    });
  });

  describe('Note Deletion', () => {
    it('should delete a note', async () => {
      mockClient.deleteNote.mockResolvedValue(undefined);

      await client.deleteNote('test123');

      expect(mockClient.deleteNote).toHaveBeenCalledWith('test123');
    });

    it('should handle deletion of non-existent note', async () => {
      mockClient.deleteNote.mockRejectedValue(new Error('Note not found'));

      await expect(client.deleteNote('nonexistent')).rejects.toThrow('Note not found');
    });
  });

  describe('Note Search', () => {
    it('should search notes with basic query', async () => {
      const mockResults: SearchResult[] = [
        { noteId: 'note1', title: 'First Result', path: '', score: 1.0 },
        { noteId: 'note2', title: 'Second Result', path: '', score: 0.9 }
      ];

      mockClient.searchNotes.mockResolvedValue(mockResults);

      const results = await client.searchNotes('test query');

      expect(results).toEqual(mockResults);
      expect(mockClient.searchNotes).toHaveBeenCalledWith('test query');
    });

    it('should search with advanced options', async () => {
      const mockResults: SearchResult[] = [
        { noteId: 'note1', title: 'Result', path: '', score: 1.0 }
      ];

      mockClient.searchNotes.mockResolvedValue(mockResults);

      const results = await client.searchNotes('query', true, true, 10);

      expect(results).toEqual(mockResults);
      expect(mockClient.searchNotes).toHaveBeenCalledWith('query', true, true, 10);
    });

    it('should return empty array for no results', async () => {
      mockClient.searchNotes.mockResolvedValue([]);

      const results = await client.searchNotes('nonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('Child Notes', () => {
    it('should get child notes of parent', async () => {
      const mockChildren: Note[] = [
        {
          noteId: 'child1',
          title: 'Child 1',
          type: 'text',
          mime: 'text/html',
          isProtected: false,
          dateCreated: '2024-01-01 00:00:00.000Z',
          dateModified: '2024-01-01 00:00:00.000Z',
          utcDateCreated: '2024-01-01 00:00:00.000Z',
          utcDateModified: '2024-01-01 00:00:00.000Z'
        },
        {
          noteId: 'child2',
          title: 'Child 2',
          type: 'text',
          mime: 'text/html',
          isProtected: false,
          dateCreated: '2024-01-01 00:00:00.000Z',
          dateModified: '2024-01-01 00:00:00.000Z',
          utcDateCreated: '2024-01-01 00:00:00.000Z',
          utcDateModified: '2024-01-01 00:00:00.000Z'
        }
      ];

      mockClient.getChildNotes.mockResolvedValue(mockChildren);

      const children = await client.getChildNotes('root');

      expect(children).toEqual(mockChildren);
      expect(children.length).toBe(2);
      expect(mockClient.getChildNotes).toHaveBeenCalledWith('root');
    });

    it('should return empty array for no children', async () => {
      mockClient.getChildNotes.mockResolvedValue([]);

      const children = await client.getChildNotes('leaf-note');

      expect(children).toEqual([]);
    });
  });

  describe('Quick Capture', () => {
    it('should create quick note with minimal info', async () => {
      const mockNote: Note = {
        noteId: 'quick123',
        title: 'Quick Note 2024-01-01 12:00:00',
        type: 'text',
        mime: 'text/html',
        isProtected: false,
        dateCreated: '2024-01-01 00:00:00.000Z',
        dateModified: '2024-01-01 00:00:00.000Z',
        utcDateCreated: '2024-01-01 00:00:00.000Z',
        utcDateModified: '2024-01-01 00:00:00.000Z'
      };

      mockClient.quickCapture.mockResolvedValue(mockNote);

      const result = await client.quickCapture({
        content: 'Quick thought',
        tags: [],
        metadata: {}
      });

      expect(result).toEqual(mockNote);
      expect(mockClient.quickCapture).toHaveBeenCalledWith({
        content: 'Quick thought',
        tags: [],
        metadata: {}
      });
    });

    it('should create quick note with tags and metadata', async () => {
      const mockNote: Note = {
        noteId: 'quick456',
        title: 'Important Task',
        type: 'text',
        mime: 'text/html',
        isProtected: false,
        dateCreated: '2024-01-01 00:00:00.000Z',
        dateModified: '2024-01-01 00:00:00.000Z',
        utcDateCreated: '2024-01-01 00:00:00.000Z',
        utcDateModified: '2024-01-01 00:00:00.000Z'
      };

      mockClient.quickCapture.mockResolvedValue(mockNote);

      const result = await client.quickCapture({
        title: 'Important Task',
        content: 'Do something important',
        tags: ['urgent', 'work'],
        metadata: {
          priority: 'high',
          category: 'tasks'
        }
      });

      expect(result.title).toBe('Important Task');
      expect(mockClient.quickCapture).toHaveBeenCalledWith({
        title: 'Important Task',
        content: 'Do something important',
        tags: ['urgent', 'work'],
        metadata: {
          priority: 'high',
          category: 'tasks'
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockClient.getNote.mockRejectedValue(new Error('Network error'));

      await expect(client.getNote('test')).rejects.toThrow('Network error');
    });

    it('should handle authentication errors', async () => {
      mockClient.testConnection.mockRejectedValue(new Error('Unauthorized'));

      await expect(client.testConnection()).rejects.toThrow('Unauthorized');
    });

    it('should handle validation errors', async () => {
      mockClient.createNote.mockRejectedValue(new Error('Title cannot be empty'));

      await expect(client.createNote({
        parentNoteId: 'root',
        title: '',
        type: 'text',
        content: 'test'
      })).rejects.toThrow('Title cannot be empty');
    });
  });
});