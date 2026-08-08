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
 * full-mode focus sequence) for the "Improve a CSV" flow — the original
 * CSV-row-augmentation pipeline. Each id resolves via slotById() to either
 * a federated remote or a composite. Composites are peers in the
 * rotation, so the in-slot toggle (e.g. enrichment's PTM⇄Pack-Runner
 * pair) works in every layout mode, not just co-existence.
 *
 * Renamed from the bare `ROTATION` (2026-07-07) — augment-it now has more
 * than one flow (see ./flows.svelte.ts and context-v/explorations/
 * Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door.md), so
 * "the rotation" needed to become "this flow's rotation." `strategyCurator`
 * — briefly spliced onto the head of this array on 2026-07-06 to give it
 * SOME entry point — moved out to its own flow below; it never belonged
 * here (it shares no data spine with the CSV-row steps that follow it).
 *
 * Phase 2d of the refactor — see context-v/plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor.md
 */
export const CSV_AUGMENTATION_ROTATION: string[] = [
  'recordCollector',
  'recordDbResolver',    // bridge — reconcile records to canonical orgs (match/create) before enrichment passes
  'augment',             // composite — PTM ⇄ Pack Runner via in-slot toggle (renamed from 'enrichment' per Decision §11)
  'recordsSurface',      // step 3 — per-record connector firing for finding OfficialUpdate URLs (replaces requestReviewer in the rotation; the remote stays registered + reachable via navigate, just not in the numbered Flow)
  'responseReviewer',
  'enhancedRecordsList',
];

/**
 * The "Build Corpora" flow's rotation — one step today. Kept as its own
 * named array (not just inlined in flows.svelte.ts) so it reads
 * symmetrically next to CSV_AUGMENTATION_ROTATION above.
 */
export const BUILD_CORPORA_ROTATION: string[] = ['strategyCurator'];

/**
 * The "Augment a CSV of Event Attendees" flow's rotation — Flow B from
 * context-v/explorations/Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door.md:
 * ingest an event-attendee CSV, then reconcile each row to a canonical
 * organization in SurrealDB. `recordDbResolver` is org-only (dual-use: step
 * 2 of "Improve a CSV" AND, on its own with just an ingest step ahead of it,
 * this flow) — for a PEOPLE-shaped CSV (speakers, attendees), use
 * PEOPLE_ROTATION below instead. Splitting these was a 2026-07-07 correction
 * after live-testing recordDbResolver against a people CSV wrote a person
 * into the organizations table — see
 * context-v/plans/Person-Aware-Canonical-Resolver-Extension.md.
 */
export const EVENT_ATTENDEES_ROTATION: string[] = ['recordCollector', 'recordDbResolver'];

/**
 * The "Augment a CSV of People" flow's rotation — the person-shaped sibling
 * to EVENT_ATTENDEES_ROTATION. `personDbResolver` match-or-creates a person,
 * then independently match-or-creates their org and RELATEs the affiliation
 * with a role — no opportunity concept, no organizations-table writes for
 * the person itself. See
 * context-v/plans/Person-Aware-Canonical-Resolver-Extension.md.
 */
export const PEOPLE_ROTATION: string[] = ['recordCollector', 'personDbResolver'];

/**
 * The "Rate Affiliations" flow's rotation — the write half of Augment from
 * Affiliations (context-v/specs/Augment-From-Affiliations.md). Upload the
 * rating-edited CSV (from scripts/export-affiliation-ratings-csv.mjs)
 * through the existing Record Collector path, then affiliationRatingResolver
 * maps columns once and writes relevance/relevance_note onto each row's
 * affiliations edge. No match/create — every row's person + org already
 * exist in canonical.
 */
export const AFFILIATION_RATING_ROTATION: string[] = ['recordCollector', 'affiliationRatingResolver'];

/**
 * The "Augment from DB" flow's rotation — start from a canonical SurrealDB
 * organization instead of a CSV. One step today: the org workbench
 * (search → org card → additive lists). The search-and-add remote (Phase 3)
 * joins as an EXTRA_REMOTES pairing partner, not a numbered step. See
 * context-v/specs/Augment-From-DB-Flow.md.
 */
export const AUGMENT_FROM_DB_ROTATION: string[] = ['orgWorkbench'];

