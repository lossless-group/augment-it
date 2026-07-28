// Org↔org relations + org tags — the parent/child/peer model from
// context-v/plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags.md, closing
// context-v/issues/Parent-Child-Nested-Organizations-Not-Modeled.md.
//
// Relations are org→org edges in the SAME `affiliations` RELATE table the
// person→org edges live in (the operator ruling: the relationship IS an
// affiliation). Every org→org edge carries an explicit discriminator
// `edge_type: 'org_org'` — relation reads filter on it, and the person-side
// reads stay safe because they already filter on `in.person_uuid`.
//
// Canonical direction: `in` = child, `out` = parent (same "smaller party
// points at larger" grain as person→org). Stored rel is 'child_of' or
// 'peer'. The parent/child/peer trichotomy the operator sees is a read-time
// projection; the wire verbs speak relative to the focused org and the
// handlers normalize, so operators never think about edge direction.
//
// Org tags are `has_tag` observations (subject = org RecordId), NOT fields
// on the shared org row — same multi-tenant rationale that put relevance on
// the affiliation edge (person-resolver.ts). Vocabulary rides the existing
// per-client tag_vocab table via domains.ts helpers.

import type { Surreal } from 'surrealdb';
import { type NatsConnection } from '@nats-io/transport-node';
import { getDb } from './surreal';
import { toDashed, ensureTagInVocab } from './domains';

export type OrgRelKind = 'parent' | 'child' | 'peer';

// --- shared helpers ---------------------------------------------------------

async function resolveOrgId(
  db: Surreal,
  slug: string,
  client: string,
): Promise<unknown> {
  const res = await db.query(
    'SELECT VALUE id FROM organizations WHERE slug = $slug AND client_access CONTAINS $client LIMIT 1;',
    { slug, client },
  );
  const id = (res?.[0] as unknown[])?.[0];
  if (!id) throw new Error(`organization not found: ${slug}`);
  return id;
}

