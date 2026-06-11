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

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type WorkspaceSummary = {
  client_id: string;
  display_name: string;
  has_env: boolean;
};

export type WorkspaceConfig = {
  client_id: string;
  /** Frozen view of clients/<slug>/.env. Empty object if no .env present. */
  env: Readonly<Record<string, string>>;
};

let CLIENTS_ROOT = '';
const configs = new Map<string, WorkspaceConfig>();
let activeClientId: string | null = null;

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
  return { client_id, env: Object.freeze(env) };
}

/**
 * Initialize the workspace registry. Scans CLIENTS_ROOT for directories,
 * primes each one's WorkspaceConfig, and resolves an initial active slug.
 * Active selection precedence: explicit ACTIVE_CLIENT_ID env > alphabetical
 * first discovered > null.
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
  if (opts.initial_active_id && configs.has(opts.initial_active_id)) {
    activeClientId = opts.initial_active_id;
  } else {
    activeClientId = slugs[0] ?? null;
  }
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
  return slugs.map((client_id) => ({
    client_id,
    display_name: titleCase(client_id),
    has_env: (configs.get(client_id)?.env && Object.keys(configs.get(client_id)!.env).length > 0) || false,
  }));
}

export function getActiveClientId(): string | null {
  return activeClientId;
}

export function setActiveClientId(client_id: string): WorkspaceSummary {
  if (!configs.has(client_id)) {
    throw new Error(`unknown workspace: ${client_id}`);
  }
  activeClientId = client_id;
  return {
    client_id,
    display_name: titleCase(client_id),
    has_env: Object.keys(configs.get(client_id)!.env).length > 0,
  };
}

/**
 * Return the resolved env for a workspace. Returns null when the slug is
 * unknown — callers decide whether that's a refusal or a quiet skip.
 */
export function getWorkspaceEnv(client_id: string): Readonly<Record<string, string>> | null {
  const cfg = configs.get(client_id);
  return cfg ? cfg.env : null;
}
