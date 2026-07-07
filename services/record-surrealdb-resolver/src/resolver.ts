// Candidate matching + additive write for the record ↔ organizations bridge.
//
// Matching ports scripts/surreal-reconcile-corpus.mjs (slug + url-domain joins)
// and adds a fuzzy name pass. Writes port apps/person-enrichment/src/App.svelte
// (ensureOrgExists / appendOrgLink / appendOrgCorpus / findOrCreateContent /
// slugify) to the server. Cross-wire org identity is the **slug**, never the
// SDK RecordId (which doesn't survive JSON serialization over NATS) — apply
// re-looks-up the live RecordId by slug inside the service.
//
// Mapping (locked 2026-06-22, see context-v/specs/Record-DB-Resolver.md):
//   record.url        → org_links     (kind 'website')
//   record.socials[]  → org_links     (kind inferred)
//   record.streams[]  → media_streams (party 'first_party') — NEW tier
//   record.corpus[]   → org_corpus    (+ content_items ledger row)
//   CRM/pipeline cols → not written

import type { Surreal } from 'surrealdb';

export type RawLink = string | { url: string; kind?: string };

export type NormRecord = {
  name: string;
  slug_hint?: string | null;
  url?: string | null;
  domains?: string[];
  socials?: RawLink[];
  streams?: RawLink[];
  corpus?: RawLink[];
};

type ShapedLink = { url: string; kind: string; url_domain: string; added_at: string };
type ShapedStream = {
  url: string;
  kind: string;
  party: string;
  url_domain: string;
  added_at: string;
};

export type OrgRow = {
  id: unknown;
  slug: string;
  complete_name?: string | null;
  conventional_name?: string | null;
  org_links?: { url?: string }[] | null;
  org_corpus?: { url?: string }[] | null;
  media_streams?: { url?: string }[] | null;
  domains?: { domain?: string }[] | null;
  aliases?: string[] | null;
};

