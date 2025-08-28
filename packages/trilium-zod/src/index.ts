/**
 * @trilium-cli/zod - Comprehensive Zod schemas for Trilium ETAPI
 * 
 * This package provides complete type-safe validation schemas
 * for all Trilium ETAPI endpoints.
 */

// Re-export all base types and schemas
export * from './base.js';
export * from './notes.js';
export * from './attachments.js';
export * from './special.js';
export * from './validation.js';

// Convenience re-exports for commonly used schemas
export {
  // Base schemas
  EntityIdSchema,
  StringIdSchema,
  LocalDateTimeSchema,
  UtcDateTimeSchema,
  DateSchema,
  MonthSchema,
  YearSchema,
  NoteTypeSchema,
  AttributeTypeSchema,
  ExportFormatSchema,
  OrderDirectionSchema,
  MimeTypeSchema,
  ErrorSchema,
  EntityIdListSchema
} from './base.js';

export {
  // Note schemas
  NoteSchema,
  CreateNoteDefSchema,
  UpdateNoteDefSchema,
  SearchNotesParamsSchema,
  SearchResponseSchema,
  NoteContentSchema,
  ExportNoteParamsSchema,
  ImportFileSchema,
  NoteRevisionSchema,
  // Branch schemas
  BranchSchema,
  CreateBranchDefSchema,
  UpdateBranchDefSchema,
  NoteWithBranchSchema,
  // Attribute schemas
  AttributeSchema,
  CreateAttributeDefSchema,
  UpdateAttributeDefSchema,
  AttributeListSchema
} from './notes.js';

export {
  // Attachment schemas
  AttachmentSchema,
  CreateAttachmentSchema,
  UpdateAttachmentDefSchema,
  AttachmentContentSchema
} from './attachments.js';

export {
  // Calendar schemas
  CalendarNoteSchema,
  InboxNoteSchema,
  DayNotesResponseSchema,
  WeekNotesResponseSchema,
  MonthNotesResponseSchema,
  YearNotesResponseSchema,
  // Auth schemas
  LoginRequestSchema,
  LoginResponseSchema,
  LogoutResponseSchema,
  // System schemas
  AppInfoSchema,
  BackupResponseSchema,
  RefreshNoteOrderingResponseSchema
} from './special.js';

export {
  // Validation helpers
  validateEntityId,
  validateNote,
  validateCreateNoteDef,
  validateUpdateNoteDef,
  validateSearchNotesParams,
  validateCreateBranchDef,
  validateUpdateBranchDef,
  validateCreateAttributeDef,
  validateUpdateAttributeDef,
  validateCreateAttachment,
  validateUpdateAttachmentDef,
  validateLoginRequest,
  // Type guards
  isEntityId,
  isNoteType,
  isAttributeType,
  isValidDate,
  isValidMonth,
  isValidYear
} from './validation.js';