import chalk from 'chalk';
import type { Command } from 'commander';

import type { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import { isDefined } from '../../utils/type-guards.js';
import type { QuickOptions } from '../types.js';

/**
 * Set up quick capture command
 */
export function setupQuickCommand(program: Command): void {
  program
    .command('quick')
    .description('Quick capture mode for rapid note creation')
    .argument('[content]', 'note content (if not provided, reads from stdin)')
    .option('-t, --title <title>', 'note title (auto-generated if not provided)')
    .option('--tags <tags>', 'tags to add (comma-separated)')
    .option('-f, --format <format>', 'input format (auto, markdown, json, todo)', 'auto')
    .option('--batch <delimiter>', 'batch mode delimiter')
    .option('-q, --quiet', 'quiet mode - only output note IDs')
    .option('--inbox <id>', 'inbox note ID (overrides config)')
    .action(async (content: string | undefined, options: QuickOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        // Get content from argument or stdin
        let finalContent = content;
        if (!finalContent) {
          finalContent = await readStdin();
        }
        
        if (!finalContent.trim()) {
          throw new TriliumError('No content provided');
        }
        
        const client = await createTriliumClient(options);
        const config = new Config();
        await config.load();
        
        // Get inbox from options or config
        const profile = config.getCurrentProfile();
        const inboxId = options.inbox || (profile as any).inboxNoteId;
        
        if (!inboxId) {
          throw new TriliumError('No inbox note configured. Set inbox note ID in profile or use --inbox option.');
        }
        
        // Handle batch mode
        if (options.batch) {
          const notes = await createBatchNotes(finalContent, options, client, inboxId, logger);
          
          if (options.quiet) {
            notes.forEach(note => console.log(note.noteId));
          } else {
            const output = formatOutput(notes, options.output, [
              'noteId', 'title', 'type', 'tags'
            ]);
            console.log(output);
            
            if (options.output === 'table') {
              logger.info(chalk.green(`Created ${notes.length} notes in quick capture`));
            }
          }
          return;
        }
        
        // Single note creation
        const note = await createQuickNote(finalContent, options, client, inboxId);
        
        if (options.quiet) {
          console.log(note.noteId);
        } else {
          const output = formatOutput([note], options.output, [
            'noteId', 'title', 'type', 'tags'
          ]);
          console.log(output);
          
          if (options.output === 'table') {
            logger.info(chalk.green(`Quick note created: ${note.noteId}`));
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
    
    if (process.stdin.isTTY) {
      reject(new TriliumError('No content provided and stdin is not available'));
      return;
    }
    
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      content += chunk;
    });
    
    process.stdin.on('end', () => {
      resolve(content);
    });
    
    process.stdin.on('error', reject);
  });
}

/**
 * Create batch notes from delimited content
 */
async function createBatchNotes(
  content: string,
  options: QuickOptions,
  client: TriliumClient,
  inboxId: string,
  logger: any
): Promise<any[]> {
  if (!isDefined(options.batch)) {
    throw new Error('Batch delimiter is required for batch mode');
  }
  const parts = content.split(options.batch);
  const notes = [];
  
  logger.info(`Creating ${parts.length} quick notes...`);
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]?.trim() || '';
    if (!part) continue;
    
    try {
      const note = await createQuickNote(part, {
        ...options,
        title: options.title ? `${options.title} ${i + 1}` : undefined
      }, client, inboxId);
      notes.push(note);
    } catch (error) {
      logger.error(`Failed to create quick note ${i + 1}:`, error);
    }
  }
  
  return notes;
}

/**
 * Create a single quick note
 */
