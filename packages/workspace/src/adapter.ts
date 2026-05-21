// WorkspaceAdapter — typed interface the @lossless/in-app-agent chat package
// consumes when it mounts inside augment-it. The adapter is the *only*
// surface chat speaks to; it has no domain knowledge of augment-it itself.
//
// Phase 1 stubs the shape. Filled out alongside the chat package's walking
// skeleton (see ai-labs/context-v/plans/In-App-Agent-Chat-Walking-Skeleton.md).

import { workspace } from './state.svelte';
import type { ActiveView, RecordSet, Row } from './types';

export type WorkspaceAdapter = {
  getActiveView: () => ActiveView;
  getRecordSets: () => Record<string, RecordSet>;
  getRows: () => Record<string, Row>;
  invoke: (capability: string, args: unknown) => Promise<unknown>;
  subscribe: (listener: () => void) => () => void;
};

export function createAdapter(): WorkspaceAdapter {
  return {
    getActiveView: () => workspace.activeView,
    getRecordSets: () => workspace.record_sets,
    getRows: () => workspace.rows,
    invoke: (capability, args) => workspace.invoke(capability, args),
    subscribe: (_listener) => {
      // Svelte 5 $state mutations are tracked via $effect at the call site.
      // Adapter consumers that aren't Svelte components will get a real
      // subscription mechanism wired in alongside the chat package.
      return () => {};
    },
  };
}
