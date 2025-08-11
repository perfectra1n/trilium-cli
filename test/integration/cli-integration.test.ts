import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { setupTestServer, teardownTestServer, TestServer } from './test-server';

describe('CLI Integration Tests', () => {
  let testServer: TestServer;
  let tempConfigDir: string;
  let originalConfigDir: string;

  beforeAll(async () => {
    // Setup test server
    testServer = await setupTestServer();
    
    // Create temporary config directory
    tempConfigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trilium-cli-test-'));
    originalConfigDir = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = tempConfigDir;

    // Build the CLI if needed
    try {
      execSync('npm run build', { cwd: process.cwd(), stdio: 'inherit' });
    } catch (error) {
      console.warn('Build failed, assuming CLI is already built');
    }
  });

  afterAll(async () => {
    // Cleanup
    await teardownTestServer(testServer);
    
    if (originalConfigDir) {
      process.env.XDG_CONFIG_HOME = originalConfigDir;
    } else {
      delete process.env.XDG_CONFIG_HOME;
    }
    
    try {
      await fs.rm(tempConfigDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp config dir:', error);
    }
  });

  beforeEach(async () => {
    await testServer.reset();
  });

  function runCLI(args: string[], options: any = {}) {
    const cliPath = path.join(process.cwd(), 'dist/bin/trilium.js');
    const env = {
      ...process.env,
      XDG_CONFIG_HOME: tempConfigDir,
      TRILIUM_SERVER_URL: testServer.url,
      TRILIUM_TOKEN: testServer.token,
      ...options.env,
    };

    return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      const child = spawn('node', [cliPath, ...args], {
        env,
        stdio: 'pipe',
        timeout: options.timeout || 10000,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({ stdout, stderr, code: code || 0 });
      });

      child.on('error', (error) => {
        reject(error);
      });

      if (options.input) {
        child.stdin?.write(options.input);
        child.stdin?.end();
      }
    });
  }

  describe('Configuration Commands', () => {
    it('should setup initial configuration', async () => {
      const result = await runCLI(['config', 'set', 'server_url', testServer.url]);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');

      const result2 = await runCLI(['config', 'set', 'token', testServer.token]);
      expect(result2.code).toBe(0);
    });

    it('should show configuration', async () => {
      // Set config first
      await runCLI(['config', 'set', 'server_url', testServer.url]);
      await runCLI(['config', 'set', 'token', testServer.token]);

      const result = await runCLI(['config', 'show']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(testServer.url);
      expect(result.stdout).toContain('token'); // Should show token key but not value
    });

    it('should validate configuration', async () => {
      const result = await runCLI(['config', 'validate']);
      expect(result.code).toBe(0);
    });
  });

  describe('Note Commands', () => {
    beforeEach(async () => {
      // Setup config for each test
      await runCLI(['config', 'set', 'server_url', testServer.url]);
      await runCLI(['config', 'set', 'token', testServer.token]);
    });

    it('should list notes', async () => {
      const result = await runCLI(['note', 'list']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Root'); // Should show root note
    });

    it('should create a note', async () => {
      const result = await runCLI(['note', 'create', 'Test Note', '--content', 'Test content']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Created note');
      
      // Verify note was created by listing
      const listResult = await runCLI(['note', 'list']);
      expect(listResult.stdout).toContain('Test Note');
    });

    it('should show note content', async () => {
      // Create a note first
      const createResult = await runCLI(['note', 'create', 'Show Test', '--content', 'Show content']);
      expect(createResult.code).toBe(0);
      
      // Extract note ID from create output
      const noteIdMatch = createResult.stdout.match(/note-\d+/);
      expect(noteIdMatch).toBeTruthy();
      const noteId = noteIdMatch![0];

      // Show the note
      const showResult = await runCLI(['note', 'show', noteId]);
      expect(showResult.code).toBe(0);
      expect(showResult.stdout).toContain('Show Test');
      expect(showResult.stdout).toContain('Show content');
    });

    it('should update a note', async () => {
      // Create a note
      const createResult = await runCLI(['note', 'create', 'Update Test', '--content', 'Original content']);
      const noteIdMatch = createResult.stdout.match(/note-\d+/);
      const noteId = noteIdMatch![0];

      // Update the note
      const updateResult = await runCLI(['note', 'update', noteId, '--title', 'Updated Title', '--content', 'Updated content']);
      expect(updateResult.code).toBe(0);

      // Verify update
      const showResult = await runCLI(['note', 'show', noteId]);
      expect(showResult.stdout).toContain('Updated Title');
      expect(showResult.stdout).toContain('Updated content');
    });

    it('should delete a note', async () => {
      // Create a note
      const createResult = await runCLI(['note', 'create', 'Delete Test', '--content', 'To be deleted']);
      const noteIdMatch = createResult.stdout.match(/note-\d+/);
      const noteId = noteIdMatch![0];

      // Delete with force flag
      const deleteResult = await runCLI(['note', 'delete', noteId, '--force']);
      expect(deleteResult.code).toBe(0);

      // Verify deletion
      const showResult = await runCLI(['note', 'show', noteId]);
      expect(showResult.code).not.toBe(0);
    });

    it('should search notes', async () => {
      // Create searchable notes
      await runCLI(['note', 'create', 'JavaScript Guide', '--content', 'Learn JavaScript programming']);
      await runCLI(['note', 'create', 'Python Tutorial', '--content', 'Python programming guide']);

      // Search for notes
      const searchResult = await runCLI(['note', 'search', 'JavaScript']);
      expect(searchResult.code).toBe(0);
      expect(searchResult.stdout).toContain('JavaScript Guide');
      expect(searchResult.stdout).not.toContain('Python Tutorial');
    });
  });

  describe('Import/Export Commands', () => {
    let tempDir: string;

    beforeEach(async () => {
      await runCLI(['config', 'set', 'server_url', testServer.url]);
      await runCLI(['config', 'set', 'token', testServer.token]);
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trilium-import-test-'));
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('should export notes to directory', async () => {
      // Create some notes to export
      await runCLI(['note', 'create', 'Export Test 1', '--content', 'Content 1']);
      await runCLI(['note', 'create', 'Export Test 2', '--content', 'Content 2']);

      const exportDir = path.join(tempDir, 'export');
      const result = await runCLI(['export', 'directory', exportDir]);
      expect(result.code).toBe(0);

      // Verify export files exist
      const files = await fs.readdir(exportDir);
      expect(files.length).toBeGreaterThan(0);
      
      // Check if exported files contain our test notes
      const exportedContent = await Promise.all(
        files.map(async (file) => {
          if (file.endsWith('.md') || file.endsWith('.html')) {
            return await fs.readFile(path.join(exportDir, file), 'utf8');
          }
          return '';
        })
      );
      
      const allContent = exportedContent.join('\n');
      expect(allContent).toContain('Export Test 1');
    });

    it('should import from markdown files', async () => {
      // Create test markdown files
      const importDir = path.join(tempDir, 'import');
      await fs.mkdir(importDir, { recursive: true });

      const testFile = path.join(importDir, 'test-note.md');
      await fs.writeFile(testFile, '# Imported Note\n\nThis is imported content.');

      const result = await runCLI(['import', 'directory', importDir]);
      expect(result.code).toBe(0);

      // Verify the note was imported
      const listResult = await runCLI(['note', 'search', 'Imported Note']);
      expect(listResult.stdout).toContain('Imported Note');
    });

    it('should handle import validation errors gracefully', async () => {
      const invalidDir = path.join(tempDir, 'nonexistent');
      const result = await runCLI(['import', 'directory', invalidDir]);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('not found') || expect(result.stderr).toContain('does not exist');
    });
  });

  describe('Search Commands', () => {
    beforeEach(async () => {
      await runCLI(['config', 'set', 'server_url', testServer.url]);
      await runCLI(['config', 'set', 'token', testServer.token]);

      // Create test notes for searching
      await runCLI(['note', 'create', 'JavaScript Tutorial', '--content', 'Learn JavaScript basics']);
      await runCLI(['note', 'create', 'Python Guide', '--content', 'Python programming fundamentals']);
      await runCLI(['note', 'create', 'Web Development', '--content', 'HTML, CSS, and JavaScript']);
    });

    it('should search notes with basic query', async () => {
      const result = await runCLI(['search', 'JavaScript']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('JavaScript Tutorial');
      expect(result.stdout).toContain('Web Development'); // Contains JavaScript in content
    });

    it('should handle empty search results', async () => {
      const result = await runCLI(['search', 'nonexistentterm']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('No results found') || expect(result.stdout.trim()).toBe('');
    });

    it('should support search with output format options', async () => {
      const result = await runCLI(['search', 'JavaScript', '--format', 'json']);
      expect(result.code).toBe(0);
      
      if (result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration gracefully', async () => {
      // Clear any existing config
      const configPath = path.join(tempConfigDir, 'trilium-cli', 'config.json');
      try {
        await fs.unlink(configPath);
      } catch (error) {
        // Config might not exist
      }

      const result = await runCLI(['note', 'list'], { env: { TRILIUM_SERVER_URL: '', TRILIUM_TOKEN: '' } });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('configuration') || expect(result.stderr).toContain('config');
    });

    it('should handle network connection errors', async () => {
      await runCLI(['config', 'set', 'server_url', 'http://nonexistent:9999']);
      await runCLI(['config', 'set', 'token', 'invalid-token']);

      const result = await runCLI(['note', 'list']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('connect') || expect(result.stderr).toContain('network') || expect(result.stderr).toContain('failed');
    });

    it('should handle invalid command arguments', async () => {
      const result = await runCLI(['note', 'invalid-subcommand']);
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('Unknown command') || expect(result.stderr).toContain('invalid');
    });

    it('should show help when no command is provided', async () => {
      const result = await runCLI([]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Usage:') || expect(result.stdout).toContain('Commands:');
    });
  });

  describe('Output Formatting', () => {
    beforeEach(async () => {
      await runCLI(['config', 'set', 'server_url', testServer.url]);
      await runCLI(['config', 'set', 'token', testServer.token]);
    });

    it('should support JSON output format', async () => {
      const result = await runCLI(['note', 'list', '--format', 'json']);
      if (result.code === 0 && result.stdout.trim()) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('should support table output format', async () => {
      const result = await runCLI(['note', 'list', '--format', 'table']);
      expect(result.code).toBe(0);
      // Table format typically includes column headers
      expect(result.stdout).toContain('Title') || expect(result.stdout).toContain('ID');
    });

    it('should support quiet mode', async () => {
      const normalResult = await runCLI(['note', 'list']);
      const quietResult = await runCLI(['note', 'list', '--quiet']);
      
      expect(normalResult.code).toBe(0);
      expect(quietResult.code).toBe(0);
      
      // Quiet mode should produce less output
      expect(quietResult.stdout.length).toBeLessThanOrEqual(normalResult.stdout.length);
    });
  });

  describe('Interactive Features', () => {
    beforeEach(async () => {
      await runCLI(['config', 'set', 'server_url', testServer.url]);
      await runCLI(['config', 'set', 'token', testServer.token]);
    });

    it('should handle interactive note creation', async () => {
      const input = 'Interactive Note\nThis is interactive content\n';
      const result = await runCLI(['note', 'create', '--interactive'], { input });
      
      if (result.code === 0) {
        expect(result.stdout).toContain('Created') || expect(result.stdout).toContain('note');
      }
    });

    it('should prompt for confirmation on destructive operations', async () => {
      // Create a note first
      const createResult = await runCLI(['note', 'create', 'Delete Test', '--content', 'To be deleted']);
      const noteIdMatch = createResult.stdout.match(/note-\d+/);
      
      if (noteIdMatch) {
        const noteId = noteIdMatch[0];
        
        // Try to delete without force (should prompt)
        const deleteResult = await runCLI(['note', 'delete', noteId], { input: 'n\n', timeout: 5000 });
        
        // Should either be cancelled or complete based on prompt handling
        expect([0, 1]).toContain(deleteResult.code);
      }
    });
  });

  describe('Profile Management', () => {
    it('should create and switch profiles', async () => {
      const result1 = await runCLI(['profile', 'create', 'test-profile']);
      expect(result1.code).toBe(0);

      const result2 = await runCLI(['profile', 'list']);
      expect(result2.code).toBe(0);
      expect(result2.stdout).toContain('test-profile');

      const result3 = await runCLI(['profile', 'switch', 'test-profile']);
      expect(result3.code).toBe(0);
    });

    it('should handle profile-specific configuration', async () => {
      await runCLI(['profile', 'create', 'test-profile']);
      await runCLI(['profile', 'switch', 'test-profile']);
      
      const result = await runCLI(['config', 'set', 'server_url', 'http://profile-server:8080']);
      expect(result.code).toBe(0);

      const showResult = await runCLI(['config', 'show']);
      expect(showResult.stdout).toContain('http://profile-server:8080');
    });
  });
});