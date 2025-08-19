/**
 * Configuration types for the Trilium CLI
 */

/**
 * Profile configuration for connecting to a Trilium instance
 */
export interface Profile {
  name: string;
  serverUrl: string;
  apiToken: string;
  description?: string;
  created?: string;
  lastUsed?: string;
  isDefault?: boolean;
}

/**
 * Import/Export configuration
 */
export interface ImportExportConfig {
  defaultImportParent?: string;
  preserveHierarchy: boolean;
  handleDuplicates: 'skip' | 'overwrite' | 'rename';
  maxFileSize: number;
  supportedFormats: string[];
}

/**
 * Editor configuration
 */
export interface EditorConfig {
  command: string;
  args: string[];
  tempDir?: string;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file?: string;
  maxSize?: string;
  maxFiles?: number;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  enabled: boolean;
  paths: string[];
  autoLoad: boolean;
}

/**
 * Main configuration interface
 */
export interface ConfigData {
  version: string;
  currentProfile?: string;
  profiles: Profile[];
  importExport: ImportExportConfig;
  editor: EditorConfig;
  logging: LoggingConfig;
  plugins: PluginConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ConfigData = {
  version: '1.0.0',
  profiles: [],
  importExport: {
    preserveHierarchy: true,
    handleDuplicates: 'skip' as const,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    supportedFormats: ['md', 'html', 'txt', 'json'],
  },
  editor: {
    command: process.env.EDITOR || 'nano',
    args: [],
  },
  logging: {
    level: 'info' as const,
  },
  plugins: {
    enabled: true,
    paths: [],
    autoLoad: false,
  },
};