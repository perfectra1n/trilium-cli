import { createReadStream, existsSync, writeFileSync } from 'fs';
import { resolve, extname, basename } from 'path';

import chalk from 'chalk';
import type { Command } from 'commander';

import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import type { NoteType, ExportFormat } from '../../types/api.js';
import type { OutputFormat } from '../../types/common.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import type {
  BaseCommandOptions,
  NoteCreateOptions,
  NoteGetOptions,
  NoteUpdateOptions,
  NoteDeleteOptions,
  NoteListOptions,
  NoteExportOptions,
  NoteImportOptions,
  NoteMoveOptions,
  NoteCloneOptions,
} from '../types.js';

/**
 * Set up note management commands
 */
export function setupNoteCommands(program: Command): void {
  const noteCommand = program
    .command('note')
    .description('Note operations');

  // Create note
  noteCommand
    .command('create')
    .description('Create a new note')
    .argument('<title>', 'note title')
    .option('-c, --content <content>', 'note content')
    .option('-t, --note-type <type>', 'note type (text, code, etc.)', 'text')
    .option('-p, --parent <id>', 'parent note ID')
    .option('-e, --edit', 'open in editor')
    .action(async (title: string, options: NoteCreateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        let content = options.content || '';
        
        // Open editor if requested or no content provided
        if (options.edit || (!content && !process.stdin.isTTY)) {
          const { openNoteInExternalEditor } = await import('../../utils/editor.js');
          const editorResult = await openNoteInExternalEditor(
            content,
            options.noteType || 'text'
          );
          
          if (editorResult.cancelled) {
            logger.info('Note creation cancelled');
            return;
          }
          
          content = editorResult.content;
        }
        
        const noteData = {
          title,
          content,
          type: (options.noteType || 'text') as NoteType,
          parentNoteId: options.parent || 'root'
        };
        
        const result = await client.createNote(noteData);
        
        const output = formatOutput([result.note], options.output, [
          'noteId', 'title', 'type', 'parentNoteIds', 'dateCreated'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Note created successfully: ${result.note.noteId}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Get note
  noteCommand
    .command('get')
    .description('Get note by ID')
    .argument('<note-id>', 'note ID')
    .option('-c, --content', 'include content')
    .option('-e, --edit', 'open in external editor')
    .action(async (noteId: string, options: NoteGetOptions & { edit?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // If edit mode, open in external editor
        if (options.edit) {
          const note = await client.getNoteWithContent(noteId);
          const { openNoteInExternalEditor } = await import('../../utils/editor.js');
          const editorResult = await openNoteInExternalEditor(
            note.content || '',
            note.type
          );
          
          if (editorResult.cancelled) {
            logger.info('Edit cancelled - no changes saved');
            return;
          }
          
          if (editorResult.changed) {
            await client.updateNoteContent(noteId, editorResult.content);
            logger.info(chalk.green('Note updated successfully'));
          } else {
            logger.info('No changes made to note');
          }
          return;
        }
        
        const note = options.content ? 
          await client.getNoteWithOptionalContent(noteId, true) : 
          await client.getNote(noteId);
        
        const columns = [
          'noteId', 'title', 'type', 'mime', 'isProtected', 
          'dateCreated', 'dateModified'
        ];
        
        // Handle content if it's a NoteWithContent
        const noteWithContent = note as any;
        if (options.content && noteWithContent.content) {
          columns.push('contentLength');
          noteWithContent.contentLength = `${noteWithContent.content.length} chars`;
          
          // Show content preview for table output
          if (options.output === 'table' && noteWithContent.content.length > 200) {
            noteWithContent.contentPreview = noteWithContent.content.substring(0, 200) + '...';
            columns.push('contentPreview');
          } else if (options.output === 'table') {
            columns.push('content');
          }
        }
        
        const output = formatOutput([note], options.output, columns);
        console.log(output);
        
        // Show full content for JSON output or if specifically requested
        if (options.content && noteWithContent.content && options.output === 'json') {
          console.log(JSON.stringify({ ...note, content: noteWithContent.content }, null, 2));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Edit note in external editor (dedicated command)
  noteCommand
    .command('edit')
    .description('Edit note in external editor')
    .argument('<note-id>', 'note ID')
    .option('--editor <editor>', 'specify editor to use (overrides $EDITOR)')
    .option('--no-convert', 'do not convert HTML to Markdown')
    .action(async (noteId: string, options: BaseCommandOptions & { editor?: string; convert?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const note = await client.getNoteWithContent(noteId);
        
        const { openNoteInExternalEditor } = await import('../../utils/editor.js');
        const editorResult = await openNoteInExternalEditor(
          note.content || '',
          note.type,
          {
            editor: options.editor,
            convertHtmlToMarkdown: options.convert !== false
          }
        );
        
        if (editorResult.cancelled) {
          logger.info('Edit cancelled - no changes saved');
          return;
        }
        
        if (editorResult.changed) {
          await client.updateNoteContent(noteId, editorResult.content);
          
          if (options.output === 'json') {
            console.log(JSON.stringify({ success: true, noteId, updated: true }, null, 2));
          } else {
            logger.info(chalk.green(`Note ${noteId} updated successfully`));
          }
        } else {
          if (options.output === 'json') {
            console.log(JSON.stringify({ success: true, noteId, updated: false }, null, 2));
          } else {
            logger.info('No changes made to note');
          }
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });
  
  // Update note
  noteCommand
    .command('update')
    .description('Update existing note')
    .argument('<note-id>', 'note ID')
    .option('-t, --title <title>', 'new title')
    .option('-c, --content <content>', 'new content')
    .option('-e, --edit', 'open in editor')
    .action(async (noteId: string, options: NoteUpdateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        const updates: any = {};
        
        if (options.title) updates.title = options.title;
        
        if (options.content) {
          updates.content = options.content;
        } else if (options.edit) {
          // Get current content for editing
          const currentNote = await client.getNoteWithContent(noteId);
          const { openNoteInExternalEditor } = await import('../../utils/editor.js');
          const editorResult = await openNoteInExternalEditor(
            currentNote.content || '',
            currentNote.type
          );
          
          if (editorResult.cancelled) {
            logger.info('Note update cancelled');
            return;
          }
          
          if (!editorResult.changed) {
            logger.info('No changes made to note');
            return;
          }
          
          updates.content = editorResult.content;
        }
        
        if (Object.keys(updates).length === 0) {
          throw new TriliumError('No updates specified. Use --title, --content, or --edit options.');
        }
        
        const note = await client.updateNote(noteId, updates);
        
        const output = formatOutput([note], options.output, [
          'noteId', 'title', 'type', 'dateModified'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green('Note updated successfully'));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Delete note
  noteCommand
    .command('delete')
    .alias('rm')
    .description('Delete a note')
    .argument('<note-id>', 'note ID')
    .option('-f, --force', 'force delete without confirmation')
    .action(async (noteId: string, options: NoteDeleteOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        if (!options.force) {
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              chalk.yellow(`Are you sure you want to delete note ${noteId}? This action cannot be undone. (y/N): `),
              resolve
            );
          });
          rl.close();

          if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            logger.info('Delete cancelled.');
            return;
          }
        }

        const client = await createTriliumClient(options);
        await client.deleteNote(noteId);
        
        if (options.output === 'json') {
          console.log(JSON.stringify({ success: true, noteId }, null, 2));
        } else {
          logger.info(chalk.green(`Note ${noteId} deleted successfully`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // List notes
  noteCommand
    .command('list')
    .alias('ls')
    .description('List child notes')
    .argument('[parent-id]', 'parent note ID (defaults to root)', 'root')
    .option('-t, --tree', 'show as tree')
    .option('-d, --depth <number>', 'maximum depth for tree view', (val) => parseInt(val, 10), 3)
    .action(async (parentId: string, options: NoteListOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        if (options.tree) {
          const tree = await client.getNoteTree(parentId, { depth: options.depth });
          
          if (options.output === 'json') {
            console.log(JSON.stringify(tree, null, 2));
          } else {
            displayTreeStructure(tree, 0, options.depth || 3);
          }
        } else {
          const notes = await client.getChildNotes(parentId);
          
          const output = formatOutput(notes, options.output, [
            'noteId', 'title', 'type', 'isProtected', 'dateModified'
          ]);
          console.log(output);
        }
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Displayed notes for parent ${parentId}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Export note
  noteCommand
    .command('export')
    .description('Export note')
    .argument('<note-id>', 'note ID')
    .option('-f, --format <format>', 'export format (html, markdown, pdf)', 'html')
    .option('-o, --output <file>', 'output file')
    .action(async (noteId: string, options: NoteExportOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        // Ensure output format is provided for createTriliumClient
        const clientOptions = { ...options, output: options.output || 'json' } as BaseCommandOptions;
        const client = await createTriliumClient(clientOptions);
        
        logger.info(`Exporting note ${noteId} as ${options.format}...`);
        
        const exportResult = await client.exportNote(noteId, (options.format || 'html') as ExportFormat);
        
        // Determine output path
        let outputPath = (options as any).output;
        if (!outputPath) {
          const note = await client.getNote(noteId);
          const extension = options.format === 'pdf' ? 'pdf' : 
                           options.format === 'markdown' ? 'md' : 'html';
          outputPath = `${note.title.replace(/[^a-zA-Z0-9]/g, '_')}.${extension}`;
        }
        
        // Write to file - exportResult is an ArrayBuffer
        const buffer = Buffer.from(exportResult);
        writeFileSync(outputPath, buffer);
        
        const formatData = [{
          noteId,
          format: options.format || 'html',
          outputFile: outputPath,
          size: `${buffer.byteLength} bytes`
        }];
        
        // Use the base options.output property, accessing through a type assertion
        const outputFormat: OutputFormat = (options as any).output || 'table';
        const output = formatOutput(formatData, outputFormat, ['noteId', 'format', 'outputFile', 'size']);
        console.log(output);
        
        if (outputFormat === 'table') {
          logger.info(chalk.green(`Note exported to ${outputPath}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Import note
  noteCommand
    .command('import')
    .description('Import note from file')
    .argument('<file>', 'file to import')
    .option('-p, --parent <id>', 'parent note ID')
    .option('-f, --format <format>', 'import format (auto, html, markdown)', 'auto')
    .action(async (filePath: string, options: NoteImportOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const resolvedPath = resolve(filePath);
        
        if (!existsSync(resolvedPath)) {
          throw new TriliumError(`File not found: ${resolvedPath}`);
        }
        
        const client = await createTriliumClient(options);
        
        // Auto-detect format if not specified
        let format = options.format;
        if (format === 'auto') {
          const ext = extname(resolvedPath).toLowerCase();
          if (ext === '.md') format = 'markdown';
          else if (ext === '.html' || ext === '.htm') format = 'html';
          else format = 'text';
        }
        
        logger.info(`Importing ${filePath} as ${format}...`);
        
        const { readFileSync } = await import('fs');
        const content = readFileSync(resolvedPath, 'utf8');
        const title = basename(resolvedPath, extname(resolvedPath));
        
        const result = await client.createNote({
          title,
          content,
          type: (format === 'markdown' ? 'text' : format) as NoteType,
          parentNoteId: options.parent || 'root'
        });
        
        const output = formatOutput([{
          noteId: result.note.noteId,
          title: result.note.title,
          importedFrom: filePath,
          format,
          size: `${content.length} chars`
        }], options.output, ['noteId', 'title', 'importedFrom', 'format', 'size']);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`File imported as note: ${result.note.noteId}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Move note
  noteCommand
    .command('move')
    .alias('mv')
    .description('Move note to another parent')
    .argument('<note-id>', 'note ID')
    .argument('<parent-id>', 'new parent note ID')
    .action(async (noteId: string, parentId: string, options: NoteMoveOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        const result = await client.moveNote(noteId, parentId);
        
        const output = formatOutput([{
          noteId,
          oldParent: 'unknown',
          newParent: parentId,
          moved: true
        }], options.output, ['noteId', 'oldParent', 'newParent', 'moved']);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Note ${noteId} moved to parent ${parentId}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Clone note
  noteCommand
    .command('clone')
    .description('Clone note')
    .argument('<note-id>', 'note ID to clone')
    .option('-t, --clone-type <type>', 'clone type (deep, shallow)', 'deep')
    .action(async (noteId: string, options: NoteCloneOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // For now, cloning creates another branch to root
        const result = await client.cloneNote(noteId, 'root');
        
        const output = formatOutput([{
          originalNoteId: noteId,
          branchId: result.branchId,
          parentNoteId: result.parentNoteId,
          cloneType: options.cloneType,
          success: true
        }], options.output, ['originalNoteId', 'branchId', 'parentNoteId', 'cloneType', 'success']);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Note cloned successfully with branch: ${result.branchId}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Display tree structure in console
 */
function displayTreeStructure(tree: any, depth: number = 0, maxDepth: number = 3): void {
  const indent = '  '.repeat(depth);
  const icon = tree.type === 'search' ? '🔍' : 
               tree.isProtected ? '🔒' : 
               tree.type === 'code' ? '💻' : '📄';
  
  console.log(`${indent}${icon} ${tree.title} (${tree.noteId})`);
  
  if (tree.children && depth < maxDepth) {
    tree.children.forEach((child: any) => {
      displayTreeStructure(child, depth + 1, maxDepth);
    });
  }
}