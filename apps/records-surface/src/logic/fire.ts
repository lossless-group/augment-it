// Fires one connector on one row. Pure orchestration — calls the workspace,
// updates the fires store, surfaces errors.

import { workspace } from '@augment-it/workspace';
import { fires } from '../state/fires.svelte';
import type { ConnectorId, FireResult } from '../types';

export async function fireConnector(
  row_id: string,
  row_url: string,
  connector_id: ConnectorId,
): Promise<void> {
  fires.setFiring(row_id, connector_id);
  try {
    const reply = (await workspace.invoke('connector.fire', {
      row_id,
      row_url,
      connector_id,
    })) as { result: FireResult };
    fires.setDone(row_id, reply.result);
  } catch (err) {
    fires.setDone(row_id, {
      connector_id,
      candidates: [],
      fired_at: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
