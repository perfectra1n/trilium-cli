import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/*.test.*',
        '**/*.spec.*',
      ],
    },
    exclude: [
      'node_modules/',
      'dist/',
      '.git/',
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/api': resolve(__dirname, './src/api'),
      '@/cli': resolve(__dirname, './src/cli'),
      '@/config': resolve(__dirname, './src/config'),
      '@/tui': resolve(__dirname, './src/tui'),
      '@/utils': resolve(__dirname, './src/utils'),
      '@/types': resolve(__dirname, './src/types'),
    },
  },
});