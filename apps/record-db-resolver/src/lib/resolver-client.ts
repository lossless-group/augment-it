// Thin typed wrappers over workspace.invoke('resolver.*'). The UI never talks
// to a database — these go WS → workspace-service → NATS → record-surrealdb-resolver.

import { workspace } from '@augment-it/workspace';
import type {
  Candidate,
  NormRecord,
  OrgSuggestion,
  ApplyResult,
  UpdateOrgInput,
  UpdateOrgResult,
  OpportunitySummary,
} from './types';

// The bond fields stamped onto the source row after a canonical write. The id is
// the durable link (id-as-bond); slug + name ride along for display/export and
// get refreshed on a canonical rename. See the v0.0.0.2 decisions in
// context-v/issues/Grilling-on-DB-Resolver--Future-Versions.md.
export type RowStamp = {
  resolved_org_id: string;
  resolved_org_slug: string;
  resolved_org_name: string | null;
  resolved_at: string;
};

export async function stampRow(row_id: string, stamp: RowStamp): Promise<void> {
  await workspace.invoke('row.update', { row_id, fields: stamp });
}

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
  row_id?: string;
  // v0.0.0.3 — auto-mint the opportunity. record_uuid is the 1:1 key; crm is the
  // pipeline snapshot that lands on the opportunity (not the shared org).
  record_uuid?: string;
  record_set_id?: string;
  crm?: Record<string, unknown>;
}): Promise<ApplyResult> {
  const { row_id, ...applyArgs } = args;
  const r = (await workspace.invoke('resolver.apply', applyArgs)) as ApplyResult;
  if (!r.ok) throw new Error(r.error || 'resolver.apply failed');

  // Round-trip write-back (#1, locked): stamp the bond onto the source row so the
  // match survives a crash / incomplete session and can export back to the CSV.
  // The canonical write already succeeded; a stamp failure is non-fatal because a
  // re-apply is idempotent (additive dedup) and will re-stamp.
  r.stamped = false;
  if (row_id) {
    try {
      await stampRow(row_id, {
        resolved_org_id: r.org_id,
        resolved_org_slug: r.slug,
        resolved_org_name: r.complete_name ?? null,
        resolved_at: new Date().toISOString(),
      });
      r.stamped = true;
    } catch {
      r.stamped = false;
    }
  }
  return r;
}

export async function updateOrg(args: UpdateOrgInput): Promise<UpdateOrgResult> {
  const r = (await workspace.invoke('resolver.update_org', args)) as UpdateOrgResult;
  if (!r.ok) throw new Error(r.error || 'resolver.update_org failed');
  return r;
}

export async function opportunitiesForOrg(
  org_slug: string,
  client: string,
): Promise<OpportunitySummary[]> {
  const r = (await workspace.invoke('resolver.opportunities_for_org', { org_slug, client })) as {
    ok: boolean;
    opportunities?: OpportunitySummary[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'resolver.opportunities_for_org failed');
  return r.opportunities ?? [];
}
