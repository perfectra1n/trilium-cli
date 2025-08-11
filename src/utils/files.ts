import { promises as fs } from 'fs';
import path from 'path';
import { fileTypeFromBuffer } from 'file-type';

import { FileSystemError } from '../error.js';
import type { MimeType } from '../types/common.js';

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new FileSystemError(
      `Failed to create directory: ${dirPath}`,
      dirPath,
      error as Error
    );
  }
}

/**
 * Read file content as string
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new FileSystemError(
      `Failed to read file: ${filePath}`,
      filePath,
      error as Error
    );
  }
}

/**
 * Read file content as buffer
 */
export async function readFileBuffer(filePath: string): Promise<Buffer> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    throw new FileSystemError(
      `Failed to read file: ${filePath}`,
      filePath,
      error as Error
    );
  }
}

/**
 * Write string content to file
 */
export async function writeFile(filePath: string, content: string): Promise<void> {
  try {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new FileSystemError(
      `Failed to write file: ${filePath}`,
      filePath,
      error as Error
    );
  }
}

/**
 * Write buffer content to file
 */
export async function writeFileBuffer(filePath: string, content: Buffer): Promise<void> {
  try {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content);
  } catch (error) {
    throw new FileSystemError(
      `Failed to write file: ${filePath}`,
      filePath,
      error as Error
    );
  }
}

/**
 * Get file stats
 */
export async function getFileStats(filePath: string): Promise<{
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  mtime: Date;
  ctime: Date;
}> {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      mtime: stats.mtime,
      ctime: stats.ctime,
    };
  } catch (error) {
    throw new FileSystemError(
      `Failed to get file stats: ${filePath}`,
      filePath,
      error as Error
    );
  }
}

/**
 * Get MIME type of file
 */
export async function getMimeType(filePath: string): Promise<MimeType> {
  try {
    const buffer = await readFileBuffer(filePath);
    const fileType = await fileTypeFromBuffer(buffer);
    if (fileType) {
      return fileType.mime as MimeType;
    }

    // Fallback to extension-based detection
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, MimeType> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.json': 'application/json',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.css': 'text/css',
      '.xml': 'text/xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  } catch (error) {
    throw new FileSystemError(
      `Failed to determine MIME type: ${filePath}`,
      filePath,
      error as Error
    );
  }
}

/**
 * List files in directory with optional filtering
 */
export async function listFiles(
  dirPath: string,
  options: {
    recursive?: boolean;
    filter?: (filePath: string) => boolean;
    includeDirectories?: boolean;
  } = {}
): Promise<string[]> {
  const { recursive = false, filter, includeDirectories = false } = options;

  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    const results: string[] = [];

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);

      if (item.isDirectory()) {
        if (includeDirectories) {
          results.push(fullPath);
        }

        if (recursive) {
          const subItems = await listFiles(fullPath, options);
          results.push(...subItems);
        }
      } else if (item.isFile()) {
        if (!filter || filter(fullPath)) {
          results.push(fullPath);
        }
      }
    }

    return results;
  } catch (error) {
    throw new FileSystemError(
      `Failed to list files in directory: ${dirPath}`,
      dirPath,
      error as Error
    );
  }
}

/**
 * Copy file from source to destination
 */
export async function copyFile(src: string, dest: string): Promise<void> {
  try {
    await ensureDir(path.dirname(dest));
    await fs.copyFile(src, dest);
  } catch (error) {
    throw new FileSystemError(
      `Failed to copy file from ${src} to ${dest}`,
      src,
      error as Error
    );
  }
}

/**
 * Delete file
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    throw new FileSystemError(
      `Failed to delete file: ${filePath}`,
      filePath,
      error as Error
    );
  }
}