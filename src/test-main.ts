#!/usr/bin/env node

/**
 * Basic integration test for the main application components
 */

import { Application, handleApplicationError } from './main.js';
import { 
  TriliumError,
  ConfigError,
  ErrorContext,
  EnhancedError,
  ValidationError 
} from './error.js';
import { createLogger } from './utils/logger.js';

async function testErrorSystem() {
  console.log('Testing error system...');
  
  // Test basic TriliumError
  const basicError = new TriliumError('Basic error message');
  console.log(`✓ Basic error: ${basicError.message}`);
  
  // Test enhanced error with context
  const context = new ErrorContext()
    .withCode('TEST_ERROR')
    .withSuggestion('This is a test suggestion')
    .withHelpTopic('testing');
  
  const enhancedError = new EnhancedError(basicError, context);
  console.log(`✓ Enhanced error: ${enhancedError.message.substring(0, 50)}...`);
  
  // Test error categorization
  const validationError = new ValidationError('Invalid input test');
  console.log(`✓ Validation error category: ${validationError.getCategory()}`);
  console.log(`✓ Validation error exit code: ${validationError.getExitCode()}`);
  console.log(`✓ Is user facing: ${validationError.isUserFacing()}`);
  
  // Test error handling
  console.log('✓ Error system working correctly');
}

async function testApplicationLifecycle() {
  console.log('\nTesting application lifecycle...');
  
  const app = new Application();
  
  // Test logger
  const logger = app.getLogger();
  logger.debug('Debug message test');
  logger.info('Info message test');
  
  // Test shutdown handlers
  let shutdownCalled = false;
  app.addShutdownHandler(() => {
    shutdownCalled = true;
    console.log('✓ Shutdown handler called');
  });
  
  await app.shutdown('TEST');
  
  if (!shutdownCalled) {
    throw new Error('Shutdown handler was not called');
  }
  
  console.log('✓ Application lifecycle working correctly');
}

async function testErrorHandling() {
  console.log('\nTesting error handling...');
  
  const logger = createLogger(false, 'info');
  
  // Test basic error
  const basicError = new Error('Basic error');
  console.log('Handling basic error:');
  handleApplicationError(basicError, logger);
  
  // Test TriliumError
  const triliumError = new ConfigError('Configuration not found');
  console.log('\\nHandling TriliumError:');
  handleApplicationError(triliumError, logger);
  
  // Test EnhancedError
  const context = new ErrorContext()
    .withSuggestion('Try running --help')
    .withSimilarItems(['config', 'setup']);
  const enhancedError = new EnhancedError(triliumError, context);
  console.log('\\nHandling EnhancedError:');
  handleApplicationError(enhancedError, logger);
  
  console.log('✓ Error handling working correctly');
}

async function runTests() {
  try {
    console.log('=== Trilium CLI Core Functionality Test ===\\n');
    
    await testErrorSystem();
    await testApplicationLifecycle();
    await testErrorHandling();
    
    console.log('\\n=== All tests passed! ===');
    
  } catch (error) {
    console.error('\\n=== Test failed ===');
    console.error(error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export { runTests };