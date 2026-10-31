// Who may import whom, as src/README.md's folder table says it ("May use"), checked on every file: a file imports its own
// folder and the folders its folder's row names, nothing else, and no file reaches itself again through its imports.
// Type-only imports count: a type says which folder owns a meaning, and a cycle of types is a cycle of ownership.
// The table is read, not copied here, so the README cannot say one thing while the code does another.
import { test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

const SRC = resolve(import.meta.dirname, '../src');

/** The README's folder table: each folder ('' for the entry files) and the folders it may use. */
export function readTable(readme: string): Map<string, Set<string>> {
  const may = new Map<string, Set<string>>();
  const start = readme.indexOf('| Folder | What | May use |');
  if (start < 0) throw new Error('src/README.md has no "| Folder | What | May use |" table');
  for (const line of readme.slice(start).split('\n').slice(2)) {
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1);
    const own = /^\s*`(\w+)\/`/.exec(cells[0])?.[1] ?? (/entry files/.test(cells[0]) ? '' : null);
    if (own == null) throw new Error(`src/README.md: a row names no folder: ${line}`);
    may.set(own, new Set([...cells[2].matchAll(/`(\w+)\/`/g)].map((m) => m[1])));
  }
  return may;
}
const MAY = readTable(readFileSync(join(SRC, 'README.md'), 'utf8'));

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
/** The folder a file belongs to, as the table names it ('' for the entry files). */
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

test("every import is to the file's own folder or one its row in src/README.md names", () => {
  const wrong: string[] = [];
  for (const [f, deps] of graph) {
    const a = folderOf(f);
    const may = MAY.get(a);
    expect(may, `${rel(f)}: its folder has no row in src/README.md`).toBeDefined();
    for (const d of deps) {
      const b = folderOf(d);
      if (b !== a && !may!.has(b)) wrong.push(`${rel(f)} -> ${rel(d)}`);
    }
  }
  expect(wrong, 'imports src/README.md does not allow').toEqual([]);
});

test('the table itself runs one way: no folder reaches itself through the folders it may use', () => {
  const cycles: string[] = [];
  const seen = new Map<string, 'open' | 'done'>();
  const path: string[] = [];
  const visit = (x: string) => {
    seen.set(x, 'open');
    path.push(x);
    for (const y of MAY.get(x) || []) {
      if (seen.get(y) === 'open') cycles.push([...path.slice(path.indexOf(y)), y].join(' > '));
      else if (!seen.has(y)) visit(y);
    }
    path.pop();
    seen.set(x, 'done');
  };
  for (const x of MAY.keys()) if (!seen.has(x)) visit(x);
  expect(cycles).toEqual([]);
});

test('the table lists only uses the code has (a use given up comes out of the table)', () => {
  const used = new Map<string, Set<string>>();
  for (const [f, deps] of graph)
    for (const d of deps) {
      const a = folderOf(f),
        b = folderOf(d);
      if (a !== b) used.set(a, (used.get(a) || new Set()).add(b));
    }
  const unused: string[] = [];
  for (const [a, may] of MAY)
    for (const b of may) if (b !== 'styles' && !used.get(a)?.has(b)) unused.push(`${a || 'entry files'} -> ${b}/`);
  expect(unused, 'uses in src/README.md the code no longer has').toEqual([]);
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
