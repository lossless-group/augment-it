// The federated remotes the shell can mount, and the co-existence pairings.
//
// Adding a remote is a REMOTES entry + a `remotes` map line in
// rsbuild.config.ts — nothing else in the shell. Adding a co-existence
// pairing is a PAIRINGS entry.

export type RemoteEntry = {
  id: string;
  label: string;
  description: string;
  // Federation dynamic import. The module exposes a single mount function
  // (any name, or a default export) — see MountHost's generic loader.
  importMount: () => Promise<Record<string, unknown>>;
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
    key: 'recordCollector+promptTemplateManager',
    left: 'recordCollector',
    right: 'promptTemplateManager',
    defaultLeftPct: 30, // record-collector 30 / prompt-template-manager 70
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
  return REMOTES.find((r) => r.id === id);
}
