#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

interface Fix {
  pattern: RegExp;
  replacement: string;
  description: string;
}

const commonFixes: Fix[] = [
  // API method name fixes
  {
    pattern: /client\.uploadAttachment\(/g,
    replacement: 'client.createAttachment(',
    description: 'Fix uploadAttachment method name'
  },
  {
    pattern: /client\.downloadAttachment\(/g,
    replacement: 'client.getAttachmentContent(',
    description: 'Fix downloadAttachment method name'
  },
  {
    pattern: /client\.getAttachments\(/g,
    replacement: 'client.getNoteAttachments(',
    description: 'Fix getAttachments method name'
  },
  {
    pattern: /client\.getAttributes\(/g,
    replacement: 'client.getNoteAttributes(',
    description: 'Fix getAttributes method name'
  },
  {
    pattern: /client\.getBranches\(/g,
    replacement: 'client.getNoteBranches(',
    description: 'Fix getBranches method name'
  },
  {
    pattern: /client\.getDateNote\(/g,
    replacement: 'client.getDayNote(',
    description: 'Fix getDateNote method name'
  },
  {
    pattern: /client\.createDateNote\(/g,
    replacement: 'client.getDayNote(',
    description: 'Fix createDateNote method name'
  },
  // Property name fixes for API parameters
  {
    pattern: /noteId:/g,
    replacement: 'ownerId:',
    description: 'Fix attachment parameter name'
  },
  // Branch creation fixes
  {
    pattern: /position:/g,
    replacement: 'notePosition:',
    description: 'Fix branch position property name'
  },
  // Content property fixes
  {
    pattern: /\.content(?!\s*[=:])/g,
    replacement: '.content',
    description: 'Fix content property access'
  },
  // Note creation result fixes  
  {
    pattern: /\.noteId(?=\s*[;}])/g,
    replacement: '.noteId',
    description: 'Fix note creation result access'
  },
  // Import fixes
  {
    pattern: /import\s*{\s*confirm\s*}\s*from\s*['"]inquirer['"]/g,
    replacement: "import inquirer from 'inquirer'",
    description: 'Fix inquirer import'
  },
  // Config property fixes
  {
    pattern: /serverUrl:/g,
    replacement: 'baseUrl:',
    description: 'Fix config property name'
  },
  // Optional chaining and null checks
  {
    pattern: /(\w+)\.(\w+)\s*\|\|\s*['""]['""](?=\s*[;}])/g,
    replacement: '$1.$2 || \'\'',
    description: 'Fix empty string fallbacks'
  }
];

async function fixFile(filePath: string): Promise<number> {
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let fixCount = 0;
    
    for (const fix of commonFixes) {
      const matches = content.match(fix.pattern);
      if (matches) {
        content = content.replace(fix.pattern, fix.replacement);
        fixCount += matches.length;
        console.log(`  ✓ ${fix.description}: ${matches.length} fixes`);
      }
    }
    
    if (fixCount > 0) {
      await fs.writeFile(filePath, content);
    }
    
    return fixCount;
  } catch (error) {
    console.error(`Error fixing file ${filePath}:`, error);
    return 0;
  }
}

async function main() {
  console.log('🔧 Fixing common TypeScript errors...\n');
  
  // Find all TypeScript files in src directory
  const files = await glob('src/**/*.{ts,tsx}', { cwd: process.cwd() });
  
  let totalFixes = 0;
  
  for (const file of files) {
    console.log(`📄 Processing ${file}...`);
    const fixes = await fixFile(file);
    if (fixes > 0) {
      console.log(`  ✅ Applied ${fixes} fixes`);
      totalFixes += fixes;
    } else {
      console.log('  ℹ️  No fixes needed');
    }
  }
  
  console.log(`\n🎉 Complete! Applied ${totalFixes} fixes across ${files.length} files.`);
  console.log('\n📋 Next steps:');
  console.log('1. Run: npm run typecheck');
  console.log('2. Manually fix remaining complex issues');
  console.log('3. Run: npm run test');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}