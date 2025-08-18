import { createReadStream, createWriteStream, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, relative, dirname, basename, extname, resolve } from 'path';

// archiver import will be handled dynamically if needed
import type { TriliumClient } from '../../api/client.js';
import type { NoteType, MimeType } from '../../types/api.js';
import { ensureDefined } from '../../utils/type-guards.js';
import { admZipLoader, grayMatterLoader } from '../dependency-loader.js';
import type {
  ImportHandler,
  ExportHandler,
  NotionConfig,
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
  NotionConfigSchema,
  createProgressTracker,
} from '../types.js';
import {
  parseContent,
  writeTextFile,
  ensureDirectory,
  ErrorCollector,
  sanitizeFileName,
} from '../utils.js';

/**
 * Notion page representation
 */
interface NotionPage {
  id: string;
  title: string;
  path: string;
  content: string;
  children: NotionPage[];
  parent?: NotionPage;
  attachments: string[];
  properties: Record<string, any>;
  blocks: NotionBlock[];
  depth: number;
  type: 'page' | 'database';
}

interface NotionBlock {
  id: string;
  type: string;
  content?: string;
  properties?: Record<string, any>;
  children?: NotionBlock[];
}

/**
 * Notion ZIP import handler
 */
export class NotionImportHandler implements ImportHandler<NotionConfig> {
  name = 'notion-import';
  format = 'notion' as const;

  constructor(private client: TriliumClient) {}

  async validate(config: NotionConfig): Promise<void> {
    validateConfig(NotionConfigSchema, config);
    
    if (config.zipPath && !existsSync(config.zipPath)) {
      throw new ImportExportError(
        `Notion ZIP file not found: ${config.zipPath}`,
        'NOTION_ZIP_NOT_FOUND',
        { path: config.zipPath }
      );
    }
  }

  async scan(config: NotionConfig, context: OperationContext): Promise<FileInfo[]> {
    if (!config.zipPath) {
      throw new ImportExportError('ZIP path is required for scanning', 'MISSING_ZIP_PATH');
    }

    const pages = await this.extractNotionZip(config.zipPath, config);
    const files: FileInfo[] = [];

    // Convert pages to file info
    for (const page of pages) {
      const fileName = sanitizeFileName(page.title) + '.md';
      const filePath = this.generatePagePath(page, config);
      
      files.push({
        path: filePath,
        fullPath: join(context.tempDirectory, filePath),
        relativePath: filePath,
        name: fileName,
        extension: 'md',
        size: page.content.length,
        depth: page.depth,
        metadata: {
          notionPageId: page.id,
          pageTitle: page.title,
          pageType: page.type,
          hasChildren: page.children.length > 0,
          attachmentCount: page.attachments.length,
          blockCount: page.blocks.length,
          properties: page.properties,
        },
      });

      // Add attachment files
      for (const attachment of page.attachments) {
        const attachmentName = basename(attachment);
        const attachmentPath = join('attachments', attachmentName);
        
        files.push({
          path: attachmentPath,
          fullPath: join(context.tempDirectory, attachmentPath),
          relativePath: attachmentPath,
          name: attachmentName,
          extension: extname(attachmentName).substring(1),
          size: 0, // Will be determined during extraction
          depth: 0,
          metadata: {
            isAttachment: true,
            parentPageId: page.id,
            originalPath: attachment,
          },
        });
      }
    }

    return files;
  }

