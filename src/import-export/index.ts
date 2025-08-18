/**
 * Import/Export functionality - Unified interface for all formats
 */

import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { join } from 'path';

import type { TriliumClient } from '../api/client.js';

import { DirectoryImportHandler, DirectoryExportHandler } from './formats/directory.js';
import { GitSyncHandler } from './formats/git.js';
import { NotionImportHandler, NotionExportHandler } from './formats/notion.js';
import { ObsidianImportHandler, ObsidianExportHandler } from './formats/obsidian.js';
import type {
  ImportHandler,
  ExportHandler,
  SyncHandler,
  FormatType,
  OperationType,
  ImportResult,
  ExportResult,
  GitSyncResult,
  OperationContext,
  ProgressCallback,
  ObsidianConfig,
  NotionConfig,
  DirectoryConfig,
  GitConfig,
  ImportExportConfig,
} from './types.js';
import {
  ImportExportError,
  validateConfig,
  ObsidianConfigSchema,
  NotionConfigSchema,
  DirectoryConfigSchema,
  GitConfigSchema,
} from './types.js';

// Import format handlers

/**
 * Import/Export Manager - Central orchestrator for all import/export operations
 */
export class ImportExportManager {
  private importHandlers = new Map<FormatType, ImportHandler>();
  private exportHandlers = new Map<FormatType, ExportHandler>();
  private syncHandlers = new Map<FormatType, SyncHandler>();

  constructor(private client: TriliumClient) {
    this.initializeHandlers();
  }

  private initializeHandlers(): void {
    // Obsidian handlers
    const obsidianImport = new ObsidianImportHandler(this.client);
    const obsidianExport = new ObsidianExportHandler(this.client);
    this.importHandlers.set('obsidian', obsidianImport);
    this.exportHandlers.set('obsidian', obsidianExport);

    // Notion handlers
    const notionImport = new NotionImportHandler(this.client);
    const notionExport = new NotionExportHandler(this.client);
    this.importHandlers.set('notion', notionImport);
    this.exportHandlers.set('notion', notionExport);

    // Directory handlers
    const directoryImport = new DirectoryImportHandler(this.client);
    const directoryExport = new DirectoryExportHandler(this.client);
    this.importHandlers.set('directory', directoryImport);
    this.exportHandlers.set('directory', directoryExport);

    // Git sync handler
    const gitSync = new GitSyncHandler(this.client);
    this.syncHandlers.set('git', gitSync);
  }

  private createOperationContext(format: FormatType, operation: OperationType): OperationContext {
    return {
      operationId: randomUUID(),
      triliumUrl: this.client.getBaseUrl() || 'http://localhost:8080',
      apiToken: this.client.getApiToken() || '',
      workingDirectory: process.cwd(),
      tempDirectory: join(tmpdir(), `trilium-${operation}-${format}-${Date.now()}`),
      logLevel: 'info',
    };
  }

  /**
   * Import from Obsidian vault
   */
  async importObsidian(config: ObsidianConfig, onProgress?: ProgressCallback): Promise<ImportResult> {
    const handler = this.importHandlers.get('obsidian');
    if (!handler) {
      throw new ImportExportError('Obsidian import handler not found', 'HANDLER_NOT_FOUND');
    }

    const context = this.createOperationContext('obsidian', 'import');
    
    await handler.validate(config);
    const files = await handler.scan(config, context);
    return await handler.import(files, config, context, onProgress);
  }

  /**
   * Export to Obsidian vault
   */
  async exportObsidian(noteIds: string[], config: ObsidianConfig, onProgress?: ProgressCallback): Promise<ExportResult> {
    const handler = this.exportHandlers.get('obsidian');
    if (!handler) {
      throw new ImportExportError('Obsidian export handler not found', 'HANDLER_NOT_FOUND');
    }

    const context = this.createOperationContext('obsidian', 'export');
    
    await handler.validate(config);
    return await handler.export(noteIds, config, context, onProgress);
  }

  /**
   * Import from Notion ZIP export
   */
  async importNotion(config: NotionConfig, onProgress?: ProgressCallback): Promise<ImportResult> {
    const handler = this.importHandlers.get('notion');
    if (!handler) {
      throw new ImportExportError('Notion import handler not found', 'HANDLER_NOT_FOUND');
    }

    const context = this.createOperationContext('notion', 'import');
    
    await handler.validate(config);
    const files = await handler.scan(config, context);
    return await handler.import(files, config, context, onProgress);
  }

  /**
   * Export to Notion format
   */
  async exportNotion(noteIds: string[], config: NotionConfig, onProgress?: ProgressCallback): Promise<ExportResult> {
    const handler = this.exportHandlers.get('notion');
    if (!handler) {
      throw new ImportExportError('Notion export handler not found', 'HANDLER_NOT_FOUND');
    }

    const context = this.createOperationContext('notion', 'export');
    
    await handler.validate(config);
    return await handler.export(noteIds, config, context, onProgress);
  }

