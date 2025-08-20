import TurndownService from 'turndown';
import { marked } from 'marked';

// Initialize Turndown for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
  linkReferenceStyle: 'full'
});

// Add custom rules for better Trilium compatibility
turndownService.addRule('triliumLinks', {
  filter: function (node) {
    return (
      node.nodeName === 'A' &&
      node.getAttribute('href')?.startsWith('#') === true
    );
  },
  replacement: function (content, node) {
    const href = (node as HTMLElement).getAttribute('href');
    return `[${content}](${href})`;
  }
});

// Configure marked for Markdown to HTML conversion
marked.setOptions({
  breaks: true,
  gfm: true
});

/**
 * Convert HTML content to Markdown
 * @param html The HTML string to convert
 * @returns Markdown string
 */
export function htmlToMarkdown(html: string): string {
  if (!html || html.trim() === '') {
    return '';
  }

  try {
    // Handle common Trilium HTML patterns
    let processedHtml = html;
    
    // Preserve Trilium note links
    processedHtml = processedHtml.replace(
      /<a[^>]*href="#([^"]*)"[^>]*>([^<]*)<\/a>/gi,
      (match, noteId, text) => `<a href="#${noteId}">${text}</a>`
    );

    // Convert to markdown
    const markdown = turndownService.turndown(processedHtml);
    
    // Clean up excessive whitespace
    return markdown
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch (error) {
    console.error('Error converting HTML to Markdown:', error);
    // Return original HTML wrapped in a code block as fallback
    return `\`\`\`html\n${html}\n\`\`\``;
  }
}

/**
 * Convert Markdown content to HTML
 * @param markdown The Markdown string to convert
 * @returns HTML string
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown || markdown.trim() === '') {
    return '';
  }

  try {
    // Convert markdown to HTML
    let html = marked.parse(markdown) as string;
    
    // Post-process for Trilium compatibility
    // Ensure Trilium note links are preserved
    html = html.replace(
      /<a[^>]*href="#([^"]*)"[^>]*>([^<]*)<\/a>/gi,
      (match, noteId, text) => `<a href="#${noteId}">${text}</a>`
    );
    
    // Remove unnecessary paragraph tags around single lines if needed
    if (html.match(/^<p>.*<\/p>$/s) && !html.includes('\n')) {
      html = html.replace(/^<p>(.*)<\/p>$/, '$1');
    }
    
    return html.trim();
  } catch (error) {
    console.error('Error converting Markdown to HTML:', error);
    // Return original markdown wrapped in pre tags as fallback
    return `<pre>${markdown}</pre>`;
  }
}

/**
 * Detect if content is likely HTML or Markdown
 * @param content The content to analyze
 * @returns 'html' | 'markdown' | 'plain'
 */
export function detectContentType(content: string): 'html' | 'markdown' | 'plain' {
  if (!content) return 'plain';
  
  const htmlPatterns = [
    /<[a-z][\s\S]*>/i,
    /<\/[a-z]+>/i,
    /&[a-z]+;/i,
    /<br\s*\/?>/i
  ];
  
  const markdownPatterns = [
    /^#{1,6}\s+/m,
    /\*\*[^*]+\*\*/,
    /\[[^\]]+\]\([^)]+\)/,
    /^[-*+]\s+/m,
    /^\d+\.\s+/m,
    /^```/m,
    /^>/m
  ];
  
  const hasHtml = htmlPatterns.some(pattern => pattern.test(content));
  const hasMarkdown = markdownPatterns.some(pattern => pattern.test(content));
  
  if (hasHtml && !hasMarkdown) return 'html';
  if (hasMarkdown && !hasHtml) return 'markdown';
  if (hasHtml && hasMarkdown) return 'html'; // HTML takes precedence
  
  return 'plain';
}