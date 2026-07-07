// Thin typed wrapper over workspace.invoke('affiliation.rate'). The UI never
// talks to a database — this goes WS → workspace-service → NATS →
// record-surrealdb-resolver, same as every other resolver remote.

import { workspace } from '@augment-it/workspace';
import type { AffiliationRateResult } from './types';

export async function rateAffiliation(args: {
  person_uuid: string;
  org_slug: string;
  relevance: string;
  relevance_note?: string | null;
  client: string;
}): Promise<AffiliationRateResult> {
  const r = (await workspace.invoke('affiliation.rate', args)) as AffiliationRateResult;
  if (!r.ok) throw new Error(r.error || 'affiliation.rate failed');
  return r;
}