  /**
   * Import from directory
   */
  async importDirectory(config: DirectoryConfig, onProgress?: ProgressCallback): Promise<ImportResult> {
    const handler = this.importHandlers.get('directory');
    if (!handler) {
      throw new ImportExportError('Directory import handler not found', 'HANDLER_NOT_FOUND');
    }

    const context = this.createOperationContext('directory', 'import');
    
    await handler.validate(config);
    const files = await handler.scan(config, context);
    return await handler.import(files, config, context, onProgress);
  }

  /**
   * Export to directory
   */
  async exportDirectory(noteIds: string[], config: DirectoryConfig, onProgress?: ProgressCallback): Promise<ExportResult> {
    const handler = this.exportHandlers.get('directory');
    if (!handler) {
      throw new ImportExportError('Directory export handler not found', 'HANDLER_NOT_FOUND');
    }

    const context = this.createOperationContext('directory', 'export');
    
    await handler.validate(config);
    return await handler.export(noteIds, config, context, onProgress);
  }

  /**
   * Git repository synchronization
   */
  async syncGit(config: GitConfig, onProgress?: ProgressCallback): Promise<GitSyncResult> {
    const handler = this.syncHandlers.get('git');
    if (!handler) {
      throw new ImportExportError('Git sync handler not found', 'HANDLER_NOT_FOUND');
    }

    const context = this.createOperationContext('git', 'sync');
    
    await handler.validate(config);
    return await handler.sync(config, context, onProgress);
  }

  /**
   * Get available import formats
   */
  getImportFormats(): FormatType[] {
    return Array.from(this.importHandlers.keys());
  }

  /**
   * Get available export formats
   */
  getExportFormats(): FormatType[] {
    return Array.from(this.exportHandlers.keys());
  }

  /**
   * Get available sync formats
   */
  getSyncFormats(): FormatType[] {
    return Array.from(this.syncHandlers.keys());
  }

  /**
   * Scan files for a given format without importing
   */
  async scanFiles(format: FormatType, config: ImportExportConfig): Promise<any[]> {
    const handler = this.importHandlers.get(format);
    if (!handler) {
      throw new ImportExportError(`Import handler not found for format: ${format}`, 'HANDLER_NOT_FOUND');
    }

    const context = this.createOperationContext(format, 'import');
    
    await handler.validate(config as any);
    return await handler.scan(config as any, context);
  }

  /**
   * Plan export for a given format without exporting
   */
  async planExport(format: FormatType, noteIds: string[], config: ImportExportConfig): Promise<any[]> {
    const handler = this.exportHandlers.get(format);
    if (!handler) {
      throw new ImportExportError(`Export handler not found for format: ${format}`, 'HANDLER_NOT_FOUND');
    }

    const context = this.createOperationContext(format, 'export');
    
    await handler.validate(config as any);
    return await handler.plan(noteIds, config as any, context);
  }
}

// Convenience functions that create a manager instance

/**
 * Import from Obsidian vault
 */
export async function importObsidian(
  client: TriliumClient, 
  config: ObsidianConfig, 
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  const manager = new ImportExportManager(client);
  return manager.importObsidian(config, onProgress);
}

/**
 * Export to Obsidian vault
 */
export async function exportObsidian(
  client: TriliumClient,
  noteIds: string[],
  config: ObsidianConfig,
  onProgress?: ProgressCallback
): Promise<ExportResult> {
  const manager = new ImportExportManager(client);
  return manager.exportObsidian(noteIds, config, onProgress);
}

/**
 * Import from Notion ZIP
 */
export async function importNotion(
  client: TriliumClient,
  config: NotionConfig,
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  const manager = new ImportExportManager(client);
  return manager.importNotion(config, onProgress);
}

/**
 * Export to Notion format
 */
export async function exportNotion(
  client: TriliumClient,
  noteIds: string[],
  config: NotionConfig,
  onProgress?: ProgressCallback
): Promise<ExportResult> {
  const manager = new ImportExportManager(client);
  return manager.exportNotion(noteIds, config, onProgress);
}

/**
 * Import from directory
 */
export async function importDirectory(
  client: TriliumClient,
  config: DirectoryConfig,
  onProgress?: ProgressCallback
): Promise<ImportResult> {
  const manager = new ImportExportManager(client);
  return manager.importDirectory(config, onProgress);
}

/**
 * Export to directory
 */
export async function exportDirectory(
  client: TriliumClient,
  noteIds: string[],
  config: DirectoryConfig,
  onProgress?: ProgressCallback
): Promise<ExportResult> {
  const manager = new ImportExportManager(client);
  return manager.exportDirectory(noteIds, config, onProgress);
}

/**
 * Git repository synchronization
 */
export async function syncGit(
  client: TriliumClient,
  config: GitConfig,
  onProgress?: ProgressCallback
): Promise<GitSyncResult> {
  const manager = new ImportExportManager(client);
  return manager.syncGit(config, onProgress);
}

// Re-export types and utilities for convenience
export * from './types.js';
export * from './utils.js';

// Re-export format handlers for advanced usage
export { ObsidianImportHandler, ObsidianExportHandler } from './formats/obsidian.js';
export { NotionImportHandler, NotionExportHandler } from './formats/notion.js';
export { DirectoryImportHandler, DirectoryExportHandler } from './formats/directory.js';
export { GitSyncHandler } from './formats/git.js';