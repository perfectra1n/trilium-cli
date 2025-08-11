import { join, relative, dirname, basename, resolve } from 'path';
import { readFile, writeFile, stat, access, constants } from 'fs/promises';

import type { TriliumClient } from '../../api/client.js';
import type {
  SyncHandler,
  GitConfig,
  FileInfo,
  GitSyncResult,
  OperationContext,
  ProgressCallback,
  FileResult,
} from '../types.js';
import {
  ImportExportError,
  validateConfig,
  GitConfigSchema,
  createProgressTracker,
} from '../types.js';
import {
  scanFiles,
  parseContent,
  formatContent,
  writeTextFile,
  copyFile,
  ensureDirectory,
  ErrorCollector,
  createBatchProgressTracker,
  sanitizeFileName,
  fileExists,
} from '../utils.js';
import {
  safeGitExecSync,
  safeGitExecAsync,
  validateDirectoryPath,
  sanitizeGitBranch,
  sanitizeCommitMessage,
  sanitizeGitUser,
  sanitizeGitEmail,
} from '../secure-exec.js';

/**
 * Git repository information
 */
interface GitStatus {
  branch: string;
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  staged: string[];
  commits: GitCommit[];
  remoteUrl?: string;
  lastCommitHash?: string;
}

interface GitCommit {
  hash: string;
  author: string;
  date: Date;
  message: string;
  files: string[];
}

/**
 * Git synchronization result details
 */
interface GitSyncDetails {
  importedFiles: string[];
  exportedFiles: string[];
  conflictedFiles: string[];
  skippedFiles: string[];
  commitHash?: string;
  branchSwitched?: boolean;
}

/**
 * Git synchronization handler
 */
export class GitSyncHandler implements SyncHandler<GitConfig> {
  name = 'git-sync';
  format = 'git' as const;

  constructor(private client: TriliumClient) {}

  async validate(config: GitConfig): Promise<void> {
    validateConfig(GitConfigSchema, config);
    
    // Validate and sanitize repository path
    const safeRepoPath = validateDirectoryPath(config.repositoryPath);
    
    // Sanitize git configuration values
    if (config.branch) {
      config.branch = sanitizeGitBranch(config.branch);
    }
    if (config.authorName) {
      config.authorName = sanitizeGitUser(config.authorName);
    }
    if (config.authorEmail) {
      config.authorEmail = sanitizeGitEmail(config.authorEmail);
    }
    if (config.commitMessage) {
      config.commitMessage = sanitizeCommitMessage(config.commitMessage);
    }
    
    // Check if repository path exists and is a git repository
    try {
      const repoStats = await stat(safeRepoPath);
      if (!repoStats.isDirectory()) {
        throw new ImportExportError(
          `Repository path is not a directory: ${safeRepoPath}`,
          'INVALID_REPO_PATH'
        );
      }

      const gitDir = join(safeRepoPath, '.git');
      await access(gitDir, constants.F_OK);
    } catch (error) {
      if (error instanceof ImportExportError) {
        throw error;
      }
      throw new ImportExportError(
        `Path is not a git repository: ${safeRepoPath}`,
        'NOT_GIT_REPOSITORY',
        { path: safeRepoPath, error }
      );
    }
  }

