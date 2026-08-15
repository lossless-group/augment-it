// Domain catalog — the canonical graph layer behind the corpora-curator surface
// (apps/corpora-curator is the type='strategy' view of it). A "domain" is a TYPED
// grouping: type ∈ strategy | topic | thesis | market-segment | category | …
// Faceted classification, not DDD — one catalog table, discriminated by `type`.
// `strategy.*` is operationalized as `domain.*` with type='strategy'.
//
// Tables (all SCHEMALESS; strict-mode SurrealDB requires DEFINE first):
//   domains        — workspace-scoped typed grouping.
//                    { domain_uuid, type, slug, title, client_slugs[], tags[], created_at }
//                    unique on (type, slug) — "apprenticeship" can be a strategy AND a topic.
//   sources        — canonical, client-AGNOSTIC identity, by normalized_url; mints source_uuid.
//   source_usages  — (client_slug, domain_type, domain_slug, source_uuid) edge + tags.
//   tag_vocab      — per-workspace Train-Case tag vocabulary.
//
// Filesystem-authoritative: domain.create writes <type-plural>/<slug>/index.md via
// content-ingest; these tables are the rebuildable index.

import { type NatsConnection } from '@nats-io/transport-node';
import type { Surreal } from 'surrealdb';
import { getDb } from './surreal';
import { serveSubject } from './nats-loop';

