#!/usr/bin/env node
// Merge canonical inbox files into their capability-minted source stubs.
// Ruling (first co-pilot run): the inbox file's verbatim body + captured_*
// provenance is canonical; the stub contributes the registry keys.
// usage: node merge-canonical.mjs <mapping.json> [client_slug=reach-edu]
// mapping: [{ inbox, corpus_path, source_uuid, registry_keys: [lines...], tags, triaged_to, binary }]
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

const CLIENTS = '/Users/mpstaton/code/lossless-monorepo/ai-labs/augment-it/clients';
const CLIENT = process.argv[3] ?? 'reach-edu';
const INBOX = join(CLIENTS, CLIENT, 'corpus/inbox');
const EXTRACTS = '\n\n# Extracts\n\n## Quotes\n\n## Stats\n\n## References\n\n## Mentions\n';
const now = new Date().toISOString();

const mapping = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const m of mapping) {
  const inboxPath = join(INBOX, m.inbox);
  const target = join(CLIENTS, m.corpus_path);
  const src = readFileSync(inboxPath, 'utf8');
  const lines = src.split('\n');
  if (lines[0] !== '---') throw new Error(`no frontmatter: ${m.inbox}`);
  const close = lines.indexOf('---', 1);

  // 1. lift registry keys from the capability-written stub (source_uuid, url,
  // normalized_url, bib, domains) — skip its title/tags/fetched_at (inbox wins),
  // and assert content is present since the canonical body rides along.
  const stub = readFileSync(target, 'utf8').split('\n');
  const stubClose = stub.indexOf('---', 1);
  const keep = [];
  let inKept = false;
  for (let i = 1; i < stubClose; i++) {
    const l = stub[i];
    if (/^(source_uuid|url|normalized_url|created_by|publisher|published_date|authors|domains):/.test(l)) {
      keep.push(l);
      inKept = /^(authors|domains):/.test(l);
    } else if (inKept && /^\s+- /.test(l)) keep.push(l);
    else if (!/^\s+- /.test(l)) inKept = false;
  }
  keep.push('status: "fetched"', 'content_pulled: true');
  lines.splice(1, 0, ...keep);

  // 2. field updates within frontmatter
  const closeNow = lines.indexOf('---', 1);
  for (let i = 1; i < closeNow; i++) {
    if (/^inbox_status: "pending"$/.test(lines[i])) lines[i] = 'inbox_status: "triaged"';
    else if (/^tags: \[\]$/.test(lines[i])) lines[i] = `tags: [${m.tags.map((t) => `"${t}"`).join(', ')}]`;
    else if (/^triaged_at: null$/.test(lines[i])) lines[i] = `triaged_at: ${now}`;
    else if (/^triaged_to: null$/.test(lines[i])) lines[i] = `triaged_to: "${m.triaged_to}"`;
    else if (/^triaged_by: null$/.test(lines[i])) lines[i] = 'triaged_by: "operator-confirmed:triage-inbox-w-suggestions"';
    else if (/^triaged_note: null$/.test(lines[i])) lines[i] = `triaged_note: "batch 1 of run 2026-07-24_1; inbox file kept as canonical artifact per first-run ruling"`;
  }

  let out = lines.join('\n');
  if (!out.includes('# Extracts')) out = out.trimEnd() + EXTRACTS;
  writeFileSync(target, out);
  unlinkSync(inboxPath);

  // 3. binary sibling moves with it, renamed to the source_slug basename
  if (m.binary) {
    const from = join(INBOX, m.binary);
    const ext = m.binary.slice(m.binary.lastIndexOf('.'));
    const to = join(dirname(target), basename(target, '.md') + ext);
    if (existsSync(from)) { renameSync(from, to); console.log(`  binary: ${m.binary} -> ${basename(to)}`); }
    else console.log(`  WARN binary missing: ${m.binary}`);
  }
  console.log(`merged: ${m.inbox} -> ${m.corpus_path}`);
}
