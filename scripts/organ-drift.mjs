#!/usr/bin/env node

/*
 * organ-drift.mjs — the fingerprint ledger for the federated design system.
 *
 * Zero dependencies, pure Node.
 *
 * WHY THIS EXISTS. The root DESIGN.md recorded four byte-identical promotion
 * candidates on 2026-07-30. Nobody re-measured. Six weeks later two of the four
 * had drifted into distinct versions — WHILE SITTING IN A LIST WHOSE ENTIRE
 * PURPOSE WAS TO CATCH DRIFT. The list kept asserting "byte-identical" long
 * after it stopped being true.
 *
 * A list written once and never re-measured decays into a historical document
 * that reads like a live one, which is worse than no list because it is
 * believed. This script is that list, measured on demand instead.
 *
 * WHAT IT CATCHES. The mechanical half of convergence: components that share a
 * basename across two or more members. That is exactly the ColumnMapper /
 * RecordCard / ConnectorChip case, and it needs no agent and no judgement.
 *
 * WHAT IT DOES NOT CATCH. The semantic half — one organ implemented as a
 * component in one member, inline markup in a second, and a CSS class recipe in
 * a third, under three different names. No hash finds that. That is what the
 * scanner agents in the convergence loop are for. This script deliberately does
 * the cheap half completely rather than the whole job badly.
 *
 * Usage:
 *   node scripts/organ-drift.mjs              compare against the ledger
 *   node scripts/organ-drift.mjs --record     write current state to the ledger
 *   node scripts/organ-drift.mjs --json       machine-readable
 *
 * Exit codes: 0 = no divergence since the ledger. 1 = something diverged.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const LEDGER = resolve(REPO_ROOT, 'design-organ-ledger.json');

const args = process.argv.slice(2);
const FLAG = { record: args.includes('--record'), json: args.includes('--json') };

// Where members live. shell is a member; packages/* are the platform layer and
// are scanned too, because a published primitive reimplemented inline in a
// member is its own finding (ConfidencePill is the suspected case).
const SCAN_ROOTS = [
  { root: 'apps', kind: 'member' },
  { root: 'packages', kind: 'platform' },
];
const SCAN_SINGLETONS = [{ path: 'shell', kind: 'member' }];

// Structural names every member has BY CONVENTION. A shared basename here means
// "both are micro-frontends", not "both built the same organ" — App.svelte IS
// the member. Counting it would put a 19-way permanent divergence at the top of
// every report and train the reader to skim past the real findings.
const STRUCTURAL_NAMES = new Set(['App']);

function walkSvelte(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkSvelte(full, out);
    else if (e.name.endsWith('.svelte')) out.push(full);
  }
  return out;
}

// Hash the SUBSTANCE, not the bytes. Comments and blank lines are where members
// legitimately differ (each one explains itself in its own voice), and counting
// those as divergence would make the ledger cry wolf on every doc edit. Two
// files that differ only in commentary are the same implementation.
function substanceHash(text) {
  const stripped = text
    .replace(/<!--[\s\S]*?-->/g, '')      // html comments
    .replace(/\/\*[\s\S]*?\*\//g, '')     // block comments
    .replace(/(^|\s)\/\/.*$/gm, '')       // line comments
    .replace(/\s+/g, ' ')                 // collapse whitespace
    .trim();
  return createHash('sha256').update(stripped).digest('hex').slice(0, 12);
}

function memberOf(relPath) {
  const parts = relPath.split('/');
  if (parts[0] === 'shell') return 'shell';
  return `${parts[0]}/${parts[1]}`;
}

function collect() {
  const files = [];
  for (const { root } of SCAN_ROOTS) {
    const abs = resolve(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'node_modules') continue;
      files.push(...walkSvelte(join(abs, e.name)));
    }
  }
  for (const { path } of SCAN_SINGLETONS) {
    const abs = resolve(REPO_ROOT, path);
    if (existsSync(abs) && statSync(abs).isDirectory()) files.push(...walkSvelte(abs));
  }

  // Group by component basename. A shared basename across two members is the
  // signal; it is not proof (two ResultRow.svelte can be unrelated), which is
  // why the report distinguishes identical from divergent rather than just
  // counting collisions.
  const byName = new Map();
  for (const abs of files) {
    const rel = abs.slice(REPO_ROOT.length + 1);
    const name = basename(abs, '.svelte');
    if (STRUCTURAL_NAMES.has(name)) continue;
    const text = readFileSync(abs, 'utf8');
    const entry = {
      member: memberOf(rel),
      file: rel,
      lines: text.split('\n').length,
      hash: substanceHash(text),
    };
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(entry);
  }

  const organs = {};
  for (const [name, impls] of byName) {
    const members = new Set(impls.map(i => i.member));
    if (members.size < 2) continue;               // single-member = local, healthy, not our business
    impls.sort((a, b) => a.file.localeCompare(b.file));
    const hashes = new Set(impls.map(i => i.hash));
    organs[name] = {
      state: hashes.size === 1 ? 'identical' : 'divergent',
      members: [...members].sort(),
      implementations: impls,
    };
  }
  return organs;
}

function loadLedger() {
  if (!existsSync(LEDGER)) return null;
  try { return JSON.parse(readFileSync(LEDGER, 'utf8')); } catch { return null; }
}

function main() {
  const current = collect();
  const ledger = loadLedger();
  const names = Object.keys(current).sort();

  if (FLAG.record) {
    const payload = {
      _comment: 'Fingerprint ledger for cross-member Svelte components. Regenerate with `pnpm organ:record`. Compare with `pnpm organ:drift`. See context-v/loops/Converge-The-Federated-Design-System.md — two of four promotion candidates drifted unnoticed over six weeks because nothing re-measured.',
      recorded: new Date().toISOString().slice(0, 10),
      organs: current,
    };
    writeFileSync(LEDGER, JSON.stringify(payload, null, 2) + '\n');
    console.log(`Recorded ${names.length} cross-member organs to design-organ-ledger.json`);
    return 0;
  }

  const diverged = [], convergedNow = [], appeared = [], identical = [], divergentAlready = [];
  for (const name of names) {
    const now = current[name];
    const was = ledger?.organs?.[name];
    if (!was) appeared.push(name);
    else if (was.state === 'identical' && now.state === 'divergent') diverged.push(name);
    else if (was.state === 'divergent' && now.state === 'identical') convergedNow.push(name);
    if (now.state === 'identical') identical.push(name); else divergentAlready.push(name);
  }
  const vanished = ledger ? Object.keys(ledger.organs).filter(n => !current[n]) : [];

  if (FLAG.json) {
    console.log(JSON.stringify({ diverged, convergedNow, appeared, vanished, identical, divergent: divergentAlready, organs: current }, null, 2));
    return diverged.length > 0 ? 1 : 0;
  }

  console.log(`Cross-member organs: ${names.length}  (${identical.length} identical, ${divergentAlready.length} divergent)`);
  if (!ledger) {
    console.log('\nNo ledger yet — run `pnpm organ:record` to establish the baseline.');
  } else {
    console.log(`Ledger recorded ${ledger.recorded}\n`);
    if (diverged.length) {
      console.log('DIVERGED SINCE LAST RECORD — unflagged drift:');
      for (const n of diverged) console.log(`  ${n}: ${current[n].members.join(', ')}`);
    }
    if (convergedNow.length) console.log(`CONVERGED since last record: ${convergedNow.join(', ')}`);
    if (appeared.length) console.log(`NEW cross-member organs: ${appeared.join(', ')}`);
    if (vanished.length) console.log(`GONE (renamed, removed, or down to one member): ${vanished.join(', ')}`);
    if (!diverged.length && !convergedNow.length && !appeared.length && !vanished.length) {
      console.log('No change since the ledger was recorded.');
    }
  }

  console.log('\n--- current state ---');
  for (const name of names) {
    const o = current[name];
    const mark = o.state === 'identical' ? '=' : '≠';
    console.log(`${mark} ${name.padEnd(28)} ${o.members.join(', ')}`);
    if (o.state === 'divergent') {
      for (const i of o.implementations) console.log(`    ${i.hash}  ${String(i.lines).padStart(4)}L  ${i.file}`);
    }
  }
  return diverged.length > 0 ? 1 : 0;
}

process.exit(main());
