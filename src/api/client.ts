import type {
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
} from '../types/api.js';
import { HttpClient, RateLimiter } from '../utils/http-simple.js';
import { ApiError, AuthError, ValidationError } from '../error.js';
import { validateEntityId, validateUrl } from '../utils/validation.js';
import {
  validateCreateNoteDef,
  validateUpdateNoteDef,
  validateSearchNotesParams,
  validateApiClientConfig,
  validateQuickCaptureRequest,
  CreateNoteDefSchema,
  UpdateNoteDefSchema,
  NoteSchema,
  SearchOptionsSchema,
} from '../types/validation.js';

/**
 * Enhanced Trilium API client with full feature parity to Rust implementation
 */
export class TriliumClient {
  private http: HttpClient;
  private baseUrl: string;
  private apiToken?: string;
  private debugMode: boolean;
  private requestCount: number = 0;

  constructor(config: ApiClientConfig) {
    // Validate configuration using Zod schema
    const validatedConfig = validateApiClientConfig(config);
    
    validateUrl(validatedConfig.baseUrl, 'baseUrl');

    this.baseUrl = validatedConfig.baseUrl;
    this.apiToken = validatedConfig.apiToken;
    this.debugMode = validatedConfig.debugMode || false;

    // Check for debug mode from environment variables
    if (!this.debugMode) {
      const triliumDebug = process.env.TRILIUM_DEBUG;
      const rustLog = process.env.RUST_LOG;
      this.debugMode = Boolean(triliumDebug === 'true' || triliumDebug === '1' || 
                       (rustLog && (rustLog.includes('debug') || rustLog.includes('trace'))));
    }

    const rateLimiter = config.rateLimitConfig
      ? new RateLimiter(config.rateLimitConfig.maxRequests, config.rateLimitConfig.windowMs)
      : undefined;

    // Construct authorization header based on token
    let authHeader = '';
    if (validatedConfig.apiToken) {
      // Check if it's a bearer token or basic auth format
      if (validatedConfig.apiToken.startsWith('Bearer ') || validatedConfig.apiToken.startsWith('Basic ')) {
        authHeader = validatedConfig.apiToken;
      } else {
        // Default to bearer token
        authHeader = `Bearer ${validatedConfig.apiToken}`;
      }
    }

    this.http = new HttpClient({
      baseUrl: `${validatedConfig.baseUrl}/etapi`,
      timeout: validatedConfig.timeout || 30000,
      retries: validatedConfig.retries || 3,
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      rateLimiter: rateLimiter,
    });

    if (this.debugMode) {
      console.debug(`TriliumClient initialized with debug mode enabled`);
      console.debug(`Server URL: ${this.baseUrl}`);
      console.debug(`API token configured: ${!!this.apiToken}`);
      console.debug(`Configuration validation: passed`);
    }
  }

  // ========== Debug and Utility Methods ==========

  /**
   * Enable debug mode for detailed logging
   */
  public enableDebugMode(): void {
    this.debugMode = true;
  }

  /**
   * Disable debug mode
   */
  public disableDebugMode(): void {
    this.debugMode = false;
  }

  /**
   * Toggle debug mode and return new state
   */
  public toggleDebugMode(): boolean {
    this.debugMode = !this.debugMode;
    console.log(`Debug mode ${this.debugMode ? 'enabled' : 'disabled'}`);
    return this.debugMode;
  }

  /**
   * Log debug information about API operations
   */
  private logDebugInfo(operation: string, details: string): void {
    if (this.debugMode) {
      console.debug(`[API Debug] ${operation}: ${details}`);
      // Also output to stderr for immediate visibility in TUI
      console.error(`[API Debug] ${operation}: ${details}`);
    }
  }

  /**
   * Create comprehensive error message with full details
   */
  private createComprehensiveErrorMessage(operation: string, status: number, errorText: string): string {
    let message = `HTTP ${status} Bad Request`;
    
    if (errorText) {
      try {
        const apiError = JSON.parse(errorText) as TriliumApiErrorResponse;
        message = `HTTP ${status} ${apiError.code}: ${apiError.message}`;
        
        if (this.debugMode) {
          message += `\n\nFull API Error Response:\n${JSON.stringify(apiError, null, 2)}`;
          if (apiError.details) {
            message += `\nError Details: ${JSON.stringify(apiError.details, null, 2)}`;
          }
        }
      } catch {
        // If not valid JSON, include raw error text
        message += `: ${errorText}`;
      }
    }
    
    if (this.debugMode) {
      message += `\n\nOperation: ${operation}`;
      message += `\nTimestamp: ${new Date().toISOString()}`;
    }
    
    return message;
  }

  /**
   * Send request with comprehensive error handling and debug logging
   */
  private async sendRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    this.requestCount++;
    const startTime = Date.now();
    const url = `${this.baseUrl}/etapi${path}`;
    
    this.logDebugInfo(method, `Request ${this.requestCount}: ${url}`);

    if (this.debugMode && body) {
      console.debug('Request body:', JSON.stringify(body, null, 2));
    }

