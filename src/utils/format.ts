import { Table } from 'console-table-printer';
import chalk from 'chalk';

import type { OutputFormat } from '../types/common.js';

/**
 * Format data for output based on the specified format
 */
export function formatOutput(data: unknown, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    
    case 'table':
      return formatTable(data);
    
    case 'plain':
      return formatPlain(data);
    
    default:
      throw new Error(`Unknown output format: ${format}`);
  }
}

/**
 * Format data as a table
 */
function formatTable(data: unknown): string {
  if (Array.isArray(data) && data.length > 0) {
    const table = new Table({
      colorMap: {
        headerTop: 'cyan',
        headerBottom: 'cyan',
        headerLeft: 'cyan',
        headerRight: 'cyan',
        rowSeparator: 'gray',
      },
    });

    data.forEach(row => {
      if (typeof row === 'object' && row !== null) {
        table.addRow(row);
      } else {
        table.addRow({ value: row });
      }
    });

    return table.render();
  }

  if (typeof data === 'object' && data !== null) {
    const table = new Table();
    Object.entries(data).forEach(([key, value]) => {
      table.addRow({ Property: key, Value: String(value) });
    });
    return table.render();
  }

  return String(data);
}

/**
 * Format data as plain text
 */
function formatPlain(data: unknown): string {
  if (Array.isArray(data)) {
    return data.map(item => formatSingleItem(item)).join('\n');
  }
  
  return formatSingleItem(data);
}

/**
 * Format a single item for plain text output
 */
function formatSingleItem(item: unknown): string {
  if (typeof item === 'object' && item !== null) {
    return Object.entries(item)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('\n');
  }
  
  return String(item);
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format date in a user-friendly format
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

/**
 * Format duration in milliseconds to human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Truncate text to specified length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Highlight search terms in text
 */
export function highlightText(text: string, searchTerms: string[]): string {
  let highlighted = text;
  
  searchTerms.forEach(term => {
    const regex = new RegExp(`(${term})`, 'gi');
    highlighted = highlighted.replace(regex, chalk.yellow('$1'));
  });
  
  return highlighted;
}