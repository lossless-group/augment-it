// Thin typed wrappers over workspace.invoke('person.*' | 'resolver.*'). The UI
// never talks to a database — these go WS → workspace-service → NATS →
// record-surrealdb-resolver. Org candidate-finding reuses the EXISTING
// resolver.candidates / resolver.search capabilities (record-db-resolver's
// backend) rather than reinventing org fuzzy-matching — see
// person-resolver.ts's header comment.

import { workspace } from '@augment-it/workspace';
import type {
  PersonNormRecord,
  PersonCandidate,
  PersonApplyResult,
  PersonAffiliateResult,
  PersonObservationRow,
  OrgCandidate,
  OrgSuggestion,
} from './types';

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

export async function searchPersons(q: string, client: string): Promise<PersonCandidate[]> {
  const r = (await workspace.invoke('person.search', { q, client })) as {
    ok: boolean;
    candidates?: PersonCandidate[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'person.search failed');
  return (r.candidates ?? []) as PersonCandidate[];
}

export async function applyPerson(args: {
  action: 'match' | 'create';
  person_uuid?: string;
  record: PersonNormRecord;
  client: string;
  source?: string;
}): Promise<PersonApplyResult> {
  const r = (await workspace.invoke('person.apply', args)) as PersonApplyResult;
  if (!r.ok) throw new Error(r.error || 'person.apply failed');
  return r;
}

export async function affiliatePerson(args: {
  // Optional — per the "independent decisions" design, an org can be
  // resolved with no person resolved at all. Passed when one happens to
  // already be resolved, to also RELATE the affiliation in the same call.
  person_uuid?: string;
  org_action: 'match' | 'create';
  org_slug?: string;
  org_name?: string;
  role?: string | null;
  client: string;
  source?: string;
}): Promise<PersonAffiliateResult> {
  const r = (await workspace.invoke('person.affiliate', args)) as PersonAffiliateResult;
  if (!r.ok) throw new Error(r.error || 'person.affiliate failed');
  return r;
}

export async function addPersonObservation(args: {
  person_uuid: string;
  predicate: string;
  value: string;
  client: string;
  source?: string;
}): Promise<void> {
  const r = (await workspace.invoke('person.add_observation', args)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error || 'person.add_observation failed');
}

export async function fetchPersonObservations(
  person_uuid: string,
  client: string,
): Promise<PersonObservationRow[]> {
  const r = (await workspace.invoke('person.observations', { person_uuid, client })) as {
    ok: boolean;
    observations?: PersonObservationRow[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'person.observations failed');
  return r.observations ?? [];
}

// Org side — reuses record-db-resolver's own capabilities, fed a synthetic
// {name: org_name} record. No url/socials, so append_preview will always be
// empty; that's fine, this app never shows or uses it.
export async function fetchOrgCandidates(org_name: string, client: string): Promise<OrgCandidate[]> {
  if (!org_name.trim()) return [];
  const r = (await workspace.invoke('resolver.candidates', {
    record: { name: org_name },
    client,
  })) as { ok: boolean; candidates?: OrgCandidate[]; error?: string };
  if (!r.ok) throw new Error(r.error || 'resolver.candidates failed');
  return r.candidates ?? [];
}

export async function searchOrgs(q: string, client: string): Promise<OrgSuggestion[]> {
  const r = (await workspace.invoke('resolver.search', { q, client })) as {
    ok: boolean;
    candidates?: OrgSuggestion[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'resolver.search failed');
  return r.candidates ?? [];
}
