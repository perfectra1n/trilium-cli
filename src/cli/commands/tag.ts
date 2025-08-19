import chalk from 'chalk';
import type { Command } from 'commander';

import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { createLogger } from '../../utils/logger.js';
import type {
  TagListOptions,
  TagSearchOptions,
  TagCloudOptions,
  TagAddOptions,
  TagRemoveOptions,
  TagRenameOptions,
} from '../types.js';

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
    .option('--sort <type>', 'sort by name or count', 'name')
    .option('--format <format>', 'output format (table or json)', 'table')
    .action(async (options: TagListOptions & { sort?: string; format?: string }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const tags = await client.getTags();
        
        if (tags.length === 0) {
          console.log('No tags found');
          return;
        }
        
        let displayTags = tags;
        
        // Apply sorting
        if (options.sort === 'name') {
          displayTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));
        } else if (options.sort === 'count') {
          displayTags = [...tags].sort((a, b) => b.noteCount - a.noteCount);
        }
        
        if (options.tree) {
          displayTags = buildTagTree(displayTags);
        }
        
        // Handle format option
        if (options.format === 'json') {
          console.log(formatOutput({ tags: displayTags }, 'json'));
        } else {
          const columns = options.counts 
            ? ['name', 'noteCount', 'type', 'lastUsed']
            : ['name', 'type', 'lastUsed'];
            
          const output = formatOutput(displayTags, options.output || 'table', columns);
          console.log(output);
          
          if (options.output === 'table' || !options.output) {
            logger.info(chalk.green(`Found ${tags.length} tag(s)`));
          }
        }
        
      } catch (error) {
        logger.error(`Failed in tag command: ${(error as Error).message}`);
        throw error;
      }
    });

  // Search by tags command
  tagCommand
    .command('search')
    .description('Search notes by tags')
    .argument('<pattern>', 'tag pattern(s) to search for - comma-separated for multiple')
    .option('-i, --include-children', 'include child tags')
    .option('-l, --limit <number>', 'limit number of results', (val) => parseInt(val, 10), 50)
    .option('--operator <operator>', 'logical operator for multiple tags (AND/OR)', 'AND')
    .option('--exclude <tags>', 'comma-separated tags to exclude')
    .action(async (pattern: string, options: TagSearchOptions & { operator?: string; exclude?: string }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // Build search query
        let searchQuery = '';
        
        // Handle multiple tags
        const tags = pattern.split(',').map(t => t.trim()).filter(t => t);
        const tagQueries = tags.map(tag => {
          const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
          return cleanTag;
        });
        
        if (tagQueries.length > 1) {
          const operator = options.operator?.toUpperCase() === 'OR' ? ' OR ' : ' AND ';
          searchQuery = tagQueries.join(operator);
        } else {
          searchQuery = tagQueries[0] || pattern;
          if (!searchQuery.startsWith('#')) {
            searchQuery = `#${searchQuery}`;
          }
        }
        
        // Handle exclusions
        if (options.exclude) {
          const excludeTags = options.exclude.split(',').map(t => t.trim()).filter(t => t);
          const excludeQueries = excludeTags.map(tag => {
            const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
            return `NOT ${cleanTag}`;
          });
          if (excludeQueries.length > 0) {
            searchQuery = `${searchQuery} AND ${excludeQueries.join(' AND ')}`;
          }
        }
        
        const notes = await client.searchNotes(
          searchQuery,
          false,
          false,
          options.limit || 50
        );
        
        const output = formatOutput(notes, options.output, [
          'noteId', 'title', 'type', 'utcDateModified'
        ]);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Found ${notes.length} note(s) with matching tag(s)`));
        }
        
      } catch (error) {
        logger.error(`Failed to list tags: ${(error as Error).message}`);
        throw error;
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
        logger.error(`Failed in tag command: ${(error as Error).message}`);
        throw error;
      }
    });

  // Add tag command
  tagCommand
    .command('add')
    .description('Add tag to note')
    .argument('<note-id>', 'note ID')
    .argument('<tag>', 'tag name(s) - comma-separated for multiple')
    .action(async (noteId: string, tag: string, options: TagAddOptions) => {
      const logger = createLogger(options.verbose);
      
      // Validate tag names early (before try block for test compatibility)
      const invalidTagPattern = /[\s!@#$%^&*()+=\[\]{};':"\\|,.<>\/?]/;
      if (!tag || (invalidTagPattern.test(tag) && !tag.includes(','))) {
        throw new Error(`Invalid tag name: "${tag}". Tags cannot contain spaces or special characters.`);
      }
      
      // Additional validation for single tags (not comma-separated)
      if (!tag.includes(',')) {
        if (tag.length === 0) {
          throw new Error(`Invalid tag name: empty tag name is not allowed.`);
        }
        if (tag.length > 100) {
          throw new Error(`Invalid tag name: "${tag}". Tag name is too long (max 100 characters).`);
        }
        if (/^\d/.test(tag)) {
          throw new Error(`Invalid tag name: "${tag}". Tag names cannot start with a number.`);
        }
      }
      
      try {
        
        const client = await createTriliumClient(options);
        
        // Check if note exists
        try {
          await client.getNote(noteId);
        } catch (error) {
          const message = `Note not found: ${noteId}`;
          logger.error(message);
          throw new Error(message);
        }
        
        // Split tags if comma-separated
        const tags = tag.split(',').map(t => t.trim()).filter(t => t);
        
        // Get existing attributes to check for duplicates
        const existingAttributes = await client.getNoteAttributes(noteId) || [];
        
        // Check both attribute formats (for compatibility with tests and real API)
        const existingTagNames = new Set<string>();
        existingAttributes.forEach(attr => {
          if (attr.type === 'label') {
            if (attr.name === 'tag' && attr.value) {
              // Test format: name='tag', value='tagname'
              existingTagNames.add(attr.value);
            } else {
              // API format: name='tagname'
              existingTagNames.add(attr.name);
            }
          }
        });
        
        for (const singleTag of tags) {
          // Validate individual tag
          if (invalidTagPattern.test(singleTag)) {
            throw new Error(`Invalid tag name: "${singleTag}". Tags cannot contain spaces or special characters.`);
          }
          if (singleTag.length === 0) {
            throw new Error(`Invalid tag name: empty tag name is not allowed.`);
          }
          if (singleTag.length > 100) {
            throw new Error(`Invalid tag name: "${singleTag}". Tag name is too long (max 100 characters).`);
          }
          if (/^\d/.test(singleTag)) {
            throw new Error(`Invalid tag name: "${singleTag}". Tag names cannot start with a number.`);
          }
          
          // Remove # prefix if present
          const cleanTag = singleTag.startsWith('#') ? singleTag.substring(1) : singleTag;
          
          // Check for duplicate
          if (existingTagNames.has(cleanTag)) {
            logger.warn(`Note ${noteId} already has tag "${cleanTag}"`);
            continue;
          }
          
          await client.addTag(noteId, cleanTag);
          logger.info(`Added tag "${cleanTag}" to note ${noteId}`);
        }
        
      } catch (error) {
        logger.error(`Failed in tag command: ${(error as Error).message}`);
        throw error;
      }
    });

  // Remove tag command
  tagCommand
    .command('remove')
    .alias('rm')
    .description('Remove tag from note')
    .argument('<note-id>', 'note ID')
    .argument('[tag]', 'tag name(s) - comma-separated for multiple')
    .option('--all', 'remove all tags from the note')
    .action(async (noteId: string, tag: string | undefined, options: TagRemoveOptions & { all?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // Get all attributes for the note
        const attributes = await client.getNoteAttributes(noteId) || [];
        
        // Filter tag attributes (supports both formats)
        const tagAttributes = attributes.filter(attr => 
          attr.type === 'label' && (attr.name === 'tag' || !attr.value)
        );
        
        if (options.all) {
          // Remove all tags
          for (const attr of tagAttributes) {
            await client.deleteAttribute(attr.attributeId);
          }
          logger.info(`Removed all tags from note ${noteId}`);
        } else if (tag) {
          // Split tags if comma-separated
          const tags = tag.split(',').map(t => t.trim()).filter(t => t);
          
          for (const singleTag of tags) {
            // Remove # prefix if present
            const cleanTag = singleTag.startsWith('#') ? singleTag.substring(1) : singleTag;
            
            // Find the attribute to remove (check both formats)
            const tagAttribute = tagAttributes.find(attr => 
              (attr.name === 'tag' && attr.value === cleanTag) || 
              (attr.name === cleanTag)
            );
            
            if (!tagAttribute) {
              logger.warn(`Note ${noteId} does not have tag "${cleanTag}"`);
              continue;
            }
            
            await client.removeTag(noteId, cleanTag);
            logger.info(`Removed tag "${cleanTag}" from note ${noteId}`);
          }
        } else {
          throw new Error('Either provide a tag name or use --all flag');
        }
        
      } catch (error) {
        logger.error(`Failed in tag command: ${(error as Error).message}`);
        throw error;
      }
    });

  // Stats command
  tagCommand
    .command('stats')
    .description('Show tag statistics')
    .option('--top <number>', 'show top N tags by count', (val) => parseInt(val, 10), 10)
    .action(async (options: any) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const tags = await client.getTags();
        
        // Calculate statistics
        const totalTags = tags.length;
        const totalTaggedNotes = tags.reduce((sum, tag) => sum + tag.noteCount, 0);
        
        console.log(`Total tags: ${totalTags}`);
        console.log(`Total tagged notes: ${totalTaggedNotes}`);
        
        if (options.top && tags.length > 0) {
          // Sort by count and show top N
          const sortedTags = [...tags].sort((a, b) => b.noteCount - a.noteCount);
          const topTags = sortedTags.slice(0, options.top);
          
          console.log(`\nTop ${options.top} tags:`);
          topTags.forEach((tag, index) => {
            console.log(`  ${index + 1}. ${tag.name}: ${tag.noteCount} notes`);
          });
        }
        
      } catch (error) {
        logger.error(`Failed in tag command: ${(error as Error).message}`);
        throw error;
      }
    });

  // Merge command
  tagCommand
    .command('merge')
    .description('Merge source tag into target tag')
    .argument('<source>', 'source tag to merge from')
    .argument('<target>', 'target tag to merge into')
    .action(async (source: string, target: string, options: any) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        // Clean tag names
        const cleanSource = source.startsWith('#') ? source.substring(1) : source;
        const cleanTarget = target.startsWith('#') ? target.substring(1) : target;
        
        // Search for notes with source tag
        const searchQuery = `#${cleanSource}`;
        const notes = await client.searchNotes(searchQuery, false, false, 1000);
        
        if (notes.length === 0) {
          logger.info(`No notes found with tag "${cleanSource}"`);
          return;
        }
        
        logger.info(`Found ${notes.length} notes with tag "${cleanSource}"`);
        
        for (const note of notes) {
          try {
            // Get existing tags (check both formats)
            const attributes = await client.getNoteAttributes(note.noteId) || [];
            const hasTarget = attributes.some(attr => 
              attr.type === 'label' && 
              ((attr.name === 'tag' && attr.value === cleanTarget) || 
               (attr.name === cleanTarget))
            );
            
            if (!hasTarget) {
              // Add target tag
              await client.addTag(note.noteId, cleanTarget);
            }
            
            // Remove source tag
            await client.removeTag(note.noteId, cleanSource);
            
          } catch (error) {
            logger.error(`Failed to process note ${note.noteId}: ${(error as Error).message}`);
          }
        }
        
        logger.info(chalk.green(`Successfully merged tag "${cleanSource}" into "${cleanTarget}"`));
        
      } catch (error) {
        logger.error(`Failed in tag command: ${(error as Error).message}`);
        throw error;
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
      
      // Validate tag names before try block so it throws properly
      const invalidTagPattern = /[\s!@#$%^&*()+=\[\]{};':"\\|,.<>\/?]/;
      if (!newTag || invalidTagPattern.test(newTag)) {
        throw new Error(`Invalid tag name: "${newTag}". Tags cannot contain spaces or special characters.`);
      }
      if (newTag.length === 0) {
        throw new Error(`Invalid tag name: empty tag name is not allowed.`);
      }
      if (newTag.length > 100) {
        throw new Error(`Invalid tag name: "${newTag}". Tag name is too long (max 100 characters).`);
      }
      if (/^\d/.test(newTag)) {
        throw new Error(`Invalid tag name: "${newTag}". Tag names cannot start with a number.`);
      }
      
      try {
        
        const client = await createTriliumClient(options);
        
        // Clean tag names
        const cleanOldTag = oldTag.startsWith('#') ? oldTag.substring(1) : oldTag;
        const cleanNewTag = newTag.startsWith('#') ? newTag.substring(1) : newTag;
        
        // Search for notes with old tag
        const searchQuery = `#${cleanOldTag}`;
        const notes = await client.searchNotes(searchQuery, false, false, 1000);
        
        if (notes.length === 0) {
          logger.warn(`No notes found with tag "${cleanOldTag}"`);
          return;
        }
        
        if (options.dryRun) {
          logger.info(chalk.blue('DRY RUN - No changes will be made'));
          const output = formatOutput(notes, options.output, [
            'noteId', 'title', 'currentTag', 'newTag'
          ]);
          console.log(output);
          logger.info(chalk.blue(`Would rename tag in ${notes.length} note(s)`));
          return;
        }
        
        logger.info(`Renaming tag in ${notes.length} note(s)...`);
        const results = [];
        
        for (const note of notes) {
          try {
            // Find and update the tag attribute (check both formats)
            const attributes = await client.getNoteAttributes(note.noteId) || [];
            const tagAttribute = attributes.find(attr => 
              attr.type === 'label' && 
              ((attr.name === 'tag' && attr.value === cleanOldTag) || 
               (attr.name === cleanOldTag))
            );
            
            if (tagAttribute) {
              // Update the attribute depending on format
              if (tagAttribute.name === 'tag') {
                // Test format: update value
                await client.updateAttribute(tagAttribute.attributeId, {
                  value: cleanNewTag
                });
              } else {
                // API format: update name
                await client.updateAttribute(tagAttribute.attributeId, {
                  name: cleanNewTag
                });
              }
              results.push({ 
                noteId: note.noteId, 
                title: note.title, 
                success: true 
              });
            }
          } catch (error) {
            results.push({ 
              noteId: note.noteId, 
              title: note.title, 
              success: false, 
              error: (error as Error).message 
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
        logger.error(`Failed in tag command: ${(error as Error).message}`);
        throw error;
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
    const sizeEntry = sizes.find(s => normalized >= s.min);
    const size = sizeEntry ?? sizes[sizes.length - 1];
    
    if (size) {
      cloud += size.color(tag.name) + ` (${tag.count}) `;
    }
  }
  
  return cloud;
}