  async import(
    files: FileInfo[],
    config: NotionConfig,
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
    await progress.start('Starting Notion import');

    if (config.dryRun) {
      await progress.complete('Dry run completed - no changes made');
      
      return {
        summary: {
          operation: 'import',
          format: 'notion',
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

    // Extract ZIP to temporary directory
    const zipPath = ensureDefined(config.zipPath, 'ZIP path is required for Notion import');
    const pages = await this.extractNotionZip(zipPath, config);
    const pageMap = new Map<string, string>(); // pageId -> noteId

    // Import pages in hierarchical order
    const rootPages = pages.filter(page => !page.parent);
    await this.importPagesRecursively(rootPages, pageMap, config, context, progress, results, created);

    // Import attachments
    const attachmentFiles = files.filter(f => f.metadata?.isAttachment);
    for (let i = 0; i < attachmentFiles.length; i++) {
      const file = attachmentFiles[i];
      if (!file) continue;
      
      try {
        const result = await this.importAttachment(file, pageMap, config, context);
        results.push(result);
        
        if (result.success && result.ownerId) {
          attachments.push(result.ownerId);
        }

        await progress.progress(files.length - attachmentFiles.length + i + 1, `Imported attachment: ${file.name}`);
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

    const endTime = new Date();
    const successful = results.filter(r => r.success).length;

    await progress.complete(`Import completed: ${successful}/${files.length} files processed`);

    return {
      summary: {
        operation: 'import',
        format: 'notion',
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

  private async extractNotionZip(zipPath: string, config: NotionConfig): Promise<NotionPage[]> {
    try {
      const admZipModule = await admZipLoader();
      const AdmZip = admZipModule.default;
      const zip = new AdmZip(zipPath);
      const entries = zip.getEntries();
      
      const pages: NotionPage[] = [];
      const pageMap = new Map<string, NotionPage>();
      const attachmentMap = new Map<string, string[]>();

      // First pass: extract all pages
      for (const entry of entries) {
        if (entry.isDirectory) continue;

        const entryName = entry.entryName;
        
        if (entryName.endsWith('.md') || entryName.endsWith('.html') || entryName.endsWith('.csv')) {
          const content = entry.getData().toString('utf8');
          const page = await this.parseNotionPage(entryName, content, config);
          
          pages.push(page);
          pageMap.set(page.id, page);
        } else if (this.isAttachmentFile(entryName)) {
          // Track attachments
          const pageDir = dirname(entryName);
          if (!attachmentMap.has(pageDir)) {
            attachmentMap.set(pageDir, []);
          }
          attachmentMap.get(pageDir)!.push(entryName);
        }
      }

      // Second pass: establish parent-child relationships
      this.buildPageHierarchy(pages);

      // Third pass: associate attachments with pages
      for (const page of pages) {
        const pageDir = dirname(page.path);
        const attachments = attachmentMap.get(pageDir) || [];
        page.attachments = attachments;
      }

      return pages.sort((a, b) => a.path.localeCompare(b.path));

    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        throw new ImportExportError(
          'ZIP processing requires the "adm-zip" package. Install it with: npm install adm-zip',
          'MISSING_ZIP_DEPENDENCY'
        );
      }
      throw new ImportExportError(
        `Failed to extract Notion ZIP: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'NOTION_ZIP_EXTRACTION_ERROR',
        { zipPath, error }
      );
    }
  }

  private async parseNotionPage(filePath: string, content: string, config: NotionConfig): Promise<NotionPage> {
    const fileName = basename(filePath);
    const id = this.extractPageId(fileName) || await this.generatePageId(fileName);
    
    let title = fileName.replace(/\.(md|html|csv)$/, '');
    let pageContent = content;
    let properties: Record<string, any> = {};
    let blocks: NotionBlock[] = [];

    // Parse different formats
    if (filePath.endsWith('.md')) {
      const parsed = await this.parseMarkdownContent(content);
      title = parsed.title || title;
      pageContent = parsed.content;
      properties = parsed.properties;
      blocks = parsed.blocks;
    } else if (filePath.endsWith('.html')) {
      const parsed = await this.parseHtmlContent(content);
      title = parsed.title || title;
      pageContent = parsed.content;
      properties = parsed.properties;
      blocks = parsed.blocks;
    } else if (filePath.endsWith('.csv')) {
      const parsed = await this.parseCsvContent(content);
      title = parsed.title || title;
      pageContent = parsed.content;
      properties = parsed.properties;
      blocks = parsed.blocks;
    }

    return {
      id,
      title: this.cleanTitle(title),
      path: filePath,
      content: pageContent,
      children: [],
      attachments: [],
      properties,
      blocks,
      depth: filePath.split('/').length - 1,
      type: filePath.endsWith('.csv') ? 'database' : 'page',
    };
  }

  private async parseMarkdownContent(content: string): Promise<{
    title?: string;
    content: string;
    properties: Record<string, any>;
    blocks: NotionBlock[];
  }> {
    const grayMatterModule = await grayMatterLoader();
    const matter = grayMatterModule.default;
    const parsed = matter(content);
    
    // Extract title from first heading or front matter
    const titleMatch = parsed.content.match(/^#\s+(.+)$/m);
    const title = parsed.data.title || titleMatch?.[1];
    
    // Parse Notion-specific blocks
    const blocks = this.parseNotionBlocks(parsed.content);

    return {
      title,
      content: parsed.content,
      properties: parsed.data,
      blocks,
    };
  }

  private async parseHtmlContent(content: string): Promise<{
    title?: string;
    content: string;
    properties: Record<string, any>;
    blocks: NotionBlock[];
  }> {
    // Extract title from HTML
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i) || 
                      content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch?.[1];

    // Convert HTML to simpler format
    const simplifiedContent = this.convertHtmlToMarkdown(content);
    const blocks = this.parseNotionBlocks(simplifiedContent);

    return {
      title,
      content: simplifiedContent,
      properties: {},
      blocks,
    };
  }

  private async parseCsvContent(content: string): Promise<{
    title?: string;
    content: string;
    properties: Record<string, any>;
    blocks: NotionBlock[];
  }> {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return {
        content: '',
        properties: {},
        blocks: [],
      };
    }

    const firstLine = lines[0];
    if (!firstLine) {
      return {
        content: '',
        properties: {},
        blocks: [],
      };
    }

    const headers = firstLine.split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => 
      line.split(',').map(cell => cell.trim().replace(/"/g, ''))
    );

    // Convert CSV to markdown table
    let tableContent = '| ' + headers.join(' | ') + ' |\n';
    tableContent += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    
    for (const row of rows) {
      tableContent += '| ' + row.join(' | ') + ' |\n';
    }

    const blocks: NotionBlock[] = [{
      id: 'table-block',
      type: 'table',
      content: tableContent,
      properties: {
        headers,
        rows,
        rowCount: rows.length,
        columnCount: headers.length,
      },
    }];

    return {
      title: `Database (${rows.length} rows)`,
      content: tableContent,
      properties: {
        type: 'database',
        headers,
        rowCount: rows.length,
        columnCount: headers.length,
      },
      blocks,
    };
  }

  private parseNotionBlocks(content: string): NotionBlock[] {
    const blocks: NotionBlock[] = [];
    const lines = content.split('\n');
    const currentBlock: NotionBlock | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      // Handle different block types
      if (line.match(/^#{1,6}\s/)) {
        // Heading block
        const level = line.match(/^(#{1,6})/)?.[1]?.length || 1;
        const text = line.replace(/^#{1,6}\s/, '');
        
        blocks.push({
          id: `heading-${i}`,
          type: `heading_${level}`,
          content: text,
          properties: { level },
        });
      } else if (line.match(/^>\s/)) {
        // Quote block
        const text = line.replace(/^>\s/, '');
        
        blocks.push({
          id: `quote-${i}`,
          type: 'quote',
          content: text,
        });
      } else if (line.match(/^```/)) {
        // Code block
        const language = line.replace(/^```/, '');
        const codeLines: string[] = [];
        i++; // Skip the opening ```
        
        while (i < lines.length) {
          const currentLine = lines[i];
          if (!currentLine || currentLine.match(/^```/)) break;
          codeLines.push(currentLine);
          i++;
        }
        
        blocks.push({
          id: `code-${i}`,
          type: 'code',
          content: codeLines.join('\n'),
          properties: { language },
        });
      } else if (line.match(/^[-*+]\s/)) {
        // Bulleted list item
        const text = line.replace(/^[-*+]\s/, '');
        
        blocks.push({
          id: `bullet-${i}`,
          type: 'bulleted_list_item',
          content: text,
        });
      } else if (line.match(/^\d+\.\s/)) {
        // Numbered list item
        const text = line.replace(/^\d+\.\s/, '');
        
        blocks.push({
          id: `numbered-${i}`,
          type: 'numbered_list_item',
          content: text,
        });
      } else if (line.trim() && !line.match(/^---+$/)) {
        // Paragraph block
        blocks.push({
          id: `paragraph-${i}`,
          type: 'paragraph',
          content: line,
        });
      }
    }

    return blocks;
  }

  private buildPageHierarchy(pages: NotionPage[]): void {
    // Sort by path depth to process parents before children
    const sortedPages = pages.sort((a, b) => a.depth - b.depth);
    
    for (const page of sortedPages) {
      const parentPath = dirname(page.path);
      
      if (parentPath !== '.' && parentPath !== '') {
        // Find parent page
        const parent = pages.find(p => 
          dirname(p.path) === dirname(parentPath) && 
          basename(p.path, extname(p.path)) === basename(parentPath)
        );
        
        if (parent) {
          page.parent = parent;
          parent.children.push(page);
        }
      }
    }
  }

  private async importPagesRecursively(
    pages: NotionPage[],
    pageMap: Map<string, string>,
    config: NotionConfig,
    context: OperationContext,
    progress: any,
    results: FileResult[],
    created: string[]
  ): Promise<void> {
    for (const page of pages) {
      try {
        const noteId = await this.importPage(page, pageMap, config, context);
        pageMap.set(page.id, noteId);
        created.push(noteId);

        const fileInfo: FileInfo = {
          path: this.generatePagePath(page, config),
          fullPath: join(context.tempDirectory, this.generatePagePath(page, config)),
          relativePath: this.generatePagePath(page, config),
          name: sanitizeFileName(page.title) + '.md',
          extension: 'md',
          size: page.content.length,
          depth: page.depth,
          metadata: page.properties,
        };

        results.push({
          file: fileInfo,
          ownerId: noteId,
          success: true,
          skipped: false,
          metadata: {
            notionPageId: page.id,
            pageType: page.type,
            hasChildren: page.children.length > 0,
          },
        });

        await progress.progress(results.length, `Imported page: ${page.title}`);

        // Recursively import children
        if (page.children.length > 0) {
          await this.importPagesRecursively(page.children, pageMap, config, context, progress, results, created);
        }

      } catch (error) {
        const fileInfo: FileInfo = {
          path: this.generatePagePath(page, config),
          fullPath: join(context.tempDirectory, this.generatePagePath(page, config)),
          relativePath: this.generatePagePath(page, config),
          name: sanitizeFileName(page.title) + '.md',
          extension: 'md',
          size: page.content.length,
          depth: page.depth,
          metadata: page.properties,
        };

        results.push({
          file: fileInfo,
          success: false,
          error: error instanceof ImportExportError ? error.toJSON() : {
            code: 'IMPORT_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date(),
          },
          skipped: false,
        });
      }
    }
  }

  private async importPage(
    page: NotionPage,
    pageMap: Map<string, string>,
    config: NotionConfig,
    context: OperationContext
  ): Promise<string> {
    // Determine parent note
    const parentNoteId = page.parent ? pageMap.get(page.parent.id) : undefined;

    // Convert Notion content to Trilium format
    const triliumContent = await this.convertNotionContentToTrilium(page, config);

    // Create note attributes
    const attributes = this.createNoteAttributes(page, config);

    // Create note
    const noteData = {
      title: page.title,
      content: triliumContent,
      type: 'text',
      mime: 'text/html',
      attributes,
    };

    const result = await this.client.createNote({
      parentNoteId: parentNoteId || 'root',
      title: noteData.title,
      type: noteData.type as NoteType,
      content: noteData.content,
      mime: noteData.mime as MimeType,
    });
    const noteId = result.note.noteId;

    return noteId;
  }

  private async importAttachment(
    file: FileInfo,
    pageMap: Map<string, string>,
    config: NotionConfig,
    context: OperationContext
  ): Promise<FileResult> {
    try {
      // Find parent page
      const parentPageId = file.metadata?.parentPageId;
      const parentNoteId = parentPageId ? pageMap.get(parentPageId) : undefined;

      if (!parentNoteId) {
        throw new ImportExportError(
          `Parent note not found for attachment: ${file.name}`,
          'ATTACHMENT_PARENT_NOT_FOUND'
        );
      }

      // Read attachment content
      const attachmentContent = await readFile(file.fullPath);

      // Create attachment in Trilium
      const attachment = await this.client.createAttachment({
        title: file.name,
        content: attachmentContent.toString('base64'),
        mime: file.mimeType || 'application/octet-stream',
        role: 'file',
        ownerId: parentNoteId,
      });

      return {
        file,
        ownerId: attachment.attachmentId,
        success: true,
        skipped: false,
        metadata: {
          attachmentId: attachment.attachmentId,
          parentNoteId,
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

  private async convertNotionContentToTrilium(page: NotionPage, config: NotionConfig): Promise<string> {
    if (!config.convertBlocks) {
      return page.content;
    }

    let html = '';

    // Convert blocks to HTML
    for (const block of page.blocks) {
      html += this.convertBlockToHtml(block, config);
    }

    return html || page.content;
  }

  private convertBlockToHtml(block: NotionBlock, config: NotionConfig): string {
    switch (block.type) {
      case 'paragraph':
        return `<p>${this.escapeHtml(block.content || '')}</p>\n`;
      
      case 'heading_1':
        return `<h1>${this.escapeHtml(block.content || '')}</h1>\n`;
      
      case 'heading_2':
        return `<h2>${this.escapeHtml(block.content || '')}</h2>\n`;
      
      case 'heading_3':
        return `<h3>${this.escapeHtml(block.content || '')}</h3>\n`;
      
      case 'bulleted_list_item':
        return `<li>${this.escapeHtml(block.content || '')}</li>\n`;
      
      case 'numbered_list_item':
        return `<li>${this.escapeHtml(block.content || '')}</li>\n`;
      
      case 'quote':
        return `<blockquote>${this.escapeHtml(block.content || '')}</blockquote>\n`;
      
      case 'code': {
        const language = block.properties?.language || '';
        return `<pre><code class="language-${language}">${this.escapeHtml(block.content || '')}</code></pre>\n`;
      }
      
      case 'table':
        return block.content || '';
      
      default:
        return `<div class="notion-block notion-${block.type}">${this.escapeHtml(block.content || '')}</div>\n`;
    }
  }

  private createNoteAttributes(page: NotionPage, config: NotionConfig): Array<{ type: string; name: string; value: string }> {
    const attributes = [];

    // Add Notion-specific attributes
    attributes.push({
      type: 'label',
      name: 'source',
      value: 'notion',
    });

    if (config.preserveIds && page.id) {
      attributes.push({
        type: 'label',
        name: 'notion-page-id',
        value: page.id,
      });
    }

    attributes.push({
      type: 'label',
      name: 'notion-page-type',
      value: page.type,
    });

    // Add custom properties as attributes
    for (const [key, value] of Object.entries(page.properties)) {
      if (key !== 'title' && key !== 'type') {
        attributes.push({
          type: 'label',
          name: `notion-${key}`,
          value: String(value),
        });
      }
    }

    return attributes;
  }

  // Helper methods
  private extractPageId(fileName: string): string | null {
    // Notion exports often include UUIDs in filenames
    const uuidMatch = fileName.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return uuidMatch ? uuidMatch[0] : null;
  }

  private async generatePageId(fileName: string): Promise<string> {
    // Generate a consistent ID based on filename
    const { createHash } = await import('crypto');
    return createHash('md5').update(fileName).digest('hex').substring(0, 8);
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '') // Remove UUIDs
      .replace(/^\d+\s+/, '') // Remove leading numbers
      .trim();
  }

  private generatePagePath(page: NotionPage, config: NotionConfig): string {
    if (config.preserveStructure && page.parent) {
      const parentPath = this.generatePagePath(page.parent, config);
      return join(dirname(parentPath), sanitizeFileName(page.title), sanitizeFileName(page.title) + '.md');
    }
    return sanitizeFileName(page.title) + '.md';
  }

  private isAttachmentFile(fileName: string): boolean {
    const attachmentExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
      '.pdf', '.doc', '.docx', '.odt', '.rtf',
      '.mp3', '.wav', '.ogg', '.m4a',
      '.mp4', '.webm', '.ogv', '.mov',
      '.zip', '.rar', '.7z', '.tar', '.gz'
    ];
    
    const ext = extname(fileName).toLowerCase();
    return attachmentExtensions.includes(ext);
  }

  private convertHtmlToMarkdown(html: string): string {
    // Basic HTML to Markdown conversion
    return html
      .replace(/<h([1-6])[^>]*>([^<]+)<\/h[1-6]>/gi, (match, level, text) => '#'.repeat(parseInt(level)) + ' ' + text)
      .replace(/<p[^>]*>([^<]+)<\/p>/gi, '$1\n\n')
      .replace(/<strong[^>]*>([^<]+)<\/strong>/gi, '**$1**')
      .replace(/<em[^>]*>([^<]+)<\/em>/gi, '*$1*')
      .replace(/<code[^>]*>([^<]+)<\/code>/gi, '`$1`')
      .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
      .replace(/<img[^>]+src=["']([^"']+)["'][^>]*[^>]*>/gi, '![]($1)')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '') // Remove remaining HTML tags
      .replace(/\n{3,}/g, '\n\n'); // Clean up extra newlines
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

/**
 * Notion export handler
 */
export class NotionExportHandler implements ExportHandler<NotionConfig> {
  name = 'notion-export';
  format = 'notion' as const;

  constructor(private client: TriliumClient) {}

  async validate(config: NotionConfig): Promise<void> {
    validateConfig(NotionConfigSchema, config);
  }

  async plan(
    noteIds: string[],
    config: NotionConfig,
    context: OperationContext
  ): Promise<FileInfo[]> {
    const files: FileInfo[] = [];

    for (const noteId of noteIds) {
      try {
        const note = await this.client.getNote(noteId);
        if (!note) continue;

        // Get note content for size calculation
        const content = await this.client.getNoteContent(noteId);

        // Plan note export
        const fileName = sanitizeFileName(note.title) + '.md';
        const outputPath = join(context.tempDirectory, fileName);

        files.push({
          path: fileName,
          fullPath: outputPath,
          relativePath: fileName,
          name: fileName,
          extension: 'md',
          size: (content || '').length,
          depth: 0,
          metadata: {
            noteId,
            noteTitle: note.title,
            noteType: note.type,
          },
        });

        // Plan descendant notes using childNoteIds
        if (note.childNoteIds && note.childNoteIds.length > 0) {
          for (const childId of note.childNoteIds) {
            const descendant = await this.client.getNote(childId);
            if (!descendant) continue;
            
            const descendantContent = await this.client.getNoteContent(childId);
          const descendantFileName = sanitizeFileName(descendant.title) + '.md';
          const descendantPath = join(sanitizeFileName(note.title), descendantFileName);
          const descendantOutputPath = join(context.tempDirectory, descendantPath);

          files.push({
            path: descendantPath,
            fullPath: descendantOutputPath,
            relativePath: descendantPath,
            name: descendantFileName,
            extension: 'md',
            size: (descendantContent || '').length,
            depth: 1,
            metadata: {
              ownerId: descendant.noteId,
              noteTitle: descendant.title,
              noteType: descendant.type,
              parentNoteId: noteId,
            },
          });
          }
        }

        // Plan attachments
        const attachments = await this.client.getNoteAttachments(noteId);
        for (const attachment of attachments) {
          const attachmentFileName = sanitizeFileName(attachment.title);
          const attachmentPath = join('attachments', attachmentFileName);
          const attachmentOutputPath = join(context.tempDirectory, attachmentPath);

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

      } catch (error) {
        console.warn(`Could not plan export for note ${noteId}:`, error);
      }
    }

    return files;
  }

  async export(
    noteIds: string[],
    config: NotionConfig,
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
    await progress.start('Starting Notion export');

    if (config.dryRun) {
      await progress.complete('Dry run completed - no changes made');
      
      const outputPath = join(context.tempDirectory, 'notion-export.zip');
      
      return {
        summary: {
          operation: 'export',
          format: 'notion',
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
        outputPath,
        exported: [],
        attachments: [],
        warnings: [],
        config,
      };
    }

    // Create temporary directory for export
    await ensureDirectory(context.tempDirectory);
    await ensureDirectory(join(context.tempDirectory, 'attachments'));

    // Export all files
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

    // Create ZIP file
    const zipPath = join(context.tempDirectory, 'notion-export.zip');
    await this.createNotionZip(context.tempDirectory, zipPath);

    const endTime = new Date();
    const successful = results.filter(r => r.success).length;

    await progress.complete(`Export completed: ${successful}/${plannedFiles.length} files processed`);

    return {
      summary: {
        operation: 'export',
        format: 'notion',
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
      outputPath: zipPath,
      exported,
      attachments: attachmentPaths,
      warnings: errors.getWarnings(),
      config,
    };
  }

  private async exportFile(
    file: FileInfo,
    config: NotionConfig,
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
    config: NotionConfig,
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
    const notionContent = await this.convertTriliumToNotionFormat(note, attributes, config);

    await writeTextFile(file.fullPath, notionContent);

    return {
      file,
      ownerId: noteId,
      success: true,
      skipped: false,
      metadata: {
        noteTitle: note.title,
        contentLength: notionContent.length,
      },
    };
  }

  private async exportAttachment(
    file: FileInfo,
    config: NotionConfig,
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

  private async convertTriliumToNotionFormat(
    note: any,
    attributes: any[],
    config: NotionConfig
  ): Promise<string> {
    let content = '';

    // Add title
    content += `# ${note.title}\n\n`;

    // Add properties as front matter
    const properties: Record<string, any> = {};
    
    for (const attr of attributes) {
      if (attr.name.startsWith('notion-')) {
        properties[attr.name.substring(7)] = attr.value;
      }
    }

    if (Object.keys(properties).length > 0) {
      content += '---\n';
      for (const [key, value] of Object.entries(properties)) {
        content += `${key}: ${JSON.stringify(value)}\n`;
      }
      content += '---\n\n';
    }

    // Convert content
    if (note.content) {
      // Basic HTML to Markdown conversion for Notion compatibility
      const markdownContent = this.convertHtmlToMarkdown(note.content);
      content += markdownContent;
    }

    return content;
  }

  private convertHtmlToMarkdown(html: string): string {
    return html
      .replace(/<h([1-6])[^>]*>([^<]+)<\/h[1-6]>/gi, (match, level, text) => '#'.repeat(parseInt(level)) + ' ' + text + '\n\n')
      .replace(/<p[^>]*>([^<]+)<\/p>/gi, '$1\n\n')
      .replace(/<strong[^>]*>([^<]+)<\/strong>/gi, '**$1**')
      .replace(/<em[^>]*>([^<]+)<\/em>/gi, '*$1*')
      .replace(/<code[^>]*>([^<]+)<\/code>/gi, '`$1`')
      .replace(/<pre[^>]*><code[^>]*>([^<]+)<\/code><\/pre>/gi, '```\n$1\n```')
      .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (match, content) => {
        return content.replace(/<li[^>]*>([^<]+)<\/li>/gi, '- $1\n');
      })
      .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match, content) => {
        let counter = 1;
        return content.replace(/<li[^>]*>([^<]+)<\/li>/gi, () => `${counter++}. $1\n`);
      })
      .replace(/<blockquote[^>]*>([^<]+)<\/blockquote>/gi, '> $1\n\n')
      .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
      .replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, '![]($1)')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async createNotionZip(tempDir: string, zipPath: string): Promise<void> {
    try {
      // Try to load archiver dynamically
      let archiver: any;
      try {
        const archiverModule = await import('archiver' as any);
        archiver = archiverModule.default || archiverModule;
      } catch {
        throw new ImportExportError(
          'archiver package is required for Notion export but not installed',
          'MISSING_DEPENDENCY',
          { dependency: 'archiver', installCommand: 'npm install archiver' }
        );
      }

      const archive = archiver('zip', { zlib: { level: 9 } });
      const output = createWriteStream(zipPath);

      archive.pipe(output);

      // Add all files from temp directory
      archive.directory(tempDir, false);

      await archive.finalize();

      return new Promise((resolve, reject) => {
        output.on('close', resolve);
        archive.on('error', reject);
      });

    } catch (error) {
      throw new ImportExportError(
        `Failed to create Notion ZIP: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ZIP_CREATION_ERROR',
        { zipPath, error }
      );
    }
  }
}