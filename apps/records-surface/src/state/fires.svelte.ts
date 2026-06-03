// Per-row fire state — keyed by row_id, tracks current fire + last result.

import type { ConnectorId, FireResult, FireState } from '../types';

class FiresStore {
  // row_id → state for the most recent fire on that row
  byRowId = $state<Record<string, FireState>>({});

  setFiring(row_id: string, connector_id: ConnectorId) {
    this.byRowId = { ...this.byRowId, [row_id]: { kind: 'firing', connector_id } };
  }

  setDone(row_id: string, result: FireResult) {
    this.byRowId = { ...this.byRowId, [row_id]: { kind: 'done', result } };
  }

  reset(row_id: string) {
    const next = { ...this.byRowId };
    delete next[row_id];
    this.byRowId = next;
  }

  get(row_id: string): FireState {
    return this.byRowId[row_id] ?? { kind: 'idle' };
  }
}

export const fires = new FiresStore();
