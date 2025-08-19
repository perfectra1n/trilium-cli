import { describe, it, expect } from 'vitest';
import { isValidEntityId, validateEntityId, validateUrl } from '@/utils/validation';

describe('Validation Utilities', () => {
  describe('validateEntityId', () => {
    it('should accept valid entity IDs', () => {
      const validIds = [
        'abc123def456',  // 12 chars exactly
        '1234567890abcd',  // 14 chars
        'note-id-with-dashes-123',  // with dashes
        'noteId123456',  // mixed case
        'a1b2c3d4e5f6',  // 12 chars
        'test_note_123456',  // with underscores
      ];

      validIds.forEach(id => {
        expect(isValidEntityId(id)).toBe(true);
      });
    });

    it('should reject invalid entity IDs', () => {
      const invalidIds = [
        '', // Empty string
        'a', // Too short
        'abc123', // Less than 12 chars
        'invalid note id with spaces',
        'note/id/with/slashes',
        'note\\id\\with\\backslashes',
        'note<>id',
        'note|id',
        'note?id',
        'note*id',
        'note"id',
      ];

      invalidIds.forEach(id => {
        expect(isValidEntityId(id)).toBe(false);
      });
    });

    it('should handle special Trilium entity IDs', () => {
      expect(isValidEntityId('root')).toBe(true); // Special root note
      expect(isValidEntityId('_hidden')).toBe(true); // Special hidden note
      expect(isValidEntityId('none')).toBe(true); // Special none ID
    });

    it('should throw error for invalid IDs when using validateEntityId', () => {
      expect(() => validateEntityId('short')).toThrow();
      expect(() => validateEntityId('')).toThrow();
      expect(validateEntityId('valid_id_123456')).toBe('valid_id_123456');
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
      ];

      validUrls.forEach(url => {
        expect(() => validateUrl(url)).not.toThrow();
      });
    });

    it('should reject invalid URLs', () => {
      const invalidUrls = [
        '', // Empty string
        'not-a-url',
        'ftp://example.com', // Not http/https
        'example.com', // Missing protocol
        '//example.com', // Missing protocol
      ];

      invalidUrls.forEach(url => {
        expect(() => validateUrl(url)).toThrow();
      });
    });
  });

  describe('validateUrl', () => {
    it('should handle edge cases', () => {
      expect(() => validateUrl('http://localhost')).not.toThrow(); // No port
      expect(() => validateUrl('https://localhost')).not.toThrow(); // HTTPS localhost
      expect(() => validateUrl('http://127.0.0.1:8080')).not.toThrow(); // IP address
    });
  });

  describe('Entity ID edge cases', () => {
    it('should handle very long entity IDs', () => {
      const longId = 'a'.repeat(1000);
      expect(isValidEntityId(longId)).toBe(true); // Long IDs are valid
      
      const shortId = 'a'.repeat(11); // 11 chars - too short
      expect(isValidEntityId(shortId)).toBe(false);
    });

    it('should handle special characters in entity IDs', () => {
      expect(isValidEntityId('test-id-123456')).toBe(true); // Hyphens allowed
      expect(isValidEntityId('test_id_123456')).toBe(true); // Underscores allowed
      expect(isValidEntityId('test.id.123456')).toBe(false); // Dots not allowed
      expect(isValidEntityId('test id 123456')).toBe(false); // Spaces not allowed
    });
  });
});