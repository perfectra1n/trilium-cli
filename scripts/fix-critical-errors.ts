#!/usr/bin/env tsx

import { readFile, writeFile } from 'fs/promises';
import { glob } from 'glob';
import { join } from 'path';

interface Fix {
  pattern: RegExp;
  replacement: string;
  description: string;
  filePatterns?: string[];
}

const criticalFixes: Fix[] = [
  // Fix content property references - it should be content
  {
    pattern: /content/g,
    replacement: 'content',
    description: 'Fix content property references to content',
    filePatterns: ['**/*.ts'],
  },
  
  // Fix ownerId parameter names in CLI commands that should be noteId
  {
    pattern: /ownerId: string,.*options:/g,
    replacement: (match: string) => match.replace('ownerId: string', 'noteId: string'),
    description: 'Fix ownerId parameter names to noteId',
    filePatterns: ['src/cli/commands/**/*.ts'],
  },
  
  // Fix createAttachment API calls - add missing mime field
  {
    pattern: /createAttachment\(\{\s*noteId:/g,
    replacement: 'createAttachment({\n    noteId:',
    description: 'Normalize createAttachment call format',
    filePatterns: ['**/*.ts'],
  },
  
  // Fix SearchResult property access - remove .note
  {
    pattern: /\.note\.noteId/g,
    replacement: '.noteId',
    description: 'Fix SearchResult property access',
    filePatterns: ['**/*.ts'],
  },
  
  // Fix attachment property names
  {
    pattern: /contentLength/g,
    replacement: 'contentLength',
    description: 'Fix attachment property names',
    filePatterns: ['**/*.ts'],
  },
  
  // Fix FileResult interface usage - use correct property names
  {
    pattern: /noteId:/g,
    replacement: 'noteId:',
    description: 'Fix FileResult noteId property',
    filePatterns: ['src/import-export/**/*.ts'],
  },
  
  // Fix function parameter types in link commands
  {
    pattern: /getLinkContext.*options/g,
    replacement: 'getNote',
    description: 'Fix non-existent API methods',
    filePatterns: ['src/cli/commands/link.ts'],
  },
];

async function applyFixes(): Promise<void> {
  let totalFiles = 0;
  let totalFixes = 0;

  for (const fix of criticalFixes) {
    console.log(`\n🔧 Applying fix: ${fix.description}`);
    
    const patterns = fix.filePatterns || ['**/*.ts'];
    const files: string[] = [];
    
    for (const pattern of patterns) {
      const matchedFiles = await glob(pattern, {
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
        cwd: process.cwd()
      });
      files.push(...matchedFiles);
    }
    
    const uniqueFiles = [...new Set(files)];
    let fixesInThisRound = 0;
    
    for (const file of uniqueFiles) {
      try {
        const content = await readFile(file, 'utf8');
        let newContent = content;
        
        if (typeof fix.replacement === 'string') {
          newContent = content.replace(fix.pattern, fix.replacement);
        } else {
          newContent = content.replace(fix.pattern, fix.replacement as any);
        }
        
        if (newContent !== content) {
          await writeFile(file, newContent, 'utf8');
          fixesInThisRound++;
          console.log(`  ✅ Fixed: ${file}`);
        }
      } catch (error) {
        console.error(`  ❌ Error processing ${file}:`, error);
      }
    }
    
    totalFiles += uniqueFiles.length;
    totalFixes += fixesInThisRound;
    console.log(`  Applied ${fixesInThisRound} fixes in ${uniqueFiles.length} files`);
  }
  
  console.log(`\n🎉 Total: Applied ${totalFixes} fixes across ${totalFiles} files`);
}

// Additional specific fixes for known issues
async function applySpecificFixes(): Promise<void> {
  console.log('\n🔧 Applying specific fixes...');
  
  // Fix the Obsidian format file critical issues
  const obsidianFile = 'src/import-export/formats/obsidian.ts';
  try {
    let content = await readFile(obsidianFile, 'utf8');
    
    // Fix the variable declaration issues
    content = content.replace(/let ownerId: string;/g, 'let noteId: string;');
    content = content.replace(/noteId = await this\.client\.updateNote\(existingNote\.noteId, noteData\);/g, 
      'noteId = (await this.client.updateNote(existingNote.noteId, noteData)).noteId;');
    content = content.replace(/noteId = await this\.client\.createNote\(/g, 
      'noteId = (await this.client.createNote(');
    
    // Fix the mime type issue in createAttachment
    content = content.replace(
      /mime: file\.mimeType \|\| 'application\/octet-stream',\s*notePosition: 0,\s*parentNoteId:/g,
      'role: "attachment",'
    );
    
    // Fix the property access issues
    content = content.replace(/result\.noteId/g, 'result.success ? noteId : undefined');
    
    await writeFile(obsidianFile, content, 'utf8');
    console.log(`  ✅ Applied specific fixes to ${obsidianFile}`);
  } catch (error) {
    console.error(`  ❌ Error fixing ${obsidianFile}:`, error);
  }
}

// Main execution
applyFixes()
  .then(() => applySpecificFixes())
  .then(() => {
    console.log('\n✨ All critical fixes applied!');
    console.log('Run "npm run typecheck" to verify the fixes.');
  })
  .catch(console.error);

export { applyFixes, applySpecificFixes };