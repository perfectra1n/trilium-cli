// Main entry point - re-export modules for testing and library usage

// Core modules (selective exports to avoid conflicts)
export { TriliumClient } from './api/client.js';
export { setupCommands } from './cli/index.js';
export { Config } from './config/index.js';
export * from './error.js';
export * from './import-export/index.js';
export * from './utils/index.js';

// Main application and lifecycle
export { Application, createCLIApplication, handleApplicationError, main } from './main.js';

// Type exports to avoid conflicts
export type {
  // API types
  Note,
  NoteWithContent,
  CreateNoteDef,
  UpdateNoteDef,
  Branch,
  Attribute,
  Attachment,
  SearchResult,
  AppInfo,
  EntityId,
  // Common types
  OutputFormat,
  LogLevel,
  // Configuration types
  ConfigData,
  Profile,
  // CLI types
  GlobalOptions,
  BaseCommandOptions,
} from './types/index.js';

// Classes already exported above

// Re-export error classes
export {
  TriliumError,
  ErrorContext,
  EnhancedError,
  ApiError,
  AuthError,
  ConfigError,
  FileSystemError,
  ImportExportError,
  ValidationError,
  NetworkError,
  InvalidInputError,
  NotFoundError,
  SecurityError,
  PermissionDeniedError,
  ResourceLimitError,
  ContentTooLargeError,
  InvalidRegexError,
  ConfigValidationError,
  TimeoutError,
  TemplateError,
  LinkParsingError,
  TagError,
  QuickCaptureError,
  SearchError,
  RateLimitError,
  DataCorruptionError,
  ParseError,
  TerminalError,
  EditorError,
  PluginError,
  CompletionError,
  ProfileError,
  UnknownError,
  TuiError,
  CancelledError,
} from './error.js';

// Re-export result types and utilities
export {
  Result,
  Ok,
  Err,
  tryCatch,
  trySync,
} from './error.js';

// Re-export utility functions
export { createLogger } from './utils/logger.js';
export { formatOutput, handleCliError, createTriliumClient, createCliConfig } from './utils/cli.js';
export { validateUrl, validateEntityId } from './utils/validation.js';
export { formatFileSize, formatDate, formatDuration } from './utils/format.js';

// Library version and metadata
export const VERSION = '0.1.0';
export const LIBRARY_NAME = 'trilium-cli-ts';

/**
 * Default configuration for library usage
 */
export const DEFAULT_LIBRARY_CONFIG = {
  timeout: 30000,
  retries: 3,
  logLevel: 'info' as const,
  userAgent: `${LIBRARY_NAME}/${VERSION}`,
};

/**
 * Library initialization function for programmatic usage
 */
export async function initializeTriliumLib(options: {
  configPath?: string;
  profile?: string;
  serverUrl?: string;
  apiToken?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
} = {}): Promise<{ client: any; config: any }> {
  const { TriliumClient } = await import('./api/client.js');
  const { Config } = await import('./config/index.js');
  
  const config = new Config(options.configPath);
  await config.load();
  
  if (options.profile) {
    config.setCurrentProfile(options.profile);
  }
  
  const profile = config.getCurrentProfile();
  
  // Apply overrides
  if (options.serverUrl) profile.serverUrl = options.serverUrl;
  if (options.apiToken) profile.apiToken = options.apiToken;
  
  // Create client
  const client = new TriliumClient(config);
  
  return { client, config };
}