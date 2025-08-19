import chalk from 'chalk';
import type { Command } from 'commander';

import { Config } from '../../config/index.js';
import { TriliumError, ValidationError } from '../../error.js';
import type { Profile } from '../../types/config.js';
import { formatOutput, handleCliError, formatSuccessMessage, formatWarningMessage, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import { validateUrl } from '../../utils/validation.js';
import { isInteractive, safePrompt } from '../../utils/interactive.js';
import type { 
  ProfileListOptions, 
  ProfileCreateOptions, 
  ProfileDeleteOptions,
  ProfileSetOptions,
  BaseCommandOptions 
} from '../types.js';

/**
 * Set up profile management commands
 */
export function setupProfileCommands(program: Command): void {
  const profileCmd = program
    .command('profile')
    .description('Manage connection profiles');

  // List all profiles
  profileCmd
    .command('list')
    .alias('ls')
    .description('List all profiles')
    .option('-d, --detailed', 'Show detailed profile information')
    .action(async (options: ProfileListOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        const profiles = config.getProfiles();
        const currentProfile = config.getData().currentProfile;
        
        if (profiles.length === 0) {
          if (options.output === 'table') {
            logger.info('No profiles configured');
            logger.info(formatWarningMessage('Use "trilium profile add" to create your first profile'));
          } else {
            const output = formatOutput([], options.output);
            console.log(output);
          }
          return;
        }
        
        const displayProfiles = profiles.map(p => {
          const base = {
            name: p.name,
            serverUrl: p.serverUrl,
            hasToken: !!p.apiToken,
            isCurrent: p.name === currentProfile,
            isDefault: p.isDefault || false
          };
          
          if (options.detailed) {
            return {
              ...base,
              description: p.description || '(no description)',
              created: p.created || '(unknown)',
              lastUsed: p.lastUsed || '(never)'
            };
          }
          
          return base;
        });
        
        const columns = options.detailed 
          ? ['name', 'serverUrl', 'hasToken', 'isCurrent', 'isDefault', 'description', 'created', 'lastUsed']
          : ['name', 'serverUrl', 'hasToken', 'isCurrent', 'isDefault'];
        
        const output = formatOutput(displayProfiles, options.output, columns);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage(`Listed ${profiles.length} profile(s)`));
          
          const current = profiles.find(p => p.name === currentProfile);
          if (current) {
            logger.info(`Current profile: ${chalk.cyan(current.name)} (${current.serverUrl})`);
          } else {
            logger.warn(formatWarningMessage('No current profile set'));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Add a new profile
  profileCmd
    .command('add <name>')
    .description('Add a new profile')
    .option('--url <url>', 'Trilium server URL')
    .option('--token <token>', 'API token')
    .option('--description <desc>', 'Profile description')
    .option('--default', 'Set as default profile')
    .option('--test', 'Test connection after creating profile')
    .action(async (name: string, options: ProfileCreateOptions & { 
      url?: string; 
      token?: string; 
      description?: string; 
      default?: boolean;
      test?: boolean;
    }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        // Check if profile already exists
        const existingProfiles = config.getProfiles();
        if (existingProfiles.find(p => p.name === name)) {
          throw new ValidationError(`Profile '${name}' already exists`);
        }
        
        let serverUrl = options.url;
        let apiToken = options.token;
        let description = options.description;
        
        // Interactive mode if missing required info
        if (!serverUrl || !apiToken) {
          if (!serverUrl) {
            const { serverUrl: url } = await safePrompt([{
              type: 'input',
              name: 'serverUrl',
              message: 'Enter Trilium server URL:',
              validate: (url: string) => {
                try {
                  validateUrl(url, 'serverUrl');
                  return true;
                } catch (error) {
                  return error instanceof Error ? error.message : 'Invalid URL';
                }
              }
            }]);
            serverUrl = url;
          }
          
          if (!apiToken) {
            const { apiToken: token } = await safePrompt([{
              type: 'password',
              name: 'apiToken',
              message: 'Enter API token:',
              validate: (token: string) => {
                if (!token.trim()) return 'API token is required';
                return true;
              }
            }]);
            apiToken = token;
          }
          
          if (!description) {
            const { description: desc } = await safePrompt([{
              type: 'input',
              name: 'description',
              message: 'Enter profile description (optional):',
              default: ''
            }]);
            description = desc;
          }
        }
        
        // Validate inputs
        validateUrl(serverUrl!, 'serverUrl');
        
        // No token format validation - tokens can have various formats
        
        // Create profile
        const profile: Profile = {
          name,
          serverUrl: serverUrl!,
          apiToken: apiToken!,
          description: description || undefined,
          isDefault: options.default || existingProfiles.length === 0,
          created: new Date().toISOString()
        };
        
        // Test connection if requested
        if (options.test) {
          logger.info('Testing connection...');
          try {
            const testClient = await createTriliumClient({
              ...options,
              serverUrl: profile.serverUrl,
              apiToken: profile.apiToken
            });
            
            const appInfo = await testClient.getAppInfo();
            logger.info(formatSuccessMessage(`Connected successfully to Trilium ${appInfo.appVersion}`));
          } catch (error) {
            throw new TriliumError(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        
        // Save profile
        config.setProfile(profile);
        await config.save();
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage(`Profile '${name}' created successfully`));
          
          if (profile.isDefault) {
            logger.info(`Set '${name}' as the default profile`);
          }
        } else {
          const output = formatOutput({
            success: true,
            profile: {
              name: profile.name,
              serverUrl: profile.serverUrl,
              hasToken: !!profile.apiToken,
              isDefault: profile.isDefault,
              isCurrent: true
            },
            message: 'Profile created successfully'
          }, options.output);
          console.log(output);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Remove a profile
  profileCmd
    .command('remove <name>')
    .alias('rm')
    .description('Remove a profile')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (name: string, options: ProfileDeleteOptions & { force?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        // Check if profile exists
        const profiles = config.getProfiles();
        const profile = profiles.find(p => p.name === name);
        
        if (!profile) {
          throw new TriliumError(`Profile '${name}' not found`);
        }
        
        // Confirmation prompt
        if (!options.force) {
          const { confirm: answer } = await safePrompt([{
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to remove profile '${name}'?`,
            default: false
          }]);
          
          if (!answer) {
            logger.info('Profile removal cancelled');
            return;
          }
        }
        
        const isCurrentProfile = config.getData().currentProfile === name;
        
        // Remove profile
        config.removeProfile(name);
        await config.save();
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage(`Profile '${name}' removed successfully`));
          
          if (isCurrentProfile) {
            const newCurrent = config.getData().currentProfile;
            if (newCurrent) {
              logger.info(`Switched to profile '${newCurrent}'`);
            } else {
              logger.warn(formatWarningMessage('No current profile set. Use "trilium profile use" to set one.'));
            }
          }
        } else {
          const output = formatOutput({
            success: true,
            removedProfile: name,
            newCurrentProfile: config.getData().currentProfile,
            message: 'Profile removed successfully'
          }, options.output);
          console.log(output);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Set current profile
  profileCmd
    .command('use <name>')
    .description('Set current profile')
    .action(async (name: string, options: ProfileSetOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        // Check if profile exists
        const profiles = config.getProfiles();
        const profile = profiles.find(p => p.name === name);
        
        if (!profile) {
          throw new TriliumError(`Profile '${name}' not found`);
        }
        
        // Update current profile
        config.setCurrentProfile(name);
        
        // Update last used timestamp
        const updatedProfile: Profile = {
          ...profile,
          lastUsed: new Date().toISOString()
        };
        config.setProfile(updatedProfile);
        
        await config.save();
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage(`Switched to profile '${name}'`));
          logger.info(`Server: ${profile.serverUrl}`);
        } else {
          const output = formatOutput({
            success: true,
            currentProfile: name,
            serverUrl: profile.serverUrl,
            message: 'Profile switched successfully'
          }, options.output);
          console.log(output);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Show profile details
  profileCmd
    .command('show [name]')
    .description('Show profile details (current profile if name not provided)')
    .action(async (name: string | undefined, options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        let targetProfile: Profile;
        
        if (name) {
          // Show specific profile
          const profile = config.getProfiles().find(p => p.name === name);
          if (!profile) {
            throw new TriliumError(`Profile '${name}' not found`);
          }
          targetProfile = profile;
        } else {
          // Show current profile
          targetProfile = config.getCurrentProfile();
        }
        
        const profileDetails = {
          name: targetProfile.name,
          serverUrl: targetProfile.serverUrl,
          hasToken: !!targetProfile.apiToken,
          tokenPrefix: targetProfile.apiToken ? targetProfile.apiToken.substring(0, 10) + '...' : 'none',
          description: targetProfile.description || '(no description)',
          isDefault: targetProfile.isDefault || false,
          isCurrent: targetProfile.name === config.getData().currentProfile,
          created: targetProfile.created || '(unknown)',
          lastUsed: targetProfile.lastUsed || '(never)'
        };
        
        const output = formatOutput(profileDetails, options.output);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage('Profile details displayed'));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Test profile connection
  profileCmd
    .command('test [name]')
    .description('Test profile connection (current profile if name not provided)')
    .action(async (name: string | undefined, options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config(options.config);
        await config.load();
        
        let targetProfile: Profile;
        
        if (name) {
          const profile = config.getProfiles().find(p => p.name === name);
          if (!profile) {
            throw new TriliumError(`Profile '${name}' not found`);
          }
          targetProfile = profile;
        } else {
          targetProfile = config.getCurrentProfile();
        }
        
        logger.info(`Testing connection to profile '${targetProfile.name}'...`);
        
        // Test connection
        const client = await createTriliumClient({
          ...options,
          serverUrl: targetProfile.serverUrl,
          apiToken: targetProfile.apiToken
        });
        
        const startTime = Date.now();
        const appInfo = await client.getAppInfo();
        const responseTime = Date.now() - startTime;
        
        const testResult = {
          profile: targetProfile.name,
          serverUrl: targetProfile.serverUrl,
          status: 'success',
          appVersion: appInfo.appVersion,
          dbVersion: appInfo.dbVersion,
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString()
        };
        
        const output = formatOutput(testResult, options.output);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(formatSuccessMessage(`Connection test successful (${responseTime}ms)`));
          logger.info(`Trilium version: ${appInfo.appVersion}`);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}