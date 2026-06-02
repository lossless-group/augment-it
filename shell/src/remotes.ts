// The federated remotes the shell can mount, and the co-existence pairings.
//
// Adding a remote is a REMOTES entry + a `remotes` map line in
// rsbuild.config.ts — nothing else in the shell. Adding a co-existence
// pairing is a PAIRINGS entry.
//
// A PAIRING slot may reference either a remote id (the common case) or a
// composite id from composites.ts (a slot that hosts one-of-N remotes
// based on shared state — see [[Shell-and-Micro-Frontend-UX-Coherence-Refactor]]
// Phase 2c). slotById() resolves either kind.

import { compositeById, type CompositeEntry } from './composites';
export { compositeById } from './composites';
export type { CompositeEntry } from './composites';

export type RemoteEntry = {
  id: string;
  label: string;
  description: string;
  // Federation dynamic import. The module exposes a single mount function
  // (any name, or a default export) — see MountHost's generic loader.
  importMount: () => Promise<Record<string, unknown>>;
};

/**
 * Ordered list of slot ids that walk the peek-flow rotation (and the
 * full-mode focus sequence). Each id resolves via slotById() to either
 * a federated remote or a composite. Composites are peers in the
 * rotation, so the in-slot toggle (e.g. enrichment's PTM⇄Pack-Runner
 * pair) works in every layout mode, not just co-existence.
 *
 * Phase 2d of the refactor — see context-v/plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor.md
 */
export const ROTATION: string[] = [
  'recordCollector',
  'enrichment',          // composite — PTM ⇄ Pack Runner via in-slot toggle
  'requestReviewer',
  'responseReviewer',
  'enhancedRecordsList',
];

export const REMOTES: RemoteEntry[] = [
  {
    id: 'recordCollector',
    label: 'Record Collector',
    description: 'Ingest CSV / XLSX, browse rows, edit cells',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('recordCollector/mount'),
  },
  {
    id: 'promptTemplateManager',
    label: 'Prompt Templates',
    description: 'Author prompts, run them per-row to enrich record sets',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('promptTemplateManager/mount'),
  },
  {
    id: 'requestReviewer',
    label: 'Request Reviewer',
    description: 'Pre-flight: review the resolved request, pick the model, fire it',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('requestReviewer/mount'),
  },
  {
    id: 'responseReviewer',
    label: 'Response Reviewer',
    description: 'Post-flight: triage responses, accept or send back for re-run',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('responseReviewer/mount'),
  },
  {
    id: 'enhancedRecordsList',
    label: 'Enhanced Records',
    description: 'Record-grained checkpoint between enrichment passes',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('enhancedRecordsList/mount'),
  },
];

// CHAT_REMOTE is intentionally NOT in REMOTES. The chat surface is a
// persistent left-rail companion to whatever Window the user is focused on
// — it doesn't rotate, doesn't tile, doesn't co-exist. It just sits next to
// the user wherever they go. See App.svelte's grid layout: header on top,
// chat-rail on the left, stage (REMOTES rotation) on the right.
//
// The federation registration is still in rsbuild.config.ts so the dynamic
// import works; only the rotation list is different from a normal remote.
export const CHAT_REMOTE: RemoteEntry = {
  id: 'chat',
  label: 'Chat',
  description: 'Author prompts conversationally — draft → improve → apply',
  // @ts-expect-error — federation remote, type comes from the MF runtime
  importMount: () => import('chat/mount'),
};

// PACK_RUNNER_REMOTE is intentionally NOT in REMOTES. Per the
// [[Run-as-First-Class-Operation]] plan §Part 1: Pack Runner is the
// alternative to authoring a custom prompt, reached as an "option" from
// prompt-template-manager, not as a sibling tile in the peek-flow. The
// federation registration is still in rsbuild.config.ts so the PAIRING
// lookup + cross-remote navigation event continue to work.
export const PACK_RUNNER_REMOTE: RemoteEntry = {
  id: 'packRunner',
  label: 'Pack Runner',
  description: 'Fire the common-six social packs against rows — results flow to Response Reviewer',
  // @ts-expect-error — federation remote, type comes from the MF runtime
  importMount: () => import('packRunner/mount'),
};

// "Extra" remotes — federation-registered + reachable via PAIRING /
// augment-it:navigate, but excluded from the peek-flow rotation in REMOTES.
// Same shape as CHAT_REMOTE; aggregated here so remoteById() can fall back
// to look them up without each caller having to know about each extra.
const EXTRA_REMOTES: RemoteEntry[] = [CHAT_REMOTE, PACK_RUNNER_REMOTE];

// Co-existence pairings — which two remotes share the viewport in Mode B,
// and the default left-panel width %. Different pairs want different
// defaults; this is per-pair config, not a global constant.
export type Pairing = {
  key: string;            // sorted-id pair key — also the coExistenceRatios key
  left: string;           // remote id rendered on the left
  right: string;          // remote id rendered on the right
  defaultLeftPct: number; // left panel's share at rest
};

export const PAIRINGS: Pairing[] = [
  {
    // The enrichment composite (PTM ⇄ Pack Runner) paired with Record
    // Collector. Replaces the two former pairings recordCollector+PTM and
    // packRunner+PTM. The composite owns the in-slot toggle; the shell
    // mounts only the active member at a time. Phase 2c of the refactor.
    key: 'recordCollector+enrichment',
    left: 'recordCollector',
    right: 'enrichment',
    defaultLeftPct: 30,
  },
  {
    // Per Enhanced-Records-List spec §"Surface": pair the new checkpoint
    // surface with Record Collector so the user can flip between "all
    // my data raw" (left) and "the unified curation checkpoint" (right).
    key: 'recordCollector+enhancedRecordsList',
    left: 'recordCollector',
    right: 'enhancedRecordsList',
    defaultLeftPct: 25, // record-collector narrower; the checkpoint table needs room
  },
];

export function remoteById(id: string): RemoteEntry | undefined {
  return REMOTES.find((r) => r.id === id) ?? EXTRA_REMOTES.find((r) => r.id === id);
}

/**
 * A slot in a layout can be either a single remote or a composite that
 * hosts one-of-N remotes. Use slotById when you need to handle both —
 * e.g. when rendering a PAIRING half.
 */
export type Slot =
  | { kind: 'remote'; remote: RemoteEntry }
  | { kind: 'composite'; composite: CompositeEntry };

export function slotById(id: string): Slot | undefined {
  const r = remoteById(id);
  if (r) return { kind: 'remote', remote: r };
  const c = compositeById(id);
  if (c) return { kind: 'composite', composite: c };
  return undefined;
}
