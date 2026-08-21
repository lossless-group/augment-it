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

import { createTransport, type ChatTurnReply, type ChatTurnRequest, type Transport, type TransportConfig } from './transport';
import { resolveWsUrl } from './ws-url';
import { bootMark, bootSummary } from './boot-timing';
import type { ActiveView, JobEvent, PromptTemplate, RecordSet, Row, ServerFrame, UserContext, WorkspaceSummary } from './types';

// Where the browser stashes the operator's active workspace pick. Survives
// reload; broadcast on change via the window event below so other remotes
// (the chat, lenses) can react without re-reading localStorage. Per
// [[Workspaces-as-Tenant-Primitive]] § "Active workspace, persisted".
const ACTIVE_CLIENT_KEY = 'augment-it:active-client-id';
export const WORKSPACE_CHANGED_EVENT = 'augment-it:workspace-changed';

// ── didi session keep-fresh ──────────────────────────────────────────────
// The didi_session cookie lives ~30 days but the JWT inside expires ~12h
// after mint; POST /api/session/refresh re-mints it (accepting an EXPIRED
// token) as long as the server session row is live. Same PUBLIC_ID_BASE
// convention as the shell's DidiBadge — rsbuild bakes it per surface;
// localhost:4000 is the dev id service. Failures return false quietly: an
// unreachable id service in DIDI_AUTH=off dev is normal, and in required
// mode the transport's auth-death path handles the consequence.
// See [[Session-Expiry-Turns-The-App-Into-A-Zombie]].
const ID_BASE =
  ((import.meta as { env?: Record<string, string> }).env?.PUBLIC_ID_BASE as string | undefined) ??
  'http://localhost:4000';
const SESSION_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

