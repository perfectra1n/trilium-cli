/**
 * External editor utilities
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Open a note in an external editor
 */
export async function openNoteInExternalEditor(
  content: string,
  fileName: string = 'note.md'
): Promise<string> {
  // Create a temporary file
  const tempFile = join(tmpdir(), `trilium-${Date.now()}-${fileName}`);
  writeFileSync(tempFile, content, 'utf-8');
  
  // Get the editor from environment variable or use default
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  
  return new Promise((resolve, reject) => {
    const child = spawn(editor, [tempFile], {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('exit', (code) => {
      if (code === 0) {
        try {
          // Read the edited content
          const editedContent = readFileSync(tempFile, 'utf-8');
          // Clean up the temporary file
          unlinkSync(tempFile);
          resolve(editedContent);
        } catch (error) {
          reject(error);
        }
      } else {
        // Clean up the temporary file
        try {
          unlinkSync(tempFile);
        } catch {}
        reject(new Error(`Editor exited with code ${code}`));
      }
    });
    
    child.on('error', (error) => {
      // Clean up the temporary file
      try {
        unlinkSync(tempFile);
      } catch {}
      reject(error);
    });
  });
}