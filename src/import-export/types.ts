import { z } from 'zod';

/**
 * Core types for import/export operations
 */

// Base types
export const OperationTypeSchema = z.enum(['import', 'export', 'sync']);
export const FormatTypeSchema = z.enum(['obsidian', 'notion', 'directory', 'git']);
export const DuplicateHandlingSchema = z.enum(['skip', 'overwrite', 'rename', 'merge']);

export type OperationType = z.infer<typeof OperationTypeSchema>;
export type FormatType = z.infer<typeof FormatTypeSchema>;
export type DuplicateHandling = z.infer<typeof DuplicateHandlingSchema>;

// Progress tracking
export const ProgressEventSchema = z.object({
  id: z.string(),
  type: z.enum(['start', 'progress', 'complete', 'error']),
  message: z.string(),
  current: z.number().optional(),
  total: z.number().optional(),
  data: z.any().optional(),
  timestamp: z.date().default(() => new Date()),
});

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export type ProgressCallback = (event: ProgressEvent) => void | Promise<void>;

// File information
export const FileInfoSchema = z.object({
  path: z.string(),
  fullPath: z.string(),
  relativePath: z.string().optional(),
  name: z.string(),
  extension: z.string(),
  size: z.number(),
  mimeType: z.string().optional(),
  encoding: z.string().optional(),
  lastModified: z.date().optional(),
  checksum: z.string().optional(),
  depth: z.number().default(0),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type FileInfo = z.infer<typeof FileInfoSchema>;

// Content information
export const ContentInfoSchema = z.object({
  type: z.enum(['text', 'markdown', 'html', 'json', 'binary', 'image', 'document']),
  title: z.string().optional(),
  content: z.string().optional(),
  frontMatter: z.record(z.string(), z.any()).optional(),
  links: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type ContentInfo = z.infer<typeof ContentInfoSchema>;

// Import/Export configuration
export const ImportExportConfigSchema = z.object({
  duplicateHandling: DuplicateHandlingSchema.default('skip'),
  preserveStructure: z.boolean().default(true),
  includeAttachments: z.boolean().default(true),
  validateContent: z.boolean().default(true),
  createMissingParents: z.boolean().default(true),
  maxDepth: z.number().positive().optional(),
  patterns: z.array(z.string()).default([]),
  excludePatterns: z.array(z.string()).default([]),
  dryRun: z.boolean().default(false),
  batchSize: z.number().positive().default(100),
  timeout: z.number().positive().default(30000),
  retries: z.number().nonnegative().default(3),
  concurrency: z.number().positive().default(5),
  progress: z.boolean().default(true),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type ImportExportConfig = z.infer<typeof ImportExportConfigSchema>;

// Operation results
export const OperationErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
  stack: z.string().optional(),
  timestamp: z.date().default(() => new Date()),
});

export type OperationError = z.infer<typeof OperationErrorSchema>;

export const FileResultSchema = z.object({
  file: FileInfoSchema,
  ownerId: z.string().optional(),
  success: z.boolean(),
  error: OperationErrorSchema.optional(),
  skipped: z.boolean().default(false),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type FileResult = z.infer<typeof FileResultSchema>;

export const OperationSummarySchema = z.object({
  operation: OperationTypeSchema,
  format: FormatTypeSchema,
  startTime: z.date(),
  endTime: z.date().optional(),
  duration: z.number().optional(),
  totalFiles: z.number(),
  processedFiles: z.number(),
  successfulFiles: z.number(),
  failedFiles: z.number(),
  skippedFiles: z.number(),
  totalSize: z.number(),
  processedSize: z.number(),
  errors: z.array(OperationErrorSchema),
  warnings: z.array(z.string()),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type OperationSummary = z.infer<typeof OperationSummarySchema>;

// Import-specific types
export const ImportResultSchema = z.object({
  summary: OperationSummarySchema,
  files: z.array(FileResultSchema),
  created: z.array(z.string()), // Note IDs
  updated: z.array(z.string()), // Note IDs
  attachments: z.array(z.string()), // Attachment IDs
  warnings: z.array(z.string()),
  config: ImportExportConfigSchema,
});

export type ImportResult = z.infer<typeof ImportResultSchema>;

// Export-specific types
export const ExportResultSchema = z.object({
  summary: OperationSummarySchema,
  files: z.array(FileResultSchema),
  outputPath: z.string(),
  exported: z.array(z.string()), // Note IDs
  attachments: z.array(z.string()), // Attachment paths
  warnings: z.array(z.string()),
  config: ImportExportConfigSchema,
});

export type ExportResult = z.infer<typeof ExportResultSchema>;

// Sync-specific types
export const GitSyncResultSchema = z.object({
  summary: OperationSummarySchema,
  files: z.array(FileResultSchema),
  repository: z.string(),
  branch: z.string(),
  commitHash: z.string().optional(),
  imported: z.array(z.string()), // Note IDs
  exported: z.array(z.string()), // File paths
  conflicts: z.array(z.string()),
  warnings: z.array(z.string()),
  config: ImportExportConfigSchema,
});

export type GitSyncResult = z.infer<typeof GitSyncResultSchema>;

// Format-specific configurations

// Obsidian specific
export const ObsidianConfigSchema = z.object({
  vaultPath: z.string(),
  preserveWikilinks: z.boolean().default(true),
  convertWikilinks: z.boolean().default(false),
  includeTemplates: z.boolean().default(false),
  templatesFolder: z.string().default('templates'),
  attachmentFolder: z.string().default('attachments'),
  dailyNotesFolder: z.string().default('daily'),
  processFrontMatter: z.boolean().default(true),
  preserveFolderStructure: z.boolean().default(true),
  ignoreFolders: z.array(z.string()).default(['.obsidian', '.trash']),
  imageFormats: z.array(z.string()).default(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']),
  documentFormats: z.array(z.string()).default(['pdf', 'doc', 'docx', 'odt']),
  audioFormats: z.array(z.string()).default(['mp3', 'wav', 'ogg', 'm4a']),
  videoFormats: z.array(z.string()).default(['mp4', 'webm', 'ogv', 'mov']),
}).merge(ImportExportConfigSchema);

export type ObsidianConfig = z.infer<typeof ObsidianConfigSchema>;

// Notion specific
export const NotionConfigSchema = z.object({
  zipPath: z.string().optional(),
  workspaceName: z.string().optional(),
  preserveIds: z.boolean().default(false),
  convertBlocks: z.boolean().default(true),
  includeComments: z.boolean().default(false),
  processTemplates: z.boolean().default(true),
  convertTables: z.boolean().default(true),
  processCallouts: z.boolean().default(true),
  attachmentHandling: z.enum(['embed', 'link', 'copy']).default('copy'),
}).merge(ImportExportConfigSchema);

export type NotionConfig = z.infer<typeof NotionConfigSchema>;

// Directory specific
export const DirectoryConfigSchema = z.object({
  sourcePath: z.string(),
  outputPath: z.string().optional(),
  filePatterns: z.array(z.string()).default(['**/*.md', '**/*.txt', '**/*.html']),
  ignorePatterns: z.array(z.string()).default(['**/node_modules/**', '**/.git/**']),
  detectFormat: z.boolean().default(true),
  preserveExtensions: z.boolean().default(true),
  createIndex: z.boolean().default(false),
  indexFileName: z.string().default('index.md'),
}).merge(ImportExportConfigSchema);

export type DirectoryConfig = z.infer<typeof DirectoryConfigSchema>;

// Git specific
export const GitConfigSchema = z.object({
  repositoryPath: z.string(),
  branch: z.string().default('main'),
  remote: z.string().default('origin'),
  commitMessage: z.string().optional(),
  authorName: z.string().optional(),
  authorEmail: z.string().optional(),
  syncDirection: z.enum(['import', 'export', 'bidirectional']).default('bidirectional'),
  conflictResolution: z.enum(['manual', 'local', 'remote', 'merge']).default('manual'),
  trackChanges: z.boolean().default(true),
  includeHistory: z.boolean().default(false),
  pushAfterExport: z.boolean().default(false),
  pullBeforeImport: z.boolean().default(true),
}).merge(ImportExportConfigSchema);

export type GitConfig = z.infer<typeof GitConfigSchema>;

// Operation context
export const OperationContextSchema = z.object({
  operationId: z.string(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  triliumUrl: z.string(),
  apiToken: z.string(),
  workingDirectory: z.string(),
  tempDirectory: z.string(),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type OperationContext = z.infer<typeof OperationContextSchema>;

// Handler interfaces
export interface ImportHandler<TConfig = ImportExportConfig> {
  name: string;
  format: FormatType;
  
  validate(config: TConfig): Promise<void>;
  scan(config: TConfig, context: OperationContext): Promise<FileInfo[]>;
  import(
    files: FileInfo[], 
    config: TConfig, 
    context: OperationContext,
    onProgress?: ProgressCallback
  ): Promise<ImportResult>;
}

export interface ExportHandler<TConfig = ImportExportConfig> {
  name: string;
  format: FormatType;
  
  validate(config: TConfig): Promise<void>;
  plan(noteIds: string[], config: TConfig, context: OperationContext): Promise<FileInfo[]>;
  export(
    noteIds: string[], 
    config: TConfig, 
    context: OperationContext,
    onProgress?: ProgressCallback
  ): Promise<ExportResult>;
}

export interface SyncHandler<TConfig = ImportExportConfig> {
  name: string;
  format: FormatType;
  
  validate(config: TConfig): Promise<void>;
  sync(
    config: TConfig, 
    context: OperationContext,
    onProgress?: ProgressCallback
  ): Promise<GitSyncResult>;
}

// Utility types for error handling
export class ImportExportError extends Error {
  constructor(
    message: string,
    public code: string = 'IMPORT_EXPORT_ERROR',
    public details?: any,
    public operation?: OperationType,
    public format?: FormatType
  ) {
    super(message);
    this.name = 'ImportExportError';
  }

  toJSON(): OperationError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack,
      timestamp: new Date(),
    };
  }
}

// Content parser interface
export interface ContentParser {
  canHandle(fileInfo: FileInfo): boolean;
  parse(content: string, fileInfo: FileInfo): Promise<ContentInfo>;
}

// Content formatter interface
export interface ContentFormatter {
  canHandle(contentInfo: ContentInfo, format: FormatType): boolean;
  format(contentInfo: ContentInfo, format: FormatType): Promise<string>;
}

// Validation helpers
export function validateConfig<T>(schema: z.ZodSchema<T>, config: unknown): T {
  try {
    return schema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      throw new ImportExportError(
        `Configuration validation failed: ${messages.join(', ')}`,
        'INVALID_CONFIG',
        { errors: error.errors }
      );
    }
    throw error;
  }
}

export function createProgressTracker(
  operationId: string, 
  total: number,
  callback?: ProgressCallback
): {
  start: (message?: string) => Promise<void>;
  progress: (current: number, message?: string, data?: any) => Promise<void>;
  complete: (message?: string, data?: any) => Promise<void>;
  error: (error: Error | string, data?: any) => Promise<void>;
} {
  return {
    async start(message = 'Starting operation') {
      if (callback) {
        await callback({
          id: operationId,
          type: 'start',
          message,
          current: 0,
          total,
          timestamp: new Date(),
        });
      }
    },

    async progress(current: number, message?: string, data?: any) {
      if (callback) {
        await callback({
          id: operationId,
          type: 'progress',
          message: message || `Progress: ${current}/${total}`,
          current,
          total,
          data,
          timestamp: new Date(),
        });
      }
    },

    async complete(message = 'Operation completed', data?: any) {
      if (callback) {
        await callback({
          id: operationId,
          type: 'complete',
          message,
          current: total,
          total,
          data,
          timestamp: new Date(),
        });
      }
    },

    async error(error: Error | string, data?: any) {
      if (callback) {
        await callback({
          id: operationId,
          type: 'error',
          message: error instanceof Error ? error.message : error,
          data: {
            ...data,
            error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
          },
          timestamp: new Date(),
        });
      }
    },
  };
}