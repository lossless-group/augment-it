#!/usr/bin/env node
/**
 * verify-federation — one command that answers "is anything broken, and where?"
 *
 * WHY THIS EXISTS. The gates we had prove a unit TYPECHECKS and BUILDS. They do
 * not prove it RENDERS. Across a night of parallel component migrations that is
 * exactly the gap that turns a demo morning into a bisect session — and the
 * failure we care about is not "the federation is broken", it is "WHICH member,
 * and at WHICH commit".
 *
 * So this walks every buildable unit independently and reports a table. One
 * member failing does not stop the others, because the whole point is to learn
 * how many are broken, not just that one is.
 *
 * Usage:
 *   node scripts/verify-federation.mjs            # check + build every unit
 *   node scripts/verify-federation.mjs --fast     # check only, no builds
 *   node scripts/verify-federation.mjs --since HEAD~5   # only units touched since a ref
 *
 * Exit code is the number of failing units, capped at 125 — so CI and a human
 * both get a usable signal, and `git bisect run` works directly.
 */
import { execSync, spawnSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const argv = process.argv.slice(2);
const FAST = argv.includes('--fast');
const sinceIdx = argv.indexOf('--since');
const SINCE = sinceIdx >= 0 ? argv[sinceIdx + 1] : null;

/** Every directory that is its own pnpm package with a build or check script. */
function units() {
  const out = [];
  const roots = ['apps', 'packages', 'services'];
  const singles = ['shell'];
  const consider = (rel) => {
    const pkgPath = join(REPO, rel, 'package.json');
    if (!existsSync(pkgPath)) return;
    let pkg;
    try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { return; }
    const scripts = pkg.scripts ?? {};
    if (!scripts.check && !scripts.build) return;
    out.push({ rel, name: pkg.name, hasCheck: !!scripts.check, hasBuild: !!scripts.build });
  };
  for (const root of roots) {
    const abs = join(REPO, root);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'node_modules') continue;
      consider(`${root}/${e.name}`);
    }
  }
  for (const s of singles) consider(s);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Units with a source file touched since <ref> — for a fast pre-push check. */
function touchedSince(ref) {
  let files;
  try {
    files = execSync(`git diff --name-only ${ref}..HEAD`, { cwd: REPO, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch {
    console.error(`could not diff against "${ref}" — checking everything instead`);
    return null;
  }
  // A change under packages/ can break any consumer, so it widens to everything.
  if (files.some((f) => f.startsWith('packages/'))) return null;
  return new Set(files.map((f) => f.split('/').slice(0, 2).join('/')));
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: REPO, encoding: 'utf8', shell: false });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const all = units();
const touched = SINCE ? touchedSince(SINCE) : null;
const list = touched ? all.filter((u) => touched.has(u.rel)) : all;

if (touched && list.length !== all.length) {
  console.log(`scoped to ${list.length} unit(s) touched since ${SINCE}\n`);
}

const rows = [];
let failures = 0;

for (const u of list) {
  const row = { unit: u.rel, check: '—', build: '—', detail: '' };

  if (u.hasCheck) {
    const r = run('pnpm', ['--filter', u.name, 'check']);
    // svelte-check exits 0 on warnings; treat only ERRORS as failure, matching
    // how every migration loop reads this gate.
    const m = r.out.match(/COMPLETED\s+\d+\s+FILES\s+(\d+)\s+ERRORS/);
    const errs = m ? Number(m[1]) : (r.ok ? 0 : 1);
    row.check = errs === 0 ? 'pass' : `${errs} err`;
    if (errs !== 0) row.detail = r.out.trim().split('\n').slice(-3).join(' | ');
  }

  if (!FAST && u.hasBuild) {
    const r = run('pnpm', ['--filter', u.name, 'build']);
    row.build = r.ok ? 'pass' : 'FAIL';
    if (!r.ok && !row.detail) row.detail = r.out.trim().split('\n').slice(-3).join(' | ');
  }

  const bad = row.check.includes('err') || row.build === 'FAIL';
  if (bad) failures++;
  rows.push(row);
  process.stdout.write(`${bad ? '✗' : '·'} ${u.rel}\n`);
}

const w = Math.max(...rows.map((r) => r.unit.length), 4);
console.log(`\n${'unit'.padEnd(w)}  check     build`);
console.log('-'.repeat(w + 18));
for (const r of rows) {
  console.log(`${r.unit.padEnd(w)}  ${r.check.padEnd(8)}  ${r.build}`);
  if (r.detail) console.log(`${' '.repeat(w + 2)}↳ ${r.detail}`);
}

// The design gates are federation-wide, so they run once rather than per unit.
if (!FAST) {
  const drift = run('node', ['scripts/design-drift.mjs']);
  const struct = run('node', ['scripts/design-drift.mjs', '--structure']);
  console.log(`\n${drift.out.trim().split('\n').slice(-2).join('\n')}`);
  console.log(struct.out.trim().split('\n').slice(-1)[0]);
  if (!struct.ok) failures++;
}

console.log(
  failures === 0
    ? `\n✓ ${rows.length} units verified, nothing broken`
    : `\n✗ ${failures} of ${rows.length} units failing — named above`,
);
process.exit(Math.min(failures, 125));
