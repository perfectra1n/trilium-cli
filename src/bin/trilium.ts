#!/usr/bin/env node

import { main } from '../main.js';

// Run the CLI application
main().catch((error) => {
  console.error('Failed to start trilium CLI:', error);
  process.exit(1);
});