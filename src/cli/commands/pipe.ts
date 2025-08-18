import { readFileSync } from 'fs';

import chalk from 'chalk';
import type { Command } from 'commander';

import type { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import type { NoteType } from '../../types/api.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import { isDefined, getElementAt, hasContent } from '../../utils/type-guards.js';
import type { PipeOptions } from '../types.js';

/**
 * Set up pipe command for creating notes from stdin
 */
export function setupPipeCommand(program: Command): void {
  program
    .command('pipe')
    .description('Create note(s) from stdin content')
    .option('-t, --title <title>', 'note title')
    .option('-p, --parent <id>', 'parent note ID')
    .option('--note-type <type>', 'note type (text, code, html, markdown, etc.)', 'auto')
    .option('-f, --format <format>', 'input format (auto, markdown, html, json, code, text)', 'auto')
    .option('--tags <tags>', 'tags to add (comma-separated)')
    .option('-l, --labels <labels>', 'labels to add (comma-separated)')
    .option('-a, --attributes <attr>', 'custom attributes (key=value format)', collect, [])
    .option('--append-to <id>', 'append to existing note instead of creating new')
    .option('--template <id>', 'template note ID to use for wrapping content')
    .option('--batch-delimiter <delimiter>', 'delimiter for batch mode (creates multiple notes)')
    .option('--language <lang>', 'language hint for code detection')
    .option('--strip-html', 'strip HTML tags when format is HTML')
    .option('--extract-title', 'extract title from content (first heading or HTML title)', true)
    .option('-q, --quiet', 'quiet mode - only output note ID(s)')
    .action(async (options: PipeOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        // Read content from stdin
        const content = await readStdin();
        
        if (!content.trim()) {
          throw new TriliumError('No content provided via stdin');
        }

        const client = await createTriliumClient(options);
        
        // Handle batch mode if delimiter is specified
        if (options.batchDelimiter) {
          await handleBatchMode(content, options, client, logger);
          return;
        }
        
        // Handle single note creation
        const note = await createNoteFromContent(content, options, client, logger);
        
        if (options.quiet) {
          console.log(note.noteId);
        } else {
          const output = formatOutput([note], options.output, [
            'noteId', 'title', 'type', 'dateCreated'
          ]);
          console.log(output);
          
          if (options.output === 'table') {
            logger.info(chalk.green(`Note created successfully: ${note.noteId}`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Read content from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let content = '';
    
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      content += chunk;
    });
    
    process.stdin.on('end', () => {
      resolve(content);
    });
    
    process.stdin.on('error', reject);
    
    // Handle case where no stdin is available
    setTimeout(() => {
      if (content === '' && process.stdin.isTTY) {
        reject(new TriliumError('No stdin content available. Pipe content to this command.'));
      }
    }, 100);
  });
}

/**
 * Handle batch mode - create multiple notes
 */
async function handleBatchMode(
  content: string, 
  options: PipeOptions, 
  client: TriliumClient, 
  logger: any
): Promise<void> {
  if (!isDefined(options.batchDelimiter)) {
    throw new Error('Batch delimiter is required for batch mode');
  }
  const parts = content.split(options.batchDelimiter);
  const notes = [];
  
  logger.info(`Creating ${parts.length} notes from batch content...`);
  
  for (let i = 0; i < parts.length; i++) {
    const part = getElementAt(parts, i, `Failed to get part at index ${i}`);
    const trimmedPart = part.trim();
    if (!trimmedPart) continue;
    
    try {
      const note = await createNoteFromContent(part, {
        ...options,
        title: options.title ? `${options.title} ${i + 1}` : undefined
      }, client, logger);
      notes.push(note);
    } catch (error) {
      logger.error(`Failed to create note ${i + 1}:`, error);
    }
  }
  
  if (options.quiet) {
    notes.forEach(note => console.log(note.note ? note.note.noteId : note.noteId));
  } else {
    const output = formatOutput(notes, options.output, [
      'noteId', 'title', 'type', 'dateCreated'
    ]);
    console.log(output);
    
    if (options.output === 'table') {
      logger.info(chalk.green(`Created ${notes.length} notes successfully`));
    }
  }
}

/**
 * Create a single note from content
 */
async function createNoteFromContent(
  content: string, 
  options: PipeOptions, 
  client: TriliumClient,
  logger: any
): Promise<any> {
  // Process content based on format
  let processedContent = content;
  let detectedType = options.noteType;
  let extractedTitle = options.title;
  
  // Auto-detect format and type if needed
  if (options.format === 'auto') {
    const detected = detectContentFormat(content);
    options.format = detected.format;
    if (detectedType === 'auto') {
      detectedType = detected.type;
    }
  }
  
  // Extract title if requested
  if (options.extractTitle && !extractedTitle) {
    extractedTitle = extractTitleFromContent(content, options.format);
  }
  
  // Process content based on format
  processedContent = processContentByFormat(content, options);
  
  // Handle append mode
  if (options.appendTo) {
    return await client.appendToNote(options.appendTo, processedContent);
  }
  
  // Create new note
  const noteData: any = {
    title: extractedTitle || 'Piped Content',
    content: processedContent,
    type: (detectedType || 'text') as NoteType,
    parentNoteId: options.parent || 'root',
  };
  
  // Apply template if specified
  if (options.template) {
    const template = await client.getNoteWithContent(options.template);
    noteData.content = template.content.replace('{{CONTENT}}', processedContent);
  }
  
  const result = await client.createNote(noteData);
  
  // Add attributes if specified
  if (options.tags) {
    const tags = options.tags.split(',').map(t => t.trim());
    for (const tag of tags) {
      await client.createAttribute({
        noteId: result.note.noteId,
        type: 'label',
        name: tag,
        value: ''
      });
    }
  }
  
  if (options.labels) {
    const labels = options.labels.split(',').map(l => l.trim());
    for (const label of labels) {
      await client.createAttribute({
        noteId: result.note.noteId,
        type: 'label',
        name: label,
        value: ''
      });
    }
  }
  
  if (options.attributes) {
    for (const attr of options.attributes) {
      const [name, value] = attr.split('=', 2);
      await client.createAttribute({
        noteId: result.note.noteId,
        type: 'label',
        name: name?.trim() || '',
        value: value ? value.trim() : ''
      });
    }
  }
  
  return result;
}

/**
 * Detect content format and type
 */
function detectContentFormat(content: string): { format: string; type: string } {
  const trimmed = content.trim();
  
  // JSON detection
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return { format: 'json', type: 'code' };
    } catch {
      // Not valid JSON
    }
  }
  
  // HTML detection
  if (trimmed.includes('<html>') || trimmed.includes('<!DOCTYPE') || 
      (trimmed.includes('<') && trimmed.includes('>'))) {
    return { format: 'html', type: 'html' };
  }
  
  // Markdown detection
  if (trimmed.includes('# ') || trimmed.includes('## ') || 
      trimmed.includes('```') || trimmed.includes('* ') || 
      trimmed.includes('- ')) {
    return { format: 'markdown', type: 'text' };
  }
  
  // Code detection (common patterns)
  const codePatterns = [
    /function\s+\w+\s*\(/,
    /class\s+\w+/,
    /import\s+.*from/,
    /def\s+\w+\s*\(/,
    /public\s+(class|interface|enum)/,
    /console\.(log|error|warn)/
  ];
  
  if (codePatterns.some(pattern => pattern.test(trimmed))) {
    return { format: 'code', type: 'code' };
  }
  
  return { format: 'text', type: 'text' };
}

/**
 * Extract title from content
 */
function extractTitleFromContent(content: string, format?: string): string | undefined {
  const lines = content.split('\n');
  
  // HTML title extraction
  if (format === 'html') {
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) return titleMatch[1];
    
    const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match?.[1]) return h1Match[1].replace(/<[^>]+>/g, '');
  }
  
  // Markdown title extraction
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.substring(2).trim();
    }
  }
  
  // First non-empty line as title
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && trimmed.length < 100) {
      return trimmed;
    }
  }
  
  return undefined;
}

/**
 * Process content based on format
 */
function processContentByFormat(content: string, options: PipeOptions): string {
  let processed = content;
  
  if (options.stripHtml && (options.format === 'html' || content.includes('<'))) {
    processed = processed.replace(/<[^>]+>/g, '');
  }
  
  // Additional processing based on language hint
  if (options.language && options.noteType === 'code') {
    // Could add syntax highlighting or validation here
  }
  
  return processed;
}

/**
 * Helper function to collect multiple values
 */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}