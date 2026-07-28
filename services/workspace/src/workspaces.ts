// Workspaces — the tenant primitive (per [[Workspaces-as-Tenant-Primitive]]).
//
// Source of truth at baby step 1: the filesystem. Each immediate child of
// CLIENTS_ROOT is a workspace; the directory IS the workspace. No manifest,
// no DB. Display name is title-cased from the slug.
//
// Per-workspace .env: loaded into a frozen, in-memory map keyed by slug.
// Do NOT merge into process.env — `WorkspaceService` runs in one process
// and serves all workspaces; merging would bleed env across tenants the
// moment two are active in the same session, or even just touched in
// sequence by a domain service that reads from process.env at dispatch
// time. The connector-config seam will resolve typed connector configs
// (LLM / search / CRM / MCP / storage) from this map in a later step;
// step 1 just exposes the raw env to authorized callers.
//
// Active workspace: tracked in memory per process (baby step 1). The
// browser persists the chosen slug in localStorage and sends it on every
// chat turn; the server reads ctx.client_id at chat dispatch time. The
// process-wide active value is a fallback for capabilities that fire
// without an explicit client_id arg, and a hook the audit log can read
// in a later step. Persistence to a JSON file is intentionally deferred
// — multi-user / per-session active workspace is a later spec move.

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getNats } from './nats';

// Subject for cross-service workspace-switch broadcast. Domain services
// (row-store, prompt-store, response-store, content-ingest) subscribe and
// re-scope their state when the operator toggles workspaces. Also added to
// the browser-broadcast list in ws.ts so other tabs / remotes stay in sync.
export const WORKSPACE_ACTIVE_CHANGED_SUBJECT = 'workspace.active.changed';
// One-shot request a domain service can fire on boot to discover the
// currently-active workspace before subscribing to changes.
export const WORKSPACE_ACTIVE_REQUESTED_SUBJECT = 'workspace.active.requested';

export type WorkspaceSummary = {
  client_id: string;
  display_name: string;
  has_env: boolean;
  /** DEFAULT_DOMAIN_TYPE from this workspace's .env, or 'strategy' if unset.
   *  Per Build-Order step 5 — humain-vc reads 'thesis', reach-edu 'strategy'. */
  default_domain_type: string;
  /** The id-didi-sh org this workspace belongs to (e.g. 'reach.edu'), or
   *  null when unmapped. Session tenancy derives allowed workspaces from
   *  this — see [[Open-Augment-Didi-Sh-To-Reach-Edu]] step 1. */
  org_id: string | null;
};

export type WorkspaceConfig = {
  client_id: string;
  /** Frozen view of clients/<slug>/.env. Empty object if no .env present. */
  env: Readonly<Record<string, string>>;
  /** From clients/<slug>/workspace.json (org_id), else the WORKSPACE_ORG_MAP
   *  env fallback — the deployed instance keeps clients on a volume, so the
   *  mapping must be settable without volume surgery. File wins. */
  org_id: string | null;
};

// Env fallback for the org mapping: "humain-vc=humain.vc,reach-edu=reach.edu".
// Parsed once; consulted only when the workspace has no workspace.json org_id.
const ORG_MAP_FROM_ENV: ReadonlyMap<string, string> = new Map(
  (process.env.WORKSPACE_ORG_MAP ?? '')
    .split(',')
    .map((pair) => pair.split('=').map((s) => s.trim()))
    .filter((kv): kv is [string, string] => kv.length === 2 && Boolean(kv[0]) && Boolean(kv[1]))
    .map(([k, v]) => [k, v] as const),
);

let CLIENTS_ROOT = '';
const configs = new Map<string, WorkspaceConfig>();
let activeClientId: string | null = null;
// Set once, at boot, from whether ACTIVE_CLIENT_ID was present in the
// environment — a single-tenant deploy declares its one client this way.
// Independent of whether that client_id actually resolved (a typo'd env
// var still means "this instance intends to be pinned"); the shell reads
// this to hide the WorkspaceSwitcher entirely (Build-Order Step 7).
let pinned = false;

