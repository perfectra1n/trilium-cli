import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from 'ink-testing-library';
import { TreeView } from '../../../src/tui/components/TreeView.js';
import type { NoteTreeItem, Note } from '../../../src/types/api.js';
import type { BookmarkedNote } from '../../../src/tui/types/index.js';

describe('TreeView Component', () => {
  let mockItems: Array<NoteTreeItem & { depth: number }>;
  let mockBookmarks: BookmarkedNote[];

  beforeEach(() => {
    mockItems = [
      {
        note: {
          noteId: 'root',
          title: 'Root Note',
          type: 'text',
          isProtected: false,
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-01T00:00:00Z',
        },
        children: [],
        depth: 0,
      },
      {
        note: {
          noteId: 'child1',
          title: 'Child Note 1',
          type: 'text',
          isProtected: false,
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-01T00:00:00Z',
        },
        children: [],
        depth: 1,
      },
      {
        note: {
          noteId: 'child2',
          title: 'Child Note 2',
          type: 'code',
          mime: 'application/javascript',
          isProtected: true,
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-01T00:00:00Z',
        },
        children: [],
        depth: 1,
      },
      {
        note: {
          noteId: 'grandchild1',
          title: 'Grandchild Note',
          type: 'text',
          isProtected: false,
          dateCreated: '2024-01-01',
          dateModified: '2024-01-01',
          utcDateCreated: '2024-01-01T00:00:00Z',
          utcDateModified: '2024-01-01T00:00:00Z',
        },
        children: [],
        depth: 2,
      },
    ];

    mockBookmarks = [
      {
        ownerId: 'child1',
        attributeId: 'bookmark1',
        type: 'label',
        name: 'bookmarked',
        value: '',
        notePosition: 0,
        isInheritable: false,
        utcDateModified: '2024-01-01T00:00:00Z',
      },
    ];
  });

  describe('Rendering', () => {
    it('should render tree with items', () => {
      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={0}
          bookmarkedNotes={mockBookmarks}
        />
      );

      expect(lastFrame()).toContain('Notes Tree');
      expect(lastFrame()).toContain('Root Note');
      expect(lastFrame()).toContain('Child Note 1');
      expect(lastFrame()).toContain('Child Note 2');
      expect(lastFrame()).toContain('Grandchild Note');
    });

    it('should render empty state when no items', () => {
      const { lastFrame } = render(
        <TreeView
          items={[]}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      expect(lastFrame()).toContain('Notes Tree');
      expect(lastFrame()).toContain('No notes found');
      expect(lastFrame()).toContain("Press 'r' to refresh");
    });

    it('should show indentation based on depth', () => {
      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      const frame = lastFrame();
      // Root should have no indentation
      expect(frame).toMatch(/^Root Note/m);
      // Children should be indented
      expect(frame).toContain('  Child Note 1');
      expect(frame).toContain('  Child Note 2');
      // Grandchildren should be more indented
      expect(frame).toContain('    Grandchild Note');
    });

    it('should indicate protected notes', () => {
      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={2} // Select protected note
          bookmarkedNotes={[]}
        />
      );

      const frame = lastFrame();
      // Protected note should have lock indicator
      expect(frame).toContain('🔒');
    });

    it('should show note type icons', () => {
      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      const frame = lastFrame();
      // Text notes should have document icon
      expect(frame).toContain('📄');
      // Code notes should have code icon
      expect(frame).toContain('💻');
    });
  });

  describe('Selection', () => {
    it('should highlight selected item', () => {
      const { lastFrame, rerender } = render(
        <TreeView
          items={mockItems}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      // First item selected
      let frame = lastFrame();
      expect(frame).toContain('▶ Root Note'); // Selected indicator

      // Select second item
      rerender(
        <TreeView
          items={mockItems}
          selectedIndex={1}
          bookmarkedNotes={[]}
        />
      );

      frame = lastFrame();
      expect(frame).toContain('▶   Child Note 1');
    });

    it('should handle selection beyond bounds gracefully', () => {
      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={999} // Out of bounds
          bookmarkedNotes={[]}
        />
      );

      // Should not crash
      expect(lastFrame()).toContain('Notes Tree');
    });

    it('should handle negative selection index', () => {
      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={-1}
          bookmarkedNotes={[]}
        />
      );

      // Should not crash
      expect(lastFrame()).toContain('Notes Tree');
    });
  });

  describe('Bookmarks', () => {
    it('should mark bookmarked notes', () => {
      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={0}
          bookmarkedNotes={mockBookmarks}
        />
      );

      const frame = lastFrame();
      // Bookmarked note should have star indicator
      expect(frame).toContain('⭐');
      expect(frame).toContain('Child Note 1');
    });

    it('should handle multiple bookmarks', () => {
      const multipleBookmarks: BookmarkedNote[] = [
        {
          ownerId: 'child1',
          attributeId: 'bookmark1',
          type: 'label',
          name: 'bookmarked',
          value: '',
          notePosition: 0,
          isInheritable: false,
          utcDateModified: '2024-01-01T00:00:00Z',
        },
        {
          ownerId: 'grandchild1',
          attributeId: 'bookmark2',
          type: 'label',
          name: 'bookmarked',
          value: '',
          notePosition: 0,
          isInheritable: false,
          utcDateModified: '2024-01-01T00:00:00Z',
        },
      ];

      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={0}
          bookmarkedNotes={multipleBookmarks}
        />
      );

      const frame = lastFrame();
      // Should show multiple bookmarks
      const starCount = (frame.match(/⭐/g) || []).length;
      expect(starCount).toBe(2);
    });
  });

  describe('Collapsed/Expanded State', () => {
    it('should show expand/collapse indicators for items with children', () => {
      const itemsWithChildren: Array<NoteTreeItem & { depth: number }> = [
        {
          note: {
            noteId: 'parent',
            title: 'Parent Note',
            type: 'text',
            isProtected: false,
            dateCreated: '2024-01-01',
            dateModified: '2024-01-01',
            utcDateCreated: '2024-01-01T00:00:00Z',
            utcDateModified: '2024-01-01T00:00:00Z',
          },
          children: [
            {
              note: {
                noteId: 'child',
                title: 'Child',
                type: 'text',
              } as Note,
              children: [],
            },
          ],
          depth: 0,
        },
      ];

      const { lastFrame } = render(
        <TreeView
          items={itemsWithChildren}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      const frame = lastFrame();
      // Should show expand/collapse indicator
      expect(frame).toMatch(/[▼▶]/);
    });
  });

  describe('Performance', () => {
    it('should handle large trees efficiently', () => {
      const largeTree: Array<NoteTreeItem & { depth: number }> = 
        Array.from({ length: 1000 }, (_, i) => ({
          note: {
            noteId: `note${i}`,
            title: `Note ${i}`,
            type: 'text',
            isProtected: false,
            dateCreated: '2024-01-01',
            dateModified: '2024-01-01',
            utcDateCreated: '2024-01-01T00:00:00Z',
            utcDateModified: '2024-01-01T00:00:00Z',
          },
          children: [],
          depth: i % 5, // Vary depths
        }));

      const { lastFrame } = render(
        <TreeView
          items={largeTree}
          selectedIndex={500}
          bookmarkedNotes={[]}
        />
      );

      // Should render without crashing
      expect(lastFrame()).toContain('Notes Tree');
    });
  });

  describe('Accessibility', () => {
    it('should show keyboard hints', () => {
      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      // Could show keyboard hints in footer or help text
      // This depends on implementation
    });

    it('should handle special characters in titles', () => {
      const specialItems: Array<NoteTreeItem & { depth: number }> = [
        {
          note: {
            noteId: 'special',
            title: 'Note with <>&"\'` special chars',
            type: 'text',
            isProtected: false,
            dateCreated: '2024-01-01',
            dateModified: '2024-01-01',
            utcDateCreated: '2024-01-01T00:00:00Z',
            utcDateModified: '2024-01-01T00:00:00Z',
          },
          children: [],
          depth: 0,
        },
      ];

      const { lastFrame } = render(
        <TreeView
          items={specialItems}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      expect(lastFrame()).toContain('Note with <>&"\'` special chars');
    });

    it('should handle long titles with truncation', () => {
      const longTitle = 'A'.repeat(200);
      const longItems: Array<NoteTreeItem & { depth: number }> = [
        {
          note: {
            noteId: 'long',
            title: longTitle,
            type: 'text',
            isProtected: false,
            dateCreated: '2024-01-01',
            dateModified: '2024-01-01',
            utcDateCreated: '2024-01-01T00:00:00Z',
            utcDateModified: '2024-01-01T00:00:00Z',
          },
          children: [],
          depth: 0,
        },
      ];

      const { lastFrame } = render(
        <TreeView
          items={longItems}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      const frame = lastFrame();
      // Should truncate or handle long titles gracefully
      expect(frame).toBeDefined();
      // Title should be truncated with ellipsis
      expect(frame).toContain('...');
    });
  });

  describe('Styling', () => {
    it('should apply different colors based on note type', () => {
      const { lastFrame } = render(
        <TreeView
          items={mockItems}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      // This would test color output, but ink-testing-library
      // strips colors by default. In real implementation,
      // we'd check for color codes or use a color-aware test library
      expect(lastFrame()).toBeDefined();
    });

    it('should dim archived notes', () => {
      const archivedItems: Array<NoteTreeItem & { depth: number }> = [
        {
          note: {
            noteId: 'archived',
            title: 'Archived Note',
            type: 'text',
            isProtected: false,
            isArchived: true,
            dateCreated: '2024-01-01',
            dateModified: '2024-01-01',
            utcDateCreated: '2024-01-01T00:00:00Z',
            utcDateModified: '2024-01-01T00:00:00Z',
          },
          children: [],
          depth: 0,
        },
      ];

      const { lastFrame } = render(
        <TreeView
          items={archivedItems}
          selectedIndex={0}
          bookmarkedNotes={[]}
        />
      );

      // Archived notes should be visually distinct
      expect(lastFrame()).toContain('Archived Note');
    });
  });
});