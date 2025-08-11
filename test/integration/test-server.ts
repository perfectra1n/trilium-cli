import { vi } from 'vitest';

export interface TestServer {
  url: string;
  token: string;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

let mockNotes: any[] = [];
let mockAttributes: any[] = [];
let mockAttachments: any[] = [];
let noteIdCounter = 1000;
let attributeIdCounter = 2000;
let attachmentIdCounter = 3000;

export async function setupTestServer(): Promise<TestServer> {
  // Mock the got HTTP client for testing
  const got = await import('got');
  
  const mockHttpClient = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  };

  // Mock API responses
  mockHttpClient.get.mockImplementation(async (url: string) => {
    if (url.includes('/etapi/notes')) {
      if (url.includes('/notes/')) {
        // Get specific note
        const noteId = url.split('/').pop();
        const note = mockNotes.find(n => n.noteId === noteId);
        if (!note) throw new Error('Note not found');
        return { body: note };
      } else if (url.includes('/search')) {
        // Search notes
        const searchParams = new URLSearchParams(url.split('?')[1]);
        const query = searchParams.get('query') || '';
        const results = mockNotes.filter(note => 
          note.title.toLowerCase().includes(query.toLowerCase()) ||
          note.content?.toLowerCase().includes(query.toLowerCase())
        ).map(note => ({
          noteId: note.noteId,
          title: note.title,
          content: note.content,
          type: note.type,
          score: 0.9,
        }));
        return { body: results };
      } else {
        // Get all notes
        return { body: mockNotes };
      }
    }
    
    if (url.includes('/etapi/attributes')) {
      if (url.includes('/attributes/')) {
        // Get specific attribute
        const attributeId = url.split('/').pop();
        const attribute = mockAttributes.find(a => a.attributeId === attributeId);
        if (!attribute) throw new Error('Attribute not found');
        return { body: attribute };
      } else {
        // Get attributes for note
        const noteId = url.split('/notes/')[1]?.split('/')[0];
        const attributes = mockAttributes.filter(a => a.noteId === noteId);
        return { body: attributes };
      }
    }
    
    if (url.includes('/etapi/attachments')) {
      if (url.includes('/attachments/')) {
        const parts = url.split('/');
        const attachmentId = parts[parts.length - 1];
        if (parts.includes('download')) {
          // Download attachment content
          const attachment = mockAttachments.find(a => a.attachmentId === attachmentId);
          if (!attachment) throw new Error('Attachment not found');
          return { body: Buffer.from('Test file content') };
        } else {
          // Get specific attachment
          const attachment = mockAttachments.find(a => a.attachmentId === attachmentId);
          if (!attachment) throw new Error('Attachment not found');
          return { body: attachment };
        }
      } else {
        // Get attachments for note
        const noteId = url.split('/notes/')[1]?.split('/')[0];
        const attachments = mockAttachments.filter(a => a.ownerId === noteId);
        return { body: attachments };
      }
    }
    
    throw new Error(`Unmocked GET endpoint: ${url}`);
  });

  mockHttpClient.post.mockImplementation(async (url: string, options: any) => {
    const body = options.json || options.body;
    
    if (url.includes('/etapi/login')) {
      if (body.password === 'test-password') {
        return { body: { token: 'test-auth-token' } };
      } else {
        throw new Error('Unauthorized');
      }
    }
    
    if (url.includes('/etapi/notes')) {
      // Create note
      const newNote = {
        noteId: `note-${noteIdCounter++}`,
        title: body.title,
        content: body.content || '',
        type: body.type || 'text',
        parentNoteId: body.parentNoteId || 'root',
        isProtected: false,
        isDeleted: false,
        dateCreated: new Date().toISOString(),
        dateModified: new Date().toISOString(),
        utcDateCreated: new Date().toISOString(),
        utcDateModified: new Date().toISOString(),
        ...body,
      };
      mockNotes.push(newNote);
      return { body: newNote };
    }
    
    if (url.includes('/etapi/attributes')) {
      // Create attribute
      const newAttribute = {
        attributeId: `attr-${attributeIdCounter++}`,
        noteId: body.noteId,
        type: body.type,
        name: body.name,
        value: body.value,
        position: body.position || 0,
        utcDateCreated: new Date().toISOString(),
        utcDateModified: new Date().toISOString(),
        isDeleted: false,
        ...body,
      };
      mockAttributes.push(newAttribute);
      return { body: newAttribute };
    }
    
    if (url.includes('/etapi/attachments')) {
      // Create attachment
      const newAttachment = {
        attachmentId: `att-${attachmentIdCounter++}`,
        ownerId: body.ownerId,
        role: body.role,
        mime: body.mime,
        title: body.title,
        blobId: `blob-${attachmentIdCounter}`,
        position: body.position || 0,
        utcDateCreated: new Date().toISOString(),
        utcDateModified: new Date().toISOString(),
        utcDateScheduledForErasureSince: null,
        isDeleted: false,
        ...body,
      };
      mockAttachments.push(newAttachment);
      return { body: newAttachment };
    }
    
    throw new Error(`Unmocked POST endpoint: ${url}`);
  });

