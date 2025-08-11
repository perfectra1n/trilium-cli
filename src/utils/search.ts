/**
 * Search Utilities
 * 
 * Provides advanced search functionality with fuzzy matching, result highlighting,
 * search query parsing, and performance optimizations.
 */

import type { 
  EntityId, 
  Note, 
  SearchResult, 
  EnhancedSearchResult, 
  SearchOptions, 
  TextHighlight, 
  HighlightedSnippet 
} from '../types/api.js';

/**
 * Search query parsing patterns
 */
const SEARCH_PATTERNS = {
  // Quoted strings for exact matches
  QUOTED: /"([^"]+)"/g,
  
  // Tag search: #tag or tag:value
  TAG: /#([a-zA-Z0-9_-]+)(?::([^#\s]+))?/g,
  
  // Field-specific search: field:value
  FIELD: /(\w+):([^\s]+)/g,
  
  // Boolean operators
  BOOLEAN: /\b(AND|OR|NOT)\b/gi,
  
  // Parentheses for grouping
  PARENTHESES: /[()]/g,
  
  // Wildcard patterns
  WILDCARD: /[*?]/g
} as const;

/**
 * Search field weights for relevance scoring
 */
const FIELD_WEIGHTS = {
  title: 3.0,
  content: 1.0,
  tags: 2.0,
  attributes: 1.5
} as const;

/**
 * Fuzzy matching configuration
 */
const FUZZY_CONFIG = {
  // Maximum Levenshtein distance for fuzzy matches
  maxDistance: 2,
  
  // Minimum match length for fuzzy search
  minLength: 3,
  
  // Fuzzy match score penalty
  fuzzyPenalty: 0.5
} as const;

/**
 * Performance limits
 */
const PERFORMANCE_LIMITS = {
  maxResults: 1000,
  maxSnippets: 5,
  maxContextLines: 3,
  searchTimeout: 30000 // 30 seconds
} as const;

/**
 * Parsed search query structure
 */
export interface ParsedSearchQuery {
  terms: string[];
  exactPhrases: string[];
  tags: Array<{ name: string; value?: string }>;
  fieldFilters: Array<{ field: string; value: string }>;
  booleanOperators: string[];
  hasWildcards: boolean;
  isComplex: boolean;
}

/**
 * Search context for highlighting
 */
export interface SearchContext {
  query: string;
  options: SearchOptions;
  startTime: number;
  resultsCount: number;
  searchDuration: number;
}

/**
 * Advanced search configuration
 */
export interface AdvancedSearchConfig {
  enableFuzzySearch: boolean;
  enableRanking: boolean;
  enableHighlighting: boolean;
  maxResults: number;
  contextLines: number;
  highlightMarkers: {
    start: string;
    end: string;
  };
}

/**
 * Default search configuration
 */
export const DEFAULT_SEARCH_CONFIG: AdvancedSearchConfig = {
  enableFuzzySearch: true,
  enableRanking: true,
  enableHighlighting: true,
  maxResults: 100,
  contextLines: 2,
  highlightMarkers: {
    start: '**',
    end: '**'
  }
};

/**
 * Parse search query into structured components
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  if (!query || query.trim().length === 0) {
    return {
      terms: [],
      exactPhrases: [],
      tags: [],
      fieldFilters: [],
      booleanOperators: [],
      hasWildcards: false,
      isComplex: false
    };
  }
  
  const exactPhrases: string[] = [];
  const tags: Array<{ name: string; value?: string }> = [];
  const fieldFilters: Array<{ field: string; value: string }> = [];
  const booleanOperators: string[] = [];
  
  let workingQuery = query;
  
  // Extract quoted phrases
  let match: RegExpExecArray | null;
  SEARCH_PATTERNS.QUOTED.lastIndex = 0;
  while ((match = SEARCH_PATTERNS.QUOTED.exec(query)) !== null) {
    exactPhrases.push(match[1]);
    workingQuery = workingQuery.replace(match[0], '');
  }
  
  // Extract tags
  SEARCH_PATTERNS.TAG.lastIndex = 0;
  while ((match = SEARCH_PATTERNS.TAG.exec(query)) !== null) {
    tags.push({
      name: match[1],
      value: match[2] || undefined
    });
    workingQuery = workingQuery.replace(match[0], '');
  }
  
  // Extract field filters (excluding already processed tags)
  SEARCH_PATTERNS.FIELD.lastIndex = 0;
  while ((match = SEARCH_PATTERNS.FIELD.exec(workingQuery)) !== null) {
    const field = match[1].toLowerCase();
    if (field !== 'tag' && !tags.find(t => t.name === field)) {
      fieldFilters.push({
        field,
        value: match[2]
      });
    }
    workingQuery = workingQuery.replace(match[0], '');
  }
  
  // Extract boolean operators
  SEARCH_PATTERNS.BOOLEAN.lastIndex = 0;
  while ((match = SEARCH_PATTERNS.BOOLEAN.exec(query)) !== null) {
    booleanOperators.push(match[1].toUpperCase());
  }
  
  // Clean up remaining terms
  const remainingTerms = workingQuery
    .replace(SEARCH_PATTERNS.BOOLEAN, '')
    .replace(SEARCH_PATTERNS.PARENTHESES, '')
    .split(/\s+/)
    .filter(term => term.length > 0)
    .map(term => term.trim());
  
  const hasWildcards = SEARCH_PATTERNS.WILDCARD.test(query);
  const isComplex = exactPhrases.length > 0 || 
                    tags.length > 0 || 
                    fieldFilters.length > 0 || 
                    booleanOperators.length > 0 || 
                    hasWildcards;
  
  return {
    terms: remainingTerms,
    exactPhrases,
    tags,
    fieldFilters,
    booleanOperators,
    hasWildcards,
    isComplex
  };
}

/**
 * Perform advanced search with ranking and highlighting
 */
export function performAdvancedSearch(
  notes: Note[],
  query: string,
  options: Partial<SearchOptions> = {},
  config: Partial<AdvancedSearchConfig> = {}
): EnhancedSearchResult[] {
  const startTime = Date.now();
  const searchConfig = { ...DEFAULT_SEARCH_CONFIG, ...config };
  const parsedQuery = parseSearchQuery(query);
  
  if (parsedQuery.terms.length === 0 && parsedQuery.exactPhrases.length === 0) {
    return [];
  }
  
  const results: EnhancedSearchResult[] = [];
  const seenNoteIds = new Set<EntityId>();
  
  for (const note of notes) {
    // Skip if already processed or no searchable content
    if (seenNoteIds.has(note.noteId) || (!note.content && !note.title)) {
      continue;
    }
    seenNoteIds.add(note.noteId);
    
    // Check timeout
    if (Date.now() - startTime > PERFORMANCE_LIMITS.searchTimeout) {
      break;
    }
    
    const matchResult = matchNote(note, parsedQuery, options, searchConfig);
    
    if (matchResult.isMatch && matchResult.score > 0) {
      results.push({
        ownerId: note.noteId,
        title: note.title,
        path: generateNotePath(note),
        score: matchResult.score,
        content: options.includeContent ? note.content : undefined,
        highlightedSnippets: matchResult.snippets,
        contextLines: searchConfig.contextLines
      });
    }
    
    // Limit results for performance
    if (results.length >= searchConfig.maxResults) {
      break;
    }
  }
  
  // Sort by relevance score if ranking is enabled
  if (searchConfig.enableRanking) {
    results.sort((a, b) => b.score - a.score);
  }
  
  return results.slice(0, searchConfig.maxResults);
}

/**
 * Perform fuzzy search with Levenshtein distance
 */
export function performFuzzySearch(
  notes: Note[],
  query: string,
  maxDistance = FUZZY_CONFIG.maxDistance
): Array<{ note: Note; distance: number; score: number }> {
  if (!query || query.length < FUZZY_CONFIG.minLength) {
    return [];
  }
  
  const results: Array<{ note: Note; distance: number; score: number }> = [];
  const queryLower = query.toLowerCase();
  
  for (const note of notes) {
    const titleDistance = calculateLevenshteinDistance(
      note.title.toLowerCase(),
      queryLower
    );
    
    if (titleDistance <= maxDistance) {
      const score = 1.0 - (titleDistance / Math.max(note.title.length, query.length)) * FUZZY_CONFIG.fuzzyPenalty;
      results.push({ note, distance: titleDistance, score });
    }
    
    // Also check content for fuzzy matches if available
    if (note.content) {
      const words = note.content.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length >= FUZZY_CONFIG.minLength) {
          const wordDistance = calculateLevenshteinDistance(word, queryLower);
          if (wordDistance <= maxDistance) {
            const score = 0.5 - (wordDistance / Math.max(word.length, query.length)) * FUZZY_CONFIG.fuzzyPenalty;
            results.push({ note, distance: wordDistance, score });
            break; // Only count first fuzzy match in content
          }
        }
      }
    }
  }
  
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Highlight search terms in text
 */
export function highlightSearchTerms(
  text: string,
  searchTerms: string[],
  markers: { start: string; end: string } = DEFAULT_SEARCH_CONFIG.highlightMarkers
): { highlightedText: string; highlights: TextHighlight[] } {
  if (!text || searchTerms.length === 0) {
    return { highlightedText: text, highlights: [] };
  }
  
  const highlights: TextHighlight[] = [];
  let highlightedText = text;
  let offset = 0;
  
  // Create combined regex for all search terms
  const escapedTerms = searchTerms
    .filter(term => term.length > 0)
    .map(term => escapeRegex(term))
    .join('|');
  
  if (!escapedTerms) {
    return { highlightedText: text, highlights: [] };
  }
  
  const regex = new RegExp(`(${escapedTerms})`, 'gi');
  let match: RegExpExecArray | null;
  
  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    const matchText = match[1];
    const start = match.index;
    const end = start + matchText.length;
    
    highlights.push({
      start,
      end,
      matchText
    });
    
    // Replace in highlighted text
    const highlightStart = start + offset;
    const highlightEnd = end + offset;
    const highlighted = markers.start + matchText + markers.end;
    
    highlightedText = highlightedText.slice(0, highlightStart) + 
                     highlighted + 
                     highlightedText.slice(highlightEnd);
    
    offset += markers.start.length + markers.end.length;
  }
  
  return { highlightedText, highlights };
}

/**
 * Extract highlighted snippets with context
 */
export function extractHighlightedSnippets(
  content: string,
  searchTerms: string[],
  contextLines = 2,
  maxSnippets = PERFORMANCE_LIMITS.maxSnippets
): HighlightedSnippet[] {
  if (!content || searchTerms.length === 0) {
    return [];
  }
  
  const lines = content.split('\n');
  const snippets: HighlightedSnippet[] = [];
  const processedLines = new Set<number>();
  
  // Find lines containing search terms
  for (let lineNumber = 0; lineNumber < lines.length && snippets.length < maxSnippets; lineNumber++) {
    const line = lines[lineNumber];
    const hasMatch = searchTerms.some(term => 
      line.toLowerCase().includes(term.toLowerCase())
    );
    
    if (hasMatch && !processedLines.has(lineNumber)) {
      const { highlightedText, highlights } = highlightSearchTerms(line, searchTerms);
      
      const contextStart = Math.max(0, lineNumber - contextLines);
      const contextEnd = Math.min(lines.length - 1, lineNumber + contextLines);
      
      // Mark processed lines to avoid duplicates
      for (let i = contextStart; i <= contextEnd; i++) {
        processedLines.add(i);
      }
      
      snippets.push({
        lineNumber: lineNumber + 1, // 1-based line numbers
        content: highlightedText,
        highlights,
        contextBefore: lines.slice(contextStart, lineNumber),
        contextAfter: lines.slice(lineNumber + 1, contextEnd + 1)
      });
    }
  }
  
  return snippets;
}

/**
 * Build search suggestions based on note content
 */
export function buildSearchSuggestions(
  notes: Note[],
  partialQuery: string,
  maxSuggestions = 10
): string[] {
  if (!partialQuery || partialQuery.length < 2) {
    return [];
  }
  
  const suggestions = new Set<string>();
  const queryLower = partialQuery.toLowerCase();
  
  // Extract words from note titles and content
  const words = new Set<string>();
  
  for (const note of notes) {
    // Add title words
    note.title.toLowerCase().split(/\s+/).forEach(word => {
      const cleaned = word.replace(/[^\w]/g, '');
      if (cleaned.length >= 3) {
        words.add(cleaned);
      }
    });
    
    // Add content words (sample for performance)
    if (note.content) {
      const contentWords = note.content.toLowerCase()
        .split(/\s+/)
        .slice(0, 100); // Limit for performance
        
      contentWords.forEach(word => {
        const cleaned = word.replace(/[^\w]/g, '');
        if (cleaned.length >= 3) {
          words.add(cleaned);
        }
      });
    }
  }
  
  // Find matching words
  for (const word of words) {
    if (word.startsWith(queryLower) && word !== queryLower) {
      suggestions.add(word);
      
      if (suggestions.size >= maxSuggestions) {
        break;
      }
    }
  }
  
  return Array.from(suggestions).slice(0, maxSuggestions);
}

/**
 * Get search statistics
 */
export function getSearchStatistics(results: EnhancedSearchResult[]): {
  totalResults: number;
  averageScore: number;
  topScore: number;
  scoreDistribution: { range: string; count: number }[];
} {
  if (results.length === 0) {
    return {
      totalResults: 0,
      averageScore: 0,
      topScore: 0,
      scoreDistribution: []
    };
  }
  
  const scores = results.map(r => r.score);
  const totalResults = results.length;
  const averageScore = scores.reduce((sum, score) => sum + score, 0) / totalResults;
  const topScore = Math.max(...scores);
  
  // Create score distribution buckets
  const buckets = [
    { range: '0.0-0.2', count: 0 },
    { range: '0.2-0.4', count: 0 },
    { range: '0.4-0.6', count: 0 },
    { range: '0.6-0.8', count: 0 },
    { range: '0.8-1.0', count: 0 }
  ];
  
  for (const score of scores) {
    const bucketIndex = Math.min(Math.floor(score * 5), 4);
    buckets[bucketIndex].count++;
  }
  
  return {
    totalResults,
    averageScore,
    topScore,
    scoreDistribution: buckets
  };
}

// ========== Helper Functions ==========

/**
 * Match a note against parsed search query
 */
function matchNote(
  note: Note,
  query: ParsedSearchQuery,
  options: Partial<SearchOptions>,
  config: AdvancedSearchConfig
): { isMatch: boolean; score: number; snippets: HighlightedSnippet[] } {
  let totalScore = 0;
  let hasMatch = false;
  const snippets: HighlightedSnippet[] = [];
  const allTerms = [...query.terms, ...query.exactPhrases];
  
  // Check title matches
  const titleMatches = checkTextMatches(note.title, query);
  if (titleMatches.hasMatch) {
    hasMatch = true;
    totalScore += titleMatches.score * FIELD_WEIGHTS.title;
  }
  
  // Check content matches
  if (note.content) {
    const contentMatches = checkTextMatches(note.content, query);
    if (contentMatches.hasMatch) {
      hasMatch = true;
      totalScore += contentMatches.score * FIELD_WEIGHTS.content;
      
      // Extract snippets if highlighting is enabled
      if (config.enableHighlighting && allTerms.length > 0) {
        const contentSnippets = extractHighlightedSnippets(
          note.content,
          allTerms,
          config.contextLines,
          PERFORMANCE_LIMITS.maxSnippets
        );
        snippets.push(...contentSnippets);
      }
    }
  }
  
  // TODO: Add tag and attribute matching when available in note structure
  
  return {
    isMatch: hasMatch,
    score: config.enableRanking ? totalScore : hasMatch ? 1.0 : 0,
    snippets
  };
}

/**
 * Check text matches against search query
 */
function checkTextMatches(
  text: string,
  query: ParsedSearchQuery
): { hasMatch: boolean; score: number } {
  if (!text) {
    return { hasMatch: false, score: 0 };
  }
  
  const textLower = text.toLowerCase();
  let score = 0;
  let hasMatch = false;
  
  // Check exact phrases (highest priority)
  for (const phrase of query.exactPhrases) {
    if (textLower.includes(phrase.toLowerCase())) {
      hasMatch = true;
      score += 2.0; // High score for exact phrases
    }
  }
  
  // Check individual terms
  for (const term of query.terms) {
    const termLower = term.toLowerCase();
    if (textLower.includes(termLower)) {
      hasMatch = true;
      score += 1.0;
      
      // Bonus for word boundaries
      const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(termLower)}\\b`, 'i');
      if (wordBoundaryRegex.test(text)) {
        score += 0.5;
      }
    }
  }
  
  return { hasMatch, score };
}

/**
 * Calculate Levenshtein distance between two strings
 */
function calculateLevenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  // Initialize matrix
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Generate note path for display
 */
function generateNotePath(note: Note): string {
  // This would need to be enhanced with actual parent-child relationships
  // For now, just return the note ID as a simple path
  return note.noteId;
}

/**
 * Escape regex special characters
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}