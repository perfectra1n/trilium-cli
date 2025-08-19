import { vi } from 'vitest';
import { beforeAll, afterEach, afterAll } from 'vitest';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '.env.test') });

// Setup global test environment
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  
  // Set default test API token if not already set
  if (!process.env.TRILIUM_API_TOKEN) {
    process.env.TRILIUM_API_TOKEN = 'Klzxo8XMWgKG_ExeXR94RCXggRuaS+9BzIcJFSgqtU0+WR8qvguBSOzA=';
  }
  
  // Set default server URL if not already set
  if (!process.env.TRILIUM_SERVER_URL) {
    process.env.TRILIUM_SERVER_URL = 'http://localhost:8080';
  }
  
  // Disable console.log during tests unless DEBUG is set
  if (!process.env.DEBUG) {
    global.console = {
      ...console,
      log: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
  }
});

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Clean up after all tests
afterAll(() => {
  vi.restoreAllMocks();
});

// Mock modules that are commonly problematic in tests
vi.mock('update-notifier', () => ({
  default: vi.fn(() => ({
    notify: vi.fn(),
    update: null,
  })),
}));

// Mock file system operations for tests that don't need real file access
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    // Override specific methods as needed
  };
});

// Export vi for use in tests
export { vi };