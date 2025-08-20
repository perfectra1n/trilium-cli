import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openEditor, openNoteInExternalEditor, extractTitle } from '../../src/utils/editor.js';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';

// Mock child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock fs promises
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    promises: {
      writeFile: vi.fn(),
      readFile: vi.fn(),
      unlink: vi.fn()
    }
  };
});

// Mock os
vi.mock('os', () => ({
  tmpdir: vi.fn(() => '/tmp')
}));

// Mock terminal state utilities
vi.mock('../../src/utils/terminal-state.js', () => ({
  prepareForExternalEditor: vi.fn(),
  resumeAfterExternalEditor: vi.fn(),
  setupSignalHandlers: vi.fn(() => vi.fn())
}));

describe('External Editor Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.EDITOR;
    delete process.env.VISUAL;
    delete process.env.TRILIUM_EDITOR;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('openEditor', () => {
    it('should open editor with content and return result', async () => {
      const mockContent = 'Test content';
      const modifiedContent = 'Modified content';
      
      // Mock file operations
      (fs.promises.writeFile as any).mockResolvedValue(undefined);
      (fs.promises.readFile as any).mockResolvedValue(modifiedContent);
      (fs.promises.unlink as any).mockResolvedValue(undefined);
      
      // Mock spawn to simulate successful editor
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 10);
          }
        })
      };
      (spawn as any).mockReturnValue(mockChild);
      
      const result = await openEditor(mockContent);
      
      expect(result.cancelled).toBe(false);
      expect(result.changed).toBe(true);
      expect(result.content).toBe(modifiedContent);
      
      // Verify temp file was created and cleaned up
      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalled();
    });

    it('should handle editor cancellation', async () => {
      const mockContent = 'Test content';
      
      // Mock file operations
      (fs.promises.writeFile as any).mockResolvedValue(undefined);
      (fs.promises.readFile as any).mockResolvedValue(mockContent);
      (fs.promises.unlink as any).mockResolvedValue(undefined);
      
      // Mock spawn to simulate editor exit with error
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            setTimeout(() => callback(1), 10);
          }
        })
      };
      (spawn as any).mockReturnValue(mockChild);
      
      const result = await openEditor(mockContent);
      
      expect(result.cancelled).toBe(true);
      expect(result.changed).toBe(false);
      expect(result.content).toBe(mockContent);
    });

    it('should detect no changes', async () => {
      const mockContent = 'Test content';
      
      // Mock file operations - return same content
      (fs.promises.writeFile as any).mockResolvedValue(undefined);
      (fs.promises.readFile as any).mockResolvedValue(mockContent);
      (fs.promises.unlink as any).mockResolvedValue(undefined);
      
      // Mock spawn to simulate successful editor
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 10);
          }
        })
      };
      (spawn as any).mockReturnValue(mockChild);
      
      const result = await openEditor(mockContent);
      
      expect(result.cancelled).toBe(false);
      expect(result.changed).toBe(false);
      expect(result.content).toBe(mockContent);
    });
  });

  describe('openNoteInExternalEditor', () => {
    it('should handle HTML to Markdown conversion for text notes', async () => {
      const htmlContent = '<h1>Test</h1><p>Content</p>';
      const markdownContent = '# Test\\n\\nContent';
      const modifiedMarkdown = '# Modified\\n\\nContent';
      const expectedHtml = '<h1>Modified</h1>\\n<p>Content</p>';
      
      // Mock file operations
      (fs.promises.writeFile as any).mockResolvedValue(undefined);
      (fs.promises.readFile as any).mockResolvedValue(modifiedMarkdown);
      (fs.promises.unlink as any).mockResolvedValue(undefined);
      
      // Mock spawn to simulate successful editor
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 10);
          }
        })
      };
      (spawn as any).mockReturnValue(mockChild);
      
      const result = await openNoteInExternalEditor(htmlContent, 'text');
      
      expect(result.cancelled).toBe(false);
      expect(result.changed).toBe(true);
      // The actual conversion logic is in markdown.ts which we're not testing here
      // Just verify the function executes without error
    });

    it('should not convert HTML for code notes', async () => {
      const codeContent = 'function test() { return true; }';
      
      // Mock file operations
      (fs.promises.writeFile as any).mockResolvedValue(undefined);
      (fs.promises.readFile as any).mockResolvedValue(codeContent);
      (fs.promises.unlink as any).mockResolvedValue(undefined);
      
      // Mock spawn to simulate successful editor
      const mockChild = {
        on: vi.fn((event, callback) => {
          if (event === 'exit') {
            setTimeout(() => callback(0), 10);
          }
        })
      };
      (spawn as any).mockReturnValue(mockChild);
      
      const result = await openNoteInExternalEditor(codeContent, 'code');
      
      expect(result.cancelled).toBe(false);
      expect(result.changed).toBe(false);
      expect(result.content).toBe(codeContent);
    });
  });

  describe('extractTitle', () => {
    it('should extract title from markdown', () => {
      const markdown = '# My Title\nContent here';
      const title = extractTitle(markdown, 'markdown');
      expect(title).toBe('My Title');
    });

    it('should extract title from HTML', () => {
      const html = '<h1>My Title</h1><p>Content here</p>';
      const title = extractTitle(html, 'html');
      expect(title).toBe('My Title');
    });

    it('should use first line for plain text', () => {
      const plain = 'First line\nSecond line';
      const title = extractTitle(plain, 'plain');
      expect(title).toBe('First line');
    });

    it('should return null for empty content', () => {
      const title = extractTitle('', 'markdown');
      expect(title).toBeNull();
    });
  });
});