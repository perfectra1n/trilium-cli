import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, relative, dirname, basename, extname, resolve } from 'path';

import type { TriliumClient } from '../../api/client.js';
import type {
  ImportHandler,
  ExportHandler,
  DirectoryConfig,
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
  DirectoryConfigSchema,
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
  detectContentType,
  sanitizeFileName,
  generateUniqueFileName,
} from '../utils.js';

/**
 * Directory import handler
 */
export class DirectoryImportHandler implements ImportHandler<DirectoryConfig> {
  name = 'directory-import';
  format = 'directory' as const;

  constructor(private client: TriliumClient) {}

  async validate(config: DirectoryConfig): Promise<void> {
    validateConfig(DirectoryConfigSchema, config);
    
    // Check if source path exists and is accessible
    try {
      const { stat } = await import('fs/promises');
      const stats = await stat(config.sourcePath);
      if (!stats.isDirectory()) {
        throw new ImportExportError(
          `Source path is not a directory: ${config.sourcePath}`,
          'INVALID_SOURCE_PATH'
        );
      }
    } catch (error) {
      throw new ImportExportError(
        `Cannot access source path: ${config.sourcePath}`,
        'SOURCE_PATH_ACCESS_ERROR',
        { path: config.sourcePath, error }
      );
    }
  }

