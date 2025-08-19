#!/usr/bin/env node

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';
import { Command } from 'commander';

// Import types and utilities
import { setupCommands } from './cli/index.js';
import type { GlobalOptions } from './cli/types.js';
import { Config } from './config/index.js';
import type {
  Result} from './error.js';
import { 
  TriliumError, 
  ConfigError, 
  ErrorContext, 
  EnhancedError,
  InvalidInputError,
  TimeoutError,
  Ok,
  Err,
  tryCatch
} from './error.js';
import type { LogLevel } from './types/common.js';
import { createLogger } from './utils/logger.js';
import { validateUrl } from './utils/validation.js';

// Get package info from package.json with proper path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Resolve package.json path for different environments:
 * - Development: src/main.ts -> ../package.json
 * - Compiled: dist/lib/main.js -> ../../package.json
 */
function resolvePackageJsonPath(): string {
  // Try multiple possible locations
  const possiblePaths = [
    join(__dirname, '../package.json'),     // Development: src/ -> ../package.json
    join(__dirname, '../../package.json'),  // Compiled: dist/lib/ -> ../../package.json
    join(__dirname, '../../../package.json'), // Nested build structure
  ];
  
  for (const path of possiblePaths) {
    try {
      // Test if file exists and is readable
      readFileSync(path, 'utf8');
      return path;
    } catch {
      // Continue to next path
      continue;
    }
  }
  
  // Fallback: return the most likely path
  return possiblePaths[0] as string;
}

let packageInfo: { name: string; version: string; description: string };
try {
  const packagePath = resolvePackageJsonPath();
  const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));
  packageInfo = {
    name: packageData.name || 'trilium-cli-ts',
    version: packageData.version || '0.1.0',
    description: packageData.description || 'A CLI and TUI client for Trilium Notes'
  };
} catch (error) {
  // Fallback if package.json cannot be read
  packageInfo = {
    name: 'trilium-cli-ts',
    version: '0.1.0',
    description: 'A CLI and TUI client for Trilium Notes'
  };
}

/**
 * Application lifecycle manager
 */
export class Application {
  private logger = createLogger(false);
  private config?: Config;
  private shutdownHandlers: (() => Promise<void> | void)[] = [];

  /**
   * Initialize the application with configuration
   */
  async initialize(options: GlobalOptions): Promise<Result<Config>> {
    return tryCatch(async () => {
      // Setup logging first
      this.setupLogging(options.verbose);
      
      this.logger.debug('Initializing application...');

      // Load configuration
      const result = await this.loadConfiguration(options);
      if (!result.success) {
        throw result.error;
      }
      
      this.config = result.data;
      
      // Apply environment variable overrides
      await this.applyEnvironmentOverrides();
      
      // Apply CLI argument overrides
      this.applyCLIOverrides(options);
      
      // Validate configuration
      await this.validateConfiguration();
      
      this.logger.debug('Application initialized successfully');
      
      return this.config;
    }, (error) => {
      if (error instanceof TriliumError) {
        return error;
      }
      return TriliumError.fromUnknown(error, 'Failed to initialize application');
    });
  }

  /**
   * Load configuration with profile handling
   */
  private async loadConfiguration(options: GlobalOptions): Promise<Result<Config>> {
    return tryCatch(async () => {
      const config = new Config(options.config);
      await config.load();
      
      // Apply profile override if specified
      if (options.profile) {
        try {
          config.setCurrentProfile(options.profile);
        } catch (error) {
          const context = new ErrorContext()
            .withCode('PROFILE_NOT_FOUND')
            .withOperationContext(`Setting profile '${options.profile}'`)
            .withSuggestion(`List available profiles with 'trilium profile list'`)
            .withSuggestion(`Create the profile with 'trilium profile create ${options.profile}'`)
            .withHelpTopic('profiles');
          
          if (error instanceof TriliumError) {
            throw error.withContext(context);
          }
          throw new ConfigError(`Profile '${options.profile}' not found`).withContext(context);
        }
      }
      
      return config;
    }, (error) => {
      if (error instanceof TriliumError) {
        return error;
      }
      return new ConfigError(`Failed to load configuration: ${error}`);
    });
  }

