import { execSync, spawn } from 'child_process';
import { promisify } from 'util';
import { resolve, normalize, isAbsolute } from 'path';
import { ImportExportError } from './types.js';

/**
 * Secure command execution utilities with input validation and timeout protection
 */

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  encoding?: BufferEncoding;
  maxBuffer?: number;
  allowedCommands?: string[];
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * List of allowed git commands to prevent arbitrary command execution
 */
const ALLOWED_GIT_COMMANDS = [
  'git status',
  'git branch',
  'git checkout',
  'git pull',
  'git push',
  'git add',
  'git commit',
  'git log',
  'git remote',
  'git rev-parse',
  'git config',
];

/**
 * Validates that a directory path is safe and within expected bounds
 */
export function validateDirectoryPath(path: string): string {
  if (!path || typeof path !== 'string') {
    throw new ImportExportError('Invalid path: path must be a non-empty string', 'INVALID_PATH');
  }

  // Resolve and normalize the path to handle . and .. components
  const resolved = resolve(normalize(path));
  
  // Check for path traversal attempts
  if (path.includes('..') || path.includes('~') || path.includes('$')) {
    throw new ImportExportError(
      'Invalid path: path contains potentially dangerous characters',
      'UNSAFE_PATH',
      { path }
    );
  }

  // Ensure the path is absolute after resolution
  if (!isAbsolute(resolved)) {
    throw new ImportExportError(
      'Invalid path: path must resolve to an absolute path',
      'RELATIVE_PATH_ERROR',
      { path, resolved }
    );
  }

  return resolved;
}

/**
 * Sanitizes a string to prevent command injection
 */
