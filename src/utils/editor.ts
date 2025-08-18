import { spawn } from 'child_process';
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { TriliumError } from '../error.js';

import { createLogger } from './logger.js';
import { isValidArray, getFirstElement, getElementAt, hasContent } from './type-guards.js';

/**
 * Editor configuration options
 */
export interface EditorOptions {
  editor?: string;
  wait?: boolean;
  format?: string;
  template?: string;
}

/**
 * Editor session result
 */
export interface EditorResult {
  content: string;
  cancelled: boolean;
  changed: boolean;
}

/**
 * Open content in external editor
 */
export async function openEditor(
  initialContent: string = '',
  options: EditorOptions = {}
): Promise<EditorResult> {
  const logger = createLogger(false);
  
  // Determine editor to use
  const editor = getEditor(options.editor);
  
  // Create temporary file
  const tempFile = await createTempFile(initialContent, options.format || 'md');
  
  try {
    // Open editor
    logger.debug(`Opening editor: ${editor}`);
    logger.debug(`Temp file: ${tempFile}`);
    
    const success = await spawnEditor(editor, tempFile, options.wait !== false);
    
    if (!success) {
      return {
        content: initialContent,
        cancelled: true,
        changed: false
      };
    }
    
    // Read modified content
    const newContent = await fs.readFile(tempFile, 'utf-8');
    const changed = newContent !== initialContent;
    
    return {
      content: newContent,
      cancelled: false,
      changed
    };
    
  } finally {
    // Clean up temp file
    try {
      await fs.unlink(tempFile);
    } catch (error) {
      logger.debug(`Failed to clean up temp file: ${error}`);
    }
  }
}

/**
 * Open file in external editor
 */
export async function openFile(filePath: string, options: EditorOptions = {}): Promise<boolean> {
  const logger = createLogger(false);
  
  if (!existsSync(filePath)) {
    throw new TriliumError(`File not found: ${filePath}`);
  }
  
  const editor = getEditor(options.editor);
  logger.debug(`Opening file in editor: ${editor} ${filePath}`);
  
  return spawnEditor(editor, filePath, options.wait !== false);
}

/**
 * Create a new file with template and open in editor
 */
export async function createAndEdit(
  filePath: string, 
  template: string = '', 
  options: EditorOptions = {}
): Promise<EditorResult> {
  const logger = createLogger(false);
  
  // Write template to file
  await fs.writeFile(filePath, template, 'utf-8');
  logger.debug(`Created file with template: ${filePath}`);
  
  const success = await openFile(filePath, options);
  
  if (!success) {
    return {
      content: template,
      cancelled: true,
      changed: false
    };
  }
  
  // Read final content
  const content = await fs.readFile(filePath, 'utf-8');
  const changed = content !== template;
  
  return {
    content,
    cancelled: false,
    changed
  };
}

/**
 * Determine which editor to use
 */
function getEditor(preferredEditor?: string): string {
  if (preferredEditor) {
    return preferredEditor;
  }
  
  // Check environment variables
  const envEditors = [
    process.env.TRILIUM_EDITOR,
    process.env.VISUAL,
    process.env.EDITOR
  ];
  
  for (const editor of envEditors) {
    if (editor) {
      return editor;
    }
  }
  
  // Default editors by platform
  const platform = process.platform;
  
  if (platform === 'win32') {
    return 'notepad';
  } else if (platform === 'darwin') {
    return 'open -t';
  } else {
    // Unix/Linux - try common editors
    const commonEditors = ['nano', 'vim', 'vi', 'emacs'];
    for (const editor of commonEditors) {
      if (isCommandAvailable(editor)) {
        return editor;
      }
    }
    return 'nano'; // fallback
  }
}

/**
 * Check if a command is available in PATH
 */
