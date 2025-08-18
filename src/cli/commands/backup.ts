import { createWriteStream } from 'fs';
import { resolve } from 'path';

import chalk from 'chalk';
import type { Command } from 'commander';

import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import type { BackupOptions } from '../types.js';

/**
 * Set up backup commands
 */
export function setupBackupCommand(program: Command): void {
  program
    .command('backup')
    .description('Create a backup of the Trilium database')
    .option('-n, --name <name>', 'backup name (defaults to current timestamp)')
    .action(async (options: BackupOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // Generate backup name if not provided
        const backupName = options.name || `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
        
        logger.info('Starting backup process...');
        logger.info(`Backup name: ${backupName}`);
        
        // Request backup from server
        const startTime = Date.now();
        await client.createBackup(backupName);
        const duration = Date.now() - startTime;
        
        if (options.output === 'json') {
          console.log(JSON.stringify({
            success: true,
            backupName,
            duration
          }, null, 2));
        } else {
          logger.info(chalk.green('Backup completed successfully'));
          logger.info(`Backup name: ${backupName}`);
          logger.info(`Duration: ${duration}ms`);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}