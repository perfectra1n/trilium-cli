import { createHash } from 'crypto';
import { promises as fs, constants } from 'fs';
import { stat, readFile, writeFile, mkdir } from 'fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'path';

import { glob } from 'glob';
import matter from 'gray-matter';
import { lookup } from 'mime-types';

import {
  validateSecurePath,
  validateDirectoryPath as validateSecureDirectoryPath,
  validateFilePath,
  sanitizeFileName as secureSanitizeFileName,
  createSecurePathResolver,
  validateFileSize,
  validateFileAccess,
} from './secure-path.js';
import type {
  FileInfo,
  ContentInfo,
  ProgressCallback,
  OperationError,
  ContentParser,
  ContentFormatter,
  FormatType,
} from './types.js';
import { FileInfoSchema, ContentInfoSchema, ImportExportError } from './types.js';

/**
 * File processing utilities
 */

export async function scanFiles(
  rootPath: string,
  options: {
    patterns?: string[];
    excludePatterns?: string[];
    maxDepth?: number;
    includeHidden?: boolean;
    followSymlinks?: boolean;
  } = {}
): Promise<FileInfo[]> {
  const {
    patterns = ['**/*'],
    excludePatterns = [],
    maxDepth = 10, // Add default max depth for security
    includeHidden = false,
    followSymlinks = false,
  } = options;

  const files: FileInfo[] = [];
  
  // Validate and secure the root path
  const resolvedRoot = await validateSecureDirectoryPath(rootPath, undefined, {
    maxDepth: 20, // Allow deeper directory structures for the root
    blockedPatterns: [
      /\.\./,           // Directory traversal
      /~[\\/]/,         // Home directory reference  
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1f]/,    // Control characters
      /\$\{/,           // Variable expansion
      /`/,              // Command substitution
    ],
  });

  // Create secure path resolver for this scan operation
  const pathResolver = createSecurePathResolver(resolvedRoot, {
    maxDepth: maxDepth + 1, // Allow one extra level for flexibility
    allowedExtensions: [], // Allow all extensions in scan
  });

  // Process each pattern
  for (const pattern of patterns) {
    try {
      // Validate the glob pattern for dangerous characters
      if (pattern.includes('..') || pattern.includes('~') || pattern.includes('$')) {
        console.warn(`Warning: Skipping potentially dangerous pattern: ${pattern}`);
        continue;
      }

      const matches = await glob(pattern, {
        cwd: resolvedRoot,
        nodir: true,
        dot: includeHidden,
        follow: followSymlinks,
        ignore: excludePatterns,
        maxDepth,
      });

      for (const match of matches) {
        try {
          // Validate each matched path for security
          const secureFullPath = pathResolver.resolve(match);
          
          // Check file accessibility and size
          await validateFileAccess(secureFullPath);
          const fileSize = await validateFileSize(secureFullPath, 500 * 1024 * 1024); // 500MB max
          
          const fileStats = await stat(secureFullPath);

          if (!fileStats.isFile()) {
            continue;
          }

          // Validate depth doesn't exceed security limits
          const depth = match.split('/').length - 1;
          if (depth > (maxDepth || 10)) {
            console.warn(`Warning: File depth exceeds limit: ${match}`);
            continue;
          }

          const fileInfo: FileInfo = {
            path: match,
            fullPath: secureFullPath,
            relativePath: relative(resolvedRoot, secureFullPath),
            name: basename(match),
            extension: extname(match).toLowerCase().substring(1),
            size: fileSize,
            mimeType: lookup(match) || undefined,
            lastModified: fileStats.mtime,
            depth,
          };

          // Validate and add file info
          files.push(FileInfoSchema.parse(fileInfo));
        } catch (error) {
          console.warn(`Warning: Could not process file ${match}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Warning: Pattern '${pattern}' failed:`, error);
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function calculateChecksum(filePath: string): Promise<string> {
  try {
    // Validate and secure the file path
    const securePath = await validateFilePath(filePath);
    await validateFileAccess(securePath);
    
    const content = await readFile(securePath);
    return createHash('sha256').update(content).digest('hex');
  } catch (error) {
    if (error instanceof ImportExportError) {
      throw error;
    }
    throw new ImportExportError(
      `Failed to calculate checksum for ${filePath}`,
      'CHECKSUM_ERROR',
      { path: filePath, error }
    );
  }
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    // Validate the directory path for security
    const securePath = validateSecurePath(dirPath);
    
    await mkdir(securePath, { recursive: true });
  } catch (error) {
    if (error instanceof ImportExportError) {
      throw error;
    }
    throw new ImportExportError(
      `Failed to create directory: ${dirPath}`,
      'DIRECTORY_CREATE_ERROR',
      { path: dirPath, error }
    );
  }
}

export async function copyFile(sourcePath: string, targetPath: string): Promise<void> {
  try {
    // Validate both source and target paths
    const secureSourcePath = await validateFilePath(sourcePath);
    const secureTargetPath = validateSecurePath(targetPath);
    
    // Validate source file access and size
    await validateFileAccess(secureSourcePath);
    await validateFileSize(secureSourcePath, 1024 * 1024 * 1024); // 1GB max for copy operations
    
    await ensureDirectory(dirname(secureTargetPath));
    await fs.copyFile(secureSourcePath, secureTargetPath);
  } catch (error) {
    if (error instanceof ImportExportError) {
      throw error;
    }
    throw new ImportExportError(
      `Failed to copy file from ${sourcePath} to ${targetPath}`,
      'FILE_COPY_ERROR',
      { sourcePath, targetPath, error }
    );
  }
}

export async function readTextFile(filePath: string, encoding: 'utf8' | 'ascii' | 'base64' | 'hex' | 'binary' | 'utf16le' = 'utf8'): Promise<string> {
  try {
    // Validate and secure the file path
    const securePath = await validateFilePath(filePath);
    await validateFileAccess(securePath);
    await validateFileSize(securePath, 100 * 1024 * 1024); // 100MB max for text files
    
    return await readFile(securePath, encoding);
  } catch (error) {
    if (error instanceof ImportExportError) {
      throw error;
    }
    throw new ImportExportError(
      `Failed to read file: ${filePath}`,
      'FILE_READ_ERROR',
      { path: filePath, encoding, error }
    );
  }
}

export async function writeTextFile(
  filePath: string, 
  content: string, 
  encoding: 'utf8' | 'ascii' | 'base64' | 'hex' | 'binary' | 'utf16le' = 'utf8'
): Promise<void> {
  try {
    // Validate the file path for security
    const securePath = validateSecurePath(filePath);
    
    // Validate content size to prevent resource exhaustion
    const contentSize = Buffer.byteLength(content, encoding);
    if (contentSize > 100 * 1024 * 1024) { // 100MB limit
      throw new ImportExportError(
        `Content too large: ${contentSize} bytes (max: 100MB)`,
        'CONTENT_TOO_LARGE',
        { path: securePath, contentSize }
      );
    }
    
    await ensureDirectory(dirname(securePath));
    await writeFile(securePath, content, encoding);
  } catch (error) {
    if (error instanceof ImportExportError) {
      throw error;
    }
    throw new ImportExportError(
      `Failed to write file: ${filePath}`,
      'FILE_WRITE_ERROR',
      { path: filePath, encoding, error }
    );
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    // Validate the file path for security before checking existence
    const securePath = validateSecurePath(filePath);
    await fs.access(securePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Content format detection and parsing
 */

export function detectContentType(fileInfo: FileInfo): ContentInfo['type'] {
  const { extension, mimeType } = fileInfo;

  // Text formats
  if (['md', 'markdown', 'mdown', 'mkd'].includes(extension)) {
    return 'markdown';
  }

  if (['html', 'htm'].includes(extension)) {
    return 'html';
  }

  if (['json', 'jsonl'].includes(extension)) {
    return 'json';
  }

  if (['txt', 'text'].includes(extension)) {
    return 'text';
  }

  // Binary formats
  if (mimeType?.startsWith('image/')) {
    return 'image';
  }

  if (mimeType?.startsWith('application/') && 
      ['pdf', 'doc', 'docx', 'odt', 'rtf'].some(ext => mimeType.includes(ext))) {
    return 'document';
  }

  // Default to text for unknown formats
  return 'text';
}

/**
 * Content parsers
 */

export class MarkdownParser implements ContentParser {
  canHandle(fileInfo: FileInfo): boolean {
    return detectContentType(fileInfo) === 'markdown';
  }

  async parse(content: string, fileInfo: FileInfo): Promise<ContentInfo> {
    try {
      const parsed = matter(content);
      
      // Extract links (markdown links and wikilinks)
      const markdownLinks = Array.from(
        content.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g),
        match => match[2]
      );
      
      const wikiLinks = Array.from(
        content.matchAll(/\[\[([^\]]+)\]\]/g),
        match => match[1]
      );

      // Extract attachments (images and other media)
      const attachments = Array.from(
        content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g),
        match => match[2]
      );

      // Extract tags from content and frontmatter
      const contentTags = Array.from(
        content.matchAll(/#[\w-]+/g),
        match => match[0].substring(1)
      );

      const frontMatterTags = parsed.data.tags || [];
      const allTags = [...new Set([...contentTags, ...frontMatterTags])];

      // Extract title
      const title = parsed.data.title || 
                   content.match(/^#\s+(.+)$/m)?.[1] || 
                   fileInfo.name.replace(/\.[^.]*$/, '');

      return ContentInfoSchema.parse({
        type: 'markdown',
        title,
        content: parsed.content,
        frontMatter: parsed.data,
        links: [...markdownLinks, ...wikiLinks],
        attachments,
        tags: allTags,
        metadata: {
          hasYamlFrontMatter: parsed.matter !== '',
          wordCount: parsed.content.split(/\s+/).length,
          lineCount: parsed.content.split('\n').length,
        },
      });
    } catch (error) {
      throw new ImportExportError(
        `Failed to parse markdown content`,
        'MARKDOWN_PARSE_ERROR',
        { file: fileInfo.path, error }
      );
    }
  }
}

export class HtmlParser implements ContentParser {
  canHandle(fileInfo: FileInfo): boolean {
    return detectContentType(fileInfo) === 'html';
  }

  async parse(content: string, fileInfo: FileInfo): Promise<ContentInfo> {
    try {
      // Basic HTML parsing - extract title, links, and images
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch?.[1] || fileInfo.name.replace(/\.[^.]*$/, '');

      // Extract links
      const links = Array.from(
        content.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi),
        match => match[1]
      );

      // Extract images
      const attachments = Array.from(
        content.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi),
        match => match[1]
      );

      // Extract meta tags
      const metaTags: Record<string, any> = {};
      const metaMatches = content.matchAll(/<meta[^>]+name=["']([^"']+)["'][^>]+content=["']([^"']+)["'][^>]*>/gi);
      for (const match of metaMatches) {
        if (match[1] && match[2]) {
          metaTags[match[1]] = match[2];
        }
      }

      return ContentInfoSchema.parse({
        type: 'html',
        title,
        content,
        links,
        attachments,
        metadata: {
          metaTags,
          hasDoctype: /<!DOCTYPE/i.test(content),
        },
      });
    } catch (error) {
      throw new ImportExportError(
        `Failed to parse HTML content`,
        'HTML_PARSE_ERROR',
        { file: fileInfo.path, error }
      );
    }
  }
}

export class JsonParser implements ContentParser {
  canHandle(fileInfo: FileInfo): boolean {
    return detectContentType(fileInfo) === 'json';
  }

  async parse(content: string, fileInfo: FileInfo): Promise<ContentInfo> {
    try {
      const parsed = JSON.parse(content);
      
      return ContentInfoSchema.parse({
        type: 'json',
        title: parsed.title || parsed.name || fileInfo.name.replace(/\.[^.]*$/, ''),
        content,
        metadata: {
          jsonData: parsed,
          isArray: Array.isArray(parsed),
          keyCount: typeof parsed === 'object' ? Object.keys(parsed).length : 0,
        },
      });
    } catch (error) {
      throw new ImportExportError(
        `Failed to parse JSON content`,
        'JSON_PARSE_ERROR',
        { file: fileInfo.path, error }
      );
    }
  }
}

export class TextParser implements ContentParser {
  canHandle(fileInfo: FileInfo): boolean {
    return detectContentType(fileInfo) === 'text';
  }

  async parse(content: string, fileInfo: FileInfo): Promise<ContentInfo> {
    return ContentInfoSchema.parse({
      type: 'text',
      title: fileInfo.name.replace(/\.[^.]*$/, ''),
      content,
      metadata: {
        lineCount: content.split('\n').length,
        wordCount: content.split(/\s+/).length,
        encoding: 'utf8',
      },
    });
  }
}

/**
 * Content formatters
 */

export class MarkdownFormatter implements ContentFormatter {
  canHandle(contentInfo: ContentInfo, format: FormatType): boolean {
    return format === 'obsidian' || contentInfo.type === 'markdown';
  }

  async format(contentInfo: ContentInfo, format: FormatType): Promise<string> {
    let result = '';

    // Add front matter if present
    if (contentInfo.frontMatter && Object.keys(contentInfo.frontMatter).length > 0) {
      result += '---\n';
      for (const [key, value] of Object.entries(contentInfo.frontMatter)) {
        if (Array.isArray(value)) {
          result += `${key}: [${value.map(v => `"${v}"`).join(', ')}]\n`;
        } else if (typeof value === 'string') {
          result += `${key}: "${value}"\n`;
        } else {
          result += `${key}: ${value}\n`;
        }
      }
      result += '---\n\n';
    }

    // Add title if not in content
    if (contentInfo.title && !contentInfo.content?.startsWith('#')) {
      result += `# ${contentInfo.title}\n\n`;
    }

    // Add content
    if (contentInfo.content) {
      result += contentInfo.content;
    }

    return result;
  }
}

export class HtmlFormatter implements ContentFormatter {
  canHandle(contentInfo: ContentInfo, format: FormatType): boolean {
    return contentInfo.type === 'html';
  }

  async format(contentInfo: ContentInfo, format: FormatType): Promise<string> {
    if (contentInfo.content) {
      return contentInfo.content;
    }

    // Generate basic HTML structure
    let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
    html += `  <meta charset="UTF-8">\n`;
    html += `  <title>${contentInfo.title || 'Untitled'}</title>\n`;
    html += '</head>\n<body>\n';
    
    if (contentInfo.title) {
      html += `  <h1>${contentInfo.title}</h1>\n`;
    }
    
    html += '</body>\n</html>';
    
    return html;
  }
}

/**
 * Content processing utilities
 */

export async function parseContent(content: string, fileInfo: FileInfo): Promise<ContentInfo> {
  const parsers: ContentParser[] = [
    new MarkdownParser(),
    new HtmlParser(),
    new JsonParser(),
    new TextParser(),
  ];

  for (const parser of parsers) {
    if (parser.canHandle(fileInfo)) {
      return await parser.parse(content, fileInfo);
    }
  }

  // Fallback to text parser
  return await new TextParser().parse(content, fileInfo);
}

export async function formatContent(
  contentInfo: ContentInfo, 
  format: FormatType
): Promise<string> {
  const formatters: ContentFormatter[] = [
    new MarkdownFormatter(),
    new HtmlFormatter(),
  ];

  for (const formatter of formatters) {
    if (formatter.canHandle(contentInfo, format)) {
      return await formatter.format(contentInfo, format);
    }
  }

  // Fallback to original content or empty string
  return contentInfo.content || '';
}

/**
 * Batch processing utilities
 */

export async function processBatch<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: {
    batchSize?: number;
    concurrency?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<R[]> {
  const { batchSize = 100, concurrency = 5, onProgress } = options;
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises: Promise<R>[] = [];

    for (let j = 0; j < batch.length; j += concurrency) {
      const concurrentBatch = batch.slice(j, j + concurrency);
      const concurrentPromises = concurrentBatch.map((item, index) =>
        processor(item, i + j + index)
      );
      batchPromises.push(...concurrentPromises);
    }

    const batchResults = await Promise.allSettled(batchPromises);
    
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.warn('Batch processing error:', result.reason);
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, items.length), items.length);
    }
  }

  return results;
}