  /**
   * Apply environment variable overrides with comprehensive validation
   */
  private async applyEnvironmentOverrides(): Promise<void> {
    if (!this.config) return;
    
    const profile = this.config.getCurrentProfile();
    
    // Validate all environment variables first
    this.validateEnvironmentVariables();
    
    // Server URL override
    if (process.env.TRILIUM_SERVER_URL) {
      try {
        validateUrl(process.env.TRILIUM_SERVER_URL, 'TRILIUM_SERVER_URL');
        profile.serverUrl = process.env.TRILIUM_SERVER_URL;
        this.logger.debug('Applied server URL from environment variable');
      } catch (error) {
        const context = new ErrorContext()
          .withCode('INVALID_ENV_URL')
          .withOperationContext('Reading TRILIUM_SERVER_URL environment variable')
          .withSuggestion('Check the format of TRILIUM_SERVER_URL environment variable')
          .withSuggestion('Ensure the URL includes protocol (http:// or https://)');
        
        throw new ConfigError('Invalid TRILIUM_SERVER_URL environment variable').withContext(context);
      }
    }
    
    // API token override
    if (process.env.TRILIUM_API_TOKEN) {
      profile.apiToken = process.env.TRILIUM_API_TOKEN;
      this.logger.debug('Applied API token from environment variable');
    }
    
    // Log level override
    if (process.env.LOG_LEVEL) {
      const validLevels = ['error', 'warn', 'info', 'debug'];
      if (!validLevels.includes(process.env.LOG_LEVEL.toLowerCase())) {
        const context = new ErrorContext()
          .withCode('INVALID_LOG_LEVEL')
          .withOperationContext('Reading LOG_LEVEL environment variable')
          .withSuggestion(`Valid log levels: ${validLevels.join(', ')}`)
          .withSuggestion('Example: LOG_LEVEL=debug');
        
        throw new ConfigError(`Invalid LOG_LEVEL: ${process.env.LOG_LEVEL}`).withContext(context);
      }
    }
  }

  /**
   * Validate environment variables for type safety and security
   */
  private validateEnvironmentVariables(): void {
    const envValidations = [
      {
        name: 'TRILIUM_SERVER_URL',
        value: process.env.TRILIUM_SERVER_URL,
        validate: (value: string) => {
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        },
        error: 'Must be a valid URL'
      },
      {
        name: 'TRILIUM_API_TOKEN',
        value: process.env.TRILIUM_API_TOKEN,
        validate: (value: string) => value.length > 10,
        error: 'Must be a valid API token'
      },
      {
        name: 'LOG_LEVEL',
        value: process.env.LOG_LEVEL,
        validate: (value: string) => ['error', 'warn', 'info', 'debug'].includes(value.toLowerCase()),
        error: 'Must be one of: error, warn, info, debug'
      },
      {
        name: 'NODE_ENV',
        value: process.env.NODE_ENV,
        validate: (value: string) => ['development', 'production', 'test'].includes(value.toLowerCase()),
        error: 'Should be one of: development, production, test (optional)'
      }
    ];

    for (const validation of envValidations) {
      if (validation.value && !validation.validate(validation.value)) {
        const context = new ErrorContext()
          .withCode('INVALID_ENV_VAR')
          .withOperationContext(`Validating ${validation.name} environment variable`)
          .withSuggestion(`${validation.name}: ${validation.error}`)
          .withSuggestion('Check your environment variable configuration');
        
        throw new ConfigError(`Invalid ${validation.name} environment variable: ${validation.error}`).withContext(context);
      }
    }
  }

  /**
   * Apply CLI argument overrides
   */
  private applyCLIOverrides(options: GlobalOptions): void {
    if (!this.config) return;
    
    const profile = this.config.getCurrentProfile();
    
    if (options.serverUrl) {
      profile.serverUrl = options.serverUrl;
      this.logger.debug('Applied server URL from CLI argument');
    }
    
    if (options.apiToken) {
      profile.apiToken = options.apiToken;
      this.logger.debug('Applied API token from CLI argument');
    }
  }