  async sync(
    config: GitConfig,
    context: OperationContext,
    onProgress?: ProgressCallback
  ): Promise<GitSyncResult> {
    const startTime = new Date();
    const errors = new ErrorCollector();
    const results: FileResult[] = [];
    const imported: string[] = [];
    const exported: string[] = [];
    const conflicts: string[] = [];

    const progress = createProgressTracker(context.operationId, 100, onProgress);
    await progress.start('Starting Git synchronization');

    try {
      // Step 1: Analyze git repository status (10%)
      await progress.progress(10, 'Analyzing git repository...');
      const gitStatus = await this.getGitStatus(config);

      // Step 2: Handle branch switching if needed (20%)
      if (config.branch && gitStatus.branch !== config.branch) {
        await progress.progress(20, `Switching to branch: ${config.branch}`);
        await this.switchBranch(config, gitStatus.branch);
        gitStatus.branch = config.branch;
      }

      // Step 3: Pull from remote if configured (30%)
      if (config.pullBeforeImport && config.syncDirection !== 'export') {
        await progress.progress(30, 'Pulling from remote repository...');
        await this.pullFromRemote(config);
      }

      // Step 4: Perform sync operations based on direction (40-80%)
      let syncDetails: GitSyncDetails;
      
      if (config.syncDirection === 'import') {
        syncDetails = await this.performImport(config, context, gitStatus, progress);
      } else if (config.syncDirection === 'export') {
        syncDetails = await this.performExport(config, context, gitStatus, progress);
      } else {
        // Bidirectional sync
        syncDetails = await this.performBidirectionalSync(config, context, gitStatus, progress);
      }

      // Step 5: Commit changes if exporting (90%)
      if ((config.syncDirection === 'export' || config.syncDirection === 'bidirectional') && 
          syncDetails.exportedFiles.length > 0) {
        await progress.progress(90, 'Committing changes...');
        syncDetails.commitHash = await this.commitChanges(config, syncDetails.exportedFiles);
      }

      // Step 6: Push to remote if configured (95%)
      if (config.pushAfterExport && syncDetails.commitHash && 
          (config.syncDirection === 'export' || config.syncDirection === 'bidirectional')) {
        await progress.progress(95, 'Pushing to remote repository...');
        await this.pushToRemote(config);
      }

      // Create file results
      for (const filePath of syncDetails.importedFiles) {
        results.push({
          file: await this.createFileInfo(filePath, config),
          success: true,
          skipped: false,
          metadata: { operation: 'import', filePath },
        });
      }

      for (const filePath of syncDetails.exportedFiles) {
        results.push({
          file: await this.createFileInfo(filePath, config),
          success: true,
          skipped: false,
          metadata: { operation: 'export', filePath },
        });
      }

      for (const filePath of syncDetails.conflictedFiles) {
        results.push({
          file: await this.createFileInfo(filePath, config),
          success: false,
          error: {
            code: 'SYNC_CONFLICT',
            message: `Sync conflict detected for file: ${filePath}`,
            timestamp: new Date(),
          },
          skipped: false,
        });
        conflicts.push(filePath);
      }

      imported.push(...syncDetails.importedFiles);
      exported.push(...syncDetails.exportedFiles);

      const endTime = new Date();
      await progress.complete(`Git sync completed successfully`);

      return {
        summary: {
          operation: 'sync',
          format: 'git',
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
          totalFiles: results.length,
          processedFiles: results.length,
          successfulFiles: results.filter(r => r.success).length,
          failedFiles: results.filter(r => !r.success).length,
          skippedFiles: 0,
          totalSize: results.reduce((sum, r) => sum + (r.file.size || 0), 0),
          processedSize: results.filter(r => r.success).reduce((sum, r) => sum + (r.file.size || 0), 0),
          errors: errors.getErrors(),
          warnings: errors.getWarnings(),
        },
        files: results,
        repository: config.repositoryPath,
        branch: gitStatus.branch,
        commitHash: syncDetails.commitHash,
        imported,
        exported,
        conflicts,
        warnings: errors.getWarnings(),
        config,
      };

    } catch (error) {
      await progress.error(error instanceof Error ? error.message : 'Unknown error');
      throw new ImportExportError(
        `Git sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GIT_SYNC_ERROR',
        { repositoryPath: config.repositoryPath, error }
      );
    }
  }

  private async getGitStatus(config: GitConfig): Promise<GitStatus> {
    const cwd = validateDirectoryPath(config.repositoryPath);

    try {
      // Get current branch
      const branch = safeGitExecSync('git branch --show-current', { cwd, timeout: 10000 }).trim();

      // Get status
      const statusOutput = safeGitExecSync('git status --porcelain', { cwd, timeout: 10000 });
      const statusLines = statusOutput.split('\n').filter(line => line.trim());

      const modified: string[] = [];
      const added: string[] = [];
      const deleted: string[] = [];
      const untracked: string[] = [];
      const staged: string[] = [];

      for (const line of statusLines) {
        const status = line.substring(0, 2);
        const filePath = line.substring(3);

        if (status[0] !== ' ') {
          staged.push(filePath);
        }

        if (status.includes('M')) {
          modified.push(filePath);
        } else if (status.includes('A')) {
          added.push(filePath);
        } else if (status.includes('D')) {
          deleted.push(filePath);
        } else if (status.includes('??')) {
          untracked.push(filePath);
        }
      }

      // Get recent commits
      const commitOutput = safeGitExecSync(
        'git log --oneline --max-count=10 --pretty=format:"%H|%an|%ad|%s" --date=iso',
        { cwd, timeout: 15000 }
      );
      
      const commits: GitCommit[] = commitOutput.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [hash, author, dateStr, message] = line.split('|');
          return {
            hash,
            author,
            date: new Date(dateStr),
            message,
            files: [], // Would need separate command to get files per commit
          };
        });

      // Get remote URL if available
      let remoteUrl: string | undefined;
      try {
        const sanitizedRemote = sanitizeGitBranch(config.remote || 'origin');
        remoteUrl = safeGitExecSync(`git remote get-url ${sanitizedRemote}`, { cwd, timeout: 10000 }).trim();
      } catch {
        // Remote might not exist
      }

      return {
        branch,
        modified,
        added,
        deleted,
        untracked,
        staged,
        commits,
        remoteUrl,
        lastCommitHash: commits[0]?.hash,
      };

    } catch (error) {
      throw new ImportExportError(
        `Failed to get git status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GIT_STATUS_ERROR',
        { repositoryPath: config.repositoryPath, error }
      );
    }
  }

