import chalk from 'chalk';
import type { Command } from 'commander';
import { existsSync } from 'fs';
import ora from 'ora';

import { Config } from '../../config/index.js';
import { TriliumError, ValidationError } from '../../error.js';
import type { Profile } from '../../types/config.js';
import { formatOutput, handleCliError, formatSuccessMessage, formatWarningMessage, createTriliumClient } from '../../utils/cli.js';
import { openFile } from '../../utils/editor.js';
import { createLogger } from '../../utils/logger.js';
import { validateUrl } from '../../utils/validation.js';
import { isInteractive, safePrompt, ensureRawMode } from '../../utils/interactive.js';
import type { 
  ConfigShowOptions, 
  ConfigSetOptions,
  BaseCommandOptions 
} from '../types.js';

/**
 * Set up configuration commands
 */
export function setupConfigCommands(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage CLI configuration');

  // Initialize configuration (onboarding command)
  configCmd
    .command('init')
    .description('Initialize Trilium CLI configuration (guided setup)')
    .option('--reconfigure', 'Reconfigure even if config exists')
    .action(async (options: BaseCommandOptions & { reconfigure?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        // Check if we're in a TTY environment
        const isTTY = process.stdin.isTTY && process.stdout.isTTY;
        if (!isTTY) {
          console.error(chalk.red('Error: Configuration initialization requires an interactive terminal.'));
          console.error(chalk.yellow('This command cannot be run in a non-interactive environment.'));
          console.error();
          console.error('If you are running this through a script or CI/CD:');
          console.error('  • Use environment variables for configuration');
          console.error('  • Or provide a pre-configured config file');
          process.exit(1);
        }
        
        // Ensure proper terminal mode for tsx compatibility
        ensureRawMode();
        
        // Check if configuration already exists
        const config = new Config(options.config);
        const configPath = config.getConfigPath();
        const configExists = existsSync(configPath);
        
        if (configExists && !options.reconfigure) {
          await config.load();
          const profiles = config.getProfiles();
          
          if (profiles.length > 0) {
            // Configuration exists with profiles
            console.log(chalk.yellow('⚠️  Configuration already exists'));
            console.log();
            console.log(`Configuration file: ${chalk.cyan(configPath)}`);
            console.log(`Existing profiles: ${chalk.green(profiles.length)}`);
            
            const currentProfile = config.getData().currentProfile;
            if (currentProfile) {
              const profile = profiles.find(p => p.name === currentProfile);
              if (profile) {
                console.log(`Current profile: ${chalk.cyan(currentProfile)} (${profile.serverUrl})`);
              }
            }
            
            console.log();
            
            const { action } = await safePrompt([{
              type: 'list',
              name: 'action',
              message: 'What would you like to do?',
              choices: [
                { name: 'Add another profile', value: 'add' },
                { name: 'Reconfigure from scratch', value: 'reconfigure' },
                { name: 'View current configuration', value: 'view' },
                { name: 'Exit', value: 'exit' }
              ]
            }]);
            
            switch (action) {
              case 'add': {
                // Redirect to profile add flow
                console.log();
                console.log(chalk.cyan('→ Redirecting to profile creation...'));
                console.log();
                console.log('Run: ' + chalk.yellow('trilium profile add <profile-name>'));
                console.log();
                return;
              }
              
              case 'reconfigure': {
                const { confirmReset } = await safePrompt([{
                  type: 'confirm',
                  name: 'confirmReset',
                  message: chalk.red('⚠️  This will remove all existing profiles and settings. Continue?'),
                  default: false
                }]);
                
                if (!confirmReset) {
                  console.log(chalk.gray('Initialization cancelled'));
                  return;
                }
                
                // Reset and continue with initialization
                config.reset();
                await config.save();
                console.log();
                break;
              }
              
              case 'view': {
                // Show configuration
                console.log();
                const displayProfiles = profiles.map(p => ({
                  name: p.name,
                  serverUrl: p.serverUrl,
                  hasToken: !!p.apiToken,
                  isDefault: p.isDefault || false,
                  isCurrent: p.name === currentProfile
                }));
                
                console.log(formatOutput(displayProfiles, 'table', ['name', 'serverUrl', 'hasToken', 'isCurrent', 'isDefault']));
                return;
              }
              
              case 'exit':
              default:
                console.log(chalk.gray('Initialization cancelled'));
                return;
            }
          }
        }
        
        // Welcome message
        console.log();
        console.log(chalk.bold.cyan('🚀 Welcome to Trilium CLI!'));
        console.log();
        console.log('This guided setup will help you configure your connection to Trilium Notes.');
        console.log();
        console.log(chalk.gray('Prerequisites:'));
        console.log(chalk.gray('  • Trilium Notes server running (local or remote)'));
        console.log(chalk.gray('  • ETAPI token from Trilium (Settings → ETAPI)'));
        console.log();
        
        // Ask if user wants to continue
        const { ready } = await safePrompt([{
          type: 'confirm',
          name: 'ready',
          message: 'Ready to configure Trilium CLI?',
          default: true
        }]);
        
        if (!ready) {
          console.log(chalk.gray('Setup cancelled. Run "trilium config init" when you\'re ready.'));
          return;
        }
        
        console.log();
        console.log(chalk.bold('Step 1: Trilium Server Connection'));
        console.log(chalk.gray('Enter the URL of your Trilium server'));
        console.log();
        
        // Prompt for server URL
        const { serverUrl } = await safePrompt([{
          type: 'input',
          name: 'serverUrl',
          message: 'Trilium server URL:',
          default: 'http://localhost:8080',
          validate: (url: string) => {
            try {
              validateUrl(url, 'serverUrl');
              return true;
            } catch (error) {
              return error instanceof Error ? error.message : 'Invalid URL';
            }
          }
        }]);
        
        console.log();
        console.log(chalk.bold('Step 2: Authentication'));
        console.log(chalk.gray('Choose how to authenticate with your Trilium server:'));
        console.log();
        
        // Ask for authentication method
        const { authMethod } = await safePrompt([{
          type: 'list',
          name: 'authMethod',
          message: 'Authentication method:',
          choices: [
            { name: 'Use password (recommended) - Will generate an API token for you', value: 'password' },
            { name: 'Enter existing ETAPI token manually', value: 'token' },
            { name: 'No authentication (server has authentication disabled)', value: 'none' }
          ]
        }]);
        
        let apiToken: string | undefined;
        
        if (authMethod === 'password') {
          // Password-based authentication
          console.log();
          console.log(chalk.gray('Enter your Trilium login credentials:'));
          
          const { password } = await safePrompt([{
            type: 'password',
            name: 'password',
            message: 'Trilium password:',
            validate: (pwd: string) => {
              if (!pwd.trim()) return 'Password is required';
              return true;
            }
          }]);
          
          // Generate ETAPI token
          const spinner = ora('Generating API token...').start();
          try {
            const { generateETAPIToken } = await import('../../utils/auth.js');
            apiToken = await generateETAPIToken(serverUrl, { password }, 'trilium-cli');
            spinner.succeed('API token generated successfully');
          } catch (error) {
            spinner.fail('Failed to generate API token');
            
            if (error instanceof Error && error.message.includes('401')) {
              logger.error(chalk.red('Invalid password. Please check your credentials.'));
            } else {
              logger.error(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
            }
            
            // Offer to enter token manually
            const { continueWithToken } = await safePrompt([{
              type: 'confirm',
              name: 'continueWithToken',
              message: 'Would you like to enter an ETAPI token manually instead?',
              default: true
            }]);
            
            if (!continueWithToken) {
              console.log(chalk.gray('Setup cancelled.'));
              return;
            }
            
            // Fall back to manual token entry
            console.log();
            console.log(chalk.gray('You can find your ETAPI token in Trilium:'));
            console.log(chalk.gray('  Options → ETAPI → Create new ETAPI token'));
            console.log();
            
            const { manualToken } = await safePrompt([{
              type: 'password',
              name: 'manualToken',
              message: 'ETAPI token:',
              validate: (token: string) => {
                if (!token.trim()) return 'API token is required';
                return true;
              }
            }]);
            
            apiToken = manualToken;
          }
        } else if (authMethod === 'token') {
          // Manual token entry
          console.log();
          console.log(chalk.gray('You can find your ETAPI token in Trilium:'));
          console.log(chalk.gray('  Options → ETAPI → Create new ETAPI token'));
          console.log();
          
          const { manualToken } = await safePrompt([{
            type: 'password',
            name: 'manualToken',
            message: 'ETAPI token:',
            validate: (token: string) => {
              if (!token.trim()) return 'API token is required';
              return true;
            }
          }]);
          
          apiToken = manualToken;
        } else if (authMethod === 'none') {
          // No authentication needed
          console.log();
          console.log(chalk.yellow('⚠️  No authentication will be used.'));
          console.log(chalk.gray('Make sure your Trilium server has authentication disabled.'));
          apiToken = undefined;
        }
        
        console.log();
        console.log(chalk.bold('Step 3: Profile Configuration'));
        console.log(chalk.gray('Profiles allow you to manage multiple Trilium connections'));
        console.log();
        
        // Prompt for profile name
        const { profileName } = await safePrompt([{
          type: 'input',
          name: 'profileName',
          message: 'Profile name:',
          default: 'default',
          validate: (name: string) => {
            if (!name.trim()) return 'Profile name is required';
            if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
              return 'Profile name can only contain letters, numbers, hyphens, and underscores';
            }
            return true;
          }
        }]);
        
        // Prompt for description
        const { description } = await safePrompt([{
          type: 'input',
          name: 'description',
          message: 'Profile description (optional):',
          default: ''
        }]);
        
        console.log();
        console.log(chalk.bold('Step 4: Connection Test'));
        console.log(chalk.gray('Testing connection to Trilium server...'));
        console.log();
        
        // Test connection
        let connectionSuccess = false;
        let appInfo: any = null;
        
        try {
          const testClient = await createTriliumClient({
            ...options,
            serverUrl,
            apiToken
          });
          
          appInfo = await testClient.getAppInfo();
          connectionSuccess = true;
          
          console.log(chalk.green('✓ Connection successful!'));
          console.log(chalk.gray(`  Connected to Trilium ${appInfo.appVersion}`));
          console.log(chalk.gray(`  Database version: ${appInfo.dbVersion}`));
          console.log(chalk.gray(`  Sync version: ${appInfo.syncVersion}`));
        } catch (error) {
          console.log(chalk.red('✗ Connection failed'));
          console.log(chalk.red(`  ${error instanceof Error ? error.message : 'Unknown error'}`));
          console.log();
          
          const { continueAnyway } = await safePrompt([{
            type: 'confirm',
            name: 'continueAnyway',
            message: 'Save configuration anyway?',
            default: false
          }]);
          
          if (!continueAnyway) {
            console.log();
            console.log(chalk.yellow('Configuration not saved.'));
            console.log(chalk.gray('Please check your server URL and API token, then try again.'));
            return;
          }
        }
        
        // Create and save profile
        const profile: Profile = {
          name: profileName,
          serverUrl,
          apiToken,
          description: description || undefined,
          isDefault: true,
          created: new Date().toISOString()
        };
        
        config.setProfile(profile);
        config.setCurrentProfile(profileName);
        await config.save();
        
        // Success message
        console.log();
        console.log(chalk.green.bold('🎉 Configuration complete!'));
        console.log();
        console.log(chalk.gray('Configuration saved to:'));
        console.log(`  ${chalk.cyan(configPath)}`);
        console.log();
        console.log(chalk.gray('Profile created:'));
        console.log(`  Name: ${chalk.cyan(profileName)}`);
        console.log(`  Server: ${chalk.cyan(serverUrl)}`);
        if (connectionSuccess) {
          console.log(`  Status: ${chalk.green('Connected')}`);
        } else {
          console.log(`  Status: ${chalk.yellow('Not verified')}`);
        }
        console.log();
        console.log(chalk.bold('Next steps:'));
        console.log();
        console.log('  Try these commands to get started:');
        console.log();
        console.log(`  ${chalk.yellow('trilium search "test"')}     - Search for notes`);
        console.log(`  ${chalk.yellow('trilium note list')}         - List recent notes`);
        console.log(`  ${chalk.yellow('trilium note create')}       - Create a new note`);
        console.log(`  ${chalk.yellow('trilium --help')}            - Show all available commands`);
        console.log();
        console.log(chalk.gray('For more information, visit:'));
        console.log(chalk.cyan('  https://github.com/trilium/trilium-cli'));
        console.log();
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Show current configuration
  configCmd
    .command('show')
    .description('Show current configuration')
    .option('--path', 'Show configuration file path only')
    .action(async (options: ConfigShowOptions & { path?: boolean }) => {
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
            isDefault: p.isDefault || false,
            isCurrent: p.name === data.currentProfile
          }))
        };
        
        const outputFormat = options.output || 'table';
        const output = formatOutput(displayData, outputFormat);
        console.log(output);
        
        if (outputFormat === 'table') {
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
          const { confirm: answer } = await safePrompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to reset the configuration to defaults? This will remove all profiles and settings.',
            default: false
          }]);
          
          if (!answer) {
            logger.info('Configuration reset cancelled');
            return;
          }
        }
        
        // Reset configuration
        config.reset();
        await config.save();
        
        // Default to 'table' if output format is not specified
        const outputFormat = options.output || 'table';
        
        if (outputFormat === 'table') {
          logger.info(formatSuccessMessage('Configuration reset to defaults'));
          logger.info(formatWarningMessage('All profiles and custom settings have been removed'));
        } else {
          const output = formatOutput({ 
            success: true, 
            message: 'Configuration reset to defaults' 
          }, outputFormat);
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
          case 'currentProfile': {
            const profiles = config.getProfiles();
            const profile = profiles.find(p => p.name === value);
            if (!profile) {
              throw new TriliumError(`Profile '${value}' not found`);
            }
            config.setCurrentProfile(value);
            break;
          }
            
          case 'version':
            // Version is managed by the system
            throw new TriliumError('Version cannot be set manually');
            
          default: {
            // For extensibility - allow setting arbitrary values
            const newData = { ...data, [key]: value };
            config.setData(newData);
            logger.warn(formatWarningMessage(`Setting custom configuration key: ${key}`));
            break;
          }
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