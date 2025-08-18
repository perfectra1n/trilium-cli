#!/usr/bin/env node

/**
 * Minimal Trilium CLI - Core CRUD functionality
 * 
 * This is a simplified implementation focusing on:
 * - Create notes
 * - Read/Get notes  
 * - Update notes
 * - Delete notes
 * - Search notes
 */

import chalk from 'chalk';
import { Command } from 'commander';

import { TriliumClient } from './api/client.js';
import type { ApiClientConfig, CreateNoteDef, UpdateNoteDef } from './types/api.js';

// Configuration management
interface CliConfig {
  serverUrl: string;
  apiToken: string;
  debugMode?: boolean;
}

// Load configuration from environment or defaults
function loadConfig(): CliConfig {
  const serverUrl = process.env.TRILIUM_SERVER_URL || 'http://localhost:8080';
  const apiToken = process.env.TRILIUM_API_TOKEN || '';
  const debugMode = process.env.TRILIUM_DEBUG === 'true';

  if (!apiToken) {
    console.error(chalk.red('Error: TRILIUM_API_TOKEN environment variable is required'));
    console.error(chalk.yellow('Set it with: export TRILIUM_API_TOKEN="your-token"'));
    process.exit(1);
  }

  return { serverUrl, apiToken, debugMode };
}

// Create API client instance
function createClient(config: CliConfig): TriliumClient {
  const clientConfig: ApiClientConfig = {
    baseUrl: config.serverUrl,
    apiToken: config.apiToken,
    debugMode: config.debugMode
  };
  
  return new TriliumClient(clientConfig);
}

// Format note output for display
function displayNote(note: any, includeContent: boolean = false): void {
  console.log(chalk.cyan('─'.repeat(50)));
  console.log(chalk.bold('Note ID:'), note.noteId);
  console.log(chalk.bold('Title:'), note.title);
  console.log(chalk.bold('Type:'), note.type);
  console.log(chalk.bold('Created:'), note.dateCreated);
  console.log(chalk.bold('Modified:'), note.dateModified);
  
  if (includeContent && note.content) {
    console.log(chalk.bold('\nContent:'));
    console.log(note.content);
  }
  console.log(chalk.cyan('─'.repeat(50)));
}

// Main CLI setup
async function main() {
  const program = new Command();
  const config = loadConfig();
  const client = createClient(config);

  program
    .name('trilium-minimal')
    .description('Minimal Trilium CLI for basic note operations')
    .version('0.1.0');

  // Test connection command
  program
    .command('test')
    .description('Test connection to Trilium server')
    .action(async () => {
      try {
        console.log(chalk.blue('Testing connection to Trilium server...'));
        const appInfo = await client.testConnection();
        console.log(chalk.green('✓ Connection successful!'));
        console.log(chalk.gray('Server version:'), appInfo.appVersion);
        console.log(chalk.gray('Database version:'), appInfo.dbVersion);
      } catch (error) {
        console.error(chalk.red('✗ Connection failed:'), error);
        process.exit(1);
      }
    });

  // Create note command
  program
    .command('create')
    .description('Create a new note')
    .requiredOption('-t, --title <title>', 'Note title')
    .option('-c, --content <content>', 'Note content')
    .option('-p, --parent <parentId>', 'Parent note ID', 'root')
    .option('--type <type>', 'Note type (text, code, etc.)', 'text')
    .action(async (options) => {
      try {
        console.log(chalk.blue('Creating note...'));
        
        const noteDef: CreateNoteDef = {
          parentNoteId: options.parent,
          title: options.title,
          type: options.type,
          content: options.content || ''
        };

        const result = await client.createNote(noteDef);
        console.log(chalk.green('✓ Note created successfully!'));
        displayNote(result.note);
        console.log(chalk.gray('Branch ID:'), result.branch.branchId);
      } catch (error) {
        console.error(chalk.red('✗ Failed to create note:'), error);
        process.exit(1);
      }
    });

  // Get note command
  program
    .command('get <noteId>')
    .description('Get a note by ID')
    .option('-c, --content', 'Include note content')
    .action(async (noteId, options) => {
      try {
        console.log(chalk.blue(`Getting note ${noteId}...`));
        
        let note;
        if (options.content) {
          note = await client.getNoteWithContent(noteId);
        } else {
          note = await client.getNote(noteId);
        }
        
        console.log(chalk.green('✓ Note retrieved successfully!'));
        displayNote(note, options.content);
      } catch (error) {
        console.error(chalk.red('✗ Failed to get note:'), error);
        process.exit(1);
      }
    });

  // Update note command
  program
    .command('update <noteId>')
    .description('Update a note')
    .option('-t, --title <title>', 'New title')
    .option('-c, --content <content>', 'New content')
    .option('--type <type>', 'New type')
    .option('--protected', 'Mark as protected')
    .action(async (noteId, options) => {
      try {
        console.log(chalk.blue(`Updating note ${noteId}...`));
        
        // Update metadata if any provided
        const updates: UpdateNoteDef = {};
        if (options.title) updates.title = options.title;
        if (options.type) updates.type = options.type;
        if (options.protected) updates.isProtected = true;
        
        if (Object.keys(updates).length > 0) {
          const updatedNote = await client.updateNote(noteId, updates);
          console.log(chalk.green('✓ Note metadata updated!'));
          displayNote(updatedNote);
        }
        
        // Update content if provided
        if (options.content) {
          await client.updateNoteContent(noteId, options.content);
          console.log(chalk.green('✓ Note content updated!'));
        }
        
        if (Object.keys(updates).length === 0 && !options.content) {
          console.log(chalk.yellow('No updates provided'));
        }
      } catch (error) {
        console.error(chalk.red('✗ Failed to update note:'), error);
        process.exit(1);
      }
    });

  // Delete note command
  program
    .command('delete <noteId>')
    .description('Delete a note')
    .option('-f, --force', 'Skip confirmation')
    .action(async (noteId, options) => {
      try {
        if (!options.force) {
          console.log(chalk.yellow(`Warning: This will delete note ${noteId}`));
          console.log(chalk.yellow('Use --force to confirm'));
          process.exit(0);
        }
        
        console.log(chalk.blue(`Deleting note ${noteId}...`));
        await client.deleteNote(noteId);
        console.log(chalk.green('✓ Note deleted successfully!'));
      } catch (error) {
        console.error(chalk.red('✗ Failed to delete note:'), error);
        process.exit(1);
      }
    });

  // Search notes command
  program
    .command('search <query>')
    .description('Search for notes')
    .option('-l, --limit <limit>', 'Maximum results', '10')
    .option('-a, --archived', 'Include archived notes')
    .option('-f, --fast', 'Use fast search')
    .action(async (query, options) => {
      try {
        console.log(chalk.blue(`Searching for: "${query}"...`));
        
        const limit = parseInt(options.limit, 10);
        const results = await client.searchNotes(
          query, 
          options.fast || false,
          options.archived || false,
          limit
        );
        
        if (results.length === 0) {
          console.log(chalk.yellow('No notes found'));
        } else {
          console.log(chalk.green(`✓ Found ${results.length} note(s):`));
          console.log(chalk.cyan('─'.repeat(50)));
          
          for (const result of results) {
            console.log(chalk.bold('Note ID:'), result.noteId);
            console.log(chalk.bold('Title:'), result.title);
            console.log(chalk.cyan('─'.repeat(30)));
          }
        }
      } catch (error) {
        console.error(chalk.red('✗ Search failed:'), error);
        process.exit(1);
      }
    });

  // List child notes command
  program
    .command('list [parentId]')
    .description('List child notes of a parent (default: root)')
    .action(async (parentId = 'root') => {
      try {
        console.log(chalk.blue(`Listing children of ${parentId}...`));
        
        const children = await client.getChildNotes(parentId);
        
        if (children.length === 0) {
          console.log(chalk.yellow('No child notes found'));
        } else {
          console.log(chalk.green(`✓ Found ${children.length} child note(s):`));
          console.log(chalk.cyan('─'.repeat(50)));
          
          for (const child of children) {
            console.log(`• ${chalk.bold(child.title)} (${chalk.gray(child.noteId)})`);
          }
        }
      } catch (error) {
        console.error(chalk.red('✗ Failed to list notes:'), error);
        process.exit(1);
      }
    });

  // Quick note command
  program
    .command('quick <content>')
    .description('Create a quick note in inbox')
    .option('-t, --title <title>', 'Note title')
    .option('--tags <tags>', 'Comma-separated tags')
    .action(async (content, options) => {
      try {
        console.log(chalk.blue('Creating quick note...'));
        
        const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [];
        
        const note = await client.quickCapture({
          title: options.title,
          content,
          tags,
          metadata: {}
        });
        
        console.log(chalk.green('✓ Quick note created!'));
        displayNote(note);
      } catch (error) {
        console.error(chalk.red('✗ Failed to create quick note:'), error);
        process.exit(1);
      }
    });

  // Parse command line arguments
  program.parse(process.argv);

  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

// Run the CLI
main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});