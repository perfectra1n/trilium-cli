/**
 * Trilium API types based on the ETAPI OpenAPI specification
 * Enhanced with full feature parity to Rust implementation
 */

import type { EntityId, DateString, MimeType } from './common.js';

// Re-export the types
export type { EntityId, DateString, MimeType };

/**
 * Note type enumeration - complete set from OpenAPI
 */
export type NoteType = 
  | 'text' 
  | 'code' 
  | 'render'
  | 'file' 
  | 'image' 
  | 'search' 
  | 'relationMap' 
  | 'book'
  | 'noteMap'
  | 'mermaid'
  | 'webView'
  | 'shortcut'
  | 'doc'
  | 'contentWidget'
  | 'launcher';

/**
 * MIME types commonly used in Trilium
 */
export type TriliumMimeType =
  | 'text/html'
  | 'text/plain'
  | 'text/markdown'
  | 'application/json'
  | 'application/javascript'
  | 'text/css'
  | 'application/x-sql'
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'application/pdf'
  | string; // Allow custom MIME types

/**
 * Attribute type enumeration
 */
export type AttributeType = 'label' | 'relation';

/**
 * Base note interface - matches OpenAPI schema exactly
 */
export interface Note {
  noteId: EntityId;
  title: string;
  type: NoteType;
  mime?: MimeType;
  isProtected: boolean;
  blobId?: string;
  attributes?: Attribute[];
  parentNoteIds?: EntityId[];
  childNoteIds?: EntityId[];
  parentBranchIds?: EntityId[];
  childBranchIds?: EntityId[];
  dateCreated: DateString; // LocalDateTime
  dateModified: DateString; // LocalDateTime  
  utcDateCreated: DateString; // UtcDateTime
  utcDateModified: DateString; // UtcDateTime
}

/**
 * Note with content
 */
export interface NoteWithContent extends Note {
  content: string;
}

/**
 * Create note definition - matches OpenAPI CreateNoteDef schema
 */
export interface CreateNoteDef {
  parentNoteId: EntityId;
  title: string;
  type: NoteType;
  content: string;
  mime?: MimeType;
  notePosition?: number;
  prefix?: string;
  isExpanded?: boolean;
  noteId?: EntityId; // Optional - for forcing specific noteId
  branchId?: EntityId; // Optional - for forcing specific branchId
  dateCreated?: DateString; // LocalDateTime - optional override
  utcDateCreated?: DateString; // UtcDateTime - optional override
}

/**
 * Update note definition - only patchable fields from OpenAPI
 */
export interface UpdateNoteDef {
  title?: string;
  type?: NoteType;
  mime?: MimeType;
  isProtected?: boolean;
  // Note: dateModified and utcDateModified are read-only in API
}

/**
 * Branch interface - matches OpenAPI schema
 */
export interface Branch {
  branchId: EntityId;
  ownerId: EntityId; // read-only
  parentNoteId: EntityId; // read-only
  prefix?: string;
  notePosition: number;
  isExpanded: boolean;
  utcDateModified: DateString; // read-only
}

/**
 * Note with branch information
 */
export interface NoteWithBranch {
  note: Note;
  branch: Branch;
}

/**
 * Create branch definition
 */
export interface CreateBranchDef {
  noteId: EntityId;
  parentNoteId: EntityId;
  prefix?: string;
  isExpanded?: boolean;
  notePosition?: number;
}

/**
 * Update branch definition
 */
export interface UpdateBranchDef {
  prefix?: string;
  notePosition?: number;
  isExpanded?: boolean;
}

/**
 * Attribute interface - matches OpenAPI schema
 */
export interface Attribute {
  attributeId: EntityId;
  ownerId: EntityId; // read-only
  type: AttributeType;
  name: string; // pattern: '^[^\s]+'
  value?: string;
  notePosition: number;
  isInheritable: boolean;
  utcDateModified: DateString; // read-only
}

