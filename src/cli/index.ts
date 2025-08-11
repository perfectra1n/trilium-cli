import type { Command } from 'commander';
import chalk from 'chalk';

// Import command handlers
import { setupConfigCommands } from './commands/config.js';
import { setupNoteCommands } from './commands/note.js';
import { setupSearchCommands } from './commands/search.js';
import { setupProfileCommands } from './commands/profile.js';
import { setupBranchCommands } from './commands/branch.js';
import { setupAttributeCommands } from './commands/attribute.js';
import { setupAttachmentCommands } from './commands/attachment.js';
import { setupBackupCommand } from './commands/backup.js';
import { setupCalendarCommand } from './commands/calendar.js';
import { setupPipeCommand } from './commands/pipe.js';
import { setupLinkCommands } from './commands/link.js';
import { setupTagCommands } from './commands/tag.js';
import { setupTemplateCommands } from './commands/template.js';
import { setupQuickCommand } from './commands/quick.js';
import { setupImportExportCommands } from './commands/import-export.js';
import { setupPluginCommands } from './commands/plugin.js';
import { setupCompletionCommands } from './commands/completion.js';

// Import utilities
import type { BaseCommandOptions } from './types.js';
import { createLogger } from '../utils/logger.js';
import { formatOutput, handleCliError, createTriliumClient } from '../utils/cli.js';

/**
 * Set up all CLI commands
 */
export async function setupCommands(program: Command): Promise<void> {
  // Core configuration and profile management
  setupConfigCommands(program);
  setupProfileCommands(program);

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

  // TUI command - run interactive interface
  program
    .command('tui')
    .description('Run interactive Terminal User Interface')
    .option('--theme <theme>', 'TUI theme (default, dark, light)', 'default')
    .option('--refresh <ms>', 'Refresh interval in milliseconds', (val) => parseInt(val, 10), 5000)
    .action(async (options: BaseCommandOptions & { theme?: string; refresh?: number }) => {
      const logger = createLogger(options.verbose);
      
      try {
        // Dynamically import TUI to avoid loading React/Ink in CLI-only usage
        const { runTUI } = await import('../tui/index.js');
        const { createCliConfig } = await import('../utils/cli.js');
        
        logger.debug('Starting TUI...');
        
        const config = await createCliConfig(options.config);
        
        const tuiOptions = {
          ...options,
          theme: options.theme || 'default',
          refreshInterval: options.refresh || 5000
        };
        
        await runTUI(config, tuiOptions);
        
      } catch (error) {
        if (error instanceof Error && error.message.includes('Cannot find module')) {
          logger.error('TUI dependencies not available. Please install with: npm install --include=optional');
        } else {
          handleCliError(error, logger);
        }
      }
    });

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