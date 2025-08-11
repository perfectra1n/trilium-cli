import { describe, it, expect } from 'vitest';
import { validateNoteId, validateEmail, validateUrl, validateFileName, sanitizeContent } from '@/utils/validation';

describe('Validation Utilities', () => {
  describe('validateNoteId', () => {
    it('should accept valid note IDs', () => {
      const validIds = [
        'abc123def456',
        '1234567890ab',
        'note-id-with-dashes',
        'noteId123',
        'a1b2c3d4e5f6',
      ];

      validIds.forEach(id => {
        expect(validateNoteId(id)).toBe(true);
      });
    });

    it('should reject invalid note IDs', () => {
      const invalidIds = [
        '', // Empty string
        'a', // Too short
        'invalid note id with spaces',
        'note/id/with/slashes',
        'note\\id\\with\\backslashes',
        'note<>id',
        'note|id',
        'note?id',
        'note*id',
        'note"id',
        null,
        undefined,
      ];

      invalidIds.forEach(id => {
        expect(validateNoteId(id as string)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(validateNoteId('root')).toBe(true); // Special root note
      expect(validateNoteId('_global')).toBe(true); // Special global note
      expect(validateNoteId('123')).toBe(true); // Numeric IDs
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.email@domain.org',
        'user+tag@example.co.uk',
        'firstname.lastname@company.com',
        'user123@test-domain.com',
      ];

      validEmails.forEach(email => {
        expect(validateEmail(email)).toBe(true);
      });
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        '', // Empty string
        'invalid-email',
        '@domain.com',
        'user@',
        'user@@domain.com',
        'user@domain',
        'user space@domain.com',
        'user@domain..com',
        'user@.domain.com',
        null,
        undefined,
      ];

      invalidEmails.forEach(email => {
        expect(validateEmail(email as string)).toBe(false);
      });
    });
  });

  describe('validateUrl', () => {
    it('should accept valid URLs', () => {
      const validUrls = [
        'http://localhost:8080',
        'https://trilium.example.com',
        'https://example.com/path/to/resource',
        'http://192.168.1.100:3000',
        'https://subdomain.domain.co.uk/api/v1',
        'http://example.com:80',
        'https://example.com:443',
      ];

      validUrls.forEach(url => {
        expect(validateUrl(url)).toBe(true);
      });
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        '', // Empty string
        'not-a-url',
        'ftp://example.com', // Wrong protocol
        'http://',
        'https://',
        'http://localhost',
        'localhost:8080',
        'www.example.com',
        'http://example .com', // Space in URL
        null,
        undefined,
      ];

      invalidUrls.forEach(url => {
        expect(validateUrl(url as string)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(validateUrl('http://localhost')).toBe(true); // No port
      expect(validateUrl('https://localhost')).toBe(true); // HTTPS localhost
      expect(validateUrl('http://127.0.0.1:8080')).toBe(true); // IP address
    });
  });

  describe('validateFileName', () => {
    it('should accept valid file names', () => {
      const validNames = [
        'document.txt',
        'my-file.pdf',
        'backup_2023-01-01.db',
        'image.png',
        'script.js',
        'data.json',
        'note_with_underscores.md',
      ];

      validNames.forEach(name => {
        expect(validateFileName(name)).toBe(true);
      });
    });

    it('should reject invalid file names', () => {
      const invalidNames = [
        '', // Empty string
        '.', // Current directory
        '..', // Parent directory
        'file/with/slashes',
        'file\\with\\backslashes',
        'file<>name',
        'file|name',
        'file?name',
        'file*name',
        'file"name',
        'file:name',
        'CON', // Reserved Windows name
        'PRN', // Reserved Windows name
        'AUX', // Reserved Windows name
        'NUL', // Reserved Windows name
        'file with spaces', // Spaces (if not allowed)
        null,
        undefined,
      ];

      invalidNames.forEach(name => {
        expect(validateFileName(name as string)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(validateFileName('a')).toBe(true); // Single character
      expect(validateFileName('file-name')).toBe(true); // Hyphen
      expect(validateFileName('file_name')).toBe(true); // Underscore
      expect(validateFileName('file.with.multiple.dots')).toBe(true); // Multiple dots
    });
  });

  describe('sanitizeContent', () => {
    it('should remove dangerous HTML elements', () => {
      const dangerousContent = `
        <script>alert('xss')</script>
        <iframe src="evil.com"></iframe>
        <object data="malicious.swf"></object>
        <embed src="evil.swf">
        <link rel="stylesheet" href="evil.css">
        <style>body { display: none; }</style>
        <p>Safe content</p>
      `;

      const sanitized = sanitizeContent(dangerousContent);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('<iframe>');
      expect(sanitized).not.toContain('<object>');
      expect(sanitized).not.toContain('<embed>');
      expect(sanitized).not.toContain('<link>');
      expect(sanitized).not.toContain('<style>');
      expect(sanitized).toContain('<p>Safe content</p>');
    });

    it('should remove dangerous attributes', () => {
      const contentWithBadAttrs = `
        <div onclick="alert('xss')">Click me</div>
        <img src="image.jpg" onerror="alert('error')">
        <a href="javascript:alert('xss')">Bad link</a>
        <p style="background: url('evil.jpg')">Styled text</p>
      `;

      const sanitized = sanitizeContent(contentWithBadAttrs);
      expect(sanitized).not.toContain('onclick');
      expect(sanitized).not.toContain('onerror');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('background: url');
    });

    it('should preserve safe HTML elements', () => {
      const safeContent = `
        <h1>Title</h1>
        <h2>Subtitle</h2>
        <p>Paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
        <ul>
          <li>List item 1</li>
          <li>List item 2</li>
        </ul>
        <a href="https://example.com">Safe link</a>
        <img src="image.jpg" alt="Description">
        <blockquote>Quote</blockquote>
        <pre><code>Code block</code></pre>
      `;

      const sanitized = sanitizeContent(safeContent);
      expect(sanitized).toContain('<h1>Title</h1>');
      expect(sanitized).toContain('<p>Paragraph');
      expect(sanitized).toContain('<strong>bold</strong>');
      expect(sanitized).toContain('<em>italic</em>');
      expect(sanitized).toContain('<ul>');
      expect(sanitized).toContain('<li>List item');
      expect(sanitized).toContain('<a href="https://example.com">');
      expect(sanitized).toContain('<img src="image.jpg"');
      expect(sanitized).toContain('<blockquote>');
      expect(sanitized).toContain('<code>');
    });

    it('should handle malformed HTML gracefully', () => {
      const malformedContent = `
        <div><p>Unclosed div
        <img src="test.jpg" alt="Missing closing quote>
        <script>alert('test')</script>
        <p>Normal paragraph</p>
      `;

      const sanitized = sanitizeContent(malformedContent);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('<p>Normal paragraph</p>');
    });

    it('should preserve text content', () => {
      const textContent = 'Just plain text with no HTML';
      const sanitized = sanitizeContent(textContent);
      expect(sanitized).toBe(textContent);
    });

    it('should handle empty and null content', () => {
      expect(sanitizeContent('')).toBe('');
      expect(sanitizeContent(null as any)).toBe('');
      expect(sanitizeContent(undefined as any)).toBe('');
    });

    it('should preserve data attributes for functionality', () => {
      const contentWithData = `
        <div data-note-id="123" data-custom="value">
          <p>Content with data attributes</p>
        </div>
      `;

      const sanitized = sanitizeContent(contentWithData);
      expect(sanitized).toContain('data-note-id="123"');
      expect(sanitized).toContain('data-custom="value"');
    });
  });

  describe('input sanitization edge cases', () => {
    it('should handle Unicode characters correctly', () => {
      const unicodeContent = '测试内容 🎉 العربية русский';
      expect(validateFileName('测试.txt')).toBe(false); // Non-ASCII in filename
      expect(sanitizeContent(unicodeContent)).toContain(unicodeContent);
    });

    it('should handle very long inputs', () => {
      const longString = 'a'.repeat(10000);
      const longNoteId = 'a'.repeat(1000);
      
      expect(validateNoteId(longNoteId)).toBe(false); // Too long for note ID
      expect(sanitizeContent(longString)).toHaveLength(10000); // Should preserve length
    });

    it('should handle special characters in validation', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      expect(validateEmail(`user${specialChars}@domain.com`)).toBe(false);
      expect(validateUrl(`http://example.com/${specialChars}`)).toBe(false);
    });
  });
});