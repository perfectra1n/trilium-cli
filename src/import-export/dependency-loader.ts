import { ImportExportError } from './types.js';

/**
 * Secure dependency loading utilities with proper error handling
 */

export interface DependencyInfo {
  name: string;
  version?: string;
  optional?: boolean;
  fallback?: () => any;
}

/**
 * Cache for loaded dependencies to avoid repeated imports
 */
const dependencyCache = new Map<string, any>();

/**
 * List of allowed dynamic imports for security
 */
const ALLOWED_DYNAMIC_IMPORTS = [
  'fs/promises',
  'adm-zip',
  'gray-matter',
  'jsdom',
  'turndown',
  'file-type',
  'js-yaml',
  'mime-types',
  'zod',
];

/**
 * Validates that a module name is allowed for dynamic import
 */
function validateModuleName(moduleName: string): void {
  if (!ALLOWED_DYNAMIC_IMPORTS.includes(moduleName)) {
    throw new ImportExportError(
      `Dynamic import not allowed for module: ${moduleName}`,
      'FORBIDDEN_DYNAMIC_IMPORT',
      { moduleName, allowedModules: ALLOWED_DYNAMIC_IMPORTS }
    );
  }
}

/**
 * Safely loads a dependency with proper error handling
 */
export async function loadDependency<T = any>(
  moduleName: string,
  options: {
    optional?: boolean;
    timeout?: number;
    fallback?: () => T;
    cacheKey?: string;
  } = {}
): Promise<T> {
  const {
    optional = false,
    timeout = 10000,
    fallback,
    cacheKey = moduleName,
  } = options;

  // Validate module name for security
  validateModuleName(moduleName);

  // Check cache first
  if (dependencyCache.has(cacheKey)) {
    return dependencyCache.get(cacheKey);
  }

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new ImportExportError(
          `Module import timed out: ${moduleName}`,
          'MODULE_IMPORT_TIMEOUT',
          { moduleName, timeout }
        ));
      }, timeout);
    });

    // Import the module with timeout
    const modulePromise = import(moduleName);
    const module = await Promise.race([modulePromise, timeoutPromise]);

    // Cache the result
    dependencyCache.set(cacheKey, module);
    return module;

  } catch (error: any) {
    // Handle missing optional dependencies
    if (optional) {
      if (fallback) {
        const fallbackResult = fallback();
        dependencyCache.set(cacheKey, fallbackResult);
        return fallbackResult;
      }
      
      // Return empty object for optional dependencies without fallback
      const emptyResult = {} as T;
      dependencyCache.set(cacheKey, emptyResult);
      return emptyResult;
    }

    // For required dependencies, throw detailed error
    throw new ImportExportError(
      `Failed to load required dependency: ${moduleName}`,
      'DEPENDENCY_LOAD_ERROR',
      { 
        moduleName, 
        error: error.message,
        stack: error.stack,
        isOptional: optional 
      }
    );
  }
}

/**
 * Loads multiple dependencies concurrently
 */
export async function loadDependencies(
  dependencies: Array<{
    name: string;
    key?: string;
    optional?: boolean;
    fallback?: () => any;
  }>,
  options: { timeout?: number } = {}
): Promise<Record<string, any>> {
  const { timeout = 10000 } = options;
  const results: Record<string, any> = {};

  const loadPromises = dependencies.map(async (dep) => {
    try {
      const module = await loadDependency(dep.name, {
        optional: dep.optional,
        timeout,
        fallback: dep.fallback,
        cacheKey: dep.key || dep.name,
      });
      
      results[dep.key || dep.name] = module;
    } catch (error) {
      if (!dep.optional) {
        throw error;
      }
      // Optional dependency failed, continue with others
      console.warn(`Optional dependency ${dep.name} failed to load:`, error);
    }
  });

  await Promise.all(loadPromises);
  return results;
}

/**
 * Preloads common dependencies at startup
 */
export async function preloadCommonDependencies(): Promise<void> {
  const commonDeps = [
    { name: 'fs/promises', key: 'fs' },
    { name: 'mime-types', key: 'mimeTypes' },
    { name: 'gray-matter', key: 'matter', optional: true },
    { name: 'adm-zip', key: 'AdmZip', optional: true },
  ];

  try {
    await loadDependencies(commonDeps, { timeout: 15000 });
  } catch (error) {
    console.warn('Failed to preload some dependencies:', error);
  }
}

/**
 * Creates a safe loader for a specific dependency
 */
export function createDependencyLoader<T = any>(
  moduleName: string,
  options: {
    optional?: boolean;
    fallback?: () => T;
    validator?: (module: any) => boolean;
  } = {}
) {
  const { optional = false, fallback, validator } = options;

  return async (): Promise<T> => {
    const module = await loadDependency<T>(moduleName, {
      optional,
      fallback,
    });

    // Validate the module if validator is provided
    if (validator && !validator(module)) {
      throw new ImportExportError(
        `Module validation failed: ${moduleName}`,
        'MODULE_VALIDATION_ERROR',
        { moduleName }
      );
    }

    return module;
  };
}

/**
 * Clears the dependency cache (useful for testing)
 */
export function clearDependencyCache(): void {
  dependencyCache.clear();
}

/**
 * Gets cache statistics
 */
export function getCacheStats(): {
  size: number;
  keys: string[];
} {
  return {
    size: dependencyCache.size,
    keys: Array.from(dependencyCache.keys()),
  };
}

/**
 * Specific loaders for common dependencies
 */
export const fsPromisesLoader = createDependencyLoader('fs/promises', {
  validator: (module) => typeof module.readFile === 'function',
});

export const admZipLoader = createDependencyLoader('adm-zip', {
  optional: true,
  validator: (module) => typeof module.default === 'function',
});

export const grayMatterLoader = createDependencyLoader('gray-matter', {
  optional: true,
  validator: (module) => typeof module.default === 'function',
});

export const jsdomLoader = createDependencyLoader('jsdom', {
  optional: true,
  validator: (module) => typeof module.JSDOM === 'function',
});

export const turndownLoader = createDependencyLoader('turndown', {
  optional: true,
  validator: (module) => typeof module.default === 'function',
});

export const fileTypeLoader = createDependencyLoader('file-type', {
  optional: true,
  validator: (module) => typeof module.fileTypeFromFile === 'function',
});

export const mimeTypesLoader = createDependencyLoader('mime-types', {
  validator: (module) => typeof module.lookup === 'function',
});

/**
 * Checks if a dependency is available without loading it
 */
export async function checkDependencyAvailability(moduleName: string): Promise<boolean> {
  validateModuleName(moduleName);
  
  try {
    await import(moduleName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets information about available dependencies
 */
export async function getDependencyInfo(): Promise<Record<string, boolean>> {
  const info: Record<string, boolean> = {};
  
  for (const moduleName of ALLOWED_DYNAMIC_IMPORTS) {
    info[moduleName] = await checkDependencyAvailability(moduleName);
  }
  
  return info;
}