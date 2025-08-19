/**
 * Utilities for handling interactive prompts in CLI
 */

import type { QuestionCollection, Answers } from 'inquirer';

/**
 * Check if the current environment supports interactive prompts
 */
export function isInteractive(): boolean {
  // Check if we have TTY
  const hasTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  
  // Check if we're in CI/non-interactive environment
  const isCI = process.env.CI === 'true' || process.env.CI === '1';
  const isNonInteractive = process.env.NONINTERACTIVE === 'true' || process.env.NONINTERACTIVE === '1';
  
  return hasTTY && !isCI && !isNonInteractive;
}

/**
 * Create a safe inquirer prompt that handles tsx and other environments
 */
export async function safePrompt<T extends Answers = Answers>(
  questions: QuestionCollection<T>,
  initialAnswers?: Partial<T>
): Promise<T> {
  // Dynamically import inquirer
  const inquirerModule = await import('inquirer');
  const inquirer = inquirerModule.default;
  
  // Setup cleanup handlers
  const cleanupHandlers: Array<() => void> = [];
  
  const cleanup = () => {
    cleanupHandlers.forEach(handler => {
      try {
        handler();
      } catch (e) {
        // Ignore cleanup errors
      }
    });
  };
  
  // Register global cleanup
  const exitHandler = () => cleanup();
  const signalHandler = (signal: string) => () => {
    cleanup();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };
  
  process.once('exit', exitHandler);
  process.once('SIGINT', signalHandler('SIGINT'));
  process.once('SIGTERM', signalHandler('SIGTERM'));
  
  try {
    // Create a new prompt UI instance
    const answers = await inquirer.prompt<T>(questions, initialAnswers);
    
    // Cleanup after successful prompt
    cleanup();
    
    // Remove handlers
    process.removeListener('exit', exitHandler);
    process.removeListener('SIGINT', signalHandler('SIGINT'));
    process.removeListener('SIGTERM', signalHandler('SIGTERM'));
    
    return answers;
  } catch (error) {
    // Cleanup on error
    cleanup();
    
    // Remove handlers
    process.removeListener('exit', exitHandler);
    process.removeListener('SIGINT', signalHandler('SIGINT'));
    process.removeListener('SIGTERM', signalHandler('SIGTERM'));
    
    // Re-throw the error
    throw error;
  }
}

/**
 * Force stdin to be in raw mode for inquirer (fixes tsx issues)
 */
export function ensureRawMode(): void {
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    // Store original raw mode state
    const originalRawMode = process.stdin.isRaw;
    
    // Ensure stdin is properly configured
    process.stdin.resume();
    
    // Restore on exit
    process.on('exit', () => {
      if (process.stdin.isTTY && process.stdin.setRawMode) {
        process.stdin.setRawMode(originalRawMode || false);
      }
    });
  }
}