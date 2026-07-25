// NATS handlers for the record ↔ persons bridge. Sibling to handlers.ts (the
// org equivalent) — see person-resolver.ts for why this is a separate module.
//
//   person.candidates  { record, client }                       → { ok, candidates }
//   person.search      { q, client }                            → { ok, candidates }
//   person.apply       { action, person_id?, record, client }    → PersonApplyResult
//   person.affiliate   { person_id, org_action, ..., client }    → PersonAffiliateResult
//   affiliation.rate   { person_uuid, org_slug, relevance, relevance_note?, client } → AffiliationRateResult

import { type NatsConnection } from '@nats-io/transport-node';
import { getDb } from './surreal';
import {
  findPersonCandidates,
  searchPersons,
  applyPersonResolution,
  applyPersonAffiliation,
  addPersonObservation,
  listPersonObservations,
  applyAffiliationRating,
  addPersonLink,
  addPersonCorpus,
  removePersonLink,
  removePersonCorpus,
  removeAffiliation,
  getAffiliationDetail,
  listOrgAffiliations,
  type PersonNormRecord,
  type PersonApplyInput,
  type PersonAffiliateInput,
  type PersonAddObservationInput,
  type PersonObservationsInput,
  type AffiliationRateInput,
  type PersonLinkAddInput,
  type PersonCorpusAddInput,
  type PersonEntryRemoveInput,
  type PersonUnaffiliateInput,
  type AffiliationDetailInput,
  type OrgAffiliationsInput,
} from './person-resolver';

export function registerPersonHandlers(nc: NatsConnection): void {
  // person.candidates
  (async () => {
    const sub = nc.subscribe('person.candidates.requested');
    for await (const msg of sub) {
      const args = msg.json() as { record: PersonNormRecord; client: string };
      try {
        const db = await getDb();
        const { candidates } = await findPersonCandidates(db, args.record, args.client);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, candidates }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // person.search
  (async () => {
    const sub = nc.subscribe('person.search.requested');
    for await (const msg of sub) {
      const args = msg.json() as { q: string; client: string };
      try {
        const db = await getDb();
        const { candidates } = await searchPersons(db, args.q, args.client);
        if (msg.reply) msg.respond(JSON.stringify({ ok: true, candidates }));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // person.apply
  (async () => {
    const sub = nc.subscribe('person.apply.requested');
    for await (const msg of sub) {
      const args = msg.json() as PersonApplyInput;
      try {
        const db = await getDb();
        const result = await applyPersonResolution(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // person.affiliate
  (async () => {
    const sub = nc.subscribe('person.affiliate.requested');
    for await (const msg of sub) {
      const args = msg.json() as PersonAffiliateInput;
      try {
        const db = await getDb();
        const result = await applyPersonAffiliation(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // person.add_observation
  (async () => {
    const sub = nc.subscribe('person.add_observation.requested');
    for await (const msg of sub) {
      const args = msg.json() as PersonAddObservationInput;
      try {
        const db = await getDb();
        const result = await addPersonObservation(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // person.observations — read-only history, see person-resolver.ts
  (async () => {
    const sub = nc.subscribe('person.observations.requested');
    for await (const msg of sub) {
      const args = msg.json() as PersonObservationsInput;
      try {
        const db = await getDb();
        const result = await listPersonObservations(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // affiliation.rate — Augment-from-Affiliations CSV round-trip's write
  // half. See context-v/specs/Augment-From-Affiliations.md.
  (async () => {
    const sub = nc.subscribe('affiliation.rate.requested');
    for await (const msg of sub) {
      const args = msg.json() as AffiliationRateInput;
      try {
        const db = await getDb();
        const result = await applyAffiliationRating(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // person.links.add — single-entry additive write for an already-resolved
  // person. Per context-v/specs/Augment-From-Affiliations.md v0.2.0.0.
  (async () => {
    const sub = nc.subscribe('person.links.add.requested');
    for await (const msg of sub) {
      const args = msg.json() as PersonLinkAddInput;
      try {
        const db = await getDb();
        const result = await addPersonLink(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // person.corpus.add
  (async () => {
    const sub = nc.subscribe('person.corpus.add.requested');
    for await (const msg of sub) {
      const args = msg.json() as PersonCorpusAddInput;
      try {
        const db = await getDb();
        const result = await addPersonCorpus(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // person.links.remove / person.corpus.remove — URL-matched detach with an
  // entry_removed observation trail. Per
  // context-v/specs/Entity-Card-Edit-And-Remove-Affordances.md.
  for (const [subject, fn] of [
    ['person.links.remove.requested', removePersonLink],
    ['person.corpus.remove.requested', removePersonCorpus],
  ] as const) {
    (async () => {
      const sub = nc.subscribe(subject);
      for await (const msg of sub) {
        const args = msg.json() as PersonEntryRemoveInput;
        try {
          const db = await getDb();
          const result = await fn(db, args);
          if (msg.reply) msg.respond(JSON.stringify(result));
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : String(err);
          if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
        }
      }
    })();
  }

  // person.unaffiliate — delete the person↔org affiliation edge(s); the
  // inverse of person.affiliate, with an affiliation_removed observation.
  (async () => {
    const sub = nc.subscribe('person.unaffiliate.requested');
    for await (const msg of sub) {
      const args = msg.json() as PersonUnaffiliateInput;
      try {
        const db = await getDb();
        const result = await removeAffiliation(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // affiliation.detail — current person/org links+corpus+relevance, fresh
  // (not a stale CSV-export snapshot). Per
  // context-v/specs/Augment-From-Affiliations.md v0.2.0.0.
  (async () => {
    const sub = nc.subscribe('affiliation.detail.requested');
    for await (const msg of sub) {
      const args = msg.json() as AffiliationDetailInput;
      try {
        const db = await getDb();
        const result = await getAffiliationDetail(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();

  // organization.affiliations — every person RELATEd to one org, for the
  // Augment-from-DB org workbench's people reveal. Per
  // context-v/specs/Augment-From-DB-Flow.md.
  (async () => {
    const sub = nc.subscribe('organization.affiliations.requested');
    for await (const msg of sub) {
      const args = msg.json() as OrgAffiliationsInput;
      try {
        const db = await getDb();
        const result = await listOrgAffiliations(db, args);
        if (msg.reply) msg.respond(JSON.stringify(result));
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
      }
    }
  })();
}
