import { createReadStream, existsSync } from 'fs';

import chalk from 'chalk';
import type { Command } from 'commander';

import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import type {
  TemplateListOptions,
  TemplateCreateOptions,
  TemplateShowOptions,
  TemplateUseOptions,
  TemplateUpdateOptions,
  TemplateDeleteOptions,
  TemplateValidateOptions,
} from '../types.js';

/**
 * Set up template management commands
 */
export function setupTemplateCommands(program: Command): void {
  const templateCommand = program
    .command('template')
    .description('Template management');

  // List templates command
  templateCommand
    .command('list')
    .alias('ls')
    .description('List available templates')
    .option('-d, --detailed', 'show template details')
    .action(async (options: TemplateListOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const templates = await client.getTemplates();
        
        const columns = options.detailed 
          ? ['noteId', 'title', 'description', 'type', 'variables', 'utcDateModified']
          : ['noteId', 'title', 'description', 'utcDateModified'];
          
        const output = formatOutput(templates, options.output, columns);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Found ${templates.length} template(s)`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Create template command
  templateCommand
    .command('create')
    .description('Create a new template')
    .argument('<title>', 'template title')
    .option('-c, --content <content>', 'template content (if not provided, opens editor)')
    .option('-d, --description <description>', 'template description')
    .option('-e, --edit', 'open in editor')
    .action(async (title: string, options: TemplateCreateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        let content = options.content;
        
        // Open editor if no content provided or edit flag is set
        if (!content || options.edit) {
          const { openEditor } = await import('../../utils/editor.js');
          const editorResult = await openEditor(content || '# Template: ' + title + '\n\n{{CONTENT}}');
          content = editorResult.content;
        }
        
        // Create a template note with the template label
        const template = await client.createNote({
          parentNoteId: 'root',
          title,
          content: content as string,
          type: 'text' as any,
        } as any);
        
        const output = formatOutput([template], options.output, [
          'noteId', 'title', 'description', 'type'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Template "${title}" created successfully`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Show template command
  templateCommand
    .command('show')
    .description('Show template details')
    .argument('<template>', 'template ID or title')
    .option('-v, --variables', 'show template variables')
    .action(async (template: string, options: TemplateShowOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const templates = await client.getTemplates();
        const templateNote = templates.find(t => (t as any).noteId === template || t.title === template);
        if (!templateNote) {
          throw new Error(`Template not found: ${template}`);
        }
        
        if (options.variables) {
          const variables = extractTemplateVariables(templateNote.content || '');
          const templateWithVars = { ...templateNote, variables };
          
          const output = formatOutput([templateWithVars], options.output, [
            'noteId', 'title', 'description', 'variables', 'content'
          ]);
          console.log(output);
        } else {
          const output = formatOutput([templateNote], options.output, [
            'noteId', 'title', 'description', 'type', 'content'
          ]);
          console.log(output);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Use template command
  templateCommand
    .command('use')
    .description('Create note from template')
    .argument('<template>', 'template ID or title')
    .option('-p, --parent <id>', 'parent note ID')
    .option('-v, --variables <var>', 'template variables (key=value format)', collect, [])
    .option('-i, --interactive', 'interactive variable input')
    .option('-e, --edit', 'open created note in editor')
    .action(async (template: string, options: TemplateUseOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const templates = await client.getTemplates();
        const templateNote = templates.find(t => (t as any).noteId === template || t.title === template);
        if (!templateNote) {
          throw new Error(`Template not found: ${template}`);
        }
        
        // Extract variables from template
        const templateVars = extractTemplateVariables(templateNote.content || '');
        const variableValues: Record<string, string> = {};
        
        // Parse provided variables
        for (const varStr of options.variables || []) {
          const [key, value] = varStr.split('=', 2);
          if (key && value) {
            variableValues[key.trim()] = value.trim();
          }
        }
        
        // Interactive variable input
        if (options.interactive && templateVars.length > 0) {
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          
          for (const variable of templateVars) {
            if (!(variable in variableValues)) {
              const value = await new Promise<string>((resolve) => {
                rl.question(
                  chalk.blue(`Enter value for ${variable}: `),
                  resolve
                );
              });
              variableValues[variable] = value;
            }
          }
          
          rl.close();
        }
        
        // Apply template with variables
        const result = await client.createNoteFromTemplate(
          (templateNote as any).noteId || (templateNote as any).id || template,
          variableValues,
          options.parent || 'root'
        );
        
        // Open in editor if requested
        if (options.edit) {
          const { openEditor } = await import('../../utils/editor.js');
          const editedContent = await openEditor((result.note as any).content || '');
          await client.updateNote(result.note.noteId, { content: editedContent.content } as any);
        }
        
        const output = formatOutput([result.note], options.output, [
          'noteId', 'title', 'type', 'parentNoteId'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Note created from template: ${result.note.noteId}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Update template command
  templateCommand
    .command('update')
    .description('Update existing template')
    .argument('<template-id>', 'template ID')
    .option('-t, --title <title>', 'new title')
    .option('-d, --description <description>', 'new description')
    .option('-e, --edit', 'open in editor')
    .action(async (templateId: string, options: TemplateUpdateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        const updates: any = {};
        if (options.title) updates.title = options.title;
        if (options.description) updates.description = options.description;
        
        if (options.edit) {
          const currentTemplate = await client.getTemplates();
          const template = currentTemplate.find(t => (t as any).noteId === templateId || (t as any).id === templateId);
          const { openEditor } = await import('../../utils/editor.js');
          const editorResult = await openEditor(template?.content || '');
          updates.content = editorResult.content;
        }
        
        if (Object.keys(updates).length === 0) {
          throw new TriliumError('No updates specified. Use --title, --description, or --edit options.');
        }
        
        const template = await client.updateNote(templateId, updates);
        
        const output = formatOutput([template], options.output, [
          'noteId', 'title', 'description', 'utcDateModified'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green('Template updated successfully'));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Delete template command
  templateCommand
    .command('delete')
    .alias('rm')
    .description('Delete a template')
    .argument('<template-id>', 'template ID')
    .option('-f, --force', 'force delete without confirmation')
    .action(async (templateId: string, options: TemplateDeleteOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        if (!options.force) {
          const readline = await import('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              chalk.yellow(`Are you sure you want to delete template ${templateId}? This action cannot be undone. (y/N): `),
              resolve
            );
          });
          rl.close();

          if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
            logger.info('Delete cancelled.');
            return;
          }
        }

        const client = await createTriliumClient(options);
        await client.deleteNote(templateId);
        
        if (options.output === 'json') {
          console.log(JSON.stringify({ success: true, templateId }, null, 2));
        } else {
          logger.info(chalk.green(`Template ${templateId} deleted successfully`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Validate template command
  templateCommand
    .command('validate')
    .description('Validate template syntax')
    .argument('<template>', 'template ID or path to template file')
    .action(async (template: string, options: TemplateValidateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        let content = '';
        
        // Check if it's a file path or template ID
        if (existsSync(template)) {
          const fs = await import('fs/promises');
          content = await fs.readFile(template, 'utf8');
        } else {
          const templates = await client.getTemplates();
        const templateNote = templates.find(t => (t as any).noteId === template || t.title === template);
        if (!templateNote) {
          throw new Error(`Template not found: ${template}`);
        }
          content = templateNote.content || '';
        }
        
        const validation = validateTemplate(content);
        
        const output = formatOutput([validation], options.output, [
          'valid', 'errors', 'warnings', 'variables'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          if (validation.valid) {
            logger.info(chalk.green('Template is valid'));
          } else {
            logger.error(chalk.red('Template validation failed'));
            validation.errors.forEach(error => logger.error(`  - ${error}`));
          }
          
          if (validation.warnings.length > 0) {
            logger.warn(chalk.yellow('Warnings:'));
            validation.warnings.forEach(warning => logger.warn(`  - ${warning}`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Extract template variables from content
 */
function extractTemplateVariables(content: string): string[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;
  
  while ((match = variableRegex.exec(content)) !== null) {
    if (match[1]) {
      variables.add(match[1]);
    }
  }
  
  return Array.from(variables);
}

/**
 * Validate template syntax
 */
function validateTemplate(content: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  variables: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const variables = extractTemplateVariables(content);
  
  // Check for unmatched braces
  const openBraces = (content.match(/\{\{/g) || []).length;
  const closeBraces = (content.match(/\}\}/g) || []).length;
  
  if (openBraces !== closeBraces) {
    errors.push('Unmatched template braces');
  }
  
  // Check for invalid variable names
  const invalidVars = variables.filter(v => !/^\w+$/.test(v));
  if (invalidVars.length > 0) {
    errors.push(`Invalid variable names: ${invalidVars.join(', ')}`);
  }
  
  // Check for common issues
  if (content.includes('{{{') || content.includes('}}}')) {
    warnings.push('Triple braces found - might be unintentional');
  }
  
  if (variables.length === 0) {
    warnings.push('No template variables found');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    variables
  };
}

/**
 * Helper function to collect multiple values
 */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}