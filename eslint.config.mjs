// Lint: undeclared names are errors (a Safari-only crash slipped through once); TypeScript files get the
// typescript-eslint recommended rules on top. Run with `npm run lint`; the workflow runs it before every build.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/public/**', 'site/**', 'data/**'] },
  js.configs.recommended,
  { files: ['src/sw.template.js'], languageOptions: { globals: { __SHELL_FILES__: 'readonly' } } }, // filled in at build time
  ...tseslint.configs.recommended,
  {
    files: [
      'src/**/*.{js,ts,tsx}',
      'tests/**/*.{mjs,ts}',
      'measure/**/*.{mjs,ts}',
      'vite.config.ts',
      'vitest.config.ts',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.worker },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-nested-ternary': 'error', // a chain reads as an if; a ternary inside a branch reads as nothing (2026-10-31)
      'prefer-const': 'off',
      'no-cond-assign': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // the relay runs on Cloudflare Workers (fetch, Response, URL: the service-worker globals)
  {
    files: ['relay/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.serviceworker } },
    rules: { 'no-undef': 'error' },
  },
  // TypeScript itself rejects undeclared names, and knows type-only names (GeoJSON, DOM types) that this rule does not
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'measure/**/*.ts', 'vite.config.ts', 'vitest.config.ts'],
    rules: { 'no-undef': 'off' },
  },
);