  /**
   * Validate final configuration
   */
  private async validateConfiguration(): Promise<void> {
    if (!this.config) return;
    
    try {
      const profile = this.config.getCurrentProfile();
      
      // Validate server URL
      if (profile.serverUrl) {
        validateUrl(profile.serverUrl, 'serverUrl');
      }
      
      // Token validation removed - tokens can have various formats
      
    } catch (error) {
      const context = new ErrorContext()
        .withCode('CONFIG_VALIDATION_FAILED')
        .withOperationContext('Configuration validation')
        .withSuggestion('Review your configuration settings')
        .withSuggestion('Use the TUI for guided configuration')
        .withHelpTopic('config');
      
      if (error instanceof TriliumError) {
        throw error.withContext(context);
      }
      throw new ConfigError(`Configuration validation failed: ${error}`).withContext(context);
    }
  }

  /**
   * Set up logging based on options
   */
  public setupLogging(verbose?: boolean): void {
    const logLevel: LogLevel = verbose ? 'debug' : 
                    process.env.LOG_LEVEL ? 
                    (process.env.LOG_LEVEL.toLowerCase() as LogLevel) : 
                    'info';
                    
    this.logger = createLogger(verbose, logLevel);
    this.logger.debug('Logging initialized', { level: logLevel });
  }

  /**
   * Add a shutdown handler
   */
  addShutdownHandler(handler: () => Promise<void> | void): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Gracefully shutdown the application with proper cleanup
   */
  async shutdown(signal?: string): Promise<void> {
    this.logger.info(signal ? `Received ${signal}. Shutting down gracefully...` : 'Shutting down...');
    
    // Set a timeout to prevent hanging shutdown
    const shutdownTimeout = setTimeout(() => {
      this.logger.warn('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, 10000); // 10 second timeout
    
    try {
      // Execute shutdown handlers with individual timeouts
      const shutdownPromises = this.shutdownHandlers.map(async (handler, index) => {
        try {
          // Individual handler timeout
          const handlerPromise = Promise.resolve(handler());
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new TimeoutError('Shutdown handler timed out')), 5000);
          });
          
          await Promise.race([handlerPromise, timeoutPromise]);
          this.logger.debug(`Shutdown handler ${index + 1} completed successfully`);
        } catch (error) {
          this.logger.error(`Error in shutdown handler ${index + 1}:`, error);
          // Don't rethrow - continue with other handlers
        }
      });
      
      // Wait for all handlers to complete or timeout
      await Promise.allSettled(shutdownPromises);
      
      // Clear the global timeout
      clearTimeout(shutdownTimeout);
      
      // Clear shutdown handlers to prevent memory leaks
      this.shutdownHandlers.length = 0;
      
      this.logger.debug('Application shutdown complete');
      
    } catch (error) {
      clearTimeout(shutdownTimeout);
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): Config | undefined {
    return this.config;
  }

  /**
   * Get the application logger
   */
  getLogger() {
    return this.logger;
  }
}

/**
 * Main application entry point
 */
