/**
 * Link Management Utilities
 * 
 * Provides comprehensive wiki-style link parsing, validation, and management
 * with performance optimizations and backlink tracking.
 */

import type { EntityId, ParsedLink, LinkReference, Note, NoteWithContent } from '../types/api.js';
import { LinkType } from '../types/api.js';

/**
 * Wiki-style link patterns with optimized regex
 */
const LINK_PATTERNS = {
  // [[noteId]] or [[noteId|display text]]
  NOTE_ID: /\[\[([a-zA-Z0-9_-]{10,22})(?:\|([^\]]+))?\]\]/g,
  
  // [[Note Title]] or [[Note Title|display text]]
  NOTE_TITLE: /\[\[([^|\]]+?)(?:\|([^\]]+))?\]\]/g,
  
  // Combined pattern for efficient single-pass parsing
  COMBINED: /\[\[([^|\]]+?)(?:\|([^\]]+))?\]\]/g
} as const;

/**
 * Link validation patterns
 */
const VALIDATION_PATTERNS = {
  // Valid note ID format (10-22 alphanumeric characters with dashes/underscores)
  NOTE_ID: /^[a-zA-Z0-9_-]{10,22}$/,
  
  // Valid title format (non-empty, reasonable length)
  NOTE_TITLE: /^.{1,500}$/,
  
  // Invalid characters for display text
  INVALID_DISPLAY: /[\[\]]/
} as const;

/**
 * Performance optimization: Line offset cache for large documents
 */
interface LineOffsetCache {
  offsets: number[];
  lastUpdate: number;
  content: string;
}

const lineOffsetCaches = new Map<string, LineOffsetCache>();

/**
 * Cache management configuration
 */
const CACHE_CONFIG = {
  MAX_CACHE_SIZE: 100,
  CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes
  CLEANUP_INTERVAL_MS: 60 * 1000 // 1 minute
} as const;

/**
 * Parse wiki-style links from content with performance optimizations
 */
export function parseLinks(content: string, noteId?: EntityId): ParsedLink[] {
  if (!content || content.length === 0) {
    return [];
  }

  const links: ParsedLink[] = [];
  const seenLinks = new Set<string>(); // Deduplicate links
  
  // Reset regex state
  LINK_PATTERNS.COMBINED.lastIndex = 0;
  
  let match: RegExpExecArray | null;
  
  while ((match = LINK_PATTERNS.COMBINED.exec(content)) !== null) {
    const [fullMatch, target, displayText] = match;
    if (!target) continue;
    
    const startPos = match.index;
    const endPos = startPos + fullMatch.length;
    
    // Determine link type
    const linkType = VALIDATION_PATTERNS.NOTE_ID.test(target) 
      ? LinkType.NoteId 
      : LinkType.NoteTitle;
    
    // Create unique key for deduplication
    const linkKey = `${linkType}:${target}:${displayText || ''}`;
    
    if (seenLinks.has(linkKey)) {
      continue;
    }
    seenLinks.add(linkKey);
    
    // Validate link
    if (!validateLinkTarget(target, linkType)) {
      continue;
    }
    
    if (displayText && !validateDisplayText(displayText)) {
      continue;
    }
    
    links.push({
      linkType,
      target: target.trim(),
      displayText: displayText?.trim(),
      startPos,
      endPos
    });
  }
  
  return links;
}

/**
 * Parse links with line number information for better context
 */
export function parseLinksWithLineNumbers(content: string, noteId?: EntityId): Array<ParsedLink & { lineNumber: number; columnNumber: number }> {
  const links = parseLinks(content, noteId);
  const lineOffsets = getLineOffsets(content, noteId);
  
  return links.map(link => {
    const { lineNumber, columnNumber } = getLineAndColumn(link.startPos, lineOffsets);
    
    return {
      ...link,
      lineNumber,
      columnNumber
    };
  });
}

/**
 * Extract outgoing links from note content
 */
export function getOutgoingLinks(note: NoteWithContent): ParsedLink[] {
  if (!note.content) {
    return [];
  }
  
  return parseLinks(note.content, note.noteId);
}

/**
 * Find backlinks to a specific note across a collection of notes
 */
export function findBacklinks(
  targetNoteId: EntityId,
  targetTitle: string,
  notes: NoteWithContent[]
): LinkReference[] {
  const backlinks: LinkReference[] = [];
  
  for (const note of notes) {
    if (!note.content || note.noteId === targetNoteId) {
      continue;
    }
    
    const links = parseLinks(note.content, note.noteId);
    
    for (const link of links) {
      let isMatch = false;
      
      if (link.linkType === LinkType.NoteId && link.target === targetNoteId) {
        isMatch = true;
      } else if (link.linkType === LinkType.NoteTitle && link.target === targetTitle) {
        isMatch = true;
      }
      
      if (isMatch) {
        const context = extractLinkContext(note.content, link);
        
        backlinks.push({
          fromNoteId: note.noteId,
          toNoteId: targetNoteId,
          fromTitle: note.title,
          linkText: link.displayText || link.target,
          context
        });
      }
    }
  }
  
  return backlinks;
}

