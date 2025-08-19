import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TriliumClient } from '../../src/api/client.js';
import type { 
  Note, 
  CreateNoteDef, 
  UpdateNoteDef, 
  Branch, 
  Attribute,
  SearchResult,
  Attachment,
  CreateAttachmentDef,
  NoteWithContent,
  AppInfo,
  NoteTreeItem,
  LinkReference,
  TagInfo,
  Template
} from '../../src/types/api.js';
import { ApiError, AuthError, ValidationError } from '../../src/error.js';

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

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      vi.spyOn(client as any, 'sendRequest').mockRejectedValue(
        new Error('Network error')
      );

      await expect(client.getNote('test-id')).rejects.toThrow('Network error');
    });

    it('should handle authentication errors', async () => {
      vi.spyOn(client as any, 'sendRequest').mockRejectedValue(
        new AuthError('Invalid token')
      );

      await expect(client.getNote('test-id')).rejects.toThrow(AuthError);
    });

    it('should handle validation errors', async () => {
      vi.spyOn(client as any, 'sendRequest').mockRejectedValue(
        new ValidationError('Invalid input')
      );

      await expect(client.createNote({} as CreateNoteDef)).rejects.toThrow(ValidationError);
    });

    it('should retry on transient errors', async () => {
      const sendRequestSpy = vi.spyOn(client as any, 'sendRequest');
      sendRequestSpy
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ noteId: 'test-id', title: 'Test' });

      const result = await client.getNote('test-id');
      expect(result.noteId).toBe('test-id');
      expect(sendRequestSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Attachments API', () => {
    it('should get attachment metadata', async () => {
      const mockAttachment: Attachment = {
        attachmentId: 'att-id',
        ownerId: 'note-id',
        title: 'test.pdf',
        mime: 'application/pdf',
        size: 1024,
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockAttachment);

      const attachment = await client.getAttachment('att-id');
      expect(attachment.attachmentId).toBe('att-id');
      expect(attachment.mime).toBe('application/pdf');
    });

    it('should create attachment', async () => {
      const attachmentDef: CreateAttachmentDef = {
        ownerId: 'note-id',
        title: 'document.pdf',
        mime: 'application/pdf',
        content: Buffer.from('test content').toString('base64'),
      };

      const mockAttachment: Attachment = {
        attachmentId: 'new-att-id',
        ownerId: 'note-id',
        title: 'document.pdf',
        mime: 'application/pdf',
        size: 12,
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockAttachment);

      const attachment = await client.createAttachment(attachmentDef);
      expect(attachment.attachmentId).toBe('new-att-id');
    });

    it('should delete attachment', async () => {
      const deleteSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue(undefined);

      await client.deleteAttachment('att-id');
      expect(deleteSpy).toHaveBeenCalledWith('DELETE', '/attachments/att-id');
    });
  });

  describe('Advanced Search', () => {
    it('should search with complex query', async () => {
      const mockResults: SearchResult[] = [
        { noteId: 'note1', title: 'Match 1', score: 0.95 },
        { noteId: 'note2', title: 'Match 2', score: 0.85 },
      ];

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue({
        results: mockResults,
      });

      const results = await client.searchNotes(
        '#tag1 AND @attributeName="value" AND ~"content phrase"',
        false,
        false,
        50
      );

      expect(results).toHaveLength(2);
      expect(results[0]?.score).toBe(0.95);
    });

    it('should handle regex search', async () => {
      const searchSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue({
        results: [],
      });

      await client.searchNotes('~=".*pattern.*"', false, false, 10);
      
      expect(searchSpy).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('query=' + encodeURIComponent('~=".*pattern.*"'))
      );
    });
  });

  describe('Note Content Operations', () => {
    it('should get note with content', async () => {
      const mockNote: NoteWithContent = {
        noteId: 'test-id',
        title: 'Test Note',
        type: 'text',
        content: 'Note content here',
        isProtected: false,
        dateCreated: '2024-01-01',
        dateModified: '2024-01-01',
        utcDateCreated: '2024-01-01T00:00:00Z',
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockNote);

      const note = await client.getNoteWithContent('test-id');
      expect(note.content).toBe('Note content here');
    });

    it('should update note content', async () => {
      const updateSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue(undefined);

      await client.updateNoteContent('test-id', 'Updated content');
      
      expect(updateSpy).toHaveBeenCalledWith(
        'PUT',
        '/notes/test-id/content',
        'Updated content'
      );
    });

    it('should handle binary content', async () => {
      const binaryContent = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
      const updateSpy = vi.spyOn(client as any, 'sendRequest').mockResolvedValue(undefined);

      await client.updateNoteContent('image-note-id', binaryContent.toString('base64'));
      
      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('Templates API', () => {
    it('should list templates', async () => {
      const mockTemplates: Template[] = [
        { noteId: 'tpl1', title: 'Template 1', type: 'text' },
        { noteId: 'tpl2', title: 'Template 2', type: 'code' },
      ];

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockTemplates);

      const templates = await client.getTemplates();
      expect(templates).toHaveLength(2);
      expect(templates[0]?.title).toBe('Template 1');
    });

    it('should create note from template', async () => {
      const mockResponse = {
        note: {
          noteId: 'new-note-id',
          title: 'From Template',
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

      const result = await client.createNoteFromTemplate('tpl1', 'parent-id', {
        title: 'From Template',
        content: 'Template content',
      });

      expect(result.note.noteId).toBe('new-note-id');
    });
  });

  describe('Tags API', () => {
    it('should get all tags', async () => {
      const mockTags: TagInfo[] = [
        { name: 'important', noteCount: 10 },
        { name: 'todo', noteCount: 5 },
      ];

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockTags);

      const tags = await client.getTags();
      expect(tags).toHaveLength(2);
      expect(tags[0]?.name).toBe('important');
      expect(tags[0]?.noteCount).toBe(10);
    });

    it('should add tag to note', async () => {
      const attrSpy = vi.spyOn(client, 'createAttribute').mockResolvedValue({
        attributeId: 'attr-id',
        ownerId: 'note-id',
        type: 'label',
        name: 'tag',
        value: 'important',
        notePosition: 10,
        isInheritable: false,
        utcDateModified: '2024-01-01T00:00:00Z',
      });

      await client.addTag('note-id', 'important');
      
      expect(attrSpy).toHaveBeenCalledWith({
        noteId: 'note-id',
        type: 'label',
        name: 'tag',
        value: 'important',
      });
    });

    it('should remove tag from note', async () => {
      const attributes: Attribute[] = [
        {
          attributeId: 'attr1',
          ownerId: 'note-id',
          type: 'label',
          name: 'tag',
          value: 'important',
          notePosition: 10,
          isInheritable: false,
          utcDateModified: '2024-01-01T00:00:00Z',
        },
      ];

      vi.spyOn(client, 'getNoteAttributes').mockResolvedValue(attributes);
      const deleteSpy = vi.spyOn(client, 'deleteAttribute').mockResolvedValue(undefined);

      await client.removeTag('note-id', 'important');
      
      expect(deleteSpy).toHaveBeenCalledWith('attr1');
    });
  });

  describe('App Info', () => {
    it('should get app info', async () => {
      const mockAppInfo: AppInfo = {
        appVersion: '0.63.0',
        dbVersion: 220,
        dataDirectory: '/data',
        buildDate: '2024-01-01',
        buildRevision: 'abc123',
        clipperProtocolVersion: '1.0',
      };

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockAppInfo);

      const appInfo = await client.getAppInfo();
      expect(appInfo.appVersion).toBe('0.63.0');
      expect(appInfo.dbVersion).toBe(220);
    });
  });

  describe('Note Tree Operations', () => {
    it('should get note tree', async () => {
      const mockTree: NoteTreeItem[] = [
        {
          note: {
            noteId: 'root',
            title: 'Root',
            type: 'text',
            isProtected: false,
            dateCreated: '2024-01-01',
            dateModified: '2024-01-01',
            utcDateCreated: '2024-01-01T00:00:00Z',
            utcDateModified: '2024-01-01T00:00:00Z',
          },
          children: [
            {
              note: {
                noteId: 'child1',
                title: 'Child 1',
                type: 'text',
                isProtected: false,
                dateCreated: '2024-01-01',
                dateModified: '2024-01-01',
                utcDateCreated: '2024-01-01T00:00:00Z',
                utcDateModified: '2024-01-01T00:00:00Z',
              },
              children: [],
            },
          ],
        },
      ];

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockTree);

      const tree = await client.getNoteTree('root', 2);
      expect(tree).toHaveLength(1);
      expect(tree[0]?.note.noteId).toBe('root');
      expect(tree[0]?.children).toHaveLength(1);
    });
  });

  describe('Link References', () => {
    it('should get note links', async () => {
      const mockLinks: LinkReference[] = [
        {
          linkId: 'link1',
          sourceNoteId: 'note1',
          targetNoteId: 'note2',
          type: 'internal',
        },
        {
          linkId: 'link2',
          sourceNoteId: 'note1',
          targetNoteId: 'note3',
          type: 'internal',
        },
      ];

      vi.spyOn(client as any, 'sendRequest').mockResolvedValue(mockLinks);

      const links = await client.getNoteLinks('note1');
      expect(links).toHaveLength(2);
      expect(links[0]?.targetNoteId).toBe('note2');
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

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      const rateLimitedClient = new TriliumClient({
        baseUrl: 'http://localhost:8080',
        apiToken: 'test-token',
        rateLimitConfig: {
          maxRequests: 2,
          windowMs: 100,
        },
      });

      const sendRequestSpy = vi.spyOn(rateLimitedClient as any, 'sendRequest')
        .mockResolvedValue({ noteId: 'test-id' });

      // Make rapid requests
      const promises = [
        rateLimitedClient.getNote('test1'),
        rateLimitedClient.getNote('test2'),
        rateLimitedClient.getNote('test3'), // This should be delayed
      ];

      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Should have delay
      expect(sendRequestSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('Batch Operations', () => {
    it('should batch create multiple notes', async () => {
      const notes = [
        { parentNoteId: 'parent', title: 'Note 1', type: 'text' as const, content: 'Content 1' },
        { parentNoteId: 'parent', title: 'Note 2', type: 'text' as const, content: 'Content 2' },
      ];

      const createNoteSpy = vi.spyOn(client, 'createNote');
      for (const note of notes) {
        createNoteSpy.mockResolvedValueOnce({
          note: { ...note, noteId: `id-${note.title}` } as Note,
          branch: {} as Branch,
        });
      }

      const results = await Promise.all(
        notes.map(note => client.createNote(note))
      );

      expect(results).toHaveLength(2);
      expect(createNoteSpy).toHaveBeenCalledTimes(2);
    });

    it('should batch update multiple notes', async () => {
      const updates = [
        { noteId: 'note1', title: 'Updated 1' },
        { noteId: 'note2', title: 'Updated 2' },
      ];

      const updateNoteSpy = vi.spyOn(client, 'updateNote');
      for (const update of updates) {
        updateNoteSpy.mockResolvedValueOnce({
          noteId: update.noteId,
          title: update.title,
        } as Note);
      }

      const results = await Promise.all(
        updates.map(({ noteId, title }) => 
          client.updateNote(noteId, { title })
        )
      );

      expect(results).toHaveLength(2);
      expect(updateNoteSpy).toHaveBeenCalledTimes(2);
    });
  });
});