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

export function toTrainCase(s: string): string {
  return s
    .trim()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
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
  domainSchemaReady = true;
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
};

// --- domains ---------------------------------------------------------------

export async function createDomain(
  db: Surreal,
  args: { type: string; slug: string; title: string; client_slug: string; tags?: string[] },
): Promise<{ domain: DomainRow }> {
  const { type, slug, title, client_slug } = args;
  const tags = (args.tags ?? []).map(toTrainCase);
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
  const res = await db.query(`SELECT type, slug, title, client_slugs, tags FROM domains ${where} ORDER BY created_at DESC`, vars);
  return { domains: ((res as unknown[])?.[0] as DomainRow[]) ?? [] };
}

// --- sources registry (canonical, by normalized_url) -----------------------

async function upsertSource(db: Surreal, args: { url: string }): Promise<SourceRow> {
  const normalized_url = normalizeUrl(args.url);
  const existing = first<SourceRow>(
    await db.query(
      'SELECT source_uuid, normalized_url, url, title, publisher, published_date, content_type FROM sources WHERE normalized_url = $n LIMIT 1',
      { n: normalized_url },
    ),
  );
  if (existing) return existing;
  const created = first<SourceRow>(
    await db.query(
      `CREATE sources SET
          id = rand::uuid::v7(), source_uuid = rand::uuid::v7(),
          normalized_url = $n, url = $url,
          title = '', publisher = '', published_date = '', content_type = '',
          first_seen_at = time::now()
       RETURN source_uuid, normalized_url, url, title, publisher, published_date, content_type;`,
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
): Promise<{ sources: (SourceRow & { status: string; tags: string[] })[] }> {
  const usages = ((await db.query(
    'SELECT source_uuid, status, tags FROM source_usages WHERE domain_type = $t AND domain_slug = $s AND client_slug = $c ORDER BY created_at ASC',
    { t: args.type, s: args.slug, c: args.client_slug },
  )) as unknown[])?.[0] as UsageRow[] | undefined;
  const sources: (SourceRow & { status: string; tags: string[] })[] = [];
  for (const u of usages ?? []) {
    const s = first<SourceRow>(
      await db.query(
        'SELECT source_uuid, normalized_url, url, title, publisher, published_date, content_type FROM sources WHERE source_uuid = $u LIMIT 1',
        { u: u.source_uuid },
      ),
    );
    if (s) sources.push({ ...s, status: u.status ?? 'metadata-only', tags: u.tags ?? [] });
  }
  return { sources };
}

// --- tags (workspace vocabulary, Train-Case) -------------------------------

export async function suggestTags(db: Surreal, args: { client_slug: string; prefix?: string }): Promise<{ tags: string[] }> {
  const res = await db.query('SELECT VALUE tag FROM tag_vocab WHERE client_slug = $c ORDER BY tag ASC', { c: args.client_slug });
  let tags = (((res as unknown[])?.[0] as string[]) ?? []).filter(Boolean);
  const p = (args.prefix ?? '').trim().toLowerCase();
  if (p) tags = tags.filter((t) => t.toLowerCase().includes(p));
  return { tags: tags.slice(0, 25) };
}

export async function applyTag(
  db: Surreal,
  args: { source_uuid: string; domain_type: string; domain_slug: string; client_slug: string; tag: string; op?: 'add' | 'remove' },
): Promise<{ ok: true; tag: string }> {
  const tag = toTrainCase(args.tag);
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
  handle('source.add.requested', addSource);
  handle('tag.suggest.requested', suggestTags);
  handle('tag.apply.requested', applyTag);
}