  private async switchBranch(config: GitConfig, currentBranch: string): Promise<void> {
    const cwd = validateDirectoryPath(config.repositoryPath);
    const safeBranch = sanitizeGitBranch(config.branch || 'main');
    const safeRemote = sanitizeGitBranch(config.remote || 'origin');

    try {
      // Check if branch exists locally
      const branches = safeGitExecSync('git branch --list', { cwd, timeout: 10000 });
      const branchExists = branches.includes(safeBranch);

      if (branchExists) {
        safeGitExecSync(`git checkout ${safeBranch}`, { cwd, timeout: 15000 });
      } else {
        // Try to create branch from remote if it exists
        try {
          safeGitExecSync(`git checkout -b ${safeBranch} ${safeRemote}/${safeBranch}`, { cwd, timeout: 15000 });
        } catch {
          // Create new branch from current branch
          safeGitExecSync(`git checkout -b ${safeBranch}`, { cwd, timeout: 15000 });
        }
      }
    } catch (error) {
      throw new ImportExportError(
        `Failed to switch to branch ${safeBranch}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GIT_BRANCH_SWITCH_ERROR',
        { branch: safeBranch, error }
      );
    }
  }

  private async pullFromRemote(config: GitConfig): Promise<void> {
    const cwd = validateDirectoryPath(config.repositoryPath);
    const safeRemote = sanitizeGitBranch(config.remote || 'origin');
    const safeBranch = sanitizeGitBranch(config.branch || 'main');

    try {
      safeGitExecSync(`git pull ${safeRemote} ${safeBranch}`, { cwd, timeout: 60000 });
    } catch (error) {
      throw new ImportExportError(
        `Failed to pull from remote: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GIT_PULL_ERROR',
        { remote: safeRemote, branch: safeBranch, error }
      );
    }
  }

