import { z } from 'zod';
import { ImportExportError } from './types.js';
import { validateSecurePath } from './secure-path.js';

/**
 * Input validation utilities for import/export operations
 */

/**
 * Schema for validating user input strings
 */
export const SafeStringSchema = z.string()
  .min(1, 'String cannot be empty')
  .max(1000, 'String too long (max 1000 characters)')
  .refine(
    (val) => !(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(val)),
    'String contains invalid control characters'
  )
  .refine(
    (val) => !(/[<>"`$(){}[\]|&;]/.test(val)),
    'String contains potentially dangerous characters'
  );

/**
 * Schema for validating file paths
 */
export const SafePathSchema = z.string()
  .min(1, 'Path cannot be empty')
  .max(4096, 'Path too long (max 4096 characters)')
  .refine(
    (val) => !val.includes('..'),
    'Path contains directory traversal sequence'
  )
  .refine(
    (val) => !(/[\x00-\x1f]/.test(val)),
    'Path contains control characters'
  )
  .refine(
    (val) => !(/[<>"|?*]/.test(val)),
    'Path contains invalid characters'
  );

/**
 * Schema for validating file extensions
 */
export const SafeExtensionSchema = z.string()
  .regex(/^[a-zA-Z0-9]+$/, 'Extension contains invalid characters')
  .min(1, 'Extension cannot be empty')
  .max(10, 'Extension too long (max 10 characters)');

/**
 * Schema for validating MIME types
 */
export const MimeTypeSchema = z.string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/, 
         'Invalid MIME type format');

/**
 * Schema for validating URLs
 */
export const SafeUrlSchema = z.string()
  .url('Invalid URL format')
  .refine(
    (val) => {
      const url = new URL(val);
      return ['http:', 'https:', 'file:'].includes(url.protocol);
    },
    'Only HTTP, HTTPS, and file protocols are allowed'
  )
  .refine(
    (val) => val.length <= 2048,
    'URL too long (max 2048 characters)'
  );

/**
 * Schema for validating email addresses
 */
export const EmailSchema = z.string()
  .email('Invalid email format')
  .max(320, 'Email too long (max 320 characters)')
  .refine(
    (val) => !(/[\x00-\x1f\x7f-\x9f]/.test(val)),
    'Email contains control characters'
  );

/**
 * Schema for validating branch names
 */
export const GitBranchSchema = z.string()
  .min(1, 'Branch name cannot be empty')
  .max(250, 'Branch name too long (max 250 characters)')
  .regex(/^[a-zA-Z0-9._/-]+$/, 'Branch name contains invalid characters')
  .refine(
    (val) => !val.startsWith('-') && !val.endsWith('-'),
    'Branch name cannot start or end with hyphen'
  )
  .refine(
    (val) => !val.startsWith('.') && !val.endsWith('.'),
    'Branch name cannot start or end with dot'
  )
  .refine(
    (val) => !val.includes('..'),
    'Branch name cannot contain consecutive dots'
  );

/**
 * Schema for validating commit messages
 */
export const CommitMessageSchema = z.string()
  .min(1, 'Commit message cannot be empty')
  .max(2048, 'Commit message too long (max 2048 characters)')
  .refine(
    (val) => !(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(val)),
    'Commit message contains invalid control characters'
  )
  .refine(
    (val) => !(/[`$(){}[\]|&;]/.test(val)),
    'Commit message contains potentially dangerous characters'
  );

/**
 * Validates a string input safely
 */
export function validateSafeString(input: unknown, fieldName: string = 'input'): string {
  try {
    return SafeStringSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ImportExportError(
        `Invalid ${fieldName}: ${error.errors.map(e => e.message).join(', ')}`,
        'INVALID_INPUT_STRING',
        { fieldName, input, errors: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Validates a file path safely
 */
export function validateSafePath(input: unknown, fieldName: string = 'path'): string {
  try {
    const validatedString = SafePathSchema.parse(input);
    // Additional validation using secure path utilities
    return validateSecurePath(validatedString);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ImportExportError(
        `Invalid ${fieldName}: ${error.errors.map(e => e.message).join(', ')}`,
        'INVALID_PATH_INPUT',
        { fieldName, input, errors: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Validates a file extension safely
 */
export function validateFileExtension(input: unknown): string {
  try {
    return SafeExtensionSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ImportExportError(
        `Invalid file extension: ${error.errors.map(e => e.message).join(', ')}`,
        'INVALID_FILE_EXTENSION',
        { input, errors: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Validates a MIME type safely
 */
export function validateMimeType(input: unknown): string {
  try {
    return MimeTypeSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ImportExportError(
        `Invalid MIME type: ${error.errors.map(e => e.message).join(', ')}`,
        'INVALID_MIME_TYPE',
        { input, errors: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Validates a URL safely
 */
export function validateSafeUrl(input: unknown): string {
  try {
    return SafeUrlSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ImportExportError(
        `Invalid URL: ${error.errors.map(e => e.message).join(', ')}`,
        'INVALID_URL',
        { input, errors: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Validates an email address safely
 */
export function validateEmail(input: unknown): string {
  try {
    return EmailSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ImportExportError(
        `Invalid email: ${error.errors.map(e => e.message).join(', ')}`,
        'INVALID_EMAIL',
        { input, errors: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Validates a git branch name safely
 */
export function validateGitBranch(input: unknown): string {
  try {
    return GitBranchSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ImportExportError(
        `Invalid git branch: ${error.errors.map(e => e.message).join(', ')}`,
        'INVALID_GIT_BRANCH',
        { input, errors: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Validates a commit message safely
 */
export function validateCommitMessage(input: unknown): string {
  try {
    return CommitMessageSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ImportExportError(
        `Invalid commit message: ${error.errors.map(e => e.message).join(', ')}`,
        'INVALID_COMMIT_MESSAGE',
        { input, errors: error.errors }
      );
    }
    throw error;
  }
}

/**
 * Validates numeric inputs with bounds checking
 */
export function validateNumericInput(
  input: unknown,
  fieldName: string,
  min?: number,
  max?: number
): number {
  if (typeof input !== 'number' || isNaN(input)) {
    throw new ImportExportError(
      `Invalid ${fieldName}: must be a valid number`,
      'INVALID_NUMERIC_INPUT',
      { fieldName, input, type: typeof input }
    );
  }

  if (min !== undefined && input < min) {
    throw new ImportExportError(
      `Invalid ${fieldName}: must be >= ${min}`,
      'NUMERIC_INPUT_TOO_SMALL',
      { fieldName, input, min }
    );
  }

  if (max !== undefined && input > max) {
    throw new ImportExportError(
      `Invalid ${fieldName}: must be <= ${max}`,
      'NUMERIC_INPUT_TOO_LARGE',
      { fieldName, input, max }
    );
  }

  return input;
}

/**
 * Validates boolean inputs
 */
export function validateBooleanInput(input: unknown, fieldName: string): boolean {
  if (typeof input !== 'boolean') {
    throw new ImportExportError(
      `Invalid ${fieldName}: must be a boolean`,
      'INVALID_BOOLEAN_INPUT',
      { fieldName, input, type: typeof input }
    );
  }
  return input;
}

/**
 * Validates array inputs with element validation
 */
export function validateArrayInput<T>(
  input: unknown,
  fieldName: string,
  elementValidator: (element: unknown, index: number) => T,
  maxLength: number = 1000
): T[] {
  if (!Array.isArray(input)) {
    throw new ImportExportError(
      `Invalid ${fieldName}: must be an array`,
      'INVALID_ARRAY_INPUT',
      { fieldName, input, type: typeof input }
    );
  }

  if (input.length > maxLength) {
    throw new ImportExportError(
      `Invalid ${fieldName}: array too long (max ${maxLength} elements)`,
      'ARRAY_INPUT_TOO_LONG',
      { fieldName, length: input.length, maxLength }
    );
  }

  const validated: T[] = [];
  for (let i = 0; i < input.length; i++) {
    try {
      validated.push(elementValidator(input[i], i));
    } catch (error) {
      throw new ImportExportError(
        `Invalid element at index ${i} in ${fieldName}`,
        'INVALID_ARRAY_ELEMENT',
        { fieldName, index: i, element: input[i], error }
      );
    }
  }

  return validated;
}

/**
 * Validates object inputs with shape validation
 */
export function validateObjectInput(
  input: unknown,
  fieldName: string,
  allowedKeys: string[] = []
): Record<string, any> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ImportExportError(
      `Invalid ${fieldName}: must be an object`,
      'INVALID_OBJECT_INPUT',
      { fieldName, input, type: typeof input }
    );
  }

  const obj = input as Record<string, any>;

  if (allowedKeys.length > 0) {
    const invalidKeys = Object.keys(obj).filter(key => !allowedKeys.includes(key));
    if (invalidKeys.length > 0) {
      throw new ImportExportError(
        `Invalid ${fieldName}: contains disallowed keys: ${invalidKeys.join(', ')}`,
        'OBJECT_INVALID_KEYS',
        { fieldName, invalidKeys, allowedKeys }
      );
    }
  }

  return obj;
}

/**
 * Creates a safe input validator for a specific schema
 */
export function createSchemaValidator<T>(schema: z.ZodSchema<T>, fieldName: string) {
  return (input: unknown): T => {
    try {
      return schema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ImportExportError(
          `Invalid ${fieldName}: ${error.errors.map(e => e.message).join(', ')}`,
          'SCHEMA_VALIDATION_ERROR',
          { fieldName, input, errors: error.errors }
        );
      }
      throw error;
    }
  };
}