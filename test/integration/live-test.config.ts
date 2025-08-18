/**
 * Live Integration Test Configuration
 * 
 * This configuration file sets up the environment for running
 * integration tests against a live Trilium server instance.
 */

export interface LiveTestConfig {
  serverUrl: string;
  apiToken: string;
  enabled: boolean;
  timeout: number;
  cleanup: boolean;
  debugMode: boolean;
  testPrefix: string;
}

/**
 * Get live test configuration from environment variables
 */
export function getLiveTestConfig(): LiveTestConfig {
  const enabled = process.env.TRILIUM_TEST_ENABLED === 'true';
  
  if (!enabled) {
    console.log('Live integration tests are disabled.');
    console.log('To enable, set environment variables:');
    console.log('  TRILIUM_TEST_ENABLED=true');
    console.log('  TRILIUM_SERVER_URL=http://localhost:8080');
    console.log('  TRILIUM_API_TOKEN=your_etapi_token_here');
  }

  return {
    enabled,
    serverUrl: process.env.TRILIUM_SERVER_URL || 'http://localhost:8080',
    apiToken: process.env.TRILIUM_API_TOKEN || '5c8daC6woEKk_gcRa8O7pPrlMW66XdBBWUNZG7gGUpR8ymhWxNLul0do=',
    timeout: parseInt(process.env.TRILIUM_TEST_TIMEOUT || '30000'),
    cleanup: process.env.TRILIUM_TEST_CLEANUP !== 'false',
    debugMode: process.env.TRILIUM_TEST_DEBUG === 'true',
    testPrefix: process.env.TRILIUM_TEST_PREFIX || 'Integration Test',
  };
}

/**
 * Validate that required configuration is available
 */
export function validateLiveTestConfig(config: LiveTestConfig): void {
  if (!config.enabled) {
    throw new Error('Live integration tests are disabled. Set TRILIUM_TEST_ENABLED=true to enable.');
  }

  if (!config.serverUrl) {
    throw new Error('TRILIUM_SERVER_URL environment variable is required');
  }

  if (!config.apiToken) {
    throw new Error('TRILIUM_API_TOKEN environment variable is required');
  }

  // Validate URL format
  try {
    new URL(config.serverUrl);
  } catch {
    throw new Error(`Invalid server URL: ${config.serverUrl}`);
  }

  // Validate token format (basic check)
  if (config.apiToken.length < 10) {
    throw new Error('API token appears to be invalid (too short)');
  }
}

/**
 * Get test note title with prefix
 */
export function getTestNoteTitle(config: LiveTestConfig, title: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
  return `${config.testPrefix} - ${title} [${timestamp}]`;
}

/**
 * Default test timeouts for different operation types
 */
export const TestTimeouts = {
  CONNECTION: 10000,    // 10s for initial connection
  CRUD_OPERATION: 5000, // 5s for basic CRUD operations
  SEARCH: 15000,        // 15s for search operations
  BATCH_OPERATION: 30000, // 30s for batch operations
  CLEANUP: 60000,       // 60s for cleanup operations
} as const;

/**
 * Test data cleanup helper
 */
export class TestDataTracker {
  private notesCreated: string[] = [];
  private attributesCreated: string[] = [];
  private branchesCreated: string[] = [];

  trackNote(noteId: string): void {
    this.notesCreated.push(noteId);
  }

  trackAttribute(attributeId: string): void {
    this.attributesCreated.push(attributeId);
  }

  trackBranch(branchId: string): void {
    this.branchesCreated.push(branchId);
  }

  getTrackedNotes(): string[] {
    return [...this.notesCreated];
  }

  getTrackedAttributes(): string[] {
    return [...this.attributesCreated];
  }

  getTrackedBranches(): string[] {
    return [...this.branchesCreated];
  }

  clear(): void {
    this.notesCreated = [];
    this.attributesCreated = [];
    this.branchesCreated = [];
  }

  getStats(): { notes: number; attributes: number; branches: number } {
    return {
      notes: this.notesCreated.length,
      attributes: this.attributesCreated.length,
      branches: this.branchesCreated.length,
    };
  }
}