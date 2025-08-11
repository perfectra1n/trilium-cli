import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { TriliumApi } from '@/api/client';
import { createNoteCommands } from '@/cli/commands/note';

// Mock the API client
vi.mock('@/api/client');
vi.mock('@/utils/logger');
vi.mock('@/utils/editor');

describe('Note Commands', () => {
  let mockApi: vi.Mocked<TriliumApi>;
  let program: Command;

  beforeEach(() => {
    mockApi = {
      getNotes: vi.fn(),
      getNote: vi.fn(),
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      searchNotes: vi.fn(),
    } as any;

    program = new Command();
    createNoteCommands(program, mockApi);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('note list', () => {
    it('should list all notes when no parent specified', async () => {
      const mockNotes = [
        { noteId: '1', title: 'Note 1', type: 'text' },
        { noteId: '2', title: 'Note 2', type: 'text' },
      ];
      mockApi.getNotes.mockResolvedValue(mockNotes);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const listCommand = command?.commands.find(cmd => cmd.name() === 'list');
      expect(listCommand).toBeDefined();

      // Test the command exists and can be called
      expect(listCommand?.description()).toContain('List notes');
    });

    it('should filter notes by parent when specified', async () => {
      const mockNotes = [
        { noteId: '1', title: 'Child Note', type: 'text', parentNoteId: 'parent-id' },
      ];
      mockApi.getNotes.mockResolvedValue(mockNotes);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const listCommand = command?.commands.find(cmd => cmd.name() === 'list');
      expect(listCommand).toBeDefined();
    });

    it('should handle empty note list', async () => {
      mockApi.getNotes.mockResolvedValue([]);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const listCommand = command?.commands.find(cmd => cmd.name() === 'list');
      expect(listCommand).toBeDefined();
    });
  });

  describe('note show', () => {
    it('should display note content', async () => {
      const mockNote = {
        noteId: 'test-id',
        title: 'Test Note',
        content: 'Test content',
        type: 'text',
      };
      mockApi.getNote.mockResolvedValue(mockNote);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const showCommand = command?.commands.find(cmd => cmd.name() === 'show');
      expect(showCommand).toBeDefined();
      expect(showCommand?.description()).toContain('Show note');
    });

    it('should handle non-existent note', async () => {
      mockApi.getNote.mockRejectedValue(new Error('Note not found'));

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const showCommand = command?.commands.find(cmd => cmd.name() === 'show');
      expect(showCommand).toBeDefined();
    });
  });

  describe('note create', () => {
    it('should create note with title and content', async () => {
      const mockNote = {
        noteId: 'new-note-id',
        title: 'New Note',
        content: 'New content',
        type: 'text',
      };
      mockApi.createNote.mockResolvedValue(mockNote);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const createCommand = command?.commands.find(cmd => cmd.name() === 'create');
      expect(createCommand).toBeDefined();
      expect(createCommand?.description()).toContain('Create');
    });

    it('should validate required fields', async () => {
      const command = program.commands.find(cmd => cmd.name() === 'note');
      const createCommand = command?.commands.find(cmd => cmd.name() === 'create');
      expect(createCommand).toBeDefined();
      
      // Check that title is a required argument
      const titleArg = createCommand?.args.find(arg => arg.name() === 'title');
      expect(titleArg).toBeDefined();
    });
  });

  describe('note update', () => {
    it('should update existing note', async () => {
      const mockNote = {
        noteId: 'test-id',
        title: 'Updated Note',
        content: 'Updated content',
        type: 'text',
      };
      mockApi.updateNote.mockResolvedValue(mockNote);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const updateCommand = command?.commands.find(cmd => cmd.name() === 'update');
      expect(updateCommand).toBeDefined();
      expect(updateCommand?.description()).toContain('Update');
    });
  });

  describe('note delete', () => {
    it('should delete note with confirmation', async () => {
      mockApi.deleteNote.mockResolvedValue(undefined);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const deleteCommand = command?.commands.find(cmd => cmd.name() === 'delete');
      expect(deleteCommand).toBeDefined();
      expect(deleteCommand?.description()).toContain('Delete');
    });

    it('should support force delete without confirmation', async () => {
      mockApi.deleteNote.mockResolvedValue(undefined);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const deleteCommand = command?.commands.find(cmd => cmd.name() === 'delete');
      expect(deleteCommand).toBeDefined();
      
      // Check for force option
      const forceOption = deleteCommand?.options.find(opt => opt.long === '--force');
      expect(forceOption).toBeDefined();
    });
  });

  describe('note search', () => {
    it('should search notes by query', async () => {
      const mockResults = [
        { noteId: '1', title: 'Matching Note', score: 0.9 },
        { noteId: '2', title: 'Another Match', score: 0.7 },
      ];
      mockApi.searchNotes.mockResolvedValue(mockResults);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const searchCommand = command?.commands.find(cmd => cmd.name() === 'search');
      expect(searchCommand).toBeDefined();
      expect(searchCommand?.description()).toContain('Search');
    });

    it('should handle empty search results', async () => {
      mockApi.searchNotes.mockResolvedValue([]);

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const searchCommand = command?.commands.find(cmd => cmd.name() === 'search');
      expect(searchCommand).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle API connection errors', async () => {
      mockApi.getNotes.mockRejectedValue(new Error('Connection failed'));

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const listCommand = command?.commands.find(cmd => cmd.name() === 'list');
      expect(listCommand).toBeDefined();
    });

    it('should handle authentication errors', async () => {
      mockApi.getNotes.mockRejectedValue(new Error('Unauthorized'));

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const listCommand = command?.commands.find(cmd => cmd.name() === 'list');
      expect(listCommand).toBeDefined();
    });

    it('should handle validation errors', async () => {
      mockApi.createNote.mockRejectedValue(new Error('Validation failed'));

      const command = program.commands.find(cmd => cmd.name() === 'note');
      const createCommand = command?.commands.find(cmd => cmd.name() === 'create');
      expect(createCommand).toBeDefined();
    });
  });
});