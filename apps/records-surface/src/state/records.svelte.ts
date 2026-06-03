// Records store — reads the active record set, lists its rows.

import { workspace, type Row, type RecordSet } from '@augment-it/workspace';
import { promoteRecordSet, nextVersionName } from '../logic/promote';

const ACTIVE_RECORD_SET_KEY = 'augment-it:active-record-set';

class RecordsStore {
  recordSets = $state<RecordSet[]>([]);
  activeRecordSetId = $state<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_RECORD_SET_KEY) : null,
  );
  rows = $state<Row[]>([]);
  loading = $state<boolean>(false);
  error = $state<string | null>(null);

  async loadRecordSets() {
    try {
      const r = (await workspace.invoke('record_set.list', {})) as { record_sets: RecordSet[] };
      this.recordSets = r.record_sets.filter((rs) => !rs.archived);
      if (!this.activeRecordSetId && this.recordSets[0]) {
        await this.selectRecordSet(this.recordSets[0].record_set_id);
      } else if (this.activeRecordSetId) {
        await this.loadRows();
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  async selectRecordSet(record_set_id: string) {
    this.activeRecordSetId = record_set_id;
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_RECORD_SET_KEY, record_set_id);
    await this.loadRows();
  }

  async loadRows() {
    if (!this.activeRecordSetId) return;
    this.loading = true;
    this.error = null;
    try {
      const r = (await workspace.invoke('row.list', {
        record_set_id: this.activeRecordSetId,
      })) as { rows: Row[] };
      this.rows = r.rows;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }

  async updateRowField(row_id: string, field: string, value: unknown) {
    await workspace.invoke('row.update', { row_id, fields: { [field]: value } });
    // Refresh just that row in the local list.
    const idx = this.rows.findIndex((r) => r.row_id === row_id);
    if (idx >= 0) {
      this.rows[idx] = { ...this.rows[idx], fields: { ...this.rows[idx].fields, [field]: value } };
    }
  }

  // Promote the active record set to a new canonical version. Reads the
  // current set's name, computes the next-version name, fires
  // `record_set.promote`, then auto-switches the Records Surface to the
  // newly-created set so the user sees their work in the new home.
  promoting = $state<boolean>(false);
  lastPromoteError = $state<string | null>(null);

  async promoteActiveRecordSet(): Promise<{ new_record_set_id: string } | null> {
    if (!this.activeRecordSetId) return null;
    const source = this.recordSets.find((rs) => rs.record_set_id === this.activeRecordSetId);
    if (!source) return null;
    this.promoting = true;
    this.lastPromoteError = null;
    try {
      const name = nextVersionName(source.name);
      const result = await promoteRecordSet(source.record_set_id, name);
      // Refresh the list of record sets so the new one shows up in the
      // picker, then switch to it.
      await this.loadRecordSets();
      await this.selectRecordSet(result.record_set.record_set_id);
      return { new_record_set_id: result.record_set.record_set_id };
    } catch (err) {
      this.lastPromoteError = err instanceof Error ? err.message : String(err);
      return null;
    } finally {
      this.promoting = false;
    }
  }
}

export const records = new RecordsStore();
