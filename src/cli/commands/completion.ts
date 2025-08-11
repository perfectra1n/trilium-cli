import type { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';

import type {
  CompletionGenerateOptions,
  CompletionInstallOptions,
  CompletionCacheClearOptions,
  CompletionCacheStatusOptions,
  CompletionCacheRefreshOptions,
} from '../types.js';
import { TriliumClient } from '../../api/client.js';
import { Config } from '../../config/index.js';
import { TriliumError } from '../../error.js';
import { createLogger } from '../../utils/logger.js';
import { formatOutput, handleCliError, createTriliumClient } from '../../utils/cli.js';

/**
 * Set up completion commands
 */
export function setupCompletionCommands(program: Command): void {
  const completionCommand = program
    .command('completion')
    .description('Shell completion management');

  // Generate completion script
  completionCommand
    .command('generate')
    .description('Generate completion script')
    .argument('<shell>', 'shell type (bash, zsh, fish, powershell, elvish)')
    .option('-o, --output <file>', 'output file (stdout if not specified)')
    .action(async (shell: string, options: CompletionGenerateOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const supportedShells = ['bash', 'zsh', 'fish', 'powershell', 'elvish'];
        if (!supportedShells.includes(shell)) {
          throw new TriliumError(`Unsupported shell: ${shell}. Supported: ${supportedShells.join(', ')}`);
        }
        
        logger.info(`Generating ${shell} completion script...`);
        const completionScript = generateCompletionScript(shell);
        
        if (options.output) {
          const outputPath = resolve(options.output);
          writeFileSync(outputPath, completionScript);
          
          if (options.output === 'json') {
            console.log(JSON.stringify({
              shell,
              outputFile: outputPath,
              generated: true
            }, null, 2));
          } else {
            logger.info(chalk.green(`Completion script written to: ${outputPath}`));
            logger.info(chalk.blue('To enable completions, source this file in your shell configuration.'));
          }
        } else {
          console.log(completionScript);
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Install completion
  completionCommand
    .command('install')
    .description('Install completion script for current shell')
    .option('-s, --shell <shell>', 'shell type (auto-detect if not specified)')
    .action(async (options: CompletionInstallOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const shell = options.shell || detectCurrentShell();
        
        if (!shell) {
          throw new TriliumError('Could not detect shell. Please specify with --shell option.');
        }
        
        logger.info(`Installing ${shell} completion...`);
        
        const completionScript = generateCompletionScript(shell);
        const installPath = getShellCompletionPath(shell);
        
        // Create directory if it doesn't exist
        const dir = join(installPath, '..');
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        
        writeFileSync(installPath, completionScript);
        
        const output = formatOutput([{
          shell,
          installPath,
          installed: true
        }], options.output, ['shell', 'installPath', 'installed']);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Completion installed for ${shell}`));
          logger.info(chalk.blue('Restart your shell or run:'));
          logger.info(chalk.blue(`  source ${installPath}`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Cache management
  const cacheCommand = completionCommand
    .command('cache')
    .description('Manage completion cache');

  // Clear cache
  cacheCommand
    .command('clear')
    .description('Clear completion cache')
    .action(async (options: CompletionCacheClearOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const cacheDir = getCompletionCacheDir();
        
        if (existsSync(cacheDir)) {
          const { rimraf } = await import('rimraf');
          await rimraf(cacheDir);
          
          if (options.output === 'json') {
            console.log(JSON.stringify({ cleared: true, cacheDir }, null, 2));
          } else {
            logger.info(chalk.green('Completion cache cleared'));
          }
        } else {
          if (options.output === 'json') {
            console.log(JSON.stringify({ cleared: false, message: 'No cache found' }, null, 2));
          } else {
            logger.info(chalk.yellow('No completion cache found'));
          }
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Cache status
  cacheCommand
    .command('status')
    .description('Show cache status')
    .action(async (options: CompletionCacheStatusOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const cacheDir = getCompletionCacheDir();
        const cacheExists = existsSync(cacheDir);
        
        let cacheInfo: any = {
          exists: cacheExists,
          cacheDir
        };
        
        if (cacheExists) {
          const { readdirSync, statSync } = await import('fs');
          const files = readdirSync(cacheDir);
          
          cacheInfo = {
            ...cacheInfo,
            files: files.length,
            lastModified: Math.max(
              ...files.map(f => statSync(join(cacheDir, f)).mtime.getTime())
            ),
            size: files.reduce((total, f) => total + statSync(join(cacheDir, f)).size, 0)
          };
        }
        
        const output = formatOutput([cacheInfo], options.output, [
          'exists', 'files', 'size', 'lastModified', 'cacheDir'
        ]);
        console.log(output);
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });

  // Refresh cache
  cacheCommand
    .command('refresh')
    .description('Refresh cache for specific completion type')
    .argument('<type>', 'completion type (notes, profiles, commands, etc.)')
    .action(async (completionType: string, options: CompletionCacheRefreshOptions) => {
      const logger = createLogger(options.verbose);
      
      try {
        const validTypes = ['notes', 'profiles', 'commands', 'templates', 'tags'];
        if (!validTypes.includes(completionType)) {
          throw new TriliumError(`Invalid completion type: ${completionType}. Valid types: ${validTypes.join(', ')}`);
        }
        
        const client = await createTriliumClient(options);
        
        logger.info(`Refreshing ${completionType} completion cache...`);
        
        let data: string[] = [];
        
        switch (completionType) {
          case 'notes':
            const notes = await client.searchNotes('');
            data = notes.map(note => `${note.noteId}:${note.title}`);
            break;
          case 'profiles':
            const config = new Config();
            await config.load();
            data = Object.keys(config.profiles);
            break;
          case 'commands':
            data = getAllCommandNames();
            break;
          case 'templates':
            const templates = await client.getTemplates();
            data = templates.map(t => `${t.noteId}:${t.title}`);
            break;
          case 'tags':
            const tags = await client.getTags({});
            data = tags.map(t => t.name);
            break;
        }
        
        await saveCompletionCache(completionType, data);
        
        const output = formatOutput([{
          type: completionType,
          items: data.length,
          refreshed: true
        }], options.output, ['type', 'items', 'refreshed']);
        console.log(output);
        
        if (options.output === 'table') {
          logger.info(chalk.green(`Refreshed ${completionType} cache with ${data.length} items`));
        }
        
      } catch (error) {
        handleCliError(error, logger);
      }
    });
}

/**
 * Generate completion script for specified shell
 */
function generateCompletionScript(shell: string): string {
  const programName = 'trilium';
  
  switch (shell) {
    case 'bash':
      return `# Trilium CLI completion for Bash
_trilium_completions() {
  local cur prev words cword
  _init_completion || return
  
  case "\${prev}" in
    --config|-c)
      _filedir
      return
      ;;
    --profile|-p)
      COMPREPLY=( $(compgen -W "$(trilium completion cache refresh profiles 2>/dev/null || echo '')" -- "\${cur}") )
      return
      ;;
    --output|-o)
      COMPREPLY=( $(compgen -W "json table plain" -- "\${cur}") )
      return
      ;;
  esac
  
  if [[ "\${cur}" == -* ]]; then
    COMPREPLY=( $(compgen -W "--help --version --config --profile --server-url --api-token --verbose --output" -- "\${cur}") )
  else
    local commands="tui config profile note search branch attribute attachment backup info calendar pipe link tag template quick import-obsidian export-obsidian import-notion export-notion import-dir sync-git plugin completion"
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  fi
}

complete -F _trilium_completions ${programName}
`;

    case 'zsh':
      return `# Trilium CLI completion for Zsh
#compdef ${programName}

_trilium() {
  local context state line
  
  _arguments -C \\
    '(--help -h)'{--help,-h}'[Show help]' \\
    '(--version -v)'{--version,-v}'[Show version]' \\
    '(--config -c)'{--config,-c}'[Configuration file]:file:_files' \\
    '(--profile -p)'{--profile,-p}'[Profile name]:profile:_trilium_profiles' \\
    '--server-url[Server URL]:url:' \\
    '--api-token[API token]:token:' \\
    '--verbose[Verbose output]' \\
    '(--output -o)'{--output,-o}'[Output format]:format:(json table plain)' \\
    '1: :_trilium_commands' \\
    '*:: :->args'
}

_trilium_commands() {
  local -a commands
  commands=(
    'tui:Interactive TUI mode'
    'config:Configure the CLI'
    'profile:Profile management'
    'note:Note operations'
    'search:Search notes'
    'branch:Branch operations'
    'attribute:Attribute operations'
    'attachment:Attachment operations'
    'backup:Create backup'
    'info:Get app info'
    'calendar:Calendar operations'
    'pipe:Pipe content to create note'
    'link:Link management'
    'tag:Tag management'
    'template:Template management'
    'quick:Quick capture'
    'plugin:Plugin management'
    'completion:Shell completion'
  )
  _describe 'command' commands
}

_trilium_profiles() {
  local -a profiles
  profiles=(\${(f)"$(trilium completion cache refresh profiles 2>/dev/null || echo '')"})
  _describe 'profile' profiles
}

_trilium "\$@"
`;

    case 'fish':
      return `# Trilium CLI completion for Fish
complete -c ${programName} -f

# Global options
complete -c ${programName} -s h -l help -d "Show help"
complete -c ${programName} -s v -l version -d "Show version"
complete -c ${programName} -s c -l config -d "Configuration file" -r
complete -c ${programName} -s p -l profile -d "Profile name"
complete -c ${programName} -l server-url -d "Server URL"
complete -c ${programName} -l api-token -d "API token"
complete -c ${programName} -l verbose -d "Verbose output"
complete -c ${programName} -s o -l output -d "Output format" -xa "json table plain"

# Commands
complete -c ${programName} -n "__fish_use_subcommand" -xa "tui config profile note search branch attribute attachment backup info calendar pipe link tag template quick plugin completion"

# Command descriptions
complete -c ${programName} -n "__fish_use_subcommand" -xa "tui" -d "Interactive TUI mode"
complete -c ${programName} -n "__fish_use_subcommand" -xa "config" -d "Configure the CLI"
complete -c ${programName} -n "__fish_use_subcommand" -xa "profile" -d "Profile management"
complete -c ${programName} -n "__fish_use_subcommand" -xa "note" -d "Note operations"
complete -c ${programName} -n "__fish_use_subcommand" -xa "search" -d "Search notes"
`;

    case 'powershell':
      return `# Trilium CLI completion for PowerShell
Register-ArgumentCompleter -Native -CommandName ${programName} -ScriptBlock {
    param($commandName, $wordToComplete, $cursorPosition)
    
    $commands = @(
        'tui', 'config', 'profile', 'note', 'search', 'branch', 
        'attribute', 'attachment', 'backup', 'info', 'calendar', 
        'pipe', 'link', 'tag', 'template', 'quick', 'plugin', 'completion'
    )
    
    $commands | Where-Object { \$_ -like "*\$wordToComplete*" } | 
        ForEach-Object { [System.Management.Automation.CompletionResult]::new(\$_, \$_, 'ParameterValue', \$_) }
}
`;

    case 'elvish':
      return `# Trilium CLI completion for Elvish
use builtin
use str

set edit:completion:arg-completer[${programName}] = {|@args|
  var commands = [
    tui config profile note search branch attribute attachment 
    backup info calendar pipe link tag template quick plugin completion
  ]
  
  if (== (count \$args) 2) {
    put \$@commands
  }
}
`;

    default:
      throw new TriliumError(`Unsupported shell: ${shell}`);
  }
}

/**
 * Detect current shell
 */
function detectCurrentShell(): string | null {
  const shell = process.env.SHELL;
  if (!shell) return null;
  
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('fish')) return 'fish';
  if (shell.includes('elvish')) return 'elvish';
  
  return null;
}

/**
 * Get shell completion installation path
 */
function getShellCompletionPath(shell: string): string {
  const home = homedir();
  
  switch (shell) {
    case 'bash':
      return join(home, '.bash_completion.d', 'trilium');
    case 'zsh':
      return join(home, '.zsh', 'completions', '_trilium');
    case 'fish':
      return join(home, '.config', 'fish', 'completions', 'trilium.fish');
    default:
      return join(home, `.${shell}_completions`, 'trilium');
  }
}

/**
 * Get completion cache directory
 */
function getCompletionCacheDir(): string {
  const home = homedir();
  return join(home, '.trilium-cli', 'completion-cache');
}

/**
 * Save completion cache
 */
async function saveCompletionCache(type: string, data: string[]): Promise<void> {
  const cacheDir = getCompletionCacheDir();
  const cacheFile = join(cacheDir, `${type}.json`);
  
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  
  const cacheData = {
    type,
    data,
    timestamp: Date.now()
  };
  
  writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
}

/**
 * Get all command names for completion
 */
function getAllCommandNames(): string[] {
  return [
    'tui', 'config', 'profile', 'note', 'search', 'branch',
    'attribute', 'attachment', 'backup', 'info', 'calendar',
    'pipe', 'link', 'tag', 'template', 'quick',
    'import-obsidian', 'export-obsidian', 'import-notion', 'export-notion',
    'import-dir', 'sync-git', 'plugin', 'completion'
  ];
}