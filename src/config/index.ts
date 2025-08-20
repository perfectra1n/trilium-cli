import { homedir } from 'os';
import path from 'path';

import Conf from 'conf';

import { ConfigError } from '../error.js';
import type { ConfigData, Profile, EditorConfig } from '../types/config.js';
import { DEFAULT_CONFIG } from '../types/config.js';
import { isValidArray, getFirstElement } from '../utils/type-guards.js';
import { validateUrl, validateEntityId } from '../utils/validation.js';

/**
 * Configuration manager for the Trilium CLI
 */
export class Config {
  private store: Conf<ConfigData>;
  private data: ConfigData;

  constructor(configPath?: string) {
    const defaultConfigPath = path.join(homedir(), '.trilium-cli');
    
    this.store = new Conf<ConfigData>({
      projectName: 'trilium-cli-ts',
      configName: 'config',
      cwd: configPath ? path.dirname(configPath) : defaultConfigPath,
      defaults: DEFAULT_CONFIG as ConfigData,
      schema: {
        version: { type: 'string' },
        currentProfile: { type: 'string' },
        profiles: { type: 'array' },
      } as any,
    });

    this.data = this.store.store;
  }

  /**
   * Load configuration from disk
   */
  async load(): Promise<void> {
    this.data = this.store.store;
  }

  /**
   * Save configuration to disk
   */
  async save(): Promise<void> {
    this.store.store = this.data;
  }

  /**
   * Get all profiles
   */
  getProfiles(): Profile[] {
    return this.data.profiles;
  }

  /**
   * Get current profile
   */
  getCurrentProfile(): Profile {
    const profileName = this.data.currentProfile;
    if (!profileName) {
      // Return first profile or throw if none exists
      if (!isValidArray(this.data.profiles)) {
        throw new ConfigError('No profiles configured. Please add a profile first.');
      }
      return getFirstElement(this.data.profiles, 'No profiles configured. Please add a profile first.');
    }

    const profile = this.data.profiles.find(p => p.name === profileName);
    if (!profile) {
      throw new ConfigError(`Profile '${profileName}' not found`);
    }

    return profile;
  }

  /**
   * Set current profile
   */
  setCurrentProfile(name: string): void {
    const profile = this.data.profiles.find(p => p.name === name);
    if (!profile) {
      throw new ConfigError(`Profile '${name}' not found`);
    }

    this.data.currentProfile = name;
  }
  
  /**
   * Get editor configuration
   */
  getEditorConfig(): EditorConfig {
    return this.data.editor || DEFAULT_CONFIG.editor;
  }
  
  /**
   * Set editor configuration
   */
  setEditorConfig(config: Partial<EditorConfig>): void {
    this.data.editor = {
      ...this.data.editor,
      ...config
    };
  }

  /**
   * Add or update a profile
   */
  setProfile(profile: Profile): void {
    // Validate profile data
    validateUrl(profile.serverUrl, 'serverUrl');
    
    // No token format validation - tokens can have various formats

    const existingIndex = this.data.profiles.findIndex(p => p.name === profile.name);
    
    if (existingIndex >= 0) {
      this.data.profiles[existingIndex] = profile;
    } else {
      this.data.profiles.push(profile);
    }

    // Set as current profile if it's the first one or marked as default
    if (this.data.profiles.length === 1 || profile.isDefault) {
      this.data.currentProfile = profile.name;
    }
  }

  /**
   * Remove a profile
   */
  removeProfile(name: string): void {
    const index = this.data.profiles.findIndex(p => p.name === name);
    if (index === -1) {
      throw new ConfigError(`Profile '${name}' not found`);
    }

    this.data.profiles.splice(index, 1);

    // Update current profile if needed
    if (this.data.currentProfile === name) {
      if (isValidArray(this.data.profiles)) {
        const firstProfile = getFirstElement(this.data.profiles, 'No profiles available after removal');
        this.data.currentProfile = firstProfile.name;
      } else {
        this.data.currentProfile = undefined;
      }
    }
  }

  /**
   * Get configuration data
   */
  getData(): ConfigData {
    return { ...this.data };
  }

  /**
   * Update configuration data
   */
  setData(data: Partial<ConfigData>): void {
    this.data = { ...this.data, ...data };
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.store.clear();
    this.data = { ...DEFAULT_CONFIG };
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string {
    return this.store.path;
  }
}

// Re-export types
export * from '../types/config.js';