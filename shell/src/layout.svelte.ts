// Shell layout state — which mode the tiling surface is in, where focus
// sits, the co-existence ratios. Svelte 5 singleton, same constructor-
// assignment $state pattern as @augment-it/workspace (so toolchain
// class-field lowering can't break $state placement).
//
// PERSISTENCE SEAM (per Build-the-Shell-Tiling-and-Peek-Deck.md): layout
// state is a User-scoped preference. Walking-skeleton storage is
// localStorage under a fixed key; the durable backing — when
// Shared-Auth-Core-Package lands — is a user_preferences slot. load()/save()
// are the one adapter; swapping the storage is swapping this file's two
// private functions, nothing else.

import { ROTATION, PAIRINGS } from './remotes';

export type LayoutMode = 'peek-flow' | 'co-existence' | 'full';

export type ShellLayoutPreference = {
  mode: LayoutMode;
  focusIndex: number;                       // peek-flow / full: position in REMOTES
  focusedWidthPct: number;                  // peek-flow: user-adjusted focused width
  coExistenceRatios: Record<string, number>; // pair key → left-panel %
  defaultMode: LayoutMode;
};

const STORAGE_KEY = 'augment-it:shell-layout';

const DEFAULTS: ShellLayoutPreference = {
  mode: 'peek-flow',
  focusIndex: 0,
  focusedWidthPct: 90,
  coExistenceRatios: {},
  defaultMode: 'peek-flow',
};

// One-time migration for the Deck → Flow rename (spec Decision §7).
// Old persisted snapshots have mode/defaultMode as 'peek-deck'; map to
// 'peek-flow' on read so existing users don't lose their layout.
function migrateMode(mode: unknown): LayoutMode | undefined {
  if (mode === 'peek-deck') return 'peek-flow';
  if (mode === 'peek-flow' || mode === 'co-existence' || mode === 'full') return mode;
  return undefined;
}

function readStored(): ShellLayoutPreference {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ShellLayoutPreference> & {
      mode?: unknown; defaultMode?: unknown;
    };
    const migrated: Partial<ShellLayoutPreference> = {
      ...parsed,
      mode: migrateMode(parsed.mode),
      defaultMode: migrateMode(parsed.defaultMode),
    };
    return { ...DEFAULTS, ...migrated, coExistenceRatios: { ...parsed.coExistenceRatios } };
  } catch {
    return { ...DEFAULTS };
  }
}

const FOCUSED_WIDTH_MIN = 40;
const FOCUSED_WIDTH_MAX = 96;
const RATIO_MIN = 15;
const RATIO_MAX = 85;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

class ShellLayout {
  mode: LayoutMode;
  focusIndex: number;
  focusedWidthPct: number;
  coExistenceRatios: Record<string, number>;
  defaultMode: LayoutMode;
  activePairKey: string | null; // co-existence: which pairing is showing

  constructor() {
    const p = readStored();
    this.mode = $state<LayoutMode>(p.mode);
    this.focusIndex = $state<number>(clamp(p.focusIndex, 0, ROTATION.length - 1));
    this.focusedWidthPct = $state<number>(clamp(p.focusedWidthPct, FOCUSED_WIDTH_MIN, FOCUSED_WIDTH_MAX));
    this.coExistenceRatios = $state<Record<string, number>>(p.coExistenceRatios);
    this.defaultMode = $state<LayoutMode>(p.defaultMode);
    this.activePairKey = $state<string | null>(PAIRINGS[0]?.key ?? null);
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    const snapshot: ShellLayoutPreference = {
      mode: this.mode,
      focusIndex: this.focusIndex,
      focusedWidthPct: this.focusedWidthPct,
      coExistenceRatios: { ...this.coExistenceRatios },
      defaultMode: this.defaultMode,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // storage disabled — layout still works for the session
    }
  }

  setMode(mode: LayoutMode): void {
    this.mode = mode;
    this.persist();
  }

  /** No wrap — clamped to the sequence ends. */
  setFocusIndex(index: number): void {
    this.focusIndex = clamp(index, 0, ROTATION.length - 1);
    this.persist();
  }

  /** Drag the focused panel's edge (peek-flow). */
  setFocusedWidth(pct: number): void {
    this.focusedWidthPct = clamp(pct, FOCUSED_WIDTH_MIN, FOCUSED_WIDTH_MAX);
    this.persist();
  }

  /** Drag the co-existence splitter. */
  setRatio(pairKey: string, leftPct: number): void {
    this.coExistenceRatios = {
      ...this.coExistenceRatios,
      [pairKey]: clamp(leftPct, RATIO_MIN, RATIO_MAX),
    };
    this.persist();
  }

  ratioFor(pairKey: string, fallback: number): number {
    return this.coExistenceRatios[pairKey] ?? fallback;
  }

  /** Enter co-existence mode for a given pairing. */
  openPair(pairKey: string): void {
    this.activePairKey = pairKey;
    this.mode = 'co-existence';
    this.persist();
  }
}

export const layout = new ShellLayout();
