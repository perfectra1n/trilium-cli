import { readFile } from 'fs/promises';
import { join, relative, dirname, basename, extname } from 'path';

import matter from 'gray-matter';

import type { TriliumClient } from '../../api/client.js';
import type { NoteType, MimeType, NoteWithContent } from '../../types/api.js';
import type {
  ImportHandler,
  ExportHandler,
  ObsidianConfig,
  FileInfo,
  ContentInfo,
  ImportResult,
  ExportResult,
  OperationContext,
  ProgressCallback,
  FileResult,
} from '../types.js';
import {
  ImportExportError,
  validateConfig,
  ObsidianConfigSchema,
  createProgressTracker,
} from '../types.js';
import {
  scanFiles,
  parseContent,
  formatContent,
  writeTextFile,
  copyFile,
  ensureDirectory,
  ErrorCollector,
  createBatchProgressTracker,
  sanitizeFileName,
  generateUniqueFileName,
} from '../utils.js';

/**
 * Obsidian vault import handler
 */
export class ObsidianImportHandler implements ImportHandler<ObsidianConfig> {
  name = 'obsidian-import';
  format = 'obsidian' as const;

  constructor(private client: TriliumClient) {}

  async validate(config: ObsidianConfig): Promise<void> {
    validateConfig(ObsidianConfigSchema, config);
    
    // Check if vault path exists and is accessible
    try {
      const { stat } = await import('fs/promises');
      const stats = await stat(config.vaultPath);
      if (!stats.isDirectory()) {
        throw new ImportExportError(
          `Vault path is not a directory: ${config.vaultPath}`,
          'INVALID_VAULT_PATH'
        );
      }
    } catch (error) {
      throw new ImportExportError(
        `Cannot access vault path: ${config.vaultPath}`,
        'VAULT_ACCESS_ERROR',
        { path: config.vaultPath, error }
      );
    }
  }

  async scan(config: ObsidianConfig, context: OperationContext): Promise<FileInfo[]> {
    const patterns = [
      '**/*.md',
      ...config.imageFormats.map(ext => `**/*.${ext}`),
      ...config.documentFormats.map(ext => `**/*.${ext}`),
      ...config.audioFormats.map(ext => `**/*.${ext}`),
      ...config.videoFormats.map(ext => `**/*.${ext}`),
    ];

    const excludePatterns = [
      ...config.ignoreFolders.map(folder => `${folder}/**`),
      ...config.excludePatterns,
    ];

    const files = await scanFiles(config.vaultPath, {
      patterns,
      excludePatterns,
      maxDepth: config.maxDepth,
      includeHidden: false,
    });

    // Filter and enrich file information
    const enrichedFiles: FileInfo[] = [];
    
    for (const file of files) {
      try {
        // Skip template files if not including them
        if (!config.includeTemplates && 
            file.path.startsWith(config.templatesFolder + '/')) {
          continue;
        }

        // Add Obsidian-specific metadata
        const metadata = await this.extractObsidianMetadata(file, config);
        
        enrichedFiles.push({
          ...file,
          metadata: {
            ...file.metadata,
            ...metadata,
          },
        });
      } catch (error) {
        console.warn(`Warning: Could not process file ${file.path}:`, error);
      }
    }

    return enrichedFiles;
  }

