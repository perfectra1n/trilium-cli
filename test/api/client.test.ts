import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TriliumClient } from '../../src/api/client.js';
import type { Note, CreateNoteDef, UpdateNoteDef, Branch, Attribute } from '../../src/types/api.js';

describe('TriliumClient', () => {
  let client: TriliumClient;

  beforeEach(() => {
    // Create client with mock configuration
    client = new TriliumClient({
      baseUrl: 'http://localhost:8080',
      apiToken: 'test-token',
      debugMode: false,
    });
  });

  describe('Constructor', () => {
    it('should create client with valid config', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(TriliumClient);
    });

    it('should throw error with invalid URL', () => {
      expect(() => {
        new TriliumClient({
          baseUrl: 'not-a-url',
          apiToken: 'test-token',
        });
      }).toThrow();
    });
  });

  describe('Authentication', () => {
    it('should handle login request', async () => {
      // Mock the HTTP request
      const loginSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue({
        authToken: 'new-auth-token',
      });

      const result = await client.login('password123');
      
      expect(loginSpy).toHaveBeenCalledWith('POST', '/auth/login', { password: 'password123' });
      expect(result.authToken).toBe('new-auth-token');
    });

    it('should handle logout request', async () => {
      const logoutSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue(undefined);

      await client.logout();
      
      expect(logoutSpy).toHaveBeenCalledWith('POST', '/auth/logout');
    });
  });

  describe('Notes API', () => {
    describe('searchNotes', () => {
      it('should search notes with basic query', async () => {
        const mockResults = [
          { noteId: 'note1', title: 'Test Note 1' },
          { noteId: 'note2', title: 'Test Note 2' },
        ];

        vi.spyOn(client as any, 'sendRequest').mockResolvedValue({
          results: mockResults,
        });

        const results = await client.searchNotes('test query');
        
        expect(results).toHaveLength(2);
        expect(results[0]?.noteId).toBe('note1');
      });

      it('should handle search with options', async () => {
        const searchSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue({
          results: [],
        });

        await client.searchNotes('query', true, true, 100);
        
        expect(searchSpy).toHaveBeenCalledWith(
          'GET',
          expect.stringContaining('fastSearch=true')
        );
        expect(searchSpy).toHaveBeenCalledWith(
          'GET',
          expect.stringContaining('includeArchivedNotes=true')
        );
        expect(searchSpy).toHaveBeenCalledWith(
          'GET',
          expect.stringContaining('limit=100')
        );
      });
    });

    describe('getNote', () => {
      it('should get note by ID', async () => {
        const mockNote: Note = {
          noteId: 'test-id',
          title: 'Test Note',
          type: 'text',
          isProtected: false,
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-01T00:00:00Z',
        };

        vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockNote);

        const note = await client.getNote('test-id');
        
        expect(note).toEqual(mockNote);
        expect(note.noteId).toBe('test-id');
      });

      it('should throw error for invalid note ID', async () => {
        await expect(client.getNote('')).rejects.toThrow();
      });
    });

    describe('createNote', () => {
      it('should create a new note', async () => {
        const noteDef: CreateNoteDef = {
          parentNoteId: 'parent-id',
          title: 'New Note',
          type: 'text',
          content: 'Note content',
        };

        const mockResponse = {
          note: {
            noteId: 'new-note-id',
            title: 'New Note',
            type: 'text' as const,
            isProtected: false,
            dateCreated: '2024-01-01',
            dateModified: '2024-01-01',
            utcDateCreated: '2024-01-01T00:00:00Z',
            utcDateModified: '2024-01-01T00:00:00Z',
          },
          branch: {
            branchId: 'branch-id',
            noteId: 'new-note-id',
            parentNoteId: 'parent-id',
            notePosition: 10,
            isExpanded: false,
            utcDateModified: '2024-01-01T00:00:00Z',
          },
        };

        vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockResponse);

        const result = await client.createNote(noteDef);
        
        expect(result.note.noteId).toBe('new-note-id');
        expect(result.branch.parentNoteId).toBe('parent-id');
      });

      it('should validate required fields', async () => {
        const invalidNoteDef = {
          title: 'Missing parent',
          type: 'text',
          content: 'Content',
        } as CreateNoteDef;

        await expect(client.createNote(invalidNoteDef)).rejects.toThrow();
      });
    });

    describe('updateNote', () => {
      it('should update note metadata', async () => {
        const updates: UpdateNoteDef = {
          title: 'Updated Title',
          type: 'code',
          mime: 'application/javascript',
        };

        const mockUpdatedNote: Note = {
          noteId: 'test-id',
          title: 'Updated Title',
          type: 'code',
          mime: 'application/javascript',
          isProtected: false,
          dateCreated: '2024-01-01',
          dateModified: '2024-01-02',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-02T00:00:00Z',
        };

        vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockUpdatedNote);

        const updated = await client.updateNote('test-id', updates);
        
        expect(updated.title).toBe('Updated Title');
        expect(updated.type).toBe('code');
      });
    });

    describe('deleteNote', () => {
      it('should delete note by ID', async () => {
        const deleteSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue(undefined);

        await client.deleteNote('test-id');
        
        expect(deleteSpy).toHaveBeenCalledWith('DELETE', '/notes/test-id');
      });
    });
  });

  describe('Branches API', () => {
    it('should create a branch', async () => {
      const branchDef = {
        noteId: 'note-id',
        parentNoteId: 'parent-id',
      };

      const mockBranch: Branch = {
        branchId: 'branch-id',
        noteId: 'note-id',
        parentNoteId: 'parent-id',
        notePosition: 10,
        isExpanded: false,
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockBranch);

      const branch = await client.createBranch(branchDef);
      
      expect(branch.noteId).toBe('note-id');
      expect(branch.parentNoteId).toBe('parent-id');
    });

    it('should delete a branch', async () => {
      const deleteSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue(undefined);

      await client.deleteBranch('branch-id');
      
      expect(deleteSpy).toHaveBeenCalledWith('DELETE', '/branches/branch-id');
    });
  });

  describe('Attributes API', () => {
    it('should create an attribute', async () => {
      const attrDef = {
        noteId: 'note-id',
        type: 'label' as const,
        name: 'testLabel',
        value: 'testValue',
      };

      const mockAttribute: Attribute = {
        attributeId: 'attr-id',
        ownerId: 'note-id',
        type: 'label',
        name: 'testLabel',
        value: 'testValue',
        notePosition: 10,
        isInheritable: false,
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockAttribute);

      const attr = await client.createAttribute(attrDef);
      
      expect(attr.name).toBe('testLabel');
      expect(attr.value).toBe('testValue');
    });

    it('should validate attribute name', async () => {
      const invalidAttr = {
        noteId: 'note-id',
        type: 'label' as const,
        name: 'has spaces',
        value: 'value',
      };

      await expect(client.createAttribute(invalidAttr)).rejects.toThrow();
    });
  });

  describe('Calendar API', () => {
    it('should get day note', async () => {
      const mockNote: Note = {
        noteId: 'day-note-id',
        title: 'Day 2024-01-01',
        type: 'text',
        isProtected: false,
        dateCreated: '2024-01-01',
        dateModified: '2024-01-01',
        utcDateCreated: '2024-01-01T00:00:00Z',
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockNote);

      const note = await client.getDayNote('2024-01-01');
      
      expect(note.noteId).toBe('day-note-id');
    });

    it('should validate date format', async () => {
      await expect(client.getDayNote('invalid-date')).rejects.toThrow();
      await expect(client.getDayNote('2024-1-1')).rejects.toThrow();
    });
  });

  describe('Backup API', () => {
    it('should create backup', async () => {
      const backupSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue(undefined);

      await client.createBackup('test-backup');
      
      expect(backupSpy).toHaveBeenCalledWith('PUT', '/backup/test-backup');
    });

    it('should create default backup when no name provided', async () => {
      const backupSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue(undefined);

      await client.createBackup();
      
      expect(backupSpy).toHaveBeenCalledWith('PUT', '/backup/default');
    });
  });

  describe('Enhanced Features', () => {
    describe('getChildNotes', () => {
      it('should get child notes', async () => {
        const parentNote: Note = {
          noteId: 'parent-id',
          title: 'Parent',
          type: 'text',
          isProtected: false,
          childNoteIds: ['child1', 'child2'],
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-01T00:00:00Z',
        };

        const childNote1: Note = {
          noteId: 'child1',
          title: 'Child 1',
          type: 'text',
          isProtected: false,
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-01T00:00:00Z',
        };

        const childNote2: Note = {
          noteId: 'child2',
          title: 'Child 2',
          type: 'text',
          isProtected: false,
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-01T00:00:00Z',
        };

        const getNoteSpy = vi.spyOn(client, 'getNote');
        getNoteSpy.mockResolvedValueOnce(parentNote);
        getNoteSpy.mockResolvedValueOnce(childNote1);
        getNoteSpy.mockResolvedValueOnce(childNote2);

        const children = await client.getChildNotes('parent-id');
        
        expect(children).toHaveLength(2);
        expect(children[0]?.title).toBe('Child 1');
        expect(children[1]?.title).toBe('Child 2');
      });
    });

    describe('quickCapture', () => {
      it('should create quick capture note', async () => {
        const mockInboxNote: Note = {
          noteId: 'inbox-id',
          title: 'Inbox',
          type: 'text',
          isProtected: false,
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-01T00:00:00Z',
        };

        const mockCreatedNote = {
          note: {
            noteId: 'quick-note-id',
            title: 'Quick Note',
            type: 'text' as const,
            isProtected: false,
            dateCreated: '2024-01-01',
            dateModified: '2024-01-01',
            utcDateCreated: '2024-01-01T00:00:00Z',
            utcDateModified: '2024-01-01T00:00:00Z',
          },
          branch: {
            branchId: 'branch-id',
            noteId: 'quick-note-id',
            parentNoteId: 'inbox-id',
            notePosition: 10,
            isExpanded: false,
            utcDateModified: '2024-01-01T00:00:00Z',
          },
        };

        vi.spyOn(client, 'getInboxNote').mockResolvedValue(mockInboxNote);
        vi.spyOn(client, 'createNote').mockResolvedValue(mockCreatedNote);
        vi.spyOn(client, 'createAttribute').mockResolvedValue({} as Attribute);

        const result = await client.quickCapture({
          content: 'Quick note content',
          tags: ['urgent', 'todo'],
          metadata: { source: 'cli' },
        });
        
        expect(result.noteId).toBe('quick-note-id');
      });
    });
  });

  describe('Debug Mode', () => {
    it('should toggle debug mode', () => {
      expect(client.toggleDebugMode()).toBe(true);
      expect(client.toggleDebugMode()).toBe(false);
    });

    it('should enable debug mode', () => {
      client.enableDebugMode();
      // Debug mode enabled - would log additional info
    });

    it('should disable debug mode', () => {
      client.disableDebugMode();
      // Debug mode disabled
    });
  });

  describe('Request Builder', () => {
    it('should create update note builder', () => {
      const builder = client.createUpdateNoteBuilder();
      
      const updates = builder
        .title('New Title')
        .noteType('code')
        .mime('application/javascript')
        .isProtected(true)
        .build();
      
      expect(updates.title).toBe('New Title');
      expect(updates.type).toBe('code');
      expect(updates.mime).toBe('application/javascript');
      expect(updates.isProtected).toBe(true);
    });

    it('should validate builder input', () => {
      const builder = client.createUpdateNoteBuilder();
      
      expect(() => {
        builder.title('').build();
      }).toThrow('Note title cannot be empty');
      
      expect(() => {
        builder.noteType('invalid' as any).build();
      }).toThrow('Invalid note type');
    });
  });
});