---
date_created: 2026-06-01
date_modified: 2026-06-01
title: "Composite Slots & the Flow Rename — One Toggle, Every Layout Mode"
lede: "We thought the spec called for two patches and a rename. Halfway through the second patch the architecture broke in our face — a Split view with a working ✎/⊞ toggle but a stubbornly empty pane next to it — and we realized the toggle didn't belong inside either remote, it belonged to the slot. The fix turned into a shell-level concept that pays off in every layout mode."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
files_changed:
  - context-v/plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor.md
  - shell/src/App.svelte
  - shell/src/layout.svelte.ts
  - shell/src/remotes.ts
  - shell/src/composites.ts
  - shell/package.json
  - packages/shared-ui/src/ToggleHeader__PromptOrPackage--Icons.svelte
  - packages/shared-ui/package.json
  - apps/prompt-template-manager/src/App.svelte
  - apps/prompt-template-manager/src/app.css
  - apps/pack-runner/src/App.svelte
  - apps/pack-runner/src/app.css
---

# Composite Slots & the Flow Rename

## Why Care?

If you've used augment-it, you've felt the moment where you pick "Pre-built
Pack →" inside Prompt Templates, the right pane lights up Pack Runner, and
**the left pane stays showing the prompt editor underneath**. Two flows
compete for the eye, the seam is uglier than the work, and you start to
wonder which thing you're actually about to fire.

This shipment fixes that. The enrichment surface is now a single slot in the
shell — Prompt Templates *or* Pack Runner, never both — with a tiny ✎/⊞
toggle at the top of the slot that swaps which one you see. And because the
toggle is owned by the slot rather than by either remote, it works the same
way in **Flow** (left-to-right workflow), **Split** (two cooperating
panes), and **Full** (one pane, full bleed). It's the same control no
matter which perspective you're in.

We also rebranded the top-left mode segment from **Deck / Split / Full** to
**Flow / Split / Full**. "Deck" connoted *presentation slides*; the actual
interaction is a left-to-right workflow — Record Collector → Enrichment →
Request Reviewer → Response Reviewer → Enhanced Records. "Flow" matches
the model, and it sets up the next phase (a numbered bubble progress strip
showing *where you are* in the workflow).

## What's New?

- **Deck → Flow** across the shell, with a one-line localStorage migration
  so existing layout preferences survive the rename.
- **Peek-deck position labels** ("REQUEST REVIEWER", and the analogous
  per-pane labels for every neighbour) now **anchor to the slice's left
  margin** instead of floating in the center. They read as landmarks, not
  floating titles.
- **Composite slot** — a new shell-level concept. A slot can host
  one-of-N remotes based on shared state. The shell renders a tiny
  icon-with-tooltip toggle as the slot's header and mounts only the active
  member.
- **`ENRICHMENT` composite** — `{ Prompt Templates, Pack Runner }` with the
  ✎ / ⊞ toggle. Replaces the old "pair of side-by-side enrichment remotes"
  pattern. Default member: Pack Runner.
- **Shared-UI component** `ToggleHeader__PromptOrPackage--Icons.svelte` —
  pure presentation, lives in `@augment-it/shared-ui` so anything else that
  needs a binary-icon header can reuse it.
- **Composites are peers in the Flow rotation.** Introduced `ROTATION` as
  an ordered list of slot ids (remotes *and* composites). The rotation is
  now: Record Collector → **Enrichment** → Request Reviewer → Response
  Reviewer → Enhanced Records.
- **Cross-remote navigation aware of composites.** Dispatching
  `augment-it:navigate { remoteId: 'packRunner' }` from anywhere in the
  app now sets Enrichment's active member to Pack Runner *and* focuses
  the Enrichment slot — whether you land there in Flow, Split, or Full.

All on the new `refactor/ux-streamlining` branch, with a plan doc that
tracks the six phases and the spike that resolved itself in the act of
trying to ship around it.

## How It Works

### A spec, then a plan, then a fork in the road

A few days ago, prepping a demo, we hit a chain of small "I can't
find / reach / trigger X" failures across Pack Runner, Enhanced Records,
and Response Reviewer. Each one was a one-line patch. Together they told
us the shell's affordances had a coherence problem. We wrote that up as
the [[Shell-and-Micro-Frontend-UX-Coherence]] audit spec — eight locked
decisions, twelve pieces of evidence, four named failure shapes
(`hidden`, `dead`, `mismatched`, and the emerging `misnamed`).

This week we sequenced those eight decisions into a six-phase refactor
plan and cut the `refactor/ux-streamlining` branch off the current tip.
The phases, briefly:

```
Phase 0 — branch + plan                              ✅ committed
Phase 1 — Deck → Flow rename (vocabulary foundation) ✅ shipped
Phase 2 — mechanical polish:
  2a — peek labels anchor left                       ✅ shipped
  2b — enrichment icon-switcher (intra-remote)       ↩︎ superseded
  2c — composite slot + shared toggle                ✅ shipped
  2d — composites are peers in Flow rotation         ✅ shipped
Phase 3 — bundle-first Pack Runner                   ⏳ next
Phase 4 — hierarchical Flow widget (Decision §8)     ⏳
Phase 5 — Augment This Set                           ⏳
Phase 6 — principles + audit harvest                 ⏳
```

The story below is the journey through Phase 2.

### Phase 1 — Deck → Flow

The smallest possible change: rename the literal `'Deck'` button label,
rename the `LayoutMode` type literal `'peek-deck'` to `'peek-flow'`,
update the comments that name the mode, and add a one-line migration in
`readStored()` so any persisted `'peek-deck'` value maps to `'peek-flow'`
on read.

```ts
// shell/src/layout.svelte.ts
function migrateMode(mode: unknown): LayoutMode | undefined {
  if (mode === 'peek-deck') return 'peek-flow';
  if (mode === 'peek-flow' || mode === 'co-existence' || mode === 'full') return mode;
  return undefined;
}
```

The historical context-v doc `Build-the-Shell-Tiling-and-Peek-Deck.md`
stays — its filename is its identity, and renaming the doc to chase the
new vocabulary is exactly the sort of "going around fixing old things"
we try to avoid.

### Phase 2a — Peek labels anchor left

Spec Decision §6: the vertical per-pane labels (the ones reading top-to-
bottom in each peek slice — "REQUEST REVIEWER", "RECORD COLLECTOR",
etc.) had been horizontally centered in the slice since the first cut
of the tiling shell. Floating in the middle of nothing. The user named
this the canonical example of *"things we did early and never came
back to"* — a category of UX debt this audit keeps flagging.

```css
/* shell/src/App.svelte */
.peek-overlay {
  /* was: justify-content: center */
  justify-content: flex-start;
  padding-left: 0.75rem;  /* sit in a small gutter, not flush */
}
```

Small change, but the landmarks now sit where the eye looks for them.

### Phase 2b — the first attempt that wasn't quite right

The spec calls for the Prompt Templates ⇄ Pack Runner enrichment pair to
become **exclusive UI**: when you're in pack mode the prompt editor
hides, and vice versa. The two large mode-tab buttons at the top of each
pane collapse into a small icon-with-tooltip pair.

We shipped that — inside each remote. PTM got the ✎/⊞ icon-switcher,
wrapped its body in `{#if enrichmentMode === 'prompt'}`. Pack Runner got
the symmetric treatment. Builds clean, tooltips read well, the icons
are tight.

We pushed it to the running shell and looked at the Split view.

![Split view showing a working toggle in the right pane and an empty left pane](no-image-here-this-is-prose)

**The left pane was empty.** Or — more precisely — PTM was mounted, its
status bar showed at top, but the body had hidden itself because the
shared mode was `'pack'`. Pack Runner on the right showed its full UI.
Two slots, one empty, one full. The icon-switcher worked perfectly,
flipping a single piece of localStorage state that the *other* pane
also read — but the shell still treated the pair as a co-existence
pair. It mounted both remotes side-by-side; one just rendered nothing.

We had built a feature inside the wrong scope. The toggle pretended to
be a mode switch, but the architecture remained a co-existence split.

### Phase 2c — the architectural fix

The user called the question directly: *"is this a nested remote, or
a shared UI component?"* It was both, but neither answered by itself.

We laid out three options:

| Option | Shape | Verdict |
|---|---|---|
| **A** | New federated `enrichmentSurface` wrapper remote that mounts PTM or Pack Runner internally | Clean but adds a federation hop and a new module to maintain |
| **B** | Just a shared-UI toggle component used by both remotes | Doesn't solve the side-by-side problem; the shell still mounts both as a pair |
| **C** | The shell learns about a "composite slot" — one slot that hosts one-of-N remotes based on shared state. The shared-UI toggle becomes the slot's header. | ✅ smallest correct change |

