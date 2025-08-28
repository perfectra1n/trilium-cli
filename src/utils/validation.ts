import { z } from 'zod';

import { ValidationError } from '../error.js';
import type { EntityId } from '../types/common.js';

/**
 * Validate that a string is a valid entity ID
 */
export function isValidEntityId(id: string): id is EntityId {
  // Special case for Trilium system entities
  if (id === 'root' || id === '_hidden' || id === 'none') {
    return true;
  }
  // Regular entity IDs are 12+ alphanumeric characters
  return /^[a-zA-Z0-9_-]{12,}$/.test(id);
}

/**
 * Validate entity ID with error throwing
 */
export function validateEntityId(id: string, fieldName = 'id'): EntityId {
  if (!isValidEntityId(id)) {
    throw new ValidationError(`Invalid ${fieldName}: must be a valid entity ID`, fieldName);
  }
  return id;
}

/**
 * URL validation schema
 */
export const urlSchema = z.string().url();

/**
 * Entity ID schema
 */
export const entityIdSchema = z.string().refine(isValidEntityId, {
  message: 'Invalid entity ID format',
});

/**
 * Normalize URL by removing trailing slashes
 * This prevents issues with double slashes when joining paths
 */
export function normalizeUrl(url: string): string {
  // Remove trailing slashes (but keep protocol slashes like https://)
  return url.replace(/\/+$/, '');
}

/**
 * Validate URL
 */
export function validateUrl(url: string, fieldName = 'url'): string {
  try {
    return urlSchema.parse(url);
  } catch (error) {
    throw new ValidationError(`Invalid ${fieldName}: must be a valid URL`, fieldName, error as Error);
  }
}

/**
 * Validate and normalize URL
 * Validates that the URL is valid and normalizes it by removing trailing slashes
 */
export function validateAndNormalizeUrl(url: string, fieldName = 'url'): string {
  const validatedUrl = validateUrl(url, fieldName);
  return normalizeUrl(validatedUrl);
}

/**
 * Generic validation function using Zod schemas
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown, fieldName?: string): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new ValidationError(
        fieldName ? `Validation failed for ${fieldName}: ${message}` : `Validation failed: ${message}`,
        fieldName
      );
    }
    throw error;
  }
}