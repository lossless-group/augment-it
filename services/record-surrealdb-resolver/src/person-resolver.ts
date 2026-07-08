// Candidate matching + write path for the record ↔ persons bridge. Sibling to
// resolver.ts (which does the same job for organizations) — kept as a
// separate module because the write targets, candidate shape, and lack of an
// "opportunity" concept are genuinely different, not a mode of the org path.
// See context-v/plans/Person-Aware-Canonical-Resolver-Extension.md.
//
// Mirrors the proven shape from scripts/surreal-write-persons.mjs (person
// upsert keyed by linkedin_profile_url) and
// scripts/surreal-write-event-attendees.mjs (event-tie + affiliated_with
// observations) — this is those scripts' logic, promoted into a capability
// so it's reachable from the shell instead of CLI-only.

import type { Surreal } from 'surrealdb';
import { resolveOrgRow, slugify, shapeLink, findOrCreateContent, type ShapedLink } from './resolver';

// Actor attribution — same shape + same "never clobber with NULL when
// unattributed" discipline as domains.ts's actorSetClause. Duplicated
// locally rather than imported across service modules, matching how
// domains.ts already does it in this same service.
export type Actor = { didi_id: string; via?: string };

export type PersonNormRecord = {
  name: string;
  linkedin_url?: string | null;
  org_name?: string | null;
  role?: string | null;
  // Free text like "Speaker at FreedomFest 2026" — parsed into
  // (predicate, event name) by parseEventObservation below.
  observation?: string | null;
};

type PersonRow = {
  id: unknown;
  person_uuid?: string | null;
  name?: string | null;
  headline?: string | null;
  linkedin_profile_url?: string | null;
};

const PERSON_FIELDS = 'id, person_uuid, name, headline, linkedin_profile_url';

export type PersonCandidate = {
  // Wire-safe handle — NEVER the raw RecordId (SurrealDB RecordIds don't
  // survive JSON/NATS round-trips; see resolver.ts's header comment and
  // domains.ts's identical source_uuid lesson). A later person.apply(match)
  // or person.affiliate call re-looks-up the live RecordId by this string.
  person_uuid: string;
  name: string | null;
  headline: string | null;
  linkedin_profile_url: string | null;
  score: number;
  match_reason: string[];
};

// Idempotent: unique index + one-time backfill for rows written before this
// capability existed (scripts/surreal-write-persons.mjs never set
// person_uuid). Safe to call on every request — the WHERE clause makes the
// backfill a no-op once every row has one.
let personSchemaReady = false;
async function ensurePersonSchema(db: Surreal): Promise<void> {
  if (personSchemaReady) return;
  await db.query(`
    DEFINE INDEX IF NOT EXISTS person_uuid_uq ON persons FIELDS person_uuid UNIQUE;
    UPDATE persons SET person_uuid = <string> rand::uuid::v7() WHERE person_uuid = NONE;
  `);
  personSchemaReady = true;
}

async function loadClientPersons(db: Surreal, client: string): Promise<PersonRow[]> {
  await ensurePersonSchema(db);
  const r = await db.query(
    `SELECT ${PERSON_FIELDS} FROM persons WHERE client_access CONTAINS $client;`,
    { client },
  );
  return (r?.[0] as PersonRow[]) ?? [];
}

async function fetchPersonByUuid(db: Surreal, person_uuid: string): Promise<PersonRow | null> {
  const r = await db.query(`SELECT ${PERSON_FIELDS} FROM persons WHERE person_uuid = $u LIMIT 1;`, {
    u: person_uuid,
  });
  return ((r?.[0] as PersonRow[]) ?? [])[0] ?? null;
}

// ---------------------------------------------------------------------------
// Capability: person.candidates
// ---------------------------------------------------------------------------

