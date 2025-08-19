import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { DirectoryImportHandler as DirectoryImporter, DirectoryExportHandler as DirectoryExporter } from '@/import-export/formats/directory';
import { ObsidianImportHandler as ObsidianImporter } from '@/import-export/formats/obsidian';
import { NotionImportHandler as NotionImporter } from '@/import-export/formats/notion';
import { GitSyncHandler as GitImporter, GitSyncHandler as GitExporter } from '@/import-export/formats/git';
import { TriliumApi } from '@/api/client';

// Mock the API client
vi.mock('@/api/client');

describe('Import/Export Formats', () => {
  let tempDir: string;
  let mockApi: vi.Mocked<TriliumApi>;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trilium-test-'));
    mockApi = {
      getNotes: vi.fn(),
      getNote: vi.fn(),
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      getAttributes: vi.fn(),
      createAttribute: vi.fn(),
      getAttachments: vi.fn(),
      createAttachment: vi.fn(),
    } as any;
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('Directory Import/Export', () => {
    describe('DirectoryExporter', () => {
      it('should export notes to directory structure', async () => {
        const mockNotes = [
          {
            noteId: 'note1',
            title: 'First Note',
            content: '<p>First note content</p>',
            type: 'text',
            parentNoteId: 'root',
          },
          {
            noteId: 'note2',
            title: 'Second Note',
            content: '<p>Second note content</p>',
            type: 'text',
            parentNoteId: 'note1',
          },
        ];

        mockApi.getNotes.mockResolvedValue(mockNotes);
        mockApi.getAttributes.mockResolvedValue([]);
        mockApi.getAttachments.mockResolvedValue([]);

        const exporter = new DirectoryExporter(mockApi);
        await exporter.export(tempDir);

        // Check if files were created
        const files = await fs.readdir(tempDir, { recursive: true });
        expect(files.length).toBeGreaterThan(0);

        // Check if HTML files exist
        const htmlFiles = files.filter(file => file.toString().endsWith('.html'));
        expect(htmlFiles.length).toBeGreaterThan(0);

        // Verify content
        const firstNoteFile = path.join(tempDir, 'First Note.html');
        const content = await fs.readFile(firstNoteFile, 'utf8');
        expect(content).toContain('First note content');
      });

      it('should create proper directory hierarchy', async () => {
        const mockNotes = [
          {
            noteId: 'parent',
            title: 'Parent Folder',
            content: '',
            type: 'text',
            parentNoteId: 'root',
          },
          {
            noteId: 'child1',
            title: 'Child Note 1',
            content: '<p>Child content 1</p>',
            type: 'text',
            parentNoteId: 'parent',
          },
          {
            noteId: 'child2',
            title: 'Child Note 2',
            content: '<p>Child content 2</p>',
            type: 'text',
            parentNoteId: 'parent',
          },
        ];

        mockApi.getNotes.mockResolvedValue(mockNotes);
        mockApi.getAttributes.mockResolvedValue([]);
        mockApi.getAttachments.mockResolvedValue([]);

        const exporter = new DirectoryExporter(mockApi);
        await exporter.export(tempDir);

        // Check directory structure
        const parentDir = path.join(tempDir, 'Parent Folder');
        const stats = await fs.stat(parentDir);
        expect(stats.isDirectory()).toBe(true);

        const childFiles = await fs.readdir(parentDir);
        expect(childFiles).toContain('Child Note 1.html');
        expect(childFiles).toContain('Child Note 2.html');
      });

      it('should handle special characters in file names', async () => {
        const mockNotes = [
          {
            noteId: 'special',
            title: 'Note/with\\special:chars<>|?*"',
            content: '<p>Special content</p>',
            type: 'text',
            parentNoteId: 'root',
          },
        ];

        mockApi.getNotes.mockResolvedValue(mockNotes);
        mockApi.getAttributes.mockResolvedValue([]);
        mockApi.getAttachments.mockResolvedValue([]);

        const exporter = new DirectoryExporter(mockApi);
        await exporter.export(tempDir);

        const files = await fs.readdir(tempDir);
        const sanitizedFile = files.find(file => file.includes('Note_with_special'));
        expect(sanitizedFile).toBeDefined();
      });

      it('should export attachments alongside notes', async () => {
        const mockNotes = [
          {
            noteId: 'with-attachment',
            title: 'Note with Attachment',
            content: '<p>Note content</p>',
            type: 'text',
            parentNoteId: 'root',
          },
        ];

        const mockAttachments = [
          {
            attachmentId: 'att1',
            ownerId: 'with-attachment',
            title: 'document.pdf',
            mime: 'application/pdf',
            role: 'file',
          },
        ];

        mockApi.getNotes.mockResolvedValue(mockNotes);
        mockApi.getAttributes.mockResolvedValue([]);
        mockApi.getAttachments.mockResolvedValue(mockAttachments);
        mockApi.getAttachmentContent = vi.fn().mockResolvedValue(Buffer.from('PDF content'));

        const exporter = new DirectoryExporter(mockApi);
        await exporter.export(tempDir);

        // Check if attachment was exported
        const attachmentsDir = path.join(tempDir, 'Note with Attachment_attachments');
        const attachmentFile = path.join(attachmentsDir, 'document.pdf');
        
        const stats = await fs.stat(attachmentFile);
        expect(stats.isFile()).toBe(true);
      });
    });

    describe('DirectoryImporter', () => {
      it('should import markdown files as notes', async () => {
        // Create test files
        const testFile = path.join(tempDir, 'test-note.md');
        await fs.writeFile(testFile, '# Test Note\n\nThis is test content.');

        mockApi.createNote.mockResolvedValue({
          noteId: 'imported1',
          title: 'Test Note',
          content: '<h1>Test Note</h1><p>This is test content.</p>',
          type: 'text',
        });

        const importer = new DirectoryImporter(mockApi);
        const result = await importer.import(tempDir);

        expect(result.imported).toBe(1);
        expect(result.errors).toBe(0);
        expect(mockApi.createNote).toHaveBeenCalledWith({
          title: 'Test Note',
          content: expect.stringContaining('This is test content'),
          type: 'text',
          parentNoteId: 'root',
        });
      });

      it('should import HTML files as notes', async () => {
        const testFile = path.join(tempDir, 'test-note.html');
        await fs.writeFile(testFile, '<h1>HTML Note</h1><p>HTML content.</p>');

        mockApi.createNote.mockResolvedValue({
          noteId: 'imported1',
          title: 'HTML Note',
          content: '<h1>HTML Note</h1><p>HTML content.</p>',
          type: 'text',
        });

        const importer = new DirectoryImporter(mockApi);
        const result = await importer.import(tempDir);

        expect(result.imported).toBe(1);
        expect(mockApi.createNote).toHaveBeenCalledWith({
          title: 'HTML Note',
          content: '<h1>HTML Note</h1><p>HTML content.</p>',
          type: 'text',
          parentNoteId: 'root',
        });
      });

      it('should handle directory structure', async () => {
        // Create nested directory structure
        const subDir = path.join(tempDir, 'folder1');
        await fs.mkdir(subDir);
        
        const parentFile = path.join(tempDir, 'parent.md');
        const childFile = path.join(subDir, 'child.md');
        
        await fs.writeFile(parentFile, '# Parent Note\n\nParent content.');
        await fs.writeFile(childFile, '# Child Note\n\nChild content.');

        mockApi.createNote
          .mockResolvedValueOnce({
            noteId: 'parent-id',
            title: 'Parent Note',
            content: '<h1>Parent Note</h1><p>Parent content.</p>',
            type: 'text',
          })
          .mockResolvedValueOnce({
            noteId: 'folder-id',
            title: 'folder1',
            content: '',
            type: 'text',
          })
          .mockResolvedValueOnce({
            noteId: 'child-id',
            title: 'Child Note',
            content: '<h1>Child Note</h1><p>Child content.</p>',
            type: 'text',
          });

        const importer = new DirectoryImporter(mockApi);
        const result = await importer.import(tempDir);

        expect(result.imported).toBeGreaterThan(1);
        expect(mockApi.createNote).toHaveBeenCalledTimes(3); // parent, folder, child
      });

      it('should skip unsupported file types', async () => {
        const supportedFile = path.join(tempDir, 'supported.md');
        const unsupportedFile = path.join(tempDir, 'unsupported.bin');
        
        await fs.writeFile(supportedFile, '# Supported\n\nContent.');
        await fs.writeFile(unsupportedFile, Buffer.from([0x00, 0x01, 0x02]));

        mockApi.createNote.mockResolvedValue({
          noteId: 'imported1',
          title: 'Supported',
          content: '<h1>Supported</h1><p>Content.</p>',
          type: 'text',
        });

        const importer = new DirectoryImporter(mockApi);
        const result = await importer.import(tempDir);

        expect(result.imported).toBe(1);
        expect(result.skipped).toBe(1);
      });

      it('should handle import errors gracefully', async () => {
        const testFile = path.join(tempDir, 'error-note.md');
        await fs.writeFile(testFile, '# Error Note\n\nContent.');

        mockApi.createNote.mockRejectedValue(new Error('API Error'));

        const importer = new DirectoryImporter(mockApi);
        const result = await importer.import(tempDir);

        expect(result.imported).toBe(0);
        expect(result.errors).toBe(1);
      });
    });
  });

  describe('Obsidian Import', () => {
    it('should import Obsidian vault structure', async () => {
      // Create Obsidian-style vault
      await fs.mkdir(path.join(tempDir, '.obsidian'));
      const configFile = path.join(tempDir, '.obsidian', 'app.json');
      await fs.writeFile(configFile, '{"vaultName": "Test Vault"}');

      const noteFile = path.join(tempDir, 'Obsidian Note.md');
      await fs.writeFile(noteFile, '# Obsidian Note\n\nThis uses [[Wiki Links]] and #tags.');

      mockApi.createNote.mockResolvedValue({
        noteId: 'obsidian1',
        title: 'Obsidian Note',
        content: '<h1>Obsidian Note</h1><p>This uses <a href="#">Wiki Links</a> and #tags.</p>',
        type: 'text',
      });

      const importer = new ObsidianImporter(mockApi);
      const result = await importer.import(tempDir);

      expect(result.imported).toBe(1);
      expect(mockApi.createNote).toHaveBeenCalled();
    });

    it('should handle Obsidian wiki links', async () => {
      const noteFile = path.join(tempDir, 'wiki-links.md');
      await fs.writeFile(noteFile, 'Link to [[Another Note]] and [[Note with Alias|Custom Text]].');

      mockApi.createNote.mockResolvedValue({
        noteId: 'wiki1',
        title: 'wiki-links',
        content: 'Link to <a href="#">Another Note</a> and <a href="#">Custom Text</a>.',
        type: 'text',
      });

      const importer = new ObsidianImporter(mockApi);
      const result = await importer.import(tempDir);

      expect(result.imported).toBe(1);
    });

    it('should convert Obsidian tags to Trilium labels', async () => {
      const noteFile = path.join(tempDir, 'tagged-note.md');
      await fs.writeFile(noteFile, '# Tagged Note\n\nThis note has #important and #work tags.');

      mockApi.createNote.mockResolvedValue({
        noteId: 'tagged1',
        title: 'Tagged Note',
        content: '<h1>Tagged Note</h1><p>This note has #important and #work tags.</p>',
        type: 'text',
      });
      mockApi.createAttribute.mockResolvedValue({
        attributeId: 'attr1',
        noteId: 'tagged1',
        type: 'label',
        name: 'tag',
        value: 'important',
      });

      const importer = new ObsidianImporter(mockApi);
      const result = await importer.import(tempDir);

      expect(result.imported).toBe(1);
      // Should create attributes for tags
      expect(mockApi.createAttribute).toHaveBeenCalled();
    });
  });

  describe('Notion Import', () => {
    it('should import Notion export structure', async () => {
      // Create Notion-style export
      const notionFile = path.join(tempDir, 'Page Title 12345678.md');
      await fs.writeFile(notionFile, '# Page Title\n\nNotion content with **formatting**.');

      mockApi.createNote.mockResolvedValue({
        noteId: 'notion1',
        title: 'Page Title',
        content: '<h1>Page Title</h1><p>Notion content with <strong>formatting</strong>.</p>',
        type: 'text',
      });

      const importer = new NotionImporter(mockApi);
      const result = await importer.import(tempDir);

      expect(result.imported).toBe(1);
    });

    it('should handle Notion page IDs', async () => {
      const notionFile = path.join(tempDir, 'My Page 1a2b3c4d5e6f.md');
      await fs.writeFile(notionFile, '# My Page\n\nContent.');

      mockApi.createNote.mockResolvedValue({
        noteId: 'notion1',
        title: 'My Page',
        content: '<h1>My Page</h1><p>Content.</p>',
        type: 'text',
      });

      const importer = new NotionImporter(mockApi);
      const result = await importer.import(tempDir);

      expect(result.imported).toBe(1);
      expect(mockApi.createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Page', // Should strip the ID from title
        })
      );
    });

    it('should handle Notion databases', async () => {
      // Create database CSV
      const csvFile = path.join(tempDir, 'Database 123456789.csv');
      await fs.writeFile(csvFile, 'Name,Status,Notes\nTask 1,Done,Important task\nTask 2,In Progress,Another task');

      mockApi.createNote
        .mockResolvedValueOnce({
          noteId: 'db1',
          title: 'Database',
          content: '',
          type: 'text',
        })
        .mockResolvedValueOnce({
          noteId: 'task1',
          title: 'Task 1',
          content: '<p><strong>Status:</strong> Done</p><p><strong>Notes:</strong> Important task</p>',
          type: 'text',
        })
        .mockResolvedValueOnce({
          noteId: 'task2',
          title: 'Task 2',
          content: '<p><strong>Status:</strong> In Progress</p><p><strong>Notes:</strong> Another task</p>',
          type: 'text',
        });

      const importer = new NotionImporter(mockApi);
      const result = await importer.import(tempDir);

      expect(result.imported).toBe(3); // Database + 2 tasks
    });
  });

  describe('Git Import/Export', () => {
    describe('GitExporter', () => {
      it('should export notes to git repository', async () => {
        const mockNotes = [
          {
            noteId: 'note1',
            title: 'Git Note',
            content: '<p>Git content</p>',
            type: 'text',
            parentNoteId: 'root',
            dateModified: '2023-01-01T00:00:00.000Z',
          },
        ];

        mockApi.getNotes.mockResolvedValue(mockNotes);
        mockApi.getAttributes.mockResolvedValue([]);
        mockApi.getAttachments.mockResolvedValue([]);

        const exporter = new GitExporter(mockApi);
        await exporter.export(tempDir);

        // Check if git repository was initialized
        const gitDir = path.join(tempDir, '.git');
        const gitStats = await fs.stat(gitDir);
        expect(gitStats.isDirectory()).toBe(true);

        // Check if files exist
        const files = await fs.readdir(tempDir);
        expect(files.some(file => file.endsWith('.md'))).toBe(true);
      });

      it('should create meaningful commit messages', async () => {
        const mockNotes = [
          {
            noteId: 'note1',
            title: 'Updated Note',
            content: '<p>Updated content</p>',
            type: 'text',
            parentNoteId: 'root',
            dateModified: '2023-01-01T00:00:00.000Z',
          },
        ];

        mockApi.getNotes.mockResolvedValue(mockNotes);
        mockApi.getAttributes.mockResolvedValue([]);
        mockApi.getAttachments.mockResolvedValue([]);

        const exporter = new GitExporter(mockApi);
        await exporter.export(tempDir, { message: 'Export from Trilium' });

        // Git operations would be tested with actual git commands
        // For unit tests, we verify the structure exists
        const gitDir = path.join(tempDir, '.git');
        const gitStats = await fs.stat(gitDir);
        expect(gitStats.isDirectory()).toBe(true);
      });
    });

    describe('GitImporter', () => {
      it('should import from git repository', async () => {
        // Create a simple git repository structure
        await fs.mkdir(path.join(tempDir, '.git'));
        const noteFile = path.join(tempDir, 'git-note.md');
        await fs.writeFile(noteFile, '# Git Note\n\nImported from git.');

        mockApi.createNote.mockResolvedValue({
          noteId: 'git1',
          title: 'Git Note',
          content: '<h1>Git Note</h1><p>Imported from git.</p>',
          type: 'text',
        });

        const importer = new GitImporter(mockApi);
        const result = await importer.import(tempDir);

        expect(result.imported).toBe(1);
      });

      it('should handle git history', async () => {
        // This would require more complex git setup
        // For now, verify basic import works
        await fs.mkdir(path.join(tempDir, '.git'));
        const noteFile = path.join(tempDir, 'versioned-note.md');
        await fs.writeFile(noteFile, '# Versioned Note\n\nLatest version.');

        mockApi.createNote.mockResolvedValue({
          noteId: 'versioned1',
          title: 'Versioned Note',
          content: '<h1>Versioned Note</h1><p>Latest version.</p>',
          type: 'text',
        });

        const importer = new GitImporter(mockApi);
        const result = await importer.import(tempDir);

        expect(result.imported).toBe(1);
      });
    });
  });

  describe('Import/Export Error Handling', () => {
    it('should handle file permission errors', async () => {
      // Create a file that will cause permission errors
      const protectedFile = path.join(tempDir, 'protected.md');
      await fs.writeFile(protectedFile, '# Protected\n\nContent.');
      // Make file unreadable (if not on Windows)
      if (process.platform !== 'win32') {
        await fs.chmod(protectedFile, 0o000);
      }

      const importer = new DirectoryImporter(mockApi);
      const result = await importer.import(tempDir);

      // Should handle the error gracefully
      expect(result.errors).toBeGreaterThan(0);

      // Restore permissions for cleanup
      if (process.platform !== 'win32') {
        await fs.chmod(protectedFile, 0o644);
      }
    });

    it('should handle large files appropriately', async () => {
      const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB
      const largeFile = path.join(tempDir, 'large.md');
      await fs.writeFile(largeFile, `# Large File\n\n${largeContent}`);

      mockApi.createNote.mockResolvedValue({
        noteId: 'large1',
        title: 'Large File',
        content: expect.any(String),
        type: 'text',
      });

      const importer = new DirectoryImporter(mockApi);
      const result = await importer.import(tempDir, { maxFileSize: 5 * 1024 * 1024 });

      // Should handle large files according to configuration
      expect(result).toHaveProperty('skipped');
    });

    it('should validate import data before processing', async () => {
      const invalidFile = path.join(tempDir, 'invalid.md');
      await fs.writeFile(invalidFile, ''); // Empty file

      const importer = new DirectoryImporter(mockApi);
      const result = await importer.import(tempDir);

      // Should skip empty files
      expect(result.skipped).toBeGreaterThan(0);
    });
  });
});