  async scan(config: DirectoryConfig, context: OperationContext): Promise<FileInfo[]> {
    const files = await scanFiles(config.sourcePath, {
      patterns: config.filePatterns,
      excludePatterns: config.ignorePatterns,
      maxDepth: config.maxDepth,
      includeHidden: false,
    });

    // Enrich files with content type detection
    const enrichedFiles: FileInfo[] = [];
    
    for (const file of files) {
      try {
        // Detect content type if enabled
        let contentType = detectContentType(file);
        let metadata = { ...file.metadata };

        if (config.detectFormat && file.extension !== 'md') {
          // Try to read a sample of the file to detect format
          try {
            const sampleContent = await this.readFileSample(file.fullPath, 1024);
            contentType = this.detectAdvancedContentType(sampleContent, file);
            metadata.detectedType = contentType;
            metadata.hasTextContent = this.isTextContent(sampleContent);
          } catch (error) {
            console.warn(`Warning: Could not read sample from ${file.path}:`, error);
          }
        }

        // Extract additional metadata based on content type
        if (contentType === 'markdown' && file.extension === 'md') {
          try {
            const content = await readFile(file.fullPath, 'utf8');
            const contentInfo = await parseContent(content, file);
            
            metadata = {
              ...metadata,
              hasYamlFrontMatter: !!contentInfo.frontMatter && Object.keys(contentInfo.frontMatter).length > 0,
              linkCount: contentInfo.links?.length || 0,
              attachmentCount: contentInfo.attachments?.length || 0,
              tagCount: contentInfo.tags?.length || 0,
              wordCount: content.split(/\s+/).length,
              lineCount: content.split('\n').length,
            };
          } catch (error) {
            console.warn(`Warning: Could not parse markdown content from ${file.path}:`, error);
          }
        }

        enrichedFiles.push({
          ...file,
          metadata: {
            ...metadata,
            contentType,
            directoryPath: dirname(relative(config.sourcePath, file.fullPath)),
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
    config: DirectoryConfig,
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
    await progress.start('Starting directory import');

    if (config.dryRun) {
      await progress.complete('Dry run completed - no changes made');
      
      return this.createImportResult(
        startTime,
        files,
        results,
        created,
        updated,
        attachments,
        errors,
        config,
        true
      );
    }

    // Create directory structure mapping
    const directoryMap = new Map<string, string>(); // directory path -> note ID
    const noteIdMap = new Map<string, string>(); // file path -> note ID

    // Sort files by depth to ensure parents are created before children
    const sortedFiles = files.sort((a, b) => a.depth - b.depth);

    // Group files by directory to create folder notes first
    if (config.preserveStructure) {
      const directories = new Set<string>();
      for (const file of sortedFiles) {
        const dirPath = file.metadata?.directoryPath as string;
        if (dirPath && dirPath !== '.') {
          directories.add(dirPath);
          
          // Add parent directories too
          let parentDir = dirname(dirPath);
          while (parentDir !== '.' && parentDir !== '/' && parentDir !== '') {
            directories.add(parentDir);
            parentDir = dirname(parentDir);
          }
        }
      }

      // Create directory notes
      const sortedDirs = Array.from(directories).sort((a, b) => a.split('/').length - b.split('/').length);
      for (const dirPath of sortedDirs) {
        try {
          const dirNoteId = await this.createDirectoryNote(dirPath, config, context, directoryMap);
          directoryMap.set(dirPath, dirNoteId);
        } catch (error) {
          errors.addError(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }

    // Import files
    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      if (!file) continue;
      
      try {
        const result = await this.importFile(file, config, context, directoryMap, noteIdMap);
        results.push(result);
        
        if (result.success && (result as any).noteId) {
          noteIdMap.set(file.path, (result as any).noteId);
          
          if (file.metadata?.contentType === 'image' || 
              file.metadata?.contentType === 'document' ||
              !this.isTextFile(file)) {
            attachments.push((result as any).noteId);
          } else {
            created.push((result as any).noteId);
          }
        }

        await progress.progress(i + 1, `Imported: ${file?.name || 'file'}`);
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

    // Create index file if requested
    if (config.createIndex) {
      try {
        await this.createIndexFile(files, config, context, noteIdMap);
      } catch (error) {
        errors.addWarning(`Failed to create index file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const endTime = new Date();
    await progress.complete(`Import completed: ${results.filter(r => r.success).length}/${files.length} files processed`);

    return this.createImportResult(
      startTime,
      files,
      results,
      created,
      updated,
      attachments,
      errors,
      config,
      false
    );
  }

  private async readFileSample(filePath: string, maxBytes: number): Promise<string> {
    try {
      const { open } = await import('fs/promises');
      const file = await open(filePath, 'r');
      
      try {
        const buffer = Buffer.alloc(maxBytes);
        const { bytesRead } = await file.read(buffer, 0, maxBytes, 0);
        return buffer.subarray(0, bytesRead).toString('utf8');
      } finally {
        await file.close();
      }
    } catch (error) {
      throw new ImportExportError(
        `Failed to read file sample: ${filePath}`,
        'FILE_SAMPLE_READ_ERROR',
        { path: filePath, maxBytes, error }
      );
    }
  }

  private detectAdvancedContentType(content: string, file: FileInfo): ContentInfo['type'] {
    // JSON detection
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      try {
        JSON.parse(content);
        return 'json';
      } catch {
        // Not valid JSON
      }
    }

    // HTML detection
    if (content.includes('<!DOCTYPE') || content.includes('<html') || 
        /<[a-z][\s\S]*>/i.test(content)) {
      return 'html';
    }

    // Markdown detection (more thorough)
    if (content.includes('# ') || content.includes('## ') || 
        content.includes('---\n') || content.includes('```') ||
        /\[.*\]\(.*\)/.test(content) || /!\[.*\]\(.*\)/.test(content)) {
      return 'markdown';
    }

    // Default based on file extension
    return detectContentType(file);
  }

  private isTextContent(content: string): boolean {
    // Simple heuristic: check for null bytes and high ratio of printable characters
    if (content.includes('\0')) {
      return false;
    }

    const printableChars = content.replace(/[^\x20-\x7E\t\n\r]/g, '').length;
    const ratio = printableChars / content.length;
    return ratio > 0.8;
  }

  private isTextFile(file: FileInfo): boolean {
    const textExtensions = ['txt', 'md', 'html', 'json', 'xml', 'yaml', 'yml', 'csv', 'tsv', 'log'];
    return textExtensions.includes(file.extension.toLowerCase()) ||
           (file.mimeType && file.mimeType.startsWith('text/')) || false;
  }

  private async createDirectoryNote(
    dirPath: string,
    config: DirectoryConfig,
    context: OperationContext,
    directoryMap: Map<string, string>
  ): Promise<string> {
    const dirName = basename(dirPath);
    const parentDirPath = dirname(dirPath);
    
    let parentNoteId: string | undefined;
    if (parentDirPath !== '.' && parentDirPath !== '/' && parentDirPath !== '') {
      parentNoteId = directoryMap.get(parentDirPath);
    }

    // Check if directory note already exists
    const existingNote = await this.findExistingNote(dirPath, 'directory', config, context);
    if (existingNote && config.duplicateHandling === 'skip') {
      return (existingNote as any).noteId || existingNote.ownerId;
    }

    const noteData = {
      title: dirName,
      content: `<h1>${dirName}</h1>\n<p>Directory imported from: <code>${dirPath}</code></p>`,
      type: 'text',
      mime: 'text/html',
      attributes: [
        { type: 'label', name: 'source', value: 'directory' },
        { type: 'label', name: 'directory-path', value: dirPath },
        { type: 'label', name: 'type', value: 'folder' },
      ],
    };

    const note = await this.client.createNote({
      ...noteData,
      parentNoteId: parentNoteId || 'root',
      type: noteData.type as any, // Cast to fix type mismatch
    } as any);

    return (note as any).noteId || note.note.noteId;
  }

  private async importFile(
    file: FileInfo,
    config: DirectoryConfig,
    context: OperationContext,
    directoryMap: Map<string, string>,
    noteIdMap: Map<string, string>
  ): Promise<FileResult> {
    try {
      // Determine parent note
      const parentNoteId = this.determineParentNote(file, config, directoryMap);

      // Check for existing note
      const existingNote = await this.findExistingNote(file.path, 'file', config, context);
      if (existingNote && config.duplicateHandling === 'skip') {
        return {
          file,
          ownerId: (existingNote as any).noteId || (existingNote as any).ownerId,
          success: true,
          skipped: true,
          reason: 'File already exists and duplicate handling is set to skip',
        };
      }

      // Handle different file types
      if (this.isTextFile(file)) {
        return await this.importTextFile(file, config, context, parentNoteId);
      } else {
        return await this.importBinaryFile(file, config, context, parentNoteId);
      }

    } catch (error) {
      throw new ImportExportError(
        `Failed to import file: ${file.path}`,
        'FILE_IMPORT_ERROR',
        { file: file.path, error }
      );
    }
  }

  private async importTextFile(
    file: FileInfo,
    config: DirectoryConfig,
    context: OperationContext,
    parentNoteId?: string
  ): Promise<FileResult> {
    // Read and parse content
    const rawContent = await readFile(file.fullPath, 'utf8');
    const contentInfo = await parseContent(rawContent, file);

    // Create note title
    let title = contentInfo.title || file.name;
    if (config.preserveExtensions && !title.includes('.')) {
      title = file.name;
    } else {
      title = title.replace(/\.[^.]*$/, ''); // Remove extension
    }

    // Create note attributes
    const attributes = this.createFileAttributes(file, contentInfo, config);

    // Prepare note content
    let content = contentInfo.content || rawContent;
    
    // Convert to HTML if needed
    if (contentInfo.type === 'markdown') {
      // For now, keep as markdown - Trilium can handle it
      // In the future, convert to HTML
    } else if (contentInfo.type === 'html') {
      content = rawContent;
    } else if (contentInfo.type === 'json') {
      // Format JSON nicely
      try {
        const jsonData = JSON.parse(rawContent);
        content = `<pre><code class="language-json">${JSON.stringify(jsonData, null, 2)}</code></pre>`;
      } catch {
        content = `<pre><code>${rawContent}</code></pre>`;
      }
    } else {
      // Wrap plain text in pre tags
      content = `<pre>${this.escapeHtml(rawContent)}</pre>`;
    }

    // Create note
    const noteData = {
      title,
      content: content,
      type: 'text',
      mime: 'text/html',
      attributes,
    };

    const noteResult = await this.client.createNote({
      ...noteData,
      parentNoteId: parentNoteId || 'root',
      type: noteData.type as any,
    } as any);

    return {
      file,
      ownerId: (noteResult as any).noteId || noteResult.note.noteId,
      success: true,
      skipped: false,
      metadata: {
        contentType: contentInfo.type,
        hasMetadata: !!contentInfo.frontMatter,
        linkCount: contentInfo.links?.length || 0,
        parentNoteId,
      },
    };
  }

  private async importBinaryFile(
    file: FileInfo,
    config: DirectoryConfig,
    context: OperationContext,
    parentNoteId?: string
  ): Promise<FileResult> {
    // Read binary content
    const content = await readFile(file.fullPath);

    // Create attachment
    const attachmentResult = await this.client.createAttachment({
      title: file.name,
      content: content.toString('base64'),
      mime: file.mimeType || 'application/octet-stream',
      notePosition: 0,
      parentNoteId: parentNoteId || 'root',
    } as any);

    return {
      file,
      ownerId: (attachmentResult as any).attachmentId || (attachmentResult as any).ownerId || String(attachmentResult),
      success: true,
      skipped: false,
      metadata: {
        isAttachment: true,
        mimeType: file.mimeType,
        parentNoteId,
      },
    };
  }

  private determineParentNote(
    file: FileInfo,
    config: DirectoryConfig,
    directoryMap: Map<string, string>
  ): string | undefined {
    if (!config.preserveStructure) {
      return undefined;
    }

    const dirPath = file.metadata?.directoryPath as string;
    if (dirPath && dirPath !== '.') {
      return directoryMap.get(dirPath);
    }

    return undefined;
  }

  private createFileAttributes(
    file: FileInfo,
    contentInfo: ContentInfo,
    config: DirectoryConfig
  ): Array<{ type: string; name: string; value: string }> {
    const attributes = [];

    // Add source information
    attributes.push({
      type: 'label',
      name: 'source',
      value: 'directory',
    });

    attributes.push({
      type: 'label',
      name: 'original-path',
      value: file.path,
    });

    attributes.push({
      type: 'label',
      name: 'original-name',
      value: file.name,
    });

    if (file.extension) {
      attributes.push({
        type: 'label',
        name: 'file-extension',
        value: file.extension,
      });
    }

    if (file.mimeType) {
      attributes.push({
        type: 'label',
        name: 'mime-type',
        value: file.mimeType,
      });
    }

    // Add content-specific attributes
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
            name: `metadata-${key}`,
            value: String(value),
          });
        }
      }
    }

    return attributes;
  }

  private async findExistingNote(
    filePath: string,
    type: 'file' | 'directory',
    config: DirectoryConfig,
    context: OperationContext
  ): Promise<{ ownerId: string } | null> {
    try {
      const searchQuery = type === 'directory' 
        ? `#directory-path = "${filePath}"`
        : `#original-path = "${filePath}"`;
      
      const searchResults = await this.client.searchNotes(searchQuery);
      if (searchResults && searchResults.length > 0 && searchResults[0]) {
        return { ownerId: searchResults[0].noteId };
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private async createIndexFile(
    files: FileInfo[],
    config: DirectoryConfig,
    context: OperationContext,
    noteIdMap: Map<string, string>
  ): Promise<void> {
    const indexContent = this.generateIndexContent(files, config);
    
    const indexNoteResult = await this.client.createNote({
      title: 'Import Index',
      content: indexContent,
      type: 'text' as any,
      mime: 'text/html',
      parentNoteId: 'root',
    } as any);
    
    // Create attributes separately if needed
    const attributes = [
        { type: 'label', name: 'source', value: 'directory' },
        { type: 'label', name: 'type', value: 'index' },
        { type: 'label', name: 'import-date', value: new Date().toISOString() },
    ];

    const indexNoteId = (indexNoteResult as any).noteId || indexNoteResult.note.noteId;
    console.log(`Created index file with note ID: ${indexNoteId}`);
  }

  private generateIndexContent(files: FileInfo[], config: DirectoryConfig): string {
    let content = '<h1>Import Index</h1>\n\n';
    content += `<p>Imported from: <code>${config.sourcePath || 'Unknown'}</code></p>\n`;
    content += `<p>Import date: ${new Date().toLocaleString()}</p>\n\n`;

    // Group files by directory
    const filesByDir = new Map<string, FileInfo[]>();
    for (const file of files) {
      const dirPath = file.metadata?.directoryPath as string || '.';
      if (!filesByDir.has(dirPath)) {
        filesByDir.set(dirPath, []);
      }
      filesByDir.get(dirPath)!.push(file);
    }

    // Generate directory tree
    const sortedDirs = Array.from(filesByDir.keys()).sort();
    
    content += '<h2>File Structure</h2>\n';
    content += '<ul>\n';

    for (const dirPath of sortedDirs) {
      const dirFiles = filesByDir.get(dirPath)!;
      
      if (dirPath === '.') {
        // Root files
        for (const file of dirFiles) {
          content += `  <li>${this.escapeHtml(file.name)} (${file.extension})</li>\n`;
        }
      } else {
        // Directory
        content += `  <li><strong>${this.escapeHtml(dirPath)}/</strong>\n`;
        content += '    <ul>\n';
        for (const file of dirFiles) {
          content += `      <li>${this.escapeHtml(file.name)} (${file.extension})</li>\n`;
        }
        content += '    </ul>\n';
        content += '  </li>\n';
      }
    }

    content += '</ul>\n\n';

    // Add statistics
    const stats = this.calculateImportStats(files);
    content += '<h2>Import Statistics</h2>\n';
    content += '<ul>\n';
    content += `  <li>Total files: ${stats.totalFiles}</li>\n`;
    content += `  <li>Text files: ${stats.textFiles}</li>\n`;
    content += `  <li>Binary files: ${stats.binaryFiles}</li>\n`;
    content += `  <li>Total size: ${this.formatFileSize(stats.totalSize)}</li>\n`;
    content += `  <li>File types: ${Array.from(stats.fileTypes.entries()).map(([ext, count]) => `${ext} (${count})`).join(', ')}</li>\n`;
    content += '</ul>\n';

    return content;
  }

  private calculateImportStats(files: FileInfo[]): {
    totalFiles: number;
    textFiles: number;
    binaryFiles: number;
    totalSize: number;
    fileTypes: Map<string, number>;
  } {
    const stats = {
      totalFiles: files.length,
      textFiles: 0,
      binaryFiles: 0,
      totalSize: 0,
      fileTypes: new Map<string, number>(),
    };

    for (const file of files) {
      if (this.isTextFile(file)) {
        stats.textFiles++;
      } else {
        stats.binaryFiles++;
      }

      stats.totalSize += file.size;

      const ext = file.extension || 'no-extension';
      stats.fileTypes.set(ext, (stats.fileTypes.get(ext) || 0) + 1);
    }

    return stats;
  }

  private createImportResult(
    startTime: Date,
    files: FileInfo[],
    results: FileResult[],
    created: string[],
    updated: string[],
    attachments: string[],
    errors: ErrorCollector,
    config: DirectoryConfig,
    isDryRun: boolean
  ): ImportResult {
    const endTime = new Date();
    const successful = isDryRun ? files.length : results.filter(r => r.success).length;

    return {
      summary: {
        operation: 'import',
        format: 'directory',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        totalFiles: files.length,
        processedFiles: files.length,
        successfulFiles: successful,
        failedFiles: files.length - successful,
        skippedFiles: 0,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        processedSize: isDryRun 
          ? files.reduce((sum, f) => sum + f.size, 0)
          : results.filter(r => r.success).reduce((sum, r) => sum + r.file.size, 0),
        errors: errors.getErrors(),
        warnings: errors.getWarnings(),
      },
      files: isDryRun 
        ? files.map(file => ({
            file,
            success: true,
            skipped: false,
            reason: 'Dry run - would import',
          }))
        : results,
      created: isDryRun ? [] : created,
      updated: isDryRun ? [] : updated,
      attachments: isDryRun ? [] : attachments,
      warnings: errors.getWarnings(),
      config,
    };
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

/**
 * Directory export handler
 */
export class DirectoryExportHandler implements ExportHandler<DirectoryConfig> {
  name = 'directory-export';
  format = 'directory' as const;

  constructor(private client: TriliumClient) {}

  async validate(config: DirectoryConfig): Promise<void> {
    validateConfig(DirectoryConfigSchema, config);
    
    if (config.outputPath) {
      try {
        await ensureDirectory(dirname(config.outputPath));
      } catch (error) {
        throw new ImportExportError(
          `Cannot create output directory: ${config.outputPath}`,
          'OUTPUT_PATH_ERROR',
          { path: config.outputPath, error }
        );
      }
    }
  }

  async plan(
    noteIds: string[],
    config: DirectoryConfig,
    context: OperationContext
  ): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    const outputPath = config.outputPath || context.tempDirectory;

    for (const noteId of noteIds) {
      try {
        const note = await this.client.getNote(noteId);
        if (!note) continue;

        // Plan note export
        const fileName = this.generateFileName(note, config);
        const filePath = join(outputPath, fileName);

        files.push({
          path: relative(outputPath, filePath),
          fullPath: filePath,
          relativePath: fileName,
          name: fileName,
          extension: extname(fileName).substring(1) || 'html',
          size: ((note as any).content || '').length,
          depth: 0,
          metadata: {
            noteId,
            noteTitle: note.title,
            noteType: note.type,
          },
        });

        // Plan descendant notes
        const descendants = await (this.client as any).getNoteDescendants?.(noteId) || [];
        for (const descendant of descendants) {
          const descendantFileName = this.generateFileName(descendant, config);
          const descendantPath = config.preserveStructure 
            ? join(sanitizeFileName(note.title), descendantFileName)
            : descendantFileName;
          const descendantFullPath = join(outputPath, descendantPath);

          files.push({
            path: relative(outputPath, descendantFullPath),
            fullPath: descendantFullPath,
            relativePath: descendantPath,
            name: descendantFileName,
            extension: extname(descendantFileName).substring(1) || 'html',
            size: (descendant.content || '').length,
            depth: config.preserveStructure ? 1 : 0,
            metadata: {
              ownerId: descendant.noteId,
              noteTitle: descendant.title,
              noteType: descendant.type,
              parentNoteId: noteId,
            },
          });
        }

        // Plan attachments
        const attachments = await this.client.getNoteAttachments(noteId);
        for (const attachment of attachments) {
          const attachmentFileName = sanitizeFileName(attachment.title);
          const attachmentPath = config.preserveStructure
            ? join(sanitizeFileName(note.title), 'attachments', attachmentFileName)
            : join('attachments', attachmentFileName);
          const attachmentFullPath = join(outputPath, attachmentPath);

          files.push({
            path: relative(outputPath, attachmentFullPath),
            fullPath: attachmentFullPath,
            relativePath: attachmentPath,
            name: attachmentFileName,
            extension: extname(attachmentFileName).substring(1),
            size: attachment.contentLength || 0,
            depth: config.preserveStructure ? 2 : 1,
            metadata: {
              attachmentId: attachment.attachmentId,
              parentNoteId: noteId,
              isAttachment: true,
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
    config: DirectoryConfig,
    context: OperationContext,
    onProgress?: ProgressCallback
  ): Promise<ExportResult> {
    const startTime = new Date();
    const errors = new ErrorCollector();
    const results: FileResult[] = [];
    const exported: string[] = [];
    const attachmentPaths: string[] = [];

    const outputPath = config.outputPath || context.tempDirectory;
    const plannedFiles = await this.plan(noteIds, config, context);
    
    const progress = createProgressTracker(context.operationId, plannedFiles.length, onProgress);
    await progress.start('Starting directory export');

    if (config.dryRun) {
      await progress.complete('Dry run completed - no changes made');
      
      return this.createExportResult(
        startTime,
        outputPath,
        plannedFiles,
        results,
        exported,
        attachmentPaths,
        errors,
        config,
        true
      );
    }

    // Ensure output directory exists
    await ensureDirectory(outputPath);

    // Export files
    for (let i = 0; i < plannedFiles.length; i++) {
      const file = plannedFiles[i];
      if (!file) continue;
      
      try {
        const result = await this.exportFile(file, config, context);
        results.push(result);
        
        if (result.success) {
          if (file?.metadata?.isAttachment) {
            attachmentPaths.push(file.path);
          } else {
            exported.push(file?.metadata?.noteId || file?.path || '');
          }
        }

        await progress.progress(i + 1, `Exported: ${file?.name || 'file'}`);
      } catch (error) {
        const errorResult: FileResult = {
          file: file!,
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

    // Create index file if requested
    if (config.createIndex) {
      try {
        await this.createExportIndex(plannedFiles, config, outputPath);
      } catch (error) {
        errors.addWarning(`Failed to create index file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const endTime = new Date();
    await progress.complete(`Export completed: ${results.filter(r => r.success).length}/${plannedFiles.length} files processed`);

    return this.createExportResult(
      startTime,
      outputPath,
      plannedFiles,
      results,
      exported,
      attachmentPaths,
      errors,
      config,
      false
    );
  }

  private async exportFile(
    file: FileInfo,
    config: DirectoryConfig,
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
    config: DirectoryConfig,
    context: OperationContext
  ): Promise<FileResult> {
    const noteId = file.metadata?.noteId;
    if (!noteId) {
      throw new ImportExportError('Note ID not found in file metadata', 'MISSING_NOTE_ID');
    }

    const note = await this.client.getNote(noteId);
    if (!note) {
      throw new ImportExportError(`Note not found: ${noteId}`, 'NOTE_NOT_FOUND', { noteId });
    }

    const attributes = await this.client.getNoteAttributes(noteId);
    const exportContent = await this.convertNoteForExport(note, attributes, config);

    await ensureDirectory(dirname(file.fullPath));
    await writeTextFile(file.fullPath, exportContent);

    return {
      file,
      ownerId: noteId || (file as any).noteId,
      success: true,
      skipped: false,
      metadata: {
        noteTitle: note.title,
        contentLength: exportContent.length,
        exportFormat: file.extension,
      },
    };
  }

  private async exportAttachment(
    file: FileInfo,
    config: DirectoryConfig,
    context: OperationContext
  ): Promise<FileResult> {
    const attachmentId = file.metadata?.attachmentId;
    if (!attachmentId) {
      throw new ImportExportError('Attachment ID not found in file metadata', 'MISSING_ATTACHMENT_ID');
    }

    const attachmentData = await this.client.getAttachmentContent(attachmentId);
    if (!attachmentData) {
      throw new ImportExportError(`Attachment not found: ${attachmentId}`, 'ATTACHMENT_NOT_FOUND', { attachmentId });
    }

    await ensureDirectory(dirname(file.fullPath));
    await writeFile(file.fullPath, attachmentData);

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

  private generateFileName(note: any, config: DirectoryConfig): string {
    const baseName = sanitizeFileName(note.title);
    
    if (config.preserveExtensions) {
      // Try to get original extension from attributes
      const originalExt = note.attributes?.find((attr: any) => attr.name === 'file-extension')?.value;
      if (originalExt) {
        return `${baseName}.${originalExt}`;
      }
    }

    // Default to appropriate extension based on content type
    if (note.mime === 'application/json' || note.type === 'code' && note.content?.startsWith('{')) {
      return `${baseName}.json`;
    } else if (note.content?.includes('# ') || note.content?.includes('## ')) {
      return `${baseName}.md`;
    } else {
      return `${baseName}.html`;
    }
  }

  private async convertNoteForExport(
    note: any,
    attributes: any[],
    config: DirectoryConfig
  ): Promise<string> {
    let content = note.content || '';

    // Add metadata header if content has structure
    const originalPath = attributes.find(attr => attr.name === 'original-path')?.value;
    const sourceType = attributes.find(attr => attr.name === 'source')?.value;
    
    if (originalPath || sourceType) {
      let header = '';
      
      if (sourceType) {
        header += `<!-- Source: ${sourceType} -->\n`;
      }
      
      if (originalPath) {
        header += `<!-- Original path: ${originalPath} -->\n`;
      }
      
      header += `<!-- Exported from Trilium on ${new Date().toISOString()} -->\n\n`;
      content = header + content;
    }

    return content;
  }

  private async createExportIndex(
    files: FileInfo[],
    config: DirectoryConfig,
    outputPath: string
  ): Promise<void> {
    const indexContent = this.generateExportIndexContent(files, config);
    const indexPath = join(outputPath, config.indexFileName);
    
    await writeTextFile(indexPath, indexContent);
    console.log(`Created export index: ${indexPath}`);
  }

  private generateExportIndexContent(files: FileInfo[], config: DirectoryConfig): string {
    let content = '# Export Index\n\n';
    content += `**Export date:** ${new Date().toLocaleString()}\n\n`;
    content += `**Total files:** ${files.length}\n\n`;

    // Group by type
    const notes = files.filter(f => !f.metadata?.isAttachment);
    const attachments = files.filter(f => f.metadata?.isAttachment);

    if (notes.length > 0) {
      content += '## Notes\n\n';
      for (const note of notes) {
        const title = note.metadata?.noteTitle || note.name;
        content += `- [${title}](${note.path})\n`;
      }
      content += '\n';
    }

    if (attachments.length > 0) {
      content += '## Attachments\n\n';
      for (const attachment of attachments) {
        content += `- [${attachment.name}](${attachment.path})\n`;
      }
      content += '\n';
    }

    // Add file tree
    content += '## File Structure\n\n```\n';
    const tree = this.generateFileTree(files);
    content += tree;
    content += '```\n';

    return content;
  }

  private generateFileTree(files: FileInfo[]): string {
    const tree: Record<string, any> = {};

    // Build tree structure
    for (const file of files) {
      const parts = file.path.split('/').filter(part => part !== '');
      let current = tree;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue; // Skip empty parts
        
        if (i === parts.length - 1) {
          // Leaf node (file)
          current[part] = null;
        } else {
          // Directory node
          if (!current[part]) {
            current[part] = {};
          }
          const next = current[part];
          if (next && typeof next === 'object') {
            current = next;
          }
        }
      }
    }

    // Convert tree to string representation
    return this.treeToString(tree, '');
  }

  private treeToString(node: Record<string, any>, prefix: string): string {
    if (!node || typeof node !== 'object') {
      return '';
    }
    
    let result = '';
    const entries = Object.entries(node).sort(([a], [b]) => a.localeCompare(b));

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry) continue;
      
      const [name, children] = entry;
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';

      result += prefix + connector + name + '\n';

      if (children !== null && typeof children === 'object') {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        result += this.treeToString(children, childPrefix);
      }
    }

    return result;
  }

  private createExportResult(
    startTime: Date,
    outputPath: string,
    plannedFiles: FileInfo[],
    results: FileResult[],
    exported: string[],
    attachmentPaths: string[],
    errors: ErrorCollector,
    config: DirectoryConfig,
    isDryRun: boolean
  ): ExportResult {
    const endTime = new Date();
    const successful = isDryRun ? plannedFiles.length : results.filter(r => r.success).length;

    return {
      summary: {
        operation: 'export',
        format: 'directory',
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        totalFiles: plannedFiles.length,
        processedFiles: plannedFiles.length,
        successfulFiles: successful,
        failedFiles: plannedFiles.length - successful,
        skippedFiles: 0,
        totalSize: plannedFiles.reduce((sum, f) => sum + f.size, 0),
        processedSize: isDryRun 
          ? plannedFiles.reduce((sum, f) => sum + f.size, 0)
          : results.filter(r => r.success).reduce((sum, r) => sum + r.file.size, 0),
        errors: errors.getErrors(),
        warnings: errors.getWarnings(),
      },
      files: isDryRun 
        ? plannedFiles.map(file => ({
            file,
            success: true,
            skipped: false,
            reason: 'Dry run - would export',
          }))
        : results,
      outputPath,
      exported: isDryRun ? [] : exported,
      attachments: isDryRun ? [] : attachmentPaths,
      warnings: errors.getWarnings(),
      config,
    };
  }
}