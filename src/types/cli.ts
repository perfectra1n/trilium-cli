import type { OutputFormat } from './common.js';

/**
 * Global CLI options available to all commands
 */
export interface GlobalOptions {
  config?: string;
  profile?: string;
  serverUrl?: string;
  apiToken?: string;
  verbose?: boolean;
  debug?: boolean;
  output: OutputFormat;
}

/**
 * Base command options that extend global options
 */
export interface BaseCommandOptions extends GlobalOptions {
  // Additional base options can be added here
}

/**
 * TUI-specific options
 */
export interface TUIOptions {
  theme?: string;
  keyBindings?: 'default' | 'vim' | 'emacs';
  refreshInterval?: number;
}

// Config Command Options
export interface ConfigInitOptions extends BaseCommandOptions {}
export interface ConfigShowOptions extends BaseCommandOptions {}
export interface ConfigSetOptions extends BaseCommandOptions {
  key: string;
  value: string;
}

// Profile Command Options
export interface ProfileListOptions extends BaseCommandOptions {
  detailed?: boolean;
}
export interface ProfileShowOptions extends BaseCommandOptions {
  name?: string;
}
export interface ProfileCreateOptions extends BaseCommandOptions {
  name: string;
  description?: string;
  from?: string;
  setCurrent?: boolean;
}
export interface ProfileDeleteOptions extends BaseCommandOptions {
  name: string;
  force?: boolean;
}
export interface ProfileSetOptions extends BaseCommandOptions {
  name: string;
}
export interface ProfileCopyOptions extends BaseCommandOptions {
  from: string;
  to: string;
  overwrite?: boolean;
}
export interface ProfileConfigureOptions extends BaseCommandOptions {
  profile?: string;
  key?: string;
  value?: string;
  interactive?: boolean;
}

// Note Command Options
export interface NoteCreateOptions extends BaseCommandOptions {
  title: string;
  content?: string;
  noteType?: string;
  parent?: string;
  edit?: boolean;
}
export interface NoteGetOptions extends BaseCommandOptions {
  ownerId: string;
  content?: boolean;
}
export interface NoteUpdateOptions extends BaseCommandOptions {
  ownerId: string;
  title?: string;
  content?: string;
  edit?: boolean;
}
export interface NoteDeleteOptions extends BaseCommandOptions {
  ownerId: string;
  force?: boolean;
}
export interface NoteListOptions extends BaseCommandOptions {
  parentId?: string;
  tree?: boolean;
  depth?: number;
}
export interface NoteExportOptions extends BaseCommandOptions {
  ownerId: string;
  format?: string;
  output?: string;
}
export interface NoteImportOptions extends BaseCommandOptions {
  file: string;
  parent?: string;
  format?: string;
}
export interface NoteMoveOptions extends BaseCommandOptions {
  ownerId: string;
  parentId: string;
}
export interface NoteCloneOptions extends BaseCommandOptions {
  ownerId: string;
  cloneType?: string;
}

// Search Command Options
export interface SearchOptions extends BaseCommandOptions {
  query: string;
  limit?: number;
  fast?: boolean;
  archived?: boolean;
  regex?: boolean;
  context?: number;
  content?: boolean;
  highlight?: boolean;
}

// Branch Command Options
export interface BranchCreateOptions extends BaseCommandOptions {
  ownerId: string;
  parentId: string;
  position?: number;
  prefix?: string;
}
export interface BranchListOptions extends BaseCommandOptions {
  ownerId: string;
}
export interface BranchUpdateOptions extends BaseCommandOptions {
  branchId: string;
  position?: number;
  prefix?: string;
  expanded?: boolean;
}
export interface BranchDeleteOptions extends BaseCommandOptions {
  branchId: string;
  force?: boolean;
}

// Attribute Command Options
export interface AttributeCreateOptions extends BaseCommandOptions {
  ownerId: string;
  attrType: string;
  name: string;
  value?: string;
  inheritable?: boolean;
}
export interface AttributeListOptions extends BaseCommandOptions {
  ownerId: string;
}
export interface AttributeUpdateOptions extends BaseCommandOptions {
  attributeId: string;
  value?: string;
  inheritable?: boolean;
}
export interface AttributeDeleteOptions extends BaseCommandOptions {
  attributeId: string;
  force?: boolean;
}

// Attachment Command Options
export interface AttachmentUploadOptions extends BaseCommandOptions {
  ownerId: string;
  file: string;
  title?: string;
}
export interface AttachmentDownloadOptions extends BaseCommandOptions {
  attachmentId: string;
  output?: string;
}
export interface AttachmentListOptions extends BaseCommandOptions {
  ownerId: string;
}
export interface AttachmentInfoOptions extends BaseCommandOptions {
  attachmentId: string;
}
export interface AttachmentDeleteOptions extends BaseCommandOptions {
  attachmentId: string;
  force?: boolean;
}

// Backup Command Options
export interface BackupOptions extends BaseCommandOptions {
  name?: string;
}

// Calendar Command Options
export interface CalendarOptions extends BaseCommandOptions {
  date: string;
  create?: boolean;
}

