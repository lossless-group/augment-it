// Group E — Corpora canonical CRUD.
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// Test names are the registry's ✓-phrases, verbatim. Runs the resolver's
// own exported CRUD functions against a throwaway in-memory SurrealDB
// (never the shared cloud). One server for the file; each test uses its
// own domain/client slugs so they don't collide.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Surreal } from 'surrealdb';
import { addSource, createDomain, listDomains, normalizeUrl, retypeDomain } from '../src/domains';
import { startEphemeralSurreal, type EphemeralSurreal } from './helpers/ephemeral-surreal';

let harness: EphemeralSurreal;
let db: Surreal;

beforeAll(async () => {
  harness = await startEphemeralSurreal();
  db = harness.db;
}, 30_000);

afterAll(async () => {
  await harness?.stop();
});

describe('Group E — corpora canonical CRUD', () => {
  test('creating a domain registers it under exactly the requesting workspace’s client slug', async () => {
    const { domain } = await createDomain(db, {
      type: 'thesis',
      slug: 'consumer-immunology',
      title: 'Consumer Immunology',
      client_slug: 'humain-vc',
    });
    expect(domain.client_slugs).toEqual(['humain-vc']);

    // And it does NOT leak into another client's view — the
    // rural-income-boosts mis-scope class.
    const reach = await listDomains(db, { client_slug: 'reach-edu' });
    expect(reach.domains.find((d) => d.slug === 'consumer-immunology')).toBeUndefined();
  });

  test('creating an existing domain from a second workspace unions the client slug instead of duplicating the row', async () => {
    await createDomain(db, { type: 'strategy', slug: 'rural-income-boosts', title: 'Rural Income Boosts', client_slug: 'humain-vc' });
    const { domain } = await createDomain(db, {
      type: 'strategy',
      slug: 'rural-income-boosts',
      title: 'Rural Income Boosts',
      client_slug: 'reach-edu',
    });
    // Both clients present, order-insensitive, and no duplicate.
    expect([...domain.client_slugs].sort()).toEqual(['humain-vc', 'reach-edu']);
    const rows = (await db.query(
      "SELECT slug FROM domains WHERE type='strategy' AND slug='rural-income-boosts';",
    )) as unknown[][];
    expect(rows[0]).toHaveLength(1); // one row, not two
  });

  test('domain.list filtered by type and client returns exactly that client’s domains of that type', async () => {
    await createDomain(db, { type: 'thesis', slug: 'sfm', title: 'Specialized Foundation Models', client_slug: 'humain-vc' });
    await createDomain(db, { type: 'topic', slug: 'future-of-work', title: 'Future of Work', client_slug: 'humain-vc' });

    const theses = await listDomains(db, { type: 'thesis', client_slug: 'humain-vc' });
    const slugs = theses.domains.map((d) => d.slug);
    expect(slugs).toContain('sfm');
    expect(slugs).toContain('consumer-immunology');
    expect(slugs).not.toContain('future-of-work'); // wrong type filtered out
    for (const d of theses.domains) expect(d.type).toBe('thesis');
  });

  test('domain.list with no type filter returns every domain for the client — the didi-chat view', async () => {
    const all = await listDomains(db, { client_slug: 'humain-vc' });
    const types = new Set(all.domains.map((d) => d.type));
    // The slab didi reads sees thesis + strategy + topic together, unlike
    // the curator rail's single-type query.
    expect(types.has('thesis')).toBe(true);
    expect(types.has('strategy')).toBe(true);
    expect(types.has('topic')).toBe(true);
  });

  test('retyping a domain moves the row and every source usage with it, for all clients at once', async () => {
    await createDomain(db, { type: 'strategy', slug: 'retype-me', title: 'Retype Me', client_slug: 'humain-vc' });
    await addSource(db, { url: 'https://example.com/a', domain_type: 'strategy', domain_slug: 'retype-me', client_slug: 'humain-vc' });

    await retypeDomain(db, { type: 'strategy', slug: 'retype-me', new_type: 'thesis' });

    // Domain row moved.
    const asStrategy = await listDomains(db, { type: 'strategy', client_slug: 'humain-vc' });
    const asThesis = await listDomains(db, { type: 'thesis', client_slug: 'humain-vc' });
    expect(asStrategy.domains.find((d) => d.slug === 'retype-me')).toBeUndefined();
    expect(asThesis.domains.find((d) => d.slug === 'retype-me')).toBeDefined();

    // And the usage row moved with it — no stranded usage under the old type.
    const strandedOld = (await db.query(
      "SELECT source_uuid FROM source_usages WHERE domain_type='strategy' AND domain_slug='retype-me';",
    )) as unknown[][];
    const movedNew = (await db.query(
      "SELECT source_uuid FROM source_usages WHERE domain_type='thesis' AND domain_slug='retype-me';",
    )) as unknown[][];
    expect(strandedOld[0]).toHaveLength(0);
    expect(movedNew[0]).toHaveLength(1);
  });

  test('adding the same URL to the same corpus twice yields one source and one usage', async () => {
    const args = { url: 'https://example.com/dupe', domain_type: 'thesis', domain_slug: 'consumer-immunology', client_slug: 'humain-vc' };
    const first = await addSource(db, args);
    const second = await addSource(db, args);
    // Same canonical source (same uuid), not a second one.
    expect(second.source.source_uuid).toBe(first.source.source_uuid);

    // Match on the NORMALIZED url (what's actually stored) so "exactly one
    // source" is a real assertion, not an artifact of a raw-string miss.
    const sources = (await db.query(
      'SELECT source_uuid FROM sources WHERE normalized_url = $n;',
      { n: normalizeUrl('https://example.com/dupe') },
    )) as unknown[][];
    const usages = (await db.query(
      "SELECT source_uuid FROM source_usages WHERE source_uuid = $u AND client_slug='humain-vc' AND domain_type='thesis' AND domain_slug='consumer-immunology';",
      { u: first.source.source_uuid },
    )) as unknown[][];
    expect(sources[0]).toHaveLength(1);
    expect(usages[0]).toHaveLength(1); // idempotent — not two edges
  });

  test('the same source in two corpora is two scoped usages — one canonical source, per-(client,domain) edges', async () => {
    // The scoping invariant the (handler-only) remove path relies on: a
    // source's usages are independent edges keyed by (client, domain), so
    // removing one could never cascade the other. Proven here via add.
    const url = 'https://example.com/shared';
    const a = await addSource(db, { url, domain_type: 'thesis', domain_slug: 'consumer-immunology', client_slug: 'humain-vc' });
    const b = await addSource(db, { url, domain_type: 'topic', domain_slug: 'future-of-work', client_slug: 'humain-vc' });
    expect(b.source.source_uuid).toBe(a.source.source_uuid); // one canonical source

    const usages = (await db.query(
      'SELECT domain_type, domain_slug FROM source_usages WHERE source_uuid = $u ORDER BY domain_type;',
      { u: a.source.source_uuid },
    )) as { domain_type: string; domain_slug: string }[][];
    expect(usages[0]).toHaveLength(2); // two independent edges, same source
  });
});
