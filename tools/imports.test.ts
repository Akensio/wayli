// Who may import whom (src/README.md, "May use"), checked on every file: the layers of the app in one order, each
// importing only the layers below it and its own folder, and no file reaching itself again through its imports.
// Type-only imports count: a type says which layer owns a meaning, and a cycle of types is a cycle of ownership.
import { test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const SRC = resolve(import.meta.dirname, '../src');

/** The layers, bottom first: a file may import its own folder and any folder ranked below its own. */
export const LAYERS = [
  'engine', // the logic with no screen: nothing of the app
  'worker', // the data worker and its contract (ops.ts) and client
  'lib', // strings, time
  'journey', // the domain: places, queries, journeys, the records kept on the phone; their words and colours
  'state', // signals, one module per feature, and the on-device store
  'widgets', // small pieces several views share
  'map', // the one map and what it draws
  'controllers', // what happens behind the screen
  'views', // the parts of the screen
  '', // the entry files at the top of src/ (main.ts, boot.ts)
];
const rank = (folder: string): number => LAYERS.indexOf(folder);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== 'public' && name !== 'types' && name !== 'styles') walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}
/** Every module a file names: static imports and re-exports (type-only too), side-effect imports, dynamic imports. */
function specifiers(text: string): string[] {
  // line comments first: a comment such as "state/*.ts" must not open a block comment
  const code = text.replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  for (const re of [
    /\b(?:import|export)\s[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ])
    for (const m of code.matchAll(re)) out.push(m[1]);
  return out;
}
function resolveSpec(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // a package
  const base = resolve(dirname(from), spec);
  for (const p of [base, base + '.ts', base + '.tsx', join(base, 'index.ts')])
    if (/\.(ts|tsx)$/.test(p) && existsSync(p) && statSync(p).isFile()) return p;
  return null; // CSS, the service-worker template, assets
}
/** The folder a file belongs to, as LAYERS names it ('' for the entry files). */
const folderOf = (file: string): string => {
  const r = relative(SRC, file).split('/');
  return r.length > 1 ? r[0] : '';
};

const files = walk(SRC);
const graph = new Map<string, string[]>();
for (const f of files)
  graph.set(
    f,
    specifiers(readFileSync(f, 'utf8'))
      .map((s) => resolveSpec(f, s))
      .filter((p): p is string => p != null),
  );
const rel = (p: string) => relative(SRC, p);

test('every import points to its own folder or a layer below', () => {
  const wrong: string[] = [];
  for (const [f, deps] of graph) {
    const a = folderOf(f);
    expect(rank(a), `${rel(f)}: its folder is not in LAYERS`).toBeGreaterThanOrEqual(0);
    for (const d of deps) {
      const b = folderOf(d);
      if (b !== a && !(rank(b) < rank(a))) wrong.push(`${rel(f)} -> ${rel(d)}`);
    }
  }
  expect(wrong, 'imports against the layer order').toEqual([]);
});

test('no file reaches itself through its imports', () => {
  const cycles: string[] = [];
  const state = new Map<string, 'open' | 'done'>();
  const stack: string[] = [];
  const visit = (f: string) => {
    state.set(f, 'open');
    stack.push(f);
    for (const d of graph.get(f) || []) {
      if (state.get(d) === 'open') cycles.push([...stack.slice(stack.indexOf(d)), d].map(rel).join(' > '));
      else if (!state.has(d)) visit(d);
    }
    stack.pop();
    state.set(f, 'done');
  };
  for (const f of graph.keys()) if (!state.has(f)) visit(f);
  expect(cycles, 'import cycles').toEqual([]);
});
