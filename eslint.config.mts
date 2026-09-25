import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

export default tseslint.config(
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        // Obsidian augments the global scope with these DOM helpers
        createEl: 'readonly',
        createDiv: 'readonly',
        createSpan: 'readonly',
        createSvg: 'readonly',
        createFragment: 'readonly',
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['tests/**/*.ts'],
    rules: {
      'obsidianmd/hardcoded-config-path': 'off',
    },
  },
  globalIgnores([
    'node_modules',
    'dist',
    'esbuild.config.mjs',
    'eslint.config.js',
    'version-bump.mjs',
    'versions.json',
    'main.js',
  ]),
);
