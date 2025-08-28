/**
 * Zod schemas for Note-related ETAPI endpoints
 */

import { z } from 'zod';
import {
  EntityIdSchema,
  LocalDateTimeSchema,
  UtcDateTimeSchema,
  NoteTypeSchema,
  MimeTypeSchema,
  ExportFormatSchema,
  OrderDirectionSchema
} from './base.js';

// ========== Note Core Schemas ==========

/**
 * Note schema validation
 */
export const NoteSchema = z.object({
  noteId: EntityIdSchema,
  title: z.string().min(1).max(1000),
  type: NoteTypeSchema,
  mime: MimeTypeSchema.optional(),
  isProtected: z.boolean(),
  blobId: z.string().optional(),
  attributes: z.array(z.lazy(() => AttributeSchema)).optional(),
  parentNoteIds: z.array(EntityIdSchema).optional(),
  childNoteIds: z.array(EntityIdSchema).optional(),
  parentBranchIds: z.array(EntityIdSchema).optional(),
  childBranchIds: z.array(EntityIdSchema).optional(),
  dateCreated: LocalDateTimeSchema,
  dateModified: LocalDateTimeSchema,
  utcDateCreated: UtcDateTimeSchema,
  utcDateModified: UtcDateTimeSchema
});

/**
 * CreateNoteDef schema - for POST /create-note
 */
export const CreateNoteDefSchema = z.object({
  parentNoteId: EntityIdSchema,
  title: z.string().min(1).max(1000),
  type: NoteTypeSchema,
  content: z.string(),
  mime: MimeTypeSchema.optional(),
  notePosition: z.number().int().optional(),
  prefix: z.string().optional(),
  isExpanded: z.boolean().optional(),
  noteId: EntityIdSchema.optional(),
  branchId: EntityIdSchema.optional(),
  dateCreated: LocalDateTimeSchema.optional(),
  utcDateCreated: UtcDateTimeSchema.optional()
});

/**
 * UpdateNoteDef schema - for PATCH /notes/{noteId}
 */
export const UpdateNoteDefSchema = z.object({
  title: z.string().min(1).max(1000).optional(),
  type: NoteTypeSchema.optional(),
  mime: MimeTypeSchema.optional(),
  isProtected: z.boolean().optional()
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided for update' }
);

/**
 * SearchNotesParams schema - for GET /notes
 */
export const SearchNotesParamsSchema = z.object({
  search: z.string().min(1),
  fastSearch: z.boolean().optional(),
  includeArchivedNotes: z.boolean().optional(),
  ancestorNoteId: EntityIdSchema.optional(),
  ancestorDepth: z.string().optional(),
  orderBy: z.string().optional(),
  orderDirection: OrderDirectionSchema.optional(),
  limit: z.number().int().positive().max(10000).optional(),
  debug: z.boolean().optional()
});

/**
 * SearchResponse schema
 */
export const SearchResponseSchema = z.object({
  results: z.array(NoteSchema),
  error: z.string().optional(),
  executionTime: z.number().optional(),
  count: z.number().int()
});

/**
 * NoteContent schema - for GET/PUT /notes/{noteId}/content
 */
export const NoteContentSchema = z.string();

/**
 * ExportNoteParams schema - for GET /notes/{noteId}/export
 */
export const ExportNoteParamsSchema = z.object({
  format: ExportFormatSchema
});

/**
 * ImportFile schema - for POST /notes/{noteId}/import
 */
export const ImportFileSchema = z.object({
  file: z.instanceof(Buffer).or(z.string()), // Can be binary or string content
  mimeType: MimeTypeSchema.optional()
});

/**
 * NoteRevision schema - for POST /notes/{noteId}/revision
 */
export const NoteRevisionSchema = z.object({
  revisionId: EntityIdSchema,
  noteId: EntityIdSchema,
  title: z.string(),
  content: z.string(),
  isProtected: z.boolean(),
  dateModified: LocalDateTimeSchema,
  utcDateModified: UtcDateTimeSchema
});

// ========== Branch Schemas ==========

/**
 * Branch schema
 */
export const BranchSchema = z.object({
  branchId: EntityIdSchema,
  noteId: EntityIdSchema,
  parentNoteId: EntityIdSchema,
  prefix: z.string().optional(),
  notePosition: z.number().int(),
  isExpanded: z.boolean(),
  utcDateModified: UtcDateTimeSchema
});

/**
 * CreateBranchDef schema - for POST /branches
 */
export const CreateBranchDefSchema = z.object({
  noteId: EntityIdSchema,
  parentNoteId: EntityIdSchema,
  prefix: z.string().optional(),
  isExpanded: z.boolean().optional(),
  notePosition: z.number().int().optional()
});

/**
 * UpdateBranchDef schema - for PATCH /branches/{branchId}
 */
export const UpdateBranchDefSchema = z.object({
  prefix: z.string().optional(),
  notePosition: z.number().int().optional(),
  isExpanded: z.boolean().optional()
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided for update' }
);

/**
 * NoteWithBranch schema - returned from create-note
 */
export const NoteWithBranchSchema = z.object({
  note: NoteSchema,
  branch: BranchSchema
});

// ========== Attribute Schemas ==========

/**
 * Attribute schema
 */
export const AttributeSchema = z.object({
  attributeId: EntityIdSchema,
  noteId: EntityIdSchema,
  type: z.enum(['label', 'relation']),
  name: z.string().regex(/^[^\s]+$/),
  value: z.string().optional(),
  position: z.number().int(),
  isInheritable: z.boolean(),
  utcDateModified: UtcDateTimeSchema
});

/**
 * CreateAttributeDef schema - for POST /attributes
 */
export const CreateAttributeDefSchema = z.object({
  noteId: EntityIdSchema,
  type: z.enum(['label', 'relation']),
  name: z.string().regex(/^[^\s]+$/),
  value: z.string().optional(),
  isInheritable: z.boolean().optional(),
  position: z.number().int().optional()
});

/**
 * UpdateAttributeDef schema - for PATCH /attributes/{attributeId}
 */
export const UpdateAttributeDefSchema = z.object({
  value: z.string().optional(),
  position: z.number().int().optional(),
  isInheritable: z.boolean().optional()
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided for update' }
);

/**
 * AttributeList schema
 */
export const AttributeListSchema = z.array(AttributeSchema);

// Export types
export type Note = z.infer<typeof NoteSchema>;
export type CreateNoteDef = z.infer<typeof CreateNoteDefSchema>;
export type UpdateNoteDef = z.infer<typeof UpdateNoteDefSchema>;
export type SearchNotesParams = z.infer<typeof SearchNotesParamsSchema>;
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
export type NoteContent = z.infer<typeof NoteContentSchema>;
export type ExportNoteParams = z.infer<typeof ExportNoteParamsSchema>;
export type ImportFile = z.infer<typeof ImportFileSchema>;
export type NoteRevision = z.infer<typeof NoteRevisionSchema>;
export type Branch = z.infer<typeof BranchSchema>;
export type CreateBranchDef = z.infer<typeof CreateBranchDefSchema>;
export type UpdateBranchDef = z.infer<typeof UpdateBranchDefSchema>;
export type NoteWithBranch = z.infer<typeof NoteWithBranchSchema>;
export type Attribute = z.infer<typeof AttributeSchema>;
export type CreateAttributeDef = z.infer<typeof CreateAttributeDefSchema>;
export type UpdateAttributeDef = z.infer<typeof UpdateAttributeDefSchema>;
export type AttributeList = z.infer<typeof AttributeListSchema>;