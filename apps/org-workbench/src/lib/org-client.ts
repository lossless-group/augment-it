// Thin typed wrappers over workspace.invoke('...'). The UI never talks to a
// database — these go WS → workspace-service → NATS → record-surrealdb-
// resolver (spec decision D1: the remote is credential-free).
// Template: apps/record-db-resolver/src/lib/resolver-client.ts.

import { workspace } from '@augment-it/workspace';
import type {
  OrgSuggestion,
  OrgDetail,
  AffiliatedPerson,
  ShapedLink,
  PersonCandidate,
  PersonNormRecord,
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

export async function addOrgStream(args: AddArgs): Promise<ShapedLink> {
  const r = (await workspace.invoke('organization.streams.add', args)) as {
    ok: boolean;
    stream?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.stream) throw new Error(r.error || 'organization.streams.add failed');
  return r.stream;
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
  org_slug: string;
  role?: string | null;
  client: string;
  source?: string;
}): Promise<void> {
  const r = (await workspace.invoke('person.affiliate', {
    person_uuid: args.person_uuid,
    org_action: 'match',
    org_slug: args.org_slug,
    role: args.role ?? null,
    client: args.client,
    source: args.source ?? 'org-workbench',
  })) as { ok: boolean; affiliation_created?: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || 'person.affiliate failed');
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
