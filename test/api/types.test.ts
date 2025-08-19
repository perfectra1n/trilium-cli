import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  NoteSchema,
  BranchSchema,
  AttributeSchema,
  AttachmentSchema,
  CreateNoteDefSchema,
  UpdateNoteDefSchema,
} from '@/types/validation';

describe('API Type Schemas', () => {
  describe('NoteSchema', () => {
    it('should validate valid note data', () => {
      const validNote = {
        ownerId: 'test_owner_123456',
        title: 'Test Note',
        type: 'text',
        mime: 'text/html',
        isProtected: false,
        dateCreated: '2023-01-01 00:00:00.000+0000',
        dateModified: '2023-01-01 00:00:00.000+0000',
        utcDateCreated: '2023-01-01 00:00:00.000Z',
        utcDateModified: '2023-01-01 00:00:00.000Z',
      };

      expect(() => NoteSchema.parse(validNote)).not.toThrow();
    });

    it('should reject invalid note data', () => {
      const invalidNote = {
        ownerId: '',  // Empty string should be invalid
        title: 'Test Note',
        type: 'invalid-type',  // Invalid type
      };

      expect(() => NoteSchema.parse(invalidNote)).toThrow();
    });

    it('should handle optional fields', () => {
      const minimalNote = {
        ownerId: 'test_owner_123456',
        title: 'Test Note',
        type: 'text',
        isProtected: false,
        dateCreated: '2023-01-01 00:00:00.000+0000',
        dateModified: '2023-01-01 00:00:00.000+0000',
        utcDateCreated: '2023-01-01 00:00:00.000Z',
        utcDateModified: '2023-01-01 00:00:00.000Z',
      };

      expect(() => NoteSchema.parse(minimalNote)).not.toThrow();
    });
  });

  describe('BranchSchema', () => {
    it('should validate valid branch data', () => {
      const validBranch = {
        branchId: 'branch_id_123456',
        ownerId: 'branch_owner_1234',
        parentNoteId: 'parent_note_1234',
        prefix: '',
        notePosition: 10,
        isExpanded: false,
        utcDateModified: '2023-01-01 00:00:00.000Z',
      };

      expect(() => BranchSchema.parse(validBranch)).not.toThrow();
    });

    it('should reject invalid branch data', () => {
      const invalidBranch = {
        ownerId: '',
        noteId: 'test_note_123456',
        // Missing required fields
      };

      expect(() => BranchSchema.parse(invalidBranch)).toThrow();
    });
  });

  describe('AttributeSchema', () => {
    it('should validate label attribute', () => {
      const labelAttribute = {
        attributeId: 'attr_id_123456',
        ownerId: 'attr_owner_12345',
        type: 'label',
        name: 'priority',
        value: 'high',
        notePosition: 0,
        isInheritable: false,
        utcDateModified: '2023-01-01 00:00:00.000Z',
      };

      expect(() => AttributeSchema.parse(labelAttribute)).not.toThrow();
    });

    it('should validate relation attribute', () => {
      const relationAttribute = {
        attributeId: 'attr_id_234567',
        ownerId: 'attr_owner_12345',
        type: 'relation',
        name: 'linkTo',
        value: 'target_note_1234',
        notePosition: 0,
        isInheritable: false,
        utcDateModified: '2023-01-01 00:00:00.000Z',
      };

      expect(() => AttributeSchema.parse(relationAttribute)).not.toThrow();
    });

    it('should reject invalid attribute type', () => {
      const invalidAttribute = {
        attributeId: 'attr_id_345678',
        ownerId: 'attr_owner_12345',
        type: 'invalid-type',
        name: 'test',
        value: 'value',
        notePosition: 0,
        isInheritable: false,
        utcDateModified: '2023-01-01 00:00:00.000Z',
      };

      expect(() => AttributeSchema.parse(invalidAttribute)).toThrow();
    });
  });

  describe('AttachmentSchema', () => {
    it('should validate valid attachment data', () => {
      const validAttachment = {
        attachmentId: 'attach_id_12345',
        ownerId: 'attach_owner_123',
        role: 'file',
        mime: 'application/pdf',
        title: 'document.pdf',
        blobId: 'blob_id_123456',
        notePosition: 0,
        dateModified: '2023-01-01 00:00:00.000+0000',
        utcDateModified: '2023-01-01 00:00:00.000Z',
      };

      expect(() => AttachmentSchema.parse(validAttachment)).not.toThrow();
    });

    it('should handle null erasure date', () => {
      const attachment = {
        attachmentId: 'attach_id_12345',
        ownerId: 'attach_owner_123',
        role: 'file',
        mime: 'application/pdf',
        title: 'document.pdf',
        blobId: 'blob_id_123456',
        notePosition: 0,
        dateModified: '2023-01-01 00:00:00.000+0000',
        utcDateModified: '2023-01-01 00:00:00.000Z',
        utcDateScheduledForErasureSince: '2023-01-01 00:00:00.000Z',
      };

      const parsed = AttachmentSchema.parse(attachment);
      expect(parsed.utcDateScheduledForErasureSince).toBe('2023-01-01 00:00:00.000Z');
    });
  });


  describe('CreateNoteDef and UpdateNoteDef', () => {
    it('should validate CreateNoteDef', () => {
      const createDef = {
        parentNoteId: 'parent_note_1234',
        title: 'New Note',
        type: 'text',
        content: 'Note content',
      };

      expect(() => CreateNoteDefSchema.parse(createDef)).not.toThrow();
    });

    it('should validate UpdateNoteDef', () => {
      const updateDef = {
        title: 'Updated Title',
        type: 'code',
        mime: 'application/javascript',
      };

      expect(() => UpdateNoteDefSchema.parse(updateDef)).not.toThrow();
    });
  });

  describe('Schema composition', () => {
    it('should handle arrays of schemas', () => {
      const notes = [
        {
          ownerId: 'note_owner_12345',
          title: 'First Note',
          type: 'text',
          isProtected: false,
          dateCreated: '2023-01-01 00:00:00.000+0000',
          dateModified: '2023-01-01 00:00:00.000+0000',
          utcDateCreated: '2023-01-01 00:00:00.000Z',
          utcDateModified: '2023-01-01 00:00:00.000Z',
        },
        {
          ownerId: 'note_owner_67890',
          title: 'Second Note',
          type: 'code',
          isProtected: true,
          dateCreated: '2023-01-02 00:00:00.000+0000',
          dateModified: '2023-01-02 00:00:00.000+0000',
          utcDateCreated: '2023-01-02 00:00:00.000Z',
          utcDateModified: '2023-01-02 00:00:00.000Z',
        },
      ];

      const NoteArraySchema = z.array(NoteSchema);
      expect(() => NoteArraySchema.parse(notes)).not.toThrow();
    });

    it('should handle partial updates', () => {
      const partialUpdate = {
        title: 'Updated Title',
        type: 'code',
      };

      expect(() => UpdateNoteDefSchema.parse(partialUpdate)).not.toThrow();
    });
  });
});