# @augment-it/workspace

The Svelte 5 singleton state container for augment-it. Source of truth for active view, rows, events, and user context. The chat package consumes this via the typed `WorkspaceAdapter`; federated remotes import the singleton directly.

Pattern: same as memopop's `FlowState` (`memopop-ai/apps/memopop-native/src/lib/stores/flow.svelte.ts`).

Phase 1: scaffold only — fields and signatures stubbed. See [`../../context-v/plans/Augment-It-Workspace-Walking-Skeleton.md`](../../context-v/plans/Augment-It-Workspace-Walking-Skeleton.md).
