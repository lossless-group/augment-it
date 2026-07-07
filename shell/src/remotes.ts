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
  'strategyCurator',     // the entry point — pick a strategy/thesis, gather + curate sources (promoted per the curator spec; Flow 1 makes it the primary surface)
  'recordCollector',
  'recordDbResolver',    // bridge — reconcile records to canonical orgs (match/create) before enrichment passes
  'augment',             // composite — PTM ⇄ Pack Runner via in-slot toggle (renamed from 'enrichment' per Decision §11)
  'recordsSurface',      // step 3 — per-record connector firing for finding OfficialUpdate URLs (replaces requestReviewer in the rotation; the remote stays registered + reachable via navigate, just not in the numbered Flow)
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
  {
    id: 'recordsSurface',
    label: 'Records Surface',
    description: 'Per-record connector firing for finding OfficialUpdate URLs',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('recordsSurface/mount'),
  },
  {
    id: 'recordDbResolver',
    label: 'DB Resolver',
    description: 'Match each record to a canonical org (or create one) — additive enrich, one by one',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('recordDbResolver/mount'),
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

// SORT_FILTER_LENS_REMOTE — the first member of the new "Lens" primitive
// (context-v/specs/Records-Surface-Sort-Step-and-UI.md). Not in REMOTES
// because it's not a rotation step on its own; it's reached as a third
// member of the AUGMENT composite (alongside PTM and Pack Runner). Same
// federation-registration pattern as PACK_RUNNER_REMOTE.
export const SORT_FILTER_LENS_REMOTE: RemoteEntry = {
  id: 'sortFilterLens',
  label: 'Sort & Filter',
  description: 'Re-order and (soon) narrow the active record set to build a focused worklist',
  // @ts-expect-error — federation remote, type comes from the MF runtime
  importMount: () => import('sortFilterLens/mount'),
};

// PERSON_ENRICHMENT_REMOTE — the first PULSE-SURFACE in the tree.
// One pulse against one entity, expressed as N pulse-dimension
// components (NameFields, SocialsFields, EmailListField, OrgPicker).
// v0 hardcoded to the Turning-Jobs-Into-Degrees event; not in rotation
// yet, reachable directly via dynamic import. See
// [[context-v/specs/Sparse-Person-Enrichment-Surface.md]] for the
// spec and the broader pulse-pattern framing.
export const PERSON_ENRICHMENT_REMOTE: RemoteEntry = {
  id: 'personEnrichment',
  label: 'Person Enrichment',
  description: 'Per-event pulse-surface: turn sparse persons into named persons with socials, emails, and orgs',
  // @ts-expect-error — federation remote, type comes from the MF runtime
  importMount: () => import('personEnrichment/mount'),
};

// "Extra" remotes — federation-registered + reachable via PAIRING /
// augment-it:navigate, but excluded from the peek-flow rotation in REMOTES.
// Same shape as CHAT_REMOTE; aggregated here so remoteById() can fall back
// to look them up without each caller having to know about each extra.

// STRATEGY_CURATOR_REMOTE — the entry-point surface for gathering sources
// against a strategy (metadata-first → Jina/PDF fetch → extracts), writing
// only through workspace capabilities. PROMOTED to the head of ROTATION
// 2026-07-06 (the handlers landed 06-29; Flow 1 makes this the primary
// surface). Kept in EXTRA_REMOTES too — remoteById checks both, harmless.
// See context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md.
export const STRATEGY_CURATOR_REMOTE: RemoteEntry = {
  id: 'strategyCurator',
  label: 'Strategy Curator',
  description: 'Pick a strategy, gather sources (metadata-first → fetch → extracts), tag and cross-reference',
  // @ts-expect-error — federation remote, type comes from the MF runtime
  importMount: () => import('strategyCurator/mount'),
};

const EXTRA_REMOTES: RemoteEntry[] = [CHAT_REMOTE, PACK_RUNNER_REMOTE, SORT_FILTER_LENS_REMOTE, PERSON_ENRICHMENT_REMOTE, STRATEGY_CURATOR_REMOTE];

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
    // The Augment composite (PTM ⇄ Pack Runner) paired with Record
    // Collector. Replaces the two former pairings recordCollector+PTM
    // and packRunner+PTM. The composite owns the in-slot toggle; the
    // shell mounts only the active member at a time. Phase 2c of the
    // refactor; renamed enrichment → augment per Decision §11.
    key: 'recordCollector+augment',
    left: 'recordCollector',
    right: 'augment',
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
