/**
 * Common utility types used throughout the application
 */

/**
 * Output formats supported by the CLI
 */
export type OutputFormat = 'json' | 'table' | 'plain';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Entity ID type
 */
export type EntityId = string;

/**
 * ISO 8601 date string
 */
export type DateString = string;

/**
 * MIME type string
 */
export type MimeType = string;

/**
 * Utility type to make all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Utility type to make specific properties required
 */
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Utility type to make specific properties optional
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Generic pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * Generic search parameters
 */
export interface SearchParams extends PaginationParams {
  query: string;
  fastSearch?: boolean;
  includeArchived?: boolean;
  ancestorNoteId?: EntityId;
  ancestorDepth?: string;
}

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (progress: {
  current: number;
  total: number;
  message?: string;
}) => void;

/**
 * Generic success response
 */
export interface SuccessResponse {
  success: true;
  message?: string;
}

/**
 * Generic error response
 */
export interface ErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

/**
 * API response wrapper
 */
export type ApiResponse<T> = T | ErrorResponse;