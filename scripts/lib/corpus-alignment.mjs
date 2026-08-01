// Pure corpus-alignment diff — the standing invariant behind the
// 2026-07-30 by-hand check that caught humain-vc's missing corpora:
// for every client, the canonical `domains` rows and the on-disk corpus
// folders must name the same corpora. (domain.list is just the DB read
// over NATS, so DB-vs-disk IS the invariant; a third leg would be
// redundant.)
//
// This module is PURE — no IO, no cloud, no disk. The audit script feeds
// it already-gathered stores; tests feed it synthetic ones. Flag, never
// fix: it reports drift with specifics and returns a non-aligned verdict,
// leaving the human to decide (per the surrealdb-canonical-layer skill).

/** Folder-name ⇄ domain-type map (mirrors content-ingest's DOMAIN_FOLDERS). */
export const TYPE_TO_FOLDER = {
  strategy: 'strategies',
  topic: 'topics',
  thesis: 'theses',
  category: 'categories',
  'market-segment': 'market-segments',
};
export const FOLDER_TO_TYPE = Object.fromEntries(Object.entries(TYPE_TO_FOLDER).map(([t, f]) => [f, t]));

/** Canonical key for a corpus within a client. */
export const domainKey = (type, slug) => `${type}:${slug}`;

/**
 * Diff two already-gathered stores.
 * @param {{client_slug:string,type:string,slug:string}[]} dbDomains  — one entry per (client, domain); a shared domain expands to one per client_slug.
 * @param {{client_slug:string,type:string,slug:string}[]} diskDomains — one entry per corpus folder found on disk.
 * @returns {{aligned:boolean, clients:Record<string,{onlyInDb:string[],onlyOnDisk:string[],aligned:boolean}>}}
 */
export function diffCorpora(dbDomains, diskDomains) {
  const clients = {};
  const ensure = (c) => (clients[c] ??= { db: new Set(), disk: new Set() });

  for (const d of dbDomains) ensure(d.client_slug).db.add(domainKey(d.type, d.slug));
  for (const d of diskDomains) ensure(d.client_slug).disk.add(domainKey(d.type, d.slug));

  const report = {};
  let aligned = true;
  for (const [client, { db, disk }] of Object.entries(clients)) {
    const onlyInDb = [...db].filter((k) => !disk.has(k)).sort();
    const onlyOnDisk = [...disk].filter((k) => !db.has(k)).sort();
    const clientAligned = onlyInDb.length === 0 && onlyOnDisk.length === 0;
    if (!clientAligned) aligned = false;
    report[client] = { onlyInDb, onlyOnDisk, aligned: clientAligned };
  }
  return { aligned, clients: report };
}

/** One-line-per-client human report. */
export function formatAlignmentReport({ aligned, clients }) {
  const lines = [];
  for (const [client, r] of Object.entries(clients).sort()) {
    if (r.aligned) {
      lines.push(`  ✓ ${client}: aligned`);
    } else {
      lines.push(`  ✗ ${client}:`);
      for (const k of r.onlyInDb) lines.push(`      in DB, missing on disk:  ${k}`);
      for (const k of r.onlyOnDisk) lines.push(`      on disk, missing in DB:  ${k}`);
    }
  }
  lines.unshift(aligned ? 'Corpora alignment: ALIGNED' : 'Corpora alignment: DRIFT DETECTED');
  return lines.join('\n');
}
