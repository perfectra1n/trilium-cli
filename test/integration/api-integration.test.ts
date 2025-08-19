import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { TriliumClient } from '@/api/client';
import type { ApiClientConfig } from '@/types/api';
import { setupTestServer, teardownTestServer, TestServer } from './test-server';

describe('API Integration Tests', () => {
  let api: TriliumClient;
  let testServer: TestServer;
  let config: ApiClientConfig;

  beforeAll(async () => {
    // Setup a test server or use environment variables for real server
    testServer = await setupTestServer();
    
    config = {
      baseUrl: testServer.url,
      apiToken: testServer.token,
      timeout: 10000,
      retries: 2,
    };
    
    api = new TriliumClient(config);
  });

  afterAll(async () => {
    if (testServer) {
      await teardownTestServer(testServer);
    }
  });

  beforeEach(async () => {
    // Clean up any test data before each test
    await testServer.reset();
  });

  describe('Authentication Flow', () => {
    it('should authenticate with valid credentials', async () => {
      const result = await api.login('test-password');
      expect(result).toHaveProperty('token');
      expect(typeof result.token).toBe('string');
    });

    it('should reject invalid credentials', async () => {
      await expect(api.login('wrong-password')).rejects.toThrow();
    });

    it('should maintain session after authentication', async () => {
      await api.login('test-password');
      
      // Should be able to make authenticated requests
      const results = await api.searchNotes('*');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Note Management', () => {
    it('should create, read, update, and delete a note', async () => {
      // Create note
      const createData = {
        title: 'Integration Test Note',
        content: 'This is a test note created during integration testing.',
        type: 'text' as const,
        parentNoteId: 'root',
      };
      
      const result = await api.createNote(createData);
      const createdNote = result.note;
      expect(createdNote.noteId).toBeDefined();
      expect(createdNote.title).toBe(createData.title);

      // Read note
      const retrievedNote = await api.getNoteWithContent(createdNote.noteId);
      expect(retrievedNote.noteId).toBe(createdNote.noteId);
      expect(retrievedNote.title).toBe(createData.title);
      expect(retrievedNote.content).toBe(createData.content);

      // Update note
      const updateData = {
        title: 'Updated Integration Test Note',
        content: 'This content has been updated.',
      };
      
      const updatedNote = await api.updateNote(createdNote.noteId, updateData);
      expect(updatedNote.title).toBe(updateData.title);

      // Verify update persisted
      const reRetrievedNote = await api.getNote(createdNote.noteId);
      expect(reRetrievedNote.title).toBe(updateData.title);

      // Delete note
      await api.deleteNote(createdNote.noteId);

      // Verify deletion
      await expect(api.getNote(createdNote.noteId)).rejects.toThrow();
    });

    it('should handle note hierarchy correctly', async () => {
      // Create parent note
      const parentResult = await api.createNote({
        title: 'Parent Note',
        content: 'This is a parent note.',
        type: 'text',
        parentNoteId: 'root',
      });
      const parentNote = parentResult.note;

      // Create child note
      const childResult = await api.createNote({
        title: 'Child Note',
        content: 'This is a child note.',
        type: 'text',
        parentNoteId: parentNote.noteId,
      });
      const childNote = childResult.note;

      // Verify hierarchy
      const children = await api.getChildNotes(parentNote.noteId);
      expect(children.some(note => note.noteId === childNote.noteId)).toBe(true);

      // Clean up
      await api.deleteNote(childNote.noteId);
      await api.deleteNote(parentNote.noteId);
    });

    it('should handle different note types', async () => {
      const noteTypes = ['text', 'code', 'image', 'file'] as const;
      const createdNotes = [];

      for (const type of noteTypes) {
        const result = await api.createNote({
          title: `${type.charAt(0).toUpperCase() + type.slice(1)} Note`,
          content: type === 'code' ? 'console.log("hello");' : 'Content',
          type,
          parentNoteId: 'root',
        });
        const note = result.note;
        createdNotes.push(note);
        expect(note.type).toBe(type);
      }

      // Clean up
      for (const note of createdNotes) {
        await api.deleteNote(note.noteId);
      }
    });
  });

  describe('Search Functionality', () => {
    let testNotes: any[] = [];

    beforeEach(async () => {
      // Create test notes for searching
      const testData = [
        { title: 'JavaScript Tutorial', content: 'Learn JavaScript basics and advanced concepts.' },
        { title: 'Python Guide', content: 'Python programming guide for beginners.' },
        { title: 'Database Design', content: 'SQL and NoSQL database design principles.' },
        { title: 'Web Development', content: 'Full stack web development with JavaScript.' },
      ];

      for (const data of testData) {
        const note = await api.createNote({
          ...data,
          type: 'text',
          parentNoteId: 'root',
        });
        testNotes.push(note);
      }

      // Allow time for indexing
      await new Promise(resolve => setTimeout(resolve, 1000));
    });

    afterEach(async () => {
      // Clean up test notes
      for (const note of testNotes) {
        try {
          await api.deleteNote(note.noteId);
        } catch (error) {
          // Note might already be deleted
        }
      }
      testNotes = [];
    });

    it('should find notes by title', async () => {
      const results = await api.searchNotes('JavaScript');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(result => result.title.includes('JavaScript'))).toBe(true);
    });

    it('should find notes by content', async () => {
      const results = await api.searchNotes('programming');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(result => 
        result.content && result.content.includes('programming')
      )).toBe(true);
    });

    it('should return empty results for non-existent terms', async () => {
      const results = await api.searchNotes('nonexistenttermthatshouldhavenoMatches');
      expect(results).toHaveLength(0);
    });

    it('should handle complex search queries', async () => {
      const results = await api.searchNotes('JavaScript OR Python');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Attribute Management', () => {
    let testNote: any;

    beforeEach(async () => {
      testNote = await api.createNote({
        title: 'Attribute Test Note',
        content: 'Note for testing attributes.',
        type: 'text',
        parentNoteId: 'root',
      });
    });

    afterEach(async () => {
      if (testNote) {
        await api.deleteNote(testNote.noteId);
      }
    });

    it('should create and manage labels', async () => {
      const label = await api.createAttribute({
        noteId: testNote.noteId,
        type: 'label',
        name: 'priority',
        value: 'high',
      });

      expect(label.type).toBe('label');
      expect(label.name).toBe('priority');
      expect(label.value).toBe('high');

      // Retrieve attributes
      const attributes = await api.getAttributes(testNote.noteId);
      expect(attributes.some(attr => attr.attributeId === label.attributeId)).toBe(true);

      // Update attribute
      await api.updateAttribute(label.attributeId, { value: 'medium' });
      const updatedLabel = await api.getAttribute(label.attributeId);
      expect(updatedLabel.value).toBe('medium');

      // Delete attribute
      await api.deleteAttribute(label.attributeId);
      const finalAttributes = await api.getAttributes(testNote.noteId);
      expect(finalAttributes.some(attr => attr.attributeId === label.attributeId)).toBe(false);
    });

    it('should create and manage relations', async () => {
      // Create target note for relation
      const targetNote = await api.createNote({
        title: 'Target Note',
        content: 'Target for relation.',
        type: 'text',
        parentNoteId: 'root',
      });

      const relation = await api.createAttribute({
        noteId: testNote.noteId,
        type: 'relation',
        name: 'linkTo',
        value: targetNote.noteId,
      });

      expect(relation.type).toBe('relation');
      expect(relation.name).toBe('linkTo');
      expect(relation.value).toBe(targetNote.noteId);

      // Clean up
      await api.deleteAttribute(relation.attributeId);
      await api.deleteNote(targetNote.noteId);
    });
  });

  describe('Attachment Management', () => {
    let testNote: any;

    beforeEach(async () => {
      testNote = await api.createNote({
        title: 'Attachment Test Note',
        content: 'Note for testing attachments.',
        type: 'text',
        parentNoteId: 'root',
      });
    });

    afterEach(async () => {
      if (testNote) {
        await api.deleteNote(testNote.noteId);
      }
    });

    it('should upload and manage attachments', async () => {
      const testData = Buffer.from('Test file content');
      
      const attachment = await api.createAttachment({
        ownerId: testNote.noteId,
        role: 'file',
        mime: 'text/plain',
        title: 'test.txt',
        content: testData,
      });

      expect(attachment.title).toBe('test.txt');
      expect(attachment.mime).toBe('text/plain');
      expect(attachment.ownerId).toBe(testNote.noteId);

      // Download attachment
      const downloadedContent = await api.getAttachmentContent(attachment.attachmentId);
      expect(downloadedContent).toEqual(testData);

      // List attachments
      const attachments = await api.getAttachments(testNote.noteId);
      expect(attachments.some(att => att.attachmentId === attachment.attachmentId)).toBe(true);

      // Delete attachment
      await api.deleteAttachment(attachment.attachmentId);
      const finalAttachments = await api.getAttachments(testNote.noteId);
      expect(finalAttachments.some(att => att.attachmentId === attachment.attachmentId)).toBe(false);
    });

    it('should handle different file types', async () => {
      const fileTypes = [
        { data: Buffer.from('{"test": true}'), mime: 'application/json', title: 'data.json' },
        { data: Buffer.from('<h1>Test</h1>'), mime: 'text/html', title: 'page.html' },
        { data: Buffer.from('console.log("test");'), mime: 'text/javascript', title: 'script.js' },
      ];

      const attachments = [];

      for (const file of fileTypes) {
        const attachment = await api.createAttachment({
          ownerId: testNote.noteId,
          role: 'file',
          mime: file.mime,
          title: file.title,
          content: file.data,
        });
        attachments.push(attachment);
        expect(attachment.mime).toBe(file.mime);
        expect(attachment.title).toBe(file.title);
      }

      // Clean up
      for (const attachment of attachments) {
        await api.deleteAttachment(attachment.attachmentId);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle network interruptions gracefully', async () => {
      // Simulate network issues by using invalid URL temporarily
      const badConfig = { ...config, server_url: 'http://nonexistent:9999' };
      const badApi = new TriliumApi(badConfig);

      await expect(badApi.getNotes()).rejects.toThrow();
    });

    it('should respect rate limits', async () => {
      // Make rapid requests to test rate limiting
      const promises = Array(20).fill(null).map(() => api.getNotes());
      
      // Should not all fail due to rate limiting
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThan(0);
    });

    it('should handle large note content', async () => {
      const largeContent = 'x'.repeat(100000); // 100KB of content
      
      const note = await api.createNote({
        title: 'Large Content Note',
        content: largeContent,
        type: 'text',
        parentNoteId: 'root',
      });

      expect(note.content).toBe(largeContent);

      // Clean up
      await api.deleteNote(note.noteId);
    });

    it('should handle concurrent operations', async () => {
      // Create multiple notes concurrently
      const createPromises = Array(5).fill(null).map((_, i) => 
        api.createNote({
          title: `Concurrent Note ${i}`,
          content: `Content ${i}`,
          type: 'text',
          parentNoteId: 'root',
        })
      );

      const createdNotes = await Promise.all(createPromises);
      expect(createdNotes).toHaveLength(5);

      // Clean up concurrently
      const deletePromises = createdNotes.map(note => api.deleteNote(note.noteId));
      await Promise.all(deletePromises);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain data integrity across operations', async () => {
      const note = await api.createNote({
        title: 'Consistency Test',
        content: 'Original content',
        type: 'text',
        parentNoteId: 'root',
      });

      // Multiple rapid updates
      const updatePromises = Array(5).fill(null).map((_, i) =>
        api.updateNote(note.noteId, {
          content: `Updated content ${i}`,
        })
      );

      await Promise.all(updatePromises);

      // Verify final state is consistent
      const finalNote = await api.getNote(note.noteId);
      expect(finalNote.content).toMatch(/Updated content \d/);

      // Clean up
      await api.deleteNote(note.noteId);
    });
  });
});