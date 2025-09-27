import chalk from 'chalk';
import type { Command } from 'commander';

import { createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import { formatOutput, handleCliError } from '../../utils/cli.js';
import type { BaseCommandOptions } from '../types.js';

interface OrganizeOptions extends BaseCommandOptions {
  dryRun?: boolean;
  force?: boolean;
}

/**
 * Set up organize commands for handling cloned notes
 */
export function setupOrganizeCommands(program: Command): void {
  const organizeCommand = program
    .command('organize')
    .description('Smart organization helpers for managing cloned notes');

  // Remove duplicates from a folder
  organizeCommand
    .command('dedupe')
    .description('Remove duplicate branches from a folder, keeping notes in their organized locations')
    .argument('<folder-id>', 'folder to clean up (e.g., Quick Holder)')
    .option('--dry-run', 'show what would be removed without actually removing')
    .option('-f, --force', 'skip confirmation prompts')
    .action(async (folderId: string, options: OrganizeOptions) => {
      const logger = createLogger(options.verbose);

      try {
        const client = await createTriliumClient(options);

        // Get all notes in the folder
        logger.info(`Analyzing notes in folder ${folderId}...`);
        const folderNote = await client.getNote(folderId);
        const childNotes = await client.searchNotes(`note.parents.noteId = ${folderId}`, {
          fastSearch: false,
          includeArchived: false,
          limit: 1000,
          regexMode: false,
          includeContent: false,
          contextLines: 0
        });

        if (childNotes.length === 0) {
          logger.info(chalk.yellow('No notes found in this folder.'));
          return;
        }

        const duplicates: Array<{
          noteId: string;
          title: string;
          branchToRemove: string;
          otherLocations: string[];
        }> = [];

        // Check each note for multiple branches
        for (const child of childNotes) {
          const branches = await client.getNoteBranches(child.noteId, true);

          if (branches.length > 1) {
            // This note is cloned
            const folderBranch = branches.find(b => b.parentNoteId === folderId);
            const otherBranches = branches.filter(b => b.parentNoteId !== folderId);

            if (folderBranch && otherBranches.length > 0) {
              duplicates.push({
                noteId: child.noteId,
                title: child.title,
                branchToRemove: folderBranch.branchId,
                otherLocations: otherBranches.map(b => b.parentTitle || b.parentNoteId)
              });
            }
          }
        }

        if (duplicates.length === 0) {
          logger.info(chalk.green('No duplicate branches found. All notes in this folder are unique.'));
          return;
        }

        // Display what will be removed
        console.log(chalk.cyan(`\nFound ${duplicates.length} notes with duplicates in "${folderNote.title}":\n`));

        duplicates.forEach(dup => {
          console.log(chalk.yellow(`• ${dup.title}`));
          console.log(`  Also in: ${dup.otherLocations.join(', ')}`);
        });

        if (options.dryRun) {
          console.log(chalk.blue('\n[DRY RUN] No changes made. Remove --dry-run to actually clean up.'));
          return;
        }

        // Confirm before removing
        if (!options.force) {
          const { default: inquirer } = await import('inquirer');
          const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Remove ${duplicates.length} duplicate branches from "${folderNote.title}"?`,
            default: false
          }]);

          if (!confirm) {
            logger.info('Operation cancelled.');
            return;
          }
        }

        // Remove the duplicates
        let removed = 0;
        for (const dup of duplicates) {
          try {
            await client.deleteBranch(dup.branchToRemove);
            removed++;
            logger.debug(`Removed branch for "${dup.title}"`);
          } catch (error) {
            logger.warn(`Failed to remove branch for "${dup.title}": ${error}`);
          }
        }

        logger.info(chalk.green(`✓ Removed ${removed} duplicate branches from "${folderNote.title}"`));

      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Smart move that handles cloned notes
  organizeCommand
    .command('smart-move')
    .description('Intelligently move a note, handling clones automatically')
    .argument('<note-id>', 'note to move')
    .argument('<target-id>', 'target parent')
    .option('--keep-original', 'keep the note in its current location (clone instead of move)')
    .action(async (noteId: string, targetId: string, options: OrganizeOptions & { keepOriginal?: boolean }) => {
      const logger = createLogger(options.verbose);

      try {
        const client = await createTriliumClient(options);

        // Check the note's current branches
        const branches = await client.getNoteBranches(noteId, true);

        if (branches.length === 0) {
          logger.error('Note has no branches. This should not happen.');
          return;
        }

        // Check if already in target
        const alreadyInTarget = branches.some(b => b.parentNoteId === targetId);
        if (alreadyInTarget) {
          logger.info(chalk.yellow('Note is already in the target location.'));
          return;
        }

        if (options.keepOriginal || branches.length > 1) {
          // Clone to new location
          logger.info('Cloning note to new location...');
          await client.cloneNote(noteId, targetId);
          logger.info(chalk.green(`✓ Note cloned to target location`));

          if (!options.keepOriginal && branches.length > 1) {
            console.log(chalk.cyan('\nNote has multiple branches:'));
            branches.forEach(b => {
              console.log(`• ${b.parentTitle || b.parentNoteId} (${b.branchId})`);
            });
            console.log(chalk.yellow('\nUse "trilium branch delete <branchId>" to remove unwanted locations.'));
          }
        } else {
          // Simple move - note only has one branch
          logger.info('Moving note to new location...');
          const branchToDelete = branches[0];
          if (!branchToDelete) {
            logger.error('No branch found to move. This should not happen.');
            return;
          }
          await client.deleteBranch(branchToDelete.branchId);
          await client.createBranch({
            noteId,
            parentNoteId: targetId
          });
          logger.info(chalk.green(`✓ Note moved successfully`));
        }

      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // List all cloned notes in a folder
  organizeCommand
    .command('list-clones')
    .description('List all cloned notes in a folder')
    .argument('<folder-id>', 'folder to analyze')
    .action(async (folderId: string, options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);

      try {
        const client = await createTriliumClient(options);

        const folderNote = await client.getNote(folderId);
        logger.info(`Analyzing "${folderNote.title}"...`);

        const childNotes = await client.searchNotes(`note.parents.noteId = ${folderId}`, {
          fastSearch: false,
          includeArchived: false,
          limit: 1000,
          regexMode: false,
          includeContent: false,
          contextLines: 0
        });

        const clones: Array<{
          noteId: string;
          title: string;
          branches: number;
          locations: string[];
        }> = [];

        for (const child of childNotes) {
          const branches = await client.getNoteBranches(child.noteId, true);

          if (branches.length > 1) {
            clones.push({
              noteId: child.noteId,
              title: child.title,
              branches: branches.length,
              locations: branches.map(b => b.parentTitle || b.parentNoteId)
            });
          }
        }

        if (clones.length === 0) {
          logger.info(chalk.green('No cloned notes found in this folder.'));
          return;
        }

        const output = formatOutput(clones, options.output, [
          'title', 'branches', 'locations'
        ]);
        console.log(output);

        if (options.output === 'table') {
          logger.info(chalk.cyan(`Found ${clones.length} cloned notes out of ${childNotes.length} total notes.`));
        }

      } catch (error) {
        handleCliError(error, logger);
      }
    });
}