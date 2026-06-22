// Thin typed wrappers over workspace.invoke('resolver.*'). The UI never talks
// to a database — these go WS → workspace-service → NATS → record-surrealdb-resolver.

import { workspace } from '@augment-it/workspace';
import type { Candidate, NormRecord, OrgSuggestion, ApplyResult } from './types';

export async function fetchCandidates(
  record: NormRecord,
  client: string,
): Promise<Candidate[]> {
  const r = (await workspace.invoke('resolver.candidates', { record, client })) as {
    ok: boolean;
    candidates?: Candidate[];
    error?: string;
  };
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

export async function applyResolution(args: {
  action: 'match' | 'create';
  org_slug?: string;
  record: NormRecord;
  client: string;
  source: string;
}): Promise<ApplyResult> {
  const r = (await workspace.invoke('resolver.apply', args)) as ApplyResult;
  if (!r.ok) throw new Error(r.error || 'resolver.apply failed');
  return r;
}