/**
 * Create attribute definition
 */
export interface CreateAttributeDef {
  noteId: EntityId;
  type: AttributeType;
  name: string;
  value?: string;
  isInheritable?: boolean;
  position?: number;
}

/**
 * Update attribute definition
 */
export interface UpdateAttributeDef {
  value?: string;
  position?: number;
  isInheritable?: boolean;
}

/**
 * Attachment interface - matches OpenAPI schema
 */
export interface Attachment {
  attachmentId: EntityId; // read-only
  ownerId: EntityId; // identifies owner (noteId or revisionId)
  role: string;
  mime: MimeType;
  title: string;
  notePosition: number;
  blobId?: string; // content hash
  dateModified: DateString; // LocalDateTime - read-only
  utcDateModified: DateString; // UtcDateTime - read-only
  utcDateScheduledForErasureSince?: DateString; // read-only
  contentLength?: number;
}

/**
 * Create attachment definition - matches OpenAPI schema
 */
export interface CreateAttachmentDef {
  ownerId: EntityId; // noteId or revisionId
  role: string;
  mime: MimeType;
  title: string;
  content: string; // content as string
  position?: number;
}

/**
 * Revision interface
 */
export interface Revision {
  revisionId: EntityId;
  ownerId: EntityId;
  type: NoteType;
  mime: MimeType;
  title: string;
  isProtected: boolean;
  dateLastEdited: DateString;
  dateCreated: DateString;
  utcDateLastEdited: DateString;
  utcDateCreated: DateString;
  contentLength: number;
}

/**
 * Search response from API
 */
export interface SearchResponse {
  results: Note[];
  debugInfo?: Record<string, unknown>; // enabled with debug=true
}

/**
 * Search result interface - individual note in search results
 */
export interface SearchResult {
  noteId: EntityId;
  title: string;
  path: string;
  score: number;
}

/**
 * App info interface - matches OpenAPI schema
 */
export interface AppInfo {
  appVersion: string; // e.g., "0.50.2"
  dbVersion: number; // e.g., 194
  syncVersion: number; // e.g., 25
  buildDate: DateString; // date-time format
  buildRevision: string; // git revision
  dataDirectory: string; // data directory path
  clipperProtocolVersion: string; // e.g., "1.0"
  utcDateTime: DateString; // current UTC date time
}

/**
 * String ID pattern for backup names
 */
export type StringId = string; // pattern: "[a-zA-Z0-9_]{1,32}"

/**
 * Local DateTime pattern
 */
export type LocalDateTime = string; // pattern: '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}[\+\-][0-9]{4}'

/**
 * UTC DateTime pattern  
 */
export type UtcDateTime = string; // pattern: '[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z'

/**
 * Calendar endpoints - day/week/month/year notes
 */
export interface CalendarNoteRequest {
  date: string; // format: date (YYYY-MM-DD) or month (YYYY-MM) or year (YYYY)
}

/**
 * Inbox note request
 */
export interface InboxNoteRequest {
  date: string; // format: date (YYYY-MM-DD)
}

/**
 * Login request
 */
export interface LoginRequest {
  password: string;
}

/**
 * Login response
 */
export interface LoginResponse {
  authToken: string;
}

/**
 * Error response from API - matches OpenAPI Error schema
 */
export interface TriliumApiError {
  status: number; // HTTP status code
  code: string; // stable string constant like "NOTE_IS_PROTECTED"
  message: string; // human readable error message
}

/**
 * Search parameters for notes endpoint
 */
export interface SearchNotesParams {
  search: string; // search query
  fastSearch?: boolean; // enable fast search (default: false)
  includeArchivedNotes?: boolean; // include archived notes (default: false)
  ancestorNoteId?: EntityId; // search in subtree only
  ancestorDepth?: string; // depth constraint (eq1, lt4, gt2, etc.)
  orderBy?: string; // property to order by
  orderDirection?: 'asc' | 'desc'; // order direction (default: asc)
  limit?: number; // limit results
  debug?: boolean; // enable debug info (default: false)
}