export async function createCLIApplication(): Promise<Command> {
  const program = new Command();
  const app = new Application();
  
  // Set basic program info
  program
    .name('trilium')
    .description('A CLI and TUI client for Trilium Notes')
    .version(packageInfo.version, '-v, --version', 'display version number');

  // Global options
  program
    .option('-c, --config <path>', 'path to configuration file')
    .option('-p, --profile <name>', 'configuration profile to use')
    .option('--server-url <url>', 'Trilium server URL (overrides config)', process.env.TRILIUM_SERVER_URL)
    .option('--api-token <token>', 'API token (overrides config)', process.env.TRILIUM_API_TOKEN)
    .option('--verbose', 'enable verbose logging')
    .option('-o, --output <format>', 'output format (json, table, plain)', 'table');

  // Set up all commands
  await setupCommands(program);


  // Global error handling for commands
  program.hook('preAction', async (thisCommand, actionCommand) => {
    const options = thisCommand.opts() as GlobalOptions;
    
    // Check if this is the config init command - it doesn't require existing configuration
    const commandPath = actionCommand.parent ? 
      `${actionCommand.parent.name()} ${actionCommand.name()}` : 
      actionCommand.name();
    const isConfigInit = commandPath === 'config init';
    
    try {
      // Skip initialization for config init command
      if (!isConfigInit) {
        const configResult = await app.initialize(options);
        if (!configResult.success) {
          handleApplicationError(configResult.error, app.getLogger());
          process.exit(configResult.error.getExitCode ? configResult.error.getExitCode() : 1);
        }
      } else {
        // For config init, just setup logging
        app.setupLogging(options.verbose);
      }
      
      // Store app instance for commands to use
      (thisCommand as any).__app = app;
      
    } catch (error) {
      handleApplicationError(error, app.getLogger());
      process.exit(1);
    }
  });

  // Override exit handling with enhanced error context
  program.exitOverride((err) => {
    if (err.exitCode === 0) {
      return;
    }
    
    const logger = app.getLogger();
    
    if (err.code === 'commander.help' || err.code === 'commander.version') {
      return;
    }
    
    if (err.code === 'commander.unknownCommand') {
      // Extract command name for better suggestions
      const commandMatch = err.message.match(/unknown command '(.+?)'/i);
      const unknownCommand = commandMatch ? commandMatch[1] : err.message;
      
      // Get available commands for suggestions
      const availableCommands = program.commands.map(cmd => cmd.name());
      const suggestions = TriliumError.suggestSimilarCommands(unknownCommand || 'unknown', availableCommands);
      
      const context = new ErrorContext()
        .withCode('UNKNOWN_COMMAND')
        .withOperationContext(`Executing command '${unknownCommand}'`)
        .withSuggestion('Run --help to see available commands')
        .withSuggestion('Check command spelling')
        .withSimilarItems(suggestions)
        .withHelpTopic('commands');
      
      const unknownError = new InvalidInputError(`Unknown command: ${unknownCommand}`)
        .withContext(context);
      
      handleApplicationError(unknownError, logger);
      process.exit(2);
    }
    
    if (err.code === 'commander.unknownOption') {
      const optionMatch = err.message.match(/unknown option '(.+?)'/i);
      const unknownOption = optionMatch ? optionMatch[1] : err.message;
      
      const context = new ErrorContext()
        .withCode('UNKNOWN_OPTION')
        .withOperationContext(`Using option '${unknownOption}'`)
        .withSuggestion('Run --help to see available options')
        .withSuggestion('Check option spelling and format')
        .withHelpTopic('options');
      
      const optionError = new InvalidInputError(`Unknown option: ${unknownOption}`)
        .withContext(context);
      
      handleApplicationError(optionError, logger);
      process.exit(2);
    }
    
    if (err.code === 'commander.missingArgument') {
      const context = new ErrorContext()
        .withCode('MISSING_ARGUMENT')
        .withOperationContext('Command execution')
        .withSuggestion('Check the command syntax with --help')
        .withSuggestion('Ensure all required arguments are provided')
        .withHelpTopic('usage');
      
      const argumentError = new InvalidInputError(`Missing argument: ${err.message}`)
        .withContext(context);
      
      handleApplicationError(argumentError, logger);
      process.exit(2);
    }
    
    // Handle other commander errors with context
    const context = new ErrorContext()
      .withCode('COMMAND_ERROR')
      .withOperationContext('Command execution')
      .withSuggestion('Run the command with --help for usage information')
      .withSuggestion('Check your command syntax');
    
    const commandError = TriliumError.fromUnknown(err, 'Command execution failed')
      .withContext(context);
    
    handleApplicationError(commandError, logger);
    process.exit(err.exitCode || 1);
  });

  // Setup signal handlers with proper cleanup
  const gracefulShutdown = async (signal: string) => {
    try {
      await app.shutdown(signal);
      process.exit(0);
    } catch (error) {
      app.getLogger().error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  // Prevent multiple shutdown attempts
  let shutdownInProgress = false;
  
  const handleShutdownSignal = (signal: string) => {
    if (shutdownInProgress) {
      app.getLogger().warn(`Received ${signal} during shutdown, forcing exit`);
      process.exit(1);
      return;
    }
    shutdownInProgress = true;
    gracefulShutdown(signal).catch((error) => {
      app.getLogger().error('Fatal error during shutdown:', error);
      process.exit(1);
    });
  };

  process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
  process.on('SIGINT', () => handleShutdownSignal('SIGINT'));
  
  // Handle additional signals for robustness
  process.on('SIGHUP', () => handleShutdownSignal('SIGHUP'));
  process.on('SIGQUIT', () => handleShutdownSignal('SIGQUIT'));
  
  // Handle unhandled promise rejections with context
  process.on('unhandledRejection', (reason, promise) => {
    const logger = app.getLogger();
    logger.error('Unhandled Promise Rejection detected');
    
    const context = new ErrorContext()
      .withCode('UNHANDLED_REJECTION')
      .withOperationContext('Promise execution')
      .withSuggestion('This indicates a programming error that should be reported')
      .withSuggestion('Try running with --verbose for more details')
      .withHelpTopic('troubleshooting');
    
    const rejectionError = TriliumError.fromUnknown(reason, 'Unhandled promise rejection')
      .withContext(context);
    
    handleApplicationError(rejectionError, logger);
    
    if (logger.isDebugEnabled()) {
      logger.debug('Promise that was rejected:', promise);
      logger.debug('Rejection reason:', reason);
    }
    
    process.exit(1);
  });

  // Handle uncaught exceptions with context
  process.on('uncaughtException', (error) => {
    const logger = app.getLogger();
    logger.error('Uncaught Exception detected');
    
    const context = new ErrorContext()
      .withCode('UNCAUGHT_EXCEPTION')
      .withOperationContext('Application execution')
      .withSuggestion('This indicates a serious programming error that should be reported')
      .withSuggestion('Try running with --verbose for more details')
      .withHelpTopic('troubleshooting');
    
    const uncaughtError = TriliumError.fromUnknown(error, 'Uncaught exception')
      .withContext(context);
    
    handleApplicationError(uncaughtError, logger);
    
    if (logger.isDebugEnabled()) {
      logger.debug('Exception details:', error);
      logger.debug('Stack trace:', error.stack);
    }
    
    process.exit(1);
  });

  return program;
}

/**
 * Handle application-level errors with proper formatting and suggestions
 */
export function handleApplicationError(error: unknown, logger = createLogger()): void {
  if (error instanceof EnhancedError) {
    // Enhanced error with context and suggestions
    logger.error(chalk.red(error.message));
    
    if (error.context.suggestions.length > 0) {
      logger.info(chalk.yellow('Suggestions:'));
      error.context.suggestions.forEach(suggestion => {
        logger.info(chalk.yellow(`  • ${suggestion}`));
      });
    }
    
    if (error.context.similarItems.length > 0) {
      logger.info(chalk.yellow('Did you mean:'));
      error.context.similarItems.forEach(item => {
        logger.info(chalk.yellow(`  • ${item}`));
      });
    }
    
    if (error.context.helpTopics.length > 0) {
      logger.info(chalk.cyan('For more help:'));
      error.context.helpTopics.forEach(topic => {
        logger.info(chalk.cyan(`  trilium help ${topic}`));
      });
    }
    
    return;
  }
  
  if (error instanceof TriliumError) {
    // Regular Trilium error - add context if it's user-facing
    if (error.isUserFacing()) {
      logger.error(chalk.red(error.getUserMessage()));
      
      const suggestions = error.getSuggestions();
      if (suggestions.length > 0) {
        logger.info(chalk.yellow('Suggestions:'));
        suggestions.forEach(suggestion => {
          logger.info(chalk.yellow(`  • ${suggestion}`));
        });
      }
      
      const helpTopics = error.getHelpTopics();
      if (helpTopics.length > 0) {
        logger.info(chalk.cyan('For more help:'));
        helpTopics.forEach(topic => {
          logger.info(chalk.cyan(`  trilium help ${topic}`));
        });
      }
    } else {
      logger.error(chalk.red(error.message));
    }
    
    if (logger.isDebugEnabled()) {
      logger.debug('Error details:', {
        name: error.name,
        code: error.code,
        category: error.getCategory(),
        retryable: error.isRetryable(),
        stack: error.stack
      });
    }
    
    return;
  }
  
  if (error instanceof Error) {
    logger.error(chalk.red(`An unexpected error occurred: ${error.message}`));
    if (logger.isDebugEnabled()) {
      logger.debug('Error stack:', error.stack);
    }
    return;
  }
  
  // Unknown error type
  logger.error(chalk.red(`An unexpected error occurred: ${String(error)}`));
}

/**
 * Main entry point for the CLI application
 */
export async function main(argv?: string[]): Promise<void> {
  try {
    const program = await createCLIApplication();
    await program.parseAsync(argv || process.argv);
  } catch (error) {
    handleApplicationError(error);
    process.exit(1);
  }
}

// Export for testing and library use - remove duplicate exports

// Default export for direct execution
export default main;