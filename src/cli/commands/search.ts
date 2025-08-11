import type { Command } from 'commander';
import chalk from 'chalk';

import type { SearchOptions } from '../types.js';
import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { createLogger } from '../../utils/logger.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';

/**
 * Set up search commands
 */
export function setupSearchCommands(program: Command): void {
  program
    .command('search')
    .description('Search notes')
    .argument('<query>', 'search query')
    .option('-l, --limit <number>', 'limit number of results', (val) => parseInt(val, 10), 50)
    .option('-f, --fast', 'enable fast search')
    .option('-a, --archived', 'include archived notes')
    .option('-r, --regex', 'enable regex mode')
    .option('-C, --context <number>', 'show context lines around matches', (val) => parseInt(val, 10), 2)
    .option('--content', 'include note content in search')
    .option('--highlight', 'highlight search terms in output', true)
    .action(async (query: string, options: SearchOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        
        logger.info(`Searching for: "${query}"`);
        
        const searchParams = {
          query,
          limit: options.limit,
          fastSearch: options.fast,
          includeArchived: options.archived,
          regexMode: options.regex,
          contextLines: options.context,
          includeContent: options.content,
          highlight: options.highlight
        };
        
        const results = await client.search(searchParams);
        
        if (results.length === 0) {
          if (options.output === 'json') {
            console.log(JSON.stringify({ results: [], count: 0 }, null, 2));
          } else {
            logger.info(chalk.yellow('No notes found matching the search query'));
          }
          return;
        }
        
        // Format results for display
        const displayResults = results.map((result, index) => ({
          index: index + 1,
          ownerId: result.noteId,
          title: result.title,
          type: result.type,
          score: result.score?.toFixed(2),
          path: result.path,
          ...(options.content && result.content && { 
            contentLength: `${result.content.length} chars`,
            preview: result.content.substring(0, 100) + (result.content.length > 100 ? '...' : '')
          }),
          ...(result.context && { context: result.context }),
          ...(result.highlightedSnippets && { 
            snippets: result.highlightedSnippets.length,
            highlights: result.highlightedSnippets.slice(0, 2)
          })
        }));
        
        const columns = ['index', 'noteId', 'title', 'type'];
        if (results[0]?.score) columns.push('score');
        if (options.content) columns.push('contentLength', 'preview');
        if (results[0]?.context) columns.push('context');
        if (results[0]?.highlightedSnippets) columns.push('snippets');
        
        const output = formatOutput(displayResults, options.output, columns);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Found ${results.length} note(s)`));
          
          if (options.verbose) {
            logger.info(chalk.dim(`Search parameters:`));
            logger.info(chalk.dim(`  Query: "${query}"`));
            logger.info(chalk.dim(`  Fast search: ${options.fast ? 'enabled' : 'disabled'}`));
            logger.info(chalk.dim(`  Include archived: ${options.archived ? 'yes' : 'no'}`));
            logger.info(chalk.dim(`  Regex mode: ${options.regex ? 'enabled' : 'disabled'}`));
            logger.info(chalk.dim(`  Context lines: ${options.context}`));
          }
          
          // Show highlighted snippets if available and not in verbose mode
          if (!options.verbose && results.some(r => r.highlightedSnippets)) {
            console.log(chalk.blue('\nHighlighted matches:'));
            results.slice(0, 3).forEach((result, i) => {
              if (result.highlightedSnippets) {
                console.log(chalk.dim(`${i + 1}. ${result.title}:`));
                result.highlightedSnippets.slice(0, 2).forEach(snippet => {
                  console.log(`   ${snippet}`);
                });
              }
            });
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}