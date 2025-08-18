import { stat, access, constants } from 'fs/promises';
import { resolve, normalize, isAbsolute, join, relative, dirname, basename } from 'path';

import { ImportExportError } from './types.js';

/**
 * Secure path validation and manipulation utilities
 */

/**
 * Configuration for path validation
 */
export interface PathSecurityConfig {
  allowedBasePaths?: string[];
  maxDepth?: number;
  allowedExtensions?: string[];
  blockedPatterns?: RegExp[];
}

/**
 * Default security configuration
 */
const DEFAULT_SECURITY_CONFIG: Required<PathSecurityConfig> = {
  allowedBasePaths: [], // Empty means no restriction by default
  maxDepth: 10, // Maximum directory depth
  allowedExtensions: [], // Empty means all extensions allowed
  blockedPatterns: [
    /\.\./,           // Directory traversal
    /~[\\/]/,         // Home directory reference
    /^\//,            // Absolute paths when not expected
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f]/,    // Control characters
    /[<>:"|?*]/,      // Windows invalid characters
    /^\./,            // Hidden files starting with .
    /\$\{/,           // Variable expansion
    /`/,              // Command substitution
  ],
};

/**
 * Validates that a path is safe against directory traversal and other attacks
 */
export function validateSecurePath(
  inputPath: string,
  basePath?: string,
  config: PathSecurityConfig = {}
): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new ImportExportError(
      'Invalid path: path must be a non-empty string',
      'INVALID_PATH_TYPE',
      { path: inputPath, type: typeof inputPath }
    );
  }

  const securityConfig = { ...DEFAULT_SECURITY_CONFIG, ...config };

  // Check for blocked patterns
  for (const pattern of securityConfig.blockedPatterns) {
    if (pattern.test(inputPath)) {
      throw new ImportExportError(
        `Path contains blocked pattern: ${inputPath}`,
        'BLOCKED_PATH_PATTERN',
        { path: inputPath, pattern: pattern.source }
      );
    }
  }

  // Normalize the path to handle . and .. components
  let normalizedPath: string;
  try {
    normalizedPath = normalize(inputPath);
  } catch (error) {
    throw new ImportExportError(
      `Failed to normalize path: ${inputPath}`,
      'PATH_NORMALIZATION_ERROR',
      { path: inputPath, error }
    );
  }

  // If basePath is provided, resolve relative to it and validate containment
  if (basePath) {
    const resolvedBasePath = resolve(normalize(basePath));
    const resolvedPath = resolve(resolvedBasePath, normalizedPath);

    // Ensure the resolved path is within the base path
    const relativePath = relative(resolvedBasePath, resolvedPath);
    
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new ImportExportError(
        `Path escapes base directory: ${inputPath}`,
        'PATH_TRAVERSAL_DETECTED',
        { 
          inputPath, 
          basePath: resolvedBasePath, 
          resolvedPath, 
          relativePath 
        }
      );
    }

    return resolvedPath;
  }

  // For standalone paths, just return the normalized path
  return normalizedPath;
}

/**
 * Validates that a directory path is safe and accessible
 */
export async function validateDirectoryPath(
  dirPath: string,
  basePath?: string,
  config: PathSecurityConfig = {}
): Promise<string> {
  const validatedPath = validateSecurePath(dirPath, basePath, config);

  try {
    const stats = await stat(validatedPath);
    if (!stats.isDirectory()) {
      throw new ImportExportError(
        `Path is not a directory: ${validatedPath}`,
        'NOT_A_DIRECTORY',
        { path: validatedPath }
      );
    }
  } catch (error: any) {
    if (error instanceof ImportExportError) {
      throw error;
    }
    throw new ImportExportError(
      `Directory not accessible: ${validatedPath}`,
      'DIRECTORY_NOT_ACCESSIBLE',
      { path: validatedPath, error: error.message }
    );
  }

  return validatedPath;
}

/**
 * Validates that a file path is safe
 */
export async function validateFilePath(
  filePath: string,
  basePath?: string,
  config: PathSecurityConfig = {}
): Promise<string> {
  const validatedPath = validateSecurePath(filePath, basePath, config);

  // Check file extension if restrictions are configured
  if (config.allowedExtensions && config.allowedExtensions.length > 0) {
    const extension = basename(validatedPath).split('.').pop()?.toLowerCase();
    if (!extension || !config.allowedExtensions.includes(extension)) {
      throw new ImportExportError(
        `File extension not allowed: ${extension}`,
        'FORBIDDEN_FILE_EXTENSION',
        { 
          path: validatedPath, 
          extension, 
          allowedExtensions: config.allowedExtensions 
        }
      );
    }
  }

  return validatedPath;
}

/**
 * Safely joins paths with validation
 */
export function secureJoin(basePath: string, ...pathSegments: string[]): string {
  // Validate base path
  if (!basePath || typeof basePath !== 'string') {
    throw new ImportExportError(
      'Invalid base path for secure join',
      'INVALID_BASE_PATH',
      { basePath }
    );
  }

  // Validate and sanitize each path segment
  const sanitizedSegments = pathSegments.map((segment, index) => {
    if (!segment || typeof segment !== 'string') {
      throw new ImportExportError(
        `Invalid path segment at index ${index}`,
        'INVALID_PATH_SEGMENT',
        { segment, index }
      );
    }

    // Check for dangerous patterns in segments
    if (segment.includes('..') || segment.includes('~') || segment.includes('$')) {
      throw new ImportExportError(
        `Path segment contains dangerous patterns: ${segment}`,
        'UNSAFE_PATH_SEGMENT',
        { segment, index }
      );
    }

    return segment;
  });

  const joinedPath = join(basePath, ...sanitizedSegments);
  
  // Validate the final path doesn't escape the base
  return validateSecurePath(joinedPath, basePath);
}

/**
 * Checks if a path is within allowed base paths
 */
export function validatePathWithinBounds(
  targetPath: string,
  allowedPaths: string[]
): string {
  if (allowedPaths.length === 0) {
    return targetPath; // No restrictions
  }

  const resolvedTarget = resolve(targetPath);
  
  for (const allowedPath of allowedPaths) {
    const resolvedAllowed = resolve(allowedPath);
    const relativePath = relative(resolvedAllowed, resolvedTarget);
    
    if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
      return resolvedTarget; // Path is within this allowed base
    }
  }

  throw new ImportExportError(
    `Path is not within allowed directories: ${targetPath}`,
    'PATH_OUTSIDE_ALLOWED_BOUNDS',
    { 
      targetPath, 
      allowedPaths,
      resolvedTarget
    }
  );
}

/**
 * Creates a secure path resolver for a specific base directory
 */
export function createSecurePathResolver(
  basePath: string,
  config: PathSecurityConfig = {}
) {
  const resolvedBasePath = resolve(basePath);

  return {
    resolve: (relativePath: string): string => {
      return validateSecurePath(relativePath, resolvedBasePath, config);
    },

    join: (...pathSegments: string[]): string => {
      return secureJoin(resolvedBasePath, ...pathSegments);
    },

    validateFile: async (filePath: string): Promise<string> => {
      return validateFilePath(filePath, resolvedBasePath, config);
    },

    validateDirectory: async (dirPath: string): Promise<string> => {
      return validateDirectoryPath(dirPath, resolvedBasePath, config);
    },

    isWithinBase: (targetPath: string): boolean => {
      try {
        validateSecurePath(targetPath, resolvedBasePath, config);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Sanitizes a filename by removing or replacing dangerous characters
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    throw new ImportExportError(
      'Invalid filename: must be a non-empty string',
      'INVALID_FILENAME',
      { fileName }
    );
  }

  // Remove or replace dangerous characters
  const sanitized = fileName
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') // Replace invalid characters with underscore
    .replace(/^\.+|\.+$/g, '') // Remove leading and trailing dots
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 255); // Limit length

  if (!sanitized || sanitized.length === 0) {
    throw new ImportExportError(
      'Filename sanitization resulted in empty string',
      'EMPTY_FILENAME_AFTER_SANITIZATION',
      { original: fileName, sanitized }
    );
  }

  return sanitized;
}

/**
 * Validates file size to prevent resource exhaustion
 */
export async function validateFileSize(
  filePath: string,
  maxSize: number = 100 * 1024 * 1024 // 100MB default
): Promise<number> {
  try {
    const stats = await stat(filePath);
    
    if (stats.size > maxSize) {
      throw new ImportExportError(
        `File too large: ${stats.size} bytes (max: ${maxSize} bytes)`,
        'FILE_TOO_LARGE',
        { filePath, size: stats.size, maxSize }
      );
    }

    return stats.size;
  } catch (error: any) {
    if (error instanceof ImportExportError) {
      throw error;
    }
    throw new ImportExportError(
      `Cannot check file size: ${filePath}`,
      'FILE_SIZE_CHECK_ERROR',
      { filePath, error: error.message }
    );
  }
}

/**
 * Checks if a file exists and is readable
 */
export async function validateFileAccess(filePath: string): Promise<void> {
  try {
    await access(filePath, constants.R_OK);
  } catch (error) {
    throw new ImportExportError(
      `File not accessible: ${filePath}`,
      'FILE_NOT_ACCESSIBLE',
      { filePath, error }
    );
  }
}