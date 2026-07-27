// Thin typed wrappers over workspace.invoke('...'). The UI never talks to a
// database — these go WS → workspace-service → NATS → record-surrealdb-
// resolver (spec decision D1: the remote is credential-free).
// Template: apps/record-db-resolver/src/lib/resolver-client.ts.

import { workspace } from '@augment-it/workspace';
import type {
  OrgSuggestion,
  OrgDetail,
  OrgCandidate,
  OrgRosterRow,
  AffiliatedPerson,
  ShapedLink,
  PersonCandidate,
  PersonNormRecord,
  OrgRelations,
  OrgRelKind,
} from './types';

export async function searchOrgs(q: string, client: string): Promise<OrgSuggestion[]> {
  const r = (await workspace.invoke('resolver.search', { q, client })) as {
    ok: boolean;
    candidates?: OrgSuggestion[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'resolver.search failed');
  return r.candidates ?? [];
}

// The relevance brief — per-workspace standing intent didi crawls load.
export async function fetchBrief(
  client: string,
): Promise<{ brief: string | null; updated_at: string | null }> {
  const r = (await workspace.invoke('client.brief.get', { client })) as {
    ok: boolean;
    brief?: string | null;
    updated_at?: string | null;
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'client.brief.get failed');
  return { brief: r.brief ?? null, updated_at: r.updated_at ?? null };
}

export async function saveBrief(client: string, brief: string): Promise<void> {
  const r = (await workspace.invoke('client.brief.set', { client, brief })) as {
    ok: boolean;
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'client.brief.set failed');
}

// didi's crawls no longer dispatch from here — the 🤖 doors enqueue via
// search.submit (lib/search-queue.ts) and staging + accept live in the
// search-results rail, per the Search-Results-Queue-Remote spec.

// The coverage roster — every org this client can see, with counts, fewest
// corpus first.
export async function fetchOrgRoster(client: string): Promise<OrgRosterRow[]> {
  const r = (await workspace.invoke('organization.roster', { client })) as {
    ok: boolean;
    orgs?: OrgRosterRow[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'organization.roster failed');
  return r.orgs ?? [];
}

// Scored candidates for the create gate — every signal the resolver knows
// (slug/domain/fuzzy name), unlike searchOrgs's lighter name-contains.
export async function fetchOrgCandidates(
  record: { name: string; url?: string; domains?: string[] },
  client: string,
): Promise<OrgCandidate[]> {
  const r = (await workspace.invoke('resolver.candidates', { record, client })) as {
    ok: boolean;
    candidates?: OrgCandidate[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'resolver.candidates failed');
  return r.candidates ?? [];
}

// Org-only create — person.affiliate with NO person_uuid is the documented
// "independent decisions" path: resolves (here: creates) the org, no edge,
// no observation. Seeds domains[] from org_domain so the new org is
// domain-matchable from birth.
export async function createOrg(args: {
  org_name: string;
  org_domain?: string;
  client: string;
  source?: string;
}): Promise<{ org_slug: string; org_created: boolean }> {
  const r = (await workspace.invoke('person.affiliate', {
    org_action: 'create',
    org_name: args.org_name,
    org_domain: args.org_domain,
    client: args.client,
    source: args.source ?? 'org-workbench',
  })) as { ok: boolean; org_slug?: string; org_created?: boolean; error?: string };
  if (!r.ok || !r.org_slug) throw new Error(r.error || 'org create failed');
  return { org_slug: r.org_slug, org_created: r.org_created ?? false };
}

export async function fetchOrgDetail(org_slug: string, client: string): Promise<OrgDetail> {
  const r = (await workspace.invoke('organization.detail', { org_slug, client })) as {
    ok: boolean;
    org?: OrgDetail;
    error?: string;
  };
  if (!r.ok || !r.org) throw new Error(r.error || 'organization.detail failed');
  return r.org;
}

export async function fetchOrgAffiliations(
  org_slug: string,
  client: string,
): Promise<AffiliatedPerson[]> {
  const r = (await workspace.invoke('organization.affiliations', { org_slug, client })) as {
    ok: boolean;
    people?: AffiliatedPerson[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'organization.affiliations failed');
  return r.people ?? [];
}

type AddArgs = { org_slug: string; url: string; kind?: string; client: string };

export async function addOrgLink(args: AddArgs): Promise<ShapedLink> {
  const r = (await workspace.invoke('organization.links.add', args)) as {
    ok: boolean;
    link?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.link) throw new Error(r.error || 'organization.links.add failed');
  return r.link;
}

export async function addOrgStream(args: AddArgs & { name?: string }): Promise<ShapedLink> {
  const r = (await workspace.invoke('organization.streams.add', args)) as {
    ok: boolean;
    stream?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.stream) throw new Error(r.error || 'organization.streams.add failed');
  return r.stream;
}

// Patch url/kind/name on one media_streams entry, matched by exact URL — the
// first non-additive write on an entity list (updateOrg precedent).
export async function updateOrgStream(args: {
  org_slug: string;
  url: string;
  new_url?: string;
  kind?: string;
  name?: string;
  client: string;
}): Promise<ShapedLink> {
  const r = (await workspace.invoke('organization.streams.update', args)) as {
    ok: boolean;
    stream?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.stream) throw new Error(r.error || 'organization.streams.update failed');
  return r.stream;
}

// ---- Entry ops — the correction half of view-and-edit-in-place. Update
// patches url/kind matched by current URL; remove detaches the entry (an
// entry_removed observation keeps the trail server-side). Per
// context-v/specs/Entity-Card-Edit-And-Remove-Affordances.md.

type EntryUpdateArgs = { org_slug: string; url: string; new_url?: string; kind?: string; client: string };
type EntryRemoveArgs = { org_slug: string; url: string; client: string };

async function entryOp(verb: string, args: EntryUpdateArgs | EntryRemoveArgs): Promise<void> {
  const r = (await workspace.invoke(verb, args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || `${verb} failed`);
}

export const updateOrgLink = (args: EntryUpdateArgs) => entryOp('organization.links.update', args);
export const removeOrgLink = (args: EntryRemoveArgs) => entryOp('organization.links.remove', args);
export const removeOrgStream = (args: EntryRemoveArgs) => entryOp('organization.streams.remove', args);
export const updateOrgCorpus = (args: EntryUpdateArgs) => entryOp('organization.corpus.update', args);
export const removeOrgCorpus = (args: EntryRemoveArgs) => entryOp('organization.corpus.remove', args);

// Identity-block edits — names, aliases, domains — ride resolver.update_org
// (it already owns the identity fields; aliases/domains are full-array
// replacements for the chip editors).
export async function updateOrgIdentity(args: {
  org_slug: string;
  complete_name?: string;
  conventional_name?: string;
  aliases?: string[];
  domains?: { domain?: string }[];
  client: string;
}): Promise<void> {
  const r = (await workspace.invoke('resolver.update_org', args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || 'resolver.update_org failed');
}

// Distinct corpus kinds across the client's orgs — feeds the kind input's
// datalist so vocabulary converges without being enforced (gh #57).
export async function fetchCorpusKinds(client: string): Promise<string[]> {
  const r = (await workspace.invoke('organization.corpus.kinds', { client })) as {
    ok: boolean;
    kinds?: string[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'organization.corpus.kinds failed');
  return r.kinds ?? [];
}

export async function addOrgCorpus(args: AddArgs): Promise<ShapedLink> {
  const r = (await workspace.invoke('organization.corpus.add', args)) as {
    ok: boolean;
    entry?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.entry) throw new Error(r.error || 'organization.corpus.add failed');
  return r.entry;
}

// ---- Phase 4: add-person with automatic affiliation ------------------------
// person.candidates → operator gate → person.apply → person.affiliate with
// the org pre-bound. The affiliation edge + its paired observation come from
// person.affiliate — callable again later for the same person against other
// orgs (N-affiliation assumption).

export async function fetchPersonCandidates(
  record: PersonNormRecord,
  client: string,
): Promise<PersonCandidate[]> {
  const r = (await workspace.invoke('person.candidates', { record, client })) as {
    ok: boolean;
    candidates?: PersonCandidate[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'person.candidates failed');
  return r.candidates ?? [];
}

export async function applyPerson(args: {
  action: 'match' | 'create';
  person_uuid?: string;
  record: PersonNormRecord;
  client: string;
  source?: string;
}): Promise<{ person_uuid: string; created: boolean; name: string | null }> {
  const r = (await workspace.invoke('person.apply', args)) as {
    ok: boolean;
    person_uuid?: string;
    created?: boolean;
    name?: string | null;
    error?: string;
  };
  if (!r.ok || !r.person_uuid) throw new Error(r.error || 'person.apply failed');
  return { person_uuid: r.person_uuid, created: r.created ?? false, name: r.name ?? null };
}

export async function affiliatePerson(args: {
  person_uuid: string;
  // Defaults to 'match' — AddPersonInline's org-pre-bound path. The bio-page
  // promotion path (AddAffiliationInline) resolves the org side: 'create'
  // takes org_name + org_domain (seeded into domains[] so the new org is
  // reachable by D4 domain matching).
  org_action?: 'match' | 'create';
  org_slug?: string;
  org_name?: string;
  org_domain?: string;
  role?: string | null;
  client: string;
  source?: string;
}): Promise<{ org_slug: string; org_created: boolean; affiliation_created: boolean }> {
  const r = (await workspace.invoke('person.affiliate', {
    person_uuid: args.person_uuid,
    org_action: args.org_action ?? 'match',
    org_slug: args.org_slug,
    org_name: args.org_name,
    org_domain: args.org_domain,
    role: args.role ?? null,
    client: args.client,
    source: args.source ?? 'org-workbench',
  })) as {
    ok: boolean;
    org_slug?: string;
    org_created?: boolean;
    affiliation_created?: boolean;
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'person.affiliate failed');
  return {
    org_slug: r.org_slug ?? args.org_slug ?? '',
    org_created: r.org_created ?? false,
    affiliation_created: r.affiliation_created ?? false,
  };
}

type PersonAddArgs = { person_uuid: string; url: string; kind?: string; client: string };

export async function addPersonLink(args: PersonAddArgs): Promise<ShapedLink> {
  const r = (await workspace.invoke('person.links.add', args)) as {
    ok: boolean;
    link?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.link) throw new Error(r.error || 'person.links.add failed');
  return r.link;
}

export async function addPersonCorpus(args: PersonAddArgs): Promise<ShapedLink> {
  const r = (await workspace.invoke('person.corpus.add', args)) as {
    ok: boolean;
    entry?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.entry) throw new Error(r.error || 'person.corpus.add failed');
  return r.entry;
}

// Person-side entry removes — the twins of the org entry ops above.
type PersonRemoveArgs = { person_uuid: string; url: string; client: string };

async function personEntryOp(verb: string, args: PersonRemoveArgs): Promise<void> {
  const r = (await workspace.invoke(verb, args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || `${verb} failed`);
}

export const removePersonLink = (args: PersonRemoveArgs) => personEntryOp('person.links.remove', args);
export const removePersonCorpus = (args: PersonRemoveArgs) => personEntryOp('person.corpus.remove', args);

// ---- Org↔org relations — parent/child/peer edges in the affiliations table,
// spoken relative to the focused org (the server normalizes direction). Per
// context-v/plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags.md.

export async function fetchOrgRelations(org_slug: string, client: string): Promise<OrgRelations> {
  const r = (await workspace.invoke('organization.relations', { org_slug, client })) as {
    ok: boolean;
    parents?: OrgRelations['parents'];
    children?: OrgRelations['children'];
    peers?: OrgRelations['peers'];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'organization.relations failed');
  return { parents: r.parents ?? [], children: r.children ?? [], peers: r.peers ?? [] };
}

export async function relateOrg(args: {
  org_slug: string;
  other_slug: string;
  rel: OrgRelKind;
  kind?: string | null;
  description?: string | null;
  client: string;
}): Promise<{ created: boolean }> {
  const r = (await workspace.invoke('organization.relate', args)) as {
    ok: boolean;
    created?: boolean;
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'organization.relate failed');
  return { created: r.created ?? false };
}

export async function unrelateOrg(args: {
  org_slug: string;
  other_slug: string;
  client: string;
}): Promise<void> {
  const r = (await workspace.invoke('organization.unrelate', args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || 'organization.unrelate failed');
}

export async function patchOrgRelation(args: {
  org_slug: string;
  other_slug: string;
  rel?: OrgRelKind;
  kind?: string | null;
  description?: string | null;
  client: string;
}): Promise<void> {
  const r = (await workspace.invoke('organization.relation.update', args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || 'organization.relation.update failed');
}

// ---- Org tags — has_tag observations per client; vocabulary rides the
// existing tag_vocab via tag.suggest (shared with source tags on purpose).

export async function addOrgTag(args: { org_slug: string; tag: string; client: string }): Promise<string> {
  const r = (await workspace.invoke('organization.tag.add', args)) as {
    ok: boolean;
    tag?: string;
    error?: string;
  };
  if (!r.ok || !r.tag) throw new Error(r.error || 'organization.tag.add failed');
  return r.tag;
}

export async function removeOrgTag(args: { org_slug: string; tag: string; client: string }): Promise<void> {
  const r = (await workspace.invoke('organization.tag.remove', args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || 'organization.tag.remove failed');
}

export async function suggestTags(client: string, prefix?: string): Promise<string[]> {
  const r = (await workspace.invoke('tag.suggest', { client_slug: client, prefix })) as {
    ok: boolean;
    tags?: string[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'tag.suggest failed');
  return r.tags ?? [];
}

// Detach a person from one org — the inverse of affiliatePerson. Edge-only:
// person, org, and observation history all stay.
export async function unaffiliatePerson(args: {
  person_uuid: string;
  org_slug: string;
  client: string;
}): Promise<void> {
  const r = (await workspace.invoke('person.unaffiliate', args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || 'person.unaffiliate failed');
}