export type Candidate = {
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
  score: number;
  match_reason: string[];
  existing: { org_links: number; media_streams: number; org_corpus: number };
  append_preview: {
    org_links: ShapedLink[];
    media_streams: ShapedStream[];
    org_corpus: ShapedLink[];
  };
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function urlDomain(url: string): string {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Mirrors apps/person-enrichment/src/pulse-dimensions/LinkList.svelte inferKind.
function inferLinkKind(url: string): string {
  let path = '';
  let host = '';
  try {
    const u = new URL(url);
    path = u.pathname.toLowerCase();
    host = u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'other';
  }
  if (host === 'linkedin.com' && /^\/in\/[^/]+/.test(path)) return 'linkedin_profile';
  if (host === 'linkedin.com' && /^\/company\/[^/]+/.test(path)) return 'linkedin_company';
  if (host === 'x.com' || host === 'twitter.com') return 'x_profile';
  if (host === 'github.com' && /^\/[^/]+\/?$/.test(path)) return 'github_profile';
  if (/\.substack\.com$/.test(host) || host === 'substack.com') return 'substack';
  if (host === 'threads.net') return 'threads_profile';
  if (host === 'bsky.app') return 'bluesky_profile';
  if (/mastodon/.test(host)) return 'mastodon_profile';
  if (host === 'youtube.com' || host === 'youtu.be') return 'youtube';
  if (host === 'facebook.com' || host === 'fb.com') return 'facebook_profile';
  if (host === 'instagram.com') return 'instagram_profile';
  if (path === '/' || path === '') return 'website';
  return 'other';
}

// Streams are recurring publishers, not single posts. Light kind inference.
function inferStreamKind(url: string): string {
  let path = '';
  let host = '';
  try {
    const u = new URL(url);
    path = u.pathname.toLowerCase();
    host = u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'updates_index';
  }
  if (/rss|\.xml$|\/feed\/?$|atom/.test(path)) return 'rss';
  if (/press|news[-_]?room|\/news\/?$|media[-_]?center/.test(path)) return 'newsroom';
  if (/blog|stories|insights|ideas|posts/.test(path)) return 'blog_index';
  if (host === 'youtube.com') return 'youtube_channel';
  if (/substack\.com$/.test(host)) return 'substack';
  return 'updates_index';
}

function rawToUrl(l: RawLink): string {
  return (typeof l === 'string' ? l : l?.url ?? '').trim();
}

function shapeLink(l: RawLink): ShapedLink | null {
  const url = rawToUrl(l);
  if (!url) return null;
  const kind = typeof l === 'object' && l?.kind ? l.kind : inferLinkKind(url);
  return { url, kind, url_domain: urlDomain(url), added_at: new Date().toISOString() };
}

function shapeStream(l: RawLink): ShapedStream | null {
  const url = rawToUrl(l);
  if (!url) return null;
  const kind = typeof l === 'object' && l?.kind ? l.kind : inferStreamKind(url);
  return {
    url,
    kind,
    party: 'first_party',
    url_domain: urlDomain(url),
    added_at: new Date().toISOString(),
  };
}

function existingUrls(arr?: { url?: string }[] | null): Set<string> {
  return new Set((arr ?? []).map((e) => (e?.url ?? '').trim()).filter(Boolean));
}

// Build the deduped append set for one org row given a record. Pure — no writes.
function buildAppend(record: NormRecord, org: OrgRow) {
  const haveLinks = existingUrls(org.org_links);
  const haveStreams = existingUrls(org.media_streams);
  const haveCorpus = existingUrls(org.org_corpus);

  // org_links = website (record.url) + socials, deduped vs existing + within-batch
  const linkRaws: RawLink[] = [];
  if (record.url) linkRaws.push({ url: record.url, kind: 'website' });
  for (const s of record.socials ?? []) linkRaws.push(s);

  const seenLinks = new Set<string>();
  const org_links: ShapedLink[] = [];
  for (const r of linkRaws) {
    const shaped = shapeLink(r);
    if (!shaped) continue;
    if (haveLinks.has(shaped.url) || seenLinks.has(shaped.url)) continue;
    seenLinks.add(shaped.url);
    org_links.push(shaped);
  }

  const seenStreams = new Set<string>();
  const media_streams: ShapedStream[] = [];
  for (const r of record.streams ?? []) {
    const shaped = shapeStream(r);
    if (!shaped) continue;
    if (haveStreams.has(shaped.url) || seenStreams.has(shaped.url)) continue;
    seenStreams.add(shaped.url);
    media_streams.push(shaped);
  }

  const seenCorpus = new Set<string>();
  const org_corpus: ShapedLink[] = [];
  for (const r of record.corpus ?? []) {
    const shaped = shapeLink(r);
    if (!shaped) continue;
    if (haveCorpus.has(shaped.url) || seenCorpus.has(shaped.url)) continue;
    seenCorpus.add(shaped.url);
    org_corpus.push(shaped);
  }

  return { org_links, media_streams, org_corpus };
}

// ---------------------------------------------------------------------------
// SurrealDB reads
// ---------------------------------------------------------------------------

const ORG_FIELDS =
  'id, slug, complete_name, conventional_name, org_links, org_corpus, media_streams, domains, aliases';

async function loadClientOrgs(db: Surreal, client: string): Promise<OrgRow[]> {
  const r = await db.query(
    `SELECT ${ORG_FIELDS} FROM organizations WHERE client_access CONTAINS $client;`,
    { client },
  );
  return ((r?.[0] as OrgRow[]) ?? []).filter((o) => o && o.slug);
}

// ---------------------------------------------------------------------------
// Capability: resolver.candidates
// ---------------------------------------------------------------------------

export async function findCandidates(
  db: Surreal,
  record: NormRecord,
  client: string,
): Promise<{ candidates: Candidate[] }> {
  const orgs = await loadClientOrgs(db, client);
  const bySlug = new Map<string, OrgRow>();
  const byDomain = new Map<string, OrgRow>();
  for (const o of orgs) {
    bySlug.set(o.slug, o);
    for (const d of o.domains ?? []) {
      const dom = (d?.domain ?? '').toLowerCase().replace(/^www\./, '');
      if (dom) byDomain.set(dom, o);
    }
    for (const l of o.org_links ?? []) {
      const dom = urlDomain(l?.url ?? '');
      if (dom && !byDomain.has(dom)) byDomain.set(dom, o);
    }
  }

  // org -> { score, reasons }
  const scored = new Map<string, { org: OrgRow; score: number; reasons: Set<string> }>();
  const bump = (org: OrgRow | undefined, score: number, reason: string) => {
    if (!org) return;
    const key = org.slug;
    const cur = scored.get(key);
    if (cur) {
      cur.score = Math.max(cur.score, score);
      cur.reasons.add(reason);
    } else {
      scored.set(key, { org, score, reasons: new Set([reason]) });
    }
  };

  // 1. exact slug
  const slug = (record.slug_hint && record.slug_hint.trim()) || slugify(record.name);
  if (slug) bump(bySlug.get(slug), 100, 'slug');

  // 2. domain (record url + declared domains)
  const recDomains = new Set<string>();
  if (record.url) recDomains.add(urlDomain(record.url));
  for (const d of record.domains ?? []) recDomains.add(d.toLowerCase().replace(/^www\./, ''));
  for (const dom of recDomains) {
    if (dom) bump(byDomain.get(dom), 90, 'domain');
  }

  // 3. fuzzy name (in-memory CONTAINS over the loaded client orgs)
  const q = record.name.trim().toLowerCase();
  if (q.length >= 3) {
    for (const o of orgs) {
      const hay = `${o.complete_name ?? ''} ${o.conventional_name ?? ''} ${o.slug}`.toLowerCase();
      if (hay.includes(q) || q.includes((o.conventional_name ?? '').toLowerCase().trim() || ' ')) {
        bump(o, 60, 'name');
      }
    }
  }

  const candidates: Candidate[] = [...scored.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ org, score, reasons }) => {
      const append = buildAppend(record, org);
      return {
        org_id: String(org.id),
        slug: org.slug,
        complete_name: org.complete_name ?? null,
        conventional_name: org.conventional_name ?? null,
        score,
        match_reason: [...reasons],
        existing: {
          org_links: (org.org_links ?? []).length,
          media_streams: (org.media_streams ?? []).length,
          org_corpus: (org.org_corpus ?? []).length,
        },
        append_preview: append,
      };
    });

  return { candidates };
}

