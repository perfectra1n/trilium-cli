#!/usr/bin/env node

/**
 * Test script for the simple TUI
 * This just imports and tests that the module loads without syntax errors
 */

async function testSimpleTui() {
  try {
    console.log('Testing simple TUI import...');
    
    // Try to import the compiled TUI
    const { SimpleTui } = await import('./dist/tui-simple.js');
    
    console.log('✓ SimpleTui imported successfully');
    console.log('✓ Component type:', typeof SimpleTui);
    
    console.log('\n✅ Simple TUI test passed!');
    console.log('\nTo run the actual TUI, you need to:');
    console.log('1. Set TRILIUM_SERVER_URL environment variable (e.g., http://localhost:8080)');
    console.log('2. Set TRILIUM_API_TOKEN environment variable with your API token');
    console.log('3. Run: node dist/tui-simple.js');
    
    return true;
  } catch (error) {
    console.error('❌ Simple TUI test failed:', error);
    return false;
  }
}

testSimpleTui();