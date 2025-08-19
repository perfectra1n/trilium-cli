import chalk from 'chalk';
import { Table } from 'console-table-printer';

import { TriliumClient } from '../api/client.js';
import { Config } from '../config/index.js';
import { ApiError, AuthError, ConfigError, ValidationError, TriliumError, ErrorContext } from '../error.js';
import type { BaseCommandOptions, GlobalOptions } from '../types/cli.js';
import type { OutputFormat } from '../types/common.js';

import { createLogger } from './logger.js';

/**
 * Type guard to check if an object has a specific property
 */
function hasProperty<T extends Record<string, unknown>>(
  obj: T,
  prop: string
): obj is T & Record<typeof prop, unknown> {
  return obj != null && typeof obj === 'object' && prop in obj;
}

/**
 * Create a TriliumClient instance using CLI options
 */
export async function createTriliumClient(options: BaseCommandOptions): Promise<TriliumClient> {
  const logger = createLogger(options.verbose);

  try {
    // Load config
    const config = new Config(options.config);
    await config.load();

    // Determine server URL and API token
    let baseUrl: string;
    let apiToken: string;

    if (options.serverUrl && options.apiToken) {
      // Use provided options
      baseUrl = options.serverUrl;
      apiToken = options.apiToken;
      logger.debug('Using command-line provided credentials');
    } else {
      // Use profile from config
      let profileName = options.profile;
      
      if (!profileName) {
        profileName = config.getData().currentProfile;
        if (!profileName) {
          throw new ConfigError(
            'No profile specified and no default profile configured. ' +
            'Use --profile option or configure a default profile with "trilium profile add"'
          );
        }
      }

      const profile = config.getProfiles().find(p => p.name === profileName);
      if (!profile) {
        throw new ConfigError(`Profile '${profileName}' not found`);
      }

      baseUrl = profile.serverUrl;
      apiToken = profile.apiToken || '';
      
      if (!apiToken) {
        throw new ConfigError(`Profile '${profileName}' has no API token configured`);
      }

      logger.debug(`Using profile: ${profileName}`);
    }

    // Create and configure client
    const client = new TriliumClient({
      baseUrl,
      apiToken,
      timeout: 30000,
      retries: 3,
      debugMode: options.debug || false,
    });

    // Test connection
    try {
      await client.getAppInfo();
      logger.debug('Successfully connected to Trilium server');
    } catch (error) {
      if (error instanceof AuthError) {
        throw new AuthError('Authentication failed. Please check your API token.');
      }
      throw new ApiError(`Failed to connect to server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return client;
  } catch (error) {
    if (error instanceof TriliumError) {
      throw error;
    }
    throw new ApiError(`Failed to create Trilium client: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Format output for display based on the specified format and selected columns
 */
export function formatOutput(
  data: unknown, 
  format: OutputFormat = 'table', 
  columns?: string[]
): string {
  // Default to 'table' if format is undefined
  const outputFormat = format || 'table';
  
  if (outputFormat === 'json') {
    return JSON.stringify(data, null, 2);
  }

  if (outputFormat === 'plain') {
    return formatPlainOutput(data, columns);
  }

  if (outputFormat === 'table') {
    return formatTableOutput(data, columns);
  }

  throw new Error(`Unknown output format: ${outputFormat}`);
}

/**
 * Format data as a table with optional column selection
 */
function formatTableOutput(data: unknown, columns?: string[]): string {
  if (Array.isArray(data) && data.length > 0) {
    const table = new Table({
      colorMap: {
        headerTop: 'cyan',
        headerBottom: 'cyan', 
        headerLeft: 'cyan',
        headerRight: 'cyan',
        rowSeparator: 'gray',
      },
    });

    data.forEach(row => {
      if (typeof row === 'object' && row !== null) {
        const filteredRow = columns 
          ? filterObjectByColumns(row, columns)
          : row;
        table.addRow(filteredRow);
      } else {
        table.addRow({ value: row });
      }
    });

    return table.render();
  }

  if (typeof data === 'object' && data !== null) {
    const table = new Table({
      colorMap: {
        headerTop: 'cyan',
        headerBottom: 'cyan',
        headerLeft: 'cyan', 
        headerRight: 'cyan',
      },
    });
    
    const entries = columns 
      ? columns.map(key => [key, (data as any)[key]])
      : Object.entries(data);
    
    entries.forEach(([key, value]) => {
      table.addRow({ Property: key, Value: String(value) });
    });
    
    return table.render();
  }

  return String(data);
}

/**
 * Format data as plain text with optional column selection
 */
function formatPlainOutput(data: unknown, columns?: string[]): string {
  if (Array.isArray(data)) {
    return data.map(item => formatPlainItem(item, columns)).join('\n\n');
  }
  
  return formatPlainItem(data, columns);
}

/**
 * Format a single item for plain text output
 */
function formatPlainItem(item: unknown, columns?: string[]): string {
  if (typeof item === 'object' && item !== null) {
    const entries = columns 
      ? columns.map(key => [key, (item as any)[key]]).filter(([, value]) => value !== undefined)
      : Object.entries(item);
    
    return entries
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n');
  }
  
  return String(item);
}

/**
 * Filter object properties by specified columns
 */
function filterObjectByColumns(obj: Record<string, unknown>, columns: string[]): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  columns.forEach(col => {
    if (col in obj) {
      filtered[col] = obj[col];
    }
  });
  return filtered;
}

/**
 * Handle CLI errors with appropriate formatting and logging
 */
export function handleCliError(error: unknown, logger?: ReturnType<typeof createLogger>): never {
  const log = logger || createLogger(false);
  
  if (error instanceof ConfigError) {
    log.error(chalk.red(`Configuration Error: ${error.message}`));
    process.exit(1);
  }
  
  if (error instanceof AuthError) {
    log.error(chalk.red(`Authentication Error: ${error.message}`));
    log.error(chalk.yellow('Please check your API token and server URL'));
    process.exit(1);
  }
  
  if (error instanceof ValidationError) {
    log.error(chalk.red(`Validation Error: ${error.message}`));
    // Add type guard for details property
    const errorObj = error as unknown as Record<string, unknown>;
    if (hasProperty(errorObj, 'details') && (error as any).details) {
      log.debug(chalk.gray(`Details: ${JSON.stringify((error as any).details, null, 2)}`));
    }
    process.exit(1);
  }
  
  if (error instanceof ApiError) {
    log.error(chalk.red(`API Error: ${error.message}`));
    // Add type guards for optional properties
    const errorObj = error as unknown as Record<string, unknown>;
    if (hasProperty(errorObj, 'status') && (error as any).status) {
      log.debug(chalk.gray(`Status Code: ${(error as any).status}`));
    }
    if (hasProperty(errorObj, 'response') && (error as any).response) {
      log.debug(chalk.gray(`Response: ${JSON.stringify((error as any).response, null, 2)}`));
    }
    process.exit(1);
  }
  
  if (error instanceof TriliumError) {
    log.error(chalk.red(`Trilium Error: ${error.message}`));
    if (error.cause) {
      log.debug(chalk.gray(`Cause: ${error.cause instanceof Error ? error.cause.message : error.cause}`));
    }
    process.exit(1);
  }
  
  // Generic error handling
  if (error instanceof Error) {
    log.error(chalk.red(`Error: ${error.message}`));
    log.debug(chalk.gray(`Stack: ${error.stack}`));
  } else {
    log.error(chalk.red(`Unknown error: ${String(error)}`));
  }
  
  process.exit(1);
}

/**
 * Create a CLI configuration instance
 */
export async function createCliConfig(configPath?: string): Promise<Config> {
  const config = new Config(configPath);
  await config.load();
  return config;
}

/**
 * Validate required options are present with proper type safety
 */
export function validateRequiredOptions(options: Record<string, unknown>, required: string[]): void {
  const missing = required.filter(key => {
    const value = options[key];
    // Check for null, undefined, empty string, or empty arrays
    return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
  });
  
  if (missing.length > 0) {
    throw new ValidationError(`Missing required options: ${missing.join(', ')}`);
  }
}

/**
 * Validate command options with type-specific validation
 */
export function validateCommandOptions<T extends BaseCommandOptions>(
  options: T,
  validationRules: CommandValidationRules
): T {
  // Validate required fields
  if (validationRules.required) {
    validateRequiredOptions(options as Record<string, unknown>, validationRules.required);
  }
  
  // Validate string options
  if (validationRules.strings) {
    for (const [key, rules] of Object.entries(validationRules.strings)) {
      const value = options[key as keyof T];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'string') {
          throw new ValidationError(`Option '${key}' must be a string`);
        }
        
        // Check minimum length
        if (rules.minLength && value.length < rules.minLength) {
          throw new ValidationError(`Option '${key}' must be at least ${rules.minLength} characters long`);
        }
        
        // Check maximum length
        if (rules.maxLength && value.length > rules.maxLength) {
          throw new ValidationError(`Option '${key}' must be no more than ${rules.maxLength} characters long`);
        }
        
        // Check pattern
        if (rules.pattern && !rules.pattern.test(value)) {
          throw new ValidationError(`Option '${key}' does not match required format`);
        }
        
        // Check allowed values
        if (rules.allowedValues && !rules.allowedValues.includes(value)) {
          throw new ValidationError(`Option '${key}' must be one of: ${rules.allowedValues.join(', ')}`);
        }
      }
    }
  }
  
  // Validate number options
  if (validationRules.numbers) {
    for (const [key, rules] of Object.entries(validationRules.numbers)) {
      const value = options[key as keyof T];
      if (value !== undefined && value !== null) {
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        if (typeof numValue !== 'number' || isNaN(numValue)) {
          throw new ValidationError(`Option '${key}' must be a number`);
        }
        
        // Check minimum value
        if (rules.min !== undefined && numValue < rules.min) {
          throw new ValidationError(`Option '${key}' must be at least ${rules.min}`);
        }
        
        // Check maximum value
        if (rules.max !== undefined && numValue > rules.max) {
          throw new ValidationError(`Option '${key}' must be no more than ${rules.max}`);
        }
        
        // Check integer requirement
        if (rules.integer && !Number.isInteger(numValue)) {
          throw new ValidationError(`Option '${key}' must be an integer`);
        }
      }
    }
  }
  
  // Validate boolean options
  if (validationRules.booleans) {
    for (const key of validationRules.booleans) {
      const value = options[key as keyof T];
      if (value !== undefined && value !== null && typeof value !== 'boolean') {
        throw new ValidationError(`Option '${key}' must be a boolean`);
      }
    }
  }
  
  // Validate array options
  if (validationRules.arrays) {
    for (const [key, rules] of Object.entries(validationRules.arrays)) {
      const value = options[key as keyof T];
      if (value !== undefined && value !== null) {
        if (!Array.isArray(value)) {
          throw new ValidationError(`Option '${key}' must be an array`);
        }
        
        // Check minimum length
        if (rules.minLength !== undefined && value.length < rules.minLength) {
          throw new ValidationError(`Option '${key}' must have at least ${rules.minLength} items`);
        }
        
        // Check maximum length
        if (rules.maxLength !== undefined && value.length > rules.maxLength) {
          throw new ValidationError(`Option '${key}' must have no more than ${rules.maxLength} items`);
        }
        
        // Check item types
        if (rules.itemType) {
          for (let i = 0; i < value.length; i++) {
            const item = value[i];
            if (typeof item !== rules.itemType) {
              throw new ValidationError(`Option '${key}[${i}]' must be of type ${rules.itemType}`);
            }
          }
        }
      }
    }
  }
  
  return options;
}

/**
 * Validation rules for command options
 */
export interface CommandValidationRules {
  required?: string[];
  strings?: Record<string, {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    allowedValues?: string[];
  }>;
  numbers?: Record<string, {
    min?: number;
    max?: number;
    integer?: boolean;
  }>;
  booleans?: string[];
  arrays?: Record<string, {
    minLength?: number;
    maxLength?: number;
    itemType?: 'string' | 'number' | 'boolean';
  }>;
}

/**
 * Format success message with consistent styling
 */
export function formatSuccessMessage(message: string): string {
  return chalk.green(`✓ ${message}`);
}

/**
 * Format warning message with consistent styling
 */
export function formatWarningMessage(message: string): string {
  return chalk.yellow(`⚠ ${message}`);
}

/**
 * Format info message with consistent styling  
 */
export function formatInfoMessage(message: string): string {
  return chalk.blue(`ℹ ${message}`);
}

/**
 * Check if running in interactive terminal
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY;
}

/**
 * Get terminal width for formatting
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Create enhanced error context for common CLI operations
 */
export function createOperationContext(operation: string, resource?: string): ErrorContext {
  const context = new ErrorContext()
    .withOperationContext(resource ? `${operation} ${resource}` : operation);
  
  // Add common suggestions based on operation type
  switch (operation.toLowerCase()) {
    case 'connect':
    case 'connecting':
      context
        .withSuggestion('Check your internet connection')
        .withSuggestion('Verify server URL is correct')
        .withSuggestion('Ensure Trilium server is running')
        .withHelpTopic('connection');
      break;
      
    case 'authenticate':
    case 'authentication':
      context
        .withSuggestion('Check your API token')
        .withSuggestion('Generate a new ETAPI token in Trilium')
        .withSuggestion('Verify token permissions')
        .withHelpTopic('authentication');
      break;
      
    case 'create':
    case 'creating':
      context
        .withSuggestion('Check required parameters')
        .withSuggestion('Verify parent location exists')
        .withSuggestion('Ensure you have create permissions')
        .withHelpTopic('creation');
      break;
      
    case 'update':
    case 'updating':
      context
        .withSuggestion('Verify the item exists')
        .withSuggestion('Check update permissions')
        .withSuggestion('Ensure data format is correct')
        .withHelpTopic('modification');
      break;
      
    case 'delete':
    case 'deleting':
      context
        .withSuggestion('Verify the item exists')
        .withSuggestion('Check delete permissions')
        .withSuggestion('Use --force flag if needed')
        .withHelpTopic('deletion');
      break;
      
    case 'search':
    case 'searching':
      context
        .withSuggestion('Check search syntax')
        .withSuggestion('Try different search terms')
        .withSuggestion('Use --help for search options')
        .withHelpTopic('search');
      break;
      
    case 'export':
    case 'exporting':
      context
        .withSuggestion('Check output path permissions')
        .withSuggestion('Verify export format is supported')
        .withSuggestion('Ensure sufficient disk space')
        .withHelpTopic('export');
      break;
      
    case 'import':
    case 'importing':
      context
        .withSuggestion('Check file format is supported')
        .withSuggestion('Verify file permissions')
        .withSuggestion('Ensure import target exists')
        .withHelpTopic('import');
      break;
  }
  
  return context;
}

/**
 * Wrap async operations with enhanced error context
 */
export async function withErrorContext<T>(
  operation: string,
  fn: () => Promise<T>,
  resource?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const context = createOperationContext(operation, resource);
    
    if (error instanceof TriliumError) {
      throw error.withContext(context);
    }
    
    const triliumError = TriliumError.fromUnknown(error, `${operation} failed`);
    throw triliumError.withContext(context);
  }
}

/**
 * Wrap sync operations with enhanced error context
 */
export function withSyncErrorContext<T>(
  operation: string,
  fn: () => T,
  resource?: string
): T {
  try {
    return fn();
  } catch (error) {
    const context = createOperationContext(operation, resource);
    
    if (error instanceof TriliumError) {
      throw error.withContext(context);
    }
    
    const triliumError = TriliumError.fromUnknown(error, `${operation} failed`);
    throw triliumError.withContext(context);
  }
}