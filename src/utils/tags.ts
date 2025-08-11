/**
 * Tag Management Utilities
 * 
 * Provides comprehensive tag hierarchy management, parsing, validation,
 * tag cloud generation, and relationship utilities.
 */

import type { EntityId, Note, Attribute, TagInfo } from '../types/api.js';

/**
 * Tag parsing patterns
 */
const TAG_PATTERNS = {
  // Standard tag: #tag or #tag/subtag
  HASHTAG: /#([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)/g,
  
  // Tag with value: #tag:value or #tag/subtag:value
  HASHTAG_VALUE: /#([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*):([^#\s]+)/g,
  
  // Inline tag mentions: @tag or @tag/subtag
  MENTION: /@([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)/g,
  
  // Tag hierarchy separator
  HIERARCHY_SEPARATOR: /\//
} as const;

/**
 * Tag validation patterns
 */
const TAG_VALIDATION = {
  // Valid tag name characters
  VALID_NAME: /^[a-zA-Z0-9_-]+$/,
  
  // Valid tag hierarchy path
  VALID_HIERARCHY: /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/,
  
  // Maximum tag depth
  MAX_DEPTH: 5,
  
  // Maximum tag name length
  MAX_NAME_LENGTH: 50,
  
  // Maximum tag value length
  MAX_VALUE_LENGTH: 200
} as const;

/**
 * Parsed tag structure
 */
export interface ParsedTag {
  fullName: string;
  hierarchy: string[];
  value?: string;
  startPos?: number;
  endPos?: number;
  isHashtag: boolean;
  isMention: boolean;
}

/**
 * Tag statistics
 */
export interface TagStatistics {
  name: string;
  fullPath: string;
  count: number;
  noteIds: EntityId[];
  parentTag?: string;
  childTags: string[];
  relatedTags: Array<{ tag: string; coOccurrence: number }>;
}

/**
 * Tag cloud item for visualization
 */
export interface TagCloudItem {
  tag: string;
  count: number;
  weight: number;
  color?: string;
  size?: number;
}

/**
 * Tag relationship types
 */
export enum TagRelationshipType {
  Parent = 'parent',
  Child = 'child',
  Sibling = 'sibling',
  Related = 'related'
}

/**
 * Tag relationship
 */
export interface TagRelationship {
  fromTag: string;
  toTag: string;
  relationshipType: TagRelationshipType;
  strength: number;
}

/**
 * Tag hierarchy tree node
 */
export interface TagHierarchyNode {
  name: string;
  fullPath: string;
  count: number;
  children: TagHierarchyNode[];
  parent?: TagHierarchyNode;
  depth: number;
}

/**
 * Parse tags from text content
 */
export function parseTagsFromContent(content: string): ParsedTag[] {
  if (!content || content.length === 0) {
    return [];
  }
  
  const tags: ParsedTag[] = [];
  const seenTags = new Set<string>();
  
  // Parse hashtags with values
  TAG_PATTERNS.HASHTAG_VALUE.lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = TAG_PATTERNS.HASHTAG_VALUE.exec(content)) !== null) {
    const fullName = match[1];
    const value = match[2];
    const tagKey = `${fullName}:${value}`;
    
    if (!seenTags.has(tagKey) && validateTagName(fullName)) {
      seenTags.add(tagKey);
      
      tags.push({
        fullName,
        hierarchy: fullName.split('/'),
        value,
        startPos: match.index,
        endPos: match.index + match[0].length,
        isHashtag: true,
        isMention: false
      });
    }
  }
  
  // Parse regular hashtags
  TAG_PATTERNS.HASHTAG.lastIndex = 0;
  while ((match = TAG_PATTERNS.HASHTAG.exec(content)) !== null) {
    const fullName = match[1];
    
    // Skip if already found with value
    if (!seenTags.has(fullName) && !seenTags.has(`${fullName}:`)) {
      if (validateTagName(fullName)) {
        seenTags.add(fullName);
        
        tags.push({
          fullName,
          hierarchy: fullName.split('/'),
          startPos: match.index,
          endPos: match.index + match[0].length,
          isHashtag: true,
          isMention: false
        });
      }
    }
  }
  
  // Parse mentions
  TAG_PATTERNS.MENTION.lastIndex = 0;
  while ((match = TAG_PATTERNS.MENTION.exec(content)) !== null) {
    const fullName = match[1];
    const mentionKey = `@${fullName}`;
    
    if (!seenTags.has(mentionKey) && validateTagName(fullName)) {
      seenTags.add(mentionKey);
      
      tags.push({
        fullName,
        hierarchy: fullName.split('/'),
        startPos: match.index,
        endPos: match.index + match[0].length,
        isHashtag: false,
        isMention: true
      });
    }
  }
  
  return tags;
}

