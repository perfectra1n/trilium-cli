import type { Command } from 'commander';
import chalk from 'chalk';

import { Config } from '../../config/index.js';
import type { 
  ConfigShowOptions, 
  ConfigSetOptions,
  BaseCommandOptions 
} from '../types.js';
import { createLogger } from '../../utils/logger.js';
import { formatOutput, handleCliError, formatSuccessMessage, formatWarningMessage } from '../../utils/cli.js';
import { openFile } from '../../utils/editor.js';
import { TriliumError } from '../../error.js';

/**
 * Set up configuration commands
 */
export function setupConfigCommands(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage CLI configuration');

  // Show current configuration
  configCmd
    .command('show')
    .description('Show current configuration')
    .option('--path', 'Show configuration file path only')
    .action(async (options: ConfigShowOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        if (options.path) {
          console.log(config.getConfigPath());
          return;
        }
        
        const data = config.getData();
        const profiles = config.getProfiles();
        
        // Format configuration for display
        const displayData = {
          configFile: config.getConfigPath(),
          version: data.version,
          currentProfile: data.currentProfile || '(none)',
          profileCount: profiles.length,
          profiles: profiles.map(p => ({
            name: p.name,
            baseUrl: p.serverUrl,
            hasToken: !!p.apiToken,
            isDefault: p.default || false,
            isCurrent: p.name === data.currentProfile
          }))
        };
        
        const output = formatOutput(displayData, options.output);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage('Configuration displayed successfully'));
          
          if (profiles.length === 0) {
            logger.warn(formatWarningMessage('No profiles configured. Use "trilium profile add" to create one.'));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Edit configuration file
  configCmd
    .command('edit')
    .description('Edit configuration file in external editor')
    .action(async (options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        const configPath = config.getConfigPath();
        logger.info(`Opening configuration file: ${configPath}`);
        
        const success = await openFile(configPath, { wait: true });
        
        if (success) {
          logger.info(formatSuccessMessage('Configuration file edited'));
          logger.info(formatWarningMessage('Note: You may need to restart the CLI for changes to take effect'));
        } else {
          throw new TriliumError('Failed to open configuration file in editor');
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Reset configuration to defaults
  configCmd
    .command('reset')
    .description('Reset configuration to defaults')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (options: BaseCommandOptions & { yes?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        // Confirmation prompt
        if (!options.yes) {
          const { confirm } = await import('inquirer');
          const answer = await confirm({
            message: 'Are you sure you want to reset the configuration to defaults? This will remove all profiles and settings.',
            default: false
          });
          
          if (!answer) {
            logger.info('Configuration reset cancelled');
            return;
          }
        }
        
        // Reset configuration
        config.reset();
        await config.save();
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage('Configuration reset to defaults'));
          logger.info(formatWarningMessage('All profiles and custom settings have been removed'));
        } else {
          const output = formatOutput({ 
            success: true, 
            message: 'Configuration reset to defaults' 
          }, options.output);
          console.log(output);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Set configuration value
  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string, options: ConfigSetOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        const data = config.getData();
        
        // Validate and set the configuration value
        switch (key) {
          case 'currentProfile':
            const profiles = config.getProfiles();
            const profile = profiles.find(p => p.name === value);
            if (!profile) {
              throw new TriliumError(`Profile '${value}' not found`);
            }
            config.setCurrentProfile(value);
            break;
            
          case 'version':
            // Version is managed by the system
            throw new TriliumError('Version cannot be set manually');
            
          default:
            // For extensibility - allow setting arbitrary values
            const newData = { ...data, [key]: value };
            config.setData(newData);
            logger.warn(formatWarningMessage(`Setting custom configuration key: ${key}`));
            break;
        }
        
        await config.save();
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage(`Configuration updated: ${key} = ${value}`));
        } else {
          const output = formatOutput({
            success: true,
            key,
            value,
            message: 'Configuration updated'
          }, options.output);
          console.log(output);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Get configuration value
  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key: string, options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        const data = config.getData();
        const value = (data as any)[key];
        
        if (value === undefined) {
          throw new TriliumError(`Configuration key '${key}' not found`);
        }
        
        if (options.output === 'plain') {
          console.log(String(value));
        } else {
          const output = formatOutput({
            key,
            value,
            type: typeof value
          }, options.output);
          console.log(output);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // List all configuration keys
  configCmd
    .command('list')
    .alias('ls')
    .description('List all configuration keys and values')
    .action(async (options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        const data = config.getData();
        const entries = Object.entries(data).map(([key, value]) => ({
          key,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          type: typeof value
        }));
        
        const output = formatOutput(entries, options.output, ['key', 'value', 'type']);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage(`Listed ${entries.length} configuration keys`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}