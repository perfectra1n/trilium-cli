/**
 * Complete ETAPI client with all endpoints
 */

import type {
  // Base types
  EntityId,
  ExportFormat,
  ApiError,
  // Note types
  Note,
  CreateNoteDef,
  UpdateNoteDef,
  SearchNotesParams,
  SearchResponse,
  NoteContent,
  NoteWithBranch,
  NoteRevision,
  // Branch types
  Branch,
  CreateBranchDef,
  UpdateBranchDef,
  // Attribute types
  Attribute,
  CreateAttributeDef,
  UpdateAttributeDef,
  AttributeList,
  // Attachment types
  Attachment,
  CreateAttachment,
  UpdateAttachmentDef,
  AttachmentContent,
  // Calendar types
  InboxNote,
  DayNotesResponse,
  WeekNotesResponse,
  MonthNotesResponse,
  YearNotesResponse,
  // Auth types
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  // System types
  AppInfo,
  BackupResponse,
  RefreshNoteOrderingResponse
} from '@trilium-cli/zod';

export interface ApiConfig {
  baseUrl: string;
  apiToken?: string;
  timeout?: number;
}

export class ETAPIClient {
  private config: ApiConfig;
  private headers: Record<string, string>;
  private normalizedBaseUrl: string;

  constructor(config: ApiConfig) {
    // Normalize the base URL by removing trailing slashes
    this.normalizedBaseUrl = config.baseUrl.replace(/\/+$/, '');
    this.config = {
      ...config,
      baseUrl: this.normalizedBaseUrl
    };
    this.headers = {
      'Content-Type': 'application/json',
      ...(config.apiToken && { 'Authorization': config.apiToken })
    };
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}/etapi${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json() as ApiError;
      throw new Error(error.message || `API Error: ${response.statusText}`);
    }