export function sanitizeCommandInput(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new ImportExportError('Invalid input: must be a non-empty string', 'INVALID_INPUT');
  }

  // Remove or escape dangerous characters
  const sanitized = input
    .replace(/[;|&$`<>(){}[\]]/g, '') // Remove shell metacharacters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Check for remaining dangerous patterns
  if (sanitized.includes('..') || sanitized.includes('~') || sanitized.includes('*')) {
    throw new ImportExportError(
      'Invalid input: contains potentially dangerous patterns',
      'UNSAFE_INPUT',
      { original: input, sanitized }
    );
  }

  return sanitized;
}

/**
 * Validates that a git command is in the allowed list
 */
export function validateGitCommand(command: string): void {
  const baseCommand = command.split(' ').slice(0, 2).join(' ');
  
  if (!ALLOWED_GIT_COMMANDS.includes(baseCommand)) {
    throw new ImportExportError(
      `Git command not allowed: ${baseCommand}`,
      'FORBIDDEN_GIT_COMMAND',
      { command, baseCommand }
    );
  }
}

/**
 * Safely executes a git command with proper validation and timeout protection
 */
export function safeGitExecSync(
  command: string,
  options: ExecOptions = {}
): string {
  const {
    cwd,
    timeout = 30000, // 30 second default timeout
    encoding = 'utf8',
    maxBuffer = 1024 * 1024, // 1MB default buffer
  } = options;

  // Validate the command
  validateGitCommand(command);

  // Validate and sanitize the working directory
  let safeCwd: string | undefined;
  if (cwd) {
    safeCwd = validateDirectoryPath(cwd);
  }

  // Parse command into parts for safer execution
  const commandParts = command.split(' ').filter(part => part.trim() !== '');
  if (commandParts.length === 0) {
    throw new ImportExportError('Empty command provided', 'EMPTY_COMMAND');
  }

  // Sanitize command arguments
  const sanitizedParts = commandParts.map((part, index) => {
    // Don't sanitize the git command itself or flags starting with -
    if (index <= 1 || part.startsWith('-')) {
      return part;
    }
    return sanitizeCommandInput(part);
  });

  const sanitizedCommand = sanitizedParts.join(' ');

  try {
    return execSync(sanitizedCommand, {
      cwd: safeCwd,
      timeout,
      encoding,
      maxBuffer,
      // Prevent shell expansion
      shell: false,
    });
  } catch (error: any) {
    // Handle timeout errors specifically
    if (error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT') {
      throw new ImportExportError(
        `Git command timed out after ${timeout}ms: ${sanitizedCommand}`,
        'GIT_TIMEOUT',
        { command: sanitizedCommand, timeout, cwd: safeCwd }
      );
    }

    // Handle other execution errors
    throw new ImportExportError(
      `Git command failed: ${sanitizedCommand}`,
      'GIT_COMMAND_ERROR',
      {
        command: sanitizedCommand,
        cwd: safeCwd,
        exitCode: error.status,
        stderr: error.stderr?.toString(),
        error: error.message,
      }
    );
  }
}

/**
 * Safely executes a git command asynchronously with proper validation and timeout protection
 */
export async function safeGitExecAsync(
  command: string,
  options: ExecOptions = {}
): Promise<ExecResult> {
  const {
    cwd,
    timeout = 30000,
    maxBuffer = 1024 * 1024,
  } = options;

  // Validate the command
  validateGitCommand(command);

  // Validate and sanitize the working directory
  let safeCwd: string | undefined;
  if (cwd) {
    safeCwd = validateDirectoryPath(cwd);
  }

  // Parse and sanitize command
  const commandParts = command.split(' ').filter(part => part.trim() !== '');
  if (commandParts.length === 0) {
    throw new ImportExportError('Empty command provided', 'EMPTY_COMMAND');
  }

  const sanitizedParts = commandParts.map((part, index) => {
    if (index <= 1 || part.startsWith('-')) {
      return part;
    }
    return sanitizeCommandInput(part);
  });

  const [cmd, ...args] = sanitizedParts;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: safeCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      if (stdout.length > maxBuffer) {
        child.kill();
        reject(new ImportExportError(
          'Command output exceeded maximum buffer size',
          'OUTPUT_TOO_LARGE',
          { maxBuffer, outputSize: stdout.length }
        ));
      }
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      child.kill();
      reject(new ImportExportError(
        `Git command timed out after ${timeout}ms`,
        'GIT_TIMEOUT',
        { command: sanitizedParts.join(' '), timeout, cwd: safeCwd }
      ));
    }, timeout);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code || 0,
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(new ImportExportError(
        `Failed to execute git command: ${error.message}`,
        'GIT_SPAWN_ERROR',
        {
          command: sanitizedParts.join(' '),
          cwd: safeCwd,
          error: error.message,
        }
      ));
    });
  });
}

/**
 * Sanitizes a git branch name to prevent injection
 */
export function sanitizeGitBranch(branch: string): string {
  if (!branch || typeof branch !== 'string') {
    throw new ImportExportError('Invalid branch name: must be a non-empty string', 'INVALID_BRANCH');
  }

  // Git branch name rules: no spaces, no special characters except - and _
  const sanitized = branch
    .replace(/[^a-zA-Z0-9._/-]/g, '')
    .replace(/^[-._]|[-._]$/, '') // Remove leading/trailing special chars
    .replace(/\.\.+/g, '.') // Replace multiple dots with single dot
    .trim();

  if (!sanitized || sanitized.length === 0) {
    throw new ImportExportError(
      'Invalid branch name: sanitization resulted in empty string',
      'INVALID_BRANCH_NAME',
      { original: branch, sanitized }
    );
  }

  return sanitized;
}

/**
 * Sanitizes a commit message to prevent injection
 */
export function sanitizeCommitMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return 'Automated commit';
  }

  // Remove control characters and limit length
  const sanitized = message
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '') // Remove control characters
    .replace(/[`$(){}[\]]/g, '') // Remove shell metacharacters
    .trim()
    .substring(0, 200); // Limit message length

  return sanitized || 'Automated commit';
}

/**
 * Sanitizes git user name and email
 */
export function sanitizeGitUser(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new ImportExportError('Invalid git user name: must be a non-empty string', 'INVALID_USER_NAME');
  }

  const sanitized = name
    .replace(/[<>"`$(){}[\]]/g, '') // Remove dangerous characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .substring(0, 100); // Limit length

  if (!sanitized || sanitized.length === 0) {
    throw new ImportExportError(
      'Invalid git user name: sanitization resulted in empty string',
      'INVALID_USER_NAME',
      { original: name }
    );
  }

  return sanitized;
}

export function sanitizeGitEmail(email: string): string {
  if (!email || typeof email !== 'string') {
    throw new ImportExportError('Invalid git email: must be a non-empty string', 'INVALID_EMAIL');
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ImportExportError(
      'Invalid git email: must be a valid email address',
      'INVALID_EMAIL_FORMAT',
      { email }
    );
  }

  return email.trim().substring(0, 100);
}