We picked C, and that turned out to be the **same architectural
question the plan had flagged as a spike** ("enrichment-surface
composition — wrapper remote vs shared-state"). The act of trying to
ship the wrong shape made the right shape visible. So we resolved the
spike inside Phase 2c instead of waiting on a separate investigation.

Here's the concept, in code:

```ts
// shell/src/composites.ts (NEW)
export const ENRICHMENT_COMPOSITE: CompositeEntry = {
  id: 'enrichment',
  kind: 'composite',
  label: 'Enrichment',
  description: 'Author a custom prompt OR fire a pre-built pack against the record set',
  modeKey: 'augment-it:enrichment-mode',
  members: [
    { remoteId: 'promptTemplateManager', icon: '✎', label: 'Custom prompt — author a free-text LLM prompt' },
    { remoteId: 'packRunner', icon: '⊞', label: 'Pre-built pack — fire a source-bound pack against the record set' },
  ],
  defaultMemberId: 'packRunner',
};
```

A `PAIRING` half can now reference either a remote id (the common case)
or a composite id. The shell's `slotById()` resolves either kind:

```ts
// shell/src/remotes.ts
export type Slot =
  | { kind: 'remote'; remote: RemoteEntry }
  | { kind: 'composite'; composite: CompositeEntry };

export function slotById(id: string): Slot | undefined { /* ... */ }
```

And the rendering: when the materialized stage item carries a
composite, the shell renders the shared toggle header above the mount.
The shared-UI component (`packages/shared-ui/src/ToggleHeader__PromptOrPackage--Icons.svelte`)
is pure presentation — receives `{ members, activeId, onSelect }` and
owns no state of its own. The shell owns the mode; the toggle
component owns the pixels.

The two former pairings `recordCollector+promptTemplateManager` and
`packRunner+promptTemplateManager` collapse into one:
`recordCollector+enrichment`. PTM and Pack Runner lose their intra-
remote mode-switch UI entirely — that revert is part of the same
commit because the shell is now the single source of truth for the
mode.

### Phase 2d — make it work in every layout mode

We reloaded the shell, flipped to Split, and the toggle worked beautifully.
We flipped to Flow, walked into the enrichment slot... and the toggle
was absent. PTM rendered as a normal rotation step. The composite was
invisible in Flow mode.

The user named the gap: *"this is a user-defined toggle so should work
in both perspectives."*

The fix required separating two concerns the shell had been conflating:

1. **What federated remotes exist** (registry) — `REMOTES`
2. **What slots are in the rotation** (order) — needed a new concept

We introduced `ROTATION` as a peer to `REMOTES`:

```ts
// shell/src/remotes.ts
export const ROTATION: string[] = [
  'recordCollector',
  'enrichment',          // composite — PTM ⇄ Pack Runner via in-slot toggle
  'requestReviewer',
  'responseReviewer',
  'enhancedRecordsList',
];
```

Everything that walks the rotation — peek-flow, full mode,
`commitFocus`, the `augment-it:navigate` handler, even
`layout.setFocusIndex`'s clamping — switched to iterate `ROTATION` via
`slotById`. `REMOTES` stays as the federated-registry that
`remoteById()` consults.

The Composite slot now appears as a first-class rotation step in
every layout mode. In Flow, it carries the ✎/⊞ toggle at the top of
the focused slice. In Split, same toggle on the right of Record
Collector. In Full, same toggle when you've drilled into the Enrichment
step.

One more subtlety: `MountHost` only runs its dynamic import in
`onMount` — so when the user flips the toggle, the existing MountHost
sees a new `remote` prop but its already-mounted member doesn't
unmount. The fix is a Svelte `{#key}` block around the mount so the
toggle change forces a re-mount cleanly:

```svelte
{#if item.composite}
  <ToggleHeader ... />
  {#key activeMembers[item.composite.id]}
    <MountHost remote={item.remote} />
  {/key}
{:else}
  <MountHost remote={item.remote} />
{/if}
```

## Under the Hood

### The audience cascade the refactor enables

Phase 2's whole point is that the **enrichment surface is now one slot,
not two.** The user's mental model has always been "I picked a record
set; now augment it." The previous architecture forced them to pick
which authoring flavor *and* which pane to look at. The composite
slot collapses that into one decision (which member to toggle to) and
keeps it portable across every layout mode.

This is the same impulse that drove the spec's Decision §4 ("Augment
This Set" — a set-level action in Record Collector that lands you on
the enrichment slot pre-loaded) and Decision §8 (the hierarchical Flow
widget with numbered bubble progress, where Enrichment is *one bubble*
rather than two adjacent ones). Phase 2c+2d cleared the runway for
both of those follow-on phases by establishing that **composites are
the rotation unit** for enrichment.

### Phase 2b was right to ship and right to revert

