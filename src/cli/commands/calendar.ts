import chalk from 'chalk';
import type { Command } from 'commander';

import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import type { CalendarOptions } from '../types.js';

/**
 * Set up calendar commands
 */
export function setupCalendarCommand(program: Command): void {
  program
    .command('calendar')
    .alias('cal')
    .description('Calendar operations - find or create date notes')
    .argument('<date>', 'date in YYYY-MM-DD format')
    .option('--create', 'create date note if it doesn\'t exist')
    .action(async (date: string, options: CalendarOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        // Validate date format
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
          throw new TriliumError('Date must be in YYYY-MM-DD format');
        }

        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) {
          throw new TriliumError('Invalid date provided');
        }

        const client = await createTriliumClient(options);
        
        // Search for existing date note
        let dateNote = await client.getDayNote(date);
        
        if (!dateNote && options.create) {
          logger.info(`Creating date note for ${date}...`);
          dateNote = await client.getDayNote(date);
        }
        
        if (dateNote) {
          const output = formatOutput([dateNote], options.output, [
            'noteId', 'title', 'type', 'dateCreated', 'dateModified'
          ]);
          console.log(output);
          
          if (options.output === 'table') {
            logger.info(chalk.green(`Found date note for ${date}`));
            // Note: The API always returns or creates the note, so we can't tell if it was newly created
          }
        } else {
          if (options.output === 'json') {
            console.log(JSON.stringify({
              found: false,
              date,
              message: 'Date note not found. Use --create to create it.'
            }, null, 2));
          } else {
            logger.warn(chalk.yellow(`No date note found for ${date}`));
            logger.info('Use --create flag to create the date note');
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Format date for display
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  return date.toLocaleDateString('en-US', options);
}