// The design system portal. Deliberately NOT in REMOTES — it is not a step in
// any flow and must never appear in a rotation. The shell mounts it as its own
// full-bleed surface from the Developers menu, outside the sign-in wall.
export const DESIGN_SYSTEM_REMOTE: RemoteEntry = {
  id: 'designSystem',
  label: 'Design system',
  description: 'Brand guidelines, design tokens, the three-mode contract',
  // @ts-expect-error — federation remote, type comes from the MF runtime
  importMount: () => import('designSystem/mount'),
};

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
  {
    id: 'personDbResolver',
    label: 'Person DB Resolver',
    description: 'Match each record to a canonical person (or create one), then their org + role — one by one',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('personDbResolver/mount'),
  },
  {
    id: 'affiliationRatingResolver',
    label: 'Affiliation Rating Resolver',
    description: 'Reimport a rated affiliations CSV and write relevance + notes back onto the affiliations edges',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('affiliationRatingResolver/mount'),
  },
  {
    id: 'orgWorkbench',
    label: 'Org Workbench',
    description: 'Start from a canonical organization — search to it, work its links, streams, and corpus in place',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importMount: () => import('orgWorkbench/mount'),
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

// STRATEGY_CURATOR_REMOTE — "Corpora Curator" on-screen (display rename;
// id/package/remote name unchanged) — the entry-point surface for
// gathering sources against a domain (metadata-first → Jina/PDF fetch →
// extracts), writing only through workspace capabilities. Briefly
// PROMOTED to the head of CSV_AUGMENTATION_ROTATION on 2026-07-06; moved
// out to its own single-step "Build Corpora" flow (./flows.svelte.ts) on
// 2026-07-07 — it never belonged in the CSV-augmentation sequence. Kept
// in EXTRA_REMOTES too — remoteById checks both, harmless.
// See context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md.
export const STRATEGY_CURATOR_REMOTE: RemoteEntry = {
  id: 'strategyCurator',
  label: 'Corpora Curator',
  description: 'Pick a strategy or thesis, gather sources (metadata-first → fetch → extracts), tag and cross-reference',
  // @ts-expect-error — federation remote, type comes from the MF runtime
  importMount: () => import('strategyCurator/mount'),
};

// SEARCH_AND_ADD_REMOTE — the "Augment from DB" flow's search surface
// (spec D2): launched from any 🔍 on the org-workbench card via
// augment-it:search-request + augment-it:navigate, it tiles next to the
// card through the orgWorkbench+searchAndAdd pairing. Pair-only, not a
// numbered rotation step — the same surface will serve person cards and
// other flows. See context-v/specs/Augment-From-DB-Flow.md §Phase 3.
export const SEARCH_AND_ADD_REMOTE: RemoteEntry = {
  id: 'searchAndAdd',
  label: 'Search & Add',
  description: 'Editable-term web search through the provider palette — one-click add to the launching entity',
  // @ts-expect-error — federation remote, type comes from the MF runtime
  importMount: () => import('searchAndAdd/mount'),
};

// SEARCH_RESULTS_REMOTE — the queue where every agent search lands. Like
// CHAT_REMOTE, a persistent rail companion (right side, chat's mirror), NOT
// a rotation step or a pairing: searches fire from every flow, so the queue
// must be reachable from every flow (spec D4). The shell owns its toggle
// (🔎 queue) + visibility persistence.
// See context-v/specs/Search-Results-Queue-Remote.md.
export const SEARCH_RESULTS_REMOTE: RemoteEntry = {
  id: 'searchResults',
  label: 'Search queue',
  description: 'Every agent search as a card — status, elapsed vs typical, expand to accept, dismiss when dealt with',
  // @ts-expect-error — federation remote, type comes from the MF runtime
  importMount: () => import('searchResults/mount'),
};

const EXTRA_REMOTES: RemoteEntry[] = [
  CHAT_REMOTE,
  SEARCH_RESULTS_REMOTE,
  PACK_RUNNER_REMOTE,
  SORT_FILTER_LENS_REMOTE,
  PERSON_ENRICHMENT_REMOTE,
  STRATEGY_CURATOR_REMOTE,
  SEARCH_AND_ADD_REMOTE,
];

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
  {
    // Augment from DB (spec D2): the org card keeps the majority; the
    // search-results rail rides on the right. Opened by the 🔍's
    // augment-it:navigate {remoteId:'searchAndAdd'} — appended LAST so
    // PAIRINGS[0] (the default pair) is unchanged.
    key: 'orgWorkbench+searchAndAdd',
    left: 'orgWorkbench',
    right: 'searchAndAdd',
    defaultLeftPct: 55,
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
