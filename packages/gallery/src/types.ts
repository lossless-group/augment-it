// The catalog vocabulary. One member declares one Catalog; the runtime in this
// package renders it. Nothing here knows anything about any particular member —
// prefix, root class and origin all arrive as data.
//
// Design note on WHY a member declares its catalog rather than the runtime
// discovering components by convention: discovery would find the files, but not
// the FIXTURES, and a component library without fixtures is a file listing.
// The expensive knowledge is "what states does this thing have" — that has to
// be written down by whoever owns the component.

import type { Component, Snippet } from 'svelte';

/** A live knob. The value here is the default; the panel edits a copy. */
export type ControlSpec =
  | { kind: 'text'; label?: string; value: string }
  | { kind: 'number'; label?: string; value: number; min?: number; max?: number; step?: number }
  | { kind: 'boolean'; label?: string; value: boolean }
  | { kind: 'select'; label?: string; value: string; options: readonly string[] };

/**
 * One named state of one entry. `props` are passed to the component/snippet.
 *
 * `setup` exists for the store-bound reality of this codebase: several members'
 * components read a runes singleton rather than taking props (corpora-curator's
 * read `curation`). Those components cannot be isolated by props alone, so a
 * fixture may seed the singleton instead. It runs at frame-init, before the
 * component renders, and `teardown` runs on frame destroy.
 *
 * A fixture that needs `setup` is telling you something: the component has an
 * ambient dependency. That is legal, and the Audit tab surfaces it, but a
 * prop-driven fixture is the better one wherever it is achievable.
 */
export type Fixture = {
  id: string;
  name: string;
  /** One line on what this state is for and why it is worth pinning. */
  note?: string;
  props?: Record<string, unknown>;
  setup?: () => void;
  teardown?: () => void;
  /** Frame width for this fixture, when the default is misleading. */
  width?: number;
  /**
   * The specimen is a whole surface, not a piece — give it a tall frame and let
   * it fill the height. Off by default: most members' root class sets
   * `height: 100vh`, and a chip rendered inside a 100vh box is not a specimen,
   * it is a scroll.
   */
  fill?: boolean;
};

export type EntryStatus = 'stable' | 'draft' | 'legacy' | 'deprecated';

export type EntryKind =
  /** A real Svelte component, rendered from its own module. */
  | 'component'
  /**
   * A class-based recipe with no component behind it — `.cc-card`, `.cc-row`,
   * the button variants. In a codebase whose measured problem was 158 button
   * rule-sets, the un-componentised recipes ARE the library, and a gallery that
   * only listed .svelte files would show none of them.
   */
  | 'pattern';

export type Entry = {
  id: string;
  name: string;
  kind: EntryKind;
  /** What it is and when to reach for it. Two sentences, not a paragraph. */
  summary: string;
  /** Repo-relative path, so the reader can go straight to the source. */
  source: string;
  status?: EntryStatus;
  /** Copyable call-site snippet. */
  usage?: string;
  /** Anything a consumer must do to keep this accessible. */
  a11y?: string;
  /**
   * The federal tokens this entry is BELIEVED to consume. Optional, and never
   * used to render anything — the Audit tab reads the real list off the matched
   * CSS rules and diffs it against this one, so a stale declaration shows up as
   * a finding rather than as a wrong swatch.
   */
  tokens?: readonly string[];
  /** A declared departure from the federal contract (F9). */
  deviation?: string;
  /**
   * kind: 'component'. Deliberately untyped in its props: the runtime spreads
   * whatever the fixture and the controls resolve to, and a catalog holding
   * seventeen unrelated components cannot name one prop shape. The typing that
   * matters happens at the call site inside the member, not here.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component?: Component<any, any, any>;
  /** kind: 'pattern' — a snippet taking the resolved props object. */
  snippet?: Snippet<[Record<string, unknown>]>;
  controls?: Record<string, ControlSpec>;
  fixtures: Fixture[];
};

export type Section = {
  id: string;
  title: string;
  blurb?: string;
  entries: Entry[];
};

export type Catalog = {
  /** Registry name from DESIGN.md frontmatter — e.g. `corpora-curator`. */
  member: string;
  /** Registry prefix — e.g. `sc`. Drives the F2/F3 containment audit. */
  prefix: string;
  /** Registry root class WITHOUT the dot — e.g. `cc-app`. Wraps every frame. */
  rootClass: string;
  /**
   * Where this member serves itself. The gallery's "open isolated" links point
   * here, so an isolated specimen is always reachable at the member's own
   * origin — including over the LAN, which is the whole point of isolating it.
   */
  origin: string;
  /** Repo-relative path to the member's DESIGN.md. */
  doc?: string;
  /** Repo-relative path to the member's spec. */
  spec?: string;
  blurb?: string;
  /**
   * Class names inside this member that legitimately carry no prefix — state
   * hooks like `active` or `err` that only ever appear alongside a prefixed
   * class. Without this list the containment audit reports them as leaks.
   */
  exemptClasses?: readonly string[];
  sections: Section[];
};
