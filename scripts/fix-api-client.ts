#!/usr/bin/env npx tsx

import fs from 'fs/promises';

interface Fix {
  pattern: RegExp;
  replacement: string;
  description: string;
}

const fixes: Fix[] = [
  // Fix parameter names that were incorrectly changed
  {
    pattern: /async updateNote\(ownerId: EntityId,/g,
    replacement: 'async updateNote(noteId: EntityId,',
    description: 'Fix updateNote parameter name'
  },
  {
    pattern: /async updateNoteContent\(ownerId: EntityId,/g,
    replacement: 'async updateNoteContent(noteId: EntityId,',
    description: 'Fix updateNoteContent parameter name'
  },
  {
    pattern: /async deleteNote\(ownerId: EntityId\)/g,
    replacement: 'async deleteNote(noteId: EntityId)',
    description: 'Fix deleteNote parameter name'
  },
  {
    pattern: /async getNoteBranches\(ownerId: EntityId\)/g,
    replacement: 'async getNoteBranches(noteId: EntityId)',
    description: 'Fix getNoteBranches parameter name'
  },
  {
    pattern: /async getNoteAttributes\(ownerId: EntityId\)/g,
    replacement: 'async getNoteAttributes(noteId: EntityId)',
    description: 'Fix getNoteAttributes parameter name'
  },
  {
    pattern: /async getNoteAttachments\(ownerId: EntityId\)/g,
    replacement: 'async getNoteAttachments(noteId: EntityId)',
    description: 'Fix getNoteAttachments parameter name'
  },
  {
    pattern: /async exportNote\(ownerId: EntityId,/g,
    replacement: 'async exportNote(noteId: EntityId,',
    description: 'Fix exportNote parameter name'
  },
  {
    pattern: /async importNote\(ownerId: EntityId,/g,
    replacement: 'async importNote(noteId: EntityId,',
    description: 'Fix importNote parameter name'
  },
  {
    pattern: /async createRevision\(ownerId: EntityId\)/g,
    replacement: 'async createRevision(noteId: EntityId)',
    description: 'Fix createRevision parameter name'
  },
  {
    pattern: /async getBacklinks\(ownerId: EntityId\)/g,
    replacement: 'async getBacklinks(noteId: EntityId)',
    description: 'Fix getBacklinks parameter name'
  },
  {
    pattern: /async getOutgoingLinks\(ownerId: EntityId\)/g,
    replacement: 'async getOutgoingLinks(noteId: EntityId)',
    description: 'Fix getOutgoingLinks parameter name'
  },
  {
    pattern: /async planObsidianExport\(ownerId: EntityId\)/g,
    replacement: 'async planObsidianExport(noteId: EntityId)',
    description: 'Fix planObsidianExport parameter name'
  },
  {
    pattern: /async planNotionExport\(ownerId: EntityId\)/g,
    replacement: 'async planNotionExport(noteId: EntityId)',
    description: 'Fix planNotionExport parameter name'
  },
  {
    pattern: /async buildNoteTree\(rootId: EntityId,/g,
    replacement: 'async buildNoteTree(rootId: EntityId,',
    description: 'Keep buildNoteTree parameter name as rootId'
  },
  {
    pattern: /const buildTreeRecursive = async \(ownerId: EntityId,/g,
    replacement: 'const buildTreeRecursive = async (noteId: EntityId,',
    description: 'Fix buildTreeRecursive parameter name'
  },
  // Fix CreateBranchDef property name
  {
    pattern: /validateEntityId\(branchDef\.ownerId, 'noteId'\)/g,
    replacement: 'validateEntityId(branchDef.noteId, \'noteId\')',
    description: 'Fix CreateBranchDef property access'
  },
  // Fix CreateAttributeDef property name  
  {
    pattern: /validateEntityId\(attributeDef\.ownerId, 'noteId'\)/g,
    replacement: 'validateEntityId(attributeDef.noteId, \'noteId\')',
    description: 'Fix CreateAttributeDef property access'
  },
  // Fix SearchResult property access
  {
    pattern: /result\.ownerId/g,
    replacement: 'result.noteId',
    description: 'Fix SearchResult property name'
  },
  // Fix various other ownerId -> noteId conversions in the specific context
  {
    pattern: /ownerId: note\.noteId/g,
    replacement: 'noteId: note.noteId',
    description: 'Fix note ID property assignment'
  },
];

async function fixApiClient() {
  const filePath = '/root/repos/trilium-cli-ts/src/api/client.ts';
  
  try {
    let content = await fs.readFile(filePath, 'utf8');
    let totalFixes = 0;
    
    console.log('🔧 Fixing API client parameter names and property access...\n');
    
    for (const fix of fixes) {
      const matches = content.match(fix.pattern);
      if (matches) {
        content = content.replace(fix.pattern, fix.replacement);
        totalFixes += matches.length;
        console.log(`  ✓ ${fix.description}: ${matches.length} fixes`);
      }
    }
    
    if (totalFixes > 0) {
      await fs.writeFile(filePath, content);
      console.log(`\n✅ Applied ${totalFixes} fixes to API client`);
    } else {
      console.log('ℹ️  No fixes needed');
    }
  } catch (error) {
    console.error('Error fixing API client:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fixApiClient().catch(console.error);
}