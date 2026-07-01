// Domain catalog — the canonical graph layer behind the strategy-curator surface
// (apps/strategy-curator is the type='strategy' view of it). A "domain" is a TYPED
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

import { JSONCodec, type NatsConnection } from 'nats';
import type { Surreal } from 'surrealdb';
import { getDb } from './surreal';

const jc = JSONCodec();

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

async function ensureTagInVocab(db: Surreal, client_slug: string, tag: string): Promise<void> {
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
  args: { type: string; slug: string; title: string; client_slug: string; tags?: string[] },
): Promise<{ domain: DomainRow }> {
  const { type, slug, title, client_slug } = args;
  const tags = (args.tags ?? []).map(toDashed);
  for (const t of tags) await ensureTagInVocab(db, client_slug, t);
  const existing = first<DomainRow>(
    await db.query('SELECT type, slug, title, client_slugs, tags FROM domains WHERE type = $type AND slug = $slug LIMIT 1', {
      type,
      slug,
    }),
  );
  if (existing) {
    await db.query(
      `UPDATE domains SET
          client_slugs = array::union(client_slugs ?? [], [$client]),
          tags = array::union(tags ?? [], $tags),
          last_touched_at = time::now()
         WHERE type = $type AND slug = $slug;`,
      { type, slug, client: client_slug, tags },
    );
    return {
      domain: {
        ...existing,
        client_slugs: Array.from(new Set([...(existing.client_slugs ?? []), client_slug])),
        tags: Array.from(new Set([...(existing.tags ?? []), ...tags])),
      },
    };
  }
  const created = first<DomainRow>(
    await db.query(
      `CREATE domains SET
          id = rand::uuid::v7(), type = $type, slug = $slug, title = $title,
          client_slugs = [$client], tags = $tags, created_at = time::now()
       RETURN type, slug, title, client_slugs, tags;`,
      { type, slug, title, client: client_slug, tags },
    ),
  );
  return { domain: created ?? { type, slug, title, client_slugs: [client_slug], tags } };
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

async function upsertSource(db: Surreal, args: { url: string }): Promise<SourceRow> {
  const normalized_url = normalizeUrl(args.url);
  const existing = first<SourceRow>(
    await db.query(
      'SELECT source_uuid, normalized_url, url, title, authors, publisher, published_date, content_type FROM sources WHERE normalized_url = $n LIMIT 1',
      { n: normalized_url },
    ),
  );
  if (existing) return existing;
  const created = first<SourceRow>(
    await db.query(
      `CREATE sources SET
          id = rand::uuid::v7(), source_uuid = type::string(rand::uuid::v7()),
          normalized_url = $n, url = $url,
          title = '', authors = [], publisher = '', published_date = '', content_type = '',
          first_seen_at = time::now()
       RETURN source_uuid, normalized_url, url, title, authors, publisher, published_date, content_type;`,
      { n: normalized_url, url: args.url },
    ),
  );
  if (!created) throw new Error('sources registry upsert returned no row');
  return created;
}

export async function addSource(
  db: Surreal,
  args: { url: string; domain_type: string; domain_slug: string; client_slug: string },
): Promise<{ source: SourceRow & { status: string; domain_refs: string[] } }> {
  const source = await upsertSource(db, { url: args.url });
  const dupe = first<UsageRow>(
    await db.query(
      'SELECT source_uuid FROM source_usages WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s LIMIT 1',
      { u: source.source_uuid, c: args.client_slug, t: args.domain_type, s: args.domain_slug },
    ),
  );
  if (!dupe) {
    await db.query(
      `CREATE source_usages SET
          id = rand::uuid::v7(), source_uuid = $u, client_slug = $c,
          domain_type = $t, domain_slug = $s,
          corpus_path = NONE, status = 'metadata-only', tags = [], created_at = time::now();`,
      { u: source.source_uuid, c: args.client_slug, t: args.domain_type, s: args.domain_slug },
    );
  }
  return { source: { ...source, status: 'metadata-only', domain_refs: [`${args.domain_type}:${args.domain_slug}`] } };
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
  args: { source_uuid: string; domain_type: string; domain_slug: string; client_slug: string; tag: string; op?: 'add' | 'remove' },
): Promise<{ ok: true; tag: string }> {
  const tag = toDashed(args.tag);
  const op = args.op ?? 'add';
  const fn = op === 'remove' ? 'array::complement' : 'array::union';
  await db.query(
    `UPDATE source_usages SET tags = ${fn}(tags ?? [], [$tag])
       WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
    { tag, u: args.source_uuid, c: args.client_slug, t: args.domain_type, s: args.domain_slug },
  );
  if (op === 'add') await ensureTagInVocab(db, args.client_slug, tag);
  return { ok: true, tag };
}

// --- NATS handler registration --------------------------------------------

export function registerDomainHandlers(nc: NatsConnection): void {
  const handle = <T>(subject: string, fn: (db: Surreal, args: T) => Promise<unknown>): void => {
    void (async () => {
      const sub = nc.subscribe(subject);
      for await (const msg of sub) {
        const args = jc.decode(msg.data) as T;
        try {
          const db = await getDb();
          await ensureDomainSchema(db);
          const result = await fn(db, args);
          if (msg.reply) msg.respond(jc.encode({ ok: true, ...(result as object) }));
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
        }
      }
    })();
  };

  // domain.create — DB upsert + write the filesystem index.md (content-ingest,
  // filesystem-authoritative). Cross-service request over NATS.
  void (async () => {
    const sub = nc.subscribe('domain.create.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as { type: string; slug: string; title: string; client_slug: string; tags?: string[] };
      try {
        const db = await getDb();
        await ensureDomainSchema(db);
        const { domain } = await createDomain(db, args);
        const created_at = new Date().toISOString().slice(0, 10);
        const reply = await nc.request(
          'corpus.domain.write_index.requested',
          jc.encode({
            client_slug: args.client_slug,
            type: domain.type,
            slug: domain.slug,
            title: domain.title,
            client_slugs: domain.client_slugs,
            tags: domain.tags,
            created_at,
          }),
          { timeout: 15_000 },
        );
        const fileRes = jc.decode(reply.data) as { ok: boolean; corpus_path?: string; error?: string };
        if (!fileRes.ok) throw new Error(`index.md write failed: ${fileRes.error ?? 'unknown'}`);
        if (msg.reply) msg.respond(jc.encode({ ok: true, domain, corpus_path: fileRes.corpus_path }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  handle('domain.list.requested', listDomains);
  handle('domain.assemble.requested', assembleDomain);

  // source.add — DB registry + usage, then cross-call content-ingest to Jina-fetch
  // metadata and write the per-source file. Update the registry title + usage path.
  void (async () => {
    const sub = nc.subscribe('source.add.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as { url: string; domain_type: string; domain_slug: string; client_slug: string };
      try {
        const db = await getDb();
        await ensureDomainSchema(db);
        const { source } = await addSource(db, args);
        const reply = await nc.request(
          'corpus.source.add.requested',
          jc.encode({
            client_slug: args.client_slug,
            domain_type: args.domain_type,
            domain_slug: args.domain_slug,
            source_uuid: source.source_uuid,
            url: source.url,
            normalized_url: source.normalized_url,
          }),
          { timeout: 60_000 }, // Jina can be slow
        );
        const f = jc.decode(reply.data) as { ok: boolean; corpus_path?: string; source_slug?: string; title?: string; authors?: string[]; publisher?: string; published_date?: string; error?: string };
        if (!f.ok) throw new Error(`source file write failed: ${f.error ?? 'unknown'}`);
        await applyBibToRegistry(db, source.source_uuid, f);
        await db.query(
          `UPDATE source_usages SET corpus_path = $p, source_slug = $sl
             WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
          { p: f.corpus_path ?? null, sl: f.source_slug ?? null, u: source.source_uuid, c: args.client_slug, t: args.domain_type, s: args.domain_slug },
        );
        if (msg.reply) {
          msg.respond(jc.encode({ ok: true, source: { ...source, title: f.title ?? source.title, authors: f.authors, publisher: f.publisher, published_date: f.published_date, status: 'metadata-only', source_slug: f.source_slug, corpus_path: f.corpus_path } }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  type SourceRef = { source_uuid: string; domain_type: string; domain_slug: string; client_slug: string };
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
        jc.encode({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_uuid: a.source_uuid, url: src.url, source_slug: usage?.source_slug ?? undefined, no_cache: noCache }),
        { timeout: 90_000 },
      );
      const f = jc.decode(reply.data) as { ok: boolean; corpus_path?: string; source_slug?: string; title?: string; authors?: string[]; publisher?: string; published_date?: string; binary_filename?: string | null; content_pulled?: boolean; error?: string };
      if (!f.ok) throw new Error(`fetch failed: ${f.error ?? 'unknown'}`);
      await applyBibToRegistry(db, a.source_uuid, f);
      // A PDF URL downloads a sibling; coalesce so a non-PDF fetch doesn't wipe an
      // already-attached file.
      await db.query(
        `UPDATE source_usages SET status = 'fetched', source_slug = $sl, corpus_path = $p, binary_filename = $bf ?? binary_filename
           WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
        { sl: f.source_slug ?? usage?.source_slug ?? null, p: f.corpus_path ?? null, bf: f.binary_filename ?? null, u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug },
      );
      const out: Record<string, unknown> = { source_uuid: a.source_uuid, url: src.url, title: f.title, authors: f.authors, publisher: f.publisher, published_date: f.published_date, status: 'fetched', content_pulled: f.content_pulled ?? true, source_slug: f.source_slug ?? usage?.source_slug, corpus_path: f.corpus_path };
      if (f.binary_filename) out.binary_filename = f.binary_filename; // only when present → UI merge keeps an existing attachment
      return { ok: true, source: out };
    } catch (err: unknown) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  const fetchHandler = (subject: string, noCache: boolean): void => {
    void (async () => {
      const sub = nc.subscribe(subject);
      for await (const msg of sub) {
        const res = await runSourceFetch(jc.decode(msg.data) as SourceRef, noCache);
        if (msg.reply) msg.respond(jc.encode(res));
      }
    })();
  };
  fetchHandler('source.fetch.requested', false);
  fetchHandler('source.retry.requested', true);

  // source.remove — drop the (client, domain, source) usage + delete its file. The
  // canonical sources registry row is kept (shared identity).
  void (async () => {
    const sub = nc.subscribe('source.remove.requested');
    for await (const msg of sub) {
      const a = jc.decode(msg.data) as SourceRef;
      try {
        const db = await getDb();
        await ensureDomainSchema(db);
        const usage = await usageOf(db, a);
        await db.query(
          'DELETE source_usages WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;',
          { u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug },
        );
        if (usage?.source_slug) {
          await nc.request('corpus.source.remove.requested', jc.encode({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_slug: usage.source_slug }), { timeout: 15_000 });
        }
        if (msg.reply) msg.respond(jc.encode({ ok: true, source_uuid: a.source_uuid }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // source.update — patch the registry's bibliographic fields + the file frontmatter.
  void (async () => {
    const sub = nc.subscribe('source.update.requested');
    for await (const msg of sub) {
      const a = jc.decode(msg.data) as SourceRef & { fields: Record<string, string>; authors?: string[] };
      try {
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
        if (setParts.length) await db.query(`UPDATE sources SET ${setParts.join(', ')} WHERE source_uuid = $u;`, vars);
        const usage = await usageOf(db, a);
        let source_slug = usage?.source_slug;
        if (usage?.source_slug) {
          const reply = await nc.request('corpus.source.update.requested', jc.encode({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_slug: usage.source_slug, fields, authors: a.authors }), { timeout: 15_000 });
          const r = jc.decode(reply.data) as { ok?: boolean; source_slug?: string; corpus_path?: string };
          // a title edit re-slugs (and renames) the file — keep the usage row pointed at it
          if (r?.source_slug && r.source_slug !== usage.source_slug) {
            source_slug = r.source_slug;
            await db.query(
              `UPDATE source_usages SET source_slug = $sl, corpus_path = $p
                 WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
              { sl: r.source_slug, p: r.corpus_path ?? null, u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug },
            );
          }
        }
        if (msg.reply) msg.respond(jc.encode({ ok: true, fields, source_slug }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // source.attach — hang an operator-uploaded binary (PDF the analyst downloaded
  // themselves) under the source. Identity (url) is unchanged; this just sets the
  // content artifact + marks the usage fetched.
  void (async () => {
    const sub = nc.subscribe('source.attach.requested');
    for await (const msg of sub) {
      const a = jc.decode(msg.data) as SourceRef & { filename: string; content_base64: string; content_type?: string };
      try {
        const db = await getDb();
        await ensureDomainSchema(db);
        const usage = await usageOf(db, a);
        if (!usage?.source_slug) throw new Error('source has no file yet — add it first');
        const reply = await nc.request(
          'corpus.source.attach.requested',
          jc.encode({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_slug: usage.source_slug, filename: a.filename, content_base64: a.content_base64, content_type: a.content_type }),
          { timeout: 60_000 },
        );
        const r = jc.decode(reply.data) as { ok: boolean; corpus_path?: string; binary_filename?: string; bytes?: number; original_bytes?: number; compressed?: boolean; error?: string };
        if (!r.ok) throw new Error(`attach failed: ${r.error ?? 'unknown'}`);
        await db.query(
          `UPDATE source_usages SET status = 'fetched', corpus_path = $p, binary_filename = $bf, binary_bytes = $bb
             WHERE source_uuid = $u AND client_slug = $c AND domain_type = $t AND domain_slug = $s;`,
          { p: r.corpus_path ?? null, bf: r.binary_filename ?? null, bb: r.bytes ?? null, u: a.source_uuid, c: a.client_slug, t: a.domain_type, s: a.domain_slug },
        );
        if (msg.reply) {
          msg.respond(jc.encode({ ok: true, source: { source_uuid: a.source_uuid, status: 'fetched', content_pulled: true, corpus_path: r.corpus_path, binary_filename: r.binary_filename, binary_bytes: r.bytes, bytes: r.bytes, original_bytes: r.original_bytes, compressed: r.compressed } }));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  // extract.add — append a pasted extract to the source's file (needs a file = a source_slug).
  void (async () => {
    const sub = nc.subscribe('extract.add.requested');
    for await (const msg of sub) {
      const args = jc.decode(msg.data) as { source_uuid: string; domain_type: string; domain_slug: string; client_slug: string; kind: string; text: string };
      try {
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
          jc.encode({
            client_slug: args.client_slug,
            domain_type: args.domain_type,
            domain_slug: args.domain_slug,
            source_slug: usage.source_slug,
            kind: args.kind,
            text: args.text,
          }),
          { timeout: 15_000 },
        );
        const f = jc.decode(reply.data) as { ok: boolean; corpus_path?: string; error?: string };
        if (!f.ok) throw new Error(`extract write failed: ${f.error ?? 'unknown'}`);
        if (msg.reply) msg.respond(jc.encode({ ok: true, corpus_path: f.corpus_path }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();

  handle('tag.suggest.requested', suggestTags);

  // tag.apply — update the usage's tags in the DB, then mirror the resulting
  // list into the source file's frontmatter so the corpus stays self-describing.
  void (async () => {
    const sub = nc.subscribe('tag.apply.requested');
    for await (const msg of sub) {
      const a = jc.decode(msg.data) as { source_uuid: string; domain_type: string; domain_slug: string; client_slug: string; tag: string; op?: 'add' | 'remove' };
      try {
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
            jc.encode({ client_slug: a.client_slug, domain_type: a.domain_type, domain_slug: a.domain_slug, source_slug: row.source_slug, fields: {}, tags }),
            { timeout: 15_000 },
          );
        }
        if (msg.reply) msg.respond(jc.encode({ ok: true, tag: res.tag, tags }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(jc.encode({ ok: false, error }));
      }
    }
  })();
}