/**
 * Error aggregation utilities
 */

export class ErrorCollector {
  private errors: OperationError[] = [];
  private warnings: string[] = [];

  addError(error: Error | OperationError | string, context?: any): void {
    if (error instanceof ImportExportError) {
      this.errors.push(error.toJSON());
    } else if (error instanceof Error) {
      this.errors.push({
        code: 'UNKNOWN_ERROR',
        message: error.message,
        details: context,
        stack: error.stack,
        timestamp: new Date(),
      });
    } else if (typeof error === 'string') {
      this.errors.push({
        code: 'GENERIC_ERROR',
        message: error,
        details: context,
        timestamp: new Date(),
      });
    } else {
      this.errors.push({
        ...error,
        timestamp: error.timestamp || new Date(),
      });
    }
  }

  addWarning(warning: string): void {
    this.warnings.push(warning);
  }

  getErrors(): OperationError[] {
    return [...this.errors];
  }

  getWarnings(): string[] {
    return [...this.warnings];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  clear(): void {
    this.errors = [];
    this.warnings = [];
  }

  getSummary(): { errorCount: number; warningCount: number } {
    return {
      errorCount: this.errors.length,
      warningCount: this.warnings.length,
    };
  }
}

/**
 * Progress tracking utilities
 */

export function createBatchProgressTracker(
  operationId: string,
  totalItems: number,
  callback?: ProgressCallback
) {
  let processedItems = 0;

  return {
    async updateProgress(increment: number = 1, message?: string, data?: any): Promise<void> {
      processedItems += increment;
      
      if (callback) {
        await callback({
          id: operationId,
          type: 'progress',
          message: message || `Processed ${processedItems}/${totalItems} items`,
          current: processedItems,
          total: totalItems,
          data,
          timestamp: new Date(),
        });
      }
    },

    async complete(message?: string, data?: any): Promise<void> {
      if (callback) {
        await callback({
          id: operationId,
          type: 'complete',
          message: message || `Completed ${totalItems} items`,
          current: totalItems,
          total: totalItems,
          data,
          timestamp: new Date(),
        });
      }
    },
  };
}

/**
 * Path utilities
 */

export function sanitizeFileName(fileName: string): string {
  // Use the secure sanitization function
  return secureSanitizeFileName(fileName);
}

export async function generateUniqueFileName(basePath: string, fileName: string): Promise<string> {
  // Validate the base path for security
  const secureBasePath = validateSecurePath(basePath);
  const sanitized = sanitizeFileName(fileName);
  const ext = extname(sanitized);
  const name = basename(sanitized, ext);
  
  let counter = 1;
  let uniqueName = sanitized;
  
  // Use async fileExists and secure path validation
  while (await fileExists(join(secureBasePath, uniqueName))) {
    uniqueName = `${name}_${counter}${ext}`;
    counter++;
    
    // Prevent infinite loops
    if (counter > 10000) {
      throw new ImportExportError(
        `Could not generate unique filename after 10000 attempts`,
        'UNIQUE_FILENAME_GENERATION_ERROR',
        { basePath: secureBasePath, fileName }
      );
    }
  }
  
  return uniqueName;
}

export function resolveRelativePath(basePath: string, relativePath: string): string {
  // Validate both paths for security
  const secureBasePath = validateSecurePath(basePath);
  
  // Handle different path formats (Windows/Unix) and validate
  const normalizedPath = relativePath.replace(/\\/g, '/');
  return validateSecurePath(normalizedPath, secureBasePath);
}