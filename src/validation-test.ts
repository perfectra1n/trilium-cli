/**
 * Basic integration validation test
 * This script verifies that core components can be imported and instantiated
 */

import { TriliumClient } from './api/client.js';
import { Config } from './config/index.js';
import { formatOutput, createCliConfig } from './utils/cli.js';
import { createLogger } from './utils/logger.js';

async function runValidationTests(): Promise<void> {
  const logger = createLogger(true);
  let passed = 0;
  let failed = 0;

  console.log('Running basic integration validation tests...\n');

  // Test 1: Config instantiation
  try {
    const config = new Config();
    await config.load();
    logger.info('✓ Config class can be instantiated and loaded');
    passed++;
  } catch (error) {
    logger.error('✗ Config class instantiation failed:', error);
    failed++;
  }

  // Test 2: CLI utilities
  try {
    const testData = [{ id: 1, name: 'test' }];
    const formatted = formatOutput(testData, 'json');
    if (formatted.includes('test')) {
      logger.info('✓ CLI utilities work correctly');
      passed++;
    } else {
      throw new Error('Formatting failed');
    }
  } catch (error) {
    logger.error('✗ CLI utilities failed:', error);
    failed++;
  }

  // Test 3: TriliumClient instantiation
  try {
    const client = new TriliumClient({
      baseUrl: 'http://localhost:8080',
      apiToken: 'etapi_test_token',
      timeout: 5000,
      retries: 1
    });
    logger.info('✓ TriliumClient can be instantiated');
    passed++;
  } catch (error) {
    logger.error('✗ TriliumClient instantiation failed:', error);
    failed++;
  }

  // Test 4: createCliConfig utility
  try {
    const config = await createCliConfig();
    logger.info('✓ createCliConfig utility works');
    passed++;
  } catch (error) {
    logger.error('✗ createCliConfig utility failed:', error);
    failed++;
  }

  // Summary
  console.log(`\nValidation Summary:`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed === 0) {
    console.log('🎉 All basic integration tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some integration tests failed');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runValidationTests().catch((error) => {
    console.error('Validation test runner failed:', error);
    process.exit(1);
  });
}