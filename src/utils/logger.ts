import chalk from 'chalk';

import type { LogLevel } from '../types/common.js';

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  isDebugEnabled(): boolean;
}

/**
 * Simple console logger implementation
 */
class ConsoleLogger implements Logger {
  constructor(
    private level: LogLevel = 'info',
    private verbose = false
  ) {}

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    return levels[level] >= levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const prefix = this.verbose ? `[${timestamp}] [${level.toUpperCase()}]` : '';
    const formattedArgs = args.length > 0 ? ` ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')}` : '';
    
    return `${prefix} ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('debug')) return;
    const formatted = this.formatMessage('debug', message, ...args);
    console.debug(chalk.gray(formatted));
  }

  info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('info')) return;
    const formatted = this.formatMessage('info', message, ...args);
    console.info(chalk.blue(formatted));
  }

  warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('warn')) return;
    const formatted = this.formatMessage('warn', message, ...args);
    console.warn(chalk.yellow(formatted));
  }

  error(message: string, ...args: unknown[]): void {
    if (!this.shouldLog('error')) return;
    const formatted = this.formatMessage('error', message, ...args);
    console.error(chalk.red(formatted));
  }

  isDebugEnabled(): boolean {
    return this.shouldLog('debug');
  }
}

/**
 * Create a logger instance
 */
export function createLogger(verbose = false, level: LogLevel = 'info'): Logger {
  return new ConsoleLogger(level, verbose);
}

/**
 * Global logger instance
 */
let globalLogger: Logger | null = null;

/**
 * Initialize the global logger
 */
export function initializeLogger(verbose = false, level: LogLevel = 'info'): void {
  globalLogger = createLogger(verbose, level);
}

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger();
  }
  return globalLogger;
}