/**
 * Extract tags from note attributes
 */
export function extractTagsFromAttributes(attributes: Attribute[]): ParsedTag[] {
  const tags: ParsedTag[] = [];
  
  for (const attr of attributes) {
    if (attr.type === 'label' && attr.name.startsWith('#')) {
      const tagName = attr.name.slice(1); // Remove # prefix
      
      if (validateTagName(tagName)) {
        tags.push({
          fullName: tagName,
          hierarchy: tagName.split('/'),
          value: attr.value,
          isHashtag: true,
          isMention: false
        });
      }
    }
  }
  
  return tags;
}

/**
 * Build tag hierarchy from a collection of notes
 */
export function buildTagHierarchy(notes: Note[]): TagHierarchyNode[] {
  const tagCounts = new Map<string, number>();
  const tagPaths = new Set<string>();
  
  // Collect all tags and their counts
  for (const note of notes) {
    const contentTags = parseTagsFromContent(note.content || '');
    const attributeTags = note.attributes ? extractTagsFromAttributes(note.attributes) : [];
    const allTags = [...contentTags, ...attributeTags];
    
    for (const tag of allTags) {
      // Add full path
      tagPaths.add(tag.fullName);
      tagCounts.set(tag.fullName, (tagCounts.get(tag.fullName) || 0) + 1);
      
      // Add intermediate paths for hierarchy
      const parts = tag.hierarchy;
      for (let i = 1; i <= parts.length; i++) {
        const partialPath = parts.slice(0, i).join('/');
        tagPaths.add(partialPath);
        if (i < parts.length) {
          // Only increment count for intermediate paths if they're not leaf tags
          tagCounts.set(partialPath, tagCounts.get(partialPath) || 0);
        }
      }
    }
  }
  
  // Build hierarchy tree
  const nodeMap = new Map<string, TagHierarchyNode>();
  const rootNodes: TagHierarchyNode[] = [];
  
  // Create all nodes first
  for (const path of tagPaths) {
    const parts = path.split('/');
    const count = tagCounts.get(path) || 0;
    
    const node: TagHierarchyNode = {
      name: parts[parts.length - 1],
      fullPath: path,
      count,
      children: [],
      depth: parts.length - 1
    };
    
    nodeMap.set(path, node);
  }
  
  // Link parent-child relationships
  for (const [path, node] of nodeMap.entries()) {
    const parts = path.split('/');
    
    if (parts.length === 1) {
      // Root level tag
      rootNodes.push(node);
    } else {
      // Child tag - find parent
      const parentPath = parts.slice(0, -1).join('/');
      const parentNode = nodeMap.get(parentPath);
      
      if (parentNode) {
        node.parent = parentNode;
        parentNode.children.push(node);
      }
    }
  }
  
  // Sort children by count (descending) then by name
  function sortChildren(nodes: TagHierarchyNode[]): void {
    nodes.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });
    
    for (const node of nodes) {
      sortChildren(node.children);
    }
  }
  
  sortChildren(rootNodes);
  return rootNodes;
}

/**
 * Generate tag statistics
 */
export function generateTagStatistics(notes: Note[]): TagStatistics[] {
  const tagStats = new Map<string, {
    count: number;
    noteIds: Set<EntityId>;
    coOccurrences: Map<string, number>;
  }>();
  
  // Collect tag usage statistics
  for (const note of notes) {
    const contentTags = parseTagsFromContent(note.content || '');
    const attributeTags = note.attributes ? extractTagsFromAttributes(note.attributes) : [];
    const allTags = [...contentTags, ...attributeTags];
    const noteTags = Array.from(new Set(allTags.map(t => t.fullName)));
    
    // Record tag usage
    for (const tagName of noteTags) {
      if (!tagStats.has(tagName)) {
        tagStats.set(tagName, {
          count: 0,
          noteIds: new Set(),
          coOccurrences: new Map()
        });
      }
      
      const stats = tagStats.get(tagName)!;
      stats.count++;
      stats.noteIds.add(note.noteId);
    }
    
    // Record co-occurrences
    for (let i = 0; i < noteTags.length; i++) {
      for (let j = i + 1; j < noteTags.length; j++) {
        const tag1 = noteTags[i];
        const tag2 = noteTags[j];
        
        const stats1 = tagStats.get(tag1)!;
        const stats2 = tagStats.get(tag2)!;
        
        stats1.coOccurrences.set(tag2, (stats1.coOccurrences.get(tag2) || 0) + 1);
        stats2.coOccurrences.set(tag1, (stats2.coOccurrences.get(tag1) || 0) + 1);
      }
    }
  }
  
  // Convert to final format
  const results: TagStatistics[] = [];
  
  for (const [tagName, stats] of tagStats.entries()) {
    const hierarchy = tagName.split('/');
    const parentTag = hierarchy.length > 1 ? hierarchy.slice(0, -1).join('/') : undefined;
    
    // Find child tags
    const childTags = Array.from(tagStats.keys())
      .filter(name => name.startsWith(tagName + '/') && name.split('/').length === hierarchy.length + 1)
      .sort();
    
    // Get top related tags
    const relatedTags = Array.from(stats.coOccurrences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, coOccurrence: count }));
    
    results.push({
      name: hierarchy[hierarchy.length - 1],
      fullPath: tagName,
      count: stats.count,
      noteIds: Array.from(stats.noteIds),
      parentTag,
      childTags,
      relatedTags
    });
  }
  
  return results.sort((a, b) => b.count - a.count);
}

/**
 * Generate tag cloud data
 */
export function generateTagCloud(
  tagStats: TagStatistics[],
  options: {
    maxTags?: number;
    minCount?: number;
    weightFunction?: (count: number, maxCount: number) => number;
  } = {}
): TagCloudItem[] {
  const {
    maxTags = 50,
    minCount = 1,
    weightFunction = (count, maxCount) => Math.sqrt(count / maxCount)
  } = options;
  
  // Filter and sort tags
  const filteredStats = tagStats
    .filter(stat => stat.count >= minCount)
    .slice(0, maxTags);
  
  if (filteredStats.length === 0) {
    return [];
  }
  
  const maxCount = Math.max(...filteredStats.map(s => s.count));
  
  return filteredStats.map(stat => ({
    tag: stat.fullPath,
    count: stat.count,
    weight: weightFunction(stat.count, maxCount),
    size: Math.max(10, Math.min(48, 10 + weightFunction(stat.count, maxCount) * 38))
  }));
}

/**
 * Find tag relationships
 */
export function findTagRelationships(tagStats: TagStatistics[]): TagRelationship[] {
  const relationships: TagRelationship[] = [];
  const tagMap = new Map(tagStats.map(stat => [stat.fullPath, stat]));
  
  for (const stat of tagStats) {
    const hierarchy = stat.fullPath.split('/');
    
    // Parent relationships
    if (stat.parentTag) {
      const parentStat = tagMap.get(stat.parentTag);
      if (parentStat) {
        relationships.push({
          fromTag: stat.fullPath,
          toTag: stat.parentTag,
          relationshipType: TagRelationshipType.Parent,
          strength: Math.min(stat.count, parentStat.count) / Math.max(stat.count, parentStat.count)
        });
      }
    }
    
    // Child relationships
    for (const childTag of stat.childTags) {
      const childStat = tagMap.get(childTag);
      if (childStat) {
        relationships.push({
          fromTag: stat.fullPath,
          toTag: childTag,
          relationshipType: TagRelationshipType.Child,
          strength: Math.min(stat.count, childStat.count) / Math.max(stat.count, childStat.count)
        });
      }
    }
    
    // Sibling relationships
    if (stat.parentTag) {
      const parentStat = tagMap.get(stat.parentTag);
      if (parentStat) {
        for (const siblingTag of parentStat.childTags) {
          if (siblingTag !== stat.fullPath) {
            const siblingStat = tagMap.get(siblingTag);
            if (siblingStat) {
              relationships.push({
                fromTag: stat.fullPath,
                toTag: siblingTag,
                relationshipType: TagRelationshipType.Sibling,
                strength: Math.min(stat.count, siblingStat.count) / Math.max(stat.count, siblingStat.count)
              });
            }
          }
        }
      }
    }
    
    // Related tags (based on co-occurrence)
    for (const related of stat.relatedTags.slice(0, 5)) { // Top 5 related tags
      if (!related.tag.includes('/') || !stat.fullPath.includes('/')) {
        relationships.push({
          fromTag: stat.fullPath,
          toTag: related.tag,
          relationshipType: TagRelationshipType.Related,
          strength: related.coOccurrence / stat.count
        });
      }
    }
  }
  
  return relationships;
}

