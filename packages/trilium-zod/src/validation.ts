/**
 * Validation helper functions for Trilium ETAPI schemas
 */

import { z } from 'zod';
import {
  EntityIdSchema,
  NoteTypeSchema,
  AttributeTypeSchema,
  DateSchema,
  MonthSchema,
  YearSchema,
  type EntityId,
  type NoteType,
  type AttributeType
} from './base.js';
import {
  NoteSchema,
  CreateNoteDefSchema,
  UpdateNoteDefSchema,
  SearchNotesParamsSchema,
  CreateBranchDefSchema,
  UpdateBranchDefSchema,
  CreateAttributeDefSchema,
  UpdateAttributeDefSchema
} from './notes.js';
import {
  CreateAttachmentSchema,
  UpdateAttachmentDefSchema
} from './attachments.js';
import {
  LoginRequestSchema
} from './special.js';

// ========== Validation Helper Functions ==========

/**
 * Validate and parse an EntityId
 */
export function validateEntityId(id: unknown, fieldName = 'entityId'): EntityId {
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
 * Validate and parse CreateBranchDef
 */
export function validateCreateBranchDef(branchDef: unknown): z.infer<typeof CreateBranchDefSchema> {
  try {
    return CreateBranchDefSchema.parse(branchDef);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid CreateBranchDef: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse UpdateBranchDef
 */
export function validateUpdateBranchDef(updates: unknown): z.infer<typeof UpdateBranchDefSchema> {
  try {
    return UpdateBranchDefSchema.parse(updates);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid UpdateBranchDef: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse CreateAttributeDef
 */
export function validateCreateAttributeDef(attrDef: unknown): z.infer<typeof CreateAttributeDefSchema> {
  try {
    return CreateAttributeDefSchema.parse(attrDef);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid CreateAttributeDef: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse UpdateAttributeDef
 */
export function validateUpdateAttributeDef(updates: unknown): z.infer<typeof UpdateAttributeDefSchema> {
  try {
    return UpdateAttributeDefSchema.parse(updates);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid UpdateAttributeDef: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse CreateAttachment
 */
export function validateCreateAttachment(attachment: unknown): z.infer<typeof CreateAttachmentSchema> {
  try {
    return CreateAttachmentSchema.parse(attachment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid CreateAttachment: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse UpdateAttachmentDef
 */
export function validateUpdateAttachmentDef(updates: unknown): z.infer<typeof UpdateAttachmentDefSchema> {
  try {
    return UpdateAttachmentDefSchema.parse(updates);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid UpdateAttachmentDef: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Validate and parse LoginRequest
 */
export function validateLoginRequest(request: unknown): z.infer<typeof LoginRequestSchema> {
  try {
    return LoginRequestSchema.parse(request);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid LoginRequest: ${error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
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