/**
 * Zod schemas for Attachment-related ETAPI endpoints
 */

import { z } from 'zod';
import {
  EntityIdSchema,
  LocalDateTimeSchema,
  UtcDateTimeSchema,
  MimeTypeSchema
} from './base.js';

// ========== Attachment Schemas ==========

/**
 * Attachment schema
 */
export const AttachmentSchema = z.object({
  attachmentId: EntityIdSchema,
  ownerId: EntityIdSchema,
  role: z.string(),
  mime: MimeTypeSchema,
  title: z.string().min(1),
  position: z.number().int(),
  blobId: z.string().optional(),
  dateModified: LocalDateTimeSchema,
  utcDateModified: UtcDateTimeSchema,
  utcDateScheduledForErasureSince: UtcDateTimeSchema.optional(),
  contentLength: z.number().int().optional()
});

/**
 * CreateAttachment schema - for POST /attachments
 */
export const CreateAttachmentSchema = z.object({
  ownerId: EntityIdSchema,
  role: z.string().default('file'),
  mime: MimeTypeSchema,
  title: z.string().min(1),
  content: z.string(), // Base64 encoded or text content
  position: z.number().int().optional()
});

/**
 * UpdateAttachmentDef schema - for PATCH /attachments/{attachmentId}
 */
export const UpdateAttachmentDefSchema = z.object({
  role: z.string().optional(),
  mime: MimeTypeSchema.optional(),
  title: z.string().min(1).optional(),
  position: z.number().int().optional()
}).refine(
  (obj) => Object.keys(obj).length > 0,
  { message: 'At least one field must be provided for update' }
);

/**
 * AttachmentContent schema - for GET/PUT /attachments/{attachmentId}/content
 */
export const AttachmentContentSchema = z.union([
  z.string(), // For text content
  z.instanceof(Buffer), // For binary content (Node.js)
  z.instanceof(Uint8Array), // For binary content (Browser/Deno)
  z.instanceof(ArrayBuffer) // For binary content (Browser/Deno)
]);

// Export types
export type Attachment = z.infer<typeof AttachmentSchema>;
export type CreateAttachment = z.infer<typeof CreateAttachmentSchema>;
export type UpdateAttachmentDef = z.infer<typeof UpdateAttachmentDefSchema>;
export type AttachmentContent = z.infer<typeof AttachmentContentSchema>;