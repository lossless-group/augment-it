// Composite slots — a shell-level concept where one slot in the layout
// hosts one-of-N remotes based on shared state. The shell renders a
// toggle header above the slot and mounts only the active member.
//
// Spec: context-v/specs/Shell-and-Micro-Frontend-UX-Coherence.md §5
// Plan: context-v/plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor.md §2c
//
// PAIRINGS can reference a composite by id the same way they reference
// a remote by id; slotById() in remotes.ts resolves either kind. The
// active member is persisted to localStorage under the composite's
// modeKey so the user's last choice survives reloads, and is broadcast
// via a window event so any peer surface that cares (e.g. analytics)
// can react without coupling.

export type CompositeMember = {
  remoteId: string;   // must resolve via remoteById()
  icon: string;       // single-glyph display in the toggle header
  label: string;      // tooltip + aria-label
};

export type CompositeEntry = {
  id: string;
  kind: 'composite';
  label: string;
  description: string;
  modeKey: string;             // localStorage key + window event name
  members: CompositeMember[];
  defaultMemberId: string;
};

export const ENRICHMENT_COMPOSITE: CompositeEntry = {
  id: 'enrichment',
  kind: 'composite',
  label: 'Enrichment',
  description: 'Author a custom prompt OR fire a pre-built pack against the record set',
  modeKey: 'augment-it:enrichment-mode',
  members: [
    {
      remoteId: 'promptTemplateManager',
      icon: '✎',
      label: 'Custom prompt — author a free-text LLM prompt',
    },
    {
      remoteId: 'packRunner',
      icon: '⊞',
      label: 'Pre-built pack — fire a source-bound pack against the record set',
    },
  ],
  defaultMemberId: 'packRunner',
};

export const COMPOSITES: CompositeEntry[] = [ENRICHMENT_COMPOSITE];

export function compositeById(id: string): CompositeEntry | undefined {
  return COMPOSITES.find((c) => c.id === id);
}

/** Read the active member id for a composite from localStorage. */
export function readActiveMemberId(c: CompositeEntry): string {
  if (typeof localStorage === 'undefined') return c.defaultMemberId;
  const stored = localStorage.getItem(c.modeKey);
  if (!stored) return c.defaultMemberId;
  // Backwards-compat: Phase 2b stored 'prompt' / 'pack' literals; map them
  // to the new remote-id values. Remove after one release.
  if (stored === 'prompt') return 'promptTemplateManager';
  if (stored === 'pack') return 'packRunner';
  // Validate it's a known member; otherwise fall back to the default.
  return c.members.some((m) => m.remoteId === stored) ? stored : c.defaultMemberId;
}

/** Write the active member id and broadcast the change. */
export function writeActiveMemberId(c: CompositeEntry, memberId: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(c.modeKey, memberId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(c.modeKey, { detail: { memberId } }));
  }
}

/** If a remote id belongs to a composite, return that composite. */
export function compositeFor(remoteId: string): CompositeEntry | undefined {
  return COMPOSITES.find((c) => c.members.some((m) => m.remoteId === remoteId));
}