async function refreshDidiSession(): Promise<boolean> {
  try {
    const res = await fetch(`${ID_BASE}/api/session/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

class AugmentItWorkspace {
  activeView: ActiveView;
  record_sets: Record<string, RecordSet>;
  rows: Record<string, Row>;
  prompts: Record<string, PromptTemplate>;
  events: JobEvent[];
  user: UserContext | null;
  /**
   * The most recent capability the user (or the chat) invoked. Used by
   * the anticipation map (./anticipation.ts) to key suggestions on
   * (activeView.kind, last_capability). Null at startup; updated by
   * invoke() on every dispatch.
   */
  last_capability: string | null;
  /**
   * Workspace registry, populated by loadWorkspaces() on shell mount.
   * Empty until then; the switcher reads from this and the chat surface
   * reads active_client_id to forward into chat_turn context.
   * Per [[Workspaces-as-Tenant-Primitive]].
   */
  workspaces: WorkspaceSummary[];
  active_client_id: string | null;
  /**
   * Surface for the switcher / debug panel. Lets the UI distinguish
   * "we haven't tried yet" from "we tried and failed" from "no workspaces
   * exist on disk", which were all visually identical when the only signal
   * was workspaces.length === 0.
   */
  workspaces_status: 'idle' | 'loading' | 'ready' | 'error';
  workspaces_error: string | null;
  /**
   * WebSocket connection status, mirrored from the transport's onStatus
   * callback. Exposed so any surface (switcher, future status bar) can
   * render visible feedback when the socket is down. Connect handlers in
   * each remote forward into this.
   */
  connection_status: 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'auth_required';
  /**
   * The instance's DIDI_AUTH posture, carried on the session frame. Null
   * until the first session frame arrives. The shell's pre-auth wall
   * (Build-Order Step 7) renders when this is 'required' and `user` has
   * no `didi_id`.
   */
  didi_auth_mode: 'off' | 'optional' | 'required' | null;
  /**
   * Whether this instance was booted with ACTIVE_CLIENT_ID set (a
   * single-tenant deploy) — populated by loadWorkspaces(). The shell hides
   * the WorkspaceSwitcher when true (Build-Order Step 7).
   */
  pinned: boolean;

  private transport: Transport | null = null;
  private lastSeenSeq = -1;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private onVisible: (() => void) | null = null;

  constructor() {
    this.activeView = $state<ActiveView>({ kind: 'idle' });
    this.record_sets = $state<Record<string, RecordSet>>({});
    this.rows = $state<Record<string, Row>>({});
    // Prompt templates — populated by the prompt-template-manager remote.
    // record-collector leaves this empty; the singleton is a superset and
    // each remote uses the slice it needs.
    this.prompts = $state<Record<string, PromptTemplate>>({});
    this.events = $state.raw<JobEvent[]>([]);
    this.user = $state<UserContext | null>(null);
    this.last_capability = $state<string | null>(null);
    this.workspaces = $state<WorkspaceSummary[]>([]);
    this.workspaces_status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
    this.workspaces_error = $state<string | null>(null);
    this.connection_status = $state<'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'auth_required'>('idle');
    this.didi_auth_mode = $state<'off' | 'optional' | 'required' | null>(null);
    this.pinned = $state<boolean>(false);
    // Read the persisted pick eagerly so the chat surface has a value to
    // forward on the very first turn. The server-side discovery
    // (workspace.list) reconciles it after mount.
    this.active_client_id = $state<string | null>(
      typeof localStorage === 'undefined'
        ? null
        : localStorage.getItem(ACTIVE_CLIENT_KEY),
    );

    // Each federation remote loads its OWN workspace singleton (no shared
    // block in the shell's rsbuild config — see shell/rsbuild.config.ts).
    // Cross-instance coherence is by window event + localStorage. When the
    // shell's switcher dispatches WORKSPACE_CHANGED_EVENT, every other
    // remote's singleton updates its reactive state here.
    if (typeof window !== 'undefined') {
      window.addEventListener(WORKSPACE_CHANGED_EVENT, (ev: Event) => {
        const detail = (ev as CustomEvent).detail as { client_id?: string } | undefined;
        const next = detail?.client_id ?? null;
        if (next !== this.active_client_id) this.active_client_id = next;
      });
    }
  }

  /**
   * Fetch the workspace registry from the workspace-service, reconcile
   * the persisted active pick against what actually exists on disk
   * (gracefully falls back to the server's active if the persisted slug
   * is gone — same shape as the Sort & Filter Lens archived-set
   * fallback). Returns the resolved active id.
   */
  /**
   * Fetch this instance's DIDI_AUTH posture via a plain HTTP GET — needed
   * because an anonymous WS upgrade against a DIDI_AUTH=required instance
   * is rejected (4401) BEFORE any session frame is ever sent, so the
   * session frame alone can never tell an anonymous shell "this instance
   * requires sign-in." Call this alongside connect(), not instead of it —
   * a member's session frame still carries didi_auth_mode too, as a
   * cheap-to-keep second source once the socket does open. Build-Order
   * Step 7.
   */
  async fetchDidiAuthMode(httpBase: string): Promise<void> {
    try {
      const r = await fetch(`${httpBase}/config`);
      const j = (await r.json()) as { didi_auth_mode?: 'off' | 'optional' | 'required' };
      if (j.didi_auth_mode) this.didi_auth_mode = j.didi_auth_mode;
    } catch (err) {
      console.warn('[workspace] fetchDidiAuthMode failed', err);
    }
  }

  async loadWorkspaces(): Promise<string | null> {
    this.workspaces_status = 'loading';
    this.workspaces_error = null;
    try {
      console.info('[workspace] loadWorkspaces → workspace.list');
      bootMark('workspace.list:sent');
      const result = (await this.invoke('workspace.list', {})) as {
        workspaces: WorkspaceSummary[];
        active_client_id: string | null;
        pinned?: boolean;
      };
      bootMark('workspace.list:returned');
      console.info('[workspace] workspace.list returned', result);
      this.workspaces = result.workspaces;
      this.pinned = result.pinned ?? false;
      const persisted = this.active_client_id;
      const persistedExists = persisted && result.workspaces.some((w) => w.client_id === persisted);
      const resolved = persistedExists
        ? persisted
        : result.active_client_id ?? result.workspaces[0]?.client_id ?? null;
      // Re-assert whenever the SERVER disagrees, not just when the browser's
      // own pick changed. The server's active is in-memory per process, so
      // every stack restart silently resets it to the alphabetical default
      // while the browser keeps its persisted pick — without this, the two
      // split-brain (browser shows one tenant, domain services scope to
      // another) until the operator manually re-picks in the switcher.
      if (resolved && resolved !== result.active_client_id) {
        bootMark('workspace.activate:sent');
        await this.invoke('workspace.activate', { client_id: resolved });
        bootMark('workspace.activate:returned');
      }
      if (resolved !== persisted) {
        this.setActiveClientId(resolved);
      }
      this.workspaces_status = 'ready';
      bootSummary('workspaces:ready');
      return resolved;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[workspace] loadWorkspaces failed', err);
      this.workspaces_status = 'error';
      this.workspaces_error = msg;
      throw err;
    }
  }

  /**
   * Switch workspaces. Persists to localStorage, tells the server, and
   * broadcasts a window event so other remotes (chat, lenses) can re-read
   * their workspace-scoped state without polling.
   */
  async activateWorkspace(client_id: string): Promise<void> {
    await this.invoke('workspace.activate', { client_id });
    this.setActiveClientId(client_id);
  }

  private setActiveClientId(client_id: string | null): void {
    const prev = this.active_client_id;
    this.active_client_id = client_id;
    if (typeof localStorage !== 'undefined') {
      if (client_id) localStorage.setItem(ACTIVE_CLIENT_KEY, client_id);
      else localStorage.removeItem(ACTIVE_CLIENT_KEY);
    }
    // Clear tenant-scoped caches on a real switch (not initial set). Each
    // remote re-fetches via its own record_set.list / row.list / etc. The
    // server already has the new tenant's data file loaded by the time
    // these refetches fire (row-store subscribes to workspace.active.changed
    // and swaps synchronously).
    if (prev && client_id && prev !== client_id) {
      this.record_sets = {};
      this.rows = {};
      this.prompts = {};
      this.events = [];
      this.activeView = { kind: 'idle' };
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(WORKSPACE_CHANGED_EVENT, { detail: { client_id } }),
      );
    }
  }

  /**
   * Attach a transport to the singleton. Idempotent in the federation case:
   * when the workspace is a shared singleton across host + remote, both
   * call connect() but only the first one establishes the transport. To
   * force a reconnect (e.g. URL changed), call disconnect() first.
   */
  connect(config: Omit<TransportConfig, 'onFrame'>): void {
    if (this.transport) return;
    console.info('[workspace] connect →', config.url ?? resolveWsUrl());
    const userOnStatus = config.onStatus;
    this.transport = createTransport({
      ...config,
      refreshSession: config.refreshSession ?? refreshDidiSession,
      onStatus: (s) => {
        console.info('[workspace] transport status', s);
        this.connection_status = s as typeof this.connection_status;
        // Auth-death: the session frame's user is now a lie — clear it so
        // the shell's SignInWall condition (required && no didi_id) fires
        // over the stale UI instead of leaving a zombie surface. See
        // [[Session-Expiry-Turns-The-App-Into-A-Zombie]].
        if (s === 'auth_required') this.user = null;
        userOnStatus?.(s);
      },
      onFrame: (frame) => this.handleFrame(frame),
    });
    // Keep the didi JWT fresh for the tab's whole life: the token inside
    // the 30d cookie expires ~12h after mint, and /api/session/refresh
    // re-mints it (even when already expired) as long as the server
    // session row is live. Hourly interval + on tab-focus covers both the
    // long-lived tab and the laptop that slept past the cliff. Every
    // surface runs its own timer (no shared singleton across remotes);
    // the refresh is idempotent and cookie-wide, so overlap is free.
    if (typeof window !== 'undefined' && !this.refreshTimer) {
      this.refreshTimer = setInterval(() => void refreshDidiSession(), SESSION_REFRESH_INTERVAL_MS);
      this.onVisible = () => {
        if (document.visibilityState === 'visible') void refreshDidiSession();
      };
      document.addEventListener('visibilitychange', this.onVisible);
    }
  }

  disconnect(): void {
    if (!this.transport) return;
    this.transport.close();
    this.transport = null;
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.onVisible) {
      document.removeEventListener('visibilitychange', this.onVisible);
      this.onVisible = null;
    }
  }

  rowsFor(record_set_id: string): Row[] {
    const rs = this.record_sets[record_set_id];
    if (!rs) return [];
    return rs.row_ids
      .map((id) => this.rows[id])
      .filter((r): r is Row => r !== undefined);
  }

  async invoke(capability: string, args: unknown, via?: string): Promise<unknown> {
    if (!this.transport) throw new Error('workspace not connected — call workspace.connect() first');
    // Track the most recent capability so the anticipation map can key
    // suggestions on (activeView, last_capability). Update before the
    // dispatch resolves — the suggestion lookup in the chat surface fires
    // as soon as the new capability lands in the transcript.
    this.last_capability = capability;
    return this.transport.invoke(capability, args, via);
  }

  /**
   * Send a chat turn through the workspace transport. The reply is one of
   * three modes — answer / propose / invoke (see [[Chat-As-Verb-Surface-Patterns]]
   * Pattern 4). Throws if the socket isn't connected.
   */
  async chatTurn(req: ChatTurnRequest): Promise<ChatTurnReply> {
    if (!this.transport) throw new Error('workspace not connected — call workspace.connect() first');
    return this.transport.chatTurn(req);
  }

  ingestEvent(event: JobEvent): void {
    if (event.seq <= this.lastSeenSeq) return;
    this.lastSeenSeq = event.seq;
    this.events = [...this.events, event];
    if (this.events.length > 2000) this.events = this.events.slice(-2000);
  }

  private handleFrame(frame: ServerFrame): void {
    if (frame.kind === 'session') {
      this.user = {
        session_token: frame.token,
        user_id: this.user?.user_id,
        didi_id: frame.didi_id ?? null,
      };
      this.didi_auth_mode = frame.didi_auth_mode ?? null;
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