// Same shape as person-resolver.ts's createObservation — duplicated locally
// per this service's precedent (Actor in person-resolver.ts) rather than
// exported across modules.
async function observe(
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

type PairEdge = {
  id: unknown;
  in: unknown;
  out: unknown;
  rel: string;
  kind?: string | null;
  description?: string | null;
  client_access?: string[];
};

// The one-relation-per-org-pair invariant: look the pair up in BOTH
// directions. No client filter here — dedup is about the edge existing at
// all; visibility is the reads' concern.
async function findPairEdge(db: Surreal, a: unknown, b: unknown): Promise<PairEdge | null> {
  const res = await db.query(
    `SELECT id, in, out, rel, kind, description, client_access FROM affiliations
       WHERE edge_type = 'org_org'
         AND ((in = $a AND out = $b) OR (in = $b AND out = $a))
       LIMIT 1;`,
    { a, b },
  );
  return ((res?.[0] as PairEdge[]) ?? [])[0] ?? null;
}

// --- organization.relate -----------------------------------------------------

export type OrgRelateInput = {
  org_slug: string;   // the focused org — rel is relative to it
  other_slug: string;
  rel: OrgRelKind;    // 'parent' = other is parent of focused
  kind?: string | null;        // open vocabulary: initiative_of, fund_of, funds, …
  description?: string | null; // free-text human context
  client: string;
  source?: string;
};

export type OrgRelateResult = { ok: true; created: boolean; rel: OrgRelKind };

export async function relateOrgs(db: Surreal, input: OrgRelateInput): Promise<OrgRelateResult> {
  if (input.org_slug === input.other_slug) {
    throw new Error('an organization cannot relate to itself');
  }
  const source = input.source || 'org-workbench';
  const focused = await resolveOrgId(db, input.org_slug, input.client);
  const other = await resolveOrgId(db, input.other_slug, input.client);

  const existing = await findPairEdge(db, focused, other);
  if (existing) {
    // house precedent (person.affiliate): existing edge is not an error —
    // union visibility, report created:false, let the surface say "already
    // related".
    await db.query(
      'UPDATE $id SET client_access = array::union(client_access ?? [], [$client]);',
      { id: existing.id, client: input.client },
    );
    return { ok: true, created: false, rel: projectRel(existing, focused) };
  }

  // Normalize to canonical direction: in = child, out = parent. For peers
  // direction is meaningless — focused→other as written, reads scan both ways.
  const child = input.rel === 'child' ? other : focused;
  const parent = input.rel === 'child' ? focused : other;
  const rel = input.rel === 'peer' ? 'peer' : 'child_of';
  await db.query(
    `RELATE $child->affiliations->$parent SET
        edge_type = 'org_org', rel = $rel, kind = $kind, description = $description,
        client_access = [$client], added_at = time::now();`,
    {
      child,
      parent,
      rel,
      kind: input.kind ?? null,
      description: input.description ?? null,
      client: input.client,
    },
  );
  await observe(db, {
    subject: child,
    predicate: 'related_to',
    object: parent,
    source,
    client: input.client,
  });
  return { ok: true, created: true, rel: input.rel };
}

// From an edge + the focused org's id, name the relation the way the
// operator sees it: inbound child_of = a child; outbound child_of = a
// parent; peer either way = peer.
function projectRel(edge: PairEdge, focused: unknown): OrgRelKind {
  if (edge.rel === 'peer') return 'peer';
  return String(edge.in) === String(focused) ? 'parent' : 'child';
}

// --- organization.relations ---------------------------------------------------

export type RelatedOrg = {
  slug: string;
  display_name: string;
  rel: OrgRelKind;
  kind: string | null;
  description: string | null;
};

export type OrgRelationsResult = {
  ok: true;
  parents: RelatedOrg[];
  children: RelatedOrg[];
  peers: RelatedOrg[];
};

type RelRow = Record<string, unknown>;

function shapeRelated(
  r: RelRow,
  prefix: 'in' | 'out',
  rel: OrgRelKind,
): RelatedOrg | null {
  const slug = r[`${prefix}_slug`];
  if (!slug) return null; // edge whose org was deleted → skip
  const display =
    (r[`${prefix}_complete_name`] as string) ??
    (r[`${prefix}_conventional_name`] as string) ??
    String(slug);
  return {
    slug: String(slug),
    display_name: display,
    rel,
    kind: (r.kind as string) ?? null,
    description: (r.description as string) ?? null,
  };
}

export async function listOrgRelations(
  db: Surreal,
  input: { org_slug: string; client: string },
): Promise<OrgRelationsResult> {
  const org = await resolveOrgId(db, input.org_slug, input.client);
  const res = await db.query(
    `SELECT rel, kind, description,
            in.slug AS in_slug, in.complete_name AS in_complete_name,
            in.conventional_name AS in_conventional_name,
            out.slug AS out_slug, out.complete_name AS out_complete_name,
            out.conventional_name AS out_conventional_name
       FROM affiliations
       WHERE edge_type = 'org_org'
         AND client_access CONTAINS $client
         AND (in = $org OR out = $org);`,
    { org, client: input.client },
  );
  const rows = (res?.[0] as RelRow[]) ?? [];
  const parents: RelatedOrg[] = [];
  const children: RelatedOrg[] = [];
  const peers: RelatedOrg[] = [];
  for (const r of rows) {
    const focusedIsIn = String(r.in_slug) === input.org_slug;
    if (r.rel === 'peer') {
      const shaped = shapeRelated(r, focusedIsIn ? 'out' : 'in', 'peer');
      if (shaped) peers.push(shaped);
    } else if (focusedIsIn) {
      const shaped = shapeRelated(r, 'out', 'parent'); // focused is the child
      if (shaped) parents.push(shaped);
    } else {
      const shaped = shapeRelated(r, 'in', 'child');
      if (shaped) children.push(shaped);
    }
  }
  return { ok: true, parents, children, peers };
}

// --- organization.unrelate -----------------------------------------------------

export async function unrelateOrgs(
  db: Surreal,
  input: { org_slug: string; other_slug: string; client: string; source?: string },
): Promise<{ ok: true; removed: number }> {
  const focused = await resolveOrgId(db, input.org_slug, input.client);
  const other = await resolveOrgId(db, input.other_slug, input.client);
  const existing = await findPairEdge(db, focused, other);
  if (!existing) return { ok: true, removed: 0 };
  await db.query('DELETE $id;', { id: existing.id });
  await observe(db, {
    subject: focused,
    predicate: 'relation_removed',
    object: input.other_slug,
    source: input.source || 'org-workbench',
    client: input.client,
  });
  return { ok: true, removed: 1 };
}

// --- organization.relation.update ----------------------------------------------

export type OrgRelationUpdateInput = {
  org_slug: string;
  other_slug: string;
  rel?: OrgRelKind;
  kind?: string | null;
  description?: string | null;
  client: string;
};

export async function updateOrgRelation(
  db: Surreal,
  input: OrgRelationUpdateInput,
): Promise<{ ok: true; rel: OrgRelKind }> {
  const focused = await resolveOrgId(db, input.org_slug, input.client);
  const other = await resolveOrgId(db, input.other_slug, input.client);
  const edge = await findPairEdge(db, focused, other);
  if (!edge) throw new Error(`relation not found: ${input.org_slug} ↔ ${input.other_slug}`);

  const currentRel = projectRel(edge, focused);
  const nextRel = input.rel ?? currentRel;
  const kind = input.kind !== undefined ? input.kind : (edge.kind ?? null);
  const description =
    input.description !== undefined ? input.description : (edge.description ?? null);

  // A parent↔child flip (or hierarchy↔peer change) re-normalizes the edge
  // direction — RELATE edges can't swap in/out in place, so delete + relate.
  const wantIn = nextRel === 'child' ? other : focused;
  const wantOut = nextRel === 'child' ? focused : other;
  const wantStoredRel = nextRel === 'peer' ? 'peer' : 'child_of';
  const directionChanges =
    String(edge.in) !== String(wantIn) || String(edge.out) !== String(wantOut);

  if (directionChanges || wantStoredRel !== edge.rel) {
    // $access is a protected SurrealDB variable — bind under another name.
    // New edge first, old edge second: if the RELATE fails, the relation
    // survives instead of vanishing.
    const carried = Array.from(new Set([...(edge.client_access ?? []), input.client]));
    await db.query(
      `RELATE $child->affiliations->$parent SET
          edge_type = 'org_org', rel = $rel, kind = $kind, description = $description,
          client_access = $carried, added_at = time::now();`,
      { child: wantIn, parent: wantOut, rel: wantStoredRel, kind, description, carried },
    );
    await db.query('DELETE $id;', { id: edge.id });
  } else {
    await db.query('UPDATE $id SET kind = $kind, description = $description;', {
      id: edge.id,
      kind,
      description,
    });
  }
  return { ok: true, rel: nextRel };
}

// --- org tags: organization.tag.add / organization.tag.remove -------------------
// One has_tag observation per tag per client. toDashed enforces
// dashes-not-spaces but preserves the operator's casing (house rule: the
// user owns the casing; the Train-Case convention lives in the vocabulary
// and the datalist, not in a forced normalizer).

export type OrgTagInput = { org_slug: string; tag: string; client: string; source?: string };

export async function addOrgTag(
  db: Surreal,
  input: OrgTagInput,
): Promise<{ ok: true; tag: string; created: boolean }> {
  const tag = toDashed(input.tag);
  if (!tag) throw new Error('organization.tag.add requires a non-empty tag');
  const org = await resolveOrgId(db, input.org_slug, input.client);
  const existing = await db.query(
    `SELECT VALUE id FROM observations
       WHERE subject = $org AND predicate = 'has_tag' AND object = $tag AND client = $client
       LIMIT 1;`,
    { org, tag, client: input.client },
  );
  const already = !!(existing?.[0] as unknown[])?.[0];
  if (!already) {
    await observe(db, {
      subject: org,
      predicate: 'has_tag',
      object: tag,
      source: input.source || 'org-workbench',
      client: input.client,
    });
  }
  await ensureTagInVocab(db, input.client, tag);
  return { ok: true, tag, created: !already };
}

export async function removeOrgTag(
  db: Surreal,
  input: OrgTagInput,
): Promise<{ ok: true; removed: boolean }> {
  const tag = toDashed(input.tag);
  const org = await resolveOrgId(db, input.org_slug, input.client);
  const existing = await db.query(
    `SELECT VALUE id FROM observations
       WHERE subject = $org AND predicate = 'has_tag' AND object = $tag AND client = $client;`,
    { org, tag, client: input.client },
  );
  const ids = (existing?.[0] as unknown[]) ?? [];
  if (ids.length > 0) {
    await db.query(
      `DELETE observations
         WHERE subject = $org AND predicate = 'has_tag' AND object = $tag AND client = $client;`,
      { org, tag, client: input.client },
    );
  }
  return { ok: true, removed: ids.length > 0 };
}

// --- organization.add_observation ------------------------------------------
// person.add_observation's twin (gh #60): a free-form observation with an
// ORG as subject. First consumer: the team-crawl search_synopsis (didi's
// account of who the policy excluded), written once when the operator
// first accepts from a card — the crawl itself still never writes.

export type OrgAddObservationInput = {
  org_slug: string;
  predicate: string;
  value: string;
  client: string;
  source?: string;
};

export async function addOrgObservation(
  db: Surreal,
  input: OrgAddObservationInput,
): Promise<{ ok: true }> {
  const org = await resolveOrgId(db, input.org_slug, input.client);
  const predicate = input.predicate.trim();
  const value = input.value.trim();
  if (!predicate || !value) {
    throw new Error('organization.add_observation requires both predicate and value');
  }
  await observe(db, {
    subject: org,
    predicate,
    object: value,
    source: input.source || 'org-workbench',
    client: input.client,
  });
  return { ok: true };
}

// Read helper for getOrgDetail's tags extension — takes the already-resolved
// org RecordId so detail doesn't resolve the slug twice.
export async function listOrgTagsById(
  db: Surreal,
  orgId: unknown,
  client: string,
): Promise<string[]> {
  const res = await db.query(
    `SELECT object, observed_at FROM observations
       WHERE subject = $org AND predicate = 'has_tag' AND client = $client
       ORDER BY observed_at ASC;`,
    { org: orgId, client },
  );
  const rows = (res?.[0] as { object?: unknown }[]) ?? [];
  return rows.map((r) => String(r.object ?? '')).filter(Boolean);
}

// --- NATS handler registration ---------------------------------------------
// Same compact handle() shape as domains.ts.

export function registerOrgRelationHandlers(nc: NatsConnection): void {
  const handle = <T>(subject: string, fn: (db: Surreal, args: T) => Promise<unknown>): void => {
    void (async () => {
      const sub = nc.subscribe(subject);
      for await (const msg of sub) {
        const args = msg.json() as T;
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
  };

  handle<OrgRelateInput>('organization.relate.requested', relateOrgs);
  handle<{ org_slug: string; client: string }>('organization.relations.requested', listOrgRelations);
  handle<{ org_slug: string; other_slug: string; client: string; source?: string }>(
    'organization.unrelate.requested',
    unrelateOrgs,
  );
  handle<OrgRelationUpdateInput>('organization.relation.update.requested', updateOrgRelation);
  handle<OrgTagInput>('organization.tag.add.requested', addOrgTag);
  handle<OrgTagInput>('organization.tag.remove.requested', removeOrgTag);
  handle<OrgAddObservationInput>('organization.add_observation.requested', addOrgObservation);
}