// ---------------------------------------------------------------------------
// Capability: resolver.search (manual autocomplete)
// ---------------------------------------------------------------------------

export async function searchOrgs(
  db: Surreal,
  q: string,
  client: string,
): Promise<{ candidates: Pick<Candidate, 'org_id' | 'slug' | 'complete_name' | 'conventional_name'>[] }> {
  const trimmed = q?.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return { candidates: [] };
  const r = await db.query(
    `SELECT id, complete_name, conventional_name, slug
       FROM organizations
       WHERE client_access CONTAINS $client
         AND (
           string::lowercase(complete_name)      CONTAINS $q
           OR string::lowercase(conventional_name) CONTAINS $q
           OR string::lowercase(slug)             CONTAINS $q
         )
       ORDER BY complete_name ASC
       LIMIT 8`,
    { client, q: trimmed },
  );
  const rows = ((r?.[0] as OrgRow[]) ?? []).map((o) => ({
    org_id: String(o.id),
    slug: o.slug,
    complete_name: o.complete_name ?? null,
    conventional_name: o.conventional_name ?? null,
  }));
  return { candidates: rows };
}

// ---------------------------------------------------------------------------
// content_items ledger — find-or-create by URL, returns the shared id.
// (Ports apps/person-enrichment/src/App.svelte findOrCreateContent.)
// ---------------------------------------------------------------------------