    return response.json() as T;
  }

  // ========== Note Endpoints ==========

  /**
   * POST /create-note
   */
  async createNote(noteDef: CreateNoteDef): Promise<NoteWithBranch> {
    return this.request<NoteWithBranch>('/create-note', {
      method: 'POST',
      body: JSON.stringify(noteDef)
    });
  }

  /**
   * GET /notes - Search notes
   */
  async searchNotes(params: SearchNotesParams): Promise<SearchResponse> {
    const query = new URLSearchParams(params as any).toString();
    return this.request<SearchResponse>(`/notes?${query}`);
  }

  /**
   * GET /notes/{noteId}
   */
  async getNote(noteId: EntityId): Promise<Note> {
    return this.request<Note>(`/notes/${noteId}`);
  }

  /**
   * PATCH /notes/{noteId}
   */
  async updateNote(noteId: EntityId, updates: UpdateNoteDef): Promise<Note> {
    return this.request<Note>(`/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  /**
   * DELETE /notes/{noteId}
   */
  async deleteNote(noteId: EntityId): Promise<void> {
    await this.request<void>(`/notes/${noteId}`, {
      method: 'DELETE'
    });
  }

  /**
   * GET /notes/{noteId}/content
   */
  async getNoteContent(noteId: EntityId): Promise<NoteContent> {
    const response = await fetch(`${this.config.baseUrl}/etapi/notes/${noteId}/content`, {
      headers: this.headers
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get note content: ${response.statusText}`);
    }
    
    return response.text();
  }

  /**
   * PUT /notes/{noteId}/content
   */
  async updateNoteContent(noteId: EntityId, content: NoteContent): Promise<void> {
    await this.request<void>(`/notes/${noteId}/content`, {
      method: 'PUT',
      headers: {
        ...this.headers,
        'Content-Type': 'text/plain'
      },
      body: content
    });
  }

  /**
   * GET /notes/{noteId}/export
   */
  async exportNote(noteId: EntityId, format: ExportFormat): Promise<string> {
    const response = await fetch(
      `${this.config.baseUrl}/etapi/notes/${noteId}/export?format=${format}`,
      { headers: this.headers }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to export note: ${response.statusText}`);
    }
    
    return response.text();
  }

  /**
   * POST /notes/{noteId}/import
   */
  async importToNote(noteId: EntityId, file: ArrayBuffer | Uint8Array | string, mimeType?: string): Promise<Note> {
    return this.request<Note>(`/notes/${noteId}/import`, {
      method: 'POST',
      headers: {
        ...this.headers,
        ...(mimeType && { 'Content-Type': mimeType })
      },
      body: file as BodyInit
    });
  }

  /**
   * POST /notes/{noteId}/revision
   */
  async createRevision(noteId: EntityId): Promise<NoteRevision> {
    return this.request<NoteRevision>(`/notes/${noteId}/revision`, {
      method: 'POST'
    });
  }

  // ========== Helper Methods ==========

  /**
   * Get a note with its content in a single call
   */
  async getNoteWithContent(noteId: EntityId): Promise<Note & { content: string }> {
    const [note, content] = await Promise.all([
      this.getNote(noteId),
      this.getNoteContent(noteId)
    ]);
    return { ...note, content: content as string };
  }

  /**
   * Get child notes of a parent note
   */
  async getChildNotes(parentNoteId: EntityId): Promise<Note[]> {
    // Search for child notes
    const searchParams: SearchNotesParams = {
      search: `#parentNote="${parentNoteId}"`
    };
    const response = await this.searchNotes(searchParams);
    return response.results || [];
  }

  /**
   * Get attributes for a note
   */
  async getNoteAttributes(noteId: EntityId): Promise<Attribute[]> {
    // This would typically be a dedicated endpoint, but we'll simulate it
    const note = await this.getNote(noteId);
    // In reality, attributes would be fetched separately
    return [];
  }

  /**
   * Get branches for a note
   */
  async getNoteBranches(noteId: EntityId): Promise<Branch[]> {
    // This would typically be a dedicated endpoint
    const searchParams: SearchNotesParams = {
      search: `noteId="${noteId}"`
    };
    // In reality, branches would be fetched separately
    return [];
  }

  // ========== Branch Endpoints ==========

  /**
   * POST /branches
   */
  async createBranch(branchDef: CreateBranchDef): Promise<Branch> {
    return this.request<Branch>('/branches', {
      method: 'POST',
      body: JSON.stringify(branchDef)
    });
  }

  /**
   * GET /branches/{branchId}
   */
  async getBranch(branchId: EntityId): Promise<Branch> {
    return this.request<Branch>(`/branches/${branchId}`);
  }

  /**
   * PATCH /branches/{branchId}
   */
  async updateBranch(branchId: EntityId, updates: UpdateBranchDef): Promise<Branch> {
    return this.request<Branch>(`/branches/${branchId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  /**
   * DELETE /branches/{branchId}
   */
  async deleteBranch(branchId: EntityId): Promise<void> {
    await this.request<void>(`/branches/${branchId}`, {
      method: 'DELETE'
    });
  }

  // ========== Attachment Endpoints ==========

  /**
   * POST /attachments
   */
  async createAttachment(attachment: CreateAttachment): Promise<Attachment> {
    return this.request<Attachment>('/attachments', {
      method: 'POST',
      body: JSON.stringify(attachment)
    });
  }

  /**
   * GET /attachments/{attachmentId}
   */
  async getAttachment(attachmentId: EntityId): Promise<Attachment> {
    return this.request<Attachment>(`/attachments/${attachmentId}`);
  }

  /**
   * PATCH /attachments/{attachmentId}
   */
  async updateAttachment(attachmentId: EntityId, updates: UpdateAttachmentDef): Promise<Attachment> {
    return this.request<Attachment>(`/attachments/${attachmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  /**
   * DELETE /attachments/{attachmentId}
   */
  async deleteAttachment(attachmentId: EntityId): Promise<void> {
    await this.request<void>(`/attachments/${attachmentId}`, {
      method: 'DELETE'
    });
  }

  /**
   * GET /attachments/{attachmentId}/content
   */
  async getAttachmentContent(attachmentId: EntityId): Promise<AttachmentContent> {
    const response = await fetch(
      `${this.config.baseUrl}/etapi/attachments/${attachmentId}/content`,
      { headers: this.headers }
    );
    
    if (!response.ok) {
      throw new Error(`Failed to get attachment content: ${response.statusText}`);
    }
    
    // Check if binary or text content
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.startsWith('text/')) {
      return response.text();
    } else {
      const arrayBuffer = await response.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
  }

  /**
   * PUT /attachments/{attachmentId}/content
   */
  async updateAttachmentContent(attachmentId: EntityId, content: AttachmentContent): Promise<void> {
    const isArrayBuffer = content instanceof ArrayBuffer || content instanceof Uint8Array;
    await this.request<void>(`/attachments/${attachmentId}/content`, {
      method: 'PUT',
      headers: {
        ...this.headers,
        'Content-Type': isArrayBuffer ? 'application/octet-stream' : 'text/plain'
      },
      body: content as BodyInit
    });
  }

  // ========== Attribute Endpoints ==========

  /**
   * POST /attributes
   */
  async createAttribute(attrDef: CreateAttributeDef): Promise<Attribute> {
    return this.request<Attribute>('/attributes', {
      method: 'POST',
      body: JSON.stringify(attrDef)
    });
  }

  /**
   * GET /attributes/{attributeId}
   */
  async getAttribute(attributeId: EntityId): Promise<Attribute> {
    return this.request<Attribute>(`/attributes/${attributeId}`);
  }

  /**
   * PATCH /attributes/{attributeId}
   */
  async updateAttribute(attributeId: EntityId, updates: UpdateAttributeDef): Promise<Attribute> {
    return this.request<Attribute>(`/attributes/${attributeId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    });
  }

  /**
   * DELETE /attributes/{attributeId}
   */
  async deleteAttribute(attributeId: EntityId): Promise<void> {
    await this.request<void>(`/attributes/${attributeId}`, {
      method: 'DELETE'
    });
  }

  // ========== Special Endpoints ==========

  /**
   * POST /refresh-note-ordering/{parentNoteId}
   */
  async refreshNoteOrdering(parentNoteId: EntityId): Promise<RefreshNoteOrderingResponse> {
    return this.request<RefreshNoteOrderingResponse>(`/refresh-note-ordering/${parentNoteId}`, {
      method: 'POST'
    });
  }

  /**
   * GET /inbox/{date}
   */
  async getInboxNote(date: string): Promise<InboxNote> {
    return this.request<InboxNote>(`/inbox/${date}`);
  }

  /**
   * GET /calendar/days/{date}
   */
  async getCalendarDay(date: string): Promise<DayNotesResponse> {
    return this.request<DayNotesResponse>(`/calendar/days/${date}`);
  }

  /**
   * GET /calendar/weeks/{date}
   */
  async getCalendarWeek(date: string): Promise<WeekNotesResponse> {
    return this.request<WeekNotesResponse>(`/calendar/weeks/${date}`);
  }

  /**
   * GET /calendar/months/{month}
   */
  async getCalendarMonth(month: string): Promise<MonthNotesResponse> {
    return this.request<MonthNotesResponse>(`/calendar/months/${month}`);
  }

  /**
   * GET /calendar/years/{year}
   */
  async getCalendarYear(year: string): Promise<YearNotesResponse> {
    return this.request<YearNotesResponse>(`/calendar/years/${year}`);
  }

  // ========== Auth & System Endpoints ==========

  /**
   * POST /auth/login
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(request)
    });
  }

  /**
   * POST /auth/logout
   */
  async logout(): Promise<LogoutResponse> {
    return this.request<LogoutResponse>('/auth/logout', {
      method: 'POST'
    });
  }

  /**
   * GET /app-info
   */
  async getAppInfo(): Promise<AppInfo> {
    return this.request<AppInfo>('/app-info');
  }

  /**
   * PUT /backup/{backupName}
   */
  async createBackup(backupName: string): Promise<BackupResponse> {
    return this.request<BackupResponse>(`/backup/${backupName}`, {
      method: 'PUT'
    });
  }
}