function isCommandAvailable(command: string): boolean {
  try {
    spawn(command, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a temporary file with content
 */
async function createTempFile(content: string, extension: string = 'txt'): Promise<string> {
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const tempFile = join(tempDir, `trilium-edit-${timestamp}-${random}.${extension}`);
  
  await fs.writeFile(tempFile, content, 'utf-8');
  return tempFile;
}

/**
 * Spawn editor process
 */
function spawnEditor(editor: string, filePath: string, wait: boolean = true): Promise<boolean> {
  return new Promise((resolve) => {
    const parts = editor.split(' ');
    const command = getFirstElement(parts, 'Editor command is empty');
    const args = [...parts.slice(1), filePath];
    
    const child = spawn(command, args, {
      stdio: wait ? 'inherit' : 'ignore',
      detached: !wait
    });
    
    if (!wait) {
      child.unref();
      resolve(true);
      return;
    }
    
    child.on('exit', (code) => {
      resolve(code === 0);
    });
    
    child.on('error', (error) => {
      console.error(`Failed to start editor: ${error.message}`);
      resolve(false);
    });
  });
}

/**
 * Prompt user to edit content inline
 */
export async function promptEdit(prompt: string, initialContent: string = ''): Promise<string> {
  console.log(`${prompt} (Press Enter to edit in external editor, Ctrl+C to cancel)`);
  
  // Simple inline editing for now - in a full implementation you might use
  // a readline interface or prompt library
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.once('data', async (data) => {
      const key = data.toString();
      
      if (key === '\r' || key === '\n') {
        // Enter pressed - open external editor
        try {
          const result = await openEditor(initialContent);
          resolve(result.content);
        } catch (error) {
          console.error(`Editor error: ${error}`);
          resolve(initialContent);
        }
      } else if (key === '\u0003') {
        // Ctrl+C pressed
        console.log('\nCancelled');
        resolve(initialContent);
      } else {
        // Other key - return initial content
        resolve(initialContent);
      }
      
      process.stdin.setRawMode(false);
    });
  });
}

/**
 * Format content with syntax highlighting for terminal display
 */
export function formatContentPreview(content: string, maxLines: number = 10): string {
  const lines = content.split('\n');
  
  if (lines.length <= maxLines) {
    return content;
  }
  
  const preview = lines.slice(0, maxLines).join('\n');
  const remaining = lines.length - maxLines;
  
  return `${preview}\n... (${remaining} more lines)`;
}

/**
 * Validate content format
 */
export function validateContent(content: string, format: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  switch (format.toLowerCase()) {
    case 'json':
      try {
        JSON.parse(content);
      } catch (error) {
        errors.push(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      break;
      
    case 'html': {
      // Basic HTML validation - check for balanced tags
      const tagMatches = content.match(/<\/?[a-zA-Z][^>]*>/g) || [];
      const openTags: string[] = [];
      
      for (const tag of tagMatches) {
        if (tag.startsWith('</')) {
          const tagParts = tag.slice(2, -1).split(' ');
          if (!isValidArray(tagParts)) {
            continue;
          }
          const tagName = getFirstElement(tagParts, 'Tag name is empty');
          const lastOpen = openTags[openTags.length - 1];
          if (lastOpen === tagName) {
            openTags.pop();
          } else {
            errors.push(`Unmatched closing tag: ${tag}`);
          }
        } else if (!tag.endsWith('/>')) {
          const tagParts = tag.slice(1, -1).split(' ');
          if (!isValidArray(tagParts)) {
            continue;
          }
          const tagName = getFirstElement(tagParts, 'Tag name is empty');
          openTags.push(tagName);
        }
      }
      
      if (openTags.length > 0) {
        errors.push(`Unclosed tags: ${openTags.join(', ')}`);
      }
      break;
    }
      
    default:
      // No specific validation for other formats
      break;
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Extract title from content based on format
 */
export function extractTitle(content: string, format: string = 'markdown'): string | null {
  if (!content.trim()) {
    return null;
  }
  
  switch (format.toLowerCase()) {
    case 'markdown':
    case 'md': {
      // Look for first heading
      const mdMatch = content.match(/^#+\s+(.+)$/m);
      if (mdMatch && isValidArray(mdMatch, 2)) {
        const title = getElementAt(mdMatch, 1, 'Markdown title not found');
        return title.trim();
      }
      return null;
    }
      
    case 'html': {
      // Look for h1-h6 tags
      const htmlMatch = content.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);
      if (htmlMatch && isValidArray(htmlMatch, 2)) {
        const title = getElementAt(htmlMatch, 1, 'HTML title not found');
        return title.trim();
      }
      return null;
    }
      
    default: {
      // Use first non-empty line
      const firstLine = content.split('\n').find(line => line.trim());
      return firstLine ? firstLine.trim() : null;
    }
  }
}