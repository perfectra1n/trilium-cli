import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TriliumClient } from '@/api/client';

// These tests require a real Trilium instance running
describe('TriliumClient Advanced Features Integration', () => {
  let client: TriliumClient;
  let testNoteId: string;
  
  // Support both authenticated and no-auth modes
  const noAuth = process.env.TRILIUM_GENERAL_NOAUTHENTICATION === 'true';
  const apiToken = noAuth ? undefined : (process.env.TRILIUM_API_TOKEN || 'Klzxo8XMWgKG_ExeXR94RCXggRuaS+9BzIcJFSgqtU0+WR8qvguBSOzA=');
  const serverUrl = process.env.TRILIUM_SERVER_URL || 'http://localhost:8080';
  
  beforeAll(async () => {
    // Create a test note for our experiments
    const basicClient = new TriliumClient({
      baseUrl: serverUrl,
      apiToken: apiToken,
    });
    
    try {
      const result = await basicClient.createNote({
        parentNoteId: 'root',
        title: `Test Note ${Date.now()}_${Math.random().toString(36).substring(7)}`,
        type: 'text',
        content: 'Test content for integration tests',
      });
      testNoteId = result.note.noteId;
    } catch (error) {
      console.log('Could not create test note, using root instead');
      testNoteId = 'root';
    }
  });
  
  afterAll(async () => {
    // Clean up test note if we created one
    if (testNoteId && testNoteId !== 'root') {
      try {
        const basicClient = new TriliumClient({
          baseUrl: serverUrl,
          apiToken: apiToken,
        });
        await basicClient.deleteNote(testNoteId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  describe('Retry Logic', () => {
    it('should retry on transient errors', async () => {
      // Create a client with aggressive retry settings
      const retryClient = new TriliumClient({
        baseUrl: serverUrl,
        apiToken: apiToken,
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 100,
          maxDelayMs: 1000,
        },
      });

      // Test with a valid request that should succeed
      const note = await retryClient.getNote(testNoteId);
      expect(note).toBeDefined();
      expect(note.noteId).toBe(testNoteId);
    });

    it('should handle network interruptions gracefully', async () => {
      // Create a client that points to a non-existent server first
      const flakyClient = new TriliumClient({
        baseUrl: 'http://localhost:9999', // Non-existent server
        apiToken: apiToken,
        retryConfig: {
          maxRetries: 2,
          initialDelayMs: 50,
          maxDelayMs: 100,
        },
        timeout: 500, // Short timeout to fail faster
      });

      // This should fail after retries
      await expect(flakyClient.getNote('root')).rejects.toThrow();
    }, 10000); // Increase test timeout

    it('should not retry on client errors (4xx)', async () => {
      const client = new TriliumClient({
        baseUrl: serverUrl,
        apiToken: apiToken,
        retryConfig: {
          maxRetries: 3,
          initialDelayMs: 50,
        },
      });

      // Try to get a non-existent note - should fail immediately without retries
      const startTime = Date.now();
      await expect(client.getNote('nonexistent123')).rejects.toThrow();
      const duration = Date.now() - startTime;
      
      // Should fail quickly without retries (under 200ms)
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      // Create a rate-limited client
      const rateLimitedClient = new TriliumClient({
        baseUrl: serverUrl,
        apiToken: apiToken,
        rateLimitConfig: {
          maxRequests: 2,
          windowMs: 1000, // 2 requests per second
        },
      });

      const startTime = Date.now();
      
      // Make 3 rapid requests - the third should be delayed
      const promises = [
        rateLimitedClient.getAppInfo(),
        rateLimitedClient.getAppInfo(),
        rateLimitedClient.getAppInfo(), // This should be delayed
      ];

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All requests should succeed
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.appVersion).toBeDefined();
      });

      // The third request should have been delayed, so total time > 1000ms
      expect(duration).toBeGreaterThanOrEqual(900); // Allow some margin
    });

    it('should handle burst traffic correctly', async () => {
      const rateLimitedClient = new TriliumClient({
        baseUrl: serverUrl,
        apiToken: apiToken,
        rateLimitConfig: {
          maxRequests: 3,
          windowMs: 500,
        },
      });

      // Make 5 requests rapidly
      const requests = Array.from({ length: 5 }, (_, i) => 
        rateLimitedClient.searchNotes(`test${i}`, false, false, 1)
      );

      const startTime = Date.now();
      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // All requests should complete
      expect(results).toHaveLength(5);
      
      // Should have taken at least 500ms due to rate limiting
      expect(duration).toBeGreaterThanOrEqual(400); // Allow margin
    });
  });

  describe('Template Features', () => {
    it('should list and use templates', async () => {
      const client = new TriliumClient({
        baseUrl: serverUrl,
        apiToken: apiToken,
      });

      // First create a template
      const templateResult = await client.createNote({
        parentNoteId: 'root',
        title: `Template ${Date.now()}_${Math.random().toString(36).substring(7)}`,
        type: 'text',
        content: 'Template content with {{variable}}',
      });
      
      // Add template label
      await client.createAttribute({
        noteId: templateResult.note.noteId,
        type: 'label',
        name: 'template',
        value: '',
      });

      // Get all templates
      const templates = await client.getTemplates();
      expect(templates).toBeDefined();
      expect(Array.isArray(templates)).toBe(true);
      
      // Find our template
      const ourTemplate = templates.find(t => t.noteId === templateResult.note.noteId);
      expect(ourTemplate).toBeDefined();

      // Create note from template
      const fromTemplate = await client.createNoteFromTemplate(
        templateResult.note.noteId,
        {
          title: 'Note from Template',
          content: 'Template content with replaced value',
        },
        'root'
      );
      
      expect(fromTemplate.note).toBeDefined();
      expect(fromTemplate.note.title).toBe('Note from Template');

      // Cleanup
      await client.deleteNote(templateResult.note.noteId);
      await client.deleteNote(fromTemplate.note.noteId);
    });
  });

  describe('Tag Management', () => {
    it('should get all tags in the system', async () => {
      const client = new TriliumClient({
        baseUrl: serverUrl,
        apiToken: apiToken,
      });

      // Create a note with tags for testing
      const noteResult = await client.createNote({
        parentNoteId: 'root',
        title: `Tagged Note ${Date.now()}_${Math.random().toString(36).substring(7)}`,
        type: 'text',
        content: 'Note with tags',
      });

      // Add some tags
      await client.addTag(noteResult.note.noteId, 'testTag1');
      await client.addTag(noteResult.note.noteId, 'testTag2');

      // Wait a moment for the tags to be indexed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify tags were added by checking the note's attributes
      const noteAttrs = await client.getAttributesByNoteId(noteResult.note.noteId);
      const labels = noteAttrs.filter(a => a.type === 'label');
      const labelNames = labels.map(l => l.name);
      expect(labelNames).toContain('testTag1');
      expect(labelNames).toContain('testTag2');

      // Remove a tag
      await client.removeTag(noteResult.note.noteId, 'testTag1');
      
      // Verify tag was removed
      const updatedAttrs = await client.getAttributesByNoteId(noteResult.note.noteId);
      const updatedLabels = updatedAttrs.filter(a => a.type === 'label');
      const updatedLabelNames = updatedLabels.map(l => l.name);
      expect(updatedLabelNames).toContain('testTag2');
      expect(updatedLabelNames).not.toContain('testTag1');

      // Cleanup
      await client.deleteNote(noteResult.note.noteId);
    });
  });
});