async function createQuickNote(
  content: string,
  options: QuickOptions,
  client: TriliumClient,
  inboxId: string
): Promise<any> {
  // Auto-detect format and generate title
  const processed = processQuickContent(content, options);
  
  // Create the note
  const noteData: any = {
    title: options.title || processed.title || generateTitleFromContent(content),
    content: processed.content,
    type: processed.type,
    parentNoteId: inboxId,
  };
  
  const result = await client.createNote(noteData);
  
  // Add tags if specified
  const tags = [];
  if (options.tags) {
    const tagList = options.tags.split(',').map(t => t.trim());
    for (const tag of tagList) {
      await client.createAttribute({
        noteId: result.note.noteId,
        type: 'label',
        name: tag,
        value: ''
      });
      tags.push(tag);
    }
  }
  
  // Add quick capture label
  await client.createAttribute({
    noteId: result.note.noteId,
    type: 'label',
    name: 'quickCapture',
    value: new Date().toISOString()
  });
  
  return { ...result, tags };
}

/**
 * Process quick content based on format
 */
function processQuickContent(content: string, options: QuickOptions): {
  content: string;
  type: string;
  title?: string;
} {
  const trimmed = content.trim();
  
  switch (options.format) {
    case 'todo':
      return processTodoFormat(trimmed);
    case 'json':
      return { content: formatJson(trimmed), type: 'code' };
    case 'markdown':
      return processMarkdownFormat(trimmed);
    case 'auto':
    default:
      return autoProcessContent(trimmed);
  }
}

/**
 * Process TODO format
 */
function processTodoFormat(content: string): {
  content: string;
  type: string;
  title?: string;
} {
  const lines = content.split('\n');
  let title = 'TODO List';
  let processedContent = '';
  
  // Extract title from first line if it's not a todo item
  if (lines.length > 0 && lines[0] && !lines[0].match(/^[-*\s]*\[[\sx]\]/i)) {
    title = lines[0].trim();
    lines.shift();
  }
  
  // Convert to proper todo format
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      processedContent += '\n';
      continue;
    }
    
    if (trimmed.match(/^[-*\s]*\[[\sx]\]/i)) {
      // Already a todo item
      processedContent += `${trimmed}\n`;
    } else {
      // Convert to todo item
      processedContent += `- [ ] ${trimmed}\n`;
    }
  }
  
  return {
    content: processedContent,
    type: 'text',
    title
  };
}

/**
 * Process markdown format
 */
function processMarkdownFormat(content: string): {
  content: string;
  type: string;
  title?: string;
} {
  const lines = content.split('\n');
  let title;
  
  // Extract title from first heading
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      title = trimmed.substring(2).trim();
      break;
    }
  }
  
  return {
    content,
    type: 'text',
    title
  };
}

/**
 * Auto-process content based on patterns
 */
function autoProcessContent(content: string): {
  content: string;
  type: string;
  title?: string;
} {
  // Check for todo patterns
  if (content.match(/^[-*\s]*\[[\sx]\]|\btodo\b|\btask\b/im)) {
    return processTodoFormat(content);
  }
  
  // Check for JSON
  const trimmed = content.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return { content: formatJson(trimmed), type: 'code' };
    } catch {
      // Not valid JSON
    }
  }
  
  // Check for markdown patterns
  if (content.includes('# ') || content.includes('## ') || 
      content.includes('```') || content.includes('* ')) {
    return processMarkdownFormat(content);
  }
  
  // Default to plain text
  return {
    content,
    type: 'text'
  };
}

/**
 * Format JSON content
 */
function formatJson(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}

/**
 * Generate title from content
 */
function generateTitleFromContent(content: string): string {
  const lines = content.split('\n');
  
  // Use first non-empty line, truncated
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      let title = trimmed;
      
      // Remove markdown formatting
      title = title.replace(/^#+\s*/, ''); // Remove heading markers
      title = title.replace(/\*\*(.*?)\*\*/g, '$1'); // Remove bold
      title = title.replace(/\*(.*?)\*/g, '$1'); // Remove italic
      title = title.replace(/`(.*?)`/g, '$1'); // Remove code
      
      // Truncate if too long
      if (title.length > 50) {
        title = title.substring(0, 47) + '...';
      }
      
      return title;
    }
  }
  
  return 'Quick Note';
}