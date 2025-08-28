#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { Config } from '../config/index.js';
import { App } from './App.js';
import { ConfigError, TriliumError } from '../error.js';
import chalk from 'chalk';

/**
 * Launch the Trilium TUI application
 */
export async function launchTUI(configPath?: string): Promise<void> {
  try {
    // Load configuration
    const config = new Config(configPath);
    await config.load();
    
    // Check if any profiles exist
    const profiles = config.getProfiles();
    if (profiles.length === 0) {
      console.error(chalk.red('No profiles configured.'));
      console.log(chalk.yellow('Please run "trilium config init" to set up your first profile.'));
      process.exit(1);
    }
    
    // Verify current profile has required settings
    const profile = config.getCurrentProfile();
    if (!profile.serverUrl || !profile.apiToken) {
      console.error(chalk.red('Current profile is not properly configured.'));
      console.log(chalk.yellow('Please run "trilium config init" to complete the setup.'));
      process.exit(1);
    }
    
    // Render the TUI
    const { waitUntilExit } = render(<App config={config} />);
    
    // Wait for the app to exit
    await waitUntilExit();
    
    // Save any config changes
    await config.save();
    
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(chalk.red(`Configuration error: ${error.message}`));
      console.log(chalk.yellow('Run "trilium config init" to set up your configuration.'));
    } else if (error instanceof TriliumError) {
      console.error(chalk.red(`Trilium error: ${error.message}`));
    } else {
      console.error(chalk.red('Failed to start TUI:'), error);
    }
    process.exit(1);
  }
}

/**
 * Export the App component for testing
 */
export { App } from './App.js';

/**
 * Export types
 */
export * from './types.js';