It's tempting to call Phase 2b a mistake, but it wasn't. It shipped the
visible behavior (the icon-switcher pattern, the off-mode hide rule, the
shared-state mechanism) and it surfaced the architectural fork in the
most useful way possible — by trying it. The plan had flagged the spike
as "enrichment composition: wrapper remote vs shared-state" and slated
a separate investigation. Phase 2b *was* the investigation, just
disguised as an implementation. We commit-revert as a deliberate part
of the journey, not as a "we got it wrong" footnote — the revert lives
in the same commit as the Phase 2c work, with all the diff context
visible for anyone retracing the steps.

### The plan document tracks the journey

`context-v/plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor.md`
carries an acceptance log with each phase's status and the commit SHA
that landed it. It's at semantic version `0.0.0.3` after this drop —
v1 was the initial draft, v2 swapped Phase 2a (pack-selection helpers
on a flat list) for the bundle-first Phase 3 once we reconciled
against [[Packs-and-Bundles-Pattern]], v3 added Phase 2d after the
in-browser eyeball revealed the rotation problem.

If you want the full reasoning trail, the plan reads as the story of
the refactor; the spec reads as the source of decisions; this changelog
reads as the public-facing arc.

## Files Touched

**Plan & docs (NEW or substantive)**
- `context-v/plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor.md` —
  Phase 0 plan; updated through v0.0.0.3 with the spike resolution.

**Shell (the core of the change)**
- `shell/src/composites.ts` *(NEW)* — `CompositeEntry` type,
  `ENRICHMENT_COMPOSITE`, read/write/broadcast helpers.
- `shell/src/remotes.ts` — added `ROTATION`, `Slot` union, `slotById()`;
  collapsed three former PAIRINGS into one (`recordCollector+enrichment`).
- `shell/src/layout.svelte.ts` — `LayoutMode` literal `peek-deck` →
  `peek-flow`; one-time migration; clamping switched to `ROTATION.length`.
- `shell/src/App.svelte` — composite-aware stage builder, navigate
  handler, peek-label rendering, `{#key}` re-mount for composite
  toggles, peek labels anchored left.
- `shell/package.json` — `@augment-it/shared-ui` workspace dependency.

**Shared UI (NEW component)**
- `packages/shared-ui/src/ToggleHeader__PromptOrPackage--Icons.svelte` —
  pure-presentation icon-with-tooltip pair.
- `packages/shared-ui/package.json` — export.

**Remotes (revert of intra-remote mode UI)**
- `apps/prompt-template-manager/src/App.svelte`,
  `apps/prompt-template-manager/src/app.css` — removed mode-switcher
  block, EnrichmentMode state, body wrapper, and `.ptm-mode` CSS.
- `apps/pack-runner/src/App.svelte`, `apps/pack-runner/src/app.css` —
  symmetric revert.

## What's Next?

Phase 3 — **bundle-first Pack Runner**. The spec's Decision §1 ("keep
multi-select, add `none`/`solo`/`all` helpers") was conservative on
purpose, but reconciling against [[../blueprints/Packs-and-Bundles-Pattern]]
showed that polishing a flat 7-pack list cements a model the blueprint
says is wrong. Phase 3 introduces **Bundle** as the primary selector in
Pack Runner with two v1 bundles (`profile-builder` and
`profile-builder.nonprofit`), and lets `all` / `none` / `solo` become
roster-override helpers *inside* the chosen bundle — where they're
conceptually correct. `pack.fan_out` will accept an optional `bundle_id`
that lands on every ResponseRecord.

Phase 4 — the hierarchical **Flow widget** that replaces the flat
mode segment. Tier 1: the word "Flow" as parent. Tier 2: a numbered
bubble progress strip derived from `ROTATION` (now meaningful because
`enrichment` is one bubble, not two adjacent ones). Tier 3: Split /
Full as small icon-with-tooltip toggles beneath Flow — reusing the
exact pattern we just landed.

Phase 5 — **"Augment This Set"** in Record Collector, landing the user
on the Enrichment composite with the right record set pre-selected.

## Related

- [[../specs/Shell-and-Micro-Frontend-UX-Coherence]] — the audit spec
  with the eight locked decisions and the three failure shapes
- [[../plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor]] — the
  six-phase plan that this shipment closes Phases 0–2 of
- [[../blueprints/Packs-and-Bundles-Pattern]] — what Phase 3 will honor
- [[2026-06-01_02_Shell-UX-Coherence-Spec-Drop]] — earlier today's
  spec-drop changelog
- [[../plans/Run-as-First-Class-Operation]] — Part 4 (live progress + nav
  button) is adjacent to this work and still pending
