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
    key: 'recordCollector+promptTemplateManager',
    left: 'recordCollector',
    right: 'promptTemplateManager',
    defaultLeftPct: 30, // record-collector 30 / prompt-template-manager 70
  },
];

export function remoteById(id: string): RemoteEntry | undefined {
  return REMOTES.find((r) => r.id === id);
}