/**
 * Validate broken links across a collection of notes
 */
export function validateLinks(
  notes: NoteWithContent[],
  progressCallback?: (progress: { current: number; total: number; message?: string }) => void
): Array<{ note: NoteWithContent; brokenLinks: ParsedLink[] }> {
  const noteMap = new Map<EntityId, NoteWithContent>();
  const titleMap = new Map<string, NoteWithContent>();
  
  // Build lookup maps for efficient validation
  for (const note of notes) {
    noteMap.set(note.noteId, note);
    titleMap.set(note.title, note);
  }
  
  const results: Array<{ note: NoteWithContent; brokenLinks: ParsedLink[] }> = [];
  
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    
    if (!note) {
      continue;
    }
    
    if (progressCallback) {
      progressCallback({
        current: i + 1,
        total: notes.length,
        message: `Validating links in: ${note.title}`
      });
    }
    
    if (!note.content) {
      continue;
    }
    
    const links = parseLinks(note.content, note.noteId);
    const brokenLinks: ParsedLink[] = [];
    
    for (const link of links) {
      let isValid = false;
      
      if (link.linkType === LinkType.NoteId) {
        isValid = noteMap.has(link.target);
      } else if (link.linkType === LinkType.NoteTitle) {
        isValid = titleMap.has(link.target);
      }
      
      if (!isValid) {
        brokenLinks.push(link);
      }
    }
    
    if (brokenLinks.length > 0) {
      results.push({ note: note as NoteWithContent, brokenLinks });
    }
  }
  
  return results;
}

/**
 * Replace links in content with new targets
 */
export function replaceLinkTargets(
  content: string,
  replacements: Array<{ oldTarget: string; newTarget: string; linkType?: LinkType }>
): string {
  let result = content;
  
  for (const replacement of replacements) {
    const { oldTarget, newTarget, linkType } = replacement;
    
    if (linkType === LinkType.NoteId || VALIDATION_PATTERNS.NOTE_ID.test(oldTarget)) {
      // Replace note ID links
      const pattern = new RegExp(
        `\\[\\[${escapeRegex(oldTarget)}(\\|[^\\]]+)?\\]\\]`,
        'g'
      );
      result = result.replace(pattern, `[[${newTarget}$1]]`);
    } else {
      // Replace title links
      const pattern = new RegExp(
        `\\[\\[${escapeRegex(oldTarget)}(\\|[^\\]]+)?\\]\\]`,
        'g'
      );
      result = result.replace(pattern, `[[${newTarget}$1]]`);
    }
  }
  
  return result;
}

/**
 * Convert between note ID and title links
 */
export function convertLinkFormat(
  content: string,
  noteMap: Map<EntityId, NoteWithContent>,
  titleMap: Map<string, NoteWithContent>,
  targetFormat: LinkType
): string {
  const links = parseLinks(content);
  let result = content;
  let offset = 0;
  
  for (const link of links) {
    if (link.linkType === targetFormat) {
      continue; // Already in target format
    }
    
    let newTarget: string | null = null;
    
    if (targetFormat === LinkType.NoteId && link.linkType === LinkType.NoteTitle) {
      // Convert title to note ID
      const note = titleMap.get(link.target);
      if (note) {
        newTarget = note.noteId;
      }
    } else if (targetFormat === LinkType.NoteTitle && link.linkType === LinkType.NoteId) {
      // Convert note ID to title
      const note = noteMap.get(link.target);
      if (note) {
        newTarget = note.title;
      }
    }
    
    if (newTarget) {
      const displayText = link.displayText ? `|${link.displayText}` : '';
      const newLink = `[[${newTarget}${displayText}]]`;
      const adjustedStart = link.startPos + offset;
      const adjustedEnd = link.endPos + offset;
      
      result = result.slice(0, adjustedStart) + newLink + result.slice(adjustedEnd);
      offset += newLink.length - (link.endPos - link.startPos);
    }
  }
  
  return result;
}

/**
 * Extract context around a link for preview/reference
 */
export function extractLinkContext(content: string, link: ParsedLink, contextChars = 100): string {
  const start = Math.max(0, link.startPos - contextChars);
  const end = Math.min(content.length, link.endPos + contextChars);
  
  let context = content.slice(start, end);
  
  // Clean up context boundaries
  if (start > 0) {
    const spaceIndex = context.indexOf(' ');
    if (spaceIndex > 0 && spaceIndex < 20) {
      context = '...' + context.slice(spaceIndex);
    }
  }
  
  if (end < content.length) {
    const lastSpaceIndex = context.lastIndexOf(' ');
    if (lastSpaceIndex > context.length - 20 && lastSpaceIndex > 0) {
      context = context.slice(0, lastSpaceIndex) + '...';
    }
  }
  
  return context.trim();
}