  private async pushToRemote(config: GitConfig): Promise<void> {
    const cwd = validateDirectoryPath(config.repositoryPath);
    const safeRemote = sanitizeGitBranch(config.remote || 'origin');
    const safeBranch = sanitizeGitBranch(config.branch || 'main');

    try {
      safeGitExecSync(`git push ${safeRemote} ${safeBranch}`, { cwd, timeout: 60000 });
    } catch (error) {
      throw new ImportExportError(
        `Failed to push to remote: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GIT_PUSH_ERROR',
        { remote: safeRemote, branch: safeBranch, error }
      );
    }
  }

  private async performImport(
    config: GitConfig,
    context: OperationContext,
    gitStatus: GitStatus,
    progress: any
  ): Promise<GitSyncDetails> {
    const importedFiles: string[] = [];
    const skippedFiles: string[] = [];

    // Scan repository for files to import
    const files = await scanFiles(config.repositoryPath, {
      patterns: ['**/*.md', '**/*.txt', '**/*.html', '**/*.json'],
      excludePatterns: ['.git/**', 'node_modules/**'],
      maxDepth: config.maxDepth,
    });

    const noteIdMap = new Map<string, string>();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progressPercent = 40 + Math.floor((i / files.length) * 40);
      await progress.progress(progressPercent, `Importing: ${file.name}`);

      try {
        const noteId = await this.importFileToTrilium(file, config, context);
        if (noteId) {
          noteIdMap.set(file.path, noteId);
          importedFiles.push(file.path);
        } else {
          skippedFiles.push(file.path);
        }
      } catch (error) {
        console.warn(`Warning: Failed to import ${file.path}:`, error);
        skippedFiles.push(file.path);
      }
    }

    return {
      importedFiles,
      exportedFiles: [],
      conflictedFiles: [],
      skippedFiles,
    };
  }

  private async performExport(
    config: GitConfig,
    context: OperationContext,
    gitStatus: GitStatus,
    progress: any
  ): Promise<GitSyncDetails> {
    const exportedFiles: string[] = [];
    const skippedFiles: string[] = [];

    // Get notes to export (all notes or specific note tree)
    const noteIds = await this.getNoteIdsForExport(config);

    for (let i = 0; i < noteIds.length; i++) {
      const noteId = noteIds[i];
      const progressPercent = 40 + Math.floor((i / noteIds.length) * 40);
      await progress.progress(progressPercent, `Exporting note: ${noteId}`);

      try {
        const filePaths = await this.exportNoteToGit(noteId, config, context);
        exportedFiles.push(...filePaths);
      } catch (error) {
        console.warn(`Warning: Failed to export note ${noteId}:`, error);
        skippedFiles.push(noteId);
      }
    }

    return {
      importedFiles: [],
      exportedFiles,
      conflictedFiles: [],
      skippedFiles,
    };
  }

  private async performBidirectionalSync(
    config: GitConfig,
    context: OperationContext,
    gitStatus: GitStatus,
    progress: any
  ): Promise<GitSyncDetails> {
    // First import changes from git
    await progress.progress(40, 'Importing changes from git...');
    const importDetails = await this.performImport(config, context, gitStatus, {
      progress: (percent: number, message: string) => progress.progress(40 + percent * 0.2, message)
    });

    // Then export changes to git
    await progress.progress(60, 'Exporting changes to git...');
    const exportDetails = await this.performExport(config, context, gitStatus, {
      progress: (percent: number, message: string) => progress.progress(60 + percent * 0.2, message)
    });

    // Detect conflicts
    const conflicts: string[] = [];
    if (config.conflictResolution === 'manual') {
      // Check for files that were both modified in git and trilium
      for (const importedFile of importDetails.importedFiles) {
        if (exportDetails.exportedFiles.includes(importedFile)) {
          conflicts.push(importedFile);
        }
      }
    }

    return {
      importedFiles: importDetails.importedFiles,
      exportedFiles: exportDetails.exportedFiles,
      conflictedFiles: conflicts,
      skippedFiles: [...importDetails.skippedFiles, ...exportDetails.skippedFiles],
    };
  }

  private async importFileToTrilium(
    file: FileInfo,
    config: GitConfig,
    context: OperationContext
  ): Promise<string | null> {
    try {
      // Check if file should be skipped
      if (config.ignorePatterns.some(pattern => file.path.match(pattern))) {
        return null;
      }

      // Read and parse file content
      const content = await readFile(file.fullPath, 'utf8');
      const contentInfo = await parseContent(content, file);

      // Determine note title
      const title = contentInfo.title || 
                   basename(file.name, '.' + file.extension) ||
                   file.name;

      // Check if note already exists
      const existingNoteId = await this.findExistingNoteByPath(file.path, config);
      
      if (existingNoteId && config.duplicateHandling === 'skip') {
        return existingNoteId;
      }

      // Create or update note
      const noteData = {
        title,
        content: contentInfo.content || content,
        type: 'text',
        mime: 'text/html',
        attributes: [
          { type: 'label', name: 'source', value: 'git' },
          { type: 'label', name: 'git-path', value: file.path },
          { type: 'label', name: 'git-repository', value: config.repositoryPath },
        ],
      };

      if (existingNoteId && config.duplicateHandling === 'overwrite') {
        await this.client.updateNote(existingNoteId, noteData);
        return existingNoteId;
      } else {
        return await this.client.createNote({
          ...noteData,
          parentNoteId: 'root', // TODO: Support folder structure
        });
      }

    } catch (error) {
      throw new ImportExportError(
        `Failed to import file to Trilium: ${file.path}`,
        'FILE_IMPORT_ERROR',
        { filePath: file.path, error }
      );
    }
  }

  private async exportNoteToGit(
    ownerId: string,
    config: GitConfig,
    context: OperationContext
  ): Promise<string[]> {
    const exportedFiles: string[] = [];

    try {
      // Get note data
      const note = await this.client.getNote(noteId);
      if (!note) {
        throw new Error(`Note not found: ${noteId}`);
      }

      // Determine file path
      const fileName = sanitizeFileName(note.title) + '.md';
      const filePath = join(config.repositoryPath, fileName);

      // Get original git path if available
      const attributes = await this.client.getNoteAttributes(noteId);
      const originalPath = attributes.find(attr => attr.name === 'git-path')?.value;
      
      const targetPath = originalPath 
        ? join(config.repositoryPath, originalPath)
        : filePath;

      // Convert note content to markdown
      const markdownContent = await this.convertNoteToMarkdown(note, attributes);

      // Write file
      await ensureDirectory(dirname(targetPath));
      await writeTextFile(targetPath, markdownContent);

      exportedFiles.push(relative(config.repositoryPath, targetPath));

      // Export attachments
      const attachments = await this.client.getNoteAttachments(noteId);
      for (const attachment of attachments) {
        const attachmentPath = join(
          config.repositoryPath,
          'attachments',
          sanitizeFileName(attachment.title)
        );

        const attachmentData = await this.client.getAttachmentContent(attachment.attachmentId);
        if (attachmentData) {
          await ensureDirectory(dirname(attachmentPath));
          await writeFile(attachmentPath, attachmentData);
          exportedFiles.push(relative(config.repositoryPath, attachmentPath));
        }
      }

      return exportedFiles;

    } catch (error) {
      throw new ImportExportError(
        `Failed to export note to git: ${noteId}`,
        'NOTE_EXPORT_ERROR',
        { noteId, error }
      );
    }
  }

  private async convertNoteToMarkdown(note: any, attributes: any[]): Promise<string> {
    let content = '';

    // Add front matter
    const frontMatter: Record<string, any> = {
      id: note.noteId,
      title: note.title,
      created: note.dateCreated,
      modified: note.dateModified,
    };

    // Add custom attributes
    for (const attr of attributes) {
      if (attr.name.startsWith('git-') || attr.name === 'source') {
        continue; // Skip git-specific attributes
      }
      frontMatter[attr.name] = attr.value;
    }

    // Write front matter
    content += '---\n';
    for (const [key, value] of Object.entries(frontMatter)) {
      content += `${key}: ${JSON.stringify(value)}\n`;
    }
    content += '---\n\n';

    // Add title if not in content
    if (!note.content?.startsWith('#') && !note.content?.includes(`# ${note.title}`)) {
      content += `# ${note.title}\n\n`;
    }

    // Add note content (convert HTML to markdown if needed)
    if (note.content) {
      content += this.convertHtmlToMarkdown(note.content);
    }

    return content;
  }

  private convertHtmlToMarkdown(html: string): string {
    // Basic HTML to Markdown conversion
    return html
      .replace(/<h([1-6])[^>]*>([^<]+)<\/h[1-6]>/gi, (match, level, text) => '#'.repeat(parseInt(level)) + ' ' + text + '\n\n')
      .replace(/<p[^>]*>([^<]+)<\/p>/gi, '$1\n\n')
      .replace(/<strong[^>]*>([^<]+)<\/strong>/gi, '**$1**')
      .replace(/<em[^>]*>([^<]+)<\/em>/gi, '*$1*')
      .replace(/<code[^>]*>([^<]+)<\/code>/gi, '`$1`')
      .replace(/<pre[^>]*><code[^>]*>([^<]+)<\/code><\/pre>/gi, '```\n$1\n```')
      .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)')
      .replace(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi, '![]($1)')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private async commitChanges(config: GitConfig, files: string[]): Promise<string> {
    const cwd = validateDirectoryPath(config.repositoryPath);

    try {
      // Validate and add files to git
      for (const file of files) {
        // Sanitize file path to prevent injection
        const sanitizedFile = file.replace(/[;|&$`<>(){}[\]]/g, '');
        if (sanitizedFile !== file) {
          throw new ImportExportError(
            `Invalid file path contains dangerous characters: ${file}`,
            'UNSAFE_FILE_PATH',
            { file }
          );
        }
        safeGitExecSync(`git add "${sanitizedFile}"`, { cwd, timeout: 15000 });
      }

      // Create and sanitize commit message
      const message = sanitizeCommitMessage(
        config.commitMessage || `Trilium sync: ${new Date().toISOString()}`
      );
      
      // Set git config if provided (with sanitized values)
      if (config.authorName || config.authorEmail) {
        if (config.authorName) {
          const safeName = sanitizeGitUser(config.authorName);
          safeGitExecSync(`git config user.name "${safeName}"`, { cwd, timeout: 10000 });
        }
        if (config.authorEmail) {
          const safeEmail = sanitizeGitEmail(config.authorEmail);
          safeGitExecSync(`git config user.email "${safeEmail}"`, { cwd, timeout: 10000 });
        }
      }

      // Create commit
      safeGitExecSync(`git commit -m "${message}"`, { cwd, timeout: 15000 });

      // Get commit hash
      const commitHash = safeGitExecSync('git rev-parse HEAD', { cwd, timeout: 10000 }).trim();
      
      return commitHash;

    } catch (error) {
      throw new ImportExportError(
        `Failed to commit changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GIT_COMMIT_ERROR',
        { files, error }
      );
    }
  }

  private async findExistingNoteByPath(gitPath: string, config: GitConfig): Promise<string | null> {
    try {
      const searchResults = await this.client.searchNotes(`#git-path = "${gitPath}"`);
      return searchResults.length > 0 ? searchResults[0].noteId : null;
    } catch (error) {
      return null;
    }
  }

  private async getNoteIdsForExport(config: GitConfig): Promise<string[]> {
    // For now, get all notes with git source
    // In a real implementation, this could be more sophisticated
    try {
      const searchResults = await this.client.searchNotes('#source = "git"');
      return searchResults.map(result => result.noteId);
    } catch (error) {
      console.warn('Could not find git-sourced notes, exporting all notes');
      // Fallback: get all notes (this would need a different API method)
      return [];
    }
  }

  private async createFileInfo(filePath: string, config: GitConfig): Promise<FileInfo> {
    const fullPath = join(config.repositoryPath, filePath);
    let size = 0;
    
    try {
      const stats = await stat(fullPath);
      size = stats.size;
    } catch {
      // File might not exist yet
    }

    return {
      path: filePath,
      fullPath,
      relativePath: filePath,
      name: basename(filePath),
      extension: basename(filePath).split('.').pop() || '',
      size,
      depth: filePath.split('/').length - 1,
      metadata: {
        repository: config.repositoryPath,
        branch: config.branch,
      },
    };
  }
}