// --- helpers ---------------------------------------------------------------

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`; // query + hash dropped
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, '');
  }
}

// Tags: enforce dashes-not-spaces but PRESERVE the casing the user typed, so
// "Impact of AI" → "Impact-of-AI" (not "Impact-Of-Ai"). Acronyms and small words
// survive intact — the user owns the casing.
export function toDashed(s: string): string {
  return s
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .join('-');
}

function first<T>(res: unknown, idx = 0): T | null {
  const rows = (res as unknown[])?.[idx] as T[] | undefined;
  return (rows ?? [])[0] ?? null;
}

// --- actor attribution (build-order step 4) --------------------------------
// The verified didi.sh identity, forwarded from workspace-service's dispatch
// envelope. Absent when the deploy runs DIDI_AUTH=off/optional with no
// session identity — attribution is best-effort, never a write blocker.
export type Actor = { didi_id: string; via?: string };

// Builds a `created_by = $created_by[, created_via = $created_via]`-shaped
// SET fragment (or the `updated_*` sibling) plus its query vars. Returns
// empty when there's no actor, so callers never clobber a stamped value
// with NULL on an unattributed request (e.g. a Jina-driven background fetch).
function actorSetClause(actor: Actor | undefined, prefix: 'created' | 'updated'): { clause: string[]; vars: Record<string, unknown> } {
  if (!actor?.didi_id) return { clause: [], vars: {} };
  const idKey = `${prefix}_by`;
  const clause = [`${idKey} = $${idKey}`];
  const vars: Record<string, unknown> = { [idKey]: actor.didi_id };
  if (actor.via) {
    const viaKey = `${prefix}_via`;
    clause.push(`${viaKey} = $${viaKey}`);
    vars[viaKey] = actor.via;
  }
  return { clause, vars };
}

let domainSchemaReady = false;
async function ensureDomainSchema(db: Surreal): Promise<void> {
  if (domainSchemaReady) return;
  await db.query(`
    DEFINE TABLE IF NOT EXISTS domains SCHEMALESS;
    DEFINE INDEX IF NOT EXISTS domain_type_slug ON domains FIELDS type, slug UNIQUE;
    DEFINE TABLE IF NOT EXISTS sources SCHEMALESS;
    DEFINE INDEX IF NOT EXISTS source_norm_url ON sources FIELDS normalized_url UNIQUE;
    DEFINE TABLE IF NOT EXISTS source_usages SCHEMALESS;
    DEFINE INDEX IF NOT EXISTS usage_lookup ON source_usages FIELDS client_slug, domain_type, domain_slug;
    DEFINE TABLE IF NOT EXISTS tag_vocab SCHEMALESS;
    DEFINE INDEX IF NOT EXISTS tag_vocab_uq ON tag_vocab FIELDS client_slug, tag UNIQUE;
  `);
  // One-time normalization: source_uuid must be a STRING to survive JSON/NATS
  // round-trips and match in WHERE clauses (SurrealDB `uuid` types don't — the
  // same lesson as the resolver's slug-not-RecordId rule). Idempotent:
  // type::string of an already-string value is unchanged.
  await db.query(`
    UPDATE sources SET source_uuid = type::string(source_uuid);
    UPDATE source_usages SET source_uuid = type::string(source_uuid);
  `);
  domainSchemaReady = true;
}

// Update the canonical registry's bibliographic fields from a content-ingest
// response — only the fields Jina actually returned (never blank out a value).
async function applyBibToRegistry(
  db: Surreal,
  source_uuid: string,
  f: { title?: string; authors?: string[]; publisher?: string; published_date?: string },
): Promise<void> {
  const set: string[] = [];
  const vars: Record<string, unknown> = { u: source_uuid };
  for (const k of ['title', 'publisher', 'published_date'] as const) {
    const v = f[k];
    if (typeof v === 'string' && v.trim()) {
      set.push(`${k} = $${k}`);
      vars[k] = v;
    }
  }
  if (Array.isArray(f.authors) && f.authors.length) {
    set.push('authors = $authors');
    vars.authors = f.authors;
  }
  if (set.length) await db.query(`UPDATE sources SET ${set.join(', ')} WHERE source_uuid = $u;`, vars);
}

export async function ensureTagInVocab(db: Surreal, client_slug: string, tag: string): Promise<void> {
  if (!tag) return;
  const seen = first<{ tag: string }>(
    await db.query('SELECT tag FROM tag_vocab WHERE client_slug = $c AND tag = $tag LIMIT 1', { c: client_slug, tag }),
  );
  if (!seen) {
    await db.query('CREATE tag_vocab SET id = rand::uuid::v7(), client_slug = $c, tag = $tag, created_at = time::now();', {
      c: client_slug,
      tag,
    });
  }
}

// --- types -----------------------------------------------------------------

export type SourceRow = {
  source_uuid: string;
  normalized_url: string;
  url: string;
  title: string;
  authors: string[];
  publisher: string;
  published_date: string;
  content_type: string;
};

export type DomainRow = {
  type: string;
  slug: string;
  title: string;
  client_slugs: string[];
  tags: string[];
};

export type UsageRow = {
  source_uuid: string;
  client_slug: string;
  domain_type: string;
  domain_slug: string;
  status: string;
  tags: string[];
  source_slug?: string;
  corpus_path?: string;
  binary_filename?: string;
  binary_bytes?: number;
};

// --- domains ---------------------------------------------------------------

export async function createDomain(
  db: Surreal,
  args: { type: string; slug: string; title: string; client_slug: string; tags?: string[]; actor?: Actor },
): Promise<{ domain: DomainRow }> {
  const { type, slug, title, client_slug, actor } = args;
  const tags = (args.tags ?? []).map(toDashed);
  for (const t of tags) await ensureTagInVocab(db, client_slug, t);
  const existing = first<DomainRow>(
    await db.query('SELECT type, slug, title, client_slugs, tags FROM domains WHERE type = $type AND slug = $slug LIMIT 1', {
      type,
      slug,
    }),
  );
  if (existing) {
    const upd = actorSetClause(actor, 'updated');
    await db.query(
      `UPDATE domains SET
          client_slugs = array::union(client_slugs ?? [], [$client]),
          tags = array::union(tags ?? [], $tags),
          last_touched_at = time::now()${upd.clause.length ? ',\n          ' + upd.clause.join(',\n          ') : ''}
         WHERE type = $type AND slug = $slug;`,
      { type, slug, client: client_slug, tags, ...upd.vars },
    );
    return {
      domain: {
        ...existing,
        client_slugs: Array.from(new Set([...(existing.client_slugs ?? []), client_slug])),
        tags: Array.from(new Set([...(existing.tags ?? []), ...tags])),
      },
    };
  }
  // On creation, updated_by/updated_via mirror created_by/created_via —
  // there's been exactly one touch so far, by the same actor.
  const created = actorSetClause(actor, 'created');
  const stamp = created.clause.length
    ? [...created.clause, 'updated_by = $created_by', ...(actor?.via ? ['updated_via = $created_via'] : [])]
    : [];
  const createdRow = first<DomainRow>(
    await db.query(
      `CREATE domains SET
          id = rand::uuid::v7(), type = $type, slug = $slug, title = $title,
          client_slugs = [$client], tags = $tags, created_at = time::now()${stamp.length ? ',\n          ' + stamp.join(',\n          ') : ''}
       RETURN type, slug, title, client_slugs, tags;`,
      { type, slug, title, client: client_slug, tags, ...created.vars },
    ),
  );
  return { domain: createdRow ?? { type, slug, title, client_slugs: [client_slug], tags } };
}

// Move a domain from one type to another (e.g. strategy → thesis). A domain
// is keyed by (type, slug) globally — client_slugs is one array field on
// that single row — so a retype moves it for every client that references
// it, all at once; there's no such thing as a per-client partial retype.
// DB-only: the caller (the domain.retype handler below) cross-calls
// content-ingest to move the filesystem folder(s) + patch frontmatter for
// each client_slug on the row.
export async function retypeDomain(
  db: Surreal,
  args: { type: string; slug: string; new_type: string; actor?: Actor },
): Promise<{ domain: DomainRow }> {
  const { type, slug, new_type, actor } = args;
  if (type === new_type) throw new Error('new_type is the same as the current type');
  const existing = first<DomainRow>(
    await db.query('SELECT type, slug, title, client_slugs, tags FROM domains WHERE type = $type AND slug = $slug LIMIT 1', { type, slug }),
  );
  const already = first<DomainRow>(
    await db.query('SELECT type, slug, title, client_slugs, tags FROM domains WHERE type = $nt AND slug = $slug LIMIT 1', { nt: new_type, slug }),
  );
  if (!existing) {
    // Re-run after a partial failure (DB moved, file move didn't): if the
    // domain is already sitting at new_type, treat the DB half as done and
    // let the caller retry the file move.
    if (already) return { domain: already };
    throw new Error(`domain not found at either ${type}:${slug} or ${new_type}:${slug}`);
  }
  if (already) throw new Error(`a domain already exists at ${new_type}:${slug} — retype would collide`);
  const upd = actorSetClause(actor, 'updated');
  await db.query(
    `UPDATE domains SET type = $nt${upd.clause.length ? ', ' + upd.clause.join(', ') : ''} WHERE type = $type AND slug = $slug;`,
    { nt: new_type, type, slug, ...upd.vars },
  );
  await db.query(
    `UPDATE source_usages SET domain_type = $nt${upd.clause.length ? ', ' + upd.clause.join(', ') : ''} WHERE domain_type = $type AND domain_slug = $slug;`,
    { nt: new_type, type, slug, ...upd.vars },
  );
  return { domain: { ...existing, type: new_type } };
}

export async function listDomains(db: Surreal, args: { type?: string; client_slug?: string }): Promise<{ domains: DomainRow[] }> {
  const conds: string[] = [];
  const vars: Record<string, unknown> = {};
  if (args.type) {
    conds.push('type = $type');
    vars.type = args.type;
  }
  if (args.client_slug) {
    conds.push('$client IN client_slugs');
    vars.client = args.client_slug;
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  // created_at must be in the projection to ORDER BY it (SurrealDB 2.x idiom rule).
  const res = await db.query(`SELECT type, slug, title, client_slugs, tags, created_at FROM domains ${where} ORDER BY created_at DESC`, vars);
  return { domains: ((res as unknown[])?.[0] as DomainRow[]) ?? [] };
}

// --- sources registry (canonical, by normalized_url) -----------------------

async function upsertSource(db: Surreal, args: { url: string; actor?: Actor }): Promise<SourceRow> {
  const normalized_url = normalizeUrl(args.url);
  const existing = first<SourceRow>(
    await db.query(
      'SELECT source_uuid, normalized_url, url, title, authors, publisher, published_date, content_type FROM sources WHERE normalized_url = $n LIMIT 1',
      { n: normalized_url },
    ),
  );
  if (existing) return existing;
  const stamped = actorSetClause(args.actor, 'created');
  const stamp = stamped.clause.length ? [...stamped.clause, 'updated_by = $created_by'] : [];
  const created = first<SourceRow>(
    await db.query(
      `CREATE sources SET
          id = rand::uuid::v7(), source_uuid = type::string(rand::uuid::v7()),
          normalized_url = $n, url = $url,
          title = '', authors = [], publisher = '', published_date = '', content_type = '',
          first_seen_at = time::now()${stamp.length ? ',\n          ' + stamp.join(',\n          ') : ''}
       RETURN source_uuid, normalized_url, url, title, authors, publisher, published_date, content_type;`,
      { n: normalized_url, url: args.url, ...stamped.vars },
    ),
  );
  if (!created) throw new Error('sources registry upsert returned no row');
  return created;
}

export async function addSource(
  db: Surreal,
  args: { url: string; domain_type: string; domain_slug: string; client_slug: string; actor?: Actor },
): Promise<{ source: SourceRow & { status: string; domain_refs: string[]; created_by?: string | null } }> {
  const source = await upsertSource(db, { url: args.url, actor: args.actor });
  const dupe = first<UsageRow>(
    await db.query(
      'SELECT source_uuid FROM source_usages WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s LIMIT 1',
      { u: source.source_uuid, c: args.client_slug, t: args.domain_type, s: args.domain_slug },
    ),
  );
  if (!dupe) {
    const stamped = actorSetClause(args.actor, 'created');
    const stamp = stamped.clause.length ? [...stamped.clause, 'updated_by = $created_by'] : [];
    await db.query(
      `CREATE source_usages SET
          id = rand::uuid::v7(), source_uuid = $u, client_slug = $c,
          domain_type = $t, domain_slug = $s,
          corpus_path = NONE, status = 'metadata-only', tags = [], created_at = time::now()${stamp.length ? ',\n          ' + stamp.join(',\n          ') : ''};`,
      { u: source.source_uuid, c: args.client_slug, t: args.domain_type, s: args.domain_slug, ...stamped.vars },
    );
  }
  return {
    source: {
      ...source,
      status: 'metadata-only',
      domain_refs: [`${args.domain_type}:${args.domain_slug}`],
      created_by: args.actor?.didi_id ?? null,
    },
  };
}

export async function assembleDomain(
  db: Surreal,
  args: { type: string; slug: string; client_slug: string },
): Promise<{ sources: (SourceRow & { status: string; tags: string[]; source_slug?: string; corpus_path?: string; binary_filename?: string; binary_bytes?: number })[] }> {
  const usages = ((await db.query(
    'SELECT source_uuid, status, tags, source_slug, corpus_path, binary_filename, binary_bytes, created_at FROM source_usages WHERE domain_type = $t AND domain_slug = $s AND client_slug = $c ORDER BY created_at ASC',
    { t: args.type, s: args.slug, c: args.client_slug },
  )) as unknown[])?.[0] as UsageRow[] | undefined;
  const sources: (SourceRow & { status: string; tags: string[]; source_slug?: string; corpus_path?: string; binary_filename?: string; binary_bytes?: number })[] = [];
  for (const u of usages ?? []) {
    const s = first<SourceRow>(
      await db.query(
        'SELECT source_uuid, normalized_url, url, title, authors, publisher, published_date, content_type FROM sources WHERE source_uuid = $u LIMIT 1',
        { u: u.source_uuid },
      ),
    );
    if (s) sources.push({ ...s, status: u.status ?? 'metadata-only', tags: u.tags ?? [], source_slug: u.source_slug, corpus_path: u.corpus_path, binary_filename: u.binary_filename, binary_bytes: u.binary_bytes });
  }
  return { sources };
}

// --- tags (workspace vocabulary, Train-Case) -------------------------------

export async function suggestTags(db: Surreal, args: { client_slug: string; prefix?: string }): Promise<{ tags: string[] }> {
  const res = await db.query('SELECT tag FROM tag_vocab WHERE client_slug = $c ORDER BY tag ASC', { c: args.client_slug });
  let tags = (((res as unknown[])?.[0] as { tag: string }[]) ?? []).map((r) => r.tag).filter(Boolean);
  const p = (args.prefix ?? '').trim().toLowerCase();
  if (p) tags = tags.filter((t) => t.toLowerCase().includes(p));
  return { tags: tags.slice(0, 25) };
}

export async function applyTag(
  db: Surreal,
  args: { source_uuid: string; domain_type: string; domain_slug: string; client_slug: string; tag: string; op?: 'add' | 'remove'; actor?: Actor },
): Promise<{ ok: true; tag: string }> {
  const tag = toDashed(args.tag);
  const op = args.op ?? 'add';
  const fn = op === 'remove' ? 'array::complement' : 'array::union';
  const upd = actorSetClause(args.actor, 'updated');
  await db.query(
    `UPDATE source_usages SET tags = ${fn}(tags ?? [], [$tag])${upd.clause.length ? ', ' + upd.clause.join(', ') : ''}
       WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
    { tag, u: args.source_uuid, c: args.client_slug, t: args.domain_type, s: args.domain_slug, ...upd.vars },
  );
  if (op === 'add') await ensureTagInVocab(db, args.client_slug, tag);
  return { ok: true, tag };
}

