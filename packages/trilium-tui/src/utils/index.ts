/**
 * Utility functions for TUI operations
 */

import type { EntityId, Note } from '@trilium-cli/zod';
import type { TreeItem, SearchResult } from '../types.js';

/**
 * Convert a Note to a TreeItem
 */
export function noteToTreeItem(note: Note, depth = 0, parentId: EntityId | null = null): TreeItem {
  return {
    id: note.noteId,
    noteId: note.noteId,
    title: note.title,
    type: note.type,
    hasChildren: (note.childNoteIds?.length ?? 0) > 0,
    depth,
    parentId,
    isExpanded: false,
    isProtected: note.isProtected || false
  };
}

/**
 * Flatten a tree structure for keyboard navigation
 */
export function flattenTree(items: TreeItem[], expandedNodes: Set<string>): TreeItem[] {
  const result: TreeItem[] = [];
  
  function traverse(item: TreeItem) {
    result.push(item);
    if (item.isExpanded && expandedNodes.has(item.id)) {
      const children = items.filter(i => i.parentId === item.id);
      children.forEach(traverse);
    }
  }
  
  const roots = items.filter(i => !i.parentId);
  roots.forEach(traverse);
  
  return result;
}

/**
 * Format search results with excerpts
 */
export function formatSearchResults(notes: Note[], query: string): SearchResult[] {
  return notes.map(note => {
    // This is a simplified excerpt extraction
    // In a real implementation, you'd want to highlight the matching parts
    const excerpt = note.title.toLowerCase().includes(query.toLowerCase())
      ? note.title
      : `...${note.title.substring(0, 50)}...`;
    
    return {
      ...note,
      excerpt,
      matchCount: 1 // Simplified - would need actual content search to count matches
    };
  });
}

/**
 * Build a breadcrumb path for navigation
 */
export function buildBreadcrumb(noteId: EntityId, notes: Map<EntityId, Note>): string[] {
  const path: string[] = [];
  let currentId: EntityId | undefined = noteId;
  
  while (currentId) {
    const note = notes.get(currentId);
    if (!note) break;
    
    path.unshift(note.title);
    currentId = note.parentNoteIds?.[0];
  }
  
  return path;
}

/**
 * Filter notes by type
 */
export function filterNotesByType(notes: Note[], type: string): Note[] {
  return notes.filter(note => note.type === type);
}

/**
 * Sort notes by various criteria
 */
export function sortNotes(
  notes: Note[],
  sortBy: 'title' | 'dateCreated' | 'dateModified' = 'title',
  order: 'asc' | 'desc' = 'asc'
): Note[] {
  const sorted = [...notes].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'dateCreated':
        comparison = a.dateCreated.localeCompare(b.dateCreated);
        break;
      case 'dateModified':
        comparison = a.dateModified.localeCompare(b.dateModified);
        break;
    }
    
    return order === 'asc' ? comparison : -comparison;
  });
  
  return sorted;
}

/**
 * Check if a note matches a search query
 */
export function matchesQuery(note: Note, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return (
    note.title.toLowerCase().includes(lowerQuery) ||
    note.type.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Group notes by date
 */
export function groupNotesByDate(notes: Note[]): Map<string, Note[]> {
  const grouped = new Map<string, Note[]>();
  
  for (const note of notes) {
    const date = note.dateModified.split(' ')[0]; // Extract date part
    if (!grouped.has(date)) {
      grouped.set(date, []);
    }
    grouped.get(date)!.push(note);
  }
  
  return grouped;
}

/**
 * Calculate note statistics
 */
export function calculateNoteStats(notes: Note[]): {
  total: number;
  byType: Map<string, number>;
  protected: number;
  withAttachments: number;
} {
  const stats = {
    total: notes.length,
    byType: new Map<string, number>(),
    protected: 0,
    withAttachments: 0
  };
  
  for (const note of notes) {
    // Count by type
    const count = stats.byType.get(note.type) || 0;
    stats.byType.set(note.type, count + 1);
    
    // Count protected
    if (note.isProtected) {
      stats.protected++;
    }
  }
  
  return stats;
}