import { useEffect } from 'react';
import { useInput } from 'ink';
import type { KeyBinding, AppState } from '../types.js';

export const useKeyBindings = (bindings: KeyBinding[], state: AppState) => {
  useInput((input, key) => {
    // Don't process key bindings when dialogs are open
    if (state.showCreateDialog || state.showAttributeManager || state.showCommandPalette) {
      // Allow ESC to close dialogs
      if (key.escape) {
        // This will be handled by the dialog components
        return;
      }
      return;
    }

    // Process registered key bindings
    for (const binding of bindings) {
      let shouldTrigger = false;

      // Check modifiers
      if (binding.ctrl && !key.ctrl) continue;
      if (binding.alt && !key.meta) continue;  // ink uses 'meta' for alt key
      if (binding.shift && !key.shift) continue;
      
      // Check if no modifiers should be pressed
      if (!binding.ctrl && key.ctrl) continue;
      if (!binding.alt && key.meta) continue;  // ink uses 'meta' for alt key
      if (!binding.shift && key.shift && binding.key !== binding.key.toUpperCase()) continue;

      // Check the actual key
      if (binding.key === input || 
          (binding.key.toLowerCase() === input?.toLowerCase())) {
        shouldTrigger = true;
      }

      // Special key mappings
      const specialKeys: Record<string, string> = {
        'return': '\r',
        'enter': '\r',
        'tab': '\t',
        'escape': '\x1B',
        'space': ' ',
        'backspace': '\x7F',
        'delete': '\x7F',
      };

      if (specialKeys[binding.key.toLowerCase()] === input) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        if (typeof binding.action === 'function') {
          binding.action();
        }
        return;
      }
    }
  });

  // Return a helper to programmatically trigger bindings
  return {
    trigger: (key: string) => {
      const binding = bindings.find(b => b.key === key);
      if (binding && typeof binding.action === 'function') {
        binding.action();
      }
    }
  };
};