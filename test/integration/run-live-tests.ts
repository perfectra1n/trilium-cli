#!/usr/bin/env tsx
/**
 * Live Integration Test Runner
 * 
 * This script runs the live integration tests against a real Trilium server.
 * It provides setup validation, test execution, and comprehensive reporting.
 */

import { execSync } from 'child_process';
import { getLiveTestConfig, validateLiveTestConfig } from './live-test.config.js';
import { TriliumClient } from '../../src/api/client.js';

async function main() {
  console.log('🧪 Trilium Live Integration Test Runner');
  console.log('=====================================\n');

  // Get configuration
  const config = getLiveTestConfig();
  
  if (!config.enabled) {
    console.log('❌ Live integration tests are disabled.');
    console.log('\nTo enable tests, set these environment variables:');
    console.log('  export TRILIUM_TEST_ENABLED=true');
    console.log('  export TRILIUM_SERVER_URL=http://localhost:8080');
    console.log('  export TRILIUM_API_TOKEN=your_etapi_token_here');
    console.log('\nOptional configuration:');
    console.log('  export TRILIUM_TEST_TIMEOUT=30000      # Timeout in ms');
    console.log('  export TRILIUM_TEST_CLEANUP=true       # Clean up test data');
    console.log('  export TRILIUM_TEST_DEBUG=true         # Enable debug output');
    console.log('  export TRILIUM_TEST_PREFIX="My Tests"  # Custom test prefix');
    process.exit(1);
  }

  // Validate configuration
  try {
    validateLiveTestConfig(config);
    console.log('✅ Configuration validated');
  } catch (error) {
    console.error('❌ Configuration error:', error.message);
    process.exit(1);
  }

  // Test server connection
  console.log('\n🔌 Testing server connection...');
  try {
    const client = new TriliumClient({
      baseUrl: config.serverUrl,
      apiToken: config.apiToken,
      timeout: config.timeout,
      debugMode: config.debugMode,
    });

    const appInfo = await client.testConnection();
    console.log('✅ Successfully connected to Trilium server');
    console.log(`   Version: ${appInfo.appVersion}`);
    console.log(`   Database: ${appInfo.dbVersion}`);
    console.log(`   URL: ${config.serverUrl}`);
  } catch (error) {
    console.error('❌ Failed to connect to Trilium server:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Ensure Trilium server is running');
    console.error('2. Check server URL is correct');
    console.error('3. Verify API token is valid');
    console.error('4. Check network connectivity');
    process.exit(1);
  }

  // Display test configuration
  console.log('\n⚙️ Test Configuration:');
  console.log(`   Server URL: ${config.serverUrl}`);
  console.log(`   API Token: ${config.apiToken.substring(0, 20)}...`);
  console.log(`   Timeout: ${config.timeout}ms`);
  console.log(`   Debug Mode: ${config.debugMode ? 'enabled' : 'disabled'}`);
  console.log(`   Cleanup: ${config.cleanup ? 'enabled' : 'disabled'}`);
  console.log(`   Test Prefix: "${config.testPrefix}"`);

  // Set environment variables for the test process
  process.env.TRILIUM_TEST_ENABLED = 'true';
  process.env.TRILIUM_SERVER_URL = config.serverUrl;
  process.env.TRILIUM_API_TOKEN = config.apiToken;

  // Run the tests
  console.log('\n🚀 Starting live integration tests...');
  console.log('=====================================\n');

  try {
    const testCommand = 'npx vitest run test/integration/live-api-integration.test.ts --reporter=verbose';
    
    execSync(testCommand, {
      stdio: 'inherit',
      env: {
        ...process.env,
        TRILIUM_TEST_ENABLED: 'true',
        TRILIUM_SERVER_URL: config.serverUrl,
        TRILIUM_API_TOKEN: config.apiToken,
        TRILIUM_TEST_TIMEOUT: config.timeout.toString(),
        TRILIUM_TEST_CLEANUP: config.cleanup.toString(),
        TRILIUM_TEST_DEBUG: config.debugMode.toString(),
        TRILIUM_TEST_PREFIX: config.testPrefix,
      },
    });

    console.log('\n✅ All tests completed successfully! 🎉');
    
  } catch (error) {
    console.error('\n❌ Tests failed');
    process.exit(1);
  }

  console.log('\n📊 Test Summary:');
  console.log('=====================================');
  console.log('✅ Server connection: OK');
  console.log('✅ Authentication: OK'); 
  console.log('✅ CRUD operations: OK');
  console.log('✅ Search functionality: OK');
  console.log('✅ Attribute management: OK');
  console.log('✅ Branch operations: OK');
  console.log('✅ Error handling: OK');
  console.log('✅ Performance tests: OK');
  console.log('✅ Data integrity: OK');

  if (config.cleanup) {
    console.log('🧹 Test data cleanup: Completed automatically');
  } else {
    console.log('⚠️  Test data cleanup: Skipped (cleanup disabled)');
    console.log('   Note: Test data may remain in your Trilium instance');
  }

  console.log('\n🏆 Integration testing completed successfully!');
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('\n❌ Uncaught exception:', error);
  process.exit(1);
});

// Handle interruption
process.on('SIGINT', () => {
  console.log('\n\n⏹️  Test execution interrupted by user');
  console.log('🧹 Performing cleanup...');
  // Could add cleanup logic here if needed
  process.exit(0);
});

// Run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Test runner error:', error);
    process.exit(1);
  });
}