import chalk from 'chalk';
import type { Command } from 'commander';

import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import type {
  BranchCreateOptions,
  BranchListOptions,
  BranchUpdateOptions,
  BranchDeleteOptions,
} from '../types.js';

/**
 * Set up branch management commands
 */
export function setupBranchCommands(program: Command): void {
  const branchCommand = program
    .command('branch')
    .description('Branch operations');

  // Create branch
  branchCommand
    .command('create')
    .description('Create a new branch')
    .argument('<note-id>', 'note ID')
    .argument('<parent-id>', 'parent note ID')
    .option('-p, --position <number>', 'position in parent', (val) => parseInt(val, 10))
    .option('--prefix <string>', 'prefix for the branch')
    .action(async (noteId: string, parentId: string, options: BranchCreateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        const branch = await client.createBranch({
          noteId,
          parentNoteId: parentId,
          notePosition: options.position,
          prefix: options.prefix,
        });

        const output = formatOutput([branch], options.output, ['branchId', 'noteId', 'parentNoteId', 'position', 'prefix']);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Branch created successfully: ${branch.branchId}`));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // List branches
  branchCommand
    .command('list')
    .description('List branches for a note')
    .argument('<note-id>', 'note ID')
    .action(async (noteId: string, options: BranchListOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const branches = await client.getNoteBranches(noteId);

        const output = formatOutput(branches, options.output, [
          'branchId', 'noteId', 'parentNoteId', 'position', 'prefix', 'isExpanded'
        ]);
        console.log(output);
        
        if (options.output === 'table' && branches.length === 0) {
          logger.info(chalk.yellow('No branches found for this note.'));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Update branch
  branchCommand
    .command('update')
    .description('Update branch properties')
    .argument('<branch-id>', 'branch ID')
    .option('-p, --position <number>', 'new position', (val) => parseInt(val, 10))
    .option('--prefix <string>', 'new prefix')
    .option('-e, --expanded <boolean>', 'expanded state', (val) => val === 'true')
    .action(async (branchId: string, options: BranchUpdateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        const updates: any = {};
        if (options.position !== undefined) updates.position = options.position;
        if (options.prefix !== undefined) updates.prefix = options.prefix;
        if (options.expanded !== undefined) updates.isExpanded = options.expanded;

        if (Object.keys(updates).length === 0) {
          throw new TriliumError('No updates specified. Use --position, --prefix, or --expanded options.');
        }

        const branch = await client.updateBranch(branchId, updates);
        
        const output = formatOutput([branch], options.output, [
          'branchId', 'noteId', 'parentNoteId', 'position', 'prefix', 'isExpanded'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green('Branch updated successfully'));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Delete branch
  branchCommand
    .command('delete')
    .description('Delete a branch')
    .argument('<branch-id>', 'branch ID')
    .option('-f, --force', 'force delete without confirmation')
    .action(async (branchId: string, options: BranchDeleteOptions) => {
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
              chalk.yellow(`Are you sure you want to delete branch ${branchId}? This action cannot be undone. (y/N): `),
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
        await client.deleteBranch(branchId);
        
        if (options.output === 'json') {
          console.log(JSON.stringify({ success: true, branchId }, null, 2));
        } else {
          logger.info(chalk.green(`Branch ${branchId} deleted successfully`));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}