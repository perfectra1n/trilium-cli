import chalk from 'chalk';
import type { Command } from 'commander';

// Import command handlers
import { formatOutput, handleCliError, createTriliumClient } from '../utils/cli.js';
import { createLogger } from '../utils/logger.js';

import { setupAttachmentCommands } from './commands/attachment.js';
import { setupAttributeCommands } from './commands/attribute.js';
import { setupBackupCommand } from './commands/backup.js';
import { setupBranchCommands } from './commands/branch.js';
import { setupCalendarCommand } from './commands/calendar.js';
import { setupCompletionCommands } from './commands/completion.js';
import { setupConfigCommands } from './commands/config.js';
import { setupImportExportCommands } from './commands/import-export.js';
import { setupLinkCommands } from './commands/link.js';
import { setupNoteCommands } from './commands/note.js';
import { setupPipeCommand } from './commands/pipe.js';
import { setupPluginCommands } from './commands/plugin.js';
import { setupProfileCommands } from './commands/profile.js';
import { setupQuickCommand } from './commands/quick.js';
import { setupSearchCommands } from './commands/search.js';
import { setupTagCommands } from './commands/tag.js';
import { setupTemplateCommands } from './commands/template.js';
import { setupTUICommand } from './commands/tui.js';

// Import utilities
import type { BaseCommandOptions } from './types.js';


/**
 * Set up all CLI commands
 */
export async function setupCommands(program: Command): Promise<void> {
  // Core configuration and profile management
  setupConfigCommands(program);
  setupProfileCommands(program);
  
  // Terminal User Interface
  setupTUICommand(program);

  // Note operations
  setupNoteCommands(program);
  setupSearchCommands(program);

  // Note structure management
  setupBranchCommands(program);
  setupAttributeCommands(program);
  setupAttachmentCommands(program);

  // Content creation and management
  setupPipeCommand(program);
  setupQuickCommand(program);
  setupTemplateCommands(program);

  // Analysis and navigation
  setupLinkCommands(program);
  setupTagCommands(program);

  // Utility operations
  setupBackupCommand(program);
  setupCalendarCommand(program);

  // Import/Export functionality
  setupImportExportCommands(program);

  // Extension and completion
  setupPluginCommands(program);
  setupCompletionCommands(program);

  // Info command - get app/server information
  program
    .command('info')
    .description('Get app/server information')
    .action(async (options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const appInfo = await client.getAppInfo();
        
        const output = formatOutput([appInfo], options.output, [
          'appVersion', 'dbVersion', 'syncVersion', 'buildDate', 'buildRevision',
          'dataDirectory', 'documentPath', 'clipperProtocolVersion', 'utcDateTime'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green('Application information retrieved successfully'));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

// Re-export types
export * from './types.js';