  mockHttpClient.patch.mockImplementation(async (url: string, options: any) => {
    const body = options.json || options.body;
    
    if (url.includes('/etapi/notes/')) {
      // Update note
      const noteId = url.split('/').pop();
      const noteIndex = mockNotes.findIndex(n => n.noteId === noteId);
      if (noteIndex === -1) throw new Error('Note not found');
      
      mockNotes[noteIndex] = {
        ...mockNotes[noteIndex],
        ...body,
        dateModified: new Date().toISOString(),
        utcDateModified: new Date().toISOString(),
      };
      return { body: mockNotes[noteIndex] };
    }
    
    if (url.includes('/etapi/attributes/')) {
      // Update attribute
      const attributeId = url.split('/').pop();
      const attributeIndex = mockAttributes.findIndex(a => a.attributeId === attributeId);
      if (attributeIndex === -1) throw new Error('Attribute not found');
      
      mockAttributes[attributeIndex] = {
        ...mockAttributes[attributeIndex],
        ...body,
        utcDateModified: new Date().toISOString(),
      };
      return { body: mockAttributes[attributeIndex] };
    }
    
    throw new Error(`Unmocked PATCH endpoint: ${url}`);
  });

  mockHttpClient.delete.mockImplementation(async (url: string) => {
    if (url.includes('/etapi/notes/')) {
      // Delete note
      const noteId = url.split('/').pop();
      const noteIndex = mockNotes.findIndex(n => n.noteId === noteId);
      if (noteIndex === -1) throw new Error('Note not found');
      
      mockNotes.splice(noteIndex, 1);
      // Also delete related attributes and attachments
      mockAttributes = mockAttributes.filter(a => a.noteId !== noteId);
      mockAttachments = mockAttachments.filter(a => a.ownerId !== noteId);
      
      return { statusCode: 204 };
    }
    
    if (url.includes('/etapi/attributes/')) {
      // Delete attribute
      const attributeId = url.split('/').pop();
      const attributeIndex = mockAttributes.findIndex(a => a.attributeId === attributeId);
      if (attributeIndex === -1) throw new Error('Attribute not found');
      
      mockAttributes.splice(attributeIndex, 1);
      return { statusCode: 204 };
    }
    
    if (url.includes('/etapi/attachments/')) {
      // Delete attachment
      const attachmentId = url.split('/').pop();
      const attachmentIndex = mockAttachments.findIndex(a => a.attachmentId === attachmentId);
      if (attachmentIndex === -1) throw new Error('Attachment not found');
      
      mockAttachments.splice(attachmentIndex, 1);
      return { statusCode: 204 };
    }
    
    throw new Error(`Unmocked DELETE endpoint: ${url}`);
  });

  // Replace the got module with our mock
  vi.mocked(got.default).mockImplementation(mockHttpClient as any);

  const testServer: TestServer = {
    url: 'http://localhost:8080',
    token: 'test-auth-token',
    
    async reset() {
      // Clear all mock data
      mockNotes = [];
      mockAttributes = [];
      mockAttachments = [];
      noteIdCounter = 1000;
      attributeIdCounter = 2000;
      attachmentIdCounter = 3000;
      
      // Add some default test data
      mockNotes.push({
        noteId: 'root',
        title: 'Root',
        content: '',
        type: 'text',
        parentNoteId: null,
        isProtected: false,
        isDeleted: false,
        dateCreated: new Date().toISOString(),
        dateModified: new Date().toISOString(),
        utcDateCreated: new Date().toISOString(),
        utcDateModified: new Date().toISOString(),
      });
    },
    
    async close() {
      // Clean up any resources if needed
      vi.clearAllMocks();
    },
  };

  // Initialize with default data
  await testServer.reset();

  return testServer;
}

export async function teardownTestServer(server: TestServer): Promise<void> {
  await server.close();
}

// Additional helper functions for test setup
export function createMockNote(overrides: Partial<any> = {}) {
  return {
    noteId: `mock-note-${Date.now()}`,
    title: 'Mock Note',
    content: 'Mock content',
    type: 'text',
    parentNoteId: 'root',
    isProtected: false,
    isDeleted: false,
    dateCreated: new Date().toISOString(),
    dateModified: new Date().toISOString(),
    utcDateCreated: new Date().toISOString(),
    utcDateModified: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockAttribute(overrides: Partial<any> = {}) {
  return {
    attributeId: `mock-attr-${Date.now()}`,
    noteId: 'mock-note',
    type: 'label',
    name: 'test',
    value: 'value',
    position: 0,
    utcDateCreated: new Date().toISOString(),
    utcDateModified: new Date().toISOString(),
    isDeleted: false,
    ...overrides,
  };
}

export function createMockAttachment(overrides: Partial<any> = {}) {
  return {
    attachmentId: `mock-att-${Date.now()}`,
    ownerId: 'mock-note',
    role: 'file',
    mime: 'text/plain',
    title: 'test.txt',
    blobId: 'mock-blob',
    position: 0,
    utcDateCreated: new Date().toISOString(),
    utcDateModified: new Date().toISOString(),
    utcDateScheduledForErasureSince: null,
    isDeleted: false,
    ...overrides,
  };
}