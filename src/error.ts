/**
 * Enhanced error context with suggestions and help
 */
export class ErrorContext {
  /** Error code for programmatic handling */
  public code?: string;
  
  /** Actionable suggestions for fixing the error */
  public suggestions: string[] = [];
  
  /** Related help topics or commands */
  public helpTopics: string[] = [];
  
  /** Context about what the user was trying to do */
  public operationContext?: string;
  
  /** Similar commands or options (for did-you-mean) */
  public similarItems: string[] = [];
  
  /** Additional metadata */
  public metadata: Record<string, string> = {};

  constructor() {}
  
  withCode(code: string): ErrorContext {
    this.code = code;
    return this;
  }
  
  withSuggestion(suggestion: string): ErrorContext {
    this.suggestions.push(suggestion);
    return this;
  }
  
  withSuggestions(suggestions: string[]): ErrorContext {
    this.suggestions.push(...suggestions);
    return this;
  }
  
  withHelpTopic(topic: string): ErrorContext {
    this.helpTopics.push(topic);
    return this;
  }
  
  withOperationContext(context: string): ErrorContext {
    this.operationContext = context;
    return this;
  }
  
  withSimilarItems(items: string[]): ErrorContext {
    this.similarItems = items;
    return this;
  }
  
  withMetadata(key: string, value: string): ErrorContext {
    this.metadata[key] = value;
    return this;
  }
}

/**
 * Enhanced error with context and suggestions
 */
export class EnhancedError extends Error {
  public readonly triliumError: TriliumError;
  public readonly context: ErrorContext;

  constructor(error: TriliumError, context: ErrorContext = new ErrorContext()) {
    const message = EnhancedError.formatMessage(error, context);
    super(message);
    this.name = 'EnhancedError';
    this.triliumError = error;
    this.context = context;
    
    Object.setPrototypeOf(this, EnhancedError.prototype);
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EnhancedError);
    }
  }

  private static formatMessage(error: TriliumError, context: ErrorContext): string {
    let message = error.message;
    
    if (context.operationContext) {
      message += `\n\nContext: ${context.operationContext}`;
    }
    
    if (context.suggestions.length > 0) {
      message += '\n\nSuggestions:';
      for (const suggestion of context.suggestions) {
        message += `\n  • ${suggestion}`;
      }
    }
    
    if (context.similarItems.length > 0) {
      message += '\n\nDid you mean:';
      for (const item of context.similarItems) {
        message += `\n  • ${item}`;
      }
    }
    
    if (context.helpTopics.length > 0) {
      message += '\n\nFor more help, try:';
      for (const topic of context.helpTopics) {
        message += `\n  trilium help ${topic}`;
      }
    }
    
    return message;
  }
}

/**
 * Base custom error class for Trilium CLI operations
 */
export class TriliumError extends Error {
  public readonly code?: number;
  public readonly cause?: Error;

  constructor(message: string, code?: number, cause?: Error) {
    super(message);
    this.name = 'TriliumError';
    this.code = code;
    this.cause = cause;

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, TriliumError.prototype);