/**
 * Export format options
 */
export type ExportFormat = 'html' | 'markdown';

/**
 * Import/Export note content
 */
export interface ImportNoteRequest {
  parentNoteId: EntityId;
  content: ArrayBuffer | Uint8Array; // ZIP file content
  format?: ExportFormat;
}

/**
 * API client configuration
 */
export interface ApiClientConfig {
  baseUrl: string;
  apiToken?: string;
  timeout?: number;
  retries?: number;
  debugMode?: boolean;
  rateLimitConfig?: {
    maxRequests: number;
    windowMs: number;
  };
}

/**
 * Request options for API calls
 */
export interface RequestOptions {
  timeout?: number;
  signal?: AbortSignal;
  retries?: number;
}
// ========== Enhanced Types from Rust Implementation ==========

/**
 * Tree structure for TUI display
 */
export interface NoteTreeItem {
  note: Note;
  children: NoteTreeItem[];
  isExpanded: boolean;
  depth: number;
}

/**
 * Enhanced search options
 */
export interface SearchOptions {
  fastSearch: boolean;
  includeArchived: boolean;
  limit: number;
  regexMode: boolean;
  includeContent: boolean;
  contextLines: number;
  ancestorNoteId?: EntityId;
  ancestorDepth?: string;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Text highlight in search results
 */
export interface TextHighlight {
  start: number;
  end: number;
  matchText: string;
}

/**
 * Highlighted snippet with context
 */
export interface HighlightedSnippet {
  lineNumber: number;
  content: string;
  highlights: TextHighlight[];
  contextBefore: string[];
  contextAfter: string[];
}

/**
 * Enhanced search result with highlighting and context
 */
export interface EnhancedSearchResult {
  noteId: EntityId;
  title: string;
  path: string;
  score: number;
  content?: string;
  highlightedSnippets: HighlightedSnippet[];
  contextLines: number;
}

/**
 * Link types for wiki-style linking
 */
export enum LinkType {
  NoteId = 'NoteId',
  NoteTitle = 'NoteTitle',
}

/**
 * Parsed wiki-style link
 */
export interface ParsedLink {
  linkType: LinkType;
  target: string;
  displayText?: string;
  startPos: number;
  endPos: number;
}

/**
 * Link reference for backlink tracking
 */
export interface LinkReference {
  fromNoteId: EntityId;
  toNoteId: EntityId;
  fromTitle: string;
  linkText: string;
  context: string;
}

/**
 * Tag information with hierarchy
 */
export interface TagInfo {
  name: string;
  hierarchy: string[];
  count: number;
  parent?: string;
  children: string[];
}

/**
 * Template variable definition
 */
export interface TemplateVariable {
  name: string;
  description: string;
  defaultValue?: string;
  required: boolean;
}

/**
 * Template for creating notes
 */
export interface Template {
  id: EntityId;
  title: string;
  content: string;
  variables: TemplateVariable[];
  description: string;
}

/**
 * Quick capture/inbox note request
 */
export interface QuickCaptureRequest {
  content: string;
  tags: string[];
  title?: string;
  inboxNoteId?: EntityId;
  metadata: Record<string, string>;
}

/**
 * Structured API error response from Trilium
 */
export interface TriliumApiErrorResponse {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Debug information for API requests
 */
export interface ApiRequestDebug {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: UtcDateTime;
}

/**
 * Debug information for API responses
 */
export interface ApiResponseDebug {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
  timestamp: UtcDateTime;
}

/**
 * Calendar note structure
 */
export interface CalendarNote {
  dateNoteId: EntityId;
  monthNoteId: EntityId;
  yearNoteId: EntityId;
  weekNoteId: EntityId;
  exists: boolean;
}

