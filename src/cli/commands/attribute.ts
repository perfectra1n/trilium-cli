import type { Command } from 'commander';
import chalk from 'chalk';

import type {
  AttributeCreateOptions,
  AttributeListOptions,
  AttributeUpdateOptions,
  AttributeDeleteOptions,
} from '../types.js';
import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { createLogger } from '../../utils/logger.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';

/**
 * Set up attribute management commands
 */
export function setupAttributeCommands(program: Command): void {
  const attributeCommand = program
    .command('attribute')
    .alias('attr')
    .description('Attribute operations');

  // Create attribute
  attributeCommand
    .command('create')
    .description('Create a new attribute')
    .argument('<note-id>', 'note ID')
    .argument('<name>', 'attribute name')
    .option('-t, --attr-type <type>', 'attribute type (label, relation)', 'label')
    .option('-v, --value <value>', 'attribute value', '')
    .option('-i, --inheritable', 'make attribute inheritable')
    .action(async (noteId: string, name: string, options: AttributeCreateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        if (!['label', 'relation'].includes(options.attrType)) {
          throw new TriliumError('Attribute type must be either "label" or "relation"');
        }
        
        const attribute = await client.createAttribute({
          noteId,
          type: options.attrType as 'label' | 'relation',
          name,
          value: options.value || '',
          isInheritable: options.inheritable || false,
        });

        const output = formatOutput([attribute], options.output, [
          'attributeId', 'noteId', 'type', 'name', 'value', 'isInheritable'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`${options.attrType} attribute "${name}" created successfully`));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // List attributes
  attributeCommand
    .command('list')
    .alias('ls')
    .description('List attributes for a note')
    .argument('<note-id>', 'note ID')
    .action(async (noteId: string, options: AttributeListOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const attributes = await client.getNoteAttributes(noteId);

        const output = formatOutput(attributes, options.output, [
          'attributeId', 'type', 'name', 'value', 'isInheritable'
        ]);
        console.log(output);
        
        if (options.output === 'table' && attributes.length === 0) {
          logger.info(chalk.yellow('No attributes found for this note.'));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Update attribute
  attributeCommand
    .command('update')
    .description('Update attribute properties')
    .argument('<attribute-id>', 'attribute ID')
    .option('-v, --value <value>', 'new value')
    .option('-i, --inheritable <boolean>', 'inheritable state', (val) => val === 'true')
    .action(async (attributeId: string, options: AttributeUpdateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        const updates: any = {};
        if (options.value !== undefined) updates.value = options.value;
        if (options.inheritable !== undefined) updates.isInheritable = options.inheritable;

        if (Object.keys(updates).length === 0) {
          throw new TriliumError('No updates specified. Use --value or --inheritable options.');
        }

        const attribute = await client.updateAttribute(attributeId, updates);
        
        const output = formatOutput([attribute], options.output, [
          'attributeId', 'noteId', 'type', 'name', 'value', 'isInheritable'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green('Attribute updated successfully'));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Delete attribute
  attributeCommand
    .command('delete')
    .alias('rm')
    .description('Delete an attribute')
    .argument('<attribute-id>', 'attribute ID')
    .option('-f, --force', 'force delete without confirmation')
    .action(async (attributeId: string, options: AttributeDeleteOptions) => {
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
              chalk.yellow(`Are you sure you want to delete attribute ${attributeId}? This action cannot be undone. (y/N): `),
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
        await client.deleteAttribute(attributeId);
        
        if (options.output === 'json') {
          console.log(JSON.stringify({ success: true, attributeId }, null, 2));
        } else {
          logger.info(chalk.green(`Attribute ${attributeId} deleted successfully`));
        }
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}