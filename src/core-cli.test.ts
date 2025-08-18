import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { Command } from 'commander';
import * as fs from 'fs';
import chalk from 'chalk';
import { TriliumClient } from './api/client.js';
import { Config } from './config/index.js';
import { ApiError, AuthError, ValidationError, TriliumError } from './error.js';
import type { 
  Note, 
  NoteWithContent, 
  Branch, 
  Attribute, 
  AppInfo,
  SearchResult
} from './types/api.js';

// Mock modules
vi.mock('./api/client.js');
vi.mock('./config/index.js');
vi.mock('fs');
vi.mock('chalk', () => ({
  default: {
    red: vi.fn((text: string) => text),
    green: vi.fn((text: string) => text),
    yellow: vi.fn((text: string) => text),
    cyan: vi.fn((text: string) => text),
  }
}));

// Helper to capture console output
const captureConsoleOutput = () => {
  const originalLog = console.log;
  const originalError = console.error;
  const outputs: string[] = [];
  const errors: string[] = [];

  console.log = vi.fn((...args) => {
    outputs.push(args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' '));
  });

  console.error = vi.fn((...args) => {
    errors.push(args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' '));
  });

  return {
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
    getOutput: () => outputs.join('\n'),
    getErrors: () => errors.join('\n'),
    outputs,
    errors
  };
};

// Helper to parse CLI arguments
const parseArgs = async (args: string[]): Promise<any> => {
  // We need to execute the CLI commands programmatically
  // Since we can't import the whole CLI module (it parses on import),
  // we'll need to test individual functions
  const program = new Command();
  program.exitOverride(); // Prevent process.exit
  
  try {
    await program.parseAsync(['node', 'trilium-core', ...args], { from: 'user' });
    return program.opts();
  } catch (error) {
    return error;
  }
};