    try {
      let response: T;
      
      // Use specific HTTP method based on the method parameter
      switch (method.toLowerCase()) {
        case 'get':
          response = await this.http.get<T>(path);
          break;
        case 'post':
          response = await this.http.post<T>(path, body);
          break;
        case 'put':
          response = await this.http.put<T>(path, body);
          break;
        case 'patch':
          response = await this.http.patch<T>(path, body);
          break;
        case 'delete':
          response = await this.http.delete<T>(path);
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }

      const duration = Date.now() - startTime;
      this.logDebugInfo(method, `Request ${this.requestCount} completed in ${duration}ms`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logDebugInfo(method, `Request ${this.requestCount} failed after ${duration}ms: ${error}`);
      
      // Enhanced error handling for specific Trilium API errors
      if (error instanceof ApiError) {
        const operation = `${method} ${url}`;
        const comprehensiveMessage = this.createComprehensiveErrorMessage(
          operation, 
          error.status || 0, 
          error.message
        );
        
        // Handle specific error types
        switch (error.status) {
          case 401:
            throw new AuthError(comprehensiveMessage);
          case 400:
            // Enhance PROPERTY_NOT_ALLOWED errors with specific guidance
            if (error.message.includes('PROPERTY_NOT_ALLOWED')) {
              let enhancedMsg = comprehensiveMessage;
              enhancedMsg += '\n\nTroubleshooting PROPERTY_NOT_ALLOWED errors:';
              enhancedMsg += '\n• Only use valid UpdateNoteDef fields: title, type, mime, isProtected';
              enhancedMsg += '\n• Avoid read-only properties: noteId, dateCreated, dateModified, etc.';
              enhancedMsg += '\n• Check JSON field naming (use "type" not "noteType")';
              enhancedMsg += '\n• Enable debug mode to see the exact request payload';
              throw new ValidationError(enhancedMsg);
            } else {
              throw new ValidationError(comprehensiveMessage);
            }
          case 403:
            throw new Error(`Permission denied: ${comprehensiveMessage}`);
          case 404:
            throw new Error(`Not found: ${comprehensiveMessage}`);
          case 429:
            throw new Error(`Rate limited: ${comprehensiveMessage}`);
          case 500:
            throw new Error(`Server error: ${comprehensiveMessage}`);
          case 503:
            throw new Error(`Service unavailable: ${comprehensiveMessage}`);
          default:
            throw new ApiError(comprehensiveMessage, error.status || 0);
        }
      }
      
      throw error;
    }
  }

  // ========== Authentication ==========

  /**
   * Login with password to get auth token
   */
  async login(password: string): Promise<LoginResponse> {
    const request: LoginRequest = { password };
    return await this.sendRequest<LoginResponse>('POST', '/auth/login', request);
  }

  /**
   * Logout and deactivate current token
   */
  async logout(): Promise<void> {
    await this.sendRequest<void>('POST', '/auth/logout');
  }

