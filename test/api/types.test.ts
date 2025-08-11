import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  NoteSchema,
  BranchSchema,
  AttributeSchema,
  AttachmentSchema,
  SearchResultSchema,
  BackupSchema,
} from '@/api/types';

describe('API Type Schemas', () => {
  describe('NoteSchema', () => {
    it('should validate valid note data', () => {
      const validNote = {
        noteId: 'test-note-id',
        title: 'Test Note',
        content: 'Note content',
        type: 'text',
        mime: 'text/html',
        isProtected: false,
        isDeleted: false,
        dateCreated: '2023-01-01T00:00:00.000Z',
        dateModified: '2023-01-01T00:00:00.000Z',
        utcDateCreated: '2023-01-01T00:00:00.000Z',
        utcDateModified: '2023-01-01T00:00:00.000Z',
      };

      expect(() => NoteSchema.parse(validNote)).not.toThrow();
    });

    it('should reject invalid note data', () => {
      const invalidNote = {
        noteId: '',  // Empty string should be invalid
        title: 'Test Note',
        type: 'invalid-type',  // Invalid type
      };

      expect(() => NoteSchema.parse(invalidNote)).toThrow();
    });

    it('should handle optional fields', () => {
      const minimalNote = {
        noteId: 'test-note-id',
        title: 'Test Note',
        type: 'text',
        isProtected: false,
        isDeleted: false,
        dateCreated: '2023-01-01T00:00:00.000Z',
        dateModified: '2023-01-01T00:00:00.000Z',
        utcDateCreated: '2023-01-01T00:00:00.000Z',
        utcDateModified: '2023-01-01T00:00:00.000Z',
      };

      expect(() => NoteSchema.parse(minimalNote)).not.toThrow();
    });
  });

  describe('BranchSchema', () => {
    it('should validate valid branch data', () => {
      const validBranch = {
        branchId: 'test-branch-id',
        noteId: 'test-note-id',
        parentNoteId: 'parent-note-id',
        prefix: '',
        notePosition: 10,
        isExpanded: false,
        isDeleted: false,
        utcDateCreated: '2023-01-01T00:00:00.000Z',
        utcDateModified: '2023-01-01T00:00:00.000Z',
      };

      expect(() => BranchSchema.parse(validBranch)).not.toThrow();
    });

    it('should reject invalid branch data', () => {
      const invalidBranch = {
        branchId: '',
        noteId: 'test-note-id',
        // Missing required fields
      };

      expect(() => BranchSchema.parse(invalidBranch)).toThrow();
    });
  });

  describe('AttributeSchema', () => {
    it('should validate label attribute', () => {
      const labelAttribute = {
        attributeId: 'test-attr-id',
        noteId: 'test-note-id',
        type: 'label',
        name: 'priority',
        value: 'high',
        position: 0,
        utcDateCreated: '2023-01-01T00:00:00.000Z',
        utcDateModified: '2023-01-01T00:00:00.000Z',
        isDeleted: false,
      };

      expect(() => AttributeSchema.parse(labelAttribute)).not.toThrow();
    });

    it('should validate relation attribute', () => {
      const relationAttribute = {
        attributeId: 'test-attr-id',
        noteId: 'test-note-id',
        type: 'relation',
        name: 'linkTo',
        value: 'target-note-id',
        position: 0,
        utcDateCreated: '2023-01-01T00:00:00.000Z',
        utcDateModified: '2023-01-01T00:00:00.000Z',
        isDeleted: false,
      };

      expect(() => AttributeSchema.parse(relationAttribute)).not.toThrow();
    });

    it('should reject invalid attribute type', () => {
      const invalidAttribute = {
        attributeId: 'test-attr-id',
        noteId: 'test-note-id',
        type: 'invalid-type',
        name: 'test',
        value: 'value',
        position: 0,
        utcDateCreated: '2023-01-01T00:00:00.000Z',
        utcDateModified: '2023-01-01T00:00:00.000Z',
        isDeleted: false,
      };

      expect(() => AttributeSchema.parse(invalidAttribute)).toThrow();
    });
  });

  describe('AttachmentSchema', () => {
    it('should validate valid attachment data', () => {
      const validAttachment = {
        attachmentId: 'test-attachment-id',
        ownerId: 'owner-note-id',
        role: 'file',
        mime: 'application/pdf',
        title: 'document.pdf',
        blobId: 'blob-id',
        position: 0,
        utcDateCreated: '2023-01-01T00:00:00.000Z',
        utcDateModified: '2023-01-01T00:00:00.000Z',
        utcDateScheduledForErasureSince: null,
        isDeleted: false,
      };

      expect(() => AttachmentSchema.parse(validAttachment)).not.toThrow();
    });

    it('should handle null erasure date', () => {
      const attachment = {
        attachmentId: 'test-attachment-id',
        ownerId: 'owner-note-id',
        role: 'file',
        mime: 'application/pdf',
        title: 'document.pdf',
        blobId: 'blob-id',
        position: 0,
        utcDateCreated: '2023-01-01T00:00:00.000Z',
        utcDateModified: '2023-01-01T00:00:00.000Z',
        utcDateScheduledForErasureSince: null,
        isDeleted: false,
      };

      const parsed = AttachmentSchema.parse(attachment);
      expect(parsed.utcDateScheduledForErasureSince).toBeNull();
    });
  });

  describe('SearchResultSchema', () => {
    it('should validate search result with all fields', () => {
      const searchResult = {
        noteId: 'search-result-note-id',
        title: 'Found Note',
        content: 'Matching content...',
        type: 'text',
        score: 0.85,
        highlightedTitle: 'Found <mark>Note</mark>',
        highlightedContent: 'Matching <mark>content</mark>...',
      };

      expect(() => SearchResultSchema.parse(searchResult)).not.toThrow();
    });

    it('should handle minimal search result', () => {
      const minimalResult = {
        noteId: 'search-result-note-id',
        title: 'Found Note',
        type: 'text',
        score: 0.85,
      };

      expect(() => SearchResultSchema.parse(minimalResult)).not.toThrow();
    });

    it('should reject invalid score', () => {
      const invalidResult = {
        noteId: 'search-result-note-id',
        title: 'Found Note',
        type: 'text',
        score: 1.5, // Score should be between 0 and 1
      };

      expect(() => SearchResultSchema.parse(invalidResult)).toThrow();
    });
  });

  describe('BackupSchema', () => {
    it('should validate backup metadata', () => {
      const backup = {
        name: 'backup-2023-01-01.db',
        size: 1024000,
        dateCreated: '2023-01-01T12:00:00.000Z',
        filePath: '/backups/backup-2023-01-01.db',
      };

      expect(() => BackupSchema.parse(backup)).not.toThrow();
    });

    it('should reject negative size', () => {
      const invalidBackup = {
        name: 'backup-2023-01-01.db',
        size: -100,
        dateCreated: '2023-01-01T12:00:00.000Z',
        filePath: '/backups/backup-2023-01-01.db',
      };

      expect(() => BackupSchema.parse(invalidBackup)).toThrow();
    });
  });

  describe('Schema composition', () => {
    it('should handle arrays of schemas', () => {
      const notes = [
        {
          noteId: 'note-1',
          title: 'First Note',
          type: 'text',
          isProtected: false,
          isDeleted: false,
          dateCreated: '2023-01-01T00:00:00.000Z',
          dateModified: '2023-01-01T00:00:00.000Z',
          utcDateCreated: '2023-01-01T00:00:00.000Z',
          utcDateModified: '2023-01-01T00:00:00.000Z',
        },
        {
          noteId: 'note-2',
          title: 'Second Note',
          type: 'code',
          isProtected: true,
          isDeleted: false,
          dateCreated: '2023-01-02T00:00:00.000Z',
          dateModified: '2023-01-02T00:00:00.000Z',
          utcDateCreated: '2023-01-02T00:00:00.000Z',
          utcDateModified: '2023-01-02T00:00:00.000Z',
        },
      ];

      const NotesArraySchema = z.array(NoteSchema);
      expect(() => NotesArraySchema.parse(notes)).not.toThrow();
    });

    it('should handle partial updates', () => {
      const PartialNoteSchema = NoteSchema.partial();
      const partialUpdate = {
        title: 'Updated Title',
        content: 'Updated content',
      };

      expect(() => PartialNoteSchema.parse(partialUpdate)).not.toThrow();
    });
  });
});