function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Minimal .env parser. Handles KEY=value lines, # comments, blank lines,
 * and single- or double-quoted values. Does NOT handle expansion (${FOO})
 * — workspace .env files are tenant-scoped, not layered, so expansion
 * would only cause surprise. Bring in dotenv if and when a real need
 * shows up.
 */
function parseEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function loadConfigFor(client_id: string): Promise<WorkspaceConfig> {
  const envPath = join(CLIENTS_ROOT, client_id, '.env');
  let env: Record<string, string> = {};
  try {
    const raw = await readFile(envPath, 'utf8');
    env = parseEnv(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  let org_id: string | null = null;
  try {
    const raw = await readFile(join(CLIENTS_ROOT, client_id, 'workspace.json'), 'utf8');
    const parsed = JSON.parse(raw) as { org_id?: unknown };
    if (typeof parsed.org_id === 'string' && parsed.org_id) org_id = parsed.org_id;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Malformed JSON should not take the workspace down — an unmapped
      // workspace is invisible to client sessions, which fails safe.
      console.warn(`[workspaces] could not parse ${client_id}/workspace.json`, err);
    }
  }
  org_id ??= ORG_MAP_FROM_ENV.get(client_id) ?? null;
  return { client_id, env: Object.freeze(env), org_id };
}

// Where the operator's last workspace pick persists across restarts —
// the same durable volume sessions.json lives on. Without this, every
// container rebuild silently reset the active workspace to the
// alphabetically-first slug (humain-vc), and every surface followed it
// into the wrong (empty) tenant slice. Unset (non-docker dev) → skip
// persistence, in-memory only, same as before.
const ACTIVE_STORE_PATH = process.env.ACTIVE_STORE_PATH ?? '';

async function readPersistedActive(): Promise<string | null> {
  if (!ACTIVE_STORE_PATH) return null;
  try {
    const raw = await readFile(ACTIVE_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { client_id?: string };
    return typeof parsed.client_id === 'string' ? parsed.client_id : null;
  } catch {
    return null;
  }
}

function persistActive(client_id: string): void {
  if (!ACTIVE_STORE_PATH) return;
  // Fire-and-forget — a failed persist degrades to the old reset-on-restart
  // behavior, never fails the switch itself.
  void writeFile(ACTIVE_STORE_PATH, JSON.stringify({ client_id }), 'utf8').catch((err) => {
    console.warn('[workspaces] could not persist active workspace', err);
  });
}

/**
 * Initialize the workspace registry. Scans CLIENTS_ROOT for directories,
 * primes each one's WorkspaceConfig, and resolves an initial active slug.
 * Active selection precedence: explicit ACTIVE_CLIENT_ID env (pinned) >
 * persisted last pick (ACTIVE_STORE_PATH) > alphabetical first > null.
 */
export async function initWorkspaces(opts: {
  clients_root: string;
  initial_active_id?: string;
}): Promise<void> {
  CLIENTS_ROOT = resolve(opts.clients_root);
  configs.clear();
  const slugs = await discover();
  for (const slug of slugs) {
    configs.set(slug, await loadConfigFor(slug));
  }
  pinned = Boolean(opts.initial_active_id);
  const persisted = pinned ? null : await readPersistedActive();
  if (opts.initial_active_id && configs.has(opts.initial_active_id)) {
    activeClientId = opts.initial_active_id;
  } else if (persisted && configs.has(persisted)) {
    activeClientId = persisted;
  } else {
    activeClientId = slugs[0] ?? null;
  }
}

/** Whether this instance was booted with ACTIVE_CLIENT_ID set — a
 *  single-tenant deploy. The shell hides the WorkspaceSwitcher when true. */
export function isPinned(): boolean {
  return pinned;
}

/**
 * Domain services (row-store, etc.) ask "who's active right now" via NATS
 * request/reply on workspace.active.requested. Subscribed once at boot
 * after NATS is connected.
 */
export function registerActiveQueryResponder(): void {
  const nc = getNats();
  (async () => {
    const sub = nc.subscribe(WORKSPACE_ACTIVE_REQUESTED_SUBJECT);
    for await (const msg of sub) {
      if (msg.reply) {
        msg.respond(JSON.stringify({ active_client_id: activeClientId }));
      }
    }
  })().catch((err) => {
    console.error('[workspaces] active-query subscriber crashed', err);
  });
}

async function discover(): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(CLIENTS_ROOT);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const slugs: string[] = [];
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const s = await stat(join(CLIENTS_ROOT, name)).catch(() => null);
    if (s && s.isDirectory()) slugs.push(name);
  }
  return slugs.sort();
}

