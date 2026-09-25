import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    alias: {
      obsidian: resolve(import.meta.dirname, 'tests/obsidian-stub.ts'),
    },
  },
});