/**
 * Get link statistics for a collection of notes
 */
export function getLinkStatistics(notes: NoteWithContent[]): {
  totalLinks: number;
  uniqueTargets: number;
  brokenLinks: number;
  linkTypes: Record<LinkType, number>;
  mostLinkedNotes: Array<{ noteId: EntityId; title: string; backlinks: number }>;
} {
  const linkCounts = new Map<string, number>();
  const noteMap = new Map<EntityId, NoteWithContent>();
  const titleMap = new Map<string, NoteWithContent>();
  const linkTypes = { [LinkType.NoteId]: 0, [LinkType.NoteTitle]: 0 };
  
  let totalLinks = 0;
  let brokenLinks = 0;
  
  // Build lookup maps
  for (const note of notes) {
    noteMap.set(note.noteId, note);
    titleMap.set(note.title, note);
  }
  
  // Count links and validate
  for (const note of notes) {
    if (!note.content) continue;
    
    const links = parseLinks(note.content, note.noteId);
    totalLinks += links.length;
    
    for (const link of links) {
      linkTypes[link.linkType]++;
      
      // Count backlinks
      const targetKey = link.linkType === LinkType.NoteId ? link.target : link.target;
      linkCounts.set(targetKey, (linkCounts.get(targetKey) || 0) + 1);
      
      // Check if broken
      let isValid = false;
      if (link.linkType === LinkType.NoteId) {
        isValid = noteMap.has(link.target);
      } else {
        isValid = titleMap.has(link.target);
      }
      
      if (!isValid) {
        brokenLinks++;
      }
    }
  }
  
  // Get most linked notes
  const mostLinkedNotes = Array.from(linkCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([target, count]) => {
      const note = noteMap.get(target) || titleMap.get(target);
      return {
        noteId: note?.noteId || target,
        title: note?.title || target,
        backlinks: count
      };
    });
  
  return {
    totalLinks,
    uniqueTargets: linkCounts.size,
    brokenLinks,
    linkTypes,
    mostLinkedNotes
  };
}

// ========== Helper Functions ==========

/**
 * Validate link target based on type
 */
function validateLinkTarget(target: string, linkType: LinkType): boolean {
  if (!target || target.length === 0) {
    return false;
  }
  
  if (linkType === LinkType.NoteId) {
    return VALIDATION_PATTERNS.NOTE_ID.test(target);
  } else {
    return VALIDATION_PATTERNS.NOTE_TITLE.test(target) && !target.includes(']]');
  }
}

/**
 * Validate display text
 */
function validateDisplayText(displayText: string): boolean {
  if (!displayText) return true;
  return !VALIDATION_PATTERNS.INVALID_DISPLAY.test(displayText) && displayText.length <= 200;
}

/**
 * Get line offsets for efficient line number calculation
 */
function getLineOffsets(content: string, cacheKey?: EntityId): number[] {
  const now = Date.now();
  
  if (cacheKey) {
    const cached = lineOffsetCaches.get(cacheKey);
    if (cached && cached.content === content && now - cached.lastUpdate < CACHE_CONFIG.CACHE_TTL_MS) {
      return cached.offsets;
    }
  }
  
  const offsets = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  
  if (cacheKey) {
    // Manage cache size
    if (lineOffsetCaches.size >= CACHE_CONFIG.MAX_CACHE_SIZE) {
      const oldestKey = lineOffsetCaches.keys().next().value;
      if (oldestKey) {
        lineOffsetCaches.delete(oldestKey);
      }
    }
    
    lineOffsetCaches.set(cacheKey, {
      offsets,
      lastUpdate: now,
      content
    });
  }
  
  return offsets;
}

/**
 * Get line and column number from character position
 */
function getLineAndColumn(position: number, lineOffsets: number[]): { lineNumber: number; columnNumber: number } {
  let lineNumber = 1;
  
  for (let i = 1; i < lineOffsets.length; i++) {
    const offset = lineOffsets[i];
    if (offset !== undefined && position < offset) {
      break;
    }
    lineNumber = i + 1;
  }
  
  const baseOffset = lineOffsets[lineNumber - 1] ?? 0;
  const columnNumber = position - baseOffset + 1;
  
  return { lineNumber, columnNumber };
}

/**
 * Escape regex special characters
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Cleanup expired caches (called periodically)
 */
function cleanupCaches(): void {
  const now = Date.now();
  const expiredKeys: string[] = [];
  
  for (const [key, cache] of lineOffsetCaches.entries()) {
    if (now - cache.lastUpdate > CACHE_CONFIG.CACHE_TTL_MS) {
      expiredKeys.push(key);
    }
  }
  
  for (const key of expiredKeys) {
    lineOffsetCaches.delete(key);
  }
}

// Setup periodic cache cleanup
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupCaches, CACHE_CONFIG.CLEANUP_INTERVAL_MS);
}