async function findOrCreateContent(
  db: Surreal,
  url: string,
  kind: string,
  url_domain: string,
): Promise<unknown> {
  const existing = await db.query('SELECT VALUE id FROM content_items WHERE url = $url LIMIT 1', {
    url,
  });
  const hit = (existing?.[0] as unknown[])?.[0];
  if (hit) {
    await db.query(
      `UPDATE $id SET last_referenced_at = time::now(), reference_count = (reference_count ?? 1) + 1`,
      { id: hit },
    );
    return hit;
  }
  const created = await db.query(
    `CREATE content_items SET
        id = rand::uuid::v7(), url = $url, url_domain = $url_domain, kind = $kind,
        first_seen_at = time::now(), last_referenced_at = time::now(), reference_count = 1
     RETURN id;`,
    { url, url_domain, kind },
  );
  return (created?.[0] as { id?: unknown }[])?.[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Capability: resolver.apply
// ---------------------------------------------------------------------------

export type ApplyInput = {
  action: 'match' | 'create';
  org_slug?: string;
  record: NormRecord;
  client: string;
  source?: string;
  // v0.0.0.3 — auto-mint an opportunity for the source record. record_uuid is the
  // 1:1 key; crm is the passthrough pipeline snapshot (Stage/$/Owner/…) that lives
  // on the opportunity, not the shared org.
  record_uuid?: string;
  record_set_id?: string;
  crm?: OpportunityCrm;
};

export type OpportunityCrm = Record<string, unknown>;

export type OpportunityOutcome = {
  id: string;
  created: boolean; // false = updated an existing opportunity for this record_uuid
  org_total: number; // how many opportunities this org now has (for this client)
};

export type ApplyResult = {
  ok: true;
  org_id: string;
  slug: string;
  created: boolean;
  complete_name: string | null;
  conventional_name: string | null;
  appended: { org_links: number; media_streams: number; org_corpus: number };
  opportunity: OpportunityOutcome | null;
};

export type OpportunitySummary = {
  id: string;
  name: string | null;
  status: string | null;
  record_uuid: string | null;
  record_set_id: string | null;
  source: string | null;
};

export type UpdateOrgInput = {
  org_slug: string; // current operative slug (resolved_org_slug)
  new_slug?: string;
  complete_name?: string;
  conventional_name?: string;
  client: string;
};

export type UpdateOrgResult = {
  ok: true;
  org_id: string;
  slug: string;
  complete_name: string | null;
  conventional_name: string | null;
  aliases: string[];
  renamed: boolean;
};

async function fetchOrgBySlug(db: Surreal, slug: string): Promise<OrgRow | null> {
  const r = await db.query(`SELECT ${ORG_FIELDS} FROM organizations WHERE slug = $slug LIMIT 1;`, {
    slug,
  });
  return ((r?.[0] as OrgRow[]) ?? [])[0] ?? null;
}

// ---------------------------------------------------------------------------
// Opportunities (v0.0.0.3) — a client-scoped, first-class entity: 1:1 with a
// source record (record_uuid), many:1 to the canonical org. Holds the CRM
// snapshot. Persists across imports; never auto-merged (duplicates across record
// sets are intentional — losing one is the only failure). See
// context-v/issues/Grilling-on-DB-Resolver--Future-Versions.md #4/#5.
// ---------------------------------------------------------------------------

let oppSchemaReady = false;
async function ensureOpportunitiesSchema(db: Surreal): Promise<void> {
  if (oppSchemaReady) return;
  await db.query(`
    DEFINE TABLE IF NOT EXISTS opportunities SCHEMALESS;
    DEFINE INDEX IF NOT EXISTS opp_record ON opportunities FIELDS client, record_uuid;
    DEFINE INDEX IF NOT EXISTS opp_org ON opportunities FIELDS org_slug;
  `);
  oppSchemaReady = true;
}

async function upsertOpportunity(
  db: Surreal,
  args: {
    client: string;
    org: unknown; // org RecordId (graph link)
    orgSlug: string;
    record_uuid: string;
    record_set_id: string | null;
    source: string;
    name: string;
    crm: OpportunityCrm;
  },
): Promise<{ id: string; created: boolean }> {
  // 1:1 with record_uuid per client. Same record re-resolved → update; a different
  // record (even same org) is a separate opportunity by construction.
  const existing = await db.query(
    'SELECT VALUE id FROM opportunities WHERE client = $client AND record_uuid = $record_uuid LIMIT 1',
    { client: args.client, record_uuid: args.record_uuid },
  );
  const hit = (existing?.[0] as unknown[])?.[0];
  if (hit) {
    await db.query(
      `UPDATE $id SET
          org = $org, org_slug = $org_slug, name = $name, source = $source,
          record_set_id = $record_set_id, crm = $crm,
          last_touched_by = $client, last_touched_at = time::now();`,
      {
        id: hit,
        org: args.org,
        org_slug: args.orgSlug,
        name: args.name,
        source: args.source,
        record_set_id: args.record_set_id,
        crm: args.crm,
        client: args.client,
      },
    );
    return { id: String(hit), created: false };
  }
  const created = await db.query(
    `CREATE opportunities SET
        id = rand::uuid::v7(), client = $client,
        org = $org, org_slug = $org_slug,
        record_uuid = $record_uuid, record_set_id = $record_set_id, source = $source,
        name = $name, crm = $crm, status = 'open',
        client_access = [$client],
        first_seen_at = time::now(), first_touched_by = $client,
        last_touched_by = $client, last_touched_at = time::now()
     RETURN id;`,
    {
      client: args.client,
      org: args.org,
      org_slug: args.orgSlug,
      record_uuid: args.record_uuid,
      record_set_id: args.record_set_id,
      source: args.source,
      name: args.name,
      crm: args.crm,
    },
  );
  return { id: String((created?.[0] as { id?: unknown }[])?.[0]?.id ?? ''), created: true };
}

async function countOpportunitiesForOrg(db: Surreal, client: string, orgSlug: string): Promise<number> {
  const r = await db.query(
    'SELECT count() FROM opportunities WHERE client = $client AND org_slug = $org_slug GROUP ALL;',
    { client, org_slug: orgSlug },
  );
  return ((r?.[0] as { count?: number }[])?.[0]?.count) ?? 0;
}

// Capability: resolver.update_opportunity — edit an opportunity's name (v0.0.0.4).
// Keyed by (client, record_uuid) so we never round-trip the SDK RecordId string.
// Lets the org go clean ("Accelerate the Future") while the opportunity keeps its
// qualifier ("Accelerate the Future (NCAD)").
export type UpdateOpportunityInput = { client: string; record_uuid: string; name?: string };
export type UpdateOpportunityResult = { ok: true; updated: number; name: string | null };

export async function updateOpportunity(
  db: Surreal,
  input: UpdateOpportunityInput,
): Promise<UpdateOpportunityResult> {
  await ensureOpportunitiesSchema(db);
  if (!input.record_uuid) throw new Error('update_opportunity requires record_uuid');
  const name = input.name?.trim();
  if (!name) return { ok: true, updated: 0, name: null };
  await db.query(
    `UPDATE opportunities SET name = $name, last_touched_by = $client, last_touched_at = time::now()
       WHERE client = $client AND record_uuid = $record_uuid;`,
    { name, client: input.client, record_uuid: input.record_uuid },
  );
  return { ok: true, updated: 1, name };
}

// Capability: resolver.opportunities_for_org — the reverse bond, org → its
// opportunities (closes the #2(c) deferral natively).
export async function opportunitiesForOrg(
  db: Surreal,
  org_slug: string,
  client: string,
): Promise<{ opportunities: OpportunitySummary[] }> {
  await ensureOpportunitiesSchema(db);
  const r = await db.query(
    // last_touched_at must be in the projection to ORDER BY it (SurrealDB 2.x).
    `SELECT id, name, status, record_uuid, record_set_id, source, last_touched_at
       FROM opportunities
       WHERE client = $client AND org_slug = $org_slug
       ORDER BY last_touched_at DESC;`,
    { client, org_slug },
  );
  const rows = ((r?.[0] as Record<string, unknown>[]) ?? []).map((o) => ({
    id: String(o.id),
    name: (o.name as string) ?? null,
    status: (o.status as string) ?? null,
    record_uuid: (o.record_uuid as string) ?? null,
    record_set_id: (o.record_set_id as string) ?? null,
    source: (o.source as string) ?? null,
  }));
  return { opportunities: rows };
}

// Match-or-create the canonical org row, no other side effects (no org_links
// append, no opportunity). Factored out of applyResolution so person-resolver.ts
// can reuse the exact same org identity logic instead of re-implementing it —
// per the 2026-07-07 decision that a person row's org half deserves the same
// match/create path an org-shaped record gets, not a parallel reimplementation.
export async function resolveOrgRow(
  db: Surreal,
  input: { action: 'match' | 'create'; org_slug?: string; name: string; client: string; source: string },
): Promise<{ org: OrgRow; created: boolean }> {
  if (input.action === 'match') {
    if (!input.org_slug) throw new Error('resolveOrgRow (match) requires org_slug');
    const org = await fetchOrgBySlug(db, input.org_slug);
    if (!org) throw new Error(`org not found for slug: ${input.org_slug}`);
    return { org, created: false };
  }
  // create — but defend against a race / pre-existing slug (treat as match).
  const slug = slugify(input.name);
  if (!slug) throw new Error('resolveOrgRow (create) requires a non-empty name');
  const existing = await fetchOrgBySlug(db, slug);
  if (existing) return { org: existing, created: false };
  const completeName = input.name.trim();
  const createdRes = await db.query(
    `CREATE organizations SET
        id = rand::uuid::v7(), slug = $slug,
        complete_name = $complete_name, conventional_name = $conventional_name,
        source = $source, client_access = [$client],
        first_touched_by = $client, last_touched_by = $client,
        last_touched_at = time::now(), first_seen_at = time::now(), last_seen_at = time::now()
     RETURN ${ORG_FIELDS};`,
    { slug, complete_name: completeName, conventional_name: completeName, source: input.source, client: input.client },
  );
  const org = ((createdRes?.[0] as OrgRow[]) ?? [])[0] ?? null;
  if (!org) throw new Error('org create returned no row');
  return { org, created: true };
}

export async function applyResolution(db: Surreal, input: ApplyInput): Promise<ApplyResult> {
  const { record, client } = input;
  const source = input.source || 'record-db-resolver';

  const slugHintOrName = (record.slug_hint && record.slug_hint.trim()) || record.name;
  const { org, created } = await resolveOrgRow(db, {
    action: input.action,
    org_slug: input.org_slug,
    name: slugHintOrName,
    client,
    source,
  });

  const append = buildAppend(record, org);

  // Ledger the corpus items and stamp content_id onto each entry.
  const corpusWithIds: (ShapedLink & { content_id?: unknown })[] = [];
  for (const entry of append.org_corpus) {
    const content_id = await findOrCreateContent(db, entry.url, entry.kind, entry.url_domain);
    corpusWithIds.push({ ...entry, content_id });
  }

  await db.query(
    `UPDATE $id SET
        org_links     = array::concat(org_links ?? [], $links),
        media_streams = array::concat(media_streams ?? [], $streams),
        org_corpus    = array::concat(org_corpus ?? [], $corpus),
        client_access = array::union(client_access ?? [], [$client]),
        source        = source ?? $source,
        last_touched_by = $client,
        last_touched_at = time::now(),
        last_seen_at    = time::now();`,
    {
      id: org.id,
      links: append.org_links,
      streams: append.media_streams,
      corpus: corpusWithIds,
      client,
      source,
    },
  );

  // Auto-mint the opportunity (v0.0.0.3) — every resolved record mints/updates its
  // opportunity so the count is never lost. Keyed 1:1 on record_uuid.
  let opportunity: OpportunityOutcome | null = null;
  if (input.record_uuid) {
    await ensureOpportunitiesSchema(db);
    const upserted = await upsertOpportunity(db, {
      client,
      org: org.id,
      orgSlug: org.slug,
      record_uuid: input.record_uuid,
      record_set_id: input.record_set_id ?? null,
      source,
      name: input.record.name,
      crm: input.crm ?? {},
    });
    const org_total = await countOpportunitiesForOrg(db, client, org.slug);
    opportunity = { id: upserted.id, created: upserted.created, org_total };
  }

  return {
    ok: true,
    org_id: String(org.id),
    slug: org.slug,
    created,
    complete_name: org.complete_name ?? null,
    conventional_name: org.conventional_name ?? null,
    appended: {
      org_links: append.org_links.length,
      media_streams: append.media_streams.length,
      org_corpus: append.org_corpus.length,
    },
    opportunity,
  };
}

// ---------------------------------------------------------------------------
// Capability: resolver.update_org — edit the canonical entity's name/slug.
//
// Per the v0.0.0.2 decision (see context-v/issues/Grilling-on-DB-Resolver--
// Future-Versions.md #2): the immutable RecordId stays the bond; `slug` is
// editable display. A rename pushes the old slug into `aliases[]` so artifacts
// stamped before the rename (corpus dirs, content_items.about[].org_slug) still
// resolve, and refuses a slug already taken by another org. The UI re-stamps the
// bonded row's resolved_org_slug/name after this returns.
// ---------------------------------------------------------------------------

export async function updateOrg(db: Surreal, input: UpdateOrgInput): Promise<UpdateOrgResult> {
  const org = await fetchOrgBySlug(db, input.org_slug);
  if (!org) throw new Error(`org not found for slug: ${input.org_slug}`);

  const wantSlug = input.new_slug?.trim();
  const renamed = !!wantSlug && wantSlug !== org.slug;
  if (renamed) {
    const clash = await fetchOrgBySlug(db, wantSlug as string);
    if (clash) throw new Error(`slug already in use: ${wantSlug}`);
  }

  const name = input.complete_name?.trim();
  const conv = input.conventional_name?.trim();

  const sets: string[] = [];
  const vars: Record<string, unknown> = { id: org.id, client: input.client };
  if (name) {
    sets.push('complete_name = $complete_name');
    vars.complete_name = name;
  }
  if (conv) {
    sets.push('conventional_name = $conventional_name');
    vars.conventional_name = conv;
  }
  if (renamed) {
    sets.push('slug = $new_slug');
    sets.push('aliases = array::union(aliases ?? [], [$old_slug])');
    vars.new_slug = wantSlug;
    vars.old_slug = org.slug;
  }
  sets.push('client_access = array::union(client_access ?? [], [$client])');
  sets.push('last_touched_by = $client');
  sets.push('last_touched_at = time::now()');

  await db.query(`UPDATE $id SET ${sets.join(', ')};`, vars);

  // Fan-out re-stamp: a slug rename leaves bonded opportunities pointing at the old
  // org_slug, which orphans the reverse lookup. Re-stamp them so org → opportunities
  // stays correct. (The org keeps the old slug in aliases[] for content_items/corpus.)
  if (renamed) {
    await ensureOpportunitiesSchema(db);
    await db.query(
      `UPDATE opportunities SET org_slug = $new_slug, last_touched_at = time::now()
         WHERE org_slug = $old_slug;`,
      { new_slug: wantSlug, old_slug: org.slug },
    );
  }

  const fresh = (await fetchOrgBySlug(db, renamed ? (wantSlug as string) : org.slug)) ?? org;
  return {
    ok: true,
    org_id: String(fresh.id),
    slug: fresh.slug,
    complete_name: fresh.complete_name ?? null,
    conventional_name: fresh.conventional_name ?? null,
    aliases: fresh.aliases ?? [],
    renamed,
  };
}
