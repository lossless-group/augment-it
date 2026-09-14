#!/usr/bin/env node
/**
 * organ-census — who consumes which federal primitive, and how much.
 *
 * WHY THE OBVIOUS QUERY DOES NOT WORK. The house convention spells component
 * variants in BEM — `SelectWrapper--Checkbox.svelte` — so that
 * `rg 'SelectWrapper--'` reads as a live catalogue with no doc to maintain.
 *
 * It does not, for components used as TAGS. A Svelte tag must be a valid JS
 * identifier, so the BEM name can never appear at a call site, and the local
 * alias is whatever the importing member chose. In this repo one primitive is
 * called `SelectWrapperClickBody` in one member and `SelectCheck` in another.
 * Grepping the BEM form found 2 imports against 14 call sites; grepping one
 * identifier misses every member that picked a different one.
 *
 * THE IMPORT PATH IS CANONICAL. It carries the BEM filename verbatim and cannot
 * be aliased. So: resolve each file's local name from its import, then count
 * that name's tags in that file.
 *
 *   node scripts/organ-census.mjs
 *   node scripts/organ-census.mjs --json
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const JSON_OUT = process.argv.includes('--json');

const PKG = join(REPO, 'packages/shared-ui/src');
const organs = readdirSync(PKG)
  .filter((f) => f.endsWith('.svelte'))
  .map((f) => f.replace(/\.svelte$/, ''))
  .sort();

function svelteFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'probe') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) svelteFiles(p, out);
    else if (e.name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

const roots = ['apps', 'shell', 'packages'].map((r) => join(REPO, r)).filter(existsSync);
const files = roots.flatMap((r) => svelteFiles(r));

const census = Object.fromEntries(organs.map((o) => [o, { sites: 0, members: new Set() }]));

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(REPO.length + 1);
  // apps/<member>/… or shell/… or packages/<pkg>/…
  const member = rel.startsWith('apps/') ? rel.split('/').slice(0, 2).join('/') : rel.split('/')[0];
  for (const organ of organs) {
    // The import path is the only spelling that cannot be aliased away.
    const imp = new RegExp(
      `import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+['"][^'"]*shared-ui/${organ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.svelte['"]`,
    );
    const m = src.match(imp);
    if (!m) continue;
    const local = m[1];
    const tags = src.match(new RegExp(`<${local}[\\s/>]`, 'g'));
    const n = tags ? tags.length : 0;
    if (n === 0) continue;
    census[organ].sites += n;
    census[organ].members.add(member);
  }
}

const rows = organs
  .map((o) => ({ organ: o, sites: census[o].sites, members: census[o].members.size }))
  .sort((a, b) => b.sites - a.sites);

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const w = Math.max(...rows.map((r) => r.organ.length), 5);
  console.log(`${'organ'.padEnd(w)}  call sites  consuming units`);
  console.log('-'.repeat(w + 28));
  for (const r of rows) {
    console.log(`${r.organ.padEnd(w)}  ${String(r.sites).padStart(10)}  ${String(r.members).padStart(15)}`);
  }
  const total = rows.reduce((a, r) => a + r.sites, 0);
  console.log('-'.repeat(w + 28));
  console.log(`${'TOTAL'.padEnd(w)}  ${String(total).padStart(10)}`);
}