/**
 * Suggest tags based on content analysis
 */
export function suggestTags(
  content: string,
  existingTagStats: TagStatistics[],
  options: {
    maxSuggestions?: number;
    minSimilarity?: number;
    includeSubtags?: boolean;
  } = {}
): Array<{ tag: string; confidence: number; reason: string }> {
  const {
    maxSuggestions = 10,
    minSimilarity = 0.3,
    includeSubtags = true
  } = options;
  
  if (!content || content.length === 0) {
    return [];
  }
  
  const suggestions: Array<{ tag: string; confidence: number; reason: string }> = [];
  const contentWords = extractWords(content);
  const contentWordsSet = new Set(contentWords.map(w => w.toLowerCase()));
  
  for (const tagStat of existingTagStats) {
    const tagWords = extractWords(tagStat.fullPath.replace(/\//g, ' '));
    const tagWordsSet = new Set(tagWords.map(w => w.toLowerCase()));
    
    // Calculate word similarity
    const intersection = new Set([...contentWordsSet].filter(w => tagWordsSet.has(w)));
    const union = new Set([...contentWordsSet, ...tagWordsSet]);
    const jaccardSimilarity = intersection.size / union.size;
    
    if (jaccardSimilarity >= minSimilarity) {
      let reason = 'Content similarity';
      let confidence = jaccardSimilarity;
      
      // Boost confidence for exact word matches
      if (intersection.size > 0) {
        confidence += 0.2 * (intersection.size / tagWords.length);
        reason = `Matches words: ${Array.from(intersection).join(', ')}`;
      }
      
      // Consider tag popularity
      const popularityBoost = Math.log(tagStat.count + 1) / Math.log(Math.max(...existingTagStats.map(s => s.count)) + 1);
      confidence += popularityBoost * 0.1;
      
      suggestions.push({
        tag: tagStat.fullPath,
        confidence: Math.min(confidence, 1.0),
        reason
      });
    }
  }
  
  return suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxSuggestions);
}

/**
 * Validate tag name format
 */
export function validateTagName(tagName: string): boolean {
  if (!tagName || tagName.length === 0) {
    return false;
  }
  
  if (tagName.length > TAG_VALIDATION.MAX_NAME_LENGTH) {
    return false;
  }
  
  if (!TAG_VALIDATION.VALID_HIERARCHY.test(tagName)) {
    return false;
  }
  
  const parts = tagName.split('/');
  if (parts.length > TAG_VALIDATION.MAX_DEPTH) {
    return false;
  }
  
  return parts.every(part => 
    part.length > 0 && 
    part.length <= TAG_VALIDATION.MAX_NAME_LENGTH &&
    TAG_VALIDATION.VALID_NAME.test(part)
  );
}

/**
 * Normalize tag name for consistency
 */
export function normalizeTagName(tagName: string): string {
  return tagName
    .toLowerCase()
    .replace(/[^a-z0-9_/-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/\/+/g, '/');
}

// ========== Helper Functions ==========

/**
 * Extract words from text for similarity analysis
 */
function extractWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3)
    .filter(word => !isStopWord(word));
}

/**
 * Check if word is a stop word
 */
function isStopWord(word: string): boolean {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
  ]);
  
  return stopWords.has(word.toLowerCase());
}