    // Capture stack trace if possible
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TriliumError);
    }
  }

  /**
   * Create a TriliumError from an unknown error
   */
  static fromUnknown(error: unknown, defaultMessage = 'An unexpected error occurred'): TriliumError {
    if (error instanceof TriliumError) {
      return error;
    }

    if (error instanceof Error) {
      return new TriliumError(error.message, undefined, error);
    }

    if (typeof error === 'string') {
      return new TriliumError(error);
    }

    return new TriliumError(defaultMessage);
  }

  /**
   * Create an enhanced error with context
   */
  withContext(context: ErrorContext): EnhancedError {
    return new EnhancedError(this, context);
  }

  /**
   * Get contextual suggestions based on error type
   */
  getSuggestions(): string[] {
    if (this instanceof ConfigError) {
      const msg = this.message.toLowerCase();
      if (msg.includes('not found')) {
        return [
          "Run 'trilium config init' to create a configuration file",
          'Check if the config file path is correct',
          'Verify file permissions'
        ];
      } else if (msg.includes('invalid')) {
        return [
          'Check the configuration file format',
          'Validate JSON/YAML syntax',
          'Review the configuration documentation'
        ];
      }
      return ['Check your configuration settings'];
    }

    if (this instanceof ApiError) {
      const msg = this.message.toLowerCase();
      if (msg.includes('connection')) {
        return [
          'Check your internet connection',
          'Verify the server URL is correct',
          'Ensure the Trilium server is running'
        ];
      } else if (msg.includes('authentication') || msg.includes('401')) {
        return [
          'Check your API token',
          'Generate a new ETAPI token in Trilium',
          'Verify the token has necessary permissions'
        ];
      }
      return [
        'Check server status and logs',
        'Try the operation again'
      ];
    }

    if (this instanceof NotFoundError) {
      return [
        `Check if the item exists`,
        "Use 'trilium search' to find the correct item",
        'List available items to see what\'s accessible'
      ];
    }

    if (this instanceof ValidationError) {
      return [
        'Check your input format',
        'Review the command usage with --help',
        'Use the TUI mode for guided input'
      ];
    }

    return [];
  }

  /**
   * Get help topics related to this error
   */
  getHelpTopics(): string[] {
    if (this instanceof ConfigError) return ['config', 'setup'];
    if (this instanceof ApiError) return ['api', 'connection'];
    if (this instanceof AuthError) return ['authentication', 'tokens'];
    if (this instanceof NotFoundError) return ['search', 'navigation'];
    if (this instanceof ProfileError) return ['profiles', 'config'];
    if (this instanceof PluginError) return ['plugins', 'extensions'];
    if (this instanceof TemplateError) return ['templates', 'creation'];
    if (this instanceof ImportExportError) return ['import', 'export'];
    return [];
  }

  /**
   * Check if this is a user-facing error that should be displayed nicely
   */
  isUserFacing(): boolean {
    return this instanceof ValidationError ||
           this instanceof ConfigError ||
           this instanceof InvalidInputError ||
           this instanceof NotFoundError ||
           this instanceof ResourceLimitError ||
           this instanceof ContentTooLargeError ||
           this instanceof InvalidRegexError ||
           this instanceof ConfigValidationError ||
           this instanceof PermissionDeniedError;
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    if (this instanceof ContentTooLargeError) {
      return `Content is too large (${(this.size / 1000).toFixed(1)} KB). Maximum allowed is ${(this.limit / 1000).toFixed(1)} KB.`;
    }
    if (this instanceof InvalidRegexError) {
      return `Invalid regular expression '${this.pattern}': ${this.reason}`;
    }
    if (this instanceof ConfigValidationError) {
      return `Configuration error in '${this.field}': ${this.reason}`;
    }
    return this.message;
  }

  /**
   * Get an error category for logging/metrics
   */
  getCategory(): string {
    if (this instanceof ApiError) return 'api';
    if (this instanceof AuthError) return 'auth';
    if (this instanceof ConfigError || this instanceof ConfigValidationError) return 'config';
    if (this instanceof FileSystemError) return 'io';
    if (this instanceof NetworkError) return 'network';
    if (this instanceof ValidationError || this instanceof InvalidInputError) return 'validation';
    if (this instanceof SecurityError || this instanceof PermissionDeniedError) return 'security';
    if (this instanceof ResourceLimitError || this instanceof ContentTooLargeError) return 'resource_limit';
    if (this instanceof TimeoutError) return 'timeout';
    if (this instanceof TemplateError) return 'template';
    if (this instanceof LinkParsingError) return 'link_parsing';
    if (this instanceof TagError) return 'tag';
    if (this instanceof QuickCaptureError) return 'quick_capture';
    if (this instanceof SearchError) return 'search';
    if (this instanceof InvalidRegexError) return 'regex';
    if (this instanceof RateLimitError) return 'rate_limit';
    if (this instanceof DataCorruptionError) return 'data_corruption';
    if (this instanceof ParseError) return 'parsing';
    return 'general';
  }

  /**
   * Check if this error suggests the operation should be retried
   */
  isRetryable(): boolean {
    return this instanceof NetworkError ||
           this instanceof TimeoutError ||
           this instanceof RateLimitError ||
           this instanceof ApiError;
  }

  /**
   * Get the appropriate exit code for this error
   */
  getExitCode(): number {
    if (this instanceof ValidationError || this instanceof InvalidInputError) return 2;
    if (this instanceof ConfigError || this instanceof ConfigValidationError) return 3;
    if (this instanceof NotFoundError) return 4;
    if (this instanceof PermissionDeniedError || this instanceof AuthError) return 5;
    if (this instanceof SecurityError) return 6;
    if (this instanceof ResourceLimitError || this instanceof ContentTooLargeError) return 7;
    if (this instanceof TimeoutError) return 8;
    if (this instanceof FileSystemError) return 9;
    if (this instanceof NetworkError) return 10;
    return 1; // General error
  }

  /**
   * Generate did-you-mean suggestions for command/option typos
   */
  static suggestSimilarCommands(typo: string, availableCommands: string[]): string[] {
    const suggestions = availableCommands
      .map(cmd => ({ cmd, score: TriliumError.jaroWinkler(typo, cmd) }))
      .filter(item => item.score > 0.6)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.cmd);
    return suggestions;
  }

  /**
   * Calculate Jaro-Winkler similarity between two strings
   */
  private static jaroWinkler(s1: string, s2: string): number {
    // Simplified Jaro-Winkler implementation
    const m1 = s1.length;
    const m2 = s2.length;
    
    if (m1 === 0) return m2 === 0 ? 1.0 : 0.0;
    
    const matchDistance = Math.floor(Math.max(m1, m2) / 2) - 1;
    const s1Matches = new Array(m1).fill(false);
    const s2Matches = new Array(m2).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < m1; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, m2);
      
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = s2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0.0;
    
    // Count transpositions
    let k = 0;
    for (let i = 0; i < m1; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    
    const jaro = (matches / m1 + matches / m2 + (matches - transpositions / 2) / matches) / 3.0;
    
    // Winkler modification
    let prefix = 0;
    for (let i = 0; i < Math.min(m1, m2, 4); i++) {
      if (s1[i] === s2[i]) prefix++;
      else break;
    }
    
    return jaro + (0.1 * prefix * (1.0 - jaro));
  }

  // Static factory methods for specific error types
  static contentTooLarge(size: number, limit: number): ContentTooLargeError {
    return new ContentTooLargeError(`Content is too large: ${size} bytes (max ${limit} bytes)`, size, limit);
  }

  static invalidRegex(pattern: string, reason: string): InvalidRegexError {
    return new InvalidRegexError(`Invalid regular expression '${pattern}': ${reason}`, pattern, reason);
  }

  static configValidation(field: string, reason: string): ConfigValidationError {
    return new ConfigValidationError(`Configuration error in '${field}': ${reason}`, field, reason);
  }

  static resourceLimit(message: string): ResourceLimitError {
    return new ResourceLimitError(`Resource limit exceeded: ${message}`);
  }

  static timeout(operation: string): TimeoutError {
    return new TimeoutError(`${operation} operation timed out`);
  }

  static security(message: string): SecurityError {
    return new SecurityError(`Security violation: ${message}`);
  }

  static validation(message: string): ValidationError {
    return new ValidationError(`Validation failed: ${message}`);
  }

  static pluginError(message: string): PluginError {
    return new PluginError(`Plugin error: ${message}`);
  }

  static completionError(message: string): CompletionError {
    return new CompletionError(`Completion error: ${message}`);
  }

  static profileError(message: string): ProfileError {
    return new ProfileError(`Profile error: ${message}`);
  }
}

/**
 * API-related errors
 */
export class ApiError extends TriliumError {
  public readonly status?: number;
  public readonly response?: string;

  constructor(message: string, status?: number, response?: string, cause?: Error) {
    super(message, status, cause);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;

    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'ConfigError';

    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/**
 * Authentication-related errors
 */
export class AuthError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 2, cause);
    this.name = 'AuthError';

    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/**
 * File system operation errors
 */
export class FileSystemError extends TriliumError {
  public readonly path?: string;

  constructor(message: string, path?: string, cause?: Error) {
    super(message, 3, cause);
    this.name = 'FileSystemError';
    this.path = path;

    Object.setPrototypeOf(this, FileSystemError.prototype);
  }
}

/**
 * Import/Export operation errors
 */
export class ImportExportError extends TriliumError {
  public readonly operation: 'import' | 'export';

  constructor(message: string, operation: 'import' | 'export', cause?: Error) {
    super(message, 4, cause);
    this.name = 'ImportExportError';
    this.operation = operation;

    Object.setPrototypeOf(this, ImportExportError.prototype);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends TriliumError {
  public readonly field?: string;

  constructor(message: string, field?: string, cause?: Error) {
    super(message, 5, cause);
    this.name = 'ValidationError';
    this.field = field;

    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 10, cause);
    this.name = 'NetworkError';

    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Invalid input errors
 */
export class InvalidInputError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 2, cause);
    this.name = 'InvalidInputError';

    Object.setPrototypeOf(this, InvalidInputError.prototype);
  }
}

/**
 * Not found errors
 */
export class NotFoundError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 4, cause);
    this.name = 'NotFoundError';

    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Security violation errors
 */
export class SecurityError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 6, cause);
    this.name = 'SecurityError';

    Object.setPrototypeOf(this, SecurityError.prototype);
  }
}

/**
 * Permission denied errors
 */
export class PermissionDeniedError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 5, cause);
    this.name = 'PermissionDeniedError';

    Object.setPrototypeOf(this, PermissionDeniedError.prototype);
  }
}

/**
 * Resource limit exceeded errors
 */
export class ResourceLimitError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 7, cause);
    this.name = 'ResourceLimitError';

    Object.setPrototypeOf(this, ResourceLimitError.prototype);
  }
}

/**
 * Content too large errors
 */
export class ContentTooLargeError extends TriliumError {
  public readonly size: number;
  public readonly limit: number;

  constructor(message: string, size: number, limit: number, cause?: Error) {
    super(message, 7, cause);
    this.name = 'ContentTooLargeError';
    this.size = size;
    this.limit = limit;

    Object.setPrototypeOf(this, ContentTooLargeError.prototype);
  }
}

/**
 * Invalid regex pattern errors
 */
export class InvalidRegexError extends TriliumError {
  public readonly pattern: string;
  public readonly reason: string;

  constructor(message: string, pattern: string, reason: string, cause?: Error) {
    super(message, 2, cause);
    this.name = 'InvalidRegexError';
    this.pattern = pattern;
    this.reason = reason;

    Object.setPrototypeOf(this, InvalidRegexError.prototype);
  }
}

/**
 * Configuration validation errors
 */
export class ConfigValidationError extends TriliumError {
  public readonly field: string;
  public readonly reason: string;

  constructor(message: string, field: string, reason: string, cause?: Error) {
    super(message, 3, cause);
    this.name = 'ConfigValidationError';
    this.field = field;
    this.reason = reason;

    Object.setPrototypeOf(this, ConfigValidationError.prototype);
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 8, cause);
    this.name = 'TimeoutError';

    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Template processing errors
 */
export class TemplateError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'TemplateError';

    Object.setPrototypeOf(this, TemplateError.prototype);
  }
}

/**
 * Link parsing errors
 */
export class LinkParsingError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'LinkParsingError';

    Object.setPrototypeOf(this, LinkParsingError.prototype);
  }
}

/**
 * Tag processing errors
 */
export class TagError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'TagError';

    Object.setPrototypeOf(this, TagError.prototype);
  }
}

/**
 * Quick capture errors
 */
export class QuickCaptureError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'QuickCaptureError';

    Object.setPrototypeOf(this, QuickCaptureError.prototype);
  }
}

/**
 * Search operation errors
 */
export class SearchError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'SearchError';

    Object.setPrototypeOf(this, SearchError.prototype);
  }
}

/**
 * Rate limit errors
 */
export class RateLimitError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'RateLimitError';

    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Data corruption errors
 */
export class DataCorruptionError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'DataCorruptionError';

    Object.setPrototypeOf(this, DataCorruptionError.prototype);
  }
}

/**
 * Parse errors
 */
export class ParseError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'ParseError';

    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

/**
 * Terminal errors
 */
export class TerminalError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'TerminalError';

    Object.setPrototypeOf(this, TerminalError.prototype);
  }
}

/**
 * Editor errors
 */
export class EditorError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'EditorError';

    Object.setPrototypeOf(this, EditorError.prototype);
  }
}

/**
 * Plugin errors
 */
export class PluginError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'PluginError';

    Object.setPrototypeOf(this, PluginError.prototype);
  }
}

/**
 * Completion errors
 */
export class CompletionError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'CompletionError';

    Object.setPrototypeOf(this, CompletionError.prototype);
  }
}

/**
 * Profile errors
 */
export class ProfileError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'ProfileError';

    Object.setPrototypeOf(this, ProfileError.prototype);
  }
}

/**
 * General/Unknown errors
 */
export class UnknownError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'UnknownError';

    Object.setPrototypeOf(this, UnknownError.prototype);
  }
}

/**
 * TUI errors
 */
export class TuiError extends TriliumError {
  constructor(message: string, cause?: Error) {
    super(message, 1, cause);
    this.name = 'TuiError';

    Object.setPrototypeOf(this, TuiError.prototype);
  }
}

/**
 * Operation cancelled errors
 */
export class CancelledError extends TriliumError {
  constructor(message: string = 'Operation cancelled', cause?: Error) {
    super(message, 1, cause);
    this.name = 'CancelledError';

    Object.setPrototypeOf(this, CancelledError.prototype);
  }
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = TriliumError> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a successful result
 */
export function Ok<T>(data: T): Result<T> {
  return { success: true, data };
}

/**
 * Create an error result
 */
export function Err<E extends TriliumError>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Utility function to handle async operations that may throw
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorHandler?: (error: unknown) => TriliumError
): Promise<Result<T>> {
  try {
    const data = await fn();
    return Ok(data);
  } catch (error) {
    const triliumError = errorHandler 
      ? errorHandler(error)
      : TriliumError.fromUnknown(error);
    return Err(triliumError);
  }
}

/**
 * Utility function to handle sync operations that may throw
 */
export function trySync<T>(
  fn: () => T,
  errorHandler?: (error: unknown) => TriliumError
): Result<T> {
  try {
    const data = fn();
    return Ok(data);
  } catch (error) {
    const triliumError = errorHandler 
      ? errorHandler(error)
      : TriliumError.fromUnknown(error);
    return Err(triliumError);
  }
}