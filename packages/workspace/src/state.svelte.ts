// AugmentItWorkspace — Svelte 5 singleton state container.
//
// Pattern lifted from memopop's FlowState
// (memopop-ai/apps/memopop-native/src/lib/stores/flow.svelte.ts) per the
// Per-App-Workspace-Conventions blueprint. Components import the singleton
// directly; reactivity is native via $state runes — no hook plumbing.
//
// Why constructor-assignment instead of class-field-initializer form:
// some downstream toolchains (rspack's swc, older browserslist targets,
// monorepo-shared tsconfigs) lower class field declarations to
// `_define_property(this, "x", ...)` which breaks the Svelte 5 $state
// placement invariant. Constructor assignment in the same class survives
// all known lowering paths — it's explicitly listed as valid in the
// "first assignment to a class field at the top level of the constructor"
// rule in https://svelte.dev/e/state_invalid_placement.

import { createTransport, type Transport, type TransportConfig } from './transport';
import type { ActiveView, JobEvent, RecordSet, Row, ServerFrame, UserContext } from './types';

class AugmentItWorkspace {
  activeView: ActiveView;
  record_sets: Record<string, RecordSet>;
  rows: Record<string, Row>;
  events: JobEvent[];
  user: UserContext | null;

  private transport: Transport | null = null;
  private lastSeenSeq = -1;

  constructor() {
    this.activeView = $state<ActiveView>({ kind: 'idle' });
    this.record_sets = $state<Record<string, RecordSet>>({});
    this.rows = $state<Record<string, Row>>({});
    this.events = $state.raw<JobEvent[]>([]);
    this.user = $state<UserContext | null>(null);
  }

  /**
   * Attach a transport to the singleton. Idempotent in the federation case:
   * when the workspace is a shared singleton across host + remote, both
   * call connect() but only the first one establishes the transport. To
   * force a reconnect (e.g. URL changed), call disconnect() first.
   */
  connect(config: Omit<TransportConfig, 'onFrame'>): void {
    if (this.transport) return;
    this.transport = createTransport({
      ...config,
      onFrame: (frame) => this.handleFrame(frame),
    });
  }

  disconnect(): void {
    if (!this.transport) return;
    this.transport.close();
    this.transport = null;
  }

  rowsFor(record_set_id: string): Row[] {
    const rs = this.record_sets[record_set_id];
    if (!rs) return [];
    return rs.row_ids
      .map((id) => this.rows[id])
      .filter((r): r is Row => r !== undefined);
  }

  async invoke(capability: string, args: unknown): Promise<unknown> {
    if (!this.transport) throw new Error('workspace not connected — call workspace.connect() first');
    return this.transport.invoke(capability, args);
  }

  ingestEvent(event: JobEvent): void {
    if (event.seq <= this.lastSeenSeq) return;
    this.lastSeenSeq = event.seq;
    this.events = [...this.events, event];
    if (this.events.length > 2000) this.events = this.events.slice(-2000);
  }

  private handleFrame(frame: ServerFrame): void {
    if (frame.kind === 'session') {
      this.user = { session_token: frame.token, user_id: this.user?.user_id };
    } else if (frame.kind === 'event') {
      this.ingestEvent({
        seq: frame.seq,
        subject: frame.subject,
        payload: frame.payload,
        ts: new Date().toISOString(),
      });
    }
    // result frames are resolved by the transport via its own pending map
  }
}

export const workspace = new AugmentItWorkspace();
