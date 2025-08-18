import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { TriliumClient } from '../../src/api/client.js';
import type { Note, NoteWithContent, CreateNoteDef, UpdateNoteDef, Attribute, Branch, SearchResult, AppInfo } from '../../src/types/api.js';

/**
 * Live Integration Tests for Trilium ETAPI
 * 
 * These tests run against a real Trilium server instance and validate
 * all core functionality against the live ETAPI endpoints.
 * 
 * Prerequisites:
 * - Trilium server running on localhost:8080
 * - Valid ETAPI token configured
 * 
 * Set environment variables:
 * TRILIUM_SERVER_URL=http://localhost:8080
 * TRILIUM_API_TOKEN=your_etapi_token_here
 * TRILIUM_TEST_ENABLED=true (to enable these tests)
 */

describe('Live Trilium ETAPI Integration Tests', () => {
  const isTestEnabled = process.env.TRILIUM_TEST_ENABLED === 'true';
  const serverUrl = process.env.TRILIUM_SERVER_URL || 'http://localhost:8080';
  const apiToken = process.env.TRILIUM_API_TOKEN || '5c8daC6woEKk_gcRa8O7pPrlMW66XdBBWUNZG7gGUpR8ymhWxNLul0do=';
  
  let client: TriliumClient;
  let testNotesCreated: string[] = [];
  let testAttributesCreated: string[] = [];
  let testBranchesCreated: string[] = [];

  // Helper function to clean up test data
  const cleanupTestData = async () => {
    console.log(`Cleaning up ${testNotesCreated.length} test notes...`);
    
    // Clean up in reverse order - attributes first, then branches, then notes
    for (const attributeId of testAttributesCreated) {
      try {
        await client.deleteAttribute(attributeId);
      } catch (error) {
        console.warn(`Failed to cleanup attribute ${attributeId}:`, error);
      }
    }
    
    for (const branchId of testBranchesCreated) {
      try {
        await client.deleteBranch(branchId);
      } catch (error) {
        console.warn(`Failed to cleanup branch ${branchId}:`, error);
      }
    }
    
    for (const noteId of testNotesCreated) {
      try {
        await client.deleteNote(noteId);
      } catch (error) {
        console.warn(`Failed to cleanup note ${noteId}:`, error);
      }
    }
    
    // Clear tracking arrays
    testNotesCreated = [];
    testAttributesCreated = [];
    testBranchesCreated = [];
  };

  beforeAll(async () => {
    if (!isTestEnabled) {
      console.log('Live integration tests disabled. Set TRILIUM_TEST_ENABLED=true to enable.');
      return;
    }

    client = new TriliumClient({
      baseUrl: serverUrl,
      apiToken: apiToken,
      timeout: 30000,
      retries: 3,
      debugMode: true
    });

    console.log(`Connecting to Trilium server at ${serverUrl}`);
    
    // Test connection before running tests
    try {
      const appInfo = await client.testConnection();
      console.log(`Connected to Trilium ${appInfo.appVersion} (DB: ${appInfo.dbVersion})`);
    } catch (error) {
      console.error('Failed to connect to Trilium server:', error);
      throw new Error(`Cannot connect to Trilium server at ${serverUrl}. Ensure server is running and token is valid.`);
    }
  });

  afterAll(async () => {
    if (!isTestEnabled) return;
    
    await cleanupTestData();
    console.log('Live integration test cleanup completed.');
  });

  beforeEach(() => {
    if (!isTestEnabled) {
      // Skip the test if not enabled - using vitest skip API
      // @ts-ignore - vitest's skip functionality
      return;
    }
  });

  afterEach(async () => {
    if (!isTestEnabled) return;
    
    // Clean up after each test to prevent interference
    await cleanupTestData();
  });

  describe('Server Connection & Authentication', () => {
    it('should successfully connect to Trilium server', async () => {
      const appInfo = await client.getAppInfo();
      
      expect(appInfo).toBeDefined();
      expect(appInfo.appVersion).toBeDefined();
      expect(appInfo.dbVersion).toBeDefined();
      expect(typeof appInfo.appVersion).toBe('string');
      expect(typeof appInfo.dbVersion).toBe('string');
      
      console.log(`✓ Connected to Trilium ${appInfo.appVersion}`);
    });

    it('should authenticate with valid API token', async () => {
      // Test authentication by making an authenticated request
      const appInfo = await client.testConnection();
      expect(appInfo).toBeDefined();
      
      console.log('✓ API token authentication successful');
    });

    it('should report server configuration details', async () => {
      const appInfo = await client.getAppInfo();
      
      console.log('Server Configuration:');
      console.log(`  App Version: ${appInfo.appVersion}`);
      console.log(`  DB Version: ${appInfo.dbVersion}`);
      console.log(`  Sync Version: ${appInfo.syncVersion || 'N/A'}`);
      console.log(`  Build Date: ${appInfo.buildDate || 'N/A'}`);
      console.log(`  Build Revision: ${appInfo.buildRevision || 'N/A'}`);
      
      expect(appInfo.appVersion).toBeDefined();
      expect(appInfo.dbVersion).toBeDefined();
    });
  });

  describe('Note CRUD Operations', () => {
    it('should create a new note successfully', async () => {
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Test Note - Live Integration',
        type: 'text',
        content: 'This is a test note created during live integration testing.',
      };

      const result = await client.createNote(noteData);
      testNotesCreated.push(result.note.noteId);
      
      expect(result.note).toBeDefined();
      expect(result.note.noteId).toBeDefined();
      expect(result.note.title).toBe(noteData.title);
      expect(result.note.type).toBe(noteData.type);
      expect(result.branch).toBeDefined();
      expect(result.branch.noteId).toBe(result.note.noteId);
      expect(result.branch.parentNoteId).toBe(noteData.parentNoteId);
      
      console.log(`✓ Created note: ${result.note.noteId} - "${result.note.title}"`);
    });

    it('should retrieve note by ID', async () => {
      // First create a note
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Note for Retrieval Test',
        type: 'text',
        content: 'Content for retrieval test.',
      };

      const created = await client.createNote(noteData);
      testNotesCreated.push(created.note.noteId);

      // Now retrieve it
      const retrieved = await client.getNote(created.note.noteId);
      
      expect(retrieved.noteId).toBe(created.note.noteId);
      expect(retrieved.title).toBe(noteData.title);
      expect(retrieved.type).toBe(noteData.type);
      
      console.log(`✓ Retrieved note: ${retrieved.noteId} - "${retrieved.title}"`);
    });

    it('should retrieve note with content', async () => {
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Note with Content Test',
        type: 'text',
        content: 'This is test content for the note with content test.',
      };

      const created = await client.createNote(noteData);
      testNotesCreated.push(created.note.noteId);

      const noteWithContent = await client.getNoteWithContent(created.note.noteId);
      
      expect(noteWithContent.noteId).toBe(created.note.noteId);
      expect(noteWithContent.content).toBe(noteData.content);
      
      console.log(`✓ Retrieved note with content: ${noteWithContent.noteId}`);
      console.log(`  Content length: ${noteWithContent.content.length} characters`);
    });

    it('should update note metadata', async () => {
      // Create note first
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Original Title',
        type: 'text',
        content: 'Original content.',
      };

      const created = await client.createNote(noteData);
      testNotesCreated.push(created.note.noteId);

      // Update the note
      const updates: UpdateNoteDef = {
        title: 'Updated Title',
        isProtected: false,
      };

      const updated = await client.updateNote(created.note.noteId, updates);
      
      expect(updated.noteId).toBe(created.note.noteId);
      expect(updated.title).toBe(updates.title);
      expect(updated.isProtected).toBe(false);
      
      // Verify persistence
      const retrieved = await client.getNote(created.note.noteId);
      expect(retrieved.title).toBe(updates.title);
      
      console.log(`✓ Updated note: ${updated.noteId} - "${updated.title}"`);
    });

    it('should update note content', async () => {
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Content Update Test',
        type: 'text',
        content: 'Original content.',
      };

      const created = await client.createNote(noteData);
      testNotesCreated.push(created.note.noteId);

      const newContent = 'This is the updated content with more information and details.';
      await client.updateNoteContent(created.note.noteId, newContent);

      // Verify content was updated
      const updatedContent = await client.getNoteContent(created.note.noteId);
      expect(updatedContent).toBe(newContent);
      
      console.log(`✓ Updated note content: ${created.note.noteId}`);
      console.log(`  New content length: ${newContent.length} characters`);
    });

    it('should delete note', async () => {
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Note to Delete',
        type: 'text',
        content: 'This note will be deleted.',
      };

      const created = await client.createNote(noteData);
      
      // Delete the note
      await client.deleteNote(created.note.noteId);
      
      // Verify deletion - should throw error when trying to retrieve
      await expect(client.getNote(created.note.noteId)).rejects.toThrow();
      
      console.log(`✓ Deleted note: ${created.note.noteId}`);
    });

    it('should handle different note types', async () => {
      const noteTypes: Array<'text' | 'code' | 'render' | 'book'> = ['text', 'code', 'render', 'book'];
      
      for (const noteType of noteTypes) {
        const noteData: CreateNoteDef = {
          parentNoteId: 'root',
          title: `${noteType.charAt(0).toUpperCase() + noteType.slice(1)} Note Test`,
          type: noteType,
          content: noteType === 'code' ? 'console.log("Hello World");' : `Content for ${noteType} note.`,
          mime: noteType === 'code' ? 'application/javascript' : 'text/html',
        };

        const created = await client.createNote(noteData);
        testNotesCreated.push(created.note.noteId);
        
        expect(created.note.type).toBe(noteType);
        if (noteData.mime) {
          expect(created.note.mime).toBe(noteData.mime);
        }
        
        console.log(`✓ Created ${noteType} note: ${created.note.noteId}`);
      }
    });
  });

  describe('Search Functionality', () => {
    let searchTestNotes: string[] = [];

    beforeEach(async () => {
      // Create test notes for searching
      const testData = [
        { title: 'JavaScript Tutorial', content: 'Learn JavaScript basics and advanced concepts. Programming language for web development.' },
        { title: 'Python Programming Guide', content: 'Python programming guide for beginners and experts. Data science and machine learning.' },
        { title: 'Database Design Principles', content: 'SQL and NoSQL database design principles. Data modeling and optimization.' },
        { title: 'Web Development with React', content: 'Full stack web development with React and Node.js. Modern JavaScript frameworks.' },
        { title: 'Machine Learning Algorithms', content: 'Overview of machine learning algorithms and their applications in data science.' },
      ];

      console.log('Creating test notes for search tests...');
      
      for (const data of testData) {
        const noteData: CreateNoteDef = {
          parentNoteId: 'root',
          title: data.title,
          type: 'text',
          content: data.content,
        };

        const created = await client.createNote(noteData);
        searchTestNotes.push(created.note.noteId);
        testNotesCreated.push(created.note.noteId);
      }

      // Wait for indexing
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log(`Created ${searchTestNotes.length} test notes for search`);
    });

    it('should search notes by title', async () => {
      const results = await client.searchNotes('JavaScript', {
        fastSearch: false,
        includeArchived: false,
        limit: 50,
      });
      
      expect(results.length).toBeGreaterThan(0);
      const hasJavaScriptNote = results.some(result => result.title.includes('JavaScript'));
      expect(hasJavaScriptNote).toBe(true);
      
      console.log(`✓ Found ${results.length} results for "JavaScript" search`);
      console.log(`  Sample result: "${results[0]?.title}"`);
    });

    it('should search notes by content', async () => {
      const results = await client.searchNotes('programming', {
        fastSearch: false,
        includeArchived: false,
        limit: 50,
      });
      
      expect(results.length).toBeGreaterThan(0);
      
      console.log(`✓ Found ${results.length} results for "programming" content search`);
    });

    it('should search with advanced parameters', async () => {
      const results = await client.searchNotesAdvanced({
        search: 'machine learning',
        fastSearch: false,
        includeArchivedNotes: false,
        limit: 10,
      });
      
      expect(results.results).toBeDefined();
      expect(Array.isArray(results.results)).toBe(true);
      
      console.log(`✓ Advanced search found ${results.results.length} results for "machine learning"`);
    });

    it('should handle empty search results', async () => {
      const results = await client.searchNotes('nonexistenttermthatshouldhavenoMatches12345', {
        fastSearch: false,
        includeArchived: false,
        limit: 50,
      });
      
      expect(Array.isArray(results)).toBe(true);
      
      console.log(`✓ Empty search handling works - found ${results.length} results for non-existent term`);
    });

    it('should search with enhanced options', async () => {
      const results = await client.searchNotesEnhanced('data science', {
        includeContent: true,
        fastSearch: false,
        includeArchived: false,
        limit: 5,
        contextLines: 2,
        regexMode: false,
      });
      
      expect(Array.isArray(results)).toBe(true);
      
      if (results.length > 0) {
        expect(results[0].content).toBeDefined();
        console.log(`✓ Enhanced search found ${results.length} results with content`);
        console.log(`  Sample content preview: "${results[0].content?.substring(0, 100)}..."`);
      }
    });
  });

  describe('Attribute Management', () => {
    let testNote: Note;

    beforeEach(async () => {
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Attributes Test Note',
        type: 'text',
        content: 'Note for testing attributes (labels and relations).',
      };

      const created = await client.createNote(noteData);
      testNote = created.note;
      testNotesCreated.push(testNote.noteId);
      
      console.log(`Created test note for attributes: ${testNote.noteId}`);
    });

    it('should create and manage label attributes', async () => {
      const labelDef = {
        noteId: testNote.noteId,
        type: 'label' as const,
        name: 'priority',
        value: 'high',
      };

      const createdLabel = await client.createAttribute(labelDef);
      testAttributesCreated.push(createdLabel.attributeId);
      
      expect(createdLabel.type).toBe('label');
      expect(createdLabel.name).toBe('priority');
      expect(createdLabel.value).toBe('high');
      expect(createdLabel.noteId).toBe(testNote.noteId);
      
      console.log(`✓ Created label attribute: ${createdLabel.attributeId} (${createdLabel.name}=${createdLabel.value})`);

      // Retrieve attributes for the note
      const attributes = await client.getNoteAttributes(testNote.noteId);
      const foundLabel = attributes.find(attr => attr.attributeId === createdLabel.attributeId);
      expect(foundLabel).toBeDefined();
      
      console.log(`✓ Retrieved note attributes: found ${attributes.length} attributes`);
    });

    it('should create and manage relation attributes', async () => {
      // Create a target note for the relation
      const targetNoteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Target Note for Relation',
        type: 'text',
        content: 'This is a target note for relation testing.',
      };

      const targetNote = await client.createNote(targetNoteData);
      testNotesCreated.push(targetNote.note.noteId);

      const relationDef = {
        noteId: testNote.noteId,
        type: 'relation' as const,
        name: 'linkTo',
        value: targetNote.note.noteId,
      };

      const createdRelation = await client.createAttribute(relationDef);
      testAttributesCreated.push(createdRelation.attributeId);
      
      expect(createdRelation.type).toBe('relation');
      expect(createdRelation.name).toBe('linkTo');
      expect(createdRelation.value).toBe(targetNote.note.noteId);
      
      console.log(`✓ Created relation attribute: ${createdRelation.attributeId} (${createdRelation.name}->${createdRelation.value})`);
    });

    it('should update attribute values', async () => {
      const labelDef = {
        noteId: testNote.noteId,
        type: 'label' as const,
        name: 'status',
        value: 'draft',
      };

      const createdLabel = await client.createAttribute(labelDef);
      testAttributesCreated.push(createdLabel.attributeId);
      
      // Update the attribute value
      const updatedLabel = await client.updateAttribute(createdLabel.attributeId, {
        value: 'published',
      });
      
      expect(updatedLabel.value).toBe('published');
      
      // Verify the update persisted
      const retrievedLabel = await client.getAttribute(createdLabel.attributeId);
      expect(retrievedLabel.value).toBe('published');
      
      console.log(`✓ Updated attribute value: ${createdLabel.attributeId} (${createdLabel.name}: ${labelDef.value} -> ${updatedLabel.value})`);
    });

    it('should delete attributes', async () => {
      const labelDef = {
        noteId: testNote.noteId,
        type: 'label' as const,
        name: 'temporary',
        value: 'yes',
      };

      const createdLabel = await client.createAttribute(labelDef);
      
      // Delete the attribute
      await client.deleteAttribute(createdLabel.attributeId);
      
      // Verify deletion
      await expect(client.getAttribute(createdLabel.attributeId)).rejects.toThrow();
      
      console.log(`✓ Deleted attribute: ${createdLabel.attributeId}`);
    });

    it('should handle multiple attributes on same note', async () => {
      const attributes = [
        { type: 'label' as const, name: 'category', value: 'technical' },
        { type: 'label' as const, name: 'difficulty', value: 'intermediate' },
        { type: 'label' as const, name: 'language', value: 'javascript' },
      ];

      const createdAttributes = [];
      
      for (const attr of attributes) {
        const created = await client.createAttribute({
          noteId: testNote.noteId,
          ...attr,
        });
        createdAttributes.push(created);
        testAttributesCreated.push(created.attributeId);
      }

      // Retrieve all attributes for the note
      const noteAttributes = await client.getNoteAttributes(testNote.noteId);
      
      expect(noteAttributes.length).toBeGreaterThanOrEqual(attributes.length);
      
      // Verify all our attributes are present
      for (const created of createdAttributes) {
        const found = noteAttributes.find(attr => attr.attributeId === created.attributeId);
        expect(found).toBeDefined();
      }
      
      console.log(`✓ Created ${createdAttributes.length} attributes on note ${testNote.noteId}`);
      console.log(`  Total attributes on note: ${noteAttributes.length}`);
    });
  });

  describe('Branch Operations (Note Hierarchy)', () => {
    let parentNote: Note;
    let childNote: Note;

    beforeEach(async () => {
      // Create parent note
      const parentData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Parent Note for Branch Tests',
        type: 'book',
        content: 'This is a parent note for testing branches.',
      };

      const parentResult = await client.createNote(parentData);
      parentNote = parentResult.note;
      testNotesCreated.push(parentNote.noteId);

      // Create child note
      const childData: CreateNoteDef = {
        parentNoteId: parentNote.noteId,
        title: 'Child Note for Branch Tests',
        type: 'text',
        content: 'This is a child note for testing branches.',
      };

      const childResult = await client.createNote(childData);
      childNote = childResult.note;
      testNotesCreated.push(childNote.noteId);
      
      console.log(`Created parent note: ${parentNote.noteId} and child note: ${childNote.noteId}`);
    });

    it('should retrieve note branches', async () => {
      const branches = await client.getNoteBranches(childNote.noteId);
      
      expect(branches.length).toBeGreaterThan(0);
      expect(branches[0].noteId).toBe(childNote.noteId);
      expect(branches[0].parentNoteId).toBe(parentNote.noteId);
      
      console.log(`✓ Retrieved ${branches.length} branches for note ${childNote.noteId}`);
    });

    it('should create additional branches (clone note)', async () => {
      // Create another parent to clone the child note to
      const secondParentData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Second Parent for Clone Test',
        type: 'book',
        content: 'Second parent note.',
      };

      const secondParent = await client.createNote(secondParentData);
      testNotesCreated.push(secondParent.note.noteId);

      // Clone the child note to the second parent
      const newBranch = await client.createBranch({
        noteId: childNote.noteId,
        parentNoteId: secondParent.note.noteId,
      });
      testBranchesCreated.push(newBranch.branchId);
      
      expect(newBranch.noteId).toBe(childNote.noteId);
      expect(newBranch.parentNoteId).toBe(secondParent.note.noteId);
      
      // Verify the note now has multiple branches
      const branches = await client.getNoteBranches(childNote.noteId);
      expect(branches.length).toBeGreaterThanOrEqual(2);
      
      console.log(`✓ Created branch: ${newBranch.branchId} (cloned note ${childNote.noteId} to ${secondParent.note.noteId})`);
      console.log(`  Note now has ${branches.length} branches`);
    });

    it('should retrieve branch by ID', async () => {
      const branches = await client.getNoteBranches(childNote.noteId);
      const branchId = branches[0].branchId;
      
      const branch = await client.getBranch(branchId);
      
      expect(branch.branchId).toBe(branchId);
      expect(branch.noteId).toBe(childNote.noteId);
      expect(branch.parentNoteId).toBe(parentNote.noteId);
      
      console.log(`✓ Retrieved branch by ID: ${branchId}`);
    });

    it('should update branch properties', async () => {
      const branches = await client.getNoteBranches(childNote.noteId);
      const branch = branches[0];
      
      const updates = {
        prefix: 'Chapter 1: ',
        notePosition: 100,
      };
      
      const updatedBranch = await client.updateBranch(branch.branchId, updates);
      
      expect(updatedBranch.prefix).toBe(updates.prefix);
      expect(updatedBranch.notePosition).toBe(updates.notePosition);
      
      console.log(`✓ Updated branch: ${updatedBranch.branchId} (prefix: "${updatedBranch.prefix}")`);
    });

    it('should move note between parents', async () => {
      // Create a new parent
      const newParentData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'New Parent for Move Test',
        type: 'book',
        content: 'New parent for moving test.',
      };

      const newParent = await client.createNote(newParentData);
      testNotesCreated.push(newParent.note.noteId);

      // Move the child note to the new parent
      const newBranch = await client.moveNote(childNote.noteId, newParent.note.noteId);
      testBranchesCreated.push(newBranch.branchId);
      
      expect(newBranch.noteId).toBe(childNote.noteId);
      expect(newBranch.parentNoteId).toBe(newParent.note.noteId);
      
      // Verify the note is now under the new parent
      const updatedNote = await client.getNote(childNote.noteId);
      const branches = await client.getNoteBranches(childNote.noteId);
      const hasNewParent = branches.some(b => b.parentNoteId === newParent.note.noteId);
      expect(hasNewParent).toBe(true);
      
      console.log(`✓ Moved note ${childNote.noteId} to new parent ${newParent.note.noteId}`);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle invalid note ID gracefully', async () => {
      const invalidNoteId = 'nonexistent-note-id-12345';
      
      await expect(client.getNote(invalidNoteId)).rejects.toThrow();
      
      console.log('✓ Properly handles invalid note ID');
    });

    it('should handle invalid attribute ID gracefully', async () => {
      const invalidAttributeId = 'nonexistent-attr-id-12345';
      
      await expect(client.getAttribute(invalidAttributeId)).rejects.toThrow();
      
      console.log('✓ Properly handles invalid attribute ID');
    });

    it('should validate note creation data', async () => {
      const invalidNoteData = {
        parentNoteId: 'root',
        title: '', // Empty title should be invalid
        type: 'text' as const,
        content: 'Test content',
      };
      
      await expect(client.createNote(invalidNoteData)).rejects.toThrow();
      
      console.log('✓ Validates note creation data properly');
    });

    it('should handle large note content', async () => {
      const largeContent = 'x'.repeat(50000); // 50KB of content
      
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Large Content Note Test',
        type: 'text',
        content: largeContent,
      };

      const created = await client.createNote(noteData);
      testNotesCreated.push(created.note.noteId);
      
      const retrievedContent = await client.getNoteContent(created.note.noteId);
      expect(retrievedContent.length).toBe(largeContent.length);
      
      console.log(`✓ Handled large content: ${largeContent.length} characters`);
    });

    it('should handle special characters in note content', async () => {
      const specialContent = `
        Special characters test: äöüß 中文 🚀 📝 
        Markdown: **bold** _italic_ \`code\`
        HTML: <h1>Title</h1> <script>alert("test")</script>
        JSON: {"key": "value", "array": [1, 2, 3]}
        SQL: SELECT * FROM notes WHERE title LIKE '%test%';
        Unicode: 🔥 ⭐ 💡 ✅ ❌ 🎯
      `;
      
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Special Characters Test 🔥',
        type: 'text',
        content: specialContent,
      };

      const created = await client.createNote(noteData);
      testNotesCreated.push(created.note.noteId);
      
      const retrieved = await client.getNoteWithContent(created.note.noteId);
      expect(retrieved.content).toBe(specialContent);
      expect(retrieved.title).toBe(noteData.title);
      
      console.log(`✓ Handled special characters in title and content`);
    });
  });

  describe('Performance & Concurrency Tests', () => {
    it('should handle multiple concurrent note creations', async () => {
      const noteCount = 5;
      const startTime = Date.now();
      
      const createPromises = Array(noteCount).fill(null).map((_, i) =>
        client.createNote({
          parentNoteId: 'root',
          title: `Concurrent Note ${i + 1}`,
          type: 'text',
          content: `Content for concurrent note ${i + 1}`,
        })
      );

      const results = await Promise.all(createPromises);
      const endTime = Date.now();
      
      expect(results).toHaveLength(noteCount);
      results.forEach(result => {
        testNotesCreated.push(result.note.noteId);
      });
      
      const duration = endTime - startTime;
      const notesPerSecond = (noteCount / duration) * 1000;
      
      console.log(`✓ Created ${noteCount} notes concurrently in ${duration}ms`);
      console.log(`  Performance: ${notesPerSecond.toFixed(2)} notes/second`);
    });

    it('should handle multiple concurrent searches', async () => {
      const searchTerms = ['test', 'note', 'content', 'integration', 'trilium'];
      const startTime = Date.now();
      
      const searchPromises = searchTerms.map(term => 
        client.searchNotes(term, { limit: 10 })
      );

      const results = await Promise.all(searchPromises);
      const endTime = Date.now();
      
      expect(results).toHaveLength(searchTerms.length);
      
      const duration = endTime - startTime;
      const searchesPerSecond = (searchTerms.length / duration) * 1000;
      
      console.log(`✓ Performed ${searchTerms.length} concurrent searches in ${duration}ms`);
      console.log(`  Performance: ${searchesPerSecond.toFixed(2)} searches/second`);
    });

    it('should measure CRUD operation performance', async () => {
      const iterations = 3;
      const timings = {
        create: 0,
        read: 0,
        update: 0,
        delete: 0,
      };

      for (let i = 0; i < iterations; i++) {
        // Create
        let start = Date.now();
        const created = await client.createNote({
          parentNoteId: 'root',
          title: `Performance Test Note ${i}`,
          type: 'text',
          content: 'Performance test content.',
        });
        timings.create += (Date.now() - start);

        // Read
        start = Date.now();
        const read = await client.getNoteWithContent(created.note.noteId);
        timings.read += (Date.now() - start);

        // Update
        start = Date.now();
        const updated = await client.updateNote(created.note.noteId, {
          title: `Updated Performance Test Note ${i}`,
        });
        timings.update += (Date.now() - start);

        // Delete
        start = Date.now();
        await client.deleteNote(created.note.noteId);
        timings.delete += (Date.now() - start);
      }

      const avgTimings = {
        create: timings.create / iterations,
        read: timings.read / iterations,
        update: timings.update / iterations,
        delete: timings.delete / iterations,
      };

      console.log(`✓ CRUD Performance (average over ${iterations} iterations):`);
      console.log(`  Create: ${avgTimings.create.toFixed(2)}ms`);
      console.log(`  Read:   ${avgTimings.read.toFixed(2)}ms`);
      console.log(`  Update: ${avgTimings.update.toFixed(2)}ms`);
      console.log(`  Delete: ${avgTimings.delete.toFixed(2)}ms`);
      
      // Reasonable performance expectations
      expect(avgTimings.create).toBeLessThan(5000); // 5s max
      expect(avgTimings.read).toBeLessThan(2000);   // 2s max
      expect(avgTimings.update).toBeLessThan(3000); // 3s max
      expect(avgTimings.delete).toBeLessThan(2000); // 2s max
    });
  });

  describe('Data Integrity & Consistency', () => {
    it('should maintain data consistency across operations', async () => {
      const noteData: CreateNoteDef = {
        parentNoteId: 'root',
        title: 'Consistency Test Note',
        type: 'text',
        content: 'Original content for consistency test.',
      };

      const created = await client.createNote(noteData);
      testNotesCreated.push(created.note.noteId);
      
      // Perform multiple updates rapidly
      const updatePromises = Array(3).fill(null).map((_, i) =>
        client.updateNoteContent(created.note.noteId, `Updated content version ${i + 1}`)
      );

      await Promise.all(updatePromises);

      // Verify final state is consistent
      const finalContent = await client.getNoteContent(created.note.noteId);
      expect(finalContent).toMatch(/Updated content version \d+/);
      
      console.log(`✓ Data consistency maintained`);
      console.log(`  Final content: "${finalContent.substring(0, 50)}..."`);
    });

    it('should handle note hierarchy consistency', async () => {
      // Create a hierarchy: grandparent -> parent -> child
      const grandparent = await client.createNote({
        parentNoteId: 'root',
        title: 'Grandparent Note',
        type: 'book',
        content: 'Grandparent content.',
      });
      testNotesCreated.push(grandparent.note.noteId);

      const parent = await client.createNote({
        parentNoteId: grandparent.note.noteId,
        title: 'Parent Note',
        type: 'book',
        content: 'Parent content.',
      });
      testNotesCreated.push(parent.note.noteId);

      const child = await client.createNote({
        parentNoteId: parent.note.noteId,
        title: 'Child Note',
        type: 'text',
        content: 'Child content.',
      });
      testNotesCreated.push(child.note.noteId);

      // Verify hierarchy is consistent
      const childBranches = await client.getNoteBranches(child.note.noteId);
      expect(childBranches[0].parentNoteId).toBe(parent.note.noteId);

      const parentBranches = await client.getNoteBranches(parent.note.noteId);
      expect(parentBranches[0].parentNoteId).toBe(grandparent.note.noteId);

      const grandparentBranches = await client.getNoteBranches(grandparent.note.noteId);
      expect(grandparentBranches[0].parentNoteId).toBe('root');
      
      console.log('✓ Note hierarchy consistency verified');
      console.log(`  Hierarchy: root -> ${grandparent.note.noteId} -> ${parent.note.noteId} -> ${child.note.noteId}`);
    });
  });
});