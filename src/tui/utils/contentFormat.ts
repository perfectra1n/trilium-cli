/**
 * Content format detection and conversion utilities
 * Based on the Rust implementation
 */

import type { Note } from '../../types/api.js';
import { ContentFormat, type ContentConversionResult } from '../types/index.js';

/**
 * Content format handler for bidirectional conversion between formats
 */
export class ContentFormatHandler {
  /**
   * Detect content format from note metadata and content
   */
  static detectFormat(note: Note, content: string): ContentFormat {
    // First check MIME type from note metadata
    if (note.mime) {
      if (note.mime.includes('html')) {
        return ContentFormat.Html;
      }
      if (note.mime.includes('markdown') || note.mime.includes('md')) {
        return ContentFormat.Markdown;
      }
    }
    
    // Check note type
    if (note.type === 'text') {
      // Analyze content for HTML tags
      if (this.looksLikeHtml(content)) {
        return ContentFormat.Html;
      }
      // Check for markdown patterns
      if (this.looksLikeMarkdown(content)) {
        return ContentFormat.Markdown;
      }
    }
    
    return ContentFormat.PlainText;
  }
  
  /**
   * Check if content looks like HTML
   */
  static looksLikeHtml(content: string): boolean {
    const htmlIndicators = [
      '<html>', '<body>', '<div>', '<p>', '<span>', '<h1>', '<h2>', '<h3>',
      '<strong>', '<em>', '<a href=', '<img', '<ul>', '<ol>', '<li>',
      '<table>', '<tr>', '<td>', '<th>', '<br>', '<br/>', '&nbsp;', '&amp;',
      '&lt;', '&gt;', '&quot;'
    ];
    
    const contentLower = content.toLowerCase();
    return htmlIndicators.some(indicator => contentLower.includes(indicator));
  }
  
  /**
   * Check if content looks like markdown
   */
  static looksLikeMarkdown(content: string): boolean {
    const markdownIndicators = [
      /^#+\s/m,           // Headers
      /\*\*.*?\*\*/,      // Bold
      /__.*?__/,          // Bold
      /(?<!\*)\*(?!\*).+?\*(?!\*)/,  // Italic (not bold)
      /_.*?_/,            // Italic
      /```/,              // Code blocks
      /`[^`]+`/,          // Inline code
      /^[-*+]\s/m,        // Unordered lists
      /^\d+\.\s/m,        // Ordered lists
      /^\[[x\s]\]/m,      // Checkboxes
      /\[.+?\]\(.+?\)/,   // Links
    ];
    
    return markdownIndicators.some(pattern => pattern.test(content));
  }
  
  /**
   * Convert content for editing in external editor
   */
  static prepareForEditing(
    note: Note, 
    content: string
  ): ContentConversionResult {
    const originalFormat = this.detectFormat(note, content);
    let editingFormat = originalFormat;
    let editableContent = content;
    
    // Convert HTML to Markdown for easier editing
    if (originalFormat === ContentFormat.Html) {
      editingFormat = ContentFormat.Markdown;
      editableContent = this.htmlToMarkdown(content);
    }
    
    return {
      content: editableContent,
      originalFormat,
      editingFormat,
    };
  }
  
  /**
   * Convert content back after editing
   */
  static prepareForSaving(
    conversionResult: ContentConversionResult,
    editedContent: string
  ): string {
    // If we converted from HTML to Markdown for editing,
    // convert back to HTML for saving
    if (
      conversionResult.originalFormat === ContentFormat.Html && 
      conversionResult.editingFormat === ContentFormat.Markdown
    ) {
      return this.markdownToHtml(editedContent);
    }
    
    return editedContent;
  }
  
  /**
   * Convert HTML to Markdown (basic implementation)
   */
  static htmlToMarkdown(html: string): string {
    // Basic HTML to Markdown conversion
    let markdown = html;
    
    // Headers
    markdown = markdown.replace(/<h([1-6]).*?>(.*?)<\/h[1-6]>/gi, (_, level, text) => {
      const hashes = '#'.repeat(parseInt(level));
      return `${hashes} ${text.trim()}`;
    });
    
    // Bold
    markdown = markdown.replace(/<(strong|b).*?>(.*?)<\/(strong|b)>/gi, '**$2**');
    
    // Italic
    markdown = markdown.replace(/<(em|i).*?>(.*?)<\/(em|i)>/gi, '*$2*');
    
    // Links
    markdown = markdown.replace(/<a.*?href=["'](.*?)["'].*?>(.*?)<\/a>/gi, '[$2]($1)');
    
    // Code blocks
    markdown = markdown.replace(/<pre.*?><code.*?>(.*?)<\/code><\/pre>/gis, '```\n$1\n```');
    
    // Inline code
    markdown = markdown.replace(/<code.*?>(.*?)<\/code>/gi, '`$1`');
    
    // Lists
    markdown = markdown.replace(/<ul.*?>(.*?)<\/ul>/gis, (_, content) => {
      return content.replace(/<li.*?>(.*?)<\/li>/gi, '- $1\n');
    });
    
    markdown = markdown.replace(/<ol.*?>(.*?)<\/ol>/gis, (_, content) => {
      let counter = 1;
      return content.replace(/<li.*?>(.*?)<\/li>/gi, () => `${counter++}. $1\n`);
    });
    
    // Paragraphs
    markdown = markdown.replace(/<p.*?>(.*?)<\/p>/gi, '$1\n\n');
    
    // Line breaks
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    
    // Remove remaining HTML tags
    markdown = markdown.replace(/<[^>]+>/g, '');
    
    // Decode HTML entities
    markdown = this.decodeHtmlEntities(markdown);
    
    return markdown.trim();
  }
  
  /**
   * Convert Markdown to HTML (basic implementation)
   */
  static markdownToHtml(markdown: string): string {
    let html = markdown;
    
    // Headers
    html = html.replace(/^#{6}\s+(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#{5}\s+(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Unordered lists
    html = html.replace(/^[-*+]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
    
    // Ordered lists
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    // Note: This is a simplified approach; proper list handling would be more complex
    
    // Paragraphs (simple approach)
    html = html.replace(/\n\n/g, '</p><p>');
    html = `<p>${html}</p>`;
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    return html;
  }
  
  /**
   * Decode common HTML entities
   */
  static decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
    };
    
    return text.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
      return entities[entity] || entity;
    });
  }
  
  /**
   * Sanitize filename for temporary editing files
   */
  static sanitizeFilename(name: string): string {
    return name
      .replace(/[/\\:*?"<>|]/g, '-') // Replace problematic characters
      .replace(/\s+/g, '_')          // Replace spaces with underscores
      .replace(/-+/g, '-')           // Collapse multiple dashes
      .replace(/^-+|-+$/g, '')       // Remove leading/trailing dashes
      .substring(0, 100);            // Limit length
  }
}