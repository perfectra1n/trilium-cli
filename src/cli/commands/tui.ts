import { Command } from 'commander';
import chalk from 'chalk';
import { launchTUI } from 'trilium-tui';
import { Config } from '../../config/index.js';
import { ConfigError } from '../../error.js';

/**
 * Setup the TUI command
 */
export function setupTUICommand(program: Command): void {
  program
    .command('tui')
    .alias('ui')
    .description('Launch the Terminal User Interface for Trilium Notes')
    .option('-c, --config <path>', 'Path to configuration file')
    .option('-p, --profile <name>', 'Configuration profile to use')
    .action(async (options) => {
      try {
        // Check if configuration exists
        const config = new Config(options.config);
        await config.load();
        
        // Switch profile if specified
        if (options.profile) {
          try {
            config.setCurrentProfile(options.profile);
            await config.save();
          } catch (error) {
            console.error(chalk.red(`Profile '${options.profile}' not found.`));
            console.log(chalk.yellow('Available profiles:'));
            config.getProfiles().forEach(p => {
              console.log(`  - ${p.name}`);
            });
            process.exit(1);
          }
        }
        
        // Verify configuration
        const profile = config.getCurrentProfile();
        if (!profile.serverUrl || !profile.apiToken) {
          console.log(chalk.yellow('⚠️  Configuration incomplete'));
          console.log(chalk.cyan('Starting configuration wizard...'));
          console.log();
          
          // Could launch config wizard here
          console.log(chalk.yellow('Please run "trilium config init" to complete setup.'));
          process.exit(1);
        }
        
        // Show startup message
        console.log(chalk.cyan('🚀 Starting Trilium TUI...'));
        console.log(chalk.gray(`Server: ${profile.serverUrl}`));
        console.log(chalk.gray(`Profile: ${profile.name}`));
        console.log();
        console.log(chalk.yellow('Press Ctrl+Q to quit, H for help'));
        console.log();
        
        // Launch the TUI with configuration
        const tuiConfig = {
          serverUrl: profile.serverUrl,
          apiToken: profile.apiToken,
          configPath: options.config
        };
        await launchTUI(tuiConfig);
        
        // Show exit message
        console.log();
        console.log(chalk.green('👋 Thank you for using Trilium CLI!'));
        
      } catch (error) {
        if (error instanceof ConfigError) {
          console.error(chalk.red('Configuration error:'), error.message);
          console.log(chalk.yellow('Run "trilium config init" to set up your configuration.'));
        } else {
          console.error(chalk.red('Failed to launch TUI:'), error);
        }
        process.exit(1);
      }
    });

  // Add subcommand for TUI configuration
  const tuiConfig = program
    .command('tui:config')
    .description('Configure TUI settings');

  tuiConfig
    .command('theme <theme>')
    .description('Set TUI theme (default, dark, light)')
    .action(async (theme) => {
      try {
        const config = new Config();
        await config.load();
        
        const profile = config.getCurrentProfile();
        if (!profile.settings) {
          profile.settings = {};
        }
        profile.settings.tuiTheme = theme;
        
        await config.save();
        console.log(chalk.green(`✅ TUI theme set to: ${theme}`));
      } catch (error) {
        console.error(chalk.red('Failed to update theme:'), error);
        process.exit(1);
      }
    });

  tuiConfig
    .command('vim <enabled>')
    .description('Enable/disable vim mode (true/false)')
    .action(async (enabled) => {
      try {
        const config = new Config();
        await config.load();
        
        const profile = config.getCurrentProfile();
        if (!profile.settings) {
          profile.settings = {};
        }
        profile.settings.vimMode = enabled === 'true';
        
        await config.save();
        console.log(chalk.green(`✅ Vim mode ${enabled === 'true' ? 'enabled' : 'disabled'}`));
      } catch (error) {
        console.error(chalk.red('Failed to update vim mode:'), error);
        process.exit(1);
      }
    });
}