  async import(
    files: FileInfo[],
    config: ObsidianConfig,
    context: OperationContext,
    onProgress?: ProgressCallback
  ): Promise<ImportResult> {
    const startTime = new Date();
    const errors = new ErrorCollector();
    const results: FileResult[] = [];
    const created: string[] = [];
    const updated: string[] = [];
    const attachments: string[] = [];

    const progress = createProgressTracker(context.operationId, files.length, onProgress);
    await progress.start('Starting Obsidian import');

    if (config.dryRun) {
      await progress.complete('Dry run completed - no changes made');
      
      return {
        summary: {
          operation: 'import',
          format: 'obsidian',
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
          totalFiles: files.length,
          processedFiles: files.length,
          successfulFiles: files.length,
          failedFiles: 0,
          skippedFiles: 0,
          totalSize: files.reduce((sum, f) => sum + f.size, 0),
          processedSize: files.reduce((sum, f) => sum + f.size, 0),
          errors: [],
          warnings: [],
        },
        files: files.map(file => ({
          file,
          success: true,
          skipped: false,
          reason: 'Dry run - would import',
        })),
        created: [],
        updated: [],
        attachments: [],
        warnings: [],
        config,
      };
    }

    // Group files by type
    const markdownFiles = files.filter(f => f.extension === 'md');
    const attachmentFiles = files.filter(f => f.extension !== 'md');

    // Process markdown files first to establish note hierarchy
    const noteIdMap = new Map<string, string>(); // path -> noteId
    
    for (let i = 0; i < markdownFiles.length; i++) {
      const file = markdownFiles[i];
      if (!file) continue;
      
      try {
        const result = await this.importMarkdownFile(file, config, context, noteIdMap);
        results.push(result);
        
        if (result.success && result.ownerId) {
          noteIdMap.set(file.path, result.ownerId);
          created.push(result.ownerId);
        }

        await progress.progress(i + 1, `Imported markdown: ${file.name}`);
      } catch (error) {
        const errorResult: FileResult = {
          file,
          success: false,
          error: error instanceof ImportExportError ? error.toJSON() : {
            code: 'IMPORT_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
          },
          skipped: false,
        };
        
        results.push(errorResult);
        errors.addError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Process attachments
    for (let i = 0; i < attachmentFiles.length; i++) {
      const file = attachmentFiles[i];
      if (!file) continue;
      
      try {
        const result = await this.importAttachmentFile(file, config, context, noteIdMap);
        results.push(result);
        
        if (result.success && result.ownerId) {
          attachments.push(result.ownerId);
        }

        await progress.progress(markdownFiles.length + i + 1, `Imported attachment: ${file.name}`);
      } catch (error) {
        const errorResult: FileResult = {
          file,
          success: false,
          error: error instanceof ImportExportError ? error.toJSON() : {
            code: 'IMPORT_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
          },
          skipped: false,
        };
        
        results.push(errorResult);
        errors.addError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Post-process: resolve wikilinks and update references
    if (config.convertWikilinks) {
      await this.resolveWikilinks(noteIdMap, config, context);
    }

    const endTime = new Date();
    const successful = results.filter(r => r.success).length;

    await progress.complete(`Import completed: ${successful}/${files.length} files processed`);

    return {
      summary: {
        operation: 'import',
        format: 'obsidian',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        totalFiles: files.length,
        processedFiles: files.length,
        successfulFiles: successful,
        failedFiles: files.length - successful,
        skippedFiles: 0,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        processedSize: results.filter(r => r.success).reduce((sum, r) => sum + r.file.size, 0),
        errors: errors.getErrors(),
        warnings: errors.getWarnings(),
      },
      files: results,
      created,
      updated,
      attachments,
      warnings: errors.getWarnings(),
      config,
    };
  }

  private async extractObsidianMetadata(file: FileInfo, config: ObsidianConfig): Promise<Record<string, any>> {
    const metadata: Record<string, any> = {
      isMarkdown: file.extension === 'md',
      isAttachment: file.extension !== 'md',
      isTemplate: file.path.startsWith(config.templatesFolder + '/'),
      isDailyNote: file.path.startsWith(config.dailyNotesFolder + '/'),
      folderPath: dirname(file.path),
    };

    if (file.extension === 'md') {
      try {
        const content = await readFile(file.fullPath, 'utf8');
        const parsed = matter(content);
        
        metadata.hasYamlFrontMatter = parsed.matter !== '';
        metadata.frontMatter = parsed.data;
        
        // Count wikilinks and markdown links
        const wikiLinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
        const mdLinks = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
        
        metadata.wikilinkCount = wikiLinks.length;
        metadata.markdownLinkCount = mdLinks.length;
        metadata.hasWikilinks = wikiLinks.length > 0;
        
        // Count embeds and attachments
        const embeds = content.match(/!\[\[([^\]]+)\]\]/g) || [];
        const images = content.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [];
        
        metadata.embedCount = embeds.length;
        metadata.imageCount = images.length;
        
        // Check for special Obsidian syntax
        metadata.hasTags = /#[\w-]+/.test(content);
        metadata.hasCallouts = /> \[![\w-]+\]/.test(content);
        metadata.hasDataview = /```dataview/.test(content);
        
      } catch (error) {
        console.warn(`Could not read markdown metadata for ${file.path}:`, error);
      }
    }

    return metadata;
  }

  private async importMarkdownFile(
    file: FileInfo,
    config: ObsidianConfig,
    context: OperationContext,
    noteIdMap: Map<string, string>
  ): Promise<FileResult> {
    try {
      // Read and parse content
      const rawContent = await readFile(file.fullPath, 'utf8');
      const contentInfo = await parseContent(rawContent, file);

      // Determine parent note
      const parentNoteId = await this.determineParentNote(file, config, context, noteIdMap);

      // Create note data
      const noteData = {
        title: contentInfo.title || file.name.replace(/\.md$/, ''),
        content: config.processFrontMatter ? contentInfo.content : rawContent,
        type: 'text',
        mime: 'text/html', // Trilium expects HTML
        attributes: this.createNoteAttributes(contentInfo, file, config),
      };

      // Convert content if needed
      if (config.processFrontMatter && contentInfo.type === 'markdown') {
        // Convert markdown to HTML for Trilium
        noteData.content = await this.convertMarkdownToHtml(contentInfo.content || '', config);
      }

      // Create or update note
      let noteId: string;
      const existingNote = await this.findExistingNote(file, config, context);
      
      if (existingNote && config.duplicateHandling === 'overwrite') {
        // Update note metadata only (title, type, mime, isProtected)
        const updateData = {
          title: noteData.title,
          type: noteData.type as 'text',
          mime: noteData.mime as 'text/html',
        };
        const updatedNote = await this.client.updateNote(existingNote.ownerId, updateData);
        noteId = updatedNote.noteId;
        
        // Update content separately
        if (noteData.content) {
          await this.client.updateNoteContent(noteId, noteData.content);
        }
      } else if (existingNote && config.duplicateHandling === 'skip') {
        return {
          file,
          ownerId: existingNote.ownerId,
          success: true,
          skipped: true,
          reason: 'Note already exists and duplicate handling is set to skip',
        };
      } else {
        const createdNote = await this.client.createNote({
          parentNoteId: parentNoteId || 'root',
          title: noteData.title,
          content: noteData.content || '',
          type: noteData.type as 'text',
          mime: noteData.mime as 'text/html',
        });
        noteId = createdNote.note.noteId;
      }

      return {
        file,
        ownerId: noteId,
        success: true,
        skipped: false,
        metadata: {
          parentNoteId,
          hasWikilinks: contentInfo.metadata?.hasWikilinks || false,
          linkCount: contentInfo.links?.length || 0,
          attachmentCount: contentInfo.attachments?.length || 0,
        },
      };

    } catch (error) {
      throw new ImportExportError(
        `Failed to import markdown file: ${file.path}`,
        'MARKDOWN_IMPORT_ERROR',
        { file: file.path, error }
      );
    }
  }

  private async importAttachmentFile(
    file: FileInfo,
    config: ObsidianConfig,
    context: OperationContext,
    noteIdMap: Map<string, string>
  ): Promise<FileResult> {
    try {
      // Find parent note (usually the note that references this attachment)
      const parentNoteId = await this.findAttachmentParent(file, config, noteIdMap);

      // Create attachment
      const attachmentData = await readFile(file.fullPath);
      const attachment = await this.client.createAttachment({
        ownerId: parentNoteId || 'root',
        title: file.name,
        content: attachmentData.toString('base64'),
        role: 'attachment',
        mime: file.mimeType || 'application/octet-stream',
      });

      return {
        file,
        ownerId: attachment.attachmentId,
        success: true,
        skipped: false,
        metadata: {
          parentNoteId,
          attachmentId: attachment.attachmentId,
        },
      };

    } catch (error) {
      throw new ImportExportError(
        `Failed to import attachment: ${file.path}`,
        'ATTACHMENT_IMPORT_ERROR',
        { file: file.path, error }
      );
    }
  }

  private async determineParentNote(
    file: FileInfo,
    config: ObsidianConfig,
    context: OperationContext,
    noteIdMap: Map<string, string>
  ): Promise<string | undefined> {
    if (!config.preserveFolderStructure) {
      return undefined; // Use default parent
    }

    const folderPath = dirname(file.path);
    if (folderPath === '.' || folderPath === '') {
      return undefined; // Root level
    }

    // Try to find or create parent folder note
    const folderNote = noteIdMap.get(folderPath);
    if (folderNote) {
      return folderNote;
    }

    // Create folder note if createMissingParents is enabled
    if (config.createMissingParents) {
      try {
        const folderNote = await this.client.createNote({
          title: basename(folderPath),
          content: `# ${basename(folderPath)}\n\nFolder imported from Obsidian vault.`,
          type: 'text',
          mime: 'text/html',
          parentNoteId: 'root', // TODO: Handle nested folders
        });

        noteIdMap.set(folderPath, folderNote.note.noteId);
        return folderNote.note.noteId;
      } catch (error) {
        console.warn(`Could not create folder note for ${folderPath}:`, error);
      }
    }

    return undefined;
  }

  private createNoteAttributes(
    contentInfo: ContentInfo,
    file: FileInfo,
    config: ObsidianConfig
  ): Array<{ type: string; name: string; value: string }> {
    const attributes = [];

    // Add tags from front matter and content
    if (contentInfo.tags) {
      for (const tag of contentInfo.tags) {
        attributes.push({
          type: 'label',
          name: 'tag',
          value: tag,
        });
      }
    }

    // Add front matter as attributes
    if (contentInfo.frontMatter) {
      for (const [key, value] of Object.entries(contentInfo.frontMatter)) {
        if (key !== 'title' && key !== 'tags') {
          attributes.push({
            type: 'label',
            name: `obsidian-${key}`,
            value: String(value),
          });
        }
      }
    }

    // Add source information
    attributes.push({
      type: 'label',
      name: 'source',
      value: 'obsidian',
    });

    attributes.push({
      type: 'label',
      name: 'original-path',
      value: file.path,
    });

    return attributes;
  }

  private async convertMarkdownToHtml(markdown: string, config: ObsidianConfig): Promise<string> {
    // For now, return markdown as-is since Trilium can handle it
    // In the future, this could use a markdown parser to convert to HTML
    return markdown;
  }

  private async findExistingNote(
    file: FileInfo,
    config: ObsidianConfig,
    context: OperationContext
  ): Promise<{ ownerId: string } | null> {
    // Search for existing note by original path attribute
    try {
      const searchResults = await this.client.searchNotes(`#original-path = "${file.path}"`);
      if (searchResults && searchResults.length > 0 && searchResults[0]) {
        return { ownerId: searchResults[0].noteId };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private async findAttachmentParent(
    file: FileInfo,
    config: ObsidianConfig,
    noteIdMap: Map<string, string>
  ): Promise<string | undefined> {
    // Try to find the note that references this attachment
    const fileName = file.name;
    const fileNameWithoutExt = basename(fileName, extname(fileName));

    for (const [notePath, noteId] of noteIdMap) {
      if (notePath.endsWith('.md')) {
        try {
          // Check if the note references this attachment
          const note = await this.client.getNote(noteId);
          if (note) {
            const noteContent = await this.client.getNoteContent(noteId);
            if (noteContent) {
              const hasReference = 
                noteContent.includes(`[[${fileName}]]`) ||
                noteContent.includes(`[[${fileNameWithoutExt}]]`) ||
                noteContent.includes(`](${fileName})`) ||
                noteContent.includes(`](${file.path})`);

              if (hasReference) {
                return noteId;
              }
            }
          }
        } catch (error) {
          console.warn(`Could not check attachment reference in ${notePath}:`, error);
        }
      }
    }

    return undefined;
  }

  private async resolveWikilinks(
    noteIdMap: Map<string, string>,
    config: ObsidianConfig,
    context: OperationContext
  ): Promise<void> {
    // Post-process notes to convert wikilinks to Trilium links
    for (const [notePath, noteId] of noteIdMap) {
      try {
        const note = await this.client.getNote(noteId);
        if (!note) continue;
        
        const noteContent = await this.client.getNoteContent(noteId);
        if (!noteContent) continue;

        let updatedContent = noteContent;
        let hasChanges = false;

        // Find all wikilinks
        const wikilinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
        let match;

        while ((match = wikilinkRegex.exec(noteContent)) !== null) {
          const [fullMatch, linkTarget, linkText] = match;
          if (!linkTarget) continue;
          
          const displayText = linkText || linkTarget;

          // Try to find the target note
          const targetNoteId = this.findWikilinkTarget(linkTarget, noteIdMap);
          
          if (targetNoteId) {
            // Convert to Trilium link
            const triliumLink = `<a href="#root/${targetNoteId}">${displayText}</a>`;
            updatedContent = updatedContent.replace(fullMatch, triliumLink);
            hasChanges = true;
          }
        }

        // Update note if changes were made
        if (hasChanges) {
          await this.client.updateNoteContent(noteId, updatedContent);
        }

      } catch (error) {
        console.warn(`Could not resolve wikilinks in ${notePath}:`, error);
      }
    }
  }

  private findWikilinkTarget(linkTarget: string, noteIdMap: Map<string, string>): string | null {
    // Try exact match first
    const exactMatch = noteIdMap.get(linkTarget + '.md');
    if (exactMatch) return exactMatch;

    // Try fuzzy matching
    for (const [path, noteId] of noteIdMap) {
      const noteName = basename(path, '.md');
      if (noteName === linkTarget || noteName.toLowerCase() === linkTarget.toLowerCase()) {
        return noteId;
      }
    }

    return null;
  }
}

/**
 * Obsidian vault export handler
 */
export class ObsidianExportHandler implements ExportHandler<ObsidianConfig> {
  name = 'obsidian-export';
  format = 'obsidian' as const;

  constructor(private client: TriliumClient) {}

  async validate(config: ObsidianConfig): Promise<void> {
    validateConfig(ObsidianConfigSchema, config);
  }

  async plan(
    noteIds: string[],
    config: ObsidianConfig,
    context: OperationContext
  ): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    for (const noteId of noteIds) {
      try {
        const note = await this.client.getNoteWithContent(noteId);
        if (!note) continue;

        // Plan note export
        const fileName = sanitizeFileName(note.title) + '.md';
        const outputPath = join(config.vaultPath, fileName);

        files.push({
          path: fileName,
          fullPath: outputPath,
          relativePath: fileName,
          name: fileName,
          extension: 'md',
          size: (note.content || '').length,
          depth: 0,
          metadata: {
            noteId,
            noteTitle: note.title,
            noteType: note.type,
          },
        });

        // Plan attachment exports
        const attachments = await this.client.getNoteAttachments(noteId);
        for (const attachment of attachments) {
          const attachmentFileName = sanitizeFileName(attachment.title);
          const attachmentPath = join(config.attachmentFolder, attachmentFileName);
          const attachmentOutputPath = join(config.vaultPath, attachmentPath);

          files.push({
            path: attachmentPath,
            fullPath: attachmentOutputPath,
            relativePath: attachmentPath,
            name: attachmentFileName,
            extension: extname(attachmentFileName).substring(1),
            size: attachment.contentLength || 0,
            depth: 1,
            metadata: {
              attachmentId: attachment.attachmentId,
              parentNoteId: noteId,
              isAttachment: true,
            },
          });
        }

        // Plan descendant notes (using child notes for now)
        const childNoteIds = note.childNoteIds || [];
        for (const childNoteId of childNoteIds) {
          const descendant = await this.client.getNote(childNoteId);
          if (!descendant) continue;
          
          const descendantContent = await this.client.getNoteContent(childNoteId);
          const descendantFileName = sanitizeFileName(descendant.title) + '.md';
          const descendantPath = config.preserveFolderStructure 
            ? join(sanitizeFileName(note.title), descendantFileName)
            : descendantFileName;
          const descendantOutputPath = join(config.vaultPath, descendantPath);

          files.push({
            path: descendantPath,
            fullPath: descendantOutputPath,
            relativePath: descendantPath,
            name: descendantFileName,
            extension: 'md',
            size: (descendantContent || '').length,
            depth: config.preserveFolderStructure ? 1 : 0,
            metadata: {
              ownerId: descendant.noteId,
              noteTitle: descendant.title,
              noteType: descendant.type,
              parentNoteId: noteId,
            },
          });
        }

      } catch (error) {
        console.warn(`Could not plan export for note ${noteId}:`, error);
      }
    }

    return files;
  }

  async export(
    noteIds: string[],
    config: ObsidianConfig,
    context: OperationContext,
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    const startTime = new Date();
    const errors = new ErrorCollector();
    const results: FileResult[] = [];
    const exported: string[] = [];
    const attachmentPaths: string[] = [];

    // Plan the export
    const plannedFiles = await this.plan(noteIds, config, context);
    
    const progress = createProgressTracker(context.operationId, plannedFiles.length, onProgress);
    await progress.start('Starting Obsidian export');

    if (config.dryRun) {
      await progress.complete('Dry run completed - no changes made');
      
      return {
        summary: {
          operation: 'export',
          format: 'obsidian',
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
          totalFiles: plannedFiles.length,
          processedFiles: plannedFiles.length,
          successfulFiles: plannedFiles.length,
          failedFiles: 0,
          skippedFiles: 0,
          totalSize: plannedFiles.reduce((sum, f) => sum + f.size, 0),
          processedSize: plannedFiles.reduce((sum, f) => sum + f.size, 0),
          errors: [],
          warnings: [],
        },
        files: plannedFiles.map(file => ({
          file,
          success: true,
          skipped: false,
          reason: 'Dry run - would export',
        })),
        outputPath: config.vaultPath,
        exported: [],
        attachments: [],
        warnings: [],
        config,
      };
    }

    // Ensure output directory exists
    await ensureDirectory(config.vaultPath);
    await ensureDirectory(join(config.vaultPath, config.attachmentFolder));

    // Process each planned file
    for (let i = 0; i < plannedFiles.length; i++) {
      const file = plannedFiles[i];
      if (!file) continue;
      
      try {
        const result = await this.exportFile(file, config, context);
        results.push(result);
        
        if (result.success) {
          if (file.metadata?.isAttachment) {
            attachmentPaths.push(file.path);
          } else {
            exported.push(file.metadata?.noteId || file.path);
          }
        }

        await progress.progress(i + 1, `Exported: ${file.name}`);
      } catch (error) {
        const errorResult: FileResult = {
          file,
          success: false,
          error: error instanceof ImportExportError ? error.toJSON() : {
            code: 'EXPORT_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
          },
          skipped: false,
        };
        
        results.push(errorResult);
        errors.addError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    const endTime = new Date();
    const successful = results.filter(r => r.success).length;

    await progress.complete(`Export completed: ${successful}/${plannedFiles.length} files processed`);

    return {
      summary: {
        operation: 'export',
        format: 'obsidian',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        totalFiles: plannedFiles.length,
        processedFiles: plannedFiles.length,
        successfulFiles: successful,
        failedFiles: plannedFiles.length - successful,
        skippedFiles: 0,
        totalSize: plannedFiles.reduce((sum, f) => sum + f.size, 0),
        processedSize: results.filter(r => r.success).reduce((sum, r) => sum + r.file.size, 0),
        errors: errors.getErrors(),
        warnings: errors.getWarnings(),
      },
      files: results,
      outputPath: config.vaultPath,
      exported,
      attachments: attachmentPaths,
      warnings: errors.getWarnings(),
      config,
    };
  }

  private async exportFile(
    file: FileInfo,
    config: ObsidianConfig,
    context: OperationContext
  ): Promise<FileResult> {
    try {
      if (file.metadata?.isAttachment) {
        return await this.exportAttachment(file, config, context);
      } else {
        return await this.exportNote(file, config, context);
      }
    } catch (error) {
      throw new ImportExportError(
        `Failed to export file: ${file.path}`,
        'FILE_EXPORT_ERROR',
        { file: file.path, error }
      );
    }
  }

  private async exportNote(
    file: FileInfo,
    config: ObsidianConfig,
    context: OperationContext
  ): Promise<FileResult> {
    const noteId = file.metadata?.noteId;
    if (!noteId) {
      throw new ImportExportError(
        'Note ID not found in file metadata',
        'MISSING_NOTE_ID'
      );
    }

    // Get note data
    const note = await this.client.getNote(noteId);
    if (!note) {
      throw new ImportExportError(
        `Note not found: ${noteId}`,
        'NOTE_NOT_FOUND',
        { noteId }
      );
    }

    // Get note attributes
    const attributes = await this.client.getNoteAttributes(noteId);

    // Convert to Obsidian format
    const obsidianContent = await this.convertToObsidianFormat(note, attributes, config);

    // Write file
    await writeTextFile(file.fullPath, obsidianContent);

    return {
      file,
      ownerId: noteId,
      success: true,
      skipped: false,
      metadata: {
        noteTitle: note.title,
        contentLength: obsidianContent.length,
      },
    };
  }

  private async exportAttachment(
    file: FileInfo,
    config: ObsidianConfig,
    context: OperationContext
  ): Promise<FileResult> {
    const attachmentId = file.metadata?.attachmentId;
    if (!attachmentId) {
      throw new ImportExportError(
        'Attachment ID not found in file metadata',
        'MISSING_ATTACHMENT_ID'
      );
    }

    // Get attachment data
    const attachmentData = await this.client.getAttachmentContent(attachmentId);
    if (!attachmentData) {
      throw new ImportExportError(
        `Attachment not found: ${attachmentId}`,
        'ATTACHMENT_NOT_FOUND',
        { attachmentId }
      );
    }

    // Write attachment file
    await writeTextFile(file.fullPath, attachmentData, 'binary' as any);

    return {
      file,
      ownerId: attachmentId,
      success: true,
      skipped: false,
      metadata: {
        attachmentId,
        fileSize: attachmentData.length,
      },
    };
  }

  private async convertToObsidianFormat(
    note: any,
    attributes: any[],
    config: ObsidianConfig
  ): Promise<string> {
    let content = '';

    // Build front matter
    const frontMatter: Record<string, any> = {};
    
    // Add note attributes to front matter
    for (const attr of attributes) {
      if (attr.name.startsWith('obsidian-')) {
        frontMatter[attr.name.substring(9)] = attr.value;
      } else if (attr.name === 'tag') {
        if (!frontMatter.tags) frontMatter.tags = [];
        frontMatter.tags.push(attr.value);
      }
    }

    // Add creation date
    if (note.dateCreated) {
      frontMatter.created = note.dateCreated;
    }

    if (note.dateModified) {
      frontMatter.modified = note.dateModified;
    }

    // Write front matter if present
    if (Object.keys(frontMatter).length > 0) {
      content += '---\n';
      for (const [key, value] of Object.entries(frontMatter)) {
        if (Array.isArray(value)) {
          content += `${key}: [${value.map(v => `"${v}"`).join(', ')}]\n`;
        } else {
          content += `${key}: ${JSON.stringify(value)}\n`;
        }
      }
      content += '---\n\n';
    }

    // Add title if not already in content
    if (!note.content?.startsWith('#') && !note.content?.includes(`# ${note.title}`)) {
      content += `# ${note.title}\n\n`;
    }

    // Add note content
    if (note.content) {
      // Convert Trilium links back to wikilinks if configured
      let processedContent = note.content;
      
      if (config.preserveWikilinks) {
        processedContent = this.convertTriliumLinksToWikilinks(processedContent);
      }

      content += processedContent;
    }

    return content;
  }

  private convertTriliumLinksToWikilinks(content: string): string {
    // Convert Trilium internal links back to wikilinks
    const triliumLinkRegex = /<a href="#root\/([^"]+)"[^>]*>([^<]+)<\/a>/g;
    
    return content.replace(triliumLinkRegex, (match, noteId, linkText) => {
      // For now, just use the link text as wikilink
      // In a more sophisticated implementation, we'd resolve the note ID to note title
      return `[[${linkText}]]`;
    });
  }
}