export async function findPersonCandidates(
  db: Surreal,
  record: PersonNormRecord,
  client: string,
): Promise<{ candidates: PersonCandidate[] }> {
  const persons = await loadClientPersons(db, client);

  // 1. exact linkedin_profile_url — decisive, no need to also fuzzy-match.
  if (record.linkedin_url) {
    const url = record.linkedin_url.trim();
    const hit = persons.find((p) => (p.linkedin_profile_url ?? '').trim() === url);
    if (hit && hit.person_uuid) {
      return {
        candidates: [
          {
            person_uuid: hit.person_uuid,
            name: hit.name ?? null,
            headline: hit.headline ?? null,
            linkedin_profile_url: hit.linkedin_profile_url ?? null,
            score: 100,
            match_reason: ['linkedin_url'],
          },
        ],
      };
    }
  }

  // 2. fuzzy name (+ org boost when the person's headline mentions the org).
  const q = record.name.trim().toLowerCase();
  if (q.length < 3) return { candidates: [] };
  const org = (record.org_name ?? '').trim().toLowerCase();
  const scored: PersonCandidate[] = [];
  for (const p of persons) {
    if (!p.person_uuid) continue;
    const name = (p.name ?? '').toLowerCase();
    if (!name || (!name.includes(q) && !q.includes(name))) continue;
    const reasons = ['name'];
    let score = 55;
    if (org && (p.headline ?? '').toLowerCase().includes(org)) {
      score = 75;
      reasons.push('org_in_headline');
    }
    scored.push({
      person_uuid: p.person_uuid,
      name: p.name ?? null,
      headline: p.headline ?? null,
      linkedin_profile_url: p.linkedin_profile_url ?? null,
      score,
      match_reason: reasons,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return { candidates: scored.slice(0, 8) };
}

// ---------------------------------------------------------------------------
// Capability: person.search (manual autocomplete)
// ---------------------------------------------------------------------------

export async function searchPersons(
  db: Surreal,
  q: string,
  client: string,
): Promise<{ candidates: Pick<PersonCandidate, 'person_uuid' | 'name' | 'headline'>[] }> {
  const trimmed = q?.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return { candidates: [] };
  await ensurePersonSchema(db);
  const r = await db.query(
    `SELECT person_uuid, name, headline FROM persons
       WHERE client_access CONTAINS $client AND string::lowercase(name) CONTAINS $q
       ORDER BY name ASC LIMIT 8`,
    { client, q: trimmed },
  );
  const rows = ((r?.[0] as PersonRow[]) ?? [])
    .filter((p) => p.person_uuid)
    .map((p) => ({
      person_uuid: p.person_uuid as string,
      name: p.name ?? null,
      headline: p.headline ?? null,
    }));
  return { candidates: rows };
}

// ---------------------------------------------------------------------------
// Events — find-or-create by name, scoped per client. One row per event,
// same shape scripts/surreal-write-event.mjs already writes.
// ---------------------------------------------------------------------------

async function ensureEvent(
  db: Surreal,
  args: { name: string; client: string; source: string },
): Promise<unknown> {
  const slug = slugify(args.name);
  const existing = await db.query(
    'SELECT VALUE id FROM events WHERE slug = $slug AND client = $client LIMIT 1',
    { slug, client: args.client },
  );
  const hit = (existing?.[0] as unknown[])?.[0];
  if (hit) return hit;
  const created = await db.query(
    `CREATE events SET
        id = rand::uuid::v7(), slug = $slug, name = $name, client = $client,
        client_access = [$client], source = $source, first_seen_at = time::now()
     RETURN id;`,
    { slug, name: args.name, client: args.client, source: args.source },
  );
  return (created?.[0] as { id?: unknown }[])?.[0]?.id ?? null;
}

// "Speaker at FreedomFest 2026" → { predicate: 'speaker_at', event_name: 'FreedomFest 2026' }.
// Same shape as surreal-write-event-attendees.mjs's rsvp_event funnel parse,
// generalized past the RSVP-specific verbs to whatever role word precedes "at".
const PREDICATE_BY_VERB: Record<string, string> = {
  speaker: 'speaker_at',
  sponsor: 'sponsor_of',
  exhibitor: 'exhibitor_at',
  attendee: 'attended',
  partner: 'partner_of',
};

export function parseEventObservation(
  observation: string | null | undefined,
): { predicate: string; event_name: string } | null {
  const s = (observation ?? '').trim();
  const m = /^(\w+)\s+at\s+(.+)$/i.exec(s);
  if (!m) return null;
  const verb = m[1].toLowerCase();
  const event_name = m[2].trim();
  if (!event_name) return null;
  return { predicate: PREDICATE_BY_VERB[verb] ?? 'associated_with', event_name };
}

async function createObservation(
  db: Surreal,
  args: { subject: unknown; predicate: string; object: unknown; source: string; client: string },
): Promise<void> {
  await db.query(
    `CREATE observations SET
        id = rand::uuid::v7(), subject = $subject, predicate = $predicate, object = $object,
        source = $source, observed_at = time::now(), client = $client;`,
    args,
  );
}

// ---------------------------------------------------------------------------
// Capability: person.add_observation — a free-form manual observation the
// operator types in, on top of whatever person.apply already derived from
// the row (has_name, event-tie, etc.). Same observations table, just an
// operator-authored predicate/value instead of a parsed one.
// ---------------------------------------------------------------------------

export type PersonAddObservationInput = {
  person_uuid: string;
  predicate: string;
  value: string;
  client: string;
  source?: string;
};

export async function addPersonObservation(
  db: Surreal,
  input: PersonAddObservationInput,
): Promise<{ ok: true }> {
  await ensurePersonSchema(db);
  const person = await fetchPersonByUuid(db, input.person_uuid);
  if (!person) throw new Error(`person not found: ${input.person_uuid}`);
  const predicate = input.predicate.trim();
  const value = input.value.trim();
  if (!predicate || !value) throw new Error('person.add_observation requires both predicate and value');
  await createObservation(db, {
    subject: person.id,
    predicate,
    object: value,
    source: input.source || 'person-db-resolver',
    client: input.client,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Capability: person.apply — match-or-create the person row, write has_name /
// has_linkedin_url / event-tie observations. Does NOT touch organizations —
// that's the separate person.affiliate call, per the "independent decisions"
// design (a person can be created/matched with no org action at all, and
// vice versa).
// ---------------------------------------------------------------------------

export type PersonApplyInput = {
  action: 'match' | 'create';
  person_uuid?: string; // required for match — the wire-safe handle, not a RecordId
  record: PersonNormRecord;
  client: string;
  source?: string;
};

export type PersonApplyResult = {
  ok: true;
  person_uuid: string;
  created: boolean;
  name: string | null;
};

export async function applyPersonResolution(
  db: Surreal,
  input: PersonApplyInput,
): Promise<PersonApplyResult> {
  await ensurePersonSchema(db);
  const { record, client } = input;
  const source = input.source || 'person-db-resolver';

  let person: PersonRow | null = null;
  let created = false;

  if (input.action === 'match') {
    if (!input.person_uuid) throw new Error('person.apply (match) requires person_uuid');
    const hit = await fetchPersonByUuid(db, input.person_uuid);
    if (!hit) throw new Error(`person not found: ${input.person_uuid}`);
    person = hit;
    await db.query(
      `UPDATE $id SET
          client_access = array::union(client_access ?? [], [$client]),
          last_touched_by = $client, last_touched_at = time::now(), last_seen_at = time::now();`,
      { id: person.id, client },
    );
  } else {
    // create — but defend against a race (same linkedin_url landed since candidates loaded).
    if (record.linkedin_url) {
      const existing = await db.query(
        `SELECT ${PERSON_FIELDS} FROM persons WHERE linkedin_profile_url = $url LIMIT 1`,
        { url: record.linkedin_url.trim() },
      );
      person = ((existing?.[0] as PersonRow[]) ?? [])[0] ?? null;
    }
    if (!person) {
      const createdRes = await db.query(
        `CREATE persons SET
            id = rand::uuid::v7(), person_uuid = <string> rand::uuid::v7(),
            name = $name, linkedin_profile_url = $linkedin_url,
            source = $source, client_access = [$client],
            first_touched_by = $client, last_touched_by = $client,
            last_touched_at = time::now(), first_seen_at = time::now(), last_seen_at = time::now()
         RETURN ${PERSON_FIELDS};`,
        { name: record.name.trim(), linkedin_url: record.linkedin_url ?? null, source, client },
      );
      const row = ((createdRes?.[0] as PersonRow[]) ?? [])[0];
      if (!row) throw new Error('person create returned no row');
      person = row;
      created = true;
    }
  }

  if (!person) throw new Error('person.apply: no person resolved');
  if (!person.person_uuid) {
    // Matched a pre-existing row from before this capability existed
    // (surreal-write-persons.mjs never set person_uuid) — backfill now.
    const backfilled = await db.query(
      `UPDATE $id SET person_uuid = <string> rand::uuid::v7() RETURN VALUE person_uuid;`,
      { id: person.id },
    );
    person.person_uuid = ((backfilled?.[0] as string[]) ?? [])[0] ?? null;
  }

  await createObservation(db, {
    subject: person.id,
    predicate: 'has_name',
    object: record.name.trim(),
    source,
    client,
  });
  if (record.linkedin_url) {
    await createObservation(db, {
      subject: person.id,
      predicate: 'has_linkedin_url',
      object: record.linkedin_url.trim(),
      source,
      client,
    });
  }
  const eventObs = parseEventObservation(record.observation);
  if (eventObs) {
    const eventId = await ensureEvent(db, { name: eventObs.event_name, client, source });
    await createObservation(db, { subject: person.id, predicate: eventObs.predicate, object: eventId, source, client });
  }

  if (!person.person_uuid) throw new Error('person.apply: person_uuid backfill failed');
  return { ok: true, person_uuid: person.person_uuid, created, name: person.name ?? null };
}

// ---------------------------------------------------------------------------
// Capability: person.affiliate — resolve the org (reusing resolveOrgRow, the
// same match/create logic org-shaped records get) and RELATE it to an
// already-resolved person, with the role/title on the edge. Separate call
// from person.apply so a person can be created/matched with no org action,
// and an org can be resolved for a person independently of when they were
// created — matches the "independent decisions" design.
// ---------------------------------------------------------------------------

export type PersonAffiliateInput = {
  // Optional — per the "independent decisions" design, an org can be
  // resolved with NO person resolved yet at all (or ever). When present,
  // this crossed the wire once already out of person.apply's result, so
  // it's re-looked-up fresh here, never used directly as a RecordId.
  person_uuid?: string;
  org_action: 'match' | 'create';
  org_slug?: string; // required for match
  org_name?: string; // required for create
  role?: string | null;
  client: string;
  source?: string;
};

export type PersonAffiliateResult = {
  ok: true;
  org_id: string;
  org_slug: string;
  org_created: boolean;
  // Both false when no person_uuid was given — org-only resolution, no edge.
  affiliation_created: boolean;
};

export async function applyPersonAffiliation(
  db: Surreal,
  input: PersonAffiliateInput,
): Promise<PersonAffiliateResult> {
  await ensurePersonSchema(db);
  const source = input.source || 'person-db-resolver';

  const person = input.person_uuid ? await fetchPersonByUuid(db, input.person_uuid) : null;
  if (input.person_uuid && !person) throw new Error(`person not found: ${input.person_uuid}`);

  const { org, created: org_created } = await resolveOrgRow(db, {
    action: input.org_action,
    org_slug: input.org_slug,
    name: input.org_name ?? '',
    client: input.client,
    source,
  });

  let affiliation_created = false;
  if (person) {
    const already = await db.query(
      `SELECT VALUE id FROM affiliations WHERE in = $person AND out = $org LIMIT 1;`,
      { person: person.id, org: org.id },
    );
    const hasEdge = !!(already?.[0] as unknown[])?.[0];
    if (!hasEdge) {
      await db.query(
        `RELATE $person->affiliations->$org SET
            kind = $role, client_access = [$client], added_at = time::now();`,
        { person: person.id, org: org.id, role: input.role ?? null, client: input.client },
      );
      affiliation_created = true;
      await createObservation(db, {
        subject: person.id,
        predicate: 'affiliated_with',
        object: org.id,
        source,
        client: input.client,
      });
    }
  }

  return { ok: true, org_id: String(org.id), org_slug: org.slug, org_created, affiliation_created };
}

// ---------------------------------------------------------------------------
// Capability: affiliation.rate — the write half of the Augment-from-
// Affiliations CSV round-trip (context-v/specs/Augment-From-Affiliations.md).
// Relevance lives on the affiliations RELATE edge itself, not on persons or
// organizations (both multi-tenant — a bare field there would leak one
// client's rating to any other client who can see the same row) and not a
// new opportunities-like table (opportunities is confirmed org-only and
// CSV-record-coupled — not a fit for an affiliation-driven origin).
//
// Looked up fresh by (person_uuid, org_slug) on every call — never trusts a
// RecordId surviving the CSV round-trip, same lesson as person_uuid's
// original introduction and domains.ts's source_uuid.
// ---------------------------------------------------------------------------

const RELEVANCE_LABELS: Record<string, string> = {
  'very relevant': 'very_relevant',
  'very_relevant': 'very_relevant',
  'highly relevant': 'highly_relevant',
  'highly_relevant': 'highly_relevant',
  'relevant': 'relevant',
  'skip': 'skip',
  'irrelevant': 'irrelevant',
};

// Exported so the reimport resolver (or anything else) can render the
// canonical label set without duplicating it — e.g. a column-mapping UI
// that wants to validate before ever calling the capability.
export const RELEVANCE_VALUES = Object.values(RELEVANCE_LABELS);

// Human-typed text in, canonical machine value out. Throws rather than
// guessing on anything that doesn't match one of the five labels
// case-insensitively — flagged to the operator, never silently coerced or
// dropped, per the spec's explicit discipline.
export function normalizeRelevance(raw: string): string {
  const key = raw.trim().toLowerCase();
  const v = RELEVANCE_LABELS[key];
  if (!v) {
    throw new Error(
      `unrecognized relevance value: "${raw}" — expected one of Very Relevant, Highly Relevant, Relevant, Skip, Irrelevant`,
    );
  }
  return v;
}

export type AffiliationRateInput = {
  person_uuid: string;
  org_slug: string;
  relevance: string; // raw, human-typed — normalized inside applyAffiliationRating
  relevance_note?: string | null;
  client: string;
  actor?: Actor;
};

export type AffiliationRateResult = {
  ok: true;
  affiliation_id: string;
  relevance: string;
};

export async function applyAffiliationRating(
  db: Surreal,
  input: AffiliationRateInput,
): Promise<AffiliationRateResult> {
  const relevance = normalizeRelevance(input.relevance);

  const person = await fetchPersonByUuid(db, input.person_uuid);
  if (!person) throw new Error(`person not found: ${input.person_uuid}`);
  const org = await db.query('SELECT VALUE id FROM organizations WHERE slug = $slug LIMIT 1;', {
    slug: input.org_slug,
  });
  const orgId = ((org?.[0] as unknown[]) ?? [])[0];
  if (!orgId) throw new Error(`organization not found: ${input.org_slug}`);

  const edge = await db.query(
    'SELECT VALUE id FROM affiliations WHERE in = $person AND out = $org LIMIT 1;',
    { person: person.id, org: orgId },
  );
  const edgeId = ((edge?.[0] as unknown[]) ?? [])[0];
  if (!edgeId) {
    throw new Error(
      `no affiliation edge between person_uuid ${input.person_uuid} and org_slug ${input.org_slug} — resolve the affiliation before rating it`,
    );
  }

  const sets = [
    'relevance = $relevance',
    'relevance_note = $relevance_note',
    'relevance_rated_at = time::now()',
    'client_access = array::union(client_access ?? [], [$client])',
  ];
  const vars: Record<string, unknown> = {
    id: edgeId,
    relevance,
    relevance_note: input.relevance_note?.trim() || null,
    client: input.client,
  };
  if (input.actor?.didi_id) {
    sets.push('relevance_rated_by = $rated_by');
    vars.rated_by = input.actor.didi_id;
  }
  await db.query(`UPDATE $id SET ${sets.join(', ')};`, vars);

  return { ok: true, affiliation_id: String(edgeId), relevance };
}

// ---------------------------------------------------------------------------
// Capability: affiliation.detail — the read half that makes the inline
// editor honest: shows the CURRENT persons/organizations link+corpus
// arrays and the current relevance, not a snapshot frozen at CSV-export
// time. Called whenever the operator navigates to a row. Per
// context-v/specs/Augment-From-Affiliations.md v0.2.0.0.
// ---------------------------------------------------------------------------

type PersonDetailRow = {
  id: unknown;
  person_uuid?: string | null;
  name?: string | null;
  personal_links?: ShapedLink[] | null;
  personal_corpus?: (ShapedLink & { content_id: unknown })[] | null;
};
type OrgDetailRow = {
  id: unknown;
  slug: string;
  complete_name?: string | null;
  org_links?: ShapedLink[] | null;
  org_corpus?: (ShapedLink & { content_id: unknown })[] | null;
};
type AffiliationEdgeRow = {
  kind?: string | null;
  relevance?: string | null;
  relevance_note?: string | null;
};

export type AffiliationDetailInput = { person_uuid: string; org_slug: string };
export type AffiliationDetailResult = {
  ok: true;
  person: {
    person_uuid: string;
    name: string | null;
    personal_links: ShapedLink[];
    personal_corpus: (ShapedLink & { content_id: unknown })[];
  };
  org: {
    org_slug: string;
    complete_name: string | null;
    org_links: ShapedLink[];
    org_corpus: (ShapedLink & { content_id: unknown })[];
  };
  kind: string | null;
  relevance: string | null;
  relevance_note: string | null;
};

export async function getAffiliationDetail(
  db: Surreal,
  input: AffiliationDetailInput,
): Promise<AffiliationDetailResult> {
  const personRes = await db.query(
    `SELECT id, person_uuid, name, personal_links, personal_corpus FROM persons WHERE person_uuid = $u LIMIT 1;`,
    { u: input.person_uuid },
  );
  const person = ((personRes?.[0] as PersonDetailRow[]) ?? [])[0];
  if (!person) throw new Error(`person not found: ${input.person_uuid}`);

  const orgRes = await db.query(
    `SELECT id, slug, complete_name, org_links, org_corpus FROM organizations WHERE slug = $slug LIMIT 1;`,
    { slug: input.org_slug },
  );
  const org = ((orgRes?.[0] as OrgDetailRow[]) ?? [])[0];
  if (!org) throw new Error(`organization not found: ${input.org_slug}`);

  const affRes = await db.query(
    `SELECT kind, relevance, relevance_note FROM affiliations WHERE in = $person AND out = $org LIMIT 1;`,
    { person: person.id, org: org.id },
  );
  const aff = ((affRes?.[0] as AffiliationEdgeRow[]) ?? [])[0] ?? {};

  return {
    ok: true,
    person: {
      person_uuid: input.person_uuid,
      name: person.name ?? null,
      personal_links: person.personal_links ?? [],
      personal_corpus: person.personal_corpus ?? [],
    },
    org: {
      org_slug: input.org_slug,
      complete_name: org.complete_name ?? null,
      org_links: org.org_links ?? [],
      org_corpus: org.org_corpus ?? [],
    },
    kind: aff.kind ?? null,
    relevance: aff.relevance ?? null,
    relevance_note: aff.relevance_note ?? null,
  };
}

// ---------------------------------------------------------------------------
// Capabilities: person.links.add / person.corpus.add — the person-side
// sibling of resolver.ts's organization.links.add / organization.corpus.add.
// Same narrow, single-entry shape; reuses shapeLink/findOrCreateContent
// rather than reimplementing them. Per
// context-v/specs/Augment-From-Affiliations.md v0.2.0.0.
// ---------------------------------------------------------------------------

export type PersonLinkAddInput = { person_uuid: string; url: string; kind?: string; client: string };
export type PersonLinkAddResult = { ok: true; person_uuid: string; link: ShapedLink };

export async function addPersonLink(db: Surreal, input: PersonLinkAddInput): Promise<PersonLinkAddResult> {
  const person = await fetchPersonByUuid(db, input.person_uuid);
  if (!person) throw new Error(`person not found: ${input.person_uuid}`);
  const shaped = shapeLink(input.kind ? { url: input.url, kind: input.kind } : input.url);
  if (!shaped) throw new Error('person.links.add requires a non-empty url');
  await db.query(
    `UPDATE $id SET
        personal_links  = array::concat(personal_links ?? [], [$link]),
        client_access   = array::union(client_access ?? [], [$client]),
        last_touched_by = $client, last_touched_at = time::now();`,
    { id: person.id, link: shaped, client: input.client },
  );
  return { ok: true, person_uuid: input.person_uuid, link: shaped };
}

export type PersonCorpusAddInput = { person_uuid: string; url: string; kind?: string; client: string };
export type PersonCorpusAddResult = {
  ok: true;
  person_uuid: string;
  entry: ShapedLink & { content_id: unknown };
};

export async function addPersonCorpus(
  db: Surreal,
  input: PersonCorpusAddInput,
): Promise<PersonCorpusAddResult> {
  const person = await fetchPersonByUuid(db, input.person_uuid);
  if (!person) throw new Error(`person not found: ${input.person_uuid}`);
  const shaped = shapeLink(input.kind ? { url: input.url, kind: input.kind } : input.url);
  if (!shaped) throw new Error('person.corpus.add requires a non-empty url');
  const content_id = await findOrCreateContent(db, shaped.url, shaped.kind, shaped.url_domain);
  const entry = { ...shaped, content_id };
  await db.query(
    `UPDATE $id SET
        personal_corpus = array::concat(personal_corpus ?? [], [$entry]),
        client_access   = array::union(client_access ?? [], [$client]),
        last_touched_by = $client, last_touched_at = time::now();`,
    { id: person.id, entry, client: input.client },
  );
  return { ok: true, person_uuid: input.person_uuid, entry };
}