// Pipe Command Options
export interface PipeOptions extends BaseCommandOptions {
  title?: string;
  parent?: string;
  noteType?: string;
  format?: string;
  tags?: string;
  labels?: string;
  attributes?: string[];
  appendTo?: string;
  template?: string;
  batchDelimiter?: string;
  language?: string;
  stripHtml?: boolean;
  extractTitle?: boolean;
  quiet?: boolean;
}

// Link Command Options
export interface LinkBacklinksOptions extends BaseCommandOptions {
  ownerId: string;
  context?: boolean;
}
export interface LinkOutgoingOptions extends BaseCommandOptions {
  ownerId: string;
}
export interface LinkBrokenOptions extends BaseCommandOptions {
  noteId?: string;
  fix?: boolean;
}
export interface LinkUpdateOptions extends BaseCommandOptions {
  oldTarget: string;
  newTarget: string;
  dryRun?: boolean;
}
export interface LinkValidateOptions extends BaseCommandOptions {
  ownerId: string;
}

// Tag Command Options
export interface TagListOptions extends BaseCommandOptions {
  pattern?: string;
  tree?: boolean;
  counts?: boolean;
}
export interface TagSearchOptions extends BaseCommandOptions {
  pattern: string;
  includeChildren?: boolean;
  limit?: number;
}
export interface TagCloudOptions extends BaseCommandOptions {
  minCount?: number;
  maxTags?: number;
}
export interface TagAddOptions extends BaseCommandOptions {
  ownerId: string;
  tag: string;
}
export interface TagRemoveOptions extends BaseCommandOptions {
  ownerId: string;
  tag: string;
}
export interface TagRenameOptions extends BaseCommandOptions {
  oldTag: string;
  newTag: string;
  dryRun?: boolean;
}

// Template Command Options
export interface TemplateListOptions extends BaseCommandOptions {
  detailed?: boolean;
}
export interface TemplateCreateOptions extends BaseCommandOptions {
  title: string;
  content?: string;
  description?: string;
  edit?: boolean;
}
export interface TemplateShowOptions extends BaseCommandOptions {
  template: string;
  variables?: boolean;
}
export interface TemplateUseOptions extends BaseCommandOptions {
  template: string;
  parent?: string;
  variables?: string[];
  interactive?: boolean;
  edit?: boolean;
}
export interface TemplateUpdateOptions extends BaseCommandOptions {
  templateId: string;
  title?: string;
  description?: string;
  edit?: boolean;
}
export interface TemplateDeleteOptions extends BaseCommandOptions {
  templateId: string;
  force?: boolean;
}
export interface TemplateValidateOptions extends BaseCommandOptions {
  template: string;
}

// Quick Command Options
export interface QuickOptions extends BaseCommandOptions {
  content?: string;
  title?: string;
  tags?: string;
  format?: string;
  batch?: string;
  quiet?: boolean;
  inbox?: string;
}

// Import/Export Command Options
export interface ImportObsidianOptions extends BaseCommandOptions {
  vaultPath: string;
  parent?: string;
  dryRun?: boolean;
}
export interface ExportObsidianOptions extends BaseCommandOptions {
  ownerId: string;
  vaultPath: string;
  dryRun?: boolean;
}
export interface ImportNotionOptions extends BaseCommandOptions {
  zipPath: string;
  parent?: string;
  dryRun?: boolean;
}
export interface ExportNotionOptions extends BaseCommandOptions {
  ownerId: string;
  outputPath: string;
  dryRun?: boolean;
}
export interface ImportDirOptions extends BaseCommandOptions {
  dirPath: string;
  parent?: string;
  maxDepth?: number;
  patterns?: string[];
  dryRun?: boolean;
}
export interface SyncGitOptions extends BaseCommandOptions {
  repoPath: string;
  noteId?: string;
  branch?: string;
  operation?: string;
  dryRun?: boolean;
}

// Plugin Command Options
export interface PluginListOptions extends BaseCommandOptions {
  detailed?: boolean;
  capability?: string;
}
export interface PluginInstallOptions extends BaseCommandOptions {
  source: string;
  force?: boolean;
  trust?: boolean;
}
export interface PluginUninstallOptions extends BaseCommandOptions {
  name: string;
  force?: boolean;
}
export interface PluginEnableOptions extends BaseCommandOptions {
  name: string;
}
export interface PluginDisableOptions extends BaseCommandOptions {
  name: string;
}
export interface PluginInfoOptions extends BaseCommandOptions {
  name: string;
}
export interface PluginRunOptions extends BaseCommandOptions {
  plugin: string;
  command: string;
  args?: string[];
}

// Completion Command Options
export interface CompletionGenerateOptions extends BaseCommandOptions {
  shell: string;
  output?: string;
}
export interface CompletionInstallOptions extends BaseCommandOptions {
  shell?: string;
}
export interface CompletionCacheClearOptions extends BaseCommandOptions {}
export interface CompletionCacheStatusOptions extends BaseCommandOptions {}
export interface CompletionCacheRefreshOptions extends BaseCommandOptions {
  completionType: string;
}