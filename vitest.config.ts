// The tests: `npm test` runs them once, `npm run test:watch` while editing. They are the files tests/*.test.mjs and
// *.test.ts (each says which principle or rule it holds), run in Node, with Vite resolving the app's TypeScript.
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.{mjs,ts}'], environment: 'node' } });