export async function listWorkspaces(): Promise<WorkspaceSummary[]> {
  const slugs = await discover();
  // Re-prime configs for newly added dirs so a fresh `mkdir clients/foo`
  // is picked up without a server restart.
  for (const slug of slugs) {
    if (!configs.has(slug)) configs.set(slug, await loadConfigFor(slug));
  }
  return slugs.map((client_id) => buildSummary(client_id));
}

/** The org a workspace is bound to, or null when unmapped/unknown. */
export function getWorkspaceOrgId(client_id: string): string | null {
  return configs.get(client_id)?.org_id ?? null;
}

/** All workspace slugs currently primed, sorted. Sync view of the config
 *  map — freshly mkdir'd workspaces appear after the next listWorkspaces
 *  walk primes them. */
export function knownClientIds(): string[] {
  return [...configs.keys()].sort();
}

/** One workspace's summary from the primed config. Throws on unknown slug. */
export function buildSummary(client_id: string): WorkspaceSummary {
  const cfg = configs.get(client_id);
  if (!cfg) throw new Error(`unknown workspace: ${client_id}`);
  return {
    client_id,
    display_name: titleCase(client_id),
    has_env: Object.keys(cfg.env).length > 0,
    default_domain_type: cfg.env.DEFAULT_DOMAIN_TYPE || 'strategy',
    org_id: cfg.org_id,
  };
}

/** Whether ANY workspace on this instance declares an org binding — the
 *  signal that the org-mapped admission gate applies (vs the legacy
 *  REQUIRED_ORG_ID binary check). */
export function hasOrgMappedWorkspaces(): boolean {
  for (const cfg of configs.values()) if (cfg.org_id) return true;
  return false;
}

/** Workspace slugs a set of org memberships admits, sorted. */
export function workspacesForOrgs(orgIds: readonly string[]): string[] {
  const orgs = new Set(orgIds);
  const out: string[] = [];
  for (const cfg of configs.values()) {
    if (cfg.org_id && orgs.has(cfg.org_id)) out.push(cfg.client_id);
  }
  return out.sort();
}

export function getActiveClientId(): string | null {
  return activeClientId;
}

export function setActiveClientId(client_id: string): WorkspaceSummary {
  if (!configs.has(client_id)) {
    throw new Error(`unknown workspace: ${client_id}`);
  }
  const prev = activeClientId;
  activeClientId = client_id;
  persistActive(client_id);
  // Broadcast the switch so domain services (row-store today; prompt-store
  // / response-store / content-ingest next) can re-scope their state to
  // the new tenant. Fire-and-forget — publish is local to NATS.
  if (prev !== client_id) {
    try {
      getNats().publish(
        WORKSPACE_ACTIVE_CHANGED_SUBJECT,
        JSON.stringify({ client_id, previous: prev }),
      );
    } catch (err) {
      console.warn('[workspaces] could not publish workspace.active.changed', err);
    }
  }
  return buildSummary(client_id);
}

/**
 * Return the resolved env for a workspace. Returns null when the slug is
 * unknown — callers decide whether that's a refusal or a quiet skip.
 */
export function getWorkspaceEnv(client_id: string): Readonly<Record<string, string>> | null {
  const cfg = configs.get(client_id);
  return cfg ? cfg.env : null;
}
