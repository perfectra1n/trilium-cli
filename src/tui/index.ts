import React from 'react';
import { render } from 'ink';
import process from 'node:process';

import type { Config } from '../config/index.js';
import type { GlobalOptions } from '../types/cli.js';
import { App } from './components/App.js';

/**
 * Run the TUI application with proper terminal setup and cleanup
 */
export async function runTUI(config: Config, options: GlobalOptions): Promise<void> {
  // Store original terminal state
  const originalTitle = process.title;
  const originalRaw = process.stdin.isRaw;
  
  let cleanup: (() => void) | undefined;
  let waitUntilExit: Promise<void>;
  
  try {
    // Set up terminal
    process.title = 'Trilium CLI TUI';
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    
    // Set up graceful shutdown handlers
    const exitHandler = () => {
      if (cleanup) {
        cleanup();
      }
      process.exit(0);
    };
    
    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);
    
    // Start the TUI application
    const renderResult = render(
      React.createElement(App, { config, options })
    );
    
    cleanup = renderResult.clear;
    waitUntilExit = renderResult.waitUntilExit();
    
    // Wait for the application to exit
    await waitUntilExit;
    
  } catch (error) {
    // Handle any errors during startup or runtime
    console.error('TUI Error:', error);
    throw error;
  } finally {
    // Always restore terminal state
    try {
      if (cleanup) {
        cleanup();
      }
      
      // Restore terminal settings
      process.title = originalTitle;
      
      if (process.stdin.setRawMode && originalRaw !== undefined) {
        process.stdin.setRawMode(originalRaw);
      }
      
      if (process.stdin.isPaused()) {
        process.stdin.resume();
      }
      
    } catch (cleanupError) {
      // Log cleanup errors but don't throw to avoid masking original errors
      console.error('TUI Cleanup Error:', cleanupError);
    }
  }
}

// Re-export components for testing
export { App } from './components/App.js';
export * from './types/index.js';