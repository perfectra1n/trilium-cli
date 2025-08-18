#!/usr/bin/env node

/**
 * Core CLI implementation with essential Trilium ETAPI functionality
 * Focuses on working commands without complex dependencies
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { resolve, dirname } from 'path';

import chalk from 'chalk';
import { Command } from 'commander';

import { TriliumClient } from './api/client.js';
import { Config } from './config/index.js';
import { ApiError, AuthError, ValidationError, TriliumError } from './error.js';
import { createLogger } from './utils/logger.js';

// Core types
interface CoreCliOptions {
  profile?: string;
  url?: string;
  token?: string;
  verbose?: boolean;
  json?: boolean;
  debug?: boolean;
}

interface NoteOptions extends CoreCliOptions {
  content?: string;
  type?: string;
  parent?: string;
  attribute?: string[];
  label?: string[];
  relation?: string[];
}

interface SearchOptions extends CoreCliOptions {
  limit?: number;
  orderBy?: string;
  orderDirection?: string;
  includeContent?: boolean;
  includeAttributes?: boolean;
}

// Utility functions
function getConfig(options: CoreCliOptions): { url: string; token: string } {
  const config = new Config();
  
  // Try to get current profile or use provided profile name
  let url = options.url || process.env.TRILIUM_URL;
  let token = options.token || process.env.TRILIUM_TOKEN;
  
  if (!url || !token) {
    try {
      const profile = config.getCurrentProfile();
      if (!url) url = profile.serverUrl;
      if (!token) token = profile.apiToken;
    } catch (err) {
      // No profile configured, use defaults
      if (!url) url = 'http://localhost:9999';
    }
  }
  
  if (!token) {
    console.error(chalk.red('Error: No API token provided. Use --token, TRILIUM_TOKEN env var, or configure a profile'));
    process.exit(1);
  }
  
  return { url, token };
}

async function createClient(options: CoreCliOptions): Promise<TriliumClient> {
  const { url, token } = getConfig(options);
  const logger = createLogger(options.verbose || false);
  
  if (options.verbose) {
    logger.info(`Connecting to Trilium at ${url}`);
  }
  
  return new TriliumClient({
    baseUrl: url,
    apiToken: token,
    debugMode: options.debug || false,
  });
}

function formatOutput(data: any, options: CoreCliOptions): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    // Simple formatted output
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item.noteId) {
          console.log(`${chalk.cyan(item.noteId)} - ${item.title || 'Untitled'}`);
          if (item.type) console.log(`  Type: ${item.type}`);
          if (item.dateCreated) console.log(`  Created: ${item.dateCreated}`);
        } else {
          console.log(JSON.stringify(item, null, 2));
        }
      });
    } else if (data.noteId) {
      console.log(`${chalk.cyan('Note ID:')} ${data.noteId}`);
      console.log(`${chalk.cyan('Title:')} ${data.title || 'Untitled'}`);
      if (data.type) console.log(`${chalk.cyan('Type:')} ${data.type}`);
      if (data.content !== undefined) console.log(`${chalk.cyan('Content:')} ${data.content}`);
      if (data.dateCreated) console.log(`${chalk.cyan('Created:')} ${data.dateCreated}`);
      if (data.dateModified) console.log(`${chalk.cyan('Modified:')} ${data.dateModified}`);
    } else {
      console.log(data);
    }
  }
}

function handleError(error: any): void {
  if (error instanceof ApiError) {
    console.error(chalk.red(`API Error: ${error.message}`));
    if ('statusCode' in error && error.statusCode) {
      console.error(chalk.yellow(`Status Code: ${error.statusCode}`));
    }
  } else if (error instanceof AuthError) {
    console.error(chalk.red(`Authentication Error: ${error.message}`));
    console.error(chalk.yellow('Please check your API token'));
  } else if (error instanceof ValidationError) {
    console.error(chalk.red(`Validation Error: ${error.message}`));
  } else if (error instanceof TriliumError) {
    console.error(chalk.red(`Trilium Error: ${error.message}`));
  } else {
    console.error(chalk.red(`Error: ${error.message || error}`));
    if (error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
  }
  process.exit(1);
}

// Parse attributes from command line
function parseAttributes(attrs: string[]): Array<{ name: string; value: string; type: 'label' | 'relation' }> {
  const result = [];
  for (const attr of attrs) {
    const [name, ...valueParts] = attr.split('=');
    const value = valueParts.join('=') || '';
    // Determine type based on prefix or default to label
    const type = (name?.startsWith('~') ? 'relation' : 'label') as 'label' | 'relation';
    const cleanName = name?.replace(/^[~#]/, '') || '';
    if (cleanName) {
      result.push({ name: cleanName, value, type });
    }
  }
  return result;
}

// Main CLI setup
const program = new Command();

program
  .name('trilium-core')
  .description('Core Trilium Notes CLI with essential ETAPI functionality')
  .version('0.1.0')
  .option('-p, --profile <name>', 'configuration profile to use', 'default')
  .option('-u, --url <url>', 'Trilium server URL')
  .option('-t, --token <token>', 'API token')
  .option('-v, --verbose', 'verbose output')
  .option('-j, --json', 'output as JSON')
  .option('-d, --debug', 'debug mode');

// Configuration commands
const configCmd = program
  .command('config')
  .description('Manage configuration');

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action(async (key: string, value: string, cmdOptions: any) => {
    const options = program.opts();
    const profileName = options.profile || 'default';
    const config = new Config();
    
    // Handle common config keys
    if (key === 'url' || key === 'token') {
      try {
        let profile = config.getProfiles().find(p => p.name === profileName);
        if (!profile) {
          profile = {
            name: profileName,
            serverUrl: key === 'url' ? value : 'http://localhost:9999',
            apiToken: key === 'token' ? value : ''
          };
        } else {
          if (key === 'url') profile.serverUrl = value;
          if (key === 'token') profile.apiToken = value;
        }
        config.setProfile(profile);
        await config.save();
        console.log(chalk.green(`Set ${key} for profile ${profileName}`));
      } catch (err: any) {
        console.error(chalk.red(`Error: ${err.message}`));
      }
    } else {
      console.log(chalk.yellow('Only url and token settings are supported'));
    }
  });

configCmd
  .command('get <key>')
  .description('Get a configuration value')
  .action((key: string) => {
    const options = program.opts();
    const profileName = options.profile || 'default';
    const config = new Config();
    
    if (key === 'url' || key === 'token') {
      try {
        const profile = config.getProfiles().find(p => p.name === profileName) || config.getCurrentProfile();
        if (key === 'url') console.log(profile.serverUrl || '(not set)');
        if (key === 'token') console.log(profile.apiToken || '(not set)');
      } catch (err) {
        console.log('(not set)');
      }
    } else {
      console.log(chalk.yellow('Only url and token settings are supported'));
    }
  });

configCmd
  .command('list')
  .description('List all configuration')
  .action(() => {
    const config = new Config();
    const data = config.getData();
    console.log(JSON.stringify(data, null, 2));
  });

// Note commands
const noteCmd = program
  .command('note')
  .description('Note operations');

noteCmd
  .command('create <title>')
  .description('Create a new note')
  .option('-c, --content <content>', 'note content')
  .option('-t, --type <type>', 'note type (text, code, etc.)', 'text')
  .option('-p, --parent <id>', 'parent note ID', 'root')
  .option('-a, --attribute <attr>', 'add attribute (name=value)', [])
  .option('-l, --label <label>', 'add label attribute', [])
  .option('-r, --relation <relation>', 'add relation attribute (name=targetId)', [])
  .action(async (title: string, cmdOptions: NoteOptions) => {
    try {
      const options = { ...program.opts(), ...cmdOptions };
      const client = await createClient(options);
      
      // Prepare attributes
      const attributes = [];
      
      // Add explicit attributes
      if (cmdOptions.attribute && cmdOptions.attribute.length > 0) {
        attributes.push(...parseAttributes(cmdOptions.attribute));
      }
      
      // Add labels
      if (cmdOptions.label && cmdOptions.label.length > 0) {
        for (const label of cmdOptions.label) {
          attributes.push({ type: 'label', name: label, value: '' });
        }
      }
      
      // Add relations
      if (cmdOptions.relation && cmdOptions.relation.length > 0) {
        for (const rel of cmdOptions.relation) {
          const [name, targetId] = rel.split('=');
          if (name && targetId) {
            attributes.push({ type: 'relation', name, value: targetId });
          }
        }
      }
      
      const note = await client.createNote({
        title,
        content: cmdOptions.content || '',
        type: (cmdOptions.type || 'text') as any,
        parentNoteId: cmdOptions.parent || 'root'
      });
      
      console.log(chalk.green('Note created successfully!'));
      formatOutput(note, options);
    } catch (error) {
      handleError(error);
    }
  });

noteCmd
  .command('get <noteId>')
  .description('Get a note by ID')
  .option('-c, --content', 'include content')
  .option('-a, --attributes', 'include attributes')
  .action(async (noteId: string, cmdOptions: any) => {
    try {
      const options = { ...program.opts(), ...cmdOptions };
      const client = await createClient(options);
      
      if (cmdOptions.content) {
        const note = await client.getNoteWithContent(noteId);
        formatOutput(note, options);
      } else {
        const note = await client.getNote(noteId);
        formatOutput(note, options);
      }
    } catch (error) {
      handleError(error);
    }
  });

noteCmd
  .command('update <noteId>')
  .description('Update a note')
  .option('-t, --title <title>', 'new title')
  .option('-c, --content <content>', 'new content')
  .option('-T, --type <type>', 'new type')
  .action(async (noteId: string, cmdOptions: any) => {
    try {
      const options = { ...program.opts(), ...cmdOptions };
      const client = await createClient(options);
      
      const updateData: any = {};
      if (cmdOptions.title) updateData.title = cmdOptions.title;
      if (cmdOptions.content) updateData.content = cmdOptions.content;
      if (cmdOptions.type) updateData.type = cmdOptions.type;
      
      await client.updateNote(noteId, updateData);
      console.log(chalk.green('Note updated successfully!'));
      
      // Fetch and display updated note
      const note = await client.getNoteWithContent(noteId);
      formatOutput(note, options);
    } catch (error) {
      handleError(error);
    }
  });

noteCmd
  .command('delete <noteId>')
  .description('Delete a note')
  .option('-f, --force', 'skip confirmation')
  .action(async (noteId: string, cmdOptions: any) => {
    try {
      const options = { ...program.opts(), ...cmdOptions };
      
      if (!cmdOptions.force) {
        console.log(chalk.yellow(`Warning: This will delete note ${noteId}`));
        console.log('Use --force to confirm');
        process.exit(1);
      }
      
      const client = await createClient(options);
      await client.deleteNote(noteId);
      console.log(chalk.green('Note deleted successfully!'));
    } catch (error) {
      handleError(error);
    }
  });

noteCmd
  .command('list')
  .description('List notes')
  .option('-l, --limit <number>', 'limit results', '100')
  .action(async (cmdOptions: any) => {
    try {
      const options = { ...program.opts(), ...cmdOptions };
      const client = await createClient(options);
      
      // Use search to list notes - using simple parameters
      const results = await client.searchNotes(
        '', 
        false, // fastSearch
        false, // includeArchived
        parseInt(cmdOptions.limit) || 100 // limit
      );
      
      if (results && results.length > 0) {
        console.log(chalk.cyan(`Found ${results.length} notes:`));
        formatOutput(results, options);
      } else {
        console.log(chalk.yellow('No notes found'));
      }
    } catch (error) {
      handleError(error);
    }
  });

// Search command
program
  .command('search <query>')
  .description('Search for notes')
  .option('-l, --limit <number>', 'limit results', '50')
  .option('-o, --order-by <field>', 'order by field')
  .option('-d, --order-direction <dir>', 'order direction (asc/desc)')
  .option('-c, --content', 'include content in results')
  .option('-a, --attributes', 'include attributes in results')
  .action(async (query: string, cmdOptions: SearchOptions) => {
    try {
      const options = { ...program.opts(), ...cmdOptions };
      const client = await createClient(options);
      
      // Use simple searchNotes parameters for now
      const limit = parseInt(cmdOptions.limit as any) || 50;
      const results = await client.searchNotes(
        query,
        false, // fastSearch
        false, // includeArchived
        limit
      );
      
      if (results && results.length > 0) {
        console.log(chalk.cyan(`Found ${results.length} results:`));
        formatOutput(results, options);
      } else {
        console.log(chalk.yellow('No results found'));
      }
    } catch (error) {
      handleError(error);
    }
  });

// Branch commands
const branchCmd = program
  .command('branch')
  .description('Branch (hierarchy) operations');

branchCmd
  .command('get <branchId>')
  .description('Get branch details')
  .action(async (branchId: string) => {
    try {
      const options = program.opts();
      const client = await createClient(options);
      const branch = await client.getBranch(branchId);
      formatOutput(branch, options);
    } catch (error) {
      handleError(error);
    }
  });

branchCmd
  .command('create <noteId> <parentNoteId>')
  .description('Create a branch (link note to parent)')
  .option('-p, --prefix <prefix>', 'branch prefix')
  .action(async (noteId: string, parentNoteId: string, cmdOptions: any) => {
    try {
      const options = { ...program.opts(), ...cmdOptions };
      const client = await createClient(options);
      
      const branch = await client.createBranch({
        noteId,
        parentNoteId,
        prefix: cmdOptions.prefix || ''
      });
      
      console.log(chalk.green('Branch created successfully!'));
      formatOutput(branch, options);
    } catch (error) {
      handleError(error);
    }
  });

// Attribute commands
const attrCmd = program
  .command('attribute')
  .description('Attribute operations');

attrCmd
  .command('get <attributeId>')
  .description('Get attribute details')
  .action(async (attributeId: string) => {
    try {
      const options = program.opts();
      const client = await createClient(options);
      const attr = await client.getAttribute(attributeId);
      formatOutput(attr, options);
    } catch (error) {
      handleError(error);
    }
  });

attrCmd
  .command('create <noteId> <type> <name> [value]')
  .description('Create an attribute (type: label or relation)')
  .action(async (noteId: string, type: string, name: string, value?: string) => {
    try {
      const options = program.opts();
      const client = await createClient(options);
      
      if (type !== 'label' && type !== 'relation') {
        throw new ValidationError('Type must be "label" or "relation"');
      }
      
      const attr = await client.createAttribute({
        noteId,
        type: type as 'label' | 'relation',
        name,
        value: value || ''
      });
      
      console.log(chalk.green('Attribute created successfully!'));
      formatOutput(attr, options);
    } catch (error) {
      handleError(error);
    }
  });

attrCmd
  .command('delete <attributeId>')
  .description('Delete an attribute')
  .action(async (attributeId: string) => {
    try {
      const options = program.opts();
      const client = await createClient(options);
      await client.deleteAttribute(attributeId);
      console.log(chalk.green('Attribute deleted successfully!'));
    } catch (error) {
      handleError(error);
    }
  });

// Export command
program
  .command('export <noteId> <file>')
  .description('Export a note to file')
  .option('-f, --format <format>', 'export format (html, markdown, text)', 'markdown')
  .action(async (noteId: string, file: string, cmdOptions: any) => {
    try {
      const options = { ...program.opts(), ...cmdOptions };
      const client = await createClient(options);
      
      // Export note as HTML or get content
      const note = await client.getNoteWithContent(noteId);
      let content = note.content || '';
      
      // Simple format conversion if needed
      if (cmdOptions.format === 'html' && note.type === 'text') {
        content = `<html><body>${content}</body></html>`;
      }
      
      const outputPath = resolve(file);
      writeFileSync(outputPath, content);
      console.log(chalk.green(`Note exported to ${outputPath}`));
    } catch (error) {
      handleError(error);
    }
  });

// Import command
program
  .command('import <file> <parentNoteId>')
  .description('Import a file as a note')
  .option('-t, --title <title>', 'note title (defaults to filename)')
  .action(async (file: string, parentNoteId: string, cmdOptions: any) => {
    try {
      const options = { ...program.opts(), ...cmdOptions };
      const client = await createClient(options);
      
      const filePath = resolve(file);
      if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const buffer = readFileSync(filePath);
      const content = buffer.toString('utf-8');
      const title = cmdOptions.title || file.split('/').pop() || 'Imported Note';
      
      const note = await client.createNote({
        title,
        content,
        type: 'text',
        parentNoteId
      });
      
      console.log(chalk.green('File imported successfully!'));
      formatOutput(note, options);
    } catch (error) {
      handleError(error);
    }
  });

// App info command
program
  .command('info')
  .description('Get Trilium server information')
  .action(async () => {
    try {
      const options = program.opts();
      const client = await createClient(options);
      const info = await client.getAppInfo();
      
      console.log(chalk.cyan('Trilium Server Information:'));
      console.log(`Version: ${(info as any).appVersion || 'Unknown'}`);
      console.log(`Database Version: ${(info as any).dbVersion || 'Unknown'}`);
      console.log(`Sync Version: ${(info as any).syncVersion || 'Unknown'}`);
      console.log(`Build Date: ${(info as any).buildDate || 'Unknown'}`);
      console.log(`Build Revision: ${(info as any).buildRevision || 'Unknown'}`);
      console.log(`Data Directory: ${(info as any).dataDirectory || 'Unknown'}`);
      
      if (options.json) {
        console.log('\nFull info:');
        console.log(JSON.stringify(info, null, 2));
      }
    } catch (error) {
      handleError(error);
    }
  });

// Test connection command
program
  .command('test')
  .description('Test connection to Trilium server')
  .action(async () => {
    try {
      const options = program.opts();
      const { url, token } = getConfig(options);
      
      console.log(chalk.cyan(`Testing connection to ${url}...`));
      
      const client = await createClient(options);
      const info = await client.getAppInfo();
      
      console.log(chalk.green('✓ Connection successful!'));
      console.log(`Server version: ${(info as any).appVersion || 'Unknown'}`);
    } catch (error) {
      console.log(chalk.red('✗ Connection failed!'));
      handleError(error);
    }
  });

// Parse arguments and execute
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}