  /**
   * Test API connection and authentication
   */
  async testConnection(): Promise<AppInfo> {
    try {
      return await this.getAppInfo();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new AuthError('Invalid API token or authentication failed');
      }
      throw error;
    }
  }

  // ========== App Info ==========

  /**
   * Get application information
   */
  async getAppInfo(): Promise<AppInfo> {
    return await this.sendRequest<AppInfo>('GET', '/app-info');
  }

  // ========== Notes ==========

  /**
   * Search for notes with basic options
   */
  async searchNotes(
    query: string, 
    fastSearch: boolean = false, 
    includeArchived: boolean = false, 
    limit: number = 50
  ): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      search: query,
      fastSearch: fastSearch.toString(),
      includeArchivedNotes: includeArchived.toString(),
      limit: limit.toString(),
    });
    
    const response = await this.sendRequest<SearchResponse>('GET', `/notes?${params}`);
    // Convert Note[] to SearchResult[] - the API returns Note objects in results
    return response.results.map(note => ({
      noteId: note.noteId,
      title: note.title,
      path: '', // Will be populated by enhanced search if needed
      score: 1.0, // Default score
    }));
  }

  /**
   * Search for notes with full parameters
   */
  async searchNotesAdvanced(params: SearchNotesParams): Promise<SearchResponse> {
    // Validate using Zod schema
    const validatedParams = validateSearchNotesParams(params);
    
    const searchParams = new URLSearchParams();
    searchParams.set('search', validatedParams.search);
    
    if (validatedParams.fastSearch !== undefined) {
      searchParams.set('fastSearch', validatedParams.fastSearch.toString());
    }
    if (validatedParams.includeArchivedNotes !== undefined) {
      searchParams.set('includeArchivedNotes', validatedParams.includeArchivedNotes.toString());
    }
    if (validatedParams.ancestorNoteId) {
      searchParams.set('ancestorNoteId', validatedParams.ancestorNoteId);
    }
    if (validatedParams.ancestorDepth) {
      searchParams.set('ancestorDepth', validatedParams.ancestorDepth);
    }
    if (validatedParams.orderBy) {
      searchParams.set('orderBy', validatedParams.orderBy);
    }
    if (validatedParams.orderDirection) {
      searchParams.set('orderDirection', validatedParams.orderDirection);
    }
    if (validatedParams.limit !== undefined) {
      searchParams.set('limit', validatedParams.limit.toString());
    }
    if (validatedParams.debug !== undefined) {
      searchParams.set('debug', validatedParams.debug.toString());
    }
    
    this.logDebugInfo('searchNotesAdvanced', `Search query: ${validatedParams.search}`);
    
    return await this.sendRequest<SearchResponse>('GET', `/notes?${searchParams}`);
  }

  /**
   * Enhanced search with highlighting and context
   */
  async searchNotesEnhanced(query: string, options: SearchOptions): Promise<EnhancedSearchResult[]> {
    // Validate search options using Zod schema
    const validatedOptions = SearchOptionsSchema.parse(options);
    
    const params: SearchNotesParams = {
      search: query,
      fastSearch: validatedOptions.fastSearch,
      includeArchivedNotes: validatedOptions.includeArchived,
      limit: validatedOptions.limit,
      ancestorNoteId: validatedOptions.ancestorNoteId,
      ancestorDepth: validatedOptions.ancestorDepth,
      orderBy: validatedOptions.orderBy,
      orderDirection: validatedOptions.orderDirection,
      debug: this.debugMode,
    };
    
    const searchResponse = await this.searchNotesAdvanced(params);
    
    // Enhanced processing for highlighting and context
    const enhancedResults: EnhancedSearchResult[] = [];
    for (const note of searchResponse.results) {
      let content: string | undefined;
      
      if (validatedOptions.includeContent) {
        try {
          content = await this.getNoteContent(note.noteId);
        } catch (error) {
          this.logDebugInfo('searchNotesEnhanced', `Failed to get content for note ${note.noteId}: ${error}`);
        }
      }
      
      enhancedResults.push({
        noteId: note.noteId,
        title: note.title,
        path: '', // Will be populated by utility functions if needed
        score: 1.0, // Default score
        content,
        highlightedSnippets: [], // Will be populated by utility functions
        contextLines: validatedOptions.contextLines,
      });
    }
    
    this.logDebugInfo('searchNotesEnhanced', `Enhanced search completed, ${enhancedResults.length} results`);
    
    return enhancedResults;
  }

  /**
   * Get note by ID
   */
  async getNote(noteId: EntityId): Promise<Note> {
    validateEntityId(noteId, 'noteId');
    return await this.sendRequest<Note>('GET', `/notes/${noteId}`);
  }

  /**
   * Get note content
   */
  async getNoteContent(noteId: EntityId): Promise<string> {
    validateEntityId(noteId, 'noteId');
    // The content endpoint returns plain text, not JSON
    return await this.sendRequest<string>('GET', `/notes/${noteId}/content`);
  }

  /**
   * Get note with content
   */
  async getNoteWithContent(noteId: EntityId): Promise<NoteWithContent> {
    const [note, content] = await Promise.all([
      this.getNote(noteId),
      this.getNoteContent(noteId),
    ]);

    return { ...note, content };
  }

  /**
   * Create a new note
   */
  async createNote(noteDef: CreateNoteDef): Promise<{ note: Note; branch: Branch }> {
    // Validate using Zod schema
    const validatedNoteDef = validateCreateNoteDef(noteDef);
    
    this.logDebugInfo('createNote', `Creating note: ${validatedNoteDef.title}`);
    
    const result = await this.sendRequest<{ note: Note; branch: Branch }>('POST', '/create-note', validatedNoteDef);
    
    // Validate response structure if in debug mode
    if (this.debugMode) {
      try {
        NoteSchema.parse(result.note);
        this.logDebugInfo('createNote', 'Response validation: passed');
      } catch (error) {
        this.logDebugInfo('createNote', `Response validation failed: ${error}`);
      }
    }
    
    return result;
  }

  /**
   * Update note metadata
   */
  async updateNote(noteId: EntityId, updates: UpdateNoteDef): Promise<Note> {
    validateEntityId(noteId, 'noteId');
    
    // Validate using Zod schema
    const validatedUpdates = validateUpdateNoteDef(updates);
    
    this.logDebugInfo('updateNote', `Updating note ${noteId} with: ${JSON.stringify(validatedUpdates)}`);
    
    try {
      const result = await this.sendRequest<Note>('PATCH', `/notes/${noteId}`, validatedUpdates);
      
      // Validate response structure if in debug mode
      if (this.debugMode) {
        try {
          NoteSchema.parse(result);
          this.logDebugInfo('updateNote', 'Response validation: passed');
        } catch (error) {
          this.logDebugInfo('updateNote', `Response validation failed: ${error}`);
        }
      }
      
      this.logDebugInfo('updateNote', `Successfully updated note ${noteId} (${result.title})`);
      return result;
    } catch (error) {
      // Add context about what we were trying to do
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logDebugInfo('updateNote', `Failed to update note ${noteId}: ${errorMessage}`);
      
      if (errorMessage.includes('PROPERTY_NOT_ALLOWED')) {
        const enhancedMsg = `${errorMessage}\n\nDebugging UpdateNoteDef issues:\n` +
          '1. Ensure you\'re only setting valid properties: title, type, mime, isProtected\n' +
          '2. Check that field names match the API specification exactly\n' +
          '3. Avoid setting read-only properties like noteId, dateCreated, dateModified\n' +
          '4. Enable debug mode to see the full request payload';
        throw new ValidationError(enhancedMsg);
      }
      
      throw error;
    }
  }
  
  /**
   * Validate update note request
   */
  private validateUpdateNoteRequest(request: UpdateNoteDef): void {
    // Check for empty title
    if (request.title !== undefined) {
      if (!request.title.trim()) {
        throw new ValidationError('Note title cannot be empty');
      }
      
      // Check title length
      if (request.title.length > 1000) {
        throw new ValidationError('Note title is too long (max 1000 characters)');
      }
    }
    
    // Check for valid note type
    if (request.type !== undefined) {
      const validTypes = ['text', 'code', 'render', 'file', 'image', 'search', 'relationMap', 'book', 
                         'noteMap', 'mermaid', 'webView', 'shortcut', 'doc', 'contentWidget', 'launcher'];
      if (!validTypes.includes(request.type)) {
        throw new ValidationError(
          `Invalid note type '${request.type}'. Valid types are: ${validTypes.join(', ')}`
        );
      }
    }
    
    // Check for valid MIME type format
    if (request.mime !== undefined) {
      if (!request.mime.includes('/') || request.mime.split('/').length !== 2) {
        throw new ValidationError(
          `Invalid MIME type format '${request.mime}'. Expected format: 'type/subtype'`
        );
      }
    }
  }

  /**
   * Update note content
   */
  async updateNoteContent(noteId: EntityId, content: string): Promise<void> {
    validateEntityId(noteId, 'noteId');
    // The content endpoint expects plain text, not JSON
    await this.sendRequest<void>('PUT', `/notes/${noteId}/content`, content);
  }

  /**
   * Delete note
   */
  async deleteNote(noteId: EntityId): Promise<void> {
    validateEntityId(noteId, 'noteId');
    await this.sendRequest<void>('DELETE', `/notes/${noteId}`);
  }

  // ========== Branches ==========

  /**
   * Get branches for a note
   */
  async getNoteBranches(noteId: EntityId): Promise<Branch[]> {
    validateEntityId(noteId, 'noteId');
    return await this.sendRequest<Branch[]>('GET', `/notes/${noteId}/branches`);
  }

  /**
   * Create a new branch (clone note to different location)
   */
  async createBranch(branchDef: CreateBranchDef): Promise<Branch> {
    validateEntityId(branchDef.noteId, 'noteId');
    validateEntityId(branchDef.parentNoteId, 'parentNoteId');
    return await this.sendRequest<Branch>('POST', '/branches', branchDef);
  }

  /**
   * Update branch (only prefix and notePosition can be updated)
   */
  async updateBranch(branchId: EntityId, updates: UpdateBranchDef): Promise<Branch> {
    validateEntityId(branchId, 'branchId');
    return await this.sendRequest<Branch>('PATCH', `/branches/${branchId}`, updates);
  }

  /**
   * Delete branch (deletes note if it's the last branch)
   */
  async deleteBranch(branchId: EntityId): Promise<void> {
    validateEntityId(branchId, 'branchId');
    await this.sendRequest<void>('DELETE', `/branches/${branchId}`);
  }

  /**
   * Get branch by ID
   */
  async getBranch(branchId: EntityId): Promise<Branch> {
    validateEntityId(branchId, 'branchId');
    return await this.sendRequest<Branch>('GET', `/branches/${branchId}`);
  }

  // ========== Attributes ==========

  /**
   * Get note attributes
   */
  async getNoteAttributes(noteId: EntityId): Promise<Attribute[]> {
    validateEntityId(noteId, 'noteId');
    return await this.sendRequest<Attribute[]>('GET', `/notes/${noteId}/attributes`);
  }

  /**
   * Create attribute
   */
  async createAttribute(attributeDef: CreateAttributeDef): Promise<Attribute> {
    validateEntityId(attributeDef.noteId, 'noteId');
    
    // Validate attribute name (no spaces)
    if (!attributeDef.name.trim() || /\s/.test(attributeDef.name)) {
      throw new ValidationError('Attribute name cannot be empty or contain spaces');
    }
    
    return await this.sendRequest<Attribute>('POST', '/attributes', attributeDef);
  }

  /**
   * Update attribute (only value and position can be updated)
   */
  async updateAttribute(attributeId: EntityId, updates: UpdateAttributeDef): Promise<Attribute> {
    validateEntityId(attributeId, 'attributeId');
    return await this.sendRequest<Attribute>('PATCH', `/attributes/${attributeId}`, updates);
  }

  /**
   * Delete attribute
   */
  async deleteAttribute(attributeId: EntityId): Promise<void> {
    validateEntityId(attributeId, 'attributeId');
    await this.sendRequest<void>('DELETE', `/attributes/${attributeId}`);
  }

  /**
   * Get attribute by ID
   */
  async getAttribute(attributeId: EntityId): Promise<Attribute> {
    validateEntityId(attributeId, 'attributeId');
    return await this.sendRequest<Attribute>('GET', `/attributes/${attributeId}`);
  }

  // ========== Attachments ==========

  /**
   * Get note attachments
   */
  async getNoteAttachments(noteId: EntityId): Promise<Attachment[]> {
    validateEntityId(noteId, 'noteId');
    return await this.sendRequest<Attachment[]>('GET', `/notes/${noteId}/attachments`);
  }

  /**
   * Create attachment
   */
  async createAttachment(attachmentDef: CreateAttachmentDef): Promise<Attachment> {
    validateEntityId(attachmentDef.ownerId, 'ownerId');
    return await this.sendRequest<Attachment>('POST', '/attachments', attachmentDef);
  }

  /**
   * Get attachment by ID
   */
  async getAttachment(attachmentId: EntityId): Promise<Attachment> {
    validateEntityId(attachmentId, 'attachmentId');
    return await this.sendRequest<Attachment>('GET', `/attachments/${attachmentId}`);
  }

  /**
   * Get attachment content
   */
  async getAttachmentContent(attachmentId: EntityId): Promise<string> {
    validateEntityId(attachmentId, 'attachmentId');
    return await this.sendRequest<string>('GET', `/attachments/${attachmentId}/content`);
  }

  /**
   * Update attachment metadata (role, mime, title, position are patchable)
   */
  async updateAttachment(attachmentId: EntityId, updates: Partial<Pick<Attachment, 'role' | 'mime' | 'title' | 'notePosition'>>): Promise<Attachment> {
    validateEntityId(attachmentId, 'attachmentId');
    return await this.sendRequest<Attachment>('PATCH', `/attachments/${attachmentId}`, updates);
  }

  /**
   * Update attachment content
   */
  async updateAttachmentContent(attachmentId: EntityId, content: string): Promise<void> {
    validateEntityId(attachmentId, 'attachmentId');
    await this.sendRequest<void>('PUT', `/attachments/${attachmentId}/content`, content);
  }

  /**
   * Delete attachment
   */
  async deleteAttachment(attachmentId: EntityId): Promise<void> {
    validateEntityId(attachmentId, 'attachmentId');
    await this.sendRequest<void>('DELETE', `/attachments/${attachmentId}`);
  }

  // ========== Backup ==========

  /**
   * Create database backup
   */
  async createBackup(backupName?: string): Promise<void> {
    const path = backupName ? `/backup/${backupName}` : '/backup/default';
    await this.sendRequest<void>('PUT', path);
  }

  /**
   * Refresh note ordering for a parent note
   */
  async refreshNoteOrdering(parentNoteId: EntityId): Promise<void> {
    validateEntityId(parentNoteId, 'parentNoteId');
    await this.sendRequest<void>('POST', `/refresh-note-ordering/${parentNoteId}`);
  }

  // ========== Calendar ==========

  /**
   * Get day note for a specific date (creates if doesn't exist)
   */
  async getDayNote(date: string): Promise<Note> {
    // date format: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError('Date must be in YYYY-MM-DD format');
    }
    return await this.sendRequest<Note>('GET', `/calendar/days/${date}`);
  }

  /**
   * Get week note for a specific date (creates if doesn't exist)
   */
  async getWeekNote(date: string): Promise<Note> {
    // date format: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError('Date must be in YYYY-MM-DD format');
    }
    return await this.sendRequest<Note>('GET', `/calendar/weeks/${date}`);
  }

  /**
   * Get month note for a specific month (creates if doesn't exist)
   */
  async getMonthNote(month: string): Promise<Note> {
    // month format: YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new ValidationError('Month must be in YYYY-MM format');
    }
    return await this.sendRequest<Note>('GET', `/calendar/months/${month}`);
  }

  /**
   * Get year note for a specific year (creates if doesn't exist)
   */
  async getYearNote(year: string): Promise<Note> {
    // year format: YYYY
    if (!/^\d{4}$/.test(year)) {
      throw new ValidationError('Year must be in YYYY format');
    }
    return await this.sendRequest<Note>('GET', `/calendar/years/${year}`);
  }

  /**
   * Get inbox note for a specific date
   */
  async getInboxNote(date: string): Promise<Note> {
    // date format: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError('Date must be in YYYY-MM-DD format');
    }
    return await this.sendRequest<Note>('GET', `/inbox/${date}`);
  }

  // ========== Export/Import ==========

  /**
   * Export note subtree as ZIP
   */
  async exportNote(noteId: EntityId, format: ExportFormat = 'html'): Promise<ArrayBuffer> {
    validateEntityId(noteId, 'noteId');
    const params = new URLSearchParams({ format });
    return await this.sendRequest<ArrayBuffer>('GET', `/notes/${noteId}/export?${params}`);
  }

  /**
   * Import ZIP file into a note
   */
  async importNote(noteId: EntityId, content: ArrayBuffer | Uint8Array): Promise<{ note: Note; branch: Branch }> {
    validateEntityId(noteId, 'noteId');
    return await this.sendRequest<{ note: Note; branch: Branch }>('POST', `/notes/${noteId}/import`, content);
  }

  /**
   * Create note revision
   */
  async createRevision(noteId: EntityId): Promise<void> {
    validateEntityId(noteId, 'noteId');
    await this.sendRequest<void>('POST', `/notes/${noteId}/revision`);
  }

  // ========== Enhanced Features from Rust Implementation ==========

  /**
   * Get child notes of a parent note
   */
  async getChildNotes(parentId: EntityId): Promise<Note[]> {
    const parent = await this.getNote(parentId);
    const children: Note[] = [];

    if (parent.childNoteIds && parent.childNoteIds.length > 0) {
      for (const childId of parent.childNoteIds) {
        try {
          const child = await this.getNote(childId);
          children.push(child);
        } catch (error) {
          this.logDebugInfo('getChildNotes', `Failed to get child note ${childId}: ${error}`);
        }
      }
    }

    return children;
  }

  /**
   * Build note tree structure for TUI display
   */
  async buildNoteTree(rootId: EntityId, maxDepth: number = 3): Promise<NoteTreeItem> {
    const buildTreeRecursive = async (noteId: EntityId, depth: number): Promise<NoteTreeItem> => {
      const note = await this.getNote(noteId);
      const treeItem: NoteTreeItem = {
        note,
        children: [],
        isExpanded: depth < 2, // Expand first two levels by default
        depth,
      };

      if (depth < maxDepth && note.childNoteIds && note.childNoteIds.length > 0) {
        for (const childId of note.childNoteIds) {
          try {
            const childTreeItem = await buildTreeRecursive(childId, depth + 1);
            treeItem.children.push(childTreeItem);
          } catch (error) {
            this.logDebugInfo('buildNoteTree', `Failed to build tree for child ${childId}: ${error}`);
          }
        }
      }

      return treeItem;
    };

    return await buildTreeRecursive(rootId, 0);
  }

  /**
   * Get backlinks - notes that link to a specific note
   */
  async getBacklinks(noteId: EntityId): Promise<LinkReference[]> {
    // Search for notes containing links to this note by ID
    const idQuery = `[[${noteId}]]`;
    let allResults = await this.searchNotes(idQuery, false, true, 1000);
    
    // Also search by title if we can get the note
    try {
      const targetNote = await this.getNote(noteId);
      const titleQuery = `[[${targetNote.title}]]`;
      const titleResults = await this.searchNotes(titleQuery, false, true, 1000);
      allResults = allResults.concat(titleResults);
    } catch (error) {
      this.logDebugInfo('getBacklinks', `Could not search by title for note ${noteId}: ${error}`);
    }

    // Convert to LinkReference format
    const backlinks: LinkReference[] = [];
    for (const result of allResults) {
      if (result.noteId !== noteId) { // Don't include self-references
        try {
          const content = await this.getNoteContent(result.noteId);
          // Extract link context (simplified - would use regex utilities in full implementation)
          backlinks.push({
            fromNoteId: result.noteId,
            toNoteId: noteId,
            fromTitle: result.title,
            linkText: '', // Would be extracted from content
            context: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
          });
        } catch (error) {
          this.logDebugInfo('getBacklinks', `Failed to get content for backlink ${result.noteId}: ${error}`);
        }
      }
    }

    return backlinks;
  }

  /**
   * Get outgoing links from a note's content
   */
  async getOutgoingLinks(noteId: EntityId): Promise<LinkReference[]> {
    const content = await this.getNoteContent(noteId);
    const sourceNote = await this.getNote(noteId);
    
    const links: LinkReference[] = [];
    // This would use regex utilities to parse wiki-style links in full implementation
    // For now, return empty array as placeholder
    
    return links;
  }

  /**
   * Get all tags with their hierarchy
   */
  async getAllTags(): Promise<TagInfo[]> {
    // Search for all label attributes that represent tags
    const results = await this.searchNotes('#', false, true, 10000);
    const tags = new Set<string>();
    
    for (const result of results) {
      try {
        const attributes = await this.getNoteAttributes(result.noteId);
        for (const attr of attributes) {
          if (attr.type === 'label') {
            tags.add(attr.name);
          }
        }
      } catch (error) {
        this.logDebugInfo('getAllTags', `Failed to get attributes for note ${result.noteId}: ${error}`);
      }
    }
    
    // Convert to TagInfo with hierarchy parsing
    const tagInfos: TagInfo[] = [];
    for (const tag of tags) {
      const parts = tag.split('/');
      tagInfos.push({
        name: tag,
        hierarchy: parts,
        count: 0, // Would be calculated in full implementation
        parent: parts.length > 1 ? parts.slice(0, -1).join('/') : undefined,
        children: [],
      });
    }
    
    return tagInfos;
  }

  /**
   * Search notes by tag pattern
   */
  async searchByTags(tagPattern: string, includeChildren: boolean = false): Promise<SearchResult[]> {
    const query = tagPattern.startsWith('#') ? tagPattern : `#${tagPattern}`;
    return await this.searchNotes(query, false, true, 1000);
  }

  /**
   * Get notes that can be used as templates
   */
  async getTemplates(): Promise<Template[]> {
    // Look for notes with #template attribute
    const templateResults = await this.searchNotes('#template', false, true, 1000);
    const templates: Template[] = [];
    
    for (const result of templateResults) {
      try {
        const content = await this.getNoteContent(result.noteId);
        templates.push({
          id: result.noteId,
          title: result.title,
          content,
          variables: [], // Would be extracted from content in full implementation
          description: '',
        });
      } catch (error) {
        this.logDebugInfo('getTemplates', `Failed to get template content for note ${result.noteId}: ${error}`);
      }
    }
    
    return templates;
  }

  /**
   * Create note from template with variable substitution
   */
  async createNoteFromTemplate(
    templateId: EntityId, 
    variables: Record<string, string>, 
    parentId: EntityId
  ): Promise<Note> {
    const templateContent = await this.getNoteContent(templateId);
    const templateNote = await this.getNote(templateId);
    
    // Process template variables (would use template utilities in full implementation)
    let processedContent = templateContent;
    let processedTitle = templateNote.title;
    
    // Simple variable substitution - would be enhanced in full implementation
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value);
      processedTitle = processedTitle.replace(new RegExp(placeholder, 'g'), value);
    }
    
    const request: CreateNoteDef = {
      parentNoteId: parentId,
      title: processedTitle,
      type: templateNote.type,
      content: processedContent,
    };
    
    const result = await this.createNote(request);
    return result.note;
  }

  /**
   * Quick capture - create note in inbox with tags and metadata
   */
  async quickCapture(request: QuickCaptureRequest): Promise<Note> {
    // Validate using Zod schema
    const validatedRequest = validateQuickCaptureRequest(request);
    
    // Get today's inbox note
    const today = new Date().toISOString().split('T')[0]!; // YYYY-MM-DD format
    let inboxNote: Note;
    
    try {
      if (validatedRequest.inboxNoteId) {
        inboxNote = await this.getNote(validatedRequest.inboxNoteId);
      } else {
        inboxNote = await this.getInboxNote(today);
      }
    } catch (error) {
      this.logDebugInfo('quickCapture', `Failed to get inbox note: ${error}`);
      // Fallback to creating under root
      inboxNote = await this.getNote('root');
    }
    
    const title = validatedRequest.title || `Quick Note ${new Date().toLocaleString()}`;
    
    const createRequest: CreateNoteDef = {
      parentNoteId: inboxNote.noteId,
      title,
      type: 'text',
      content: validatedRequest.content,
    };
    
    const result = await this.createNote(createRequest);
    
    // Add tags as label attributes
    for (const tag of validatedRequest.tags) {
      try {
        await this.createAttribute({
          noteId: result.note.noteId,
          type: 'label',
          name: tag,
          value: '',
        });
      } catch (error) {
        this.logDebugInfo('quickCapture', `Failed to add tag ${tag}: ${error}`);
      }
    }
    
    // Add metadata as label attributes
    for (const [key, value] of Object.entries(validatedRequest.metadata)) {
      try {
        await this.createAttribute({
          noteId: result.note.noteId,
          type: 'label',
          name: key,
          value,
        });
      } catch (error) {
        this.logDebugInfo('quickCapture', `Failed to add metadata ${key}: ${error}`);
      }
    }
    
    this.logDebugInfo('quickCapture', `Quick capture completed: ${result.note.title}`);
    
    return result.note;
  }

  // ========== Request Builder Pattern ==========

  /**
   * Create an UpdateNoteDef builder for safe request construction
   */
  public createUpdateNoteBuilder(): UpdateNoteRequestBuilderImpl {
    return new UpdateNoteRequestBuilderImpl();
  }

  // ========== Import/Export Placeholder Methods ==========
  // These methods provide placeholders for import/export functionality
  // In a full implementation, these would interface with proper import/export logic

  /**
   * Import Obsidian vault - placeholder implementation
   */
  async importObsidianVault(options: {
    vaultPath: string;
    parentNoteId?: EntityId;
    files: any[];
  }): Promise<Array<{
    ownerId: EntityId;
    title: string;
    type: string;
    imported: boolean;
    error?: string;
  }>> {
    // This is a placeholder implementation
    // In a real implementation, this would process Obsidian vault files
    const results = [];
    
    for (const file of options.files) {
      try {
        // Create a note for each file
        const parentId = options.parentNoteId || 'root';
        const title = file.path.replace(/\.md$/, '').split('/').pop() || 'Imported Note';
        
        const noteResult = await this.createNote({
          parentNoteId: parentId,
          title,
          type: 'text',
          content: `Imported from Obsidian: ${file.path}\n\n(This is a placeholder - actual content would be processed)`
        });
        
        results.push({
          ownerId: noteResult.noteId,
          title,
          type: 'text',
          imported: true
        });
      } catch (error) {
        results.push({
          ownerId: '',
          title: file.path,
          type: 'text',
          imported: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }

  /**
   * Plan Obsidian export - placeholder implementation
   */
  async planObsidianExport(noteId: EntityId): Promise<{
    files: Array<{
      ownerId: EntityId;
      title: string;
      outputPath: string;
      type: string;
      size: number;
    }>;
  }> {
    // Get the note and its descendants
    const note = await this.getNote(noteId);
    const children = await this.getChildNotes(noteId);
    
    const files = [];
    
    // Add the root note
    files.push({
      ownerId: note.noteId,
      title: note.title,
      outputPath: `${note.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`,
      type: 'markdown',
      size: 1000 // placeholder
    });
    
    // Add child notes
    for (const child of children) {
      files.push({
        ownerId: child.noteId,
        title: child.title,
        outputPath: `${child.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`,
        type: 'markdown',
        size: 1000 // placeholder
      });
    }
    
    return { files };
  }

  /**
   * Export to Obsidian format - placeholder implementation
   */
  async exportToObsidian(options: {
    ownerId: EntityId;
    outputPath: string;
    exportPlan: any;
  }): Promise<Array<{
    ownerId: EntityId;
    title: string;
    outputPath: string;
    exported: boolean;
    error?: string;
  }>> {
    // Placeholder implementation
    const results = [];
    
    for (const file of options.exportPlan.files) {
      try {
        // In a real implementation, this would export the note content to files
        results.push({
          ownerId: file.noteId,
          title: file.title,
          outputPath: file.outputPath,
          exported: true
        });
      } catch (error) {
        results.push({
          ownerId: file.noteId,
          title: file.title,
          outputPath: file.outputPath,
          exported: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }

  /**
   * Import Notion ZIP - placeholder implementation
   */
  async importNotionZip(options: {
    zipPath: string;
    parentNoteId?: EntityId;
    analysis: any;
  }): Promise<Array<{
    ownerId: EntityId;
    title: string;
    type: string;
    imported: boolean;
    attachments: number;
    error?: string;
  }>> {
    // Placeholder implementation
    const results = [];
    
    for (const page of options.analysis.pages) {
      try {
        const parentId = options.parentNoteId || 'root';
        
        const noteResult = await this.createNote({
          parentNoteId: parentId,
          title: page.title,
          type: 'text',
          content: page.content || `Imported from Notion: ${page.title}\n\n(This is a placeholder - actual content would be processed)`
        });
        
        results.push({
          ownerId: noteResult.noteId,
          title: page.title,
          type: 'text',
          imported: true,
          attachments: page.attachments || 0
        });
      } catch (error) {
        results.push({
          ownerId: '',
          title: page.title,
          type: 'text',
          imported: false,
          attachments: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }

  /**
   * Plan Notion export - placeholder implementation
   */
  async planNotionExport(noteId: EntityId): Promise<{
    pages: Array<{
      ownerId: EntityId;
      title: string;
      outputPath: string;
      type: string;
      attachments: number;
    }>;
  }> {
    const note = await this.getNote(noteId);
    const children = await this.getChildNotes(noteId);
    
    const pages = [];
    
    pages.push({
      ownerId: note.noteId,
      title: note.title,
      outputPath: `${note.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`,
      type: 'page',
      attachments: 0
    });
    
    for (const child of children) {
      pages.push({
        ownerId: child.noteId,
        title: child.title,
        outputPath: `${child.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`,
        type: 'page',
        attachments: 0
      });
    }
    
    return { pages };
  }

  /**
   * Export to Notion format - placeholder implementation
   */
  async exportToNotion(options: {
    ownerId: EntityId;
    outputPath: string;
    exportPlan: any;
  }): Promise<Array<{
    ownerId: EntityId;
    title: string;
    outputPath: string;
    exported: boolean;
    error?: string;
  }>> {
    const results = [];
    
    for (const page of options.exportPlan.pages) {
      results.push({
        ownerId: page.noteId,
        title: page.title,
        outputPath: page.outputPath,
        exported: true // placeholder
      });
    }
    
    return results;
  }

  /**
   * Import directory - placeholder implementation
   */
  async importDirectory(options: {
    dirPath: string;
    parentNoteId?: EntityId;
    files: any[];
    options: any;
  }): Promise<Array<{
    ownerId: EntityId;
    title: string;
    originalPath: string;
    imported: boolean;
    error?: string;
  }>> {
    const results = [];
    
    for (const file of options.files) {
      try {
        const parentId = options.parentNoteId || 'root';
        const title = file.path.split('/').pop() || 'Imported File';
        
        const noteResult = await this.createNote({
          parentNoteId: parentId,
          title,
          type: 'text',
          content: `Imported from: ${file.path}\n\n(This is a placeholder - actual content would be processed)`
        });
        
        results.push({
          ownerId: noteResult.noteId,
          title,
          originalPath: file.path,
          imported: true
        });
      } catch (error) {
        results.push({
          ownerId: '',
          title: file.path,
          originalPath: file.path,
          imported: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return results;
  }

  /**
   * Plan Git sync - placeholder implementation
   */
  async planGitSync(options: {
    repoPath: string;
    noteId?: EntityId;
    branch?: string;
    operation: string;
  }): Promise<{
    actions: Array<{
      action: string;
      file: string;
      ownerId: string;
      status: string;
    }>;
  }> {
    // Placeholder implementation
    return {
      actions: [
        {
          action: 'sync',
          file: 'placeholder.md',
          ownerId: options.noteId || 'root',
          status: 'pending'
        }
      ]
    };
  }

  /**
   * Execute Git sync - placeholder implementation
   */
  async executeGitSync(options: {
    repoPath: string;
    noteId?: EntityId;
    branch?: string;
    operation: string;
    syncPlan: any;
  }): Promise<Array<{
    action: string;
    file: string;
    ownerId: string;
    success: boolean;
    error?: string;
  }>> {
    const results = [];
    
    for (const action of options.syncPlan.actions) {
      results.push({
        action: action.action,
        file: action.file,
        ownerId: action.noteId,
        success: true // placeholder
      });
    }
    
    return results;
  }
}

/**
 * Implementation of UpdateNoteRequestBuilder pattern
 */
class UpdateNoteRequestBuilderImpl {
  private updates: UpdateNoteDef = {};

  public title(title: string): this {
    this.updates.title = title;
    return this;
  }

  public noteType(type: NoteType): this {
    this.updates.type = type;
    return this;
  }

  public mime(mime: string): this {
    this.updates.mime = mime;
    return this;
  }

  public isProtected(protected_: boolean): this {
    this.updates.isProtected = protected_;
    return this;
  }

  public build(): UpdateNoteDef {
    // Validate before returning
    if (this.updates.title !== undefined && !this.updates.title.trim()) {
      throw new ValidationError('Note title cannot be empty');
    }
    
    if (this.updates.title !== undefined && this.updates.title.length > 1000) {
      throw new ValidationError('Note title is too long (max 1000 characters)');
    }
    
    if (this.updates.type !== undefined) {
      const validTypes = ['text', 'code', 'render', 'file', 'image', 'search', 'relationMap', 'book', 
                         'noteMap', 'mermaid', 'webView', 'shortcut', 'doc', 'contentWidget', 'launcher'];
      if (!validTypes.includes(this.updates.type)) {
        throw new ValidationError(`Invalid note type '${this.updates.type}'. Valid types are: ${validTypes.join(', ')}`);
      }
    }
    
    if (this.updates.mime !== undefined) {
      if (!this.updates.mime.includes('/') || this.updates.mime.split('/').length !== 2) {
        throw new ValidationError(`Invalid MIME type format '${this.updates.mime}'. Expected format: 'type/subtype'`);
      }
    }
    
    return { ...this.updates };
  }

  public isEmpty(): boolean {
    return Object.keys(this.updates).length === 0;
  }

  public fieldCount(): number {
    return Object.keys(this.updates).length;
  }

  public debugJson(): string {
    return JSON.stringify(this.updates, null, 2);
  }
}
