import chalk from 'chalk';
import type { Command } from 'commander';

import type { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import type {
  LinkBacklinksOptions,
  LinkOutgoingOptions,
  LinkBrokenOptions,
  LinkUpdateOptions,
  LinkValidateOptions,
} from '../types.js';

/**
 * Set up link management commands
 */
export function setupLinkCommands(program: Command): void {
  const linkCommand = program
    .command('link')
    .description('Link management operations');

  // Backlinks command
  linkCommand
    .command('backlinks')
    .description('Show backlinks to a note')
    .argument('<note-id>', 'note ID')
    .option('-c, --context', 'show context around links')
    .action(async (noteId: string, options: LinkBacklinksOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const backlinks = await client.getBacklinks(noteId);
        
        if (options.context) {
          // Get context for each backlink
          const backlinkContexts = await Promise.all(
            backlinks.map(async (link) => {
              const context = await client.getLinkContext(link.fromNoteId, noteId);
              return { ...link, context };
            })
          );
          
          const output = formatOutput(backlinkContexts, options.output, [
            'noteId', 'title', 'context', 'utcDateModified'
          ]);
          console.log(output);
        } else {
          const output = formatOutput(backlinks, options.output, [
            'noteId', 'title', 'type', 'utcDateModified'
          ]);
          console.log(output);
        }
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Found ${backlinks.length} backlink(s)`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Outgoing links command
  linkCommand
    .command('outgoing')
    .description('Show outgoing links from a note')
    .argument('<note-id>', 'note ID')
    .action(async (noteId: string, options: LinkOutgoingOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const outgoingLinks = await client.getOutgoingLinks(noteId);
        
        const output = formatOutput(outgoingLinks, options.output, [
          'targetNoteId', 'targetTitle', 'linkType', 'context'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Found ${outgoingLinks.length} outgoing link(s)`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Broken links command
  linkCommand
    .command('broken')
    .description('Find and report broken links')
    .argument('[note-id]', 'note ID to check (if not provided, checks all notes)')
    .option('-f, --fix', 'fix broken links interactively')
    .action(async (ownerId: string | undefined, options: LinkBrokenOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        logger.info('Scanning for broken links...');
        const brokenLinks = await client.findBrokenLinks(ownerId || 'root');
        
        if (brokenLinks.length === 0) {
          if (options.output === 'json') {
            console.log(JSON.stringify({ brokenLinks: [], count: 0 }, null, 2));
          } else {
            logger.info(chalk.green('No broken links found!'));
          }
          return;
        }
        
        const output = formatOutput(brokenLinks, options.output, [
          'sourceNoteId', 'sourceTitle', 'brokenLink', 'linkType', 'context'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.warn(chalk.yellow(`Found ${brokenLinks.length} broken link(s)`));
        }
        
        // Interactive fix mode
        if (options.fix && brokenLinks.length > 0) {
          await fixBrokenLinksInteractively(brokenLinks, client, logger);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Update links command
  linkCommand
    .command('update')
    .description('Update links in bulk')
    .argument('<old-target>', 'old target (note ID or title)')
    .argument('<new-target>', 'new target (note ID or title)')
    .option('-d, --dry-run', 'show what would be changed without making changes')
    .action(async (oldTarget: string, newTarget: string, options: LinkUpdateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        logger.info(`Searching for links to "${oldTarget}"...`);
        const linksToUpdate = await client.findLinksToTarget(oldTarget);
        
        if (linksToUpdate.length === 0) {
          logger.info(chalk.yellow('No links found to update'));
          return;
        }
        
        if (options.dryRun) {
          logger.info(chalk.blue('DRY RUN - No changes will be made'));
          const output = formatOutput(linksToUpdate, options.output, [
            'noteId', 'noteTitle', 'linkType', 'currentTarget', 'newTarget'
          ]);
          console.log(output);
          logger.info(chalk.blue(`Would update ${linksToUpdate.length} link(s)`));
          return;
        }
        
        logger.info(`Updating ${linksToUpdate.length} link(s)...`);
        const results = await client.updateLinks(oldTarget, newTarget);
        
        const output = formatOutput(results, options.output, [
          'noteId', 'noteTitle', 'updated', 'error'
        ]);
        console.log(output);
        
        const successful = results && Array.isArray(results) ? results.filter((r: any) => r.updated).length : 0;
        const failed = results && Array.isArray(results) ? results.length - successful : 0;
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Successfully updated ${successful} link(s)`));
          if (failed > 0) {
            logger.warn(chalk.yellow(`Failed to update ${failed} link(s)`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Validate links command
  linkCommand
    .command('validate')
    .description('Validate all links in a note')
    .argument('<note-id>', 'note ID')
    .action(async (noteId: string, options: LinkValidateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        logger.info('Validating links...');
        const validation = await client.validateNoteLinks(noteId);
        
        const output = formatOutput([validation], options.output, [
          'noteId', 'totalLinks', 'validLinks', 'brokenLinks', 'warnings'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          if (validation.brokenLinks === 0) {
            logger.info(chalk.green('All links are valid!'));
          } else {
            logger.warn(chalk.yellow(`Found ${validation.brokenLinks} broken link(s)`));
          }
          
          if (validation.warnings > 0) {
            logger.warn(chalk.yellow(`${validation.warnings} warning(s) found`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Interactively fix broken links
 */
async function fixBrokenLinksInteractively(brokenLinks: any[], client: TriliumClient, logger: any): Promise<void> {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  for (const brokenLink of brokenLinks) {
    console.log(chalk.yellow(`\nBroken link found:`));
    console.log(`  Source: ${brokenLink.sourceTitle} (${brokenLink.sourceNoteId})`);
    console.log(`  Broken link: ${brokenLink.brokenLink}`);
    console.log(`  Context: ${brokenLink.context}`);
    
    const answer = await new Promise<string>((resolve) => {
      rl.question(chalk.blue('Fix this link? (y)es, (s)kip, (q)uit: '), resolve);
    });
    
    if (answer.toLowerCase() === 'q' || answer.toLowerCase() === 'quit') {
      break;
    }
    
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      const newTarget = await new Promise<string>((resolve) => {
        rl.question(chalk.blue('Enter new target (note ID or title): '), resolve);
      });
      
      if (newTarget.trim()) {
        try {
          await client.updateLinkInNote(
            brokenLink.sourceNoteId, 
            brokenLink.brokenLink, 
            newTarget.trim()
          );
          logger.info(chalk.green('Link updated successfully'));
        } catch (error) {
          logger.error(chalk.red(`Failed to update link: ${error}`));
        }
      }
    }
  }
  
  rl.close();
}