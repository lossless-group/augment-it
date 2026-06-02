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

// The composite previously named ENRICHMENT_COMPOSITE; renamed
// 2026-06-01 to AUGMENT_COMPOSITE per spec Decision §11. The verb the
// product uses is "augment" (the app is augment-it, the button from
// Record Collector says "Augment This Set →"), and "Enrichment" was
// data-engineering-speak that didn't match. Slot id, label, and
// modeKey all carry the new vocabulary; the legacy modeKey is read
// once as a migration fallback so existing users don't lose state.
export const AUGMENT_COMPOSITE: CompositeEntry = {
  id: 'augment',
  kind: 'composite',
  label: 'Augment',
  description: 'Author a custom prompt OR fire a pre-built pack against the record set',
  modeKey: 'augment-it:augment-mode',
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

/** @deprecated Use AUGMENT_COMPOSITE. Re-exported for one release. */
export const ENRICHMENT_COMPOSITE = AUGMENT_COMPOSITE;

export const COMPOSITES: CompositeEntry[] = [AUGMENT_COMPOSITE];

// Legacy modeKey we read once during migration so users who saved
// state under the old key don't lose their last-active member.
const LEGACY_MODE_KEYS: Record<string, string> = {
  'augment-it:augment-mode': 'augment-it:enrichment-mode',
};

export function compositeById(id: string): CompositeEntry | undefined {
  return COMPOSITES.find((c) => c.id === id);
}

/** Read the active member id for a composite from localStorage. */
export function readActiveMemberId(c: CompositeEntry): string {
  if (typeof localStorage === 'undefined') return c.defaultMemberId;
  // Read the canonical key first; if absent, fall back to the legacy key
  // (Decision §11's Enrichment → Augment rename). One-time read; future
  // writes only touch the canonical key.
  let stored = localStorage.getItem(c.modeKey);
  if (!stored) {
    const legacyKey = LEGACY_MODE_KEYS[c.modeKey];
    if (legacyKey) stored = localStorage.getItem(legacyKey);
  }
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
