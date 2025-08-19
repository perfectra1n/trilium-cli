import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { setupAttachmentCommands } from '../../../src/cli/commands/attachment.js';
import { TriliumClient } from '../../../src/api/client.js';
import { createLogger } from '../../../src/utils/logger.js';
import { formatOutput } from '../../../src/utils/cli.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Attachment } from '../../../src/types/api.js';

// Mock dependencies
vi.mock('../../../src/api/client.js');
vi.mock('../../../src/utils/logger.js');
vi.mock('../../../src/utils/cli.js');
vi.mock('fs/promises');
vi.mock('../../../src/config/index.js', () => ({
  Config: {
    load: vi.fn().mockResolvedValue({
      server: { url: 'http://localhost:8080', apiToken: 'test-token' },
    }),
  },
}));

describe('Attachment Commands', () => {
  let program: Command;
  let mockClient: vi.Mocked<TriliumClient>;
  let mockLogger: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock client
    mockClient = {
      getAttachment: vi.fn(),
      getAttachmentContent: vi.fn(),
      createAttachment: vi.fn(),
      updateAttachment: vi.fn(),
      deleteAttachment: vi.fn(),
      getNoteAttachments: vi.fn(),
      getNote: vi.fn(),
    } as any;

    vi.mocked(TriliumClient).mockImplementation(() => mockClient);

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    };
    vi.mocked(createLogger).mockReturnValue(mockLogger);

    // Mock formatOutput
    vi.mocked(formatOutput).mockImplementation((data, format) => {
      if (format === 'json') {
        return JSON.stringify(data, null, 2);
      }
      return JSON.stringify(data);
    });

    // Spy on console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Create new program instance
    program = new Command();
    program.exitOverride();
    setupAttachmentCommands(program);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('attachment list', () => {
    it('should list attachments for a note', async () => {
      const mockAttachments: Attachment[] = [
        {
          attachmentId: 'att1',
          ownerId: 'note1',
          title: 'document.pdf',
          mime: 'application/pdf',
          size: 1024000,
          utcDateModified: '2024-01-01T00:00:00Z',
        },
        {
          attachmentId: 'att2',
          ownerId: 'note1',
          title: 'image.png',
          mime: 'image/png',
          size: 512000,
          utcDateModified: '2024-01-02T00:00:00Z',
        },
      ];

      mockClient.getNoteAttachments.mockResolvedValue(mockAttachments);

      await program.parseAsync(['attachment', 'list', 'note1'], { from: 'user' });

      expect(mockClient.getNoteAttachments).toHaveBeenCalledWith('note1');
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('should handle note with no attachments', async () => {
      mockClient.getNoteAttachments.mockResolvedValue([]);

      await program.parseAsync(['attachment', 'list', 'note1'], { from: 'user' });

      expect(mockClient.getNoteAttachments).toHaveBeenCalledWith('note1');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No attachments found')
      );
    });

    it('should format attachments as JSON', async () => {
      const mockAttachments: Attachment[] = [
        {
          attachmentId: 'att1',
          ownerId: 'note1',
          title: 'file.txt',
          mime: 'text/plain',
          size: 100,
          utcDateModified: '2024-01-01T00:00:00Z',
        },
      ];

      mockClient.getNoteAttachments.mockResolvedValue(mockAttachments);

      await program.parseAsync([
        'attachment', 
        'list', 
        'note1', 
        '--format', 
        'json'
      ], { from: 'user' });

      expect(formatOutput).toHaveBeenCalledWith(
        expect.objectContaining({ attachments: mockAttachments }),
        'json'
      );
    });

    it('should show detailed information with --detailed flag', async () => {
      const mockAttachments: Attachment[] = [
        {
          attachmentId: 'att1',
          ownerId: 'note1',
          title: 'document.pdf',
          mime: 'application/pdf',
          size: 1024000,
          utcDateModified: '2024-01-01T00:00:00Z',
        },
      ];

      mockClient.getNoteAttachments.mockResolvedValue(mockAttachments);

      await program.parseAsync([
        'attachment', 
        'list', 
        'note1', 
        '--detailed'
      ], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('attachmentId')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('1.0 MB')
      );
    });
  });

  describe('attachment upload', () => {
    it('should upload file as attachment', async () => {
      const fileContent = Buffer.from('Test file content');
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);
      vi.mocked(fs.stat).mockResolvedValue({
        size: fileContent.length,
        isFile: () => true,
      } as any);

      const mockAttachment: Attachment = {
        attachmentId: 'new-att',
        ownerId: 'note1',
        title: 'test.txt',
        mime: 'text/plain',
        size: fileContent.length,
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      mockClient.createAttachment.mockResolvedValue(mockAttachment);

      await program.parseAsync([
        'attachment', 
        'upload', 
        'note1', 
        '/path/to/test.txt'
      ], { from: 'user' });

      expect(fs.readFile).toHaveBeenCalledWith('/path/to/test.txt');
      expect(mockClient.createAttachment).toHaveBeenCalledWith({
        ownerId: 'note1',
        title: 'test.txt',
        mime: expect.any(String),
        content: fileContent.toString('base64'),
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Uploaded attachment')
      );
    });

    it('should handle multiple file uploads', async () => {
      const fileContent1 = Buffer.from('File 1');
      const fileContent2 = Buffer.from('File 2');
      
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(fileContent1)
        .mockResolvedValueOnce(fileContent2);
      
      vi.mocked(fs.stat).mockResolvedValue({
        size: 100,
        isFile: () => true,
      } as any);

      mockClient.createAttachment.mockResolvedValue({} as Attachment);

      await program.parseAsync([
        'attachment', 
        'upload', 
        'note1', 
        'file1.txt,file2.txt'
      ], { from: 'user' });

      expect(fs.readFile).toHaveBeenCalledTimes(2);
      expect(mockClient.createAttachment).toHaveBeenCalledTimes(2);
    });

    it('should validate file exists', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('File not found'));

      await expect(
        program.parseAsync([
          'attachment', 
          'upload', 
          'note1', 
          '/nonexistent/file.txt'
        ], { from: 'user' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('File not found')
      );
      expect(mockClient.createAttachment).not.toHaveBeenCalled();
    });

    it('should handle large files with warning', async () => {
      const largeFile = Buffer.alloc(50 * 1024 * 1024); // 50MB
      vi.mocked(fs.readFile).mockResolvedValue(largeFile);
      vi.mocked(fs.stat).mockResolvedValue({
        size: largeFile.length,
        isFile: () => true,
      } as any);

      mockClient.createAttachment.mockResolvedValue({} as Attachment);

      await program.parseAsync([
        'attachment', 
        'upload', 
        'note1', 
        'large.zip'
      ], { from: 'user' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Large file')
      );
      expect(mockClient.createAttachment).toHaveBeenCalled();
    });

    it('should auto-detect MIME type', async () => {
      const imageContent = Buffer.from([0x89, 0x50, 0x4E, 0x47]); // PNG header
      vi.mocked(fs.readFile).mockResolvedValue(imageContent);
      vi.mocked(fs.stat).mockResolvedValue({
        size: imageContent.length,
        isFile: () => true,
      } as any);

      mockClient.createAttachment.mockResolvedValue({} as Attachment);

      await program.parseAsync([
        'attachment', 
        'upload', 
        'note1', 
        'image.png'
      ], { from: 'user' });

      expect(mockClient.createAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          mime: 'image/png',
        })
      );
    });

    it('should allow custom title with --title flag', async () => {
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('content'));
      vi.mocked(fs.stat).mockResolvedValue({
        size: 7,
        isFile: () => true,
      } as any);

      mockClient.createAttachment.mockResolvedValue({} as Attachment);

      await program.parseAsync([
        'attachment', 
        'upload', 
        'note1', 
        'file.txt',
        '--title',
        'Custom Title.txt'
      ], { from: 'user' });

      expect(mockClient.createAttachment).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Custom Title.txt',
        })
      );
    });
  });

  describe('attachment download', () => {
    it('should download attachment to file', async () => {
      const attachmentContent = 'Attachment content';
      const mockAttachment: Attachment = {
        attachmentId: 'att1',
        ownerId: 'note1',
        title: 'document.pdf',
        mime: 'application/pdf',
        size: attachmentContent.length,
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      mockClient.getAttachment.mockResolvedValue(mockAttachment);
      mockClient.getAttachmentContent.mockResolvedValue(attachmentContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await program.parseAsync([
        'attachment', 
        'download', 
        'att1'
      ], { from: 'user' });

      expect(mockClient.getAttachment).toHaveBeenCalledWith('att1');
      expect(mockClient.getAttachmentContent).toHaveBeenCalledWith('att1');
      expect(fs.writeFile).toHaveBeenCalledWith(
        'document.pdf',
        expect.any(Buffer)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Downloaded attachment')
      );
    });

    it('should download to custom path with --output', async () => {
      const attachmentContent = 'Content';
      mockClient.getAttachment.mockResolvedValue({
        attachmentId: 'att1',
        title: 'file.txt',
        mime: 'text/plain',
      } as Attachment);
      mockClient.getAttachmentContent.mockResolvedValue(attachmentContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await program.parseAsync([
        'attachment', 
        'download', 
        'att1',
        '--output',
        '/custom/path/output.txt'
      ], { from: 'user' });

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/custom/path/output.txt',
        expect.any(Buffer)
      );
    });

    it('should handle binary content correctly', async () => {
      const binaryContent = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      mockClient.getAttachment.mockResolvedValue({
        attachmentId: 'att1',
        title: 'image.png',
        mime: 'image/png',
      } as Attachment);
      mockClient.getAttachmentContent.mockResolvedValue(
        binaryContent.toString('base64')
      );
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await program.parseAsync(['attachment', 'download', 'att1'], { from: 'user' });

      expect(fs.writeFile).toHaveBeenCalledWith(
        'image.png',
        binaryContent
      );
    });

    it('should prevent overwriting without --force', async () => {
      vi.mocked(fs.stat).mockResolvedValue({} as any); // File exists
      mockClient.getAttachment.mockResolvedValue({
        attachmentId: 'att1',
        title: 'existing.txt',
      } as Attachment);

      await expect(
        program.parseAsync(['attachment', 'download', 'att1'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('already exists')
      );
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should overwrite with --force flag', async () => {
      vi.mocked(fs.stat).mockResolvedValue({} as any); // File exists
      mockClient.getAttachment.mockResolvedValue({
        attachmentId: 'att1',
        title: 'existing.txt',
      } as Attachment);
      mockClient.getAttachmentContent.mockResolvedValue('content');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await program.parseAsync([
        'attachment', 
        'download', 
        'att1',
        '--force'
      ], { from: 'user' });

      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('attachment delete', () => {
    it('should delete attachment with confirmation', async () => {
      mockClient.getAttachment.mockResolvedValue({
        attachmentId: 'att1',
        title: 'file.txt',
        ownerId: 'note1',
      } as Attachment);
      mockClient.deleteAttachment.mockResolvedValue(undefined);

      // Mock user confirmation
      const confirmSpy = vi.spyOn(process.stdin, 'read').mockImplementation(() => 'y\n');

      await program.parseAsync(['attachment', 'delete', 'att1'], { from: 'user' });

      expect(mockClient.getAttachment).toHaveBeenCalledWith('att1');
      expect(mockClient.deleteAttachment).toHaveBeenCalledWith('att1');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Deleted attachment')
      );

      confirmSpy.mockRestore();
    });

    it('should skip confirmation with --force', async () => {
      mockClient.deleteAttachment.mockResolvedValue(undefined);

      await program.parseAsync([
        'attachment', 
        'delete', 
        'att1',
        '--force'
      ], { from: 'user' });

      expect(mockClient.deleteAttachment).toHaveBeenCalledWith('att1');
    });

    it('should delete multiple attachments', async () => {
      mockClient.deleteAttachment.mockResolvedValue(undefined);

      await program.parseAsync([
        'attachment', 
        'delete', 
        'att1,att2,att3',
        '--force'
      ], { from: 'user' });

      expect(mockClient.deleteAttachment).toHaveBeenCalledTimes(3);
      expect(mockClient.deleteAttachment).toHaveBeenCalledWith('att1');
      expect(mockClient.deleteAttachment).toHaveBeenCalledWith('att2');
      expect(mockClient.deleteAttachment).toHaveBeenCalledWith('att3');
    });

    it('should handle non-existent attachment', async () => {
      mockClient.getAttachment.mockRejectedValue(new Error('Attachment not found'));

      await expect(
        program.parseAsync(['attachment', 'delete', 'nonexistent'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Attachment not found')
      );
      expect(mockClient.deleteAttachment).not.toHaveBeenCalled();
    });
  });

  describe('attachment info', () => {
    it('should show attachment details', async () => {
      const mockAttachment: Attachment = {
        attachmentId: 'att1',
        ownerId: 'note1',
        title: 'document.pdf',
        mime: 'application/pdf',
        size: 1024000,
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      mockClient.getAttachment.mockResolvedValue(mockAttachment);

      await program.parseAsync(['attachment', 'info', 'att1'], { from: 'user' });

      expect(mockClient.getAttachment).toHaveBeenCalledWith('att1');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Attachment ID: att1')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Size: 1.0 MB')
      );
    });

    it('should format info as JSON', async () => {
      const mockAttachment: Attachment = {
        attachmentId: 'att1',
        ownerId: 'note1',
        title: 'file.txt',
        mime: 'text/plain',
        size: 100,
        utcDateModified: '2024-01-01T00:00:00Z',
      };

      mockClient.getAttachment.mockResolvedValue(mockAttachment);

      await program.parseAsync([
        'attachment', 
        'info', 
        'att1',
        '--format',
        'json'
      ], { from: 'user' });

      expect(formatOutput).toHaveBeenCalledWith(
        mockAttachment,
        'json'
      );
    });
  });

  describe('attachment update', () => {
    it('should update attachment title', async () => {
      mockClient.updateAttachment.mockResolvedValue({
        attachmentId: 'att1',
        title: 'new-name.pdf',
      } as Attachment);

      await program.parseAsync([
        'attachment', 
        'update', 
        'att1',
        '--title',
        'new-name.pdf'
      ], { from: 'user' });

      expect(mockClient.updateAttachment).toHaveBeenCalledWith('att1', {
        title: 'new-name.pdf',
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Updated attachment')
      );
    });

    it('should update attachment content from file', async () => {
      const newContent = Buffer.from('Updated content');
      vi.mocked(fs.readFile).mockResolvedValue(newContent);
      vi.mocked(fs.stat).mockResolvedValue({
        size: newContent.length,
        isFile: () => true,
      } as any);

      mockClient.updateAttachment.mockResolvedValue({} as Attachment);

      await program.parseAsync([
        'attachment', 
        'update', 
        'att1',
        '--file',
        '/path/to/new-content.txt'
      ], { from: 'user' });

      expect(fs.readFile).toHaveBeenCalledWith('/path/to/new-content.txt');
      expect(mockClient.updateAttachment).toHaveBeenCalledWith('att1', {
        content: newContent.toString('base64'),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      mockClient.getNoteAttachments.mockRejectedValue(new Error('API Error'));

      await expect(
        program.parseAsync(['attachment', 'list', 'note1'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should validate attachment IDs', async () => {
      await expect(
        program.parseAsync(['attachment', 'download', ''], { from: 'user' })
      ).rejects.toThrow();

      expect(mockClient.getAttachment).not.toHaveBeenCalled();
    });

    it('should handle file system errors', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));
      mockClient.getAttachment.mockResolvedValue({
        attachmentId: 'att1',
        title: 'file.txt',
      } as Attachment);
      mockClient.getAttachmentContent.mockResolvedValue('content');

      await expect(
        program.parseAsync(['attachment', 'download', 'att1'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );
    });

    it('should validate file size limits', async () => {
      const hugeFile = Buffer.alloc(200 * 1024 * 1024); // 200MB
      vi.mocked(fs.readFile).mockResolvedValue(hugeFile);
      vi.mocked(fs.stat).mockResolvedValue({
        size: hugeFile.length,
        isFile: () => true,
      } as any);

      await expect(
        program.parseAsync(['attachment', 'upload', 'note1', 'huge.bin'], { from: 'user' })
      ).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('exceeds maximum')
      );
      expect(mockClient.createAttachment).not.toHaveBeenCalled();
    });
  });
});