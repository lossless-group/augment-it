// NATS handlers for the record ↔ SurrealDB resolver. Three capabilities,
// all request/reply (no broadcast events in v0):
//
//   resolver.candidates  { record, client } → { ok, candidates }
//   resolver.search      { q, client }      → { ok, candidates }
//   resolver.apply       { action, org_slug?, record, client, source } → ApplyResult
//
// Contract is DB-agnostic (see context-v/specs/Record-DB-Resolver.md); this
// implementation is SurrealDB-specific.

import { type NatsConnection } from '@nats-io/transport-node';
import { getDb } from './surreal';
import {
  findCandidates,
  searchOrgs,
  applyResolution,
  updateOrg,
  updateOpportunity,
  opportunitiesForOrg,
  addOrgLink,
  addOrgCorpus,
  getOrgDetail,
  type NormRecord,
  type ApplyInput,
  type UpdateOrgInput,
  type UpdateOpportunityInput,
  type OrgLinkAddInput,
  type OrgCorpusAddInput,
} from './resolver';

export function registerHandlers(nc: NatsConnection): void {
  // resolver.candidates
  (async () => {
    const sub = nc.subscribe('resolver.candidates.requested');
    for await (const msg of sub) {
      const args = msg.json() as { record: NormRecord; client: string };
      try {
        const db = await getDb();
        const { candidates } = await findCandidates(db, args.record, args.client);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, candidates }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // resolver.search
  (async () => {
    const sub = nc.subscribe('resolver.search.requested');
    for await (const msg of sub) {
      const args = msg.json() as { q: string; client: string };
      try {
        const db = await getDb();
        const { candidates } = await searchOrgs(db, args.q, args.client);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, candidates }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // resolver.apply
  (async () => {
    const sub = nc.subscribe('resolver.apply.requested');
    for await (const msg of sub) {
      const args = msg.json() as ApplyInput;
      try {
        const db = await getDb();
        const result = await applyResolution(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // resolver.update_org — edit the canonical entity's name/slug (v0.0.0.2)
  (async () => {
    const sub = nc.subscribe('resolver.update_org.requested');
    for await (const msg of sub) {
      const args = msg.json() as UpdateOrgInput;
      try {
        const db = await getDb();
        const result = await updateOrg(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // resolver.update_opportunity — edit an opportunity's name (v0.0.0.4)
  (async () => {
    const sub = nc.subscribe('resolver.update_opportunity.requested');
    for await (const msg of sub) {
      const args = msg.json() as UpdateOpportunityInput;
      try {
        const db = await getDb();
        const result = await updateOpportunity(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // resolver.opportunities_for_org — reverse bond, org → its opportunities (v0.0.0.3)
  (async () => {
    const sub = nc.subscribe('resolver.opportunities_for_org.requested');
    for await (const msg of sub) {
      const args = msg.json() as { org_slug: string; client: string };
      try {
        const db = await getDb();
        const result = await opportunitiesForOrg(db, args.org_slug, args.client);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, ...result }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // organization.links.add — single-entry additive write for an already-
  // resolved org. Per context-v/specs/Augment-From-Affiliations.md v0.2.0.0.
  (async () => {
    const sub = nc.subscribe('organization.links.add.requested');
    for await (const msg of sub) {
      const args = msg.json() as OrgLinkAddInput;
      try {
        const db = await getDb();
        const result = await addOrgLink(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // organization.corpus.add
  (async () => {
    const sub = nc.subscribe('organization.corpus.add.requested');
    for await (const msg of sub) {
      const args = msg.json() as OrgCorpusAddInput;
      try {
        const db = await getDb();
        const result = await addOrgCorpus(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // organization.detail — the full org card (identity + org_links +
  // media_streams + org_corpus) for the Augment-from-DB org workbench.
  // Per context-v/specs/Augment-From-DB-Flow.md.
  (async () => {
    const sub = nc.subscribe('organization.detail.requested');
    for await (const msg of sub) {
      const args = msg.json() as { org_slug: string; client: string };
      try {
        const db = await getDb();
        const result = await getOrgDetail(db, args.org_slug, args.client);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();
}
