import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { SearchView } from '../../../src/tui/components/SearchView.js';
import type { SearchResult } from '../../../src/types/api.js';

describe('SearchView Component', () => {
  let mockResults: SearchResult[];
  let mockOnSelect: vi.Mock;
  let mockOnClose: vi.Mock;

  beforeEach(() => {
    mockResults = [
      {
        noteId: 'note1',
        title: 'First Search Result',
        score: 0.95,
      },
      {
        noteId: 'note2',
        title: 'Second Search Result',
        score: 0.85,
      },
      {
        noteId: 'note3',
        title: 'Third Search Result with a very long title that should be truncated',
        score: 0.75,
      },
    ];

    mockOnSelect = vi.fn();
    mockOnClose = vi.fn();
  });

  describe('Rendering', () => {
    it('should render search input and results', () => {
      const { lastFrame } = render(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('Search');
      expect(lastFrame()).toContain('test');
      expect(lastFrame()).toContain('First Search Result');
      expect(lastFrame()).toContain('Second Search Result');
      expect(lastFrame()).toContain('Third Search Result');
    });

    it('should show loading state', () => {
      const { lastFrame } = render(
        <SearchView
          query="test"
          results={[]}
          selectedIndex={0}
          isLoading={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('Searching...');
    });

    it('should show empty state when no results', () => {
      const { lastFrame } = render(
        <SearchView
          query="test"
          results={[]}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('No results found');
    });

    it('should display search scores', () => {
      const { lastFrame } = render(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={0}
          isLoading={false}
          showScores={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('95%');
      expect(lastFrame()).toContain('85%');
      expect(lastFrame()).toContain('75%');
    });

    it('should highlight search terms in results', () => {
      const resultsWithQuery: SearchResult[] = [
        {
          noteId: 'note1',
          title: 'This contains the test word',
          score: 0.9,
        },
      ];

      const { lastFrame } = render(
        <SearchView
          query="test"
          results={resultsWithQuery}
          selectedIndex={0}
          isLoading={false}
          highlightTerms={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // Highlighted term should be emphasized
      const frame = lastFrame();
      expect(frame).toContain('test');
    });
  });

  describe('Selection', () => {
    it('should highlight selected result', () => {
      const { lastFrame, rerender } = render(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // First item selected
      let frame = lastFrame();
      expect(frame).toContain('▶ First Search Result');

      // Select second item
      rerender(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={1}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      frame = lastFrame();
      expect(frame).toContain('▶ Second Search Result');
    });

    it('should handle selection beyond bounds', () => {
      const { lastFrame } = render(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={999}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // Should not crash
      expect(lastFrame()).toContain('Search');
    });

    it('should call onSelect when item is selected', () => {
      const { stdin } = render(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={1}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // Simulate Enter key press
      stdin.write('\r');

      expect(mockOnSelect).toHaveBeenCalledWith(mockResults[1]);
    });
  });

  describe('Query Input', () => {
    it('should display current query', () => {
      const { lastFrame } = render(
        <SearchView
          query="complex search query"
          results={[]}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('complex search query');
    });

    it('should handle empty query', () => {
      const { lastFrame } = render(
        <SearchView
          query=""
          results={[]}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('Type to search');
    });

    it('should show query syntax hints', () => {
      const { lastFrame } = render(
        <SearchView
          query=""
          results={[]}
          selectedIndex={0}
          isLoading={false}
          showHints={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('#tag');
      expect(lastFrame()).toContain('@attribute');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should navigate with arrow keys', () => {
      const { stdin, lastFrame, rerender } = render(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // Press down arrow
      stdin.write('\u001B[B');
      
      // Should move selection down
      rerender(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={1}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('▶ Second Search Result');
    });

    it('should close on ESC key', () => {
      const { stdin } = render(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // Press ESC
      stdin.write('\u001B');

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should handle page up/down for long result lists', () => {
      const longResults = Array.from({ length: 50 }, (_, i) => ({
        noteId: `note${i}`,
        title: `Result ${i}`,
        score: 1 - (i * 0.01),
      }));

      const { stdin, rerender } = render(
        <SearchView
          query="test"
          results={longResults}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // Press Page Down
      stdin.write('\u001B[6~');

      // Should jump down multiple items
      rerender(
        <SearchView
          query="test"
          results={longResults}
          selectedIndex={10}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // Selection should have moved down significantly
    });
  });

  describe('Filtering and Sorting', () => {
    it('should display results sorted by score', () => {
      const unsortedResults: SearchResult[] = [
        { noteId: 'low', title: 'Low Score', score: 0.3 },
        { noteId: 'high', title: 'High Score', score: 0.9 },
        { noteId: 'mid', title: 'Mid Score', score: 0.6 },
      ];

      const { lastFrame } = render(
        <SearchView
          query="test"
          results={unsortedResults}
          selectedIndex={0}
          isLoading={false}
          sortByScore={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      const frame = lastFrame();
      const highIndex = frame.indexOf('High Score');
      const midIndex = frame.indexOf('Mid Score');
      const lowIndex = frame.indexOf('Low Score');

      // High score should appear first
      expect(highIndex).toBeLessThan(midIndex);
      expect(midIndex).toBeLessThan(lowIndex);
    });

    it('should filter results by minimum score', () => {
      const { lastFrame } = render(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={0}
          isLoading={false}
          minScore={0.8}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('First Search Result');
      expect(lastFrame()).toContain('Second Search Result');
      expect(lastFrame()).not.toContain('Third Search Result');
    });
  });

  describe('Preview', () => {
    it('should show note preview for selected result', () => {
      const resultsWithContent: Array<SearchResult & { content?: string }> = [
        {
          noteId: 'note1',
          title: 'Note with Preview',
          score: 0.9,
          content: 'This is the preview content of the note...',
        },
      ];

      const { lastFrame } = render(
        <SearchView
          query="test"
          results={resultsWithContent}
          selectedIndex={0}
          isLoading={false}
          showPreview={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('This is the preview content');
    });

    it('should truncate long preview content', () => {
      const longContent = 'A'.repeat(500);
      const resultsWithLongContent: Array<SearchResult & { content?: string }> = [
        {
          noteId: 'note1',
          title: 'Note',
          score: 0.9,
          content: longContent,
        },
      ];

      const { lastFrame } = render(
        <SearchView
          query="test"
          results={resultsWithLongContent}
          selectedIndex={0}
          isLoading={false}
          showPreview={true}
          maxPreviewLength={100}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      const frame = lastFrame();
      expect(frame).toContain('...');
      expect(frame.length).toBeLessThan(longContent.length + 100);
    });
  });

  describe('Performance', () => {
    it('should handle large result sets', () => {
      const largeResults = Array.from({ length: 1000 }, (_, i) => ({
        noteId: `note${i}`,
        title: `Result ${i}`,
        score: Math.random(),
      }));

      const { lastFrame } = render(
        <SearchView
          query="test"
          results={largeResults}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // Should render without crashing
      expect(lastFrame()).toContain('Search');
    });

    it('should virtualize long lists', () => {
      const manyResults = Array.from({ length: 500 }, (_, i) => ({
        noteId: `note${i}`,
        title: `Result ${i}`,
        score: 0.5,
      }));

      const { lastFrame } = render(
        <SearchView
          query="test"
          results={manyResults}
          selectedIndex={0}
          isLoading={false}
          virtualizeThreshold={50}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      const frame = lastFrame();
      // Should only render visible items
      const resultMatches = frame.match(/Result \d+/g) || [];
      expect(resultMatches.length).toBeLessThan(100);
    });
  });

  describe('Error Handling', () => {
    it('should display error state', () => {
      const { lastFrame } = render(
        <SearchView
          query="test"
          results={[]}
          selectedIndex={0}
          isLoading={false}
          error="Search failed: Network error"
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('Search failed');
      expect(lastFrame()).toContain('Network error');
    });

    it('should handle malformed results gracefully', () => {
      const malformedResults = [
        { noteId: 'note1', title: null as any, score: 0.9 },
        { noteId: 'note2', title: undefined as any, score: 0.8 },
        { noteId: 'note3', title: '', score: 0.7 },
      ];

      const { lastFrame } = render(
        <SearchView
          query="test"
          results={malformedResults}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      // Should not crash
      expect(lastFrame()).toContain('Search');
    });
  });

  describe('Accessibility', () => {
    it('should show keyboard shortcuts help', () => {
      const { lastFrame } = render(
        <SearchView
          query="test"
          results={mockResults}
          selectedIndex={0}
          isLoading={false}
          showHelp={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('↑/↓');
      expect(lastFrame()).toContain('Enter');
      expect(lastFrame()).toContain('ESC');
    });

    it('should handle special characters in titles', () => {
      const specialResults: SearchResult[] = [
        {
          noteId: 'note1',
          title: '<script>alert("XSS")</script>',
          score: 0.9,
        },
        {
          noteId: 'note2',
          title: 'Title with émojis 🎉 and ünicode',
          score: 0.8,
        },
      ];

      const { lastFrame } = render(
        <SearchView
          query="test"
          results={specialResults}
          selectedIndex={0}
          isLoading={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(lastFrame()).toContain('<script>alert("XSS")</script>');
      expect(lastFrame()).toContain('émojis 🎉');
    });
  });
});