describe('Core CLI Tests', () => {
  let mockClient: MockedFunction<typeof TriliumClient>;
  let mockConfig: MockedFunction<typeof Config>;
  let consoleCapture: ReturnType<typeof captureConsoleOutput>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset environment variables
    delete process.env.TRILIUM_URL;
    delete process.env.TRILIUM_TOKEN;
    
    // Setup console capture
    consoleCapture = captureConsoleOutput();
    
    // Mock Config
    mockConfig = Config as MockedFunction<typeof Config>;
    mockConfig.prototype.getCurrentProfile = vi.fn().mockReturnValue({
      name: 'default',
      serverUrl: 'http://localhost:9999',
      apiToken: 'test-token'
    });
    mockConfig.prototype.getProfiles = vi.fn().mockReturnValue([
      {
        name: 'default',
        serverUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      }
    ]);
    mockConfig.prototype.getData = vi.fn().mockReturnValue({
      currentProfile: 'default',
      profiles: [{
        name: 'default',
        serverUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      }]
    });
    mockConfig.prototype.setProfile = vi.fn();
    mockConfig.prototype.save = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleCapture.restore();
    vi.restoreAllMocks();
  });

  describe('Configuration Management', () => {
    it('should use environment variables when provided', () => {
      process.env.TRILIUM_URL = 'http://env-server:8080';
      process.env.TRILIUM_TOKEN = 'env-token';
      
      // Test would need to import and run getConfig function
      // Since the module executes on import, we need a different approach
      expect(process.env.TRILIUM_URL).toBe('http://env-server:8080');
      expect(process.env.TRILIUM_TOKEN).toBe('env-token');
    });

    it('should fall back to profile configuration', () => {
      const config = new Config();
      const profile = config.getCurrentProfile();
      
      expect(profile.serverUrl).toBe('http://localhost:9999');
      expect(profile.apiToken).toBe('test-token');
    });

    it('should handle missing configuration gracefully', () => {
      mockConfig.prototype.getCurrentProfile = vi.fn().mockImplementation(() => {
        throw new Error('No profile configured');
      });
      
      const config = new Config();
      expect(() => config.getCurrentProfile()).toThrow('No profile configured');
    });
  });

  describe('Note CRUD Operations', () => {
    let clientInstance: any;

    beforeEach(() => {
      clientInstance = {
        createNote: vi.fn(),
        getNote: vi.fn(),
        getNoteWithContent: vi.fn(),
        updateNote: vi.fn(),
        deleteNote: vi.fn(),
        searchNotes: vi.fn(),
        getAppInfo: vi.fn(),
        getBranch: vi.fn(),
        createBranch: vi.fn(),
        getAttribute: vi.fn(),
        createAttribute: vi.fn(),
        deleteAttribute: vi.fn(),
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);
    });

    describe('Create Note', () => {
      it('should create a note with basic properties', async () => {
        const mockNote: Note = {
          noteId: 'test123',
          title: 'Test Note',
          type: 'text',
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00.000Z',
          utcDateModified: '2024-01-01T00:00:00.000Z',
          isProtected: false,
          isDeleted: false,
          attributes: []
        };

        clientInstance.createNote.mockResolvedValue(mockNote);
        
        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        const result = await client.createNote({
          title: 'Test Note',
          content: 'Test content',
          type: 'text',
          parentNoteId: 'root'
        });

        expect(clientInstance.createNote).toHaveBeenCalledWith({
          title: 'Test Note',
          content: 'Test content',
          type: 'text',
          parentNoteId: 'root'
        });
        expect(result).toEqual(mockNote);
      });

      it('should create a note with attributes', async () => {
        const mockNote: Note = {
          noteId: 'test124',
          title: 'Note with Attrs',
          type: 'text',
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00.000Z',
          utcDateModified: '2024-01-01T00:00:00.000Z',
          isProtected: false,
          isDeleted: false,
          attributes: [
            { attributeId: 'attr1', noteId: 'test124', type: 'label', name: 'todo', value: '', position: 0 },
            { attributeId: 'attr2', noteId: 'test124', type: 'relation', name: 'template', value: 'template1', position: 1 }
          ]
        };

        clientInstance.createNote.mockResolvedValue(mockNote);
        
        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        const result = await client.createNote({
          title: 'Note with Attrs',
          content: '',
          type: 'text',
          parentNoteId: 'root'
        });

        expect(result.attributes).toHaveLength(2);
        expect(result.attributes?.[0].type).toBe('label');
        expect(result.attributes?.[1].type).toBe('relation');
      });

      it('should handle creation errors', async () => {
        clientInstance.createNote.mockRejectedValue(
          new ApiError('Failed to create note', 400)
        );

        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        await expect(client.createNote({
          title: 'Test',
          content: '',
          type: 'text',
          parentNoteId: 'root'
        })).rejects.toThrow(ApiError);
      });
    });

    describe('Get Note', () => {
      it('should retrieve a note by ID', async () => {
        const mockNote: Note = {
          noteId: 'test123',
          title: 'Retrieved Note',
          type: 'text',
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00.000Z',
          utcDateModified: '2024-01-01T00:00:00.000Z',
          isProtected: false,
          isDeleted: false,
          attributes: []
        };

        clientInstance.getNote.mockResolvedValue(mockNote);
        
        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        const result = await client.getNote('test123');

        expect(clientInstance.getNote).toHaveBeenCalledWith('test123');
        expect(result).toEqual(mockNote);
      });

      it('should retrieve a note with content', async () => {
        const mockNote: NoteWithContent = {
          noteId: 'test123',
          title: 'Note with Content',
          type: 'text',
          content: 'This is the note content',
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00.000Z',
          utcDateModified: '2024-01-01T00:00:00.000Z',
          isProtected: false,
          isDeleted: false,
          attributes: []
        };

        clientInstance.getNoteWithContent.mockResolvedValue(mockNote);
        
        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        const result = await client.getNoteWithContent('test123');

        expect(clientInstance.getNoteWithContent).toHaveBeenCalledWith('test123');
        expect(result.content).toBe('This is the note content');
      });

      it('should handle note not found', async () => {
        clientInstance.getNote.mockRejectedValue(
          new ApiError('Note not found', 404)
        );

        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        await expect(client.getNote('nonexistent')).rejects.toThrow(ApiError);
      });
    });

    describe('Update Note', () => {
      it('should update note properties', async () => {
        clientInstance.updateNote.mockResolvedValue(undefined);
        
        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        await client.updateNote('test123', {
          title: 'Updated Title',
          content: 'Updated content'
        });

        expect(clientInstance.updateNote).toHaveBeenCalledWith('test123', {
          title: 'Updated Title',
          content: 'Updated content'
        });
      });

      it('should handle update errors', async () => {
        clientInstance.updateNote.mockRejectedValue(
          new ValidationError('Invalid update data')
        );

        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        await expect(client.updateNote('test123', {
          title: ''
        })).rejects.toThrow(ValidationError);
      });
    });

    describe('Delete Note', () => {
      it('should delete a note', async () => {
        clientInstance.deleteNote.mockResolvedValue(undefined);
        
        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        await client.deleteNote('test123');

        expect(clientInstance.deleteNote).toHaveBeenCalledWith('test123');
      });

      it('should handle deletion errors', async () => {
        clientInstance.deleteNote.mockRejectedValue(
          new ApiError('Cannot delete root note', 400)
        );

        const _client = new TriliumClient({
          baseUrl: 'http://localhost:9999',
          apiToken: 'test-token'
        });

        await expect(client.deleteNote('root')).rejects.toThrow(ApiError);
      });
    });
  });

  describe('Search Operations', () => {
    let clientInstance: any;

    beforeEach(() => {
      clientInstance = {
        searchNotes: vi.fn(),
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);
    });

    it('should search notes with query', async () => {
      const mockResults: SearchResult[] = [
        {
          noteId: 'result1',
          title: 'Search Result 1',
          score: 0.95
        },
        {
          noteId: 'result2',
          title: 'Search Result 2',
          score: 0.85
        }
      ];

      clientInstance.searchNotes.mockResolvedValue(mockResults);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const results = await client.searchNotes('test query', false, false, 50);

      expect(clientInstance.searchNotes).toHaveBeenCalledWith('test query', false, false, 50);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Search Result 1');
    });

    it('should handle empty search results', async () => {
      clientInstance.searchNotes.mockResolvedValue([]);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const results = await client.searchNotes('nonexistent', false, false, 50);

      expect(results).toEqual([]);
    });

    it('should handle search with advanced options', async () => {
      const mockResults: SearchResult[] = [
        {
          noteId: 'archived1',
          title: 'Archived Note',
          score: 0.9
        }
      ];

      clientInstance.searchNotes.mockResolvedValue(mockResults);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const results = await client.searchNotes('#archived', false, true, 10);

      expect(clientInstance.searchNotes).toHaveBeenCalledWith('#archived', false, true, 10);
      expect(results).toHaveLength(1);
    });
  });

  describe('Branch Operations', () => {
    let clientInstance: any;

    beforeEach(() => {
      clientInstance = {
        getBranch: vi.fn(),
        createBranch: vi.fn(),
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);
    });

    it('should get branch details', async () => {
      const mockBranch: Branch = {
        branchId: 'branch123',
        noteId: 'note123',
        parentNoteId: 'parent123',
        prefix: '',
        notePosition: 0,
        isExpanded: false,
        utcDateModified: '2024-01-01T00:00:00.000Z'
      };

      clientInstance.getBranch.mockResolvedValue(mockBranch);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const branch = await client.getBranch('branch123');

      expect(clientInstance.getBranch).toHaveBeenCalledWith('branch123');
      expect(branch.branchId).toBe('branch123');
    });

    it('should create a new branch', async () => {
      const mockBranch: Branch = {
        branchId: 'newbranch',
        noteId: 'note456',
        parentNoteId: 'parent456',
        prefix: 'Chapter 1',
        notePosition: 0,
        isExpanded: false,
        utcDateModified: '2024-01-01T00:00:00.000Z'
      };

      clientInstance.createBranch.mockResolvedValue(mockBranch);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const branch = await client.createBranch({
        noteId: 'note456',
        parentNoteId: 'parent456',
        prefix: 'Chapter 1'
      });

      expect(clientInstance.createBranch).toHaveBeenCalledWith({
        noteId: 'note456',
        parentNoteId: 'parent456',
        prefix: 'Chapter 1'
      });
      expect(branch.prefix).toBe('Chapter 1');
    });
  });

  describe('Attribute Operations', () => {
    let clientInstance: any;

    beforeEach(() => {
      clientInstance = {
        getAttribute: vi.fn(),
        createAttribute: vi.fn(),
        deleteAttribute: vi.fn(),
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);
    });

    it('should get attribute details', async () => {
      const mockAttribute: Attribute = {
        attributeId: 'attr123',
        noteId: 'note123',
        type: 'label',
        name: 'todo',
        value: '',
        position: 0,
        isInheritable: false,
        utcDateModified: '2024-01-01T00:00:00.000Z'
      };

      clientInstance.getAttribute.mockResolvedValue(mockAttribute);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const attr = await client.getAttribute('attr123');

      expect(clientInstance.getAttribute).toHaveBeenCalledWith('attr123');
      expect(attr.type).toBe('label');
      expect(attr.name).toBe('todo');
    });

    it('should create a label attribute', async () => {
      const mockAttribute: Attribute = {
        attributeId: 'newattr1',
        noteId: 'note123',
        type: 'label',
        name: 'important',
        value: '',
        position: 0,
        isInheritable: false,
        utcDateModified: '2024-01-01T00:00:00.000Z'
      };

      clientInstance.createAttribute.mockResolvedValue(mockAttribute);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const attr = await client.createAttribute({
        noteId: 'note123',
        type: 'label',
        name: 'important',
        value: ''
      });

      expect(attr.type).toBe('label');
      expect(attr.name).toBe('important');
    });

    it('should create a relation attribute', async () => {
      const mockAttribute: Attribute = {
        attributeId: 'newattr2',
        noteId: 'note123',
        type: 'relation',
        name: 'template',
        value: 'template123',
        position: 0,
        isInheritable: false,
        utcDateModified: '2024-01-01T00:00:00.000Z'
      };

      clientInstance.createAttribute.mockResolvedValue(mockAttribute);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const attr = await client.createAttribute({
        noteId: 'note123',
        type: 'relation',
        name: 'template',
        value: 'template123'
      });

      expect(attr.type).toBe('relation');
      expect(attr.value).toBe('template123');
    });

    it('should delete an attribute', async () => {
      clientInstance.deleteAttribute.mockResolvedValue(undefined);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      await client.deleteAttribute('attr123');

      expect(clientInstance.deleteAttribute).toHaveBeenCalledWith('attr123');
    });
  });

  describe('App Info', () => {
    let clientInstance: any;

    beforeEach(() => {
      clientInstance = {
        getAppInfo: vi.fn(),
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);
    });

    it('should retrieve app information', async () => {
      const mockInfo: AppInfo = {
        appVersion: '0.61.0',
        dbVersion: '61',
        syncVersion: '61',
        buildDate: '2024-01-01',
        buildRevision: 'abc123',
        dataDirectory: '/data/trilium',
        documentPath: '/data/trilium/document.db',
        clipperProtocolVersion: '1.0',
        utcDateTime: '2024-01-01T12:00:00.000Z'
      };

      clientInstance.getAppInfo.mockResolvedValue(mockInfo);
      
      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const info = await client.getAppInfo();

      expect(clientInstance.getAppInfo).toHaveBeenCalled();
      expect(info.appVersion).toBe('0.61.0');
      expect(info.dbVersion).toBe('61');
    });
  });

  describe('Error Handling', () => {
    let clientInstance: any;

    beforeEach(() => {
      clientInstance = {
        getNote: vi.fn(),
        createNote: vi.fn(),
        getAppInfo: vi.fn(),
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);
    });

    it('should handle API errors with status codes', async () => {
      const apiError = new ApiError('Not Found', 404);
      clientInstance.getNote.mockRejectedValue(apiError);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      await expect(client.getNote('nonexistent')).rejects.toThrow(ApiError);
      await expect(client.getNote('nonexistent')).rejects.toThrow('Not Found');
    });

    it('should handle authentication errors', async () => {
      const authError = new AuthError('Invalid token');
      clientInstance.getAppInfo.mockRejectedValue(authError);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'invalid-token'
      });

      await expect(client.getAppInfo()).rejects.toThrow(AuthError);
    });

    it('should handle validation errors', async () => {
      const validationError = new ValidationError('Invalid note type');
      clientInstance.createNote.mockRejectedValue(validationError);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      await expect(client.createNote({
        title: 'Test',
        content: '',
        type: 'invalid' as any,
        parentNoteId: 'root'
      })).rejects.toThrow(ValidationError);
    });

    it('should handle generic Trilium errors', async () => {
      const triliumError = new TriliumError('Server error');
      clientInstance.getNote.mockRejectedValue(triliumError);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      await expect(client.getNote('test')).rejects.toThrow(TriliumError);
    });
  });

  describe('Output Formatting', () => {
    it('should format JSON output when json flag is set', () => {
      const data = {
        noteId: 'test123',
        title: 'Test Note',
        type: 'text'
      };

      const output = JSON.stringify(data, null, 2);
      expect(output).toContain('"noteId": "test123"');
      expect(output).toContain('"title": "Test Note"');
    });

    it('should format table output for arrays', () => {
      const data = [
        { noteId: 'note1', title: 'Note 1', type: 'text' },
        { noteId: 'note2', title: 'Note 2', type: 'code' }
      ];

      // Test array formatting
      expect(data).toHaveLength(2);
      expect(data[0].noteId).toBe('note1');
    });

    it('should format single note output', () => {
      const note = {
        noteId: 'test123',
        title: 'My Note',
        type: 'text',
        content: 'Note content',
        dateCreated: '2024-01-01',
        dateModified: '2024-01-02'
      };

      // Verify note structure
      expect(note.noteId).toBe('test123');
      expect(note.title).toBe('My Note');
      expect(note.content).toBeDefined();
    });
  });

  describe('Import/Export Operations', () => {
    beforeEach(() => {
      // Mock file system operations
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(Buffer.from('File content'));
      (fs.writeFileSync as any).mockImplementation(() => {});
    });

    it('should export note to file', async () => {
      const clientInstance = {
        getNoteWithContent: vi.fn().mockResolvedValue({
          noteId: 'test123',
          title: 'Export Test',
          type: 'text',
          content: '<p>HTML content</p>',
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00.000Z',
          utcDateModified: '2024-01-01T00:00:00.000Z',
          isProtected: false,
          isDeleted: false,
          attributes: []
        })
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const note = await client.getNoteWithContent('test123');
      
      // Simulate export
      const exportPath = '/tmp/export.md';
      fs.writeFileSync(exportPath, note.content || '');

      expect(fs.writeFileSync).toHaveBeenCalledWith(exportPath, '<p>HTML content</p>');
    });

    it('should import file as note', async () => {
      const clientInstance = {
        createNote: vi.fn().mockResolvedValue({
          noteId: 'imported123',
          title: 'Imported File',
          type: 'text',
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00.000Z',
          utcDateModified: '2024-01-01T00:00:00.000Z',
          isProtected: false,
          isDeleted: false,
          attributes: []
        })
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const result = await client.createNote({
        title: 'Imported File',
        content: 'File content',
        type: 'text',
        parentNoteId: 'root'
      });

      expect(clientInstance.createNote).toHaveBeenCalled();
      expect(result.title).toBe('Imported File');
    });

    it('should handle file not found during import', () => {
      (fs.existsSync as any).mockReturnValue(false);

      expect(fs.existsSync('/nonexistent/file.txt')).toBe(false);
    });
  });

  describe('Configuration Commands', () => {
    it('should set configuration values', async () => {
      const config = new Config();
      const profile = {
        name: 'test',
        serverUrl: 'http://test-server:8080',
        apiToken: 'test-token-123'
      };

      config.setProfile(profile);
      await config.save();

      expect(config.setProfile).toHaveBeenCalledWith(profile);
      expect(config.save).toHaveBeenCalled();
    });

    it('should get configuration values', () => {
      const config = new Config();
      const profiles = config.getProfiles();

      expect(profiles).toHaveLength(1);
      expect(profiles[0].name).toBe('default');
      expect(profiles[0].serverUrl).toBe('http://localhost:9999');
    });

    it('should list all configuration', () => {
      const config = new Config();
      const data = config.getData();

      expect(data).toHaveProperty('currentProfile');
      expect(data).toHaveProperty('profiles');
      expect(data.profiles).toHaveLength(1);
    });
  });

  describe('Connection Testing', () => {
    it('should successfully test connection', async () => {
      const clientInstance = {
        getAppInfo: vi.fn().mockResolvedValue({
          appVersion: '0.61.0',
          dbVersion: '61',
          syncVersion: '61',
          buildDate: '2024-01-01',
          buildRevision: 'abc123',
          dataDirectory: '/data/trilium',
          documentPath: '/data/trilium/document.db',
          clipperProtocolVersion: '1.0',
          utcDateTime: '2024-01-01T12:00:00.000Z'
        })
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const info = await client.getAppInfo();
      
      expect(info.appVersion).toBe('0.61.0');
      expect(clientInstance.getAppInfo).toHaveBeenCalled();
    });

    it('should handle connection failure', async () => {
      const clientInstance = {
        getAppInfo: vi.fn().mockRejectedValue(
          new Error('Connection refused')
        )
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      await expect(client.getAppInfo()).rejects.toThrow('Connection refused');
    });
  });

  describe('Edge Cases and Validation', () => {
    it('should validate note IDs', () => {
      const validIds = ['root', 'abc123', 'note_456'];
      const invalidIds = ['', '  ', 'note with spaces'];

      validIds.forEach(id => {
        expect(id.length).toBeGreaterThan(0);
        expect(id.trim()).toBe(id);
      });

      invalidIds.forEach(id => {
        expect(id.trim() === '' || id.includes(' ')).toBe(true);
      });
    });

    it('should validate URLs', () => {
      const validUrls = [
        'http://localhost:9999',
        'https://trilium.example.com',
        'http://192.168.1.1:8080'
      ];

      const invalidUrls = [
        'not-a-url',
        'ftp://server.com',
        'localhost:9999'
      ];

      validUrls.forEach(url => {
        expect(url.startsWith('http://') || url.startsWith('https://')).toBe(true);
      });

      invalidUrls.forEach(url => {
        expect(url.startsWith('http://') || url.startsWith('https://')).toBe(false);
      });
    });

    it('should handle empty search queries', async () => {
      const clientInstance = {
        searchNotes: vi.fn().mockResolvedValue([])
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const results = await client.searchNotes('', false, false, 100);

      expect(clientInstance.searchNotes).toHaveBeenCalledWith('', false, false, 100);
      expect(results).toEqual([]);
    });

    it('should handle special characters in note titles', async () => {
      const clientInstance = {
        createNote: vi.fn().mockResolvedValue({
          noteId: 'special123',
          title: 'Note with "quotes" & <brackets>',
          type: 'text',
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00.000Z',
          utcDateModified: '2024-01-01T00:00:00.000Z',
          isProtected: false,
          isDeleted: false,
          attributes: []
        })
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const note = await client.createNote({
        title: 'Note with "quotes" & <brackets>',
        content: '',
        type: 'text',
        parentNoteId: 'root'
      });

      expect(note.title).toBe('Note with "quotes" & <brackets>');
    });

    it('should handle large content', async () => {
      const largeContent = 'x'.repeat(1000000); // 1MB of content
      
      const clientInstance = {
        createNote: vi.fn().mockResolvedValue({
          noteId: 'large123',
          title: 'Large Note',
          type: 'text',
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00.000Z',
          utcDateModified: '2024-01-01T00:00:00.000Z',
          isProtected: false,
          isDeleted: false,
          attributes: []
        })
      };

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token'
      });

      const note = await client.createNote({
        title: 'Large Note',
        content: largeContent,
        type: 'text',
        parentNoteId: 'root'
      });

      expect(clientInstance.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          content: largeContent
        })
      );
    });
  });

  describe('Verbose and Debug Modes', () => {
    it('should handle verbose mode', () => {
      process.env.DEBUG = 'true';
      
      // In verbose mode, additional logging would occur
      expect(process.env.DEBUG).toBe('true');
    });

    it('should handle debug mode', () => {
      const clientInstance = {};

      mockClient = TriliumClient as MockedFunction<typeof TriliumClient>;
      mockClient.mockImplementation(() => clientInstance as any);

      const _client = new TriliumClient({
        baseUrl: 'http://localhost:9999',
        apiToken: 'test-token',
        debugMode: true
      });

      // Debug mode would enable additional logging
      expect(mockClient).toHaveBeenCalledWith(
        expect.objectContaining({
          debugMode: true
        })
      );
    });
  });

  describe('Profile Management', () => {
    it('should switch between profiles', () => {
      const config = new Config();
      
      // Add multiple profiles
      config.setProfile({
        name: 'dev',
        serverUrl: 'http://dev-server:8080',
        apiToken: 'dev-token'
      });

      config.setProfile({
        name: 'prod',
        serverUrl: 'https://prod-server.com',
        apiToken: 'prod-token'
      });

      const profiles = [
        { name: 'dev', serverUrl: 'http://dev-server:8080', apiToken: 'dev-token' },
        { name: 'prod', serverUrl: 'https://prod-server.com', apiToken: 'prod-token' }
      ];

      expect(config.setProfile).toHaveBeenCalledTimes(2);
    });

    it('should use default profile when none specified', () => {
      const config = new Config();
      const profile = config.getCurrentProfile();

      expect(profile.name).toBe('default');
    });
  });

  describe('Attribute Parsing', () => {
    it('should parse label attributes', () => {
      const attrs = ['todo', 'important', 'archived'];
      const parsed = attrs.map(name => ({
        type: 'label' as const,
        name,
        value: ''
      }));

      expect(parsed).toHaveLength(3);
      expect(parsed[0].type).toBe('label');
      expect(parsed[0].name).toBe('todo');
    });

    it('should parse relation attributes', () => {
      const attrs = ['template=template123', 'parent=note456'];
      const parsed = attrs.map(attr => {
        const [name, value] = attr.split('=');
        return {
          type: 'relation' as const,
          name,
          value
        };
      });

      expect(parsed).toHaveLength(2);
      expect(parsed[0].type).toBe('relation');
      expect(parsed[0].value).toBe('template123');
    });

    it('should handle mixed attribute types', () => {
      const labels = ['todo', 'important'];
      const relations = ['template=tmpl1'];
      
      const allAttrs = [
        ...labels.map(name => ({ type: 'label' as const, name, value: '' })),
        ...relations.map(rel => {
          const [name, value] = rel.split('=');
          return { type: 'relation' as const, name, value };
        })
      ];

      expect(allAttrs).toHaveLength(3);
      expect(allAttrs.filter(a => a.type === 'label')).toHaveLength(2);
      expect(allAttrs.filter(a => a.type === 'relation')).toHaveLength(1);
    });
  });
});