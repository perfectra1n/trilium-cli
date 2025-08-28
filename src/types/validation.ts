/**
 * Zod schemas for runtime validation of Trilium API types
 * Provides comprehensive validation with detailed error messages
 */

import { z } from 'zod';

import type {
  EntityId,
  NoteType,
  AttributeType,
  TriliumMimeType,
  ExportFormat,
  LocalDateTime,
  UtcDateTime,
  StringId,
} from './api.js';

// ========== Basic Types ==========

/**
 * EntityId validation - pattern from OpenAPI spec
 */
export const EntityIdSchema = z.string()
  .regex(/^[a-zA-Z0-9_]{4,32}$/, 'EntityId must be 4-32 characters long and contain only letters, numbers, and underscores')
  .brand<EntityId>();

/**
 * StringId validation - pattern from OpenAPI spec
 */
export const StringIdSchema = z.string()
  .regex(/^[a-zA-Z0-9_]{1,32}$/, 'StringId must be 1-32 characters long and contain only letters, numbers, and underscores')
  .brand<StringId>();

/**
 * LocalDateTime validation - pattern from OpenAPI spec
 */
export const LocalDateTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}[\+\-]\d{4}$/, 'LocalDateTime must match format: YYYY-MM-DD HH:mm:ss.SSS±HHMM')
  .brand<LocalDateTime>();

/**
 * UtcDateTime validation - pattern from OpenAPI spec
 */
export const UtcDateTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'UtcDateTime must match format: YYYY-MM-DD HH:mm:ss.SSSZ')
  .brand<UtcDateTime>();

/**
 * Date validation for calendar endpoints
 */
export const DateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/**
 * Month validation for calendar endpoints
 */
export const MonthSchema = z.string()
  .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format');

/**
 * Year validation for calendar endpoints
 */
export const YearSchema = z.string()
  .regex(/^\d{4}$/, 'Year must be in YYYY format');

// ========== Enum Validations ==========

/**
 * NoteType validation
 */
export const NoteTypeSchema = z.enum([
  'text', 'code', 'render', 'file', 'image', 'search', 'relationMap', 'book',
  'noteMap', 'mermaid', 'webView', 'shortcut', 'doc', 'contentWidget', 'launcher'
] as const);

/**
 * AttributeType validation
 */
export const AttributeTypeSchema = z.enum(['label', 'relation'] as const);

/**
 * ExportFormat validation
 */
export const ExportFormatSchema = z.enum(['html', 'markdown'] as const);

/**
 * Order direction validation
 */
export const OrderDirectionSchema = z.enum(['asc', 'desc'] as const);

/**
 * MIME type validation - basic format check
 */
export const MimeTypeSchema = z.string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.]*$/, 'Invalid MIME type format')
  .brand<TriliumMimeType>();

// ========== Core API Object Schemas ==========

/**
 * Note schema validation
 */
export const NoteSchema = z.object({
  ownerId: EntityIdSchema,
  title: z.string().min(1, 'Note title cannot be empty').max(1000, 'Note title too long (max 1000 characters)'),
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
  utcDateModified: UtcDateTimeSchema,
});

/**
 * CreateNoteDef schema validation
 */
export const CreateNoteDefSchema = z.object({
  parentNoteId: EntityIdSchema,
  title: z.string().min(1, 'Note title cannot be empty').max(1000, 'Note title too long (max 1000 characters)'),
  type: NoteTypeSchema,
  content: z.string(),
  mime: MimeTypeSchema.optional(),
  notePosition: z.number().int().optional(),
  prefix: z.string().optional(),
  isExpanded: z.boolean().optional(),
  ownerId: EntityIdSchema.optional(),
  branchId: EntityIdSchema.optional(),
  dateCreated: LocalDateTimeSchema.optional(),
  utcDateCreated: UtcDateTimeSchema.optional(),
});

/**
 * UpdateNoteDef schema validation
 */
export const UpdateNoteDefSchema = z.object({
  title: z.string().min(1, 'Note title cannot be empty').max(1000, 'Note title too long (max 1000 characters)').optional(),
  type: NoteTypeSchema.optional(),
  mime: MimeTypeSchema.optional(),
  isProtected: z.boolean().optional(),
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided for update' }
);

/**
 * Branch schema validation
 */
export const BranchSchema = z.object({
  branchId: EntityIdSchema,
  ownerId: EntityIdSchema,
  parentNoteId: EntityIdSchema,
  prefix: z.string().optional(),
  notePosition: z.number().int(),
  isExpanded: z.boolean(),
  utcDateModified: UtcDateTimeSchema,
});

/**
 * CreateBranchDef schema validation
 */
export const CreateBranchDefSchema = z.object({
  ownerId: EntityIdSchema,
  parentNoteId: EntityIdSchema,
  prefix: z.string().optional(),
  isExpanded: z.boolean().optional(),
  notePosition: z.number().int().optional(),
});

/**
 * UpdateBranchDef schema validation
 */
export const UpdateBranchDefSchema = z.object({
  prefix: z.string().optional(),
  notePosition: z.number().int().optional(),
  isExpanded: z.boolean().optional(),
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided for update' }
);

/**
 * Attribute schema validation
 */
export const AttributeSchema = z.object({
  attributeId: EntityIdSchema,
  ownerId: EntityIdSchema,
  type: AttributeTypeSchema,
  name: z.string().regex(/^[^\s]+$/, 'Attribute name cannot contain spaces').min(1, 'Attribute name cannot be empty'),
  value: z.string().optional(),
  notePosition: z.number().int(),
  isInheritable: z.boolean(),
  utcDateModified: UtcDateTimeSchema,
});

/**
 * CreateAttributeDef schema validation
 */
export const CreateAttributeDefSchema = z.object({
  ownerId: EntityIdSchema,
  type: AttributeTypeSchema,
  name: z.string().regex(/^[^\s]+$/, 'Attribute name cannot contain spaces').min(1, 'Attribute name cannot be empty'),
  value: z.string().optional(),
  isInheritable: z.boolean().optional(),
  notePosition: z.number().int().optional(),
});

/**
 * UpdateAttributeDef schema validation
 */
export const UpdateAttributeDefSchema = z.object({
  value: z.string().optional(),
  notePosition: z.number().int().optional(),
  isInheritable: z.boolean().optional(),
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided for update' }
);

/**
 * Attachment schema validation
 */
export const AttachmentSchema = z.object({
  attachmentId: EntityIdSchema,
  ownerId: EntityIdSchema,
  role: z.string(),
  mime: MimeTypeSchema,
  title: z.string().min(1, 'Attachment title cannot be empty'),
  notePosition: z.number().int(),
  blobId: z.string().optional(),
  dateModified: LocalDateTimeSchema,
  utcDateModified: UtcDateTimeSchema,
  utcDateScheduledForErasureSince: UtcDateTimeSchema.optional(),
  contentLength: z.number().int().optional(),
});

/**
 * CreateAttachmentDef schema validation
 */
export const CreateAttachmentDefSchema = z.object({
  ownerId: EntityIdSchema,
  role: z.string(),
  mime: MimeTypeSchema,
  title: z.string().min(1, 'Attachment title cannot be empty'),
  content: z.string(),
  notePosition: z.number().int().optional(),
});

// ========== Search Schemas ==========

/**
 * SearchNotesParams schema validation
 */
export const SearchNotesParamsSchema = z.object({
  search: z.string().min(1, 'Search query cannot be empty'),
  fastSearch: z.boolean().optional(),
  includeArchivedNotes: z.boolean().optional(),
  ancestorNoteId: EntityIdSchema.optional(),
  ancestorDepth: z.string().optional(),
  orderBy: z.string().optional(),
  orderDirection: OrderDirectionSchema.optional(),
  limit: z.number().int().positive().max(10000, 'Limit cannot exceed 10000').optional(),
  debug: z.boolean().optional(),
});

/**
 * SearchOptions schema validation
 */
export const SearchOptionsSchema = z.object({
  fastSearch: z.boolean(),
  includeArchived: z.boolean(),
  limit: z.number().int().positive().max(10000, 'Limit cannot exceed 10000'),
  regexMode: z.boolean(),
  includeContent: z.boolean(),
  contextLines: z.number().int().nonnegative(),
  ancestorNoteId: EntityIdSchema.optional(),
  ancestorDepth: z.string().optional(),
  orderBy: z.string().optional(),
  orderDirection: OrderDirectionSchema.optional(),
});

// ========== Authentication Schemas ==========

/**
 * LoginRequest schema validation
 */
export const LoginRequestSchema = z.object({
  password: z.string().min(1, 'Password cannot be empty'),
});

/**
 * LoginResponse schema validation
 */
export const LoginResponseSchema = z.object({
  authToken: z.string().min(1, 'Auth token cannot be empty'),
});

// ========== Template and Quick Capture Schemas ==========

/**
 * TemplateVariable schema validation
 */
export const TemplateVariableSchema = z.object({
  name: z.string().min(1, 'Variable name cannot be empty'),
  description: z.string(),
  defaultValue: z.string().optional(),
  required: z.boolean(),
});

/**
 * Template schema validation
 */
export const TemplateSchema = z.object({
  id: EntityIdSchema,
  title: z.string().min(1, 'Template title cannot be empty'),
  content: z.string(),
  variables: z.array(TemplateVariableSchema),
  description: z.string(),
});

/**
 * QuickCaptureRequest schema validation
 */
export const QuickCaptureRequestSchema = z.object({
  content: z.string().min(1, 'Content cannot be empty'),
  tags: z.array(z.string().regex(/^[^\s]+$/, 'Tags cannot contain spaces')),
  title: z.string().min(1, 'Title cannot be empty').optional(),
  inboxNoteId: EntityIdSchema.optional(),
  metadata: z.record(z.string(), z.string()),
});

// ========== API Configuration Schemas ==========

/**
 * ApiClientConfig schema validation
 */
export const ApiClientConfigSchema = z.object({
  baseUrl: z.string().url('Invalid base URL'),
  apiToken: z.string().optional(),
  timeout: z.number().int().positive().optional(),
  retries: z.number().int().nonnegative().max(10, 'Maximum 10 retries allowed').optional(),
  debugMode: z.boolean().optional(),
  rateLimitConfig: z.object({
    maxRequests: z.number().int().positive(),
    windowMs: z.number().int().positive(),
  }).optional(),
});

// ========== Error Schemas ==========

/**
 * TriliumApiErrorResponse schema validation
 */
export const TriliumApiErrorResponseSchema = z.object({
  status: z.number().int().min(100).max(599),
  code: z.string().min(1, 'Error code cannot be empty'),
  message: z.string().min(1, 'Error message cannot be empty'),
  details: z.record(z.string(), z.unknown()).optional(),
});

// ========== Validation Helper Functions ==========

/**
 * Validate and parse an EntityId
 */
export function validateEntityId(id: unknown, fieldName: string = 'entityId'): EntityId {
  try {
    return EntityIdSchema.parse(id);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid ${fieldName}: ${error.issues.map(i => i.message).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse a Note object
 */
export function validateNote(note: unknown): z.infer<typeof NoteSchema> {
  try {
    return NoteSchema.parse(note);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid Note: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse a CreateNoteDef object
 */
export function validateCreateNoteDef(noteDef: unknown): z.infer<typeof CreateNoteDefSchema> {
  try {
    return CreateNoteDefSchema.parse(noteDef);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid CreateNoteDef: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse an UpdateNoteDef object
 */
export function validateUpdateNoteDef(updates: unknown): z.infer<typeof UpdateNoteDefSchema> {
  try {
    return UpdateNoteDefSchema.parse(updates);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid UpdateNoteDef: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse SearchNotesParams
 */
export function validateSearchNotesParams(params: unknown): z.infer<typeof SearchNotesParamsSchema> {
  try {
    return SearchNotesParamsSchema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid SearchNotesParams: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse ApiClientConfig
 */
export function validateApiClientConfig(config: unknown): z.infer<typeof ApiClientConfigSchema> {
  try {
    return ApiClientConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid ApiClientConfig: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse QuickCaptureRequest
 */
export function validateQuickCaptureRequest(request: unknown): z.infer<typeof QuickCaptureRequestSchema> {
  try {
    return QuickCaptureRequestSchema.parse(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid QuickCaptureRequest: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

// ========== Runtime Type Guards ==========

/**
 * Type guard for EntityId
 */
export function isEntityId(value: unknown): value is EntityId {
  return EntityIdSchema.safeParse(value).success;
}

/**
 * Type guard for NoteType
 */
export function isNoteType(value: unknown): value is NoteType {
  return NoteTypeSchema.safeParse(value).success;
}

/**
 * Type guard for AttributeType
 */
export function isAttributeType(value: unknown): value is AttributeType {
  return AttributeTypeSchema.safeParse(value).success;
}

/**
 * Type guard for valid date string (YYYY-MM-DD)
 */
export function isValidDate(value: unknown): value is string {
  return DateSchema.safeParse(value).success;
}

/**
 * Type guard for valid month string (YYYY-MM)
 */
export function isValidMonth(value: unknown): value is string {
  return MonthSchema.safeParse(value).success;
}

/**
 * Type guard for valid year string (YYYY)
 */
export function isValidYear(value: unknown): value is string {
  return YearSchema.safeParse(value).success;
}