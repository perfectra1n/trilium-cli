import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TerminalDimensionManager } from '../../src/tui/utils/TerminalDimensionManager';
import { 
  truncateText, 
  truncateMiddle, 
  wrapText, 
  formatPath,
  formatFileSize,
  formatDateTime,
  formatShortcut
} from '../../src/tui/utils/responsiveFormat';

describe('Terminal Resize Handling', () => {
  describe('TerminalDimensionManager', () => {
    let manager: TerminalDimensionManager;

    beforeEach(() => {
      // Mock process.stdout dimensions
      Object.defineProperty(process.stdout, 'columns', {
        value: 80,
        writable: true,
        configurable: true
      });
      Object.defineProperty(process.stdout, 'rows', {
        value: 24,
        writable: true,
        configurable: true
      });
    });

    afterEach(() => {
      if (manager) {
        manager.destroy();
      }
    });

    it('should initialize with current terminal dimensions', () => {
      manager = new TerminalDimensionManager();
      const dimensions = manager.getDimensions();
      
      expect(dimensions.columns).toBe(80);
      expect(dimensions.rows).toBe(24);
      expect(dimensions.width).toBe(80);
      expect(dimensions.height).toBe(24);
    });

    it('should detect narrow mode correctly', () => {
      manager = new TerminalDimensionManager();
      expect(manager.isNarrowMode()).toBe(false);
      
      // Simulate narrow terminal
      Object.defineProperty(process.stdout, 'columns', { value: 50 });
      manager.forceUpdate();
      expect(manager.isNarrowMode()).toBe(true);
    });

    it('should detect compact mode correctly', () => {
      manager = new TerminalDimensionManager();
      expect(manager.isCompactMode()).toBe(false);
      
      // Simulate compact terminal
      Object.defineProperty(process.stdout, 'columns', { value: 70 });
      manager.forceUpdate();
      expect(manager.isCompactMode()).toBe(true);
    });

    it('should detect wide mode correctly', () => {
      manager = new TerminalDimensionManager();
      expect(manager.isWideMode()).toBe(false);
      
      // Simulate wide terminal
      Object.defineProperty(process.stdout, 'columns', { value: 150 });
      manager.forceUpdate();
      expect(manager.isWideMode()).toBe(true);
    });

    it('should get correct breakpoint', () => {
      manager = new TerminalDimensionManager();
      
      // Test different widths
      Object.defineProperty(process.stdout, 'columns', { value: 50 });
      manager.forceUpdate();
      expect(manager.getBreakpoint()).toBe('narrow');
      
      Object.defineProperty(process.stdout, 'columns', { value: 70 });
      manager.forceUpdate();
      expect(manager.getBreakpoint()).toBe('compact');
      
      Object.defineProperty(process.stdout, 'columns', { value: 100 });
      manager.forceUpdate();
      expect(manager.getBreakpoint()).toBe('normal');
      
      Object.defineProperty(process.stdout, 'columns', { value: 150 });
      manager.forceUpdate();
      expect(manager.getBreakpoint()).toBe('wide');
    });

    it('should emit resize events', (done) => {
      manager = new TerminalDimensionManager(10); // Short debounce for testing
      
      manager.on('resize', (event) => {
        expect(event.previous.columns).toBe(80);
        expect(event.current.columns).toBe(120);
        done();
      });

      // Simulate resize
      Object.defineProperty(process.stdout, 'columns', { value: 120 });
      process.stdout.emit('resize');
    });
  });

  describe('Responsive Formatting Utilities', () => {
    describe('truncateText', () => {
      it('should truncate long text with ellipsis', () => {
        const text = 'This is a very long text that needs to be truncated';
        const result = truncateText(text, 20);
        expect(result).toBe('This is a very lo...');
        expect(result.length).toBeLessThanOrEqual(20);
      });

      it('should not truncate short text', () => {
        const text = 'Short text';
        const result = truncateText(text, 20);
        expect(result).toBe('Short text');
      });

      it('should handle custom ellipsis', () => {
        const text = 'This is a long text';
        const result = truncateText(text, 10, '→');
        expect(result).toBe('This is a→');
      });
    });

    describe('truncateMiddle', () => {
      it('should truncate from the middle', () => {
        const text = '/very/long/path/to/some/file.txt';
        const result = truncateMiddle(text, 20);
        expect(result.includes('...')).toBe(true);
        expect(result.length).toBeLessThanOrEqual(20);
        expect(result.startsWith('/very')).toBe(true);
        expect(result.endsWith('.txt')).toBe(true);
      });
    });

    describe('wrapText', () => {
      it('should wrap long text into multiple lines', () => {
        const text = 'This is a long text that needs to be wrapped into multiple lines';
        const lines = wrapText(text, 20);
        
        expect(lines.length).toBeGreaterThan(1);
        lines.forEach(line => {
          expect(line.length).toBeLessThanOrEqual(20);
        });
      });

      it('should handle indentation', () => {
        const text = 'This text will be indented';
        const lines = wrapText(text, 30, 4);
        
        lines.forEach(line => {
          expect(line.startsWith('    ')).toBe(true);
        });
      });
    });

    describe('formatPath', () => {
      it('should format paths for narrow terminals', () => {
        const path = '/home/user/documents/projects/trilium/notes.txt';
        const result = formatPath(path, 30);
        expect(result.length).toBeLessThanOrEqual(30);
      });

      it('should replace home directory with ~', () => {
        const originalHome = process.env.HOME;
        process.env.HOME = '/home/user';
        
        const path = '/home/user/documents/file.txt';
        const result = formatPath(path, 50);
        expect(result.startsWith('~/')).toBe(true);
        
        process.env.HOME = originalHome;
      });
    });

    describe('formatFileSize', () => {
      it('should format file sizes correctly', () => {
        expect(formatFileSize(0)).toBe('0B');
        expect(formatFileSize(1024)).toBe('1.00 KB');
        expect(formatFileSize(1048576)).toBe('1.00 MB');
        expect(formatFileSize(1073741824)).toBe('1.00 GB');
      });

      it('should format compact file sizes', () => {
        expect(formatFileSize(0, true)).toBe('0B');
        expect(formatFileSize(1024, true)).toBe('1.0K');
        expect(formatFileSize(1536, true)).toBe('1.5K');
        expect(formatFileSize(10240, true)).toBe('10K');
      });
    });

    describe('formatDateTime', () => {
      it('should format dates based on width', () => {
        const date = new Date('2024-01-15T14:30:45');
        
        const narrow = formatDateTime(date, 'narrow');
        expect(narrow).toMatch(/^\d{2}:\d{2}$/);
        
        const compact = formatDateTime(date, 'compact');
        expect(compact).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
        
        const normal = formatDateTime(date, 'normal');
        expect(normal).toContain('Jan');
        
        const wide = formatDateTime(date, 'wide');
        expect(wide).toContain('2024');
      });
    });

    describe('formatShortcut', () => {
      it('should format shortcuts in normal mode', () => {
        expect(formatShortcut('q', true)).toBe('Ctrl+Q');
        expect(formatShortcut('s', true, false, true)).toBe('Ctrl+Shift+S');
        expect(formatShortcut('return')).toBe('Enter');
      });

      it('should format shortcuts in compact mode', () => {
        expect(formatShortcut('q', true, false, false, true)).toBe('^Q');
        expect(formatShortcut('s', true, false, true, true)).toBe('^S-S');
        expect(formatShortcut('return', false, false, false, true)).toBe('↵');
      });
    });
  });
});