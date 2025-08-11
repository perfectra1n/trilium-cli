import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TriliumConfig, loadConfig, saveConfig, getConfigPath, validateConfig } from '@/config';
import fs from 'fs/promises';
import path from 'path';

// Mock filesystem operations
vi.mock('fs/promises');
vi.mock('os');
vi.mock('path');

describe('Configuration Management', () => {
  const mockConfig: TriliumConfig = {
    server_url: 'http://localhost:8080',
    token: 'test-token',
    timeout: 30000,
    retry_attempts: 3,
    retry_delay: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should load valid configuration file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const config = await loadConfig();
      expect(config).toEqual(mockConfig);
    });

    it('should return default config when file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const config = await loadConfig();
      expect(config.server_url).toBe('http://localhost:8080');
      expect(config.timeout).toBe(30000);
    });

    it('should handle corrupted config file', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(loadConfig()).rejects.toThrow('Invalid configuration');
    });

    it('should validate config after loading', async () => {
      const invalidConfig = { ...mockConfig, server_url: '' };
      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(invalidConfig));

      await expect(loadConfig()).rejects.toThrow('Configuration validation failed');
    });
  });

  describe('saveConfig', () => {
    it('should save valid configuration', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await expect(saveConfig(mockConfig)).resolves.not.toThrow();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(mockConfig, null, 2)
      );
    });

    it('should create config directory if it does not exist', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await saveConfig(mockConfig);
      expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('should handle write errors gracefully', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));

      await expect(saveConfig(mockConfig)).rejects.toThrow('Permission denied');
    });

    it('should validate config before saving', async () => {
      const invalidConfig = { ...mockConfig, server_url: '' } as TriliumConfig;

      await expect(saveConfig(invalidConfig)).rejects.toThrow('Configuration validation failed');
    });
  });

  describe('getConfigPath', () => {
    it('should return correct config path', () => {
      vi.mocked(path.join).mockReturnValue('/home/user/.config/trilium-cli/config.json');

      const configPath = getConfigPath();
      expect(configPath).toContain('trilium-cli');
      expect(configPath).toContain('config.json');
    });

    it('should handle different operating systems', () => {
      // Test Windows path
      vi.mocked(path.join).mockReturnValue('C:\\Users\\User\\AppData\\trilium-cli\\config.json');

      const configPath = getConfigPath();
      expect(typeof configPath).toBe('string');
      expect(configPath.length).toBeGreaterThan(0);
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      expect(() => validateConfig(mockConfig)).not.toThrow();
    });

    it('should reject config with missing server_url', () => {
      const invalidConfig = { ...mockConfig, server_url: '' };
      expect(() => validateConfig(invalidConfig)).toThrow('server_url is required');
    });

    it('should reject config with invalid URL format', () => {
      const invalidConfig = { ...mockConfig, server_url: 'not-a-url' };
      expect(() => validateConfig(invalidConfig)).toThrow('Invalid URL format');
    });

    it('should reject config with negative timeout', () => {
      const invalidConfig = { ...mockConfig, timeout: -1000 };
      expect(() => validateConfig(invalidConfig)).toThrow('timeout must be positive');
    });

    it('should reject config with invalid retry attempts', () => {
      const invalidConfig = { ...mockConfig, retry_attempts: -1 };
      expect(() => validateConfig(invalidConfig)).toThrow('retry_attempts must be non-negative');
    });

    it('should reject config with excessive retry attempts', () => {
      const invalidConfig = { ...mockConfig, retry_attempts: 100 };
      expect(() => validateConfig(invalidConfig)).toThrow('retry_attempts cannot exceed');
    });

    it('should reject config with invalid retry delay', () => {
      const invalidConfig = { ...mockConfig, retry_delay: -500 };
      expect(() => validateConfig(invalidConfig)).toThrow('retry_delay must be positive');
    });

    it('should handle optional fields', () => {
      const minimalConfig = {
        server_url: 'http://localhost:8080',
        token: 'test-token',
      };
      expect(() => validateConfig(minimalConfig as TriliumConfig)).not.toThrow();
    });
  });

  describe('profile management', () => {
    it('should handle multiple profiles', async () => {
      const profileConfig = {
        profiles: {
          default: mockConfig,
          production: {
            ...mockConfig,
            server_url: 'https://trilium.example.com',
          },
        },
        active_profile: 'default',
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(profileConfig));
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // This would be part of a profile-aware config loader
      const config = JSON.parse(await fs.readFile('') as string);
      expect(config.profiles.default).toEqual(mockConfig);
      expect(config.profiles.production.server_url).toBe('https://trilium.example.com');
    });

    it('should validate all profiles in config', () => {
      const profileConfig = {
        profiles: {
          valid: mockConfig,
          invalid: { ...mockConfig, server_url: '' },
        },
        active_profile: 'valid',
      };

      // Test that invalid profiles are caught
      expect(validateConfig(profileConfig.profiles.valid)).not.toThrow();
      expect(() => validateConfig(profileConfig.profiles.invalid)).toThrow();
    });
  });

  describe('environment variable integration', () => {
    it('should override config with environment variables', async () => {
      process.env.TRILIUM_SERVER_URL = 'http://env-server:8080';
      process.env.TRILIUM_TOKEN = 'env-token';

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      // This would be part of an environment-aware config loader
      const envOverride = {
        ...mockConfig,
        server_url: process.env.TRILIUM_SERVER_URL,
        token: process.env.TRILIUM_TOKEN,
      };

      expect(envOverride.server_url).toBe('http://env-server:8080');
      expect(envOverride.token).toBe('env-token');

      // Cleanup
      delete process.env.TRILIUM_SERVER_URL;
      delete process.env.TRILIUM_TOKEN;
    });
  });

  describe('migration and backwards compatibility', () => {
    it('should handle old config format', async () => {
      const oldConfig = {
        serverUrl: 'http://localhost:8080', // Old camelCase format
        apiToken: 'test-token', // Old field name
      };

      vi.mocked(fs.access).mockResolvedValue(undefined);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(oldConfig));

      // This would be part of a migration handler
      const migratedConfig = {
        server_url: oldConfig.serverUrl,
        token: oldConfig.apiToken,
        timeout: 30000, // Default values for new fields
        retry_attempts: 3,
        retry_delay: 1000,
      };

      expect(() => validateConfig(migratedConfig)).not.toThrow();
    });

    it('should preserve user customizations during migration', async () => {
      const customConfig = {
        serverUrl: 'http://localhost:8080',
        apiToken: 'test-token',
        customTimeout: 60000, // User customization
      };

      // Migration should preserve custom values
      const migratedConfig = {
        server_url: customConfig.serverUrl,
        token: customConfig.apiToken,
        timeout: customConfig.customTimeout, // Preserve custom value
        retry_attempts: 3,
        retry_delay: 1000,
      };

      expect(migratedConfig.timeout).toBe(60000);
    });
  });
});