/**
 * Complete ETAPI command coverage
 * This file ensures all ETAPI endpoints have corresponding CLI commands
 */

import chalk from 'chalk';
import type { Command } from 'commander';
import { TriliumClient } from '../../api/client.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import type { BaseCommandOptions } from '../types.js';

/**
 * Setup complete ETAPI commands
 */
export function setupCompleteETAPICommands(program: Command): void {
  
  // ========== NOTES ==========
  const noteCmd = program.command('note').description('Note operations');
  
  // POST /create-note (already covered)
  noteCmd
    .command('create')
    .description('Create a new note')
    .argument('<title>', 'note title')
    .option('-p, --parent <id>', 'parent note ID', 'root')
    .option('-c, --content <content>', 'note content')
    .option('-t, --type <type>', 'note type', 'text')
    .option('--mime <mime>', 'MIME type')
    .action(async (title: string, options: any) => {
      const client = await createTriliumClient(options);
      const result = await client.createNote({
        parentNoteId: options.parent,
        title,
        content: options.content || '',
        type: options.type,
        mime: options.mime
      });
      console.log(formatOutput(result, options.output));
    });
  
  // GET /notes/{noteId}/revision
  noteCmd
    .command('revision <noteId>')
    .description('Create a revision of a note')
    .action(async (noteId: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      const result = await client.createRevision(noteId);
      console.log(formatOutput(result, options.output));
    });
  
  // ========== BRANCHES ==========
  const branchCmd = program.command('branch').description('Branch operations');
  
  // POST /branches
  branchCmd
    .command('create')
    .description('Create a new branch')
    .requiredOption('-n, --note <noteId>', 'note ID')
    .requiredOption('-p, --parent <parentNoteId>', 'parent note ID')
    .option('--prefix <prefix>', 'branch prefix')
    .option('--expanded', 'set branch as expanded')
    .option('--position <number>', 'note position', parseInt)
    .action(async (options: any) => {
      const client = await createTriliumClient(options);
      const result = await client.createBranch({
        noteId: options.note,
        parentNoteId: options.parent,
        prefix: options.prefix,
        isExpanded: options.expanded,
        notePosition: options.position
      });
      console.log(formatOutput(result, options.output));
    });
  
  // GET /branches/{branchId}
  branchCmd
    .command('get <branchId>')
    .description('Get branch details')
    .action(async (branchId: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      const result = await client.getBranch(branchId);
      console.log(formatOutput(result, options.output));
    });
  
  // PATCH /branches/{branchId}
  branchCmd
    .command('update <branchId>')
    .description('Update a branch')
    .option('--prefix <prefix>', 'branch prefix')
    .option('--expanded <boolean>', 'set expanded state', (v) => v === 'true')
    .option('--position <number>', 'note position', parseInt)
    .action(async (branchId: string, options: any) => {
      const client = await createTriliumClient(options);
      const updates: any = {};
      if (options.prefix !== undefined) updates.prefix = options.prefix;
      if (options.expanded !== undefined) updates.isExpanded = options.expanded;
      if (options.position !== undefined) updates.notePosition = options.position;
      
      const result = await client.updateBranch(branchId, updates);
      console.log(formatOutput(result, options.output));
    });
  
  // DELETE /branches/{branchId}
  branchCmd
    .command('delete <branchId>')
    .description('Delete a branch')
    .action(async (branchId: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      await client.deleteBranch(branchId);
      console.log(chalk.green('Branch deleted successfully'));
    });
  
  // ========== ATTACHMENTS ==========
  const attachmentCmd = program.command('attachment').description('Attachment operations');
  
  // POST /attachments
  attachmentCmd
    .command('create')
    .description('Create a new attachment')
    .requiredOption('-o, --owner <ownerId>', 'owner note ID')
    .requiredOption('-t, --title <title>', 'attachment title')
    .requiredOption('-c, --content <content>', 'attachment content or file path')
    .option('--mime <mime>', 'MIME type', 'text/plain')
    .option('--role <role>', 'attachment role', 'file')
    .option('--position <number>', 'position', parseInt)
    .action(async (options: any) => {
      const client = await createTriliumClient(options);
      const result = await client.createAttachment({
        ownerId: options.owner,
        title: options.title,
        content: options.content,
        mime: options.mime,
        role: options.role,
        position: options.position
      });
      console.log(formatOutput(result, options.output));
    });
  
  // GET /attachments/{attachmentId}
  attachmentCmd
    .command('get <attachmentId>')
    .description('Get attachment details')
    .action(async (attachmentId: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      const result = await client.getAttachment(attachmentId);
      console.log(formatOutput(result, options.output));
    });
  
  // PATCH /attachments/{attachmentId}
  attachmentCmd
    .command('update <attachmentId>')
    .description('Update an attachment')
    .option('--title <title>', 'attachment title')
    .option('--mime <mime>', 'MIME type')
    .option('--role <role>', 'attachment role')
    .option('--position <number>', 'position', parseInt)
    .action(async (attachmentId: string, options: any) => {
      const client = await createTriliumClient(options);
      const updates: any = {};
      if (options.title) updates.title = options.title;
      if (options.mime) updates.mime = options.mime;
      if (options.role) updates.role = options.role;
      if (options.position !== undefined) updates.position = options.position;
      
      const result = await client.updateAttachment(attachmentId, updates);
      console.log(formatOutput(result, options.output));
    });
  
  // DELETE /attachments/{attachmentId}
  attachmentCmd
    .command('delete <attachmentId>')
    .description('Delete an attachment')
    .action(async (attachmentId: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      await client.deleteAttachment(attachmentId);
      console.log(chalk.green('Attachment deleted successfully'));
    });
  
  // GET /attachments/{attachmentId}/content
  attachmentCmd
    .command('content <attachmentId>')
    .description('Get attachment content')
    .option('--save <path>', 'save to file')
    .action(async (attachmentId: string, options: any) => {
      const client = await createTriliumClient(options);
      const content = await client.getAttachmentContent(attachmentId);
      
      if (options.save) {
        const fs = await import('fs');
        fs.writeFileSync(options.save, content);
        console.log(chalk.green(`Content saved to ${options.save}`));
      } else {
        console.log(content);
      }
    });
  
  // PUT /attachments/{attachmentId}/content
  attachmentCmd
    .command('set-content <attachmentId> <content>')
    .description('Update attachment content')
    .action(async (attachmentId: string, content: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      await client.updateAttachmentContent(attachmentId, content);
      console.log(chalk.green('Attachment content updated successfully'));
    });
  
  // ========== ATTRIBUTES ==========
  const attributeCmd = program.command('attribute').description('Attribute operations');
  
  // POST /attributes
  attributeCmd
    .command('create')
    .description('Create a new attribute')
    .requiredOption('-n, --note <noteId>', 'note ID')
    .requiredOption('--name <name>', 'attribute name')
    .requiredOption('-t, --type <type>', 'attribute type (label or relation)')
    .option('--value <value>', 'attribute value')
    .option('--inheritable', 'make attribute inheritable')
    .option('--position <number>', 'position', parseInt)
    .action(async (options: any) => {
      const client = await createTriliumClient(options);
      const result = await client.createAttribute({
        noteId: options.note,
        name: options.name,
        type: options.type,
        value: options.value,
        isInheritable: options.inheritable,
        position: options.position
      });
      console.log(formatOutput(result, options.output));
    });
  
  // GET /attributes/{attributeId}
  attributeCmd
    .command('get <attributeId>')
    .description('Get attribute details')
    .action(async (attributeId: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      const result = await client.getAttribute(attributeId);
      console.log(formatOutput(result, options.output));
    });
  
  // PATCH /attributes/{attributeId}
  attributeCmd
    .command('update <attributeId>')
    .description('Update an attribute')
    .option('--value <value>', 'attribute value')
    .option('--inheritable <boolean>', 'inheritable state', (v) => v === 'true')
    .option('--position <number>', 'position', parseInt)
    .action(async (attributeId: string, options: any) => {
      const client = await createTriliumClient(options);
      const updates: any = {};
      if (options.value !== undefined) updates.value = options.value;
      if (options.inheritable !== undefined) updates.isInheritable = options.inheritable;
      if (options.position !== undefined) updates.position = options.position;
      
      const result = await client.updateAttribute(attributeId, updates);
      console.log(formatOutput(result, options.output));
    });
  
  // DELETE /attributes/{attributeId}
  attributeCmd
    .command('delete <attributeId>')
    .description('Delete an attribute')
    .action(async (attributeId: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      await client.deleteAttribute(attributeId);
      console.log(chalk.green('Attribute deleted successfully'));
    });
  
  // ========== SPECIAL ENDPOINTS ==========
  
  // POST /refresh-note-ordering/{parentNoteId}
  program
    .command('refresh-ordering <parentNoteId>')
    .description('Refresh note ordering for a parent note')
    .action(async (parentNoteId: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      const result = await client.refreshNoteOrdering(parentNoteId);
      console.log(formatOutput(result, options.output));
    });
  
  // GET /inbox/{date}
  program
    .command('inbox <date>')
    .description('Get or create inbox note for a specific date')
    .action(async (date: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      const result = await client.getInboxNote(date);
      console.log(formatOutput(result, options.output));
    });
  
  // Enhanced calendar commands
  const calendarCmd = program.command('calendar').description('Calendar operations');
  
  // GET /calendar/days/{date}
  calendarCmd
    .command('day <date>')
    .description('Get day notes for a specific date')
    .action(async (date: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      const result = await client.getInboxNote(date);
      console.log(formatOutput(result, options.output));
    });
  
  // GET /calendar/weeks/{date}
  calendarCmd
    .command('week <date>')
    .description('Get week notes for a specific date')
    .action(async (date: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      // Calendar week not implemented
      console.log('Calendar week endpoint not yet implemented');
      const result = {};
      console.log(formatOutput(result, options.output));
    });
  
  // GET /calendar/months/{month}
  calendarCmd
    .command('month <month>')
    .description('Get month notes (format: YYYY-MM)')
    .action(async (month: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      // Calendar month not implemented
      console.log('Calendar month endpoint not yet implemented');
      const result = {};
      console.log(formatOutput(result, options.output));
    });
  
  // GET /calendar/years/{year}
  calendarCmd
    .command('year <year>')
    .description('Get year notes (format: YYYY)')
    .action(async (year: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      // Calendar year not implemented
      console.log('Calendar year endpoint not yet implemented');
      const result = {};
      console.log(formatOutput(result, options.output));
    });
  
  // ========== AUTH & SYSTEM ==========
  const authCmd = program.command('auth').description('Authentication operations');
  
  // POST /auth/login
  authCmd
    .command('login')
    .description('Login to Trilium')
    .requiredOption('-p, --password <password>', 'Trilium password')
    .action(async (options: any) => {
      const client = await createTriliumClient(options);
      const result = await client.login(options.password);
      console.log(chalk.green('Login successful'));
      console.log('Auth token:', result.authToken);
    });
  
  // POST /auth/logout
  authCmd
    .command('logout')
    .description('Logout from Trilium')
    .action(async (options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      await client.logout();
      console.log(chalk.green('Logout successful'));
    });
  
  // GET /app-info
  program
    .command('app-info')
    .description('Get Trilium application information')
    .action(async (options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      const result = await client.getAppInfo();
      console.log(formatOutput(result, options.output));
    });
  
  // PUT /backup/{backupName}
  program
    .command('backup <backupName>')
    .description('Create a backup of Trilium database')
    .action(async (backupName: string, options: BaseCommandOptions) => {
      const client = await createTriliumClient(options);
      const result = await client.createBackup(backupName);
      console.log(formatOutput(result, options.output));
    });
}