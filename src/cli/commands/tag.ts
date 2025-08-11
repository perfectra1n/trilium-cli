import type { Command } from 'commander';
import chalk from 'chalk';

import type {
  TagListOptions,
  TagSearchOptions,
  TagCloudOptions,
  TagAddOptions,
  TagRemoveOptions,
  TagRenameOptions,
} from '../types.js';
import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { createLogger } from '../../utils/logger.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';

/**
 * Set up tag management commands
 */
export function setupTagCommands(program: Command): void {
  const tagCommand = program
    .command('tag')
    .description('Tag management and filtering');

  // List tags command
  tagCommand
    .command('list')
    .alias('ls')
    .description('List all tags with hierarchy')
    .option('-p, --pattern <pattern>', 'filter pattern (supports wildcards)')
    .option('-t, --tree', 'show as tree view')
    .option('-c, --counts', 'include usage counts')
    .action(async (options: TagListOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const tags = await client.getTags({
          pattern: options.pattern,
          includeCount: options.counts
        });
        
        let displayTags = tags;
        
        if (options.tree) {
          displayTags = buildTagTree(tags);
        }
        
        const columns = options.counts 
          ? ['name', 'count', 'type', 'lastUsed']
          : ['name', 'type', 'lastUsed'];
          
        const output = formatOutput(displayTags, options.output, columns);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Found ${tags.length} tag(s)`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Search by tags command
  tagCommand
    .command('search')
    .description('Search notes by tags')
    .argument('<pattern>', 'tag pattern to search for')
    .option('-i, --include-children', 'include child tags')
    .option('-l, --limit <number>', 'limit number of results', (val) => parseInt(val, 10), 50)
    .action(async (pattern: string, options: TagSearchOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const notes = await client.searchNotesByTag({
          tagPattern: pattern,
          includeChildren: options.includeChildren,
          limit: options.limit
        });
        
        const output = formatOutput(notes, options.output, [
          'noteId', 'title', 'type', 'matchingTags', 'utcDateModified'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Found ${notes.length} note(s) with matching tag(s)`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Tag cloud command
  tagCommand
    .command('cloud')
    .description('Show tag cloud/frequency visualization')
    .option('-m, --min-count <number>', 'minimum tag frequency to show', (val) => parseInt(val, 10), 1)
    .option('--max-tags <number>', 'maximum number of tags to show', (val) => parseInt(val, 10), 50)
    .action(async (options: TagCloudOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const tagCloud = await client.getTagCloud({
          minCount: options.minCount,
          maxTags: options.maxTags
        });
        
        if (options.output === 'json') {
          console.log(JSON.stringify(tagCloud, null, 2));
        } else if (options.output === 'table') {
          const output = formatOutput(tagCloud, 'table', ['name', 'count', 'frequency']);
          console.log(output);
        } else {
          // Plain text cloud visualization
          console.log(renderTagCloud(tagCloud));
        }
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Showing ${tagCloud.length} most frequent tag(s)`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Add tag command
  tagCommand
    .command('add')
    .description('Add tag to note')
    .argument('<note-id>', 'note ID')
    .argument('<tag>', 'tag name (without # prefix)')
    .action(async (noteId: string, tag: string, options: TagAddOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // Remove # prefix if present
        const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
        
        const attribute = await client.createAttribute({
          noteId,
          type: 'label',
          name: cleanTag,
          value: ''
        });
        
        const output = formatOutput([{ noteId, tag: cleanTag, added: true }], options.output, [
          'noteId', 'tag', 'added'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Tag "${cleanTag}" added to note ${noteId}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Remove tag command
  tagCommand
    .command('remove')
    .alias('rm')
    .description('Remove tag from note')
    .argument('<note-id>', 'note ID')
    .argument('<tag>', 'tag name (without # prefix)')
    .action(async (noteId: string, tag: string, options: TagRemoveOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // Remove # prefix if present
        const cleanTag = tag.startsWith('#') ? tag.substring(1) : tag;
        
        // Find the attribute to remove
        const attributes = await client.getNoteAttributes(noteId);
        const tagAttribute = attributes.find(attr => 
          attr.type === 'label' && attr.name === cleanTag
        );
        
        if (!tagAttribute) {
          throw new TriliumError(`Tag "${cleanTag}" not found on note ${noteId}`);
        }
        
        await client.deleteAttribute(tagAttribute.attributeId);
        
        const output = formatOutput([{ noteId, tag: cleanTag, removed: true }], options.output, [
          'noteId', 'tag', 'removed'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Tag "${cleanTag}" removed from note ${noteId}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Rename tag command
  tagCommand
    .command('rename')
    .description('Rename tag across all notes')
    .argument('<old-tag>', 'old tag name')
    .argument('<new-tag>', 'new tag name')
    .option('-d, --dry-run', 'show what would be changed without making changes')
    .action(async (oldTag: string, newTag: string, options: TagRenameOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // Clean tag names
        const cleanOldTag = oldTag.startsWith('#') ? oldTag.substring(1) : oldTag;
        const cleanNewTag = newTag.startsWith('#') ? newTag.substring(1) : newTag;
        
        logger.info(`Searching for tag "${cleanOldTag}"...`);
        const notesWithTag = await client.getNotesWithTag(cleanOldTag);
        
        if (notesWithTag.length === 0) {
          logger.info(chalk.yellow(`No notes found with tag "${cleanOldTag}"`));
          return;
        }
        
        if (options.dryRun) {
          logger.info(chalk.blue('DRY RUN - No changes will be made'));
          const output = formatOutput(notesWithTag, options.output, [
            'noteId', 'title', 'currentTag', 'newTag'
          ]);
          console.log(output);
          logger.info(chalk.blue(`Would rename tag in ${notesWithTag.length} note(s)`));
          return;
        }
        
        logger.info(`Renaming tag in ${notesWithTag.length} note(s)...`);
        const results = [];
        
        for (const note of notesWithTag) {
          try {
            // Find and update the tag attribute
            const attributes = await client.getNoteAttributes(note.noteId);
            const tagAttribute = attributes.find(attr => 
              attr.type === 'label' && attr.name === cleanOldTag
            );
            
            if (tagAttribute) {
              await client.updateAttribute(tagAttribute.attributeId, { 
                name: cleanNewTag 
              });
              results.push({ 
                ownerId: note.noteId, 
                title: note.title, 
                success: true 
              });
            }
          } catch (error) {
            results.push({ 
              ownerId: note.noteId, 
              title: note.title, 
              success: false, 
              error: error.message 
            });
          }
        }
        
        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;
        
        const output = formatOutput(results, options.output, [
          'noteId', 'title', 'success', 'error'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Successfully renamed tag in ${successful} note(s)`));
          if (failed > 0) {
            logger.warn(chalk.yellow(`Failed to rename tag in ${failed} note(s)`));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Build hierarchical tag tree
 */
function buildTagTree(tags: any[]): any[] {
  // Simple tree building - could be enhanced with proper hierarchy
  const tree = [];
  const processed = new Set();
  
  for (const tag of tags) {
    if (!processed.has(tag.name)) {
      const children = tags.filter(t => 
        t.name.startsWith(tag.name + '/') && 
        !processed.has(t.name)
      );
      
      tree.push({
        ...tag,
        children: children.length > 0 ? children : undefined
      });
      
      processed.add(tag.name);
      children.forEach(child => processed.add(child.name));
    }
  }
  
  return tree;
}

/**
 * Render tag cloud in text format
 */
function renderTagCloud(tags: any[]): string {
  const maxCount = Math.max(...tags.map(t => t.count));
  const minCount = Math.min(...tags.map(t => t.count));
  const range = maxCount - minCount;
  
  const sizes = [
    { min: 0.8, color: chalk.gray },
    { min: 0.6, color: chalk.white },
    { min: 0.4, color: chalk.blue },
    { min: 0.2, color: chalk.cyan },
    { min: 0, color: chalk.green }
  ];
  
  let cloud = '';
  
  for (const tag of tags) {
    const normalized = range > 0 ? (tag.count - minCount) / range : 0;
    const size = sizes.find(s => normalized >= s.min) || sizes[sizes.length - 1];
    
    cloud += size.color(tag.name) + ` (${tag.count}) `;
  }
  
  return cloud;
}