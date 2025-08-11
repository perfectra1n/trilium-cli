/**
 * Template Processing Utilities
 * 
 * Provides secure template variable extraction, validation, and substitution
 * with built-in variables and comprehensive security validation.
 */

import type { EntityId, Template, TemplateVariable } from '../types/api.js';

/**
 * Template variable patterns with security validation
 */
const VARIABLE_PATTERNS = {
  // {{variable_name}} or {{variable_name:default_value}}
  BASIC: /\{\{([a-zA-Z_][a-zA-Z0-9_]*?)(?::([^}]*?))?\}\}/g,
  
  // {{@built_in_variable}} for built-in variables
  BUILT_IN: /\{\{@([a-zA-Z_][a-zA-Z0-9_]*?)\}\}/g,
  
  // Combined pattern for efficient parsing
  COMBINED: /\{\{(@?[a-zA-Z_][a-zA-Z0-9_]*?)(?::([^}]*?))?\}\}/g
} as const;

/**
 * Security validation patterns
 */
const SECURITY_PATTERNS = {
  // Valid variable names (letters, numbers, underscores, no spaces)
  VARIABLE_NAME: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  
  // Safe default values (no script tags, code injection patterns)
  SAFE_DEFAULT: /^[^<>{}()[\]]*$/,
  
  // Maximum lengths to prevent DoS
  MAX_VARIABLE_NAME: 50,
  MAX_DEFAULT_VALUE: 500,
  MAX_VARIABLES_PER_TEMPLATE: 100
} as const;

/**
 * Built-in template variables with their generators
 */
const BUILT_IN_VARIABLES = {
  date: () => new Date().toLocaleDateString(),
  time: () => new Date().toLocaleTimeString(),
  datetime: () => new Date().toLocaleString(),
  timestamp: () => Date.now().toString(),
  iso_date: () => new Date().toISOString().split('T')[0],
  iso_time: () => new Date().toISOString().split('T')[1].split('.')[0],
  iso_datetime: () => new Date().toISOString(),
  year: () => new Date().getFullYear().toString(),
  month: () => (new Date().getMonth() + 1).toString().padStart(2, '0'),
  day: () => new Date().getDate().toString().padStart(2, '0'),
  weekday: () => new Date().toLocaleDateString(undefined, { weekday: 'long' }),
  unix_timestamp: () => Math.floor(Date.now() / 1000).toString(),
  uuid: () => generateUUID(),
  random_id: () => generateRandomId(8)
} as const;

/**
 * Template processing options
 */
export interface TemplateProcessingOptions {
  /** Whether to allow built-in variables */
  allowBuiltIns: boolean;
  
  /** Whether to validate security constraints */
  enableSecurity: boolean;
  
  /** Custom variable generators */
  customVariables?: Record<string, () => string>;
  
  /** Whether to preserve unresolved variables */
  preserveUnresolved: boolean;
  
  /** Maximum recursion depth for nested templates */
  maxRecursionDepth: number;
}

/**
 * Default template processing options
 */
export const DEFAULT_TEMPLATE_OPTIONS: TemplateProcessingOptions = {
  allowBuiltIns: true,
  enableSecurity: true,
  preserveUnresolved: false,
  maxRecursionDepth: 5
};

/**
 * Template variable with security validation
 */
export interface ValidatedTemplateVariable extends TemplateVariable {
  isBuiltIn: boolean;
  isSecure: boolean;
  sanitizedDefaultValue?: string;
}

/**
 * Template processing result
 */
export interface TemplateProcessingResult {
  content: string;
  resolvedVariables: Array<{ name: string; value: string; isBuiltIn: boolean }>;
  unresolvedVariables: string[];
  securityWarnings: string[];
  processingTime: number;
}

/**
 * Extract template variables from content with security validation
 */
export function extractTemplateVariables(
  content: string,
  options: Partial<TemplateProcessingOptions> = {}
): ValidatedTemplateVariable[] {
  const opts = { ...DEFAULT_TEMPLATE_OPTIONS, ...options };
  const variables = new Map<string, ValidatedTemplateVariable>();
  
  if (!content || content.length === 0) {
    return [];
  }
  
  // Reset regex state
  VARIABLE_PATTERNS.COMBINED.lastIndex = 0;
  
  let match: RegExpExecArray | null;
  let variableCount = 0;
  
  while ((match = VARIABLE_PATTERNS.COMBINED.exec(content)) !== null) {
    const [, fullName, defaultValue] = match;
    
    // Security: Limit number of variables per template
    if (++variableCount > SECURITY_PATTERNS.MAX_VARIABLES_PER_TEMPLATE) {
      break;
    }
    
    const isBuiltIn = fullName.startsWith('@');
    const variableName = isBuiltIn ? fullName.slice(1) : fullName;
    
    // Skip if we've already processed this variable
    if (variables.has(variableName)) {
      continue;
    }
    
    // Validate variable name
    const isSecure = validateVariableName(variableName) && 
                    (!defaultValue || validateDefaultValue(defaultValue));
    
    if (!isSecure && opts.enableSecurity) {
      continue; // Skip insecure variables
    }
    
    // Skip built-in variables if not allowed
    if (isBuiltIn && !opts.allowBuiltIns) {
      continue;
    }
    
    variables.set(variableName, {
      name: variableName,
      description: isBuiltIn ? `Built-in variable: ${variableName}` : `User variable: ${variableName}`,
      defaultValue: defaultValue?.trim(),
      required: !defaultValue && !isBuiltIn,
      isBuiltIn,
      isSecure,
      sanitizedDefaultValue: defaultValue ? sanitizeValue(defaultValue) : undefined
    });
  }
  
  return Array.from(variables.values());
}

/**
 * Process template with variable substitution
 */
export function processTemplate(
  content: string,
  variables: Record<string, string> = {},
  options: Partial<TemplateProcessingOptions> = {}
): TemplateProcessingResult {
  const startTime = Date.now();
  const opts = { ...DEFAULT_TEMPLATE_OPTIONS, ...options };
  const resolvedVariables: Array<{ name: string; value: string; isBuiltIn: boolean }> = [];
  const unresolvedVariables: string[] = [];
  const securityWarnings: string[] = [];
  
  if (!content || content.length === 0) {
    return {
      content: '',
      resolvedVariables,
      unresolvedVariables,
      securityWarnings,
      processingTime: Date.now() - startTime
    };
  }
  
  let processedContent = content;
  let recursionDepth = 0;
  
  // Process variables with recursion protection
  while (recursionDepth < opts.maxRecursionDepth) {
    const beforeProcessing = processedContent;
    processedContent = processVariables(
      processedContent,
      variables,
      opts,
      resolvedVariables,
      unresolvedVariables,
      securityWarnings
    );
    
    // Break if no more variables to process
    if (beforeProcessing === processedContent) {
      break;
    }
    
    recursionDepth++;
  }
  
  // Warning if max recursion reached
  if (recursionDepth >= opts.maxRecursionDepth) {
    securityWarnings.push(`Maximum recursion depth (${opts.maxRecursionDepth}) reached`);
  }
  
  return {
    content: processedContent,
    resolvedVariables,
    unresolvedVariables: [...new Set(unresolvedVariables)], // Deduplicate
    securityWarnings,
    processingTime: Date.now() - startTime
  };
}

/**
 * Create template from content with variable extraction
 */
export function createTemplate(
  title: string,
  content: string,
  description = '',
  options: Partial<TemplateProcessingOptions> = {}
): Template {
  const variables = extractTemplateVariables(content, options);
  
  return {
    id: generateRandomId(16) as EntityId,
    title,
    content,
    description,
    variables: variables.map(v => ({
      name: v.name,
      description: v.description,
      defaultValue: v.sanitizedDefaultValue || v.defaultValue,
      required: v.required
    }))
  };
}

/**
 * Validate template content for security and correctness
 */
export function validateTemplate(template: Template): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Basic validation
  if (!template.title || template.title.trim().length === 0) {
    errors.push('Template title cannot be empty');
  }
  
  if (!template.content || template.content.trim().length === 0) {
    errors.push('Template content cannot be empty');
  }
  
  if (template.title && template.title.length > 200) {
    errors.push('Template title too long (max 200 characters)');
  }
  
  if (template.content && template.content.length > 1000000) { // 1MB limit
    errors.push('Template content too large (max 1MB)');
  }
  
  // Extract and validate variables
  const extractedVariables = extractTemplateVariables(template.content, {
    enableSecurity: true,
    allowBuiltIns: true
  });
  
  // Check for unresolved built-in variables
  for (const variable of extractedVariables) {
    if (variable.isBuiltIn && !(variable.name in BUILT_IN_VARIABLES)) {
      warnings.push(`Unknown built-in variable: @${variable.name}`);
    }
    
    if (!variable.isSecure) {
      warnings.push(`Potentially unsafe variable: ${variable.name}`);
    }
  }
  
  // Validate defined variables match extracted variables
  const definedNames = new Set(template.variables.map(v => v.name));
  const extractedNames = new Set(extractedVariables.filter(v => !v.isBuiltIn).map(v => v.name));
  
  for (const name of extractedNames) {
    if (!definedNames.has(name)) {
      warnings.push(`Variable ${name} used in template but not defined in metadata`);
    }
  }
  
  for (const name of definedNames) {
    if (!extractedNames.has(name)) {
      warnings.push(`Variable ${name} defined in metadata but not used in template`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generate template preview with sample data
 */
export function generateTemplatePreview(
  template: Template,
  sampleData: Record<string, string> = {}
): { preview: string; usedSampleData: Record<string, string> } {
  const usedSampleData: Record<string, string> = {};
  
  // Generate sample data for undefined variables
  for (const variable of template.variables) {
    if (!(variable.name in sampleData)) {
      if (variable.defaultValue) {
        usedSampleData[variable.name] = variable.defaultValue;
      } else {
        usedSampleData[variable.name] = generateSampleValue(variable.name);
      }
    } else {
      usedSampleData[variable.name] = sampleData[variable.name];
    }
  }
  
  const result = processTemplate(template.content, usedSampleData, {
    allowBuiltIns: true,
    enableSecurity: true,
    preserveUnresolved: false
  });
  
  return {
    preview: result.content,
    usedSampleData
  };
}

/**
 * Get available built-in variables with descriptions
 */
export function getBuiltInVariables(): Array<{ name: string; description: string; example: string }> {
  return [
    { name: 'date', description: 'Current date (localized)', example: new Date().toLocaleDateString() },
    { name: 'time', description: 'Current time (localized)', example: new Date().toLocaleTimeString() },
    { name: 'datetime', description: 'Current date and time (localized)', example: new Date().toLocaleString() },
    { name: 'timestamp', description: 'Current timestamp (milliseconds)', example: Date.now().toString() },
    { name: 'iso_date', description: 'Current date (ISO format)', example: new Date().toISOString().split('T')[0] },
    { name: 'iso_time', description: 'Current time (ISO format)', example: new Date().toISOString().split('T')[1].split('.')[0] },
    { name: 'iso_datetime', description: 'Current date and time (ISO format)', example: new Date().toISOString() },
    { name: 'year', description: 'Current year', example: new Date().getFullYear().toString() },
    { name: 'month', description: 'Current month (01-12)', example: (new Date().getMonth() + 1).toString().padStart(2, '0') },
    { name: 'day', description: 'Current day (01-31)', example: new Date().getDate().toString().padStart(2, '0') },
    { name: 'weekday', description: 'Current weekday name', example: new Date().toLocaleDateString(undefined, { weekday: 'long' }) },
    { name: 'unix_timestamp', description: 'Unix timestamp (seconds)', example: Math.floor(Date.now() / 1000).toString() },
    { name: 'uuid', description: 'Random UUID v4', example: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx' },
    { name: 'random_id', description: 'Random alphanumeric ID', example: 'abc123de' }
  ];
}

// ========== Helper Functions ==========

/**
 * Process variables in content (single pass)
 */
function processVariables(
  content: string,
  variables: Record<string, string>,
  options: TemplateProcessingOptions,
  resolvedVariables: Array<{ name: string; value: string; isBuiltIn: boolean }>,
  unresolvedVariables: string[],
  securityWarnings: string[]
): string {
  VARIABLE_PATTERNS.COMBINED.lastIndex = 0;
  
  return content.replace(VARIABLE_PATTERNS.COMBINED, (match, fullName, defaultValue) => {
    const isBuiltIn = fullName.startsWith('@');
    const variableName = isBuiltIn ? fullName.slice(1) : fullName;
    
    // Security validation
    if (options.enableSecurity) {
      if (!validateVariableName(variableName)) {
        securityWarnings.push(`Invalid variable name: ${variableName}`);
        return options.preserveUnresolved ? match : '';
      }
      
      if (defaultValue && !validateDefaultValue(defaultValue)) {
        securityWarnings.push(`Unsafe default value for variable: ${variableName}`);
        return options.preserveUnresolved ? match : '';
      }
    }
    
    // Handle built-in variables
    if (isBuiltIn) {
      if (!options.allowBuiltIns) {
        securityWarnings.push(`Built-in variables not allowed: @${variableName}`);
        return options.preserveUnresolved ? match : '';
      }
      
      if (variableName in BUILT_IN_VARIABLES) {
        try {
          const value = BUILT_IN_VARIABLES[variableName as keyof typeof BUILT_IN_VARIABLES]();
          resolvedVariables.push({ name: variableName, value, isBuiltIn: true });
          return value;
        } catch (error) {
          securityWarnings.push(`Error evaluating built-in variable @${variableName}: ${error}`);
          return options.preserveUnresolved ? match : '';
        }
      } else {
        unresolvedVariables.push(`@${variableName}`);
        return options.preserveUnresolved ? match : '';
      }
    }
    
    // Handle user variables
    if (variableName in variables) {
      const value = sanitizeValue(variables[variableName]);
      resolvedVariables.push({ name: variableName, value, isBuiltIn: false });
      return value;
    }
    
    // Handle default values
    if (defaultValue) {
      const sanitizedDefault = sanitizeValue(defaultValue);
      resolvedVariables.push({ name: variableName, value: sanitizedDefault, isBuiltIn: false });
      return sanitizedDefault;
    }
    
    // Unresolved variable
    unresolvedVariables.push(variableName);
    return options.preserveUnresolved ? match : '';
  });
}

/**
 * Validate variable name security
 */
function validateVariableName(name: string): boolean {
  return SECURITY_PATTERNS.VARIABLE_NAME.test(name) && 
         name.length <= SECURITY_PATTERNS.MAX_VARIABLE_NAME;
}

/**
 * Validate default value security
 */
function validateDefaultValue(value: string): boolean {
  return value.length <= SECURITY_PATTERNS.MAX_DEFAULT_VALUE &&
         SECURITY_PATTERNS.SAFE_DEFAULT.test(value);
}

/**
 * Sanitize variable values
 */
function sanitizeValue(value: string): string {
  // Remove potentially dangerous characters
  return value
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .trim();
}

/**
 * Generate sample value based on variable name
 */
function generateSampleValue(variableName: string): string {
  const lowerName = variableName.toLowerCase();
  
  if (lowerName.includes('name')) return 'Sample Name';
  if (lowerName.includes('title')) return 'Sample Title';
  if (lowerName.includes('date')) return new Date().toLocaleDateString();
  if (lowerName.includes('time')) return new Date().toLocaleTimeString();
  if (lowerName.includes('email')) return 'sample@example.com';
  if (lowerName.includes('url')) return 'https://example.com';
  if (lowerName.includes('number') || lowerName.includes('count')) return '123';
  if (lowerName.includes('id')) return generateRandomId(8);
  
  return 'Sample Value';
}

/**
 * Generate UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate random alphanumeric ID
 */
function generateRandomId(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}