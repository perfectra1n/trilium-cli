// API module exports
export * from './client.js';
export * from './types.js';

// Re-export the main client class explicitly
export { TriliumClient } from './client.js';

// Re-export commonly used API types
export type {
  Note,
  NoteWithContent,
  CreateNoteDef,
  UpdateNoteDef,
  Branch,
  CreateBranchDef,
  UpdateBranchDef,
  Attribute,
  CreateAttributeDef,
  UpdateAttributeDef,
  Attachment,
  CreateAttachmentDef,
  SearchResult,
  SearchResponse,
  SearchNotesParams,
  SearchOptions,
  EnhancedSearchResult,
  AppInfo,
  CalendarNote,
  CalendarNoteRequest,
  InboxNoteRequest,
  LoginRequest,
  LoginResponse,
  EntityId,
  ExportFormat,
  ImportNoteRequest,
  NoteTreeItem,
  LinkReference,
  TagInfo,
  Template,
  QuickCaptureRequest,
  TriliumApiErrorResponse,
  ApiRequestDebug,
  ApiResponseDebug,
  ApiClientConfig,
  RequestOptions,
  UtcDateTime,
  LocalDateTime,
  StringId,
  NoteType,
} from './types.js';