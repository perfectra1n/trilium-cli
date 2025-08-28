/**
 * Base Zod schemas for Trilium ETAPI types
 * Generated from etapi.openapi.yaml specification
 */

import { z } from 'zod';

// ========== Basic Types ==========

/**
 * EntityId validation - pattern from OpenAPI spec
 * 4-32 alphanumeric characters with underscore
 */
export const EntityIdSchema = z.string()
  .regex(/^[a-zA-Z0-9_]{4,32}$/, 'EntityId must be 4-32 characters long and contain only letters, numbers, and underscores');

/**
 * StringId validation - pattern from OpenAPI spec
 * 1-32 alphanumeric characters with underscore
 */
export const StringIdSchema = z.string()
  .regex(/^[a-zA-Z0-9_]{1,32}$/, 'StringId must be 1-32 characters long and contain only letters, numbers, and underscores');

/**
 * LocalDateTime validation - pattern from OpenAPI spec
 * Format: YYYY-MM-DD HH:mm:ss.SSS±HHMM
 */
export const LocalDateTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}[\+\-]\d{4}$/, 'LocalDateTime must match format: YYYY-MM-DD HH:mm:ss.SSS±HHMM');

/**
 * UtcDateTime validation - pattern from OpenAPI spec
 * Format: YYYY-MM-DD HH:mm:ss.SSSZ
 */
export const UtcDateTimeSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'UtcDateTime must match format: YYYY-MM-DD HH:mm:ss.SSSZ');

/**
 * Date validation for calendar endpoints
 * Format: YYYY-MM-DD
 */
export const DateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/**
 * Month validation for calendar endpoints
 * Format: YYYY-MM
 */
export const MonthSchema = z.string()
  .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format');

/**
 * Year validation for calendar endpoints
 * Format: YYYY
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
]);

/**
 * AttributeType validation
 */
export const AttributeTypeSchema = z.enum(['label', 'relation']);

/**
 * ExportFormat validation
 */
export const ExportFormatSchema = z.enum(['html', 'markdown']);

/**
 * Order direction validation
 */
export const OrderDirectionSchema = z.enum(['asc', 'desc']);

/**
 * MIME type validation - basic format check
 */
export const MimeTypeSchema = z.string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.]*$/, 'Invalid MIME type format');

// ========== Error Schemas ==========

/**
 * Error response schema from API
 */
export const ErrorSchema = z.object({
  status: z.number().int(),
  code: z.string().optional(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional()
});

/**
 * Entity ID list schema
 */
export const EntityIdListSchema = z.array(EntityIdSchema);

// Export types
export type EntityId = z.infer<typeof EntityIdSchema>;
export type StringId = z.infer<typeof StringIdSchema>;
export type LocalDateTime = z.infer<typeof LocalDateTimeSchema>;
export type UtcDateTime = z.infer<typeof UtcDateTimeSchema>;
export type NoteType = z.infer<typeof NoteTypeSchema>;
export type AttributeType = z.infer<typeof AttributeTypeSchema>;
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
export type OrderDirection = z.infer<typeof OrderDirectionSchema>;
export type MimeType = z.infer<typeof MimeTypeSchema>;
export type ApiError = z.infer<typeof ErrorSchema>;