// Library exports for programmatic usage
export * from '../api/client.js';
export * from '../config/index.js';
export * from '../utils/index.js';

// Error types
export * from '../error.js';

// Specific type exports to avoid conflicts
export type {
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
  OutputFormat,
  LogLevel,
} from '../types/index.js';

// Re-export commonly used types
export type { TriliumClient } from '../api/client.js';
export type { Config } from '../config/index.js';
export type { TriliumError } from '../error.js';