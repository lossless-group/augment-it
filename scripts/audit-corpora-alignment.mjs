#!/usr/bin/env node
// Corpora alignment audit — the standing, runnable form of the 2026-07-30
// by-hand check that caught humain-vc's missing corpora.
//
// READ-ONLY. Reads the canonical `domains` rows from the cloud instance and
// scans the on-disk corpus folders, then diffs them per client via the pure
// (unit-tested) diffCorpora in scripts/lib/corpus-alignment.mjs. Flags drift
// with specifics and exits non-zero; NEVER writes or "fixes" anything
// (surrealdb-canonical-layer skill: flag, don't fix).
//
// Usage:  node scripts/audit-corpora-alignment.mjs
// Exit:   0 aligned · 1 drift detected · 2 could not run

import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Surreal } from 'surrealdb';
import { FOLDER_TO_TYPE, diffCorpora, formatAlignmentReport } from './lib/corpus-alignment.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const raw = readFileSync(join(ROOT, '.env'), 'utf8');
  return Object.fromEntries(
    raw
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

/** DB rows → one {client_slug,type,slug} per client on each domain. */
async function readDbDomains(env) {
  const db = new Surreal();
  await db.connect(env.SURREAL_URL);
  await db.signin({ username: env.SURREAL_USER, password: env.SURREAL_PASS });
  await db.use({ namespace: env.SURREAL_NS, database: env.SURREAL_DB });
  const [rows] = await db.query('SELECT type, slug, client_slugs FROM domains;');
  await db.close();
  const out = [];
  for (const r of rows ?? []) {
    for (const client_slug of r.client_slugs ?? []) out.push({ client_slug, type: r.type, slug: r.slug });
  }
  return out;
}

/** Disk: clients/<client>/corpus/<folder>/<slug>/ → {client_slug,type,slug}. */
async function readDiskDomains() {
  const clientsRoot = join(ROOT, 'clients');
  const out = [];
  let clients = [];
  try {
    clients = (await readdir(clientsRoot, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return out; // no clients/ dir (e.g. a fresh clone) — nothing on disk
  }
  for (const client of clients) {
    for (const [folder, type] of Object.entries(FOLDER_TO_TYPE)) {
      const dir = join(clientsRoot, client, 'corpus', folder);
      let slugs = [];
      try {
        slugs = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        continue; // this type-folder doesn't exist for this client
      }
      for (const slug of slugs) out.push({ client_slug: client, type, slug });
    }
  }
  return out;
}

async function main() {
  const env = loadEnv();
  const [dbDomains, diskDomains] = await Promise.all([readDbDomains(env), readDiskDomains()]);
  const result = diffCorpora(dbDomains, diskDomains);
  console.log(formatAlignmentReport(result));
  console.log(
    `\n(${dbDomains.length} DB domain-client entries, ${diskDomains.length} disk folders, ${Object.keys(result.clients).length} clients)`,
  );
  process.exit(result.aligned ? 0 : 1);
}

main().catch((err) => {
  console.error('audit could not run:', err?.message ?? err);
  process.exit(2);
});
