/**
 * Markdown utilities for content conversion and detection
 */

/**
 * Convert HTML content to Markdown
 */
export function htmlToMarkdown(html: string): string {
  // Basic HTML to Markdown conversion
  // In a real implementation, you'd use a library like turndown
  let markdown = html;
  
  // Remove HTML tags (very basic implementation)
  markdown = markdown.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  markdown = markdown.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
  markdown = markdown.replace(/<p>/gi, '\n');
  markdown = markdown.replace(/<\/p>/gi, '\n');
  markdown = markdown.replace(/<h1>/gi, '# ');
  markdown = markdown.replace(/<\/h1>/gi, '\n');
  markdown = markdown.replace(/<h2>/gi, '## ');
  markdown = markdown.replace(/<\/h2>/gi, '\n');
  markdown = markdown.replace(/<h3>/gi, '### ');
  markdown = markdown.replace(/<\/h3>/gi, '\n');
  markdown = markdown.replace(/<strong>|<b>/gi, '**');
  markdown = markdown.replace(/<\/strong>|<\/b>/gi, '**');
  markdown = markdown.replace(/<em>|<i>/gi, '*');
  markdown = markdown.replace(/<\/em>|<\/i>/gi, '*');
  markdown = markdown.replace(/<code>/gi, '`');
  markdown = markdown.replace(/<\/code>/gi, '`');
  markdown = markdown.replace(/<[^>]*>/g, '');
  
  // Decode HTML entities
  markdown = markdown.replace(/&nbsp;/g, ' ');
  markdown = markdown.replace(/&lt;/g, '<');
  markdown = markdown.replace(/&gt;/g, '>');
  markdown = markdown.replace(/&amp;/g, '&');
  markdown = markdown.replace(/&quot;/g, '"');
  markdown = markdown.replace(/&#39;/g, "'");
  
  return markdown.trim();
}

/**
 * Convert Markdown to HTML
 */
export function markdownToHtml(markdown: string): string {
  // Basic Markdown to HTML conversion
  // In a real implementation, you'd use a library like marked
  let html = markdown;
  
  // Headers
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  
  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Code
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // Line breaks and paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';
  
  return html;
}

/**
 * Detect content type from content string
 */
export function detectContentType(content: string): 'html' | 'markdown' | 'text' {
  // Check for HTML tags
  if (/<[^>]+>/.test(content)) {
    return 'html';
  }
  
  // Check for Markdown patterns
  if (/^#{1,6}\s+/m.test(content) || /\*\*.*?\*\*/.test(content) || /\[.*?\]\(.*?\)/.test(content)) {
    return 'markdown';
  }
  
  return 'text';
}