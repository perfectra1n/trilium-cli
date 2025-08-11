import type { Command } from 'commander';
import chalk from 'chalk';
import { createWriteStream, existsSync, statSync } from 'fs';
import { basename, resolve } from 'path';

import type {
  AttachmentUploadOptions,
  AttachmentDownloadOptions,
  AttachmentListOptions,
  AttachmentInfoOptions,
  AttachmentDeleteOptions,
} from '../types.js';
import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { createLogger } from '../../utils/logger.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';

/**
 * Set up attachment management commands
 */
export function setupAttachmentCommands(program: Command): void {
  const attachmentCommand = program
    .command('attachment')
    .alias('attach')
    .description('Attachment operations');

  // Upload attachment
  attachmentCommand
    .command('upload')
    .description('Upload attachment to a note')
    .argument('<note-id>', 'note ID')
    .argument('<file>', 'file to upload')
    .option('-t, --title <title>', 'title for the attachment')
    .action(async (noteId: string, filePath: string, options: AttachmentUploadOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const resolvedPath = resolve(filePath);
        
        if (!existsSync(resolvedPath)) {
          throw new TriliumError(`File not found: ${resolvedPath}`);
        }

        const stats = statSync(resolvedPath);
        if (!stats.isFile()) {
          throw new TriliumError(`Path is not a file: ${resolvedPath}`);
        }

        const client = await createTriliumClient(options);
        const filename = basename(resolvedPath);
        const title = options.title || filename;
        
        // Read file content as buffer and convert to base64 or string
        const fs = await import('fs/promises');
        const fileBuffer = await fs.readFile(resolvedPath);
        const content = fileBuffer.toString('base64');

        logger.info(`Uploading ${filename} (${stats.size} bytes)...`);
        
        const attachment = await client.createAttachment({
          ownerId: noteId,
          title,
          content: content,
          role: 'file',
          mime: 'application/octet-stream',
        });

        const output = formatOutput([attachment], options.output, [
          'attachmentId', 'noteId', 'role', 'mime', 'title', 'blobId'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Attachment "${title}" uploaded successfully`));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Download attachment
  attachmentCommand
    .command('download')
    .description('Download attachment')
    .argument('<attachment-id>', 'attachment ID')
    .option('-o, --output <file>', 'output file path')
    .action(async (attachmentId: string, options: AttachmentDownloadOptions & { output?: string }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // Get attachment info first
        const attachment = await client.getAttachment(attachmentId);
        const outputPath = options.output || attachment.title || `attachment_${attachmentId}`;
        
        logger.info(`Downloading attachment to ${outputPath}...`);
        
        const content = await client.getAttachmentContent(attachmentId);
        
        // Save to file
        const writeStream = createWriteStream(outputPath);
        if (typeof content === 'string') {
          writeStream.write(content);
        } else if (content instanceof Buffer) {
          writeStream.write(content);
        } else {
          // Handle stream
          content.pipe(writeStream);
        }
        
        writeStream.end();
        
        if (options.output === 'json') {
          console.log(JSON.stringify({
            success: true,
            attachmentId,
            outputPath,
            size: statSync(outputPath).size
          }, null, 2));
        } else {
          logger.info(chalk.green(`Attachment downloaded to ${outputPath}`));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // List attachments
  attachmentCommand
    .command('list')
    .alias('ls')
    .description('List attachments for a note')
    .argument('<note-id>', 'note ID')
    .action(async (noteId: string, options: AttachmentListOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const attachments = await client.getNoteAttachments(noteId);

        const output = formatOutput(attachments, options.output, [
          'attachmentId', 'role', 'mime', 'title', 'position', 'utcDateCreated'
        ]);
        console.log(output);
        
        if (options.output === 'table' && attachments.length === 0) {
          logger.info(chalk.yellow('No attachments found for this note.'));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Get attachment info
  attachmentCommand
    .command('info')
    .description('Get attachment information')
    .argument('<attachment-id>', 'attachment ID')
    .action(async (attachmentId: string, options: AttachmentInfoOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const attachment = await client.getAttachment(attachmentId);

        const output = formatOutput([attachment], options.output, [
          'attachmentId', 'noteId', 'role', 'mime', 'title', 'position', 
          'blobId', 'utcDateCreated', 'utcDateModified'
        ]);
        console.log(output);
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Delete attachment
  attachmentCommand
    .command('delete')
    .alias('rm')
    .description('Delete an attachment')
    .argument('<attachment-id>', 'attachment ID')
    .option('-f, --force', 'force delete without confirmation')
    .action(async (attachmentId: string, options: AttachmentDeleteOptions) => {
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
              chalk.yellow(`Are you sure you want to delete attachment ${attachmentId}? This action cannot be undone. (y/N): `),
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
        await client.deleteAttachment(attachmentId);
        
        if (options.output === 'json') {
          console.log(JSON.stringify({ success: true, attachmentId }, null, 2));
        } else {
          logger.info(chalk.green(`Attachment ${attachmentId} deleted successfully`));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}