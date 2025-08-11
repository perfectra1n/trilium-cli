import type { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, statSync, createReadStream } from 'fs';
import { resolve, extname } from 'path';

import type {
  ImportObsidianOptions,
  ExportObsidianOptions,
  ImportNotionOptions,
  ExportNotionOptions,
  ImportDirOptions,
  SyncGitOptions,
} from '../types.js';
import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { createLogger } from '../../utils/logger.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';
import { 
  ImportExportManager,
  importObsidian,
  exportObsidian,
  importNotion,
  exportNotion,
  importDirectory,
  exportDirectory,
  syncGit,
  type ObsidianConfig,
  type NotionConfig,
  type DirectoryConfig,
  type GitConfig,
  type ProgressEvent
} from '../../import-export/index.js';

/**
 * Set up import/export commands
 */
export function setupImportExportCommands(program: Command): void {
  // Obsidian Import
  program
    .command('import-obsidian')
    .description('Import from Obsidian vault')
    .argument('<vault-path>', 'path to Obsidian vault directory')
    .option('-p, --parent <id>', 'parent note ID to import into')
    .option('--dry-run', 'show what would be imported without making changes')
    .option('--preserve-wikilinks', 'preserve wikilinks instead of converting them', false)
    .option('--convert-wikilinks', 'convert wikilinks to Trilium links', true)
    .option('--include-templates', 'include template files', false)
    .action(async (vaultPath: string, options: ImportObsidianOptions & { preserveWikilinks?: boolean; convertWikilinks?: boolean; includeTemplates?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const resolvedPath = resolve(vaultPath);
        
        if (!existsSync(resolvedPath)) {
          throw new TriliumError(`Vault path not found: ${resolvedPath}`);
        }
        
        const stats = statSync(resolvedPath);
        if (!stats.isDirectory()) {
          throw new TriliumError(`Path is not a directory: ${resolvedPath}`);
        }
        
        const client = await createTriliumClient(options);
        
        // Create Obsidian config
        const config: ObsidianConfig = {
          vaultPath: resolvedPath,
          preserveWikilinks: options.preserveWikilinks ?? true,
          convertWikilinks: options.convertWikilinks ?? false,
          includeTemplates: options.includeTemplates ?? false,
          dryRun: options.dryRun ?? false,
          duplicateHandling: 'skip',
          preserveStructure: true,
          includeAttachments: true,
          validateContent: true,
          createMissingParents: true,
          patterns: [],
          excludePatterns: [],
          batchSize: 100,
          timeout: 30000,
          retries: 3,
          concurrency: 5,
          progress: true,
          templatesFolder: 'templates',
          attachmentFolder: 'attachments',
          dailyNotesFolder: 'daily',
          processFrontMatter: true,
          preserveFolderStructure: true,
          ignoreFolders: ['.obsidian', '.trash'],
          imageFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
          documentFormats: ['pdf', 'doc', 'docx', 'odt'],
          audioFormats: ['mp3', 'wav', 'ogg', 'm4a'],
          videoFormats: ['mp4', 'webm', 'ogv', 'mov'],
        };

        // Progress tracking
        const onProgress = (event: ProgressEvent) => {
          if (event.type === 'start') {
            logger.info(event.message);
          } else if (event.type === 'progress') {
            const percent = event.total ? Math.round((event.current! / event.total) * 100) : 0;
            logger.info(`${event.message} (${percent}%)`);
          } else if (event.type === 'complete') {
            logger.info(chalk.green(event.message));
          } else if (event.type === 'error') {
            logger.error(chalk.red(event.message));
          }
        };
        
        logger.info(`Starting Obsidian import: ${resolvedPath}`);
        const result = await importObsidian(client, config, onProgress);
        
        // Display results
        if (options.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const successful = result.summary.successfulFiles;
          const failed = result.summary.failedFiles;
          const total = result.summary.totalFiles;
          
          logger.info(chalk.green(`Successfully imported ${successful}/${total} file(s)`));
          
          if (failed > 0) {
            logger.warn(chalk.yellow(`Failed to import ${failed} file(s)`));
            
            // Show first few errors
            const errors = result.summary.errors.slice(0, 5);
            for (const error of errors) {
              logger.error(chalk.red(`  - ${error.message}`));
            }
            if (result.summary.errors.length > 5) {
              logger.warn(chalk.yellow(`  ... and ${result.summary.errors.length - 5} more errors`));
            }
          }
          
          if (result.created.length > 0) {
            logger.info(`Created notes: ${result.created.slice(0, 5).join(', ')}${result.created.length > 5 ? '...' : ''}`);
          }
          
          if (result.attachments.length > 0) {
            logger.info(`Imported attachments: ${result.attachments.length}`);
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Obsidian Export
  program
    .command('export-obsidian')
    .description('Export to Obsidian vault format')
    .argument('<note-id>', 'note ID to export (exports all descendants)')
    .argument('<vault-path>', 'output vault directory path')
    .option('--dry-run', 'show what would be exported without making changes')
    .option('--preserve-structure', 'preserve folder structure', true)
    .option('--include-attachments', 'include attachments', true)
    .action(async (noteId: string, vaultPath: string, options: ExportObsidianOptions & { preserveStructure?: boolean; includeAttachments?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const resolvedPath = resolve(vaultPath);
        
        // Create Obsidian export config
        const config: ObsidianConfig = {
          vaultPath: resolvedPath,
          preserveWikilinks: true,
          convertWikilinks: false,
          includeTemplates: false,
          dryRun: options.dryRun ?? false,
          duplicateHandling: 'overwrite',
          preserveStructure: options.preserveStructure ?? true,
          includeAttachments: options.includeAttachments ?? true,
          validateContent: true,
          createMissingParents: true,
          patterns: [],
          excludePatterns: [],
          batchSize: 100,
          timeout: 30000,
          retries: 3,
          concurrency: 5,
          progress: true,
          templatesFolder: 'templates',
          attachmentFolder: 'attachments',
          dailyNotesFolder: 'daily',
          processFrontMatter: true,
          preserveFolderStructure: options.preserveStructure ?? true,
          ignoreFolders: ['.obsidian', '.trash'],
          imageFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
          documentFormats: ['pdf', 'doc', 'docx', 'odt'],
          audioFormats: ['mp3', 'wav', 'ogg', 'm4a'],
          videoFormats: ['mp4', 'webm', 'ogv', 'mov'],
        };

        // Progress tracking
        const onProgress = (event: ProgressEvent) => {
          if (event.type === 'start') {
            logger.info(event.message);
          } else if (event.type === 'progress') {
            const percent = event.total ? Math.round((event.current! / event.total) * 100) : 0;
            logger.info(`${event.message} (${percent}%)`);
          } else if (event.type === 'complete') {
            logger.info(chalk.green(event.message));
          } else if (event.type === 'error') {
            logger.error(chalk.red(event.message));
          }
        };
        
        logger.info(`Starting Obsidian export: ${noteId} -> ${resolvedPath}`);
        const result = await exportObsidian(client, [noteId], config, onProgress);
        
        // Display results
        if (options.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const successful = result.summary.successfulFiles;
          const failed = result.summary.failedFiles;
          const total = result.summary.totalFiles;
          
          logger.info(chalk.green(`Successfully exported ${successful}/${total} file(s)`));
          logger.info(`Output directory: ${result.outputPath}`);
          
          if (failed > 0) {
            logger.warn(chalk.yellow(`Failed to export ${failed} file(s)`));
            
            // Show first few errors
            const errors = result.summary.errors.slice(0, 5);
            for (const error of errors) {
              logger.error(chalk.red(`  - ${error.message}`));
            }
            if (result.summary.errors.length > 5) {
              logger.warn(chalk.yellow(`  ... and ${result.summary.errors.length - 5} more errors`));
            }
          }
          
          if (result.exported.length > 0) {
            logger.info(`Exported notes: ${result.exported.length}`);
          }
          
          if (result.attachments.length > 0) {
            logger.info(`Exported attachments: ${result.attachments.length}`);
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Notion Import
  program
    .command('import-notion')
    .description('Import from Notion export (ZIP format)')
    .argument('<zip-path>', 'path to Notion export ZIP file')
    .option('-p, --parent <id>', 'parent note ID to import into')
    .option('--dry-run', 'show what would be imported without making changes')
    .option('--convert-blocks', 'convert Notion blocks to HTML', true)
    .option('--preserve-ids', 'preserve Notion page IDs', false)
    .action(async (zipPath: string, options: ImportNotionOptions & { convertBlocks?: boolean; preserveIds?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const resolvedPath = resolve(zipPath);
        
        if (!existsSync(resolvedPath)) {
          throw new TriliumError(`ZIP file not found: ${resolvedPath}`);
        }
        
        if (extname(resolvedPath).toLowerCase() !== '.zip') {
          throw new TriliumError('File must be a ZIP archive');
        }
        
        const client = await createTriliumClient(options);
        
        // Create Notion config
        const config: NotionConfig = {
          zipPath: resolvedPath,
          preserveIds: options.preserveIds ?? false,
          convertBlocks: options.convertBlocks ?? true,
          dryRun: options.dryRun ?? false,
          duplicateHandling: 'skip',
          preserveStructure: true,
          includeAttachments: true,
          validateContent: true,
          createMissingParents: true,
          patterns: [],
          excludePatterns: [],
          batchSize: 100,
          timeout: 30000,
          retries: 3,
          concurrency: 5,
          progress: true,
          includeComments: false,
          processTemplates: true,
          convertTables: true,
          processCallouts: true,
          attachmentHandling: 'copy',
        };

        // Progress tracking
        const onProgress = (event: ProgressEvent) => {
          if (event.type === 'start') {
            logger.info(event.message);
          } else if (event.type === 'progress') {
            const percent = event.total ? Math.round((event.current! / event.total) * 100) : 0;
            logger.info(`${event.message} (${percent}%)`);
          } else if (event.type === 'complete') {
            logger.info(chalk.green(event.message));
          } else if (event.type === 'error') {
            logger.error(chalk.red(event.message));
          }
        };
        
        logger.info(`Starting Notion import: ${resolvedPath}`);
        const result = await importNotion(client, config, onProgress);
        
        // Display results
        if (options.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const successful = result.summary.successfulFiles;
          const failed = result.summary.failedFiles;
          const total = result.summary.totalFiles;
          
          logger.info(chalk.green(`Successfully imported ${successful}/${total} file(s)`));
          
          if (failed > 0) {
            logger.warn(chalk.yellow(`Failed to import ${failed} file(s)`));
            
            const errors = result.summary.errors.slice(0, 5);
            for (const error of errors) {
              logger.error(chalk.red(`  - ${error.message}`));
            }
            if (result.summary.errors.length > 5) {
              logger.warn(chalk.yellow(`  ... and ${result.summary.errors.length - 5} more errors`));
            }
          }
          
          if (result.created.length > 0) {
            logger.info(`Created notes: ${result.created.slice(0, 5).join(', ')}${result.created.length > 5 ? '...' : ''}`);
          }
          
          if (result.attachments.length > 0) {
            logger.info(`Imported attachments: ${result.attachments.length}`);
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Notion Export
  program
    .command('export-notion')
    .description('Export to Notion-compatible format')
    .argument('<note-id>', 'note ID to export (exports all descendants)')
    .argument('<output-path>', 'output directory or ZIP path')
    .option('--dry-run', 'show what would be exported without making changes')
    .option('--convert-blocks', 'convert content to Notion blocks', true)
    .action(async (noteId: string, outputPath: string, options: ExportNotionOptions & { convertBlocks?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const client = await createTriliumClient(options);
        const resolvedPath = resolve(outputPath);
        
        // Create Notion config
        const config: NotionConfig = {
          workspaceName: 'Trilium Export',
          convertBlocks: options.convertBlocks ?? true,
          dryRun: options.dryRun ?? false,
          duplicateHandling: 'overwrite',
          preserveStructure: true,
          includeAttachments: true,
          validateContent: true,
          createMissingParents: true,
          patterns: [],
          excludePatterns: [],
          batchSize: 100,
          timeout: 30000,
          retries: 3,
          concurrency: 5,
          progress: true,
          preserveIds: false,
          includeComments: false,
          processTemplates: true,
          convertTables: true,
          processCallouts: true,
          attachmentHandling: 'copy',
        };

        // Progress tracking
        const onProgress = (event: ProgressEvent) => {
          if (event.type === 'start') {
            logger.info(event.message);
          } else if (event.type === 'progress') {
            const percent = event.total ? Math.round((event.current! / event.total) * 100) : 0;
            logger.info(`${event.message} (${percent}%)`);
          } else if (event.type === 'complete') {
            logger.info(chalk.green(event.message));
          } else if (event.type === 'error') {
            logger.error(chalk.red(event.message));
          }
        };
        
        logger.info(`Starting Notion export: ${noteId} -> ${resolvedPath}`);
        const result = await exportNotion(client, [noteId], config, onProgress);
        
        // Display results
        if (options.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const successful = result.summary.successfulFiles;
          const failed = result.summary.failedFiles;
          const total = result.summary.totalFiles;
          
          logger.info(chalk.green(`Successfully exported ${successful}/${total} file(s)`));
          logger.info(`Output path: ${result.outputPath}`);
          
          if (failed > 0) {
            logger.warn(chalk.yellow(`Failed to export ${failed} file(s)`));
            
            const errors = result.summary.errors.slice(0, 5);
            for (const error of errors) {
              logger.error(chalk.red(`  - ${error.message}`));
            }
            if (result.summary.errors.length > 5) {
              logger.warn(chalk.yellow(`  ... and ${result.summary.errors.length - 5} more errors`));
            }
          }
          
          if (result.exported.length > 0) {
            logger.info(`Exported notes: ${result.exported.length}`);
          }
          
          if (result.attachments.length > 0) {
            logger.info(`Exported attachments: ${result.attachments.length}`);
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Directory Import
  program
    .command('import-dir')
    .description('Bulk import from directory')
    .argument('<dir-path>', 'directory path to import from')
    .option('-p, --parent <id>', 'parent note ID to import into')
    .option('-d, --max-depth <number>', 'maximum directory depth to traverse', (val) => parseInt(val, 10))
    .option('--patterns <pattern>', 'file patterns to match (glob patterns)', collect, [])
    .option('--preserve-structure', 'preserve directory structure', true)
    .option('--create-index', 'create an index file', false)
    .option('--dry-run', 'show what would be imported without making changes')
    .action(async (dirPath: string, options: ImportDirOptions & { preserveStructure?: boolean; createIndex?: boolean }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const resolvedPath = resolve(dirPath);
        
        if (!existsSync(resolvedPath)) {
          throw new TriliumError(`Directory not found: ${resolvedPath}`);
        }
        
        const stats = statSync(resolvedPath);
        if (!stats.isDirectory()) {
          throw new TriliumError(`Path is not a directory: ${resolvedPath}`);
        }
        
        const client = await createTriliumClient(options);
        
        // Create directory config
        const config: DirectoryConfig = {
          sourcePath: resolvedPath,
          filePatterns: options.patterns && options.patterns.length > 0 ? options.patterns : ['**/*.md', '**/*.txt', '**/*.html', '**/*.json'],
          ignorePatterns: ['**/node_modules/**', '**/.git/**'],
          detectFormat: true,
          preserveExtensions: true,
          createIndex: options.createIndex ?? false,
          indexFileName: 'index.md',
          dryRun: options.dryRun ?? false,
          duplicateHandling: 'skip',
          preserveStructure: options.preserveStructure ?? true,
          includeAttachments: true,
          validateContent: true,
          createMissingParents: true,
          patterns: [],
          excludePatterns: [],
          batchSize: 100,
          timeout: 30000,
          retries: 3,
          concurrency: 5,
          progress: true,
          maxDepth: options.maxDepth,
        };

        // Progress tracking
        const onProgress = (event: ProgressEvent) => {
          if (event.type === 'start') {
            logger.info(event.message);
          } else if (event.type === 'progress') {
            const percent = event.total ? Math.round((event.current! / event.total) * 100) : 0;
            logger.info(`${event.message} (${percent}%)`);
          } else if (event.type === 'complete') {
            logger.info(chalk.green(event.message));
          } else if (event.type === 'error') {
            logger.error(chalk.red(event.message));
          }
        };
        
        logger.info(`Starting directory import: ${resolvedPath}`);
        const result = await importDirectory(client, config, onProgress);
        
        // Display results
        if (options.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const successful = result.summary.successfulFiles;
          const failed = result.summary.failedFiles;
          const total = result.summary.totalFiles;
          
          logger.info(chalk.green(`Successfully imported ${successful}/${total} file(s)`));
          
          if (failed > 0) {
            logger.warn(chalk.yellow(`Failed to import ${failed} file(s)`));
            
            const errors = result.summary.errors.slice(0, 5);
            for (const error of errors) {
              logger.error(chalk.red(`  - ${error.message}`));
            }
            if (result.summary.errors.length > 5) {
              logger.warn(chalk.yellow(`  ... and ${result.summary.errors.length - 5} more errors`));
            }
          }
          
          if (result.created.length > 0) {
            logger.info(`Created notes: ${result.created.slice(0, 5).join(', ')}${result.created.length > 5 ? '...' : ''}`);
          }
          
          if (result.attachments.length > 0) {
            logger.info(`Imported attachments: ${result.attachments.length}`);
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Git Sync
  program
    .command('sync-git')
    .description('Git repository synchronization')
    .argument('<repo-path>', 'git repository path')
    .option('-b, --branch <branch>', 'git branch to work with', 'main')
    .option('-o, --operation <op>', 'operation type (import, export, bidirectional)', 'bidirectional')
    .option('--commit-message <message>', 'custom commit message')
    .option('--author-name <name>', 'git author name')
    .option('--author-email <email>', 'git author email')
    .option('--pull-before', 'pull from remote before import', true)
    .option('--push-after', 'push to remote after export', false)
    .option('--dry-run', 'show what would be done without making changes')
    .action(async (repoPath: string, options: SyncGitOptions & { pullBefore?: boolean; pushAfter?: boolean; commitMessage?: string; authorName?: string; authorEmail?: string; operation?: 'import' | 'export' | 'bidirectional' }) => {
      const logger = createLogger(options.verbose);
      
      try {
        const resolvedPath = resolve(repoPath);
        
        if (!existsSync(resolvedPath)) {
          throw new TriliumError(`Repository path not found: ${resolvedPath}`);
        }
        
        // Check if it's a git repository
        const gitPath = resolve(resolvedPath, '.git');
        if (!existsSync(gitPath)) {
          throw new TriliumError(`Not a git repository: ${resolvedPath}`);
        }
        
        const client = await createTriliumClient(options);
        
        // Create Git config
        const config: GitConfig = {
          repositoryPath: resolvedPath,
          branch: options.branch || 'main',
          remote: 'origin',
          commitMessage: options.commitMessage,
          authorName: options.authorName,
          authorEmail: options.authorEmail,
          syncDirection: options.operation as any || 'bidirectional',
          conflictResolution: 'manual',
          trackChanges: true,
          includeHistory: false,
          pushAfterExport: options.pushAfter ?? false,
          pullBeforeImport: options.pullBefore ?? true,
          dryRun: options.dryRun ?? false,
          duplicateHandling: 'skip',
          preserveStructure: true,
          includeAttachments: true,
          validateContent: true,
          createMissingParents: true,
          patterns: [],
          excludePatterns: [],
          batchSize: 100,
          timeout: 30000,
          retries: 3,
          concurrency: 5,
          progress: true,
        };

        // Progress tracking
        const onProgress = (event: ProgressEvent) => {
          if (event.type === 'start') {
            logger.info(event.message);
          } else if (event.type === 'progress') {
            const percent = event.total ? Math.round((event.current! / event.total) * 100) : 0;
            logger.info(`${event.message} (${percent}%)`);
          } else if (event.type === 'complete') {
            logger.info(chalk.green(event.message));
          } else if (event.type === 'error') {
            logger.error(chalk.red(event.message));
          }
        };
        
        logger.info(`Starting Git sync: ${config.syncDirection} operation on ${resolvedPath}`);
        const result = await syncGit(client, config, onProgress);
        
        // Display results
        if (options.output === 'json') {
          console.log(JSON.stringify(result, null, 2));
        } else {
          const successful = result.summary.successfulFiles;
          const failed = result.summary.failedFiles;
          const total = result.summary.totalFiles;
          
          logger.info(chalk.green(`Successfully synced ${successful}/${total} file(s)`));
          logger.info(`Repository: ${result.repository}`);
          logger.info(`Branch: ${result.branch}`);
          
          if (result.commitHash) {
            logger.info(`Commit: ${result.commitHash.substring(0, 8)}`);
          }
          
          if (failed > 0) {
            logger.warn(chalk.yellow(`Failed to sync ${failed} file(s)`));
            
            const errors = result.summary.errors.slice(0, 5);
            for (const error of errors) {
              logger.error(chalk.red(`  - ${error.message}`));
            }
            if (result.summary.errors.length > 5) {
              logger.warn(chalk.yellow(`  ... and ${result.summary.errors.length - 5} more errors`));
            }
          }
          
          if (result.imported.length > 0) {
            logger.info(`Imported files: ${result.imported.length}`);
          }
          
          if (result.exported.length > 0) {
            logger.info(`Exported files: ${result.exported.length}`);
          }
          
          if (result.conflicts.length > 0) {
            logger.warn(chalk.yellow(`Conflicts detected: ${result.conflicts.length}`));
            for (const conflict of result.conflicts.slice(0, 5)) {
              logger.warn(chalk.yellow(`  - ${conflict}`));
            }
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Helper function to collect multiple values
 */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}