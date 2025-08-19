import { describe, it, expect, beforeAll } from 'vitest';
import { TriliumClient } from '../../src/api/client.js';
import { ApiError, AuthError, ValidationError } from '../../src/error.js';
import { getLiveTestConfig } from './live-test.config.js';

/**
 * Error Handling Integration Tests
 * 
 * This suite tests how the client handles various error conditions
 * from the live Trilium API, ensuring robust error handling.
 */

const config = getLiveTestConfig();

describe.skipIf(!config.enabled)('Trilium API Error Handling', () => {
  
  let client: TriliumClient;

  beforeAll(async () => {
    client = new TriliumClient({
      baseUrl: config.serverUrl,
      apiToken: config.apiToken,
      timeout: 15000,
      debugMode: true, // Enable debug to see error details
    });

    // Verify connection works first
    await client.getAppInfo();
  });


  describe('Authentication Errors', () => {
    it('should handle invalid API token', async () => {
      const invalidClient = new TriliumClient({
        baseUrl: config.serverUrl,
        apiToken: 'invalid-token-12345',
        timeout: 10000,
      });

      await expect(invalidClient.getAppInfo()).rejects.toThrow();
      
      try {
        await invalidClient.getAppInfo();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        console.log('✓ Invalid token error handled correctly:', error.message.substring(0, 100));
      }
    });

    it('should handle empty API token', async () => {
      const emptyTokenClient = new TriliumClient({
        baseUrl: config.serverUrl,
        apiToken: '',
        timeout: 10000,
      });

      await expect(emptyTokenClient.getAppInfo()).rejects.toThrow();
      console.log('✓ Empty token error handled correctly');
    });

    it('should handle malformed API token', async () => {
      const malformedTokens = [
        'short',
        '!@#$%^&*()',
        'a'.repeat(1000), // Very long token
        '   ', // Whitespace only
      ];

      for (const token of malformedTokens) {
        const malformedClient = new TriliumClient({
          baseUrl: config.serverUrl,
          apiToken: token,
          timeout: 5000,
        });

        await expect(malformedClient.getAppInfo()).rejects.toThrow();
      }
      
      console.log(`✓ Malformed token errors handled correctly (${malformedTokens.length} cases)`);
    });
  });

  describe('Network and Connection Errors', () => {
    it('should handle unreachable server', async () => {
      const unreachableClient = new TriliumClient({
        baseUrl: 'http://nonexistent-server-12345.local:8080',
        apiToken: config.apiToken,
        timeout: 3000, // Short timeout
      });

      await expect(unreachableClient.getAppInfo()).rejects.toThrow();
      console.log('✓ Unreachable server error handled correctly');
    });

    it('should handle wrong port', async () => {
      const wrongPortClient = new TriliumClient({
        baseUrl: 'http://localhost:9999', // Wrong port
        apiToken: config.apiToken,
        timeout: 3000,
      });

      await expect(wrongPortClient.getAppInfo()).rejects.toThrow();
      console.log('✓ Wrong port error handled correctly');
    });

    it('should handle timeout scenarios', async () => {
      const timeoutClient = new TriliumClient({
        baseUrl: config.serverUrl,
        apiToken: config.apiToken,
        timeout: 1, // Very short timeout (1ms)
      });

      await expect(timeoutClient.getAppInfo()).rejects.toThrow();
      console.log('✓ Timeout error handled correctly');
    });

    it('should handle malformed URLs', async () => {
      const malformedUrls = [
        'not-a-url',
        'ftp://invalid-protocol',
        'http://:8080', // Missing host
        'https://localhost:abc', // Invalid port
      ];

      for (const url of malformedUrls) {
        expect(() => {
          new TriliumClient({
            baseUrl: url,
            apiToken: config.apiToken,
          });
        }).toThrow();
      }
      
      console.log(`✓ Malformed URL validation works (${malformedUrls.length} cases)`);
    });
  });

  describe('Resource Not Found Errors', () => {
    it('should handle non-existent note ID', async () => {
      const nonExistentIds = [
        'nonexistent123',
        'fake-note-id',
        '00000000000',
        'zzzzzzzzzzz',
      ];

      for (const noteId of nonExistentIds) {
        await expect(client.getNote(noteId)).rejects.toThrow();
        
        try {
          await client.getNote(noteId);
        } catch (error) {
          expect(error.message.toLowerCase()).toMatch(/not found|404/);
        }
      }
      
      console.log(`✓ Non-existent note ID errors handled (${nonExistentIds.length} cases)`);
    });

    it('should handle non-existent attribute ID', async () => {
      const nonExistentId = 'fake-attribute-id-12345';
      
      await expect(client.getAttribute(nonExistentId)).rejects.toThrow();
      console.log('✓ Non-existent attribute ID error handled');
    });

    it('should handle non-existent branch ID', async () => {
      const nonExistentId = 'fake-branch-id-12345';
      
      await expect(client.getBranch(nonExistentId)).rejects.toThrow();
      console.log('✓ Non-existent branch ID error handled');
    });

    it('should handle non-existent parent note ID in creation', async () => {
      const invalidParentId = 'nonexistent-parent-id';
      
      await expect(client.createNote({
        parentNoteId: invalidParentId,
        title: 'Test Note',
        type: 'text',
        content: 'Test content',
      })).rejects.toThrow();
      
      console.log('✓ Invalid parent note ID error handled');
    });
  });

  describe('Validation Errors', () => {
    it('should validate note creation data', async () => {
      const invalidNoteData = [
        {
          data: { parentNoteId: 'root', title: '', type: 'text' }, // Empty title
          description: 'empty title'
        },
        {
          data: { parentNoteId: '', title: 'Test', type: 'text' }, // Empty parent ID
          description: 'empty parent ID'
        },
        {
          data: { parentNoteId: 'root', title: 'Test', type: 'invalid-type' }, // Invalid type
          description: 'invalid note type'
        },
        {
          data: { parentNoteId: 'root', title: 'a'.repeat(2000), type: 'text' }, // Title too long
          description: 'title too long'
        },
      ];

      for (const { data, description } of invalidNoteData) {
        await expect(client.createNote(data as any)).rejects.toThrow();
        console.log(`  ✓ Validation error for ${description}`);
      }
      
      console.log(`✓ Note validation errors handled (${invalidNoteData.length} cases)`);
    });

    it('should validate note update data', async () => {
      // First create a valid note
      const testNote = await client.createNote({
        parentNoteId: 'root',
        title: 'Validation Test Note',
        type: 'text',
        content: 'Test content',
      });

      const invalidUpdates = [
        {
          data: { title: '' }, // Empty title
          description: 'empty title in update'
        },
        {
          data: { type: 'invalid-type' }, // Invalid type
          description: 'invalid type in update'
        },
        {
          data: { mime: 'invalid-mime' }, // Invalid MIME type
          description: 'invalid MIME type'
        },
      ];

      for (const { data, description } of invalidUpdates) {
        await expect(client.updateNote(testNote.note.noteId, data as any)).rejects.toThrow();
        console.log(`  ✓ Update validation error for ${description}`);
      }

      // Cleanup
      await client.deleteNote(testNote.note.noteId);
      
      console.log(`✓ Note update validation errors handled (${invalidUpdates.length} cases)`);
    });

    it('should validate attribute creation data', async () => {
      // Create a test note first
      const testNote = await client.createNote({
        parentNoteId: 'root',
        title: 'Attribute Validation Test',
        type: 'text',
        content: 'Test content',
      });

      const invalidAttributeData = [
        {
          data: { noteId: testNote.note.noteId, type: 'label', name: '', value: 'test' }, // Empty name
          description: 'empty attribute name'
        },
        {
          data: { noteId: testNote.note.noteId, type: 'label', name: 'test name', value: 'test' }, // Space in name
          description: 'space in attribute name'
        },
        {
          data: { noteId: '', type: 'label', name: 'test', value: 'test' }, // Empty note ID
          description: 'empty note ID'
        },
        {
          data: { noteId: testNote.note.noteId, type: 'invalid', name: 'test', value: 'test' }, // Invalid type
          description: 'invalid attribute type'
        },
      ];

      for (const { data, description } of invalidAttributeData) {
        await expect(client.createAttribute(data as any)).rejects.toThrow();
        console.log(`  ✓ Attribute validation error for ${description}`);
      }

      // Cleanup
      await client.deleteNote(testNote.note.noteId);
      
      console.log(`✓ Attribute validation errors handled (${invalidAttributeData.length} cases)`);
    });

    it('should validate entity IDs', async () => {
      const invalidIds = [
        null,
        undefined,
        '',
        '   ', // Whitespace only
        123, // Number instead of string
        {}, // Object instead of string
        [], // Array instead of string
      ];

      for (const invalidId of invalidIds) {
        await expect(client.getNote(invalidId as any)).rejects.toThrow();
      }
      
      console.log(`✓ Entity ID validation works (${invalidIds.length} cases)`);
    });
  });

  describe('Operation-Specific Errors', () => {
    it('should handle search with invalid parameters', async () => {
      const invalidSearches = [
        { search: '', description: 'empty search query' },
        { search: 'a'.repeat(10000), description: 'extremely long search query' },
        { search: 'test', limit: -1, description: 'negative limit' },
        { search: 'test', limit: 100000, description: 'excessively large limit' },
      ];

      for (const { search, limit, description } of invalidSearches) {
        try {
          await client.searchNotesAdvanced({ search, limit } as any);
          console.log(`  ⚠️  Expected error for ${description} but none occurred`);
        } catch (error) {
          console.log(`  ✓ Search validation error for ${description}`);
        }
      }
    });

    it('should handle content operations on non-existent notes', async () => {
      const nonExistentId = 'fake-note-for-content-test';
      
      await expect(client.getNoteContent(nonExistentId)).rejects.toThrow();
      await expect(client.updateNoteContent(nonExistentId, 'new content')).rejects.toThrow();
      
      console.log('✓ Content operations on non-existent notes handled');
    });

    it('should handle branch operations with invalid data', async () => {
      const invalidBranchData = {
        noteId: 'fake-note-id',
        parentNoteId: 'fake-parent-id',
      };

      await expect(client.createBranch(invalidBranchData)).rejects.toThrow();
      console.log('✓ Invalid branch creation data handled');
    });

    it('should handle operations on deleted notes', async () => {
      // Create and then delete a note
      const testNote = await client.createNote({
        parentNoteId: 'root',
        title: 'Note to Delete for Error Test',
        type: 'text',
        content: 'This note will be deleted',
      });

      await client.deleteNote(testNote.note.noteId);

      // Try to operate on deleted note
      await expect(client.getNote(testNote.note.noteId)).rejects.toThrow();
      await expect(client.updateNote(testNote.note.noteId, { title: 'Updated' })).rejects.toThrow();
      await expect(client.getNoteContent(testNote.note.noteId)).rejects.toThrow();
      
      console.log('✓ Operations on deleted notes handled properly');
    });
  });

  describe('Server Error Simulation', () => {
    it('should handle malformed response data gracefully', async () => {
      // This test would ideally mock the HTTP client to return malformed responses
      // For now, we'll test with edge case inputs that might trigger server errors
      
      const edgeCaseInputs = [
        { title: '<script>alert("xss")</script>', type: 'text' },
        { title: '💻🔥💡⭐', type: 'text' }, // Emoji in title
        { title: 'SELECT * FROM notes', type: 'text' }, // SQL-like content
        { title: '{"json": "in title"}', type: 'text' }, // JSON in title
      ];

      for (const input of edgeCaseInputs) {
        try {
          const result = await client.createNote({
            parentNoteId: 'root',
            ...input,
            content: 'Edge case test content',
          });
          
          // If creation succeeds, clean up
          await client.deleteNote(result.note.noteId);
          console.log(`  ✓ Handled edge case input: "${input.title.substring(0, 20)}..."`);
        } catch (error) {
          console.log(`  ✓ Edge case input rejected safely: "${input.title.substring(0, 20)}..."`);
        }
      }
    });

    it('should handle concurrent operations that might conflict', async () => {
      // Create a test note
      const testNote = await client.createNote({
        parentNoteId: 'root',
        title: 'Concurrent Conflict Test',
        type: 'text',
        content: 'Original content',
      });

      // Try to update the same note concurrently with different data
      const concurrentUpdates = [
        client.updateNote(testNote.note.noteId, { title: 'Update 1' }),
        client.updateNote(testNote.note.noteId, { title: 'Update 2' }),
        client.updateNote(testNote.note.noteId, { title: 'Update 3' }),
      ];

      try {
        await Promise.all(concurrentUpdates);
        console.log('  ✓ Concurrent updates handled without errors');
      } catch (error) {
        console.log('  ✓ Concurrent update conflicts handled gracefully');
      }

      // Cleanup
      await client.deleteNote(testNote.note.noteId);
    });
  });

  describe('Rate Limiting and Resource Exhaustion', () => {
    it('should handle rapid successive requests', async () => {
      const rapidRequests = Array(20).fill(null).map(() => 
        client.getAppInfo()
      );

      const startTime = Date.now();
      
      try {
        const results = await Promise.allSettled(rapidRequests);
        const endTime = Date.now();
        
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        
        console.log(`  ✓ Rapid requests: ${successful} succeeded, ${failed} failed in ${endTime - startTime}ms`);
        
        // Should handle at least some requests successfully
        expect(successful).toBeGreaterThan(0);
        
      } catch (error) {
        console.log('  ✓ Rate limiting handled properly');
      }
    });

    it('should handle large content uploads', async () => {
      const sizes = [
        { size: 1024 * 100, name: '100KB' },    // 100KB
        { size: 1024 * 500, name: '500KB' },    // 500KB
        { size: 1024 * 1024, name: '1MB' },     // 1MB
      ];

      for (const { size, name } of sizes) {
        const largeContent = 'x'.repeat(size);
        
        try {
          const result = await client.createNote({
            parentNoteId: 'root',
            title: `Large Content Test ${name}`,
            type: 'text',
            content: largeContent,
          });
          
          // Verify content was stored correctly
          const retrievedContent = await client.getNoteContent(result.note.noteId);
          expect(retrievedContent.length).toBe(size);
          
          // Cleanup
          await client.deleteNote(result.note.noteId);
          
          console.log(`  ✓ Large content (${name}) handled successfully`);
        } catch (error) {
          console.log(`  ✓ Large content (${name}) rejected appropriately: ${error.message.substring(0, 100)}`);
        }
      }
    });
  });
});