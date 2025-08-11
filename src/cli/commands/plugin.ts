import type { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, statSync } from 'fs';
import { resolve, basename } from 'path';

import type {
  PluginListOptions,
  PluginInstallOptions,
  PluginUninstallOptions,
  PluginEnableOptions,
  PluginDisableOptions,
  PluginInfoOptions,
  PluginRunOptions,
} from '../types.js';
import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { createLogger } from '../../utils/logger.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';

/**
 * Set up plugin management commands
 */
export function setupPluginCommands(program: Command): void {
  const pluginCommand = program
    .command('plugin')
    .description('Plugin management');

  // List plugins
  pluginCommand
    .command('list')
    .alias('ls')
    .description('List installed plugins')
    .option('-d, --detailed', 'show detailed information')
    .option('-c, --capability <capability>', 'filter by capability')
    .action(async (options: PluginListOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const plugins = await client.getPlugins({
          capability: options.capability
        });
        
        const columns = options.detailed 
          ? ['name', 'version', 'status', 'capabilities', 'author', 'description']
          : ['name', 'version', 'status', 'capabilities'];
          
        const output = formatOutput(plugins, options.output, columns);
        console.log(output);
        
        if (options.output === 'table') {
          const enabled = plugins.filter(p => p.status === 'enabled').length;
          const disabled = plugins.filter(p => p.status === 'disabled').length;
          
          logger.info(chalk.green(`Found ${plugins.length} plugin(s): ${enabled} enabled, ${disabled} disabled`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Install plugin
  pluginCommand
    .command('install')
    .description('Install a plugin')
    .argument('<source>', 'plugin path or URL')
    .option('-f, --force', 'force installation')
    .option('--trust', 'trust the plugin (enables extended permissions)')
    .action(async (source: string, options: PluginInstallOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // Determine if source is local file/directory or URL
        let pluginSource;
        if (existsSync(source)) {
          const resolvedPath = resolve(source);
          const stats = statSync(resolvedPath);
          
          pluginSource = {
            type: stats.isDirectory() ? 'directory' : 'file',
            path: resolvedPath,
            name: basename(resolvedPath)
          };
        } else if (source.startsWith('http://') || source.startsWith('https://')) {
          pluginSource = {
            type: 'url',
            url: source,
            name: extractNameFromUrl(source)
          };
        } else {
          throw new TriliumError(`Invalid plugin source: ${source}`);
        }
        
        if (!options.force) {
          logger.warn(chalk.yellow('Installing plugins can be risky. Only install plugins from trusted sources.'));
          
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              chalk.yellow(`Do you want to install plugin from ${source}? (y/N): `),
              resolve
            );
          });
          rl.close();

          if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            logger.info('Installation cancelled.');
            return;
          }
        }
        
        logger.info(`Installing plugin from ${source}...`);
        
        const result = await client.installPlugin({
          source: pluginSource,
          trust: options.trust || false
        });
        
        const output = formatOutput([result], options.output, [
          'name', 'version', 'status', 'installed', 'warnings'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          if (result.installed) {
            logger.info(chalk.green(`Plugin "${result.name}" installed successfully`));
            if (result.warnings && result.warnings.length > 0) {
              logger.warn(chalk.yellow('Warnings:'));
              result.warnings.forEach(warning => logger.warn(`  - ${warning}`));
            }
          } else {
            logger.error(chalk.red(`Failed to install plugin: ${result.error}`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Uninstall plugin
  pluginCommand
    .command('uninstall')
    .alias('remove')
    .description('Uninstall a plugin')
    .argument('<name>', 'plugin name')
    .option('-f, --force', 'force uninstall without confirmation')
    .action(async (name: string, options: PluginUninstallOptions) => {
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
              chalk.yellow(`Are you sure you want to uninstall plugin "${name}"? This action cannot be undone. (y/N): `),
              resolve
            );
          });
          rl.close();

          if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            logger.info('Uninstall cancelled.');
            return;
          }
        }

        const client = await createTriliumClient(options);
        const result = await client.uninstallPlugin(name);
        
        if (options.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.success) {
            logger.info(chalk.green(`Plugin "${name}" uninstalled successfully`));
          } else {
            logger.error(chalk.red(`Failed to uninstall plugin: ${result.error}`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Enable plugin
  pluginCommand
    .command('enable')
    .description('Enable a plugin')
    .argument('<name>', 'plugin name')
    .action(async (name: string, options: PluginEnableOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const result = await client.enablePlugin(name);
        
        const output = formatOutput([{ name, enabled: result.success }], options.output, [
          'name', 'enabled', 'error'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          if (result.success) {
            logger.info(chalk.green(`Plugin "${name}" enabled successfully`));
          } else {
            logger.error(chalk.red(`Failed to enable plugin: ${result.error}`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Disable plugin
  pluginCommand
    .command('disable')
    .description('Disable a plugin')
    .argument('<name>', 'plugin name')
    .action(async (name: string, options: PluginDisableOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const result = await client.disablePlugin(name);
        
        const output = formatOutput([{ name, disabled: result.success }], options.output, [
          'name', 'disabled', 'error'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          if (result.success) {
            logger.info(chalk.green(`Plugin "${name}" disabled successfully`));
          } else {
            logger.error(chalk.red(`Failed to disable plugin: ${result.error}`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Plugin info
  pluginCommand
    .command('info')
    .description('Show plugin information')
    .argument('<name>', 'plugin name')
    .action(async (name: string, options: PluginInfoOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const plugin = await client.getPluginInfo(name);
        
        const output = formatOutput([plugin], options.output, [
          'name', 'version', 'status', 'author', 'description', 
          'capabilities', 'permissions', 'installDate', 'lastUsed'
        ]);
        console.log(output);
        
        if (options.output === 'table' && plugin.commands && plugin.commands.length > 0) {
          console.log(chalk.blue('\nAvailable Commands:'));
          plugin.commands.forEach(cmd => {
            console.log(`  ${cmd.name}: ${cmd.description}`);
          });
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Run plugin command
  pluginCommand
    .command('run')
    .description('Run a plugin command')
    .argument('<plugin>', 'plugin name')
    .argument('<command>', 'command name')
    .argument('[args...]', 'command arguments')
    .action(async (plugin: string, command: string, args: string[], options: PluginRunOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        logger.info(`Running plugin command: ${plugin}.${command}`);
        if (args.length > 0) {
          logger.info(`Arguments: ${args.join(' ')}`);
        }
        
        const result = await client.runPluginCommand({
          plugin,
          command,
          args
        });
        
        if (options.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          // Display plugin output
          if (result.output) {
            console.log(result.output);
          }
          
          if (result.success) {
            logger.info(chalk.green(`Command executed successfully`));
            if (result.executionTime) {
              logger.info(`Execution time: ${result.executionTime}ms`);
            }
          } else {
            logger.error(chalk.red(`Command failed: ${result.error}`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Extract plugin name from URL
 */
function extractNameFromUrl(url: string): string {
  const parts = url.split('/');
  let name = parts[parts.length - 1];
  
  // Remove common extensions
  name = name.replace(/\.(zip|tar\.gz|tgz|git)$/i, '');
  
  return name || 'unknown-plugin';
}