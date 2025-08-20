import chalk from 'chalk';
import type { Command } from 'commander';
import { Config } from '../../config/index.js';
import { createLogger } from '../../utils/logger.js';
import { handleCliError } from '../../utils/cli.js';
import type { BaseCommandOptions } from '../types.js';

/**
 * Set up editor configuration commands
 */
export function setupEditorCommands(program: Command): void {
  const editorCommand = program
    .command('editor')
    .description('Configure external editor settings');

  // Show current editor configuration
  editorCommand
    .command('show')
    .description('Show current editor configuration')
    .action(async (options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config();
        const editorConfig = config.getEditorConfig();
        
        console.log(chalk.bold('Current Editor Configuration:'));
        console.log(`  Command: ${chalk.cyan(editorConfig.command)}`);
        if (editorConfig.args && editorConfig.args.length > 0) {
          console.log(`  Arguments: ${chalk.cyan(editorConfig.args.join(' '))}`);
        }
        console.log(`  Convert HTML to Markdown: ${chalk.cyan(editorConfig.convertHtmlToMarkdown ? 'Yes' : 'No')}`);
        console.log(`  Auto-save: ${chalk.cyan(editorConfig.autoSave ? 'Yes' : 'No')}`);
        console.log(`  Backup before edit: ${chalk.cyan(editorConfig.backupBeforeEdit ? 'Yes' : 'No')}`);
        
        // Show environment variables
        console.log('\n' + chalk.bold('Environment Variables:'));
        console.log(`  EDITOR: ${process.env.EDITOR ? chalk.green(process.env.EDITOR) : chalk.gray('not set')}`);
        console.log(`  VISUAL: ${process.env.VISUAL ? chalk.green(process.env.VISUAL) : chalk.gray('not set')}`);
        console.log(`  TRILIUM_EDITOR: ${process.env.TRILIUM_EDITOR ? chalk.green(process.env.TRILIUM_EDITOR) : chalk.gray('not set')}`);
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Set editor command
  editorCommand
    .command('set')
    .description('Set editor command')
    .argument('<command>', 'editor command (e.g., vim, code, emacs)')
    .option('--args <args>', 'additional arguments for the editor')
    .action(async (command: string, options: BaseCommandOptions & { args?: string }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config();
        
        const editorConfig = {
          command,
          args: options.args ? options.args.split(' ') : []
        };
        
        config.setEditorConfig(editorConfig);
        await config.save();
        
        logger.info(chalk.green(`Editor set to: ${command}`));
        if (editorConfig.args.length > 0) {
          logger.info(chalk.green(`With arguments: ${editorConfig.args.join(' ')}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Configure HTML/Markdown conversion
  editorCommand
    .command('convert')
    .description('Configure HTML to Markdown conversion')
    .argument('<enabled>', 'enable or disable conversion (true/false)')
    .action(async (enabled: string, options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const config = new Config();
        const convertEnabled = enabled.toLowerCase() === 'true' || enabled === '1' || enabled.toLowerCase() === 'yes';
        
        config.setEditorConfig({
          convertHtmlToMarkdown: convertEnabled
        });
        await config.save();
        
        logger.info(chalk.green(`HTML to Markdown conversion ${convertEnabled ? 'enabled' : 'disabled'}`));
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Test editor
  editorCommand
    .command('test')
    .description('Test the external editor configuration')
    .action(async (options: BaseCommandOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const { openEditor } = await import('../../utils/editor.js');
        
        const testContent = `# Trilium CLI Editor Test

This is a test of the external editor configuration.

## Current Configuration
- Editor will be determined from:
  1. Profile settings (if configured)
  2. Global editor config
  3. Environment variables (TRILIUM_EDITOR, VISUAL, EDITOR)
  4. System defaults

## Instructions
1. Make some changes to this file
2. Save and exit your editor
3. The CLI will show you what changed

## Markdown Support
- **Bold text**
- *Italic text*
- [Links](https://example.com)
- \`inline code\`

\`\`\`javascript
// Code blocks are supported
console.log('Hello from Trilium CLI!');
\`\`\`

---
End of test content.`;

        console.log(chalk.cyan('\nTesting external editor configuration...\n'));
        
        const result = await openEditor(testContent, {
          format: 'md'
        });
        
        if (result.cancelled) {
          console.log(chalk.yellow('\nEditor test cancelled'));
        } else if (result.changed) {
          console.log(chalk.green('\nEditor test successful! Changes detected:'));
          console.log(chalk.gray('---'));
          console.log(result.content);
          console.log(chalk.gray('---'));
        } else {
          console.log(chalk.yellow('\nEditor test completed - no changes made'));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}