#!/usr/bin/env node
// Generalized org-bucket filing: move an inbox file (+binary sibling) into an
// org folder (funders/, gov-entities/, think-tanks/), stamp frontmatter, and
// write reference_of pointer files into domain sources/ folders.
// usage: node org-move.mjs <mapping.json> [client_slug=reach-edu]
import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const CLIENT = process.argv[3] ?? 'reach-edu';
const CORPUS = `/Users/mpstaton/code/lossless-monorepo/ai-labs/augment-it/clients/${CLIENT}/corpus`;
const INBOX = join(CORPUS, 'inbox');
const now = new Date().toISOString();

for (const m of JSON.parse(readFileSync(process.argv[2], 'utf8'))) {
  const destDir = join(CORPUS, m.dest);
  mkdirSync(destDir, { recursive: true });
  const src = readFileSync(join(INBOX, m.inbox), 'utf8');
  const lines = src.split('\n');
  lines.splice(1, 0, `content_uuid: "${m.content_uuid}"`, `org_uuid: "${m.org_uuid}"`, `org_slug: "${m.org_slug}"`);
  const close = lines.indexOf('---', 1);
  for (let i = 1; i < close; i++) {
    if (/^inbox_status: "pending"$/.test(lines[i])) lines[i] = 'inbox_status: "triaged"';
    else if (/^funder_slug: "inbox"$/.test(lines[i])) lines[i] = m.dest.startsWith('funders/') ? `funder_slug: "${m.org_slug}"` : 'funder_slug: null';
    else if (/^tags: \[\]$/.test(lines[i]) && m.tags?.length) lines[i] = `tags: [${m.tags.map((t) => `"${t}"`).join(', ')}]`;
    else if (/^triaged_at: null$/.test(lines[i])) lines[i] = `triaged_at: ${now}`;
    else if (/^triaged_to: null$/.test(lines[i])) lines[i] = `triaged_to: "corpus/${m.dest}/"`;
    else if (/^triaged_by: null$/.test(lines[i])) lines[i] = 'triaged_by: "operator-confirmed:triage-inbox-w-suggestions"';
    else if (/^triaged_note: null$/.test(lines[i])) lines[i] = `triaged_note: ${JSON.stringify(m.note ?? 'run 2026-07-24_1; inbox file kept as canonical artifact')}`;
  }
  writeFileSync(join(destDir, m.inbox), lines.join('\n'));
  unlinkSync(join(INBOX, m.inbox));
  if (m.binary) {
    const from = join(INBOX, m.binary);
    if (existsSync(from)) { renameSync(from, join(destDir, m.binary)); console.log(`  binary: ${m.binary}`); }
    else console.log(`  WARN binary missing: ${m.binary}`);
  }
  console.log(`moved: ${m.inbox} -> ${m.dest}/`);

  for (const p of m.pointers ?? []) {
    const pDir = join(CORPUS, p.dir);
    mkdirSync(pDir, { recursive: true });
    const pointer = `---
reference_of: "${m.content_uuid}"
canonical_path: "corpus/${m.dest}/${m.inbox}"
reference_note: ${JSON.stringify(p.note)}
title: ${JSON.stringify(m.title)}
exact_url: ${JSON.stringify(m.exact_url)}
org_slug: "${m.org_slug}"
tags: [${(m.tags ?? []).map((t) => `"${t}"`).join(', ')}]
---

Pointer: canonical file lives at \`corpus/${m.dest}/${m.inbox}\` (content_uuid \`${m.content_uuid}\` in SurrealDB).
`;
    writeFileSync(join(pDir, m.inbox), pointer);
    console.log(`  pointer: ${p.dir}/${m.inbox}`);
  }
}