// --- NATS handler registration --------------------------------------------

export function registerDomainHandlers(nc: NatsConnection): void {
  // serveSubject owns the parse, the per-message deadline, the always-answer
  // guarantee, and the loop's own death. See ./nats-loop.ts — the bare
  // `for await` this replaces is what silently took domain.list out of service
  // for a whole process lifetime.
  const handle = <T>(subject: string, fn: (db: Surreal, args: T) => Promise<unknown>): void => {
    void serveSubject<T>(subject, nc.subscribe(subject), async (args) => {
      const db = await getDb();
      await ensureDomainSchema(db);
      return fn(db, args);
    }).catch((err: unknown) => {
      console.error(JSON.stringify({ level: 'error', subject, msg: 'consumer exited', error: String(err) }));
    });
  };

  // Curator liveness — fire-and-forget broadcast after a mutation commits, so
  // every connected browser session (frame-router.ts's BROADCAST_SUBJECTS) can refetch
  // the affected domain/source list without a manual refresh. See the
  // Build-Order plan's Step 6 and [[Workspaces-as-Tenant-Primitive]] §
  // "Tenant-aware envelope" for the actor field's provenance.
  const broadcast = (subject: string, payload: Record<string, unknown>): void => {
    try {
      nc.publish(subject, JSON.stringify(payload));
    } catch (err) {
      console.warn(`[domains] could not publish ${subject}`, err);
    }
  };

  // domain.create — DB upsert + write the filesystem index.md (content-ingest,
  // filesystem-authoritative). Cross-service request over NATS.
  void serveSubject<{ type: string; slug: string; title: string; client_slug: string; tags?: string[]; actor?: Actor }>(
    'domain.create.requested',
    nc.subscribe('domain.create.requested'),
    async (args) => {
      const db = await getDb();
      await ensureDomainSchema(db);
      const { domain } = await createDomain(db, args);
      const created_at = new Date().toISOString().slice(0, 10);
      const reply = await nc.request(
        'corpus.domain.write_index.requested',
        JSON.stringify({
          client_slug: args.client_slug,
          type: domain.type,
          slug: domain.slug,
          title: domain.title,
          client_slugs: domain.client_slugs,
          tags: domain.tags,
          created_at,
          created_by: args.actor?.didi_id ?? null,
        }),
        { timeout: 15_000 },
      );
      const fileRes = reply.json() as { ok: boolean; corpus_path?: string; error?: string };
      if (!fileRes.ok) throw new Error(`index.md write failed: ${fileRes.error ?? 'unknown'}`);
      broadcast('domain.created', { type: domain.type, slug: domain.slug, client_slug: args.client_slug, actor: args.actor ?? null });
      return { domain, corpus_path: fileRes.corpus_path };
    },
    // Wider than the default: this one makes a cross-service NATS request with
    // its own 15s timeout, then a filesystem write on the other side.
    { timeoutMs: 28_000 },
  ).catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', subject: 'domain.create.requested', msg: 'consumer exited', error: String(err) }));
  });

  handle('domain.list.requested', listDomains);
  handle('domain.assemble.requested', assembleDomain);

  // domain.retype — move a domain (and everything under it) from one type
  // to another. DB first (so a filesystem hiccup doesn't leave the DB
  // pointing at a type whose folder doesn't exist); then cross-call
  // content-ingest once per client_slug on the row to move that client's
  // folder + patch frontmatter. Partial-failure note: if a later client's
  // file move fails, the DB is already retyped and earlier clients' files
  // already moved — surfaced via `file_errors` in the reply rather than
  // silently swallowed; re-running is safe (content-ingest's move is a
  // no-op if the destination already exists and the source is gone).
  void (async () => {
    const sub = nc.subscribe('domain.retype.requested');
    for await (const msg of sub) {
      try {
        const args = msg.json() as { type: string; slug: string; new_type: string; actor?: Actor };
        const db = await getDb();
        await ensureDomainSchema(db);
        const { domain } = await retypeDomain(db, args);
        const file_errors: { client_slug: string; error: string }[] = [];
        for (const client_slug of domain.client_slugs ?? []) {
          try {
            const reply = await nc.request(
              'corpus.domain.retype.requested',
              JSON.stringify({ client_slug, old_type: args.type, new_type: args.new_type, slug: args.slug }),
              { timeout: 30_000 },
            );
            const r = reply.json() as { ok: boolean; error?: string };
            if (!r.ok) file_errors.push({ client_slug, error: r.error ?? 'unknown' });
          } catch (err: unknown) {
            file_errors.push({ client_slug, error: err instanceof Error ? err.message : String(err) });
          }
        }
        broadcast('domain.retyped', { type: args.new_type, old_type: args.type, slug: args.slug, client_slugs: domain.client_slugs, actor: args.actor ?? null });
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, domain, file_errors }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })().catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', file: 'domains.ts', msg: 'consumer exited', error: String(err) }));
  });

  // source.add — DB registry + usage, then cross-call content-ingest to Jina-fetch
  // metadata and write the per-source file. Update the registry title + usage path.
  void (async () => {
    const sub = nc.subscribe('source.add.requested');
    for await (const msg of sub) {
      try {
        const args = msg.json() as { url: string; domain_type: string; domain_slug: string; client_slug: string; actor?: Actor };
        const db = await getDb();
        await ensureDomainSchema(db);
        const { source } = await addSource(db, args);
        const reply = await nc.request(
          'corpus.source.add.requested',
          JSON.stringify({
            client_slug: args.client_slug,
            domain_type: args.domain_type,
            domain_slug: args.domain_slug,
            source_uuid: source.source_uuid,
            url: source.url,
            normalized_url: source.normalized_url,
            created_by: args.actor?.didi_id ?? null,
          }),
          { timeout: 60_000 }, // Jina can be slow
        );
        const f = reply.json() as { ok: boolean; corpus_path?: string; source_slug?: string; title?: string; authors?: string[]; publisher?: string; published_date?: string; error?: string };
        if (!f.ok) throw new Error(`source file write failed: ${f.error ?? 'unknown'}`);
        await applyBibToRegistry(db, source.source_uuid, f);
        await db.query(
          `UPDATE source_usages SET corpus_path = $p, source_slug = $sl
             WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
          { p: f.corpus_path ?? null, sl: f.source_slug ?? null, u: source.source_uuid, c: args.client_slug, t: args.domain_type, s: args.domain_slug },
        );
        broadcast('source.added', { domain_type: args.domain_type, domain_slug: args.domain_slug, client_slug: args.client_slug, source_uuid: source.source_uuid, actor: args.actor ?? null });
        if (msg.reply) {
          msg.respond(JSON.stringify({ ok: true, source: { ...source, title: f.title ?? source.title, authors: f.authors, publisher: f.publisher, published_date: f.published_date, status: 'metadata-only', source_slug: f.source_slug, corpus_path: f.corpus_path } }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })().catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', file: 'domains.ts', msg: 'consumer exited', error: String(err) }));
  });

  type SourceRef = { source_uuid: string; domain_type: string; domain_slug: string; client_slug: string; actor?: Actor };
  const usageOf = async (db: Surreal, a: SourceRef) =>
    first<{ source_slug?: string }>(
      await db.query(
        'SELECT source_slug FROM source_usages WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s LIMIT 1',
        { u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug },
      ),
    );

  // source.fetch / source.retry — pull full content via content-ingest; update
  // registry title + usage status. retry forces a Jina cache bypass. Self-rescues
  // sources that have no file/slug yet.
  async function runSourceFetch(a: SourceRef, noCache: boolean): Promise<{ ok: boolean; source?: unknown; error?: string }> {
    try {
      const db = await getDb();
      await ensureDomainSchema(db);
      const src = first<{ url: string }>(await db.query('SELECT url FROM sources WHERE source_uuid = $u LIMIT 1', { u: a.source_uuid }));
      if (!src) throw new Error('source not found in registry');
      const usage = await usageOf(db, a);
      const reply = await nc.request(
        'corpus.source.fetch.requested',
        JSON.stringify({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_uuid: a.source_uuid, url: src.url, source_slug: usage?.source_slug ?? undefined, no_cache: noCache }),
        { timeout: 90_000 },
      );
      const f = reply.json() as { ok: boolean; corpus_path?: string; source_slug?: string; title?: string; authors?: string[]; publisher?: string; published_date?: string; binary_filename?: string | null; content_pulled?: boolean; error?: string };
      if (!f.ok) throw new Error(`fetch failed: ${f.error ?? 'unknown'}`);
      await applyBibToRegistry(db, a.source_uuid, f);
      // A PDF URL downloads a sibling; coalesce so a non-PDF fetch doesn't wipe an
      // already-attached file.
      const fetchUpd = actorSetClause(a.actor, 'updated');
      await db.query(
        `UPDATE source_usages SET status = 'fetched', source_slug = $sl, corpus_path = $p, binary_filename = $bf ?? binary_filename${fetchUpd.clause.length ? ', ' + fetchUpd.clause.join(', ') : ''}
           WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
        { sl: f.source_slug ?? usage?.source_slug ?? null, p: f.corpus_path ?? null, bf: f.binary_filename ?? null, u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug, ...fetchUpd.vars },
      );
      const out: Record<string, unknown> = { source_uuid: a.source_uuid, url: src.url, title: f.title, authors: f.authors, publisher: f.publisher, published_date: f.published_date, status: 'fetched', content_pulled: f.content_pulled ?? true, source_slug: f.source_slug ?? usage?.source_slug, corpus_path: f.corpus_path };
      if (f.binary_filename) out.binary_filename = f.binary_filename; // only when present → UI merge keeps an existing attachment
      return { ok: true, source: out };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  // runSourceFetch already returns {ok:false} rather than throwing, but the
  // parse and the respond sat outside any guard — one malformed payload took
  // both fetch subjects down permanently. serveSubject owns that now.
  // runSourceFetch's own {ok} shape is preserved by returning it directly:
  // serveSubject spreads the result, and an explicit ok:false in the payload
  // overrides the wrapper's ok:true.
  const fetchHandler = (subject: string, noCache: boolean): void => {
    void serveSubject<SourceRef>(
      subject,
      nc.subscribe(subject),
      (ref) => runSourceFetch(ref, noCache),
      // Jina fetches a remote URL through content-ingest; give it room.
      { timeoutMs: 28_000 },
    ).catch((err: unknown) => {
      console.error(JSON.stringify({ level: 'error', subject, msg: 'consumer exited', error: String(err) }));
    });
  };
  fetchHandler('source.fetch.requested', false);
  fetchHandler('source.retry.requested', true);

  // source.remove — drop the (client, domain, source) usage + delete its file. The
  // canonical sources registry row is kept (shared identity).
  void (async () => {
    const sub = nc.subscribe('source.remove.requested');
    for await (const msg of sub) {
      try {
        const a = msg.json() as SourceRef;
        const db = await getDb();
        await ensureDomainSchema(db);
        const usage = await usageOf(db, a);
        await db.query(
          'DELETE source_usages WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;',
          { u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug },
        );
        if (usage?.source_slug) {
          await nc.request('corpus.source.remove.requested', JSON.stringify({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_slug: usage.source_slug }), { timeout: 15_000 });
        }
        broadcast('source.removed', { domain_type: a.domain_type, domain_slug: a.domain_slug, client_slug: a.client_slug, source_uuid: a.source_uuid, actor: a.actor ?? null });
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, source_uuid: a.source_uuid }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })().catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', file: 'domains.ts', msg: 'consumer exited', error: String(err) }));
  });

  // source.update — patch the registry's bibliographic fields + the file frontmatter.
  void (async () => {
    const sub = nc.subscribe('source.update.requested');
    for await (const msg of sub) {
      try {
        const a = msg.json() as SourceRef & { fields: Record<string, string>; authors?: string[] };
        const db = await getDb();
        await ensureDomainSchema(db);
        const fields = a.fields ?? {};
        const setParts: string[] = [];
        const vars: Record<string, unknown> = { u: a.source_uuid };
        for (const k of ['title', 'publisher', 'published_date']) {
          if (k in fields) {
            setParts.push(`${k} = $${k}`);
            vars[k] = fields[k];
          }
        }
        if (Array.isArray(a.authors)) {
          setParts.push('authors = $authors');
          vars.authors = a.authors;
        }
        if (setParts.length) {
          const srcUpd = actorSetClause(a.actor, 'updated');
          await db.query(`UPDATE sources SET ${[...setParts, ...srcUpd.clause].join(', ')} WHERE source_uuid = $u;`, { ...vars, ...srcUpd.vars });
        }
        const usage = await usageOf(db, a);
        let source_slug = usage?.source_slug;
        if (usage?.source_slug) {
          const reply = await nc.request('corpus.source.update.requested', JSON.stringify({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_slug: usage.source_slug, fields, authors: a.authors }), { timeout: 15_000 });
          const r = reply.json() as { ok?: boolean; source_slug?: string; corpus_path?: string };
          const usageUpd = actorSetClause(a.actor, 'updated');
          // a title edit re-slugs (and renames) the file — keep the usage row pointed at it
          if (r?.source_slug && r.source_slug !== usage.source_slug) {
            source_slug = r.source_slug;
            await db.query(
              `UPDATE source_usages SET source_slug = $sl, corpus_path = $p${usageUpd.clause.length ? ', ' + usageUpd.clause.join(', ') : ''}
                 WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
              { sl: r.source_slug, p: r.corpus_path ?? null, u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug, ...usageUpd.vars },
            );
          } else if (usageUpd.clause.length) {
            await db.query(
              `UPDATE source_usages SET ${usageUpd.clause.join(', ')}
                 WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
              { u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug, ...usageUpd.vars },
            );
          }
        }
        broadcast('source.updated', { domain_type: a.domain_type, domain_slug: a.domain_slug, client_slug: a.client_slug, source_uuid: a.source_uuid, actor: a.actor ?? null });
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, fields, source_slug }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })().catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', file: 'domains.ts', msg: 'consumer exited', error: String(err) }));
  });

  // source.attach — hang an operator-uploaded binary (PDF the analyst downloaded
  // themselves) under the source. Identity (url) is unchanged; this just sets the
  // content artifact + marks the usage fetched.
  void (async () => {
    const sub = nc.subscribe('source.attach.requested');
    for await (const msg of sub) {
      try {
        const a = msg.json() as SourceRef & { filename: string; content_base64: string; content_type?: string };
        const db = await getDb();
        await ensureDomainSchema(db);
        const usage = await usageOf(db, a);
        if (!usage?.source_slug) throw new Error('source has no file yet — add it first');
        const reply = await nc.request(
          'corpus.source.attach.requested',
          JSON.stringify({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_slug: usage.source_slug, filename: a.filename, content_base64: a.content_base64, content_type: a.content_type }),
          { timeout: 60_000 },
        );
        const r = reply.json() as { ok: boolean; corpus_path?: string; binary_filename?: string; bytes?: number; original_bytes?: number; compressed?: boolean; error?: string };
        if (!r.ok) throw new Error(`attach failed: ${r.error ?? 'unknown'}`);
        const attachUpd = actorSetClause(a.actor, 'updated');
        await db.query(
          `UPDATE source_usages SET status = 'fetched', corpus_path = $p, binary_filename = $bf, binary_bytes = $bb${attachUpd.clause.length ? ', ' + attachUpd.clause.join(', ') : ''}
             WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
          { p: r.corpus_path ?? null, bf: r.binary_filename ?? null, bb: r.bytes ?? null, u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug, ...attachUpd.vars },
        );
        if (msg.reply) {
          msg.respond(JSON.stringify({ ok: true, source: { source_uuid: a.source_uuid, status: 'fetched', content_pulled: true, corpus_path: r.corpus_path, binary_filename: r.binary_filename, binary_bytes: r.bytes, bytes: r.bytes, original_bytes: r.original_bytes, compressed: r.compressed } }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })().catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', file: 'domains.ts', msg: 'consumer exited', error: String(err) }));
  });

  // extract.add — append a pasted extract to the source's file (needs a file = a source_slug).
  void (async () => {
    const sub = nc.subscribe('extract.add.requested');
    for await (const msg of sub) {
      try {
        const args = msg.json() as { source_uuid: string; domain_type: string; domain_slug: string; client_slug: string; kind: string; text: string; actor?: Actor };
        const db = await getDb();
        await ensureDomainSchema(db);
        const usage = first<{ source_slug?: string }>(
          await db.query(
            'SELECT source_slug FROM source_usages WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s LIMIT 1',
            { u: args.source_uuid, c: args.client_slug, t: args.domain_type, s: args.domain_slug },
          ),
        );
        if (!usage?.source_slug) throw new Error('source has no file yet — fetch the source first');
        const reply = await nc.request(
          'corpus.source.extract.requested',
          JSON.stringify({
            client_slug: args.client_slug,
            domain_type: args.domain_type,
            domain_slug: args.domain_slug,
            source_slug: usage.source_slug,
            kind: args.kind,
            text: args.text,
          }),
          { timeout: 15_000 },
        );
        const f = reply.json() as { ok: boolean; corpus_path?: string; error?: string };
        if (!f.ok) throw new Error(`extract write failed: ${f.error ?? 'unknown'}`);
        broadcast('extract.added', { domain_type: args.domain_type, domain_slug: args.domain_slug, client_slug: args.client_slug, source_uuid: args.source_uuid, actor: args.actor ?? null });
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, corpus_path: f.corpus_path }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })().catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', file: 'domains.ts', msg: 'consumer exited', error: String(err) }));
  });

  handle('tag.suggest.requested', suggestTags);

  // tag.apply — update the usage's tags in the DB, then mirror the resulting
  // list into the source file's frontmatter so the corpus stays self-describing.
  void (async () => {
    const sub = nc.subscribe('tag.apply.requested');
    for await (const msg of sub) {
      try {
        const a = msg.json() as { source_uuid: string; domain_type: string; domain_slug: string; client_slug: string; tag: string; op?: 'add' | 'remove'; actor?: Actor };
        const db = await getDb();
        await ensureDomainSchema(db);
        const res = await applyTag(db, a);
        const row = first<{ tags?: string[]; source_slug?: string }>(
          await db.query(
            'SELECT tags, source_slug FROM source_usages WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s LIMIT 1',
            { u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug },
          ),
        );
        const tags = row?.tags ?? [];
        if (row?.source_slug) {
          await nc.request(
            'corpus.source.update.requested',
            JSON.stringify({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_slug: row.source_slug, fields: {}, tags }),
            { timeout: 15_000 },
          );
        }
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, tag: res.tag, tags }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })().catch((err: unknown) => {
    console.error(JSON.stringify({ level: 'error', file: 'domains.ts', msg: 'consumer exited', error: String(err) }));
  });
}
