// Promote the active record set to a new canonical version. Wraps the
// workspace `record_set.promote` capability — the backend logic
// (promoteRecordSet in services/row-store/src/store.ts) already merges
// derivations and unions schemas, so all the user's hand-edits + accepted
// URLs carry forward into the new set.

import { workspace, type RecordSet } from '@augment-it/workspace';

export type PromoteResult = {
  record_set: RecordSet;
  rows_count: number;
};

export async function promoteRecordSet(
  source_record_set_id: string,
  name?: string,
): Promise<PromoteResult> {
  const reply = (await workspace.invoke('record_set.promote', {
    source_record_set_id,
    ...(name ? { name } : {}),
  })) as {
    record_set: RecordSet;
    rows: unknown[];
    archived: number;
  };
  return {
    record_set: reply.record_set,
    rows_count: reply.rows.length,
  };
}

// Suggest a name for the next version. If the source set's name ends in
// `_v4.csv` / `_v5.csv` / etc., bump it to the next number. Otherwise
// append a timestamp.
export function nextVersionName(currentName: string): string {
  const versionMatch = currentName.match(/^(.*)_v(\d+)(\.\w+)?$/);
  if (versionMatch) {
    const [, prefix, num, ext] = versionMatch;
    return `${prefix}_v${Number(num) + 1}${ext ?? ''}`;
  }
  const today = new Date().toISOString().slice(0, 10);
  return `${currentName} — promoted ${today}`;
}
