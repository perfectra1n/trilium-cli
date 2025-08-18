/**
 * Quick Capture Utilities
 * 
 * Provides quick note creation utilities with content format detection,
 * inbox management, metadata extraction, and intelligent tagging.
 */

import type { EntityId, Note, QuickCaptureRequest, NoteType, CreateNoteDef } from '../types/api.js';

import { parseTagsFromContent } from './tags.js';

/**
 * Content format detection patterns
 */
const FORMAT_PATTERNS = {
  // Markdown patterns
  MARKDOWN_HEADER: /^#{1,6}\s+/m,
  MARKDOWN_LIST: /^[-*+]\s+/m,
  MARKDOWN_CODE: /```[\s\S]*?```/,
  MARKDOWN_LINK: /\[([^\]]+)\]\(([^)]+)\)/,
  MARKDOWN_EMPHASIS: /[*_]{1,2}[^*_]+[*_]{1,2}/,
  
  // Code patterns
  CODE_IMPORT: /^(import|from|require)\s+/m,
  CODE_FUNCTION: /^(function|def|class|public|private)\s+/m,
  CODE_COMMENT: /^(\/\/|#|\/\*|\*)/m,
  CODE_BRACKET: /[{}[\]();]/,
  
  // HTML patterns
  HTML_TAG: /<\/?[a-zA-Z][^>]*>/,
  HTML_ENTITY: /&[a-zA-Z0-9#]+;/,
  
  // URL patterns
  URL_HTTP: /https?:\/\/[^\s]+/,
  URL_FTP: /ftp:\/\/[^\s]+/,
  URL_EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  
  // Task patterns
  TODO_CHECKBOX: /^[-*+]?\s*\[[ xX]\]\s+/m,
  TODO_DASH: /^[-*+]\s+TODO:?/mi,
  
  // Date/time patterns
  DATE_ISO: /\b\d{4}-\d{2}-\d{2}\b/,
  DATE_US: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
  TIME_24H: /\b\d{1,2}:\d{2}(:\d{2})?\b/
} as const;

/**
 * Content format detection result
 */
export interface ContentFormat {
  type: NoteType;
  mime: string;
  confidence: number;
  indicators: string[];
}

/**
 * Quick capture configuration
 */
export interface QuickCaptureConfig {
  defaultInboxNoteId?: EntityId;
  autoTagging: boolean;
  formatDetection: boolean;
  metadataExtraction: boolean;
  batchSize: number;
  processInterval: number;
  enableSmartTitles: boolean;
  maxTitleLength: number;
}

/**
 * Default quick capture configuration
 */
export const DEFAULT_QUICK_CAPTURE_CONFIG: QuickCaptureConfig = {
  autoTagging: true,
  formatDetection: true,
  metadataExtraction: true,
  batchSize: 10,
  processInterval: 1000, // 1 second
  enableSmartTitles: true,
  maxTitleLength: 100
};

/**
 * Extracted metadata from content
 */
export interface ExtractedMetadata {
  title?: string;
  tags: string[];
  urls: string[];
  emails: string[];
  dates: string[];
  todos: string[];
  keywords: string[];
  language?: string;
  estimatedReadTime: number;
}

/**
 * Quick capture batch item
 */
export interface QuickCaptureItem {
  id: string;
  content: string;
  metadata: ExtractedMetadata;
  format: ContentFormat;
  timestamp: number;
  source?: string;
}

/**
 * Quick capture batch processor
 */
export class QuickCaptureBatch {
  private items: QuickCaptureItem[] = [];
  private processing = false;
  private config: QuickCaptureConfig;
  
  constructor(config: Partial<QuickCaptureConfig> = {}) {
    this.config = { ...DEFAULT_QUICK_CAPTURE_CONFIG, ...config };
  }
  
  /**
   * Add item to batch
   */
  add(content: string, source?: string): QuickCaptureItem {
    const item: QuickCaptureItem = {
      id: generateId(),
      content,
      metadata: this.config.metadataExtraction ? extractMetadata(content) : { tags: [], urls: [], emails: [], dates: [], todos: [], keywords: [], estimatedReadTime: 0 },
      format: this.config.formatDetection ? detectContentFormat(content) : { type: 'text', mime: 'text/plain', confidence: 1.0, indicators: [] },
      timestamp: Date.now(),
      source
    };
    
    this.items.push(item);
    return item;
  }
  
  /**
   * Get pending items
   */
  getPendingItems(): QuickCaptureItem[] {
    return [...this.items];
  }
  
  /**
   * Remove processed items
   */
  removeItems(itemIds: string[]): void {
    this.items = this.items.filter(item => !itemIds.includes(item.id));
  }
  
  /**
   * Clear all items
   */
  clear(): void {
    this.items = [];
  }
  
  /**
   * Get batch size
   */
  size(): number {
    return this.items.length;
  }
}

/**
 * Detect content format with confidence scoring
 */
export function detectContentFormat(content: string): ContentFormat {
  if (!content || content.trim().length === 0) {
    return {
      type: 'text',
      mime: 'text/plain',
      confidence: 1.0,
      indicators: []
    };
  }
  
  const indicators: string[] = [];
  let markdownScore = 0;
  let codeScore = 0;
  let htmlScore = 0;
  
  // Check for Markdown indicators
  if (FORMAT_PATTERNS.MARKDOWN_HEADER.test(content)) {
    markdownScore += 3;
    indicators.push('headers');
  }
  
  if (FORMAT_PATTERNS.MARKDOWN_LIST.test(content)) {
    markdownScore += 2;
    indicators.push('lists');
  }
  
  if (FORMAT_PATTERNS.MARKDOWN_CODE.test(content)) {
    markdownScore += 3;
    indicators.push('code_blocks');
  }
  
  if (FORMAT_PATTERNS.MARKDOWN_LINK.test(content)) {
    markdownScore += 2;
    indicators.push('links');
  }
  
  if (FORMAT_PATTERNS.MARKDOWN_EMPHASIS.test(content)) {
    markdownScore += 1;
    indicators.push('emphasis');
  }
  
  // Check for code indicators
  if (FORMAT_PATTERNS.CODE_IMPORT.test(content)) {
    codeScore += 4;
    indicators.push('imports');
  }
  
  if (FORMAT_PATTERNS.CODE_FUNCTION.test(content)) {
    codeScore += 3;
    indicators.push('functions');
  }
  
  if (FORMAT_PATTERNS.CODE_COMMENT.test(content)) {
    codeScore += 1;
    indicators.push('comments');
  }
  
  const bracketCount = (content.match(FORMAT_PATTERNS.CODE_BRACKET) || []).length;
  if (bracketCount > content.length / 20) { // High bracket density
    codeScore += 2;
    indicators.push('brackets');
  }
  
  // Check for HTML indicators
  if (FORMAT_PATTERNS.HTML_TAG.test(content)) {
    htmlScore += 4;
    indicators.push('html_tags');
  }
  
  if (FORMAT_PATTERNS.HTML_ENTITY.test(content)) {
    htmlScore += 2;
    indicators.push('html_entities');
  }
  
  // Determine format based on scores
  const maxScore = Math.max(markdownScore, codeScore, htmlScore);
  let type: NoteType = 'text';
  let mime = 'text/plain';
  
  if (maxScore > 0) {
    if (htmlScore === maxScore) {
      type = 'text';
      mime = 'text/html';
    } else if (markdownScore === maxScore) {
      type = 'text';
      mime = 'text/markdown';
    } else if (codeScore === maxScore) {
      type = 'code';
      mime = detectCodeLanguage(content);
    }
  }
  
  // Special cases
  if (FORMAT_PATTERNS.TODO_CHECKBOX.test(content) || FORMAT_PATTERNS.TODO_DASH.test(content)) {
    indicators.push('todos');
  }
  
  const confidence = maxScore > 0 ? Math.min(maxScore / 10, 1.0) : 0.5;
  
  return {
    type,
    mime,
    confidence,
    indicators
  };
}

/**
 * Extract metadata from content
 */
export function extractMetadata(content: string): ExtractedMetadata {
  if (!content || content.trim().length === 0) {
    return {
      tags: [],
      urls: [],
      emails: [],
      dates: [],
      todos: [],
      keywords: [],
      estimatedReadTime: 0
    };
  }
  
  // Extract tags using existing tag parser
  const parsedTags = parseTagsFromContent(content);
  const tags = parsedTags.map(tag => tag.fullName);
  
  // Extract URLs
  const urls: string[] = [];
  const httpMatches = content.match(new RegExp(FORMAT_PATTERNS.URL_HTTP.source, 'g'));
  const ftpMatches = content.match(new RegExp(FORMAT_PATTERNS.URL_FTP.source, 'g'));
  if (httpMatches) urls.push(...httpMatches);
  if (ftpMatches) urls.push(...ftpMatches);
  
  // Extract email addresses
  const emails = content.match(new RegExp(FORMAT_PATTERNS.URL_EMAIL.source, 'g')) || [];
  
  // Extract dates
  const dates: string[] = [];
  const isoDateMatches = content.match(new RegExp(FORMAT_PATTERNS.DATE_ISO.source, 'g'));
  const usDateMatches = content.match(new RegExp(FORMAT_PATTERNS.DATE_US.source, 'g'));
  if (isoDateMatches) dates.push(...isoDateMatches);
  if (usDateMatches) dates.push(...usDateMatches);
  
  // Extract todos
  const todos: string[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    if (FORMAT_PATTERNS.TODO_CHECKBOX.test(line) || FORMAT_PATTERNS.TODO_DASH.test(line)) {
      todos.push(line.trim());
    }
  }
  
  // Extract keywords (simple word frequency analysis)
  const keywords = extractKeywords(content, 10);
  
  // Generate smart title
  const title = generateSmartTitle(content);
  
  // Calculate estimated read time (average 200 words per minute)
  const wordCount = content.split(/\s+/).length;
  const estimatedReadTime = Math.ceil(wordCount / 200);
  
  return {
    title,
    tags,
    urls,
    emails,
    dates,
    todos,
    keywords,
    estimatedReadTime
  };
}

/**
 * Generate smart title from content
 */
export function generateSmartTitle(content: string, maxLength = 100): string {
  if (!content || content.trim().length === 0) {
    return `Note ${new Date().toLocaleDateString()}`;
  }
  
  const lines = content.split('\n').filter(line => line.trim().length > 0);
  
  // Check for existing title patterns
  for (const line of lines.slice(0, 5)) { // Check first 5 lines
    const trimmed = line.trim();
    
    // Markdown header
    const headerMatch = trimmed.match(/^#{1,6}\s+(.+)/);
    if (headerMatch && headerMatch[1]) {
      return truncateText(headerMatch[1], maxLength);
    }
    
    // First substantial line
    if (trimmed.length >= 10 && trimmed.length <= maxLength) {
      // Remove markdown formatting
      const cleaned = trimmed
        .replace(/[*_`#]/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
        .trim();
      
      if (cleaned.length >= 10) {
        return truncateText(cleaned, maxLength);
      }
    }
  }
  
  // Fallback: use first sentence
  const sentences = content.split(/[.!?]+/);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length >= 10) {
      return truncateText(trimmed, maxLength);
    }
  }
  
  // Ultimate fallback: timestamp-based
  return `Note ${new Date().toLocaleString()}`;
}

/**
 * Process quick capture request
 */
export function processQuickCapture(
  request: QuickCaptureRequest,
  config: Partial<QuickCaptureConfig> = {}
): CreateNoteDef {
  const cfg = { ...DEFAULT_QUICK_CAPTURE_CONFIG, ...config };
  
  // Extract metadata if enabled
  const metadata = cfg.metadataExtraction ? extractMetadata(request.content) : {
    tags: [],
    urls: [],
    emails: [],
    dates: [],
    todos: [],
    keywords: [],
    estimatedReadTime: 0
  };
  
  // Detect format if enabled
  const format = cfg.formatDetection ? detectContentFormat(request.content) : {
    type: 'text' as NoteType,
    mime: 'text/plain',
    confidence: 1.0,
    indicators: []
  };
  
  // Generate title
  const title = request.title || 
                 (cfg.enableSmartTitles ? metadata.title : undefined) || 
                 generateSmartTitle(request.content, cfg.maxTitleLength);
  
  // Combine tags
  const allTags = [
    ...request.tags,
    ...(cfg.autoTagging ? metadata.tags : [])
  ];
  const uniqueTags = Array.from(new Set(allTags));
  
  // Create note definition
  const noteDef: CreateNoteDef = {
    parentNoteId: request.inboxNoteId || cfg.defaultInboxNoteId || 'root',
    title,
    type: format.type,
    content: request.content,
    mime: format.mime
  };
  
  return noteDef;
}

/**
 * Create inbox note structure
 */
export function createInboxStructure(
  parentNoteId: EntityId = 'root',
  date: Date = new Date()
): CreateNoteDef[] {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;
  
  return [
    {
      parentNoteId,
      title: '📥 Inbox',
      type: 'text',
      content: 'Quick capture inbox for temporary notes and ideas.'
    },
    {
      parentNoteId: 'inbox', // This would be resolved to actual ID
      title: `📅 ${dateString}`,
      type: 'text',
      content: `Daily inbox for ${dateString}\n\nQuick notes and captures:`
    }
  ];
}

/**
 * Batch process multiple quick captures
 */
export async function batchProcessCaptures(
  items: QuickCaptureItem[],
  config: Partial<QuickCaptureConfig> = {},
  createNoteFunction: (noteDef: CreateNoteDef) => Promise<Note>
): Promise<Array<{ item: QuickCaptureItem; note?: Note; error?: string }>> {
  const cfg = { ...DEFAULT_QUICK_CAPTURE_CONFIG, ...config };
  const results: Array<{ item: QuickCaptureItem; note?: Note; error?: string }> = [];
  
  // Process in batches
  for (let i = 0; i < items.length; i += cfg.batchSize) {
    const batch = items.slice(i, i + cfg.batchSize);
    const batchPromises = batch.map(async item => {
      try {
        const request: QuickCaptureRequest = {
          content: item.content,
          tags: item.metadata.tags,
          title: item.metadata.title,
          inboxNoteId: cfg.defaultInboxNoteId,
          metadata: {
            source: item.source || 'quick-capture',
            timestamp: item.timestamp.toString(),
            format: item.format.type,
            confidence: item.format.confidence.toString()
          }
        };
        
        const noteDef = processQuickCapture(request, config);
        const note = await createNoteFunction(noteDef);
        
        return { item, note };
      } catch (error) {
        return { 
          item, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Add delay between batches
    if (i + cfg.batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, cfg.processInterval));
    }
  }
  
  return results;
}

// ========== Helper Functions ==========

/**
 * Detect programming language from code content
 */
function detectCodeLanguage(content: string): string {
  const languagePatterns = {
    'application/javascript': [/function\s+\w+/, /const\s+\w+\s*=/, /import\s+.*from/, /console\.log/],
    'text/x-python': [/def\s+\w+/, /import\s+\w+/, /print\s*\(/, /if\s+__name__\s*==\s*['"']__main__['"']/],
    'text/x-java': [/public\s+class/, /public\s+static\s+void\s+main/, /import\s+java\./],
    'text/x-csharp': [/using\s+System/, /public\s+class/, /Console\.WriteLine/],
    'text/x-cpp': [/#include\s*</, /int\s+main\s*\(/, /std::/],
    'application/json': [/^[\s]*[{[]/, /"[^"]*":\s*[^,}]+/],
    'application/x-sql': [/SELECT\s+.*FROM/i, /INSERT\s+INTO/i, /CREATE\s+TABLE/i],
    'text/css': [/[.#][\w-]+\s*\{/, /:\s*[^;]+;/],
    'text/html': [/<\/?[a-zA-Z][^>]*>/, /<!DOCTYPE/i]
  };
  
  for (const [mime, patterns] of Object.entries(languagePatterns)) {
    if (patterns.some(pattern => pattern.test(content))) {
      return mime;
    }
  }
  
  return 'text/plain';
}

/**
 * Extract keywords using simple frequency analysis
 */
function extractKeywords(content: string, maxKeywords: number): string[] {
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3)
    .filter(word => !isStopWord(word));
  
  const frequency = new Map<string, number>();
  for (const word of words) {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  }
  
  return Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
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
    'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'so', 'if', 'then', 'than', 'when', 'where', 'why', 'how', 'what',
    'which', 'who', 'whom', 'whose', 'all', 'any', 'both', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just'
  ]);
  
  return stopWords.has(word.toLowerCase());
}

/**
 * Truncate text to specified length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Generate unique ID for capture items
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}