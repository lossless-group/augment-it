---
title: "Shell & Micro-Frontend UX Coherence — Refactor Plan"
lede: "Sequence the eight locked decisions from the UX Coherence spec into five phases that land on `refactor/ux-streamlining`. Foundation first (Deck→Flow rename so every later phase speaks the right vocabulary), then mechanical polish that's independently shippable (peek labels, pack-selection helpers, off-mode hide), then the hierarchical Flow widget (bubble progress strip + icon-tooltip layout sub-options), then 'Augment This Set' with the record-set pre-selection unification, then harvest the cross-cutting principles into a living doc. Architectural open questions (enrichment-surface composition, Flow-widget default position) are spiked but not allowed to block the visible UX wins."
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.2
revisions:
  - 2026-06-01 — Initial draft (0.0.0.1).
  - 2026-06-01 — Replaced Phase 2a's "none/solo/all helpers on flat pack
    list" with a new Phase 3 — **bundle-first Pack Runner**. The original
    spec Decision §1 was conservative on purpose, but reconciling against
    [[../blueprints/Packs-and-Bundles-Pattern]] showed that polishing the
    flat-list model would cement the wrong mental model right before the
    bundle migration. Better to introduce Bundle as the primary selector
    now and let `none`/`solo`/`all` become roster-override helpers on a
    bundle's pack roster, where they belong. Subsequent phases renumbered.
tags:
  - Plan
  - Augment-It
  - Shell
  - Micro-Frontends
  - Refactor
  - UX
  - Flow-Widget
  - Discoverability
status: Draft
---

# Shell & Micro-Frontend UX Coherence — Refactor Plan

## Source of record

[[../specs/Shell-and-Micro-Frontend-UX-Coherence]] — eight decisions locked
(2026-05-28 / 2026-06-01), cross-cutting principles seeded, per-surface
audit partial. This plan is the *execution sequence* for those decisions
on a single refactor branch.

## Branch

**`refactor/ux-streamlining`**, cut from the current tip of
`feature/packs-and-bundles` (= `rebuild/turbo-rsbuild`, parity restored
2026-06-01 at `5c7efb2`). PR target: `feature/packs-and-bundles` per the
three-tier model (`development → main → master`).

## Sequencing rationale

The eight decisions are not peers. Three buckets:

- **Vocabulary foundation** (§7 rename). Every subsequent phase references
  "Flow"; do the rename first so we don't bake the wrong noun into a new
  widget. Pure mechanical change, low risk, big legibility payoff.
- **Mechanical polish** (§1, §5-surface, §6). Independently shippable
  one-to-three-file changes. Visible wins early; reviewer confidence
  builds before the structural phase.
- **Structural** (§4, §5-composition, §8). New chrome (Flow widget +
  bubble strip), new set-level action wired through localStorage
  unification, and the open composition question for the enrichment
  surface. These deserve their own commits and possibly their own
  follow-up PR if §5-composition turns into a real spike.

§3 (live progress + nav button) is already in flight via
[[Run-as-First-Class-Operation]] Part 4 — referenced, not duplicated here.
§2 (defaults parked) and the Open-questions list stay parked.

## Phases

### Phase 0 — Branch + scope confirmation

- Cut `refactor/ux-streamlining` from current tip.
- Re-read the spec's Decisions §1–§8 with the user, confirm nothing has
  shifted since 2026-06-01.
- Stub this plan's acceptance log (per-phase ✅/⏳).

**Acceptance:** branch exists, plan committed, no code changes yet.

---

### Phase 1 — Deck → Flow rename (Decision §7)

Foundation. Touches a small, contained surface.

**Files:**
- `shell/src/App.svelte` — UI label at line ~199; comments at ~66, 103, 112.
- `shell/src/layout.svelte.ts` — `LayoutMode` literal `'peek-deck'` →
  `'peek-flow'` (line 15); default at 28; `defaultMode` at 32; comments
  at 6, 19, 20, 99.
- `shell/src/remotes.ts` — comments at 73, 85.
- Repo-wide grep for `peek-deck`, `Deck`, `deck` in shell/remote source
  and CSS to catch stragglers.

**Migration concern (locked in spec):** the persisted `STORAGE_KEY =
'augment-it:shell-layout'` JSON has `mode: 'peek-deck'`. On read,
translate `'peek-deck'` → `'peek-flow'` once, then write. One-line
defensive map in `readStored()`.

**Acceptance:**
- All visible "Deck" copy says "Flow".
- `pnpm build` + dev-loop smoke passes.
- Existing localStorage from before the rename still loads.

---

### Phase 2 — Mechanical polish (Decisions §5-surface, §6)

Two independent commits, parallelizable. (Decision §1 pack-selection
was pulled out into Phase 3 — see rationale below.)

#### 2a. Peek-deck position labels anchor left (Decision §6)

`shell/src/App.svelte` — `.peek-overlay { justify-content: center }` →
`flex-start`. Revisit `padding-top: 1.5rem`.

**Open implementation detail (flag at build time):** left-side vs
right-side peek neighbours — outer-left edge for both, or inner-edge?
Default to outer-left edge of the slice (label hugs the shell's outside
boundary); confirm by eye.

**Acceptance:** every peek-pane position label sits at the slice's left
margin, doesn't float center.

#### 2b. Enrichment-mode exclusive UI — icon-switcher surface only (Decision §5, surface portion)

`apps/prompt-template-manager/src/App.svelte` and
`apps/pack-runner/src/App.svelte`.

- Replace the verbose mode-tab buttons at the top of each pane with
  a small **icon-with-tooltip pair** (one icon for "custom prompt", one
  for "pre-built pack").
- Hide the off-mode body. PTM's PROMPTS list + NEW PROMPT form do not
  render when Pack Runner is the active mode, and vice versa. Read the
  shared mode from the existing `augment-it:enrichment-mode` event +
  localStorage — that's the smaller-change "option (b)" path.

**Deferring** the open question of wrapper-remote vs shared-state
composition to the spike (see below). Phase 2b gets the visible
behaviour with option (b)'s mechanics; if the spike picks option (a),
the icon switcher and hide-rule survive the refactor unchanged.

**Acceptance:** picking "pre-built pack" leaves only Pack Runner's body
visible; picking "custom prompt" leaves only PTM's. Icon switcher
present on both panes with consistent tooltips.

---

### Phase 3 — Bundle-first Pack Runner (supersedes spec Decision §1)

**Why this replaces Decision §1's helpers.** The spec was "conservative
on purpose" — keep the multi-select flat-pack-list and add `none`/`solo`/
`all`. But [[../blueprints/Packs-and-Bundles-Pattern]] says the
orchestration unit is a **bundle** — a named composition with 4-6 default
packs + opt-in extras, one chat verb per bundle, `bundle_id` on every
ResponseRecord. Today's Pack Runner (`apps/pack-runner/src/App.svelte:8-15`)
is a hardcoded list of 7 packs with no bundle anywhere in the model.
Polishing the flat list with helpers cements a model the blueprint says
is wrong. Better to introduce bundles now and let the helpers (`all` /
`none` / `solo`) become **roster-override** affordances *inside* a
bundle's pack panel, where they're conceptually correct.

#### Scope discipline — what's IN this phase, what's deferred

**IN this phase** (the minimum to make Bundle the primary selector):

1. **Shared bundle registry** as a TS module both Pack Runner and the
   social-search service can import. v1 location: `packages/bundles/`
   (graduates toward independent publication, per `ai-labs/packages/`
   convention) — or `services/social-search/src/bundles.ts` alongside
   `packs.ts` if a shared package is overkill for v1. Pick the smaller
   on day one; a v1 with one file lives in the service.
2. **Two bundles for v1**:
   - `profile-builder` — common five (LinkedIn, X, BlueSky, YouTube,
     Wikipedia) all `default: true`; Facebook + Instagram opt-in.
     Single-pass.
   - `profile-builder.nonprofit` — same common five + Wikipedia
     `default: true`; opt-in for the nonprofit-specific packs once
     they exist. Stub the entity-type plumbing even if the extra
     packs aren't built yet.
3. **Pack Runner UI**:
   - **Primary selector** — segmented control (or dropdown) of available
     bundles at the top of the Pack Runner pane. One selected at a time.
   - **Roster panel** — beneath the selector, the bundle's roster
     renders with `default: true` packs pre-checked. `default: false`
     packs render but unchecked. This is where the `all` / `none` /
     `solo` helpers from spec Decision §1 land — they operate on the
     **current bundle's roster**, not on a universe of all packs.
   - **Fire button copy** — `Fire <bundle.display_name>` on N rows,
     subline `K packs × N rows · K·N fetches`. (Honors blueprint
     §"Records, not cells, are the unit of intent.")
4. **Fire path**:
   - Pack Runner derives effective `pack_ids` = bundle's roster filtered
     by roster-overrides.
   - Calls `pack.fan_out` (existing verb) with `pack_ids` AND a new
     `bundle_id` parameter.
   - `pack.fan_out` writes `bundle_id` onto every ResponseRecord it
     produces. ResponseRecord type already declares `bundle_id?: string`
     per the blueprint — verify and wire.
5. **localStorage**:
   - Persist active bundle id under `augment-it:pack-runner:bundle-id`.
   - Persist per-bundle roster overrides as
     `augment-it:pack-runner:roster-overrides:<bundle_id>` so swapping
     bundles doesn't lose user tuning per bundle.

**DEFERRED to a follow-up plan** (these are bundle features the
blueprint defines but this refactor doesn't need to ship):

- Two-pass orchestration with data carry-forward between passes
  (blueprint §Bundle anatomy).
- Pre-flight `profiles.dedup.scan` (blueprint §"Every bundle invokes").
- `bundle-level render strategy` for per-row, per-bundle aggregate views.
- The chat verb registration (`profile-builder` as a one-shot chat verb)
  — that's [[In-App-Chat-v0-0-1-for-Augment-It]]'s problem.
- `pass: 1 | 2` per-pack roster fields beyond the data-model wiring.

#### Files touched (estimated)

- **NEW** `services/social-search/src/bundles.ts` — bundle registry + the
  two v1 bundles.
- `services/social-search/src/packs.ts` (or wherever `pack.fan_out` is
  implemented) — accept `bundle_id` arg; write to ResponseRecord on
  emit.
- `apps/pack-runner/src/App.svelte` — replace flat PACKS list with
  bundle selector + roster panel; relocate `none`/`solo`/`all` helpers
  into roster panel; new localStorage keys; fire button copy.
- ResponseRecord type definition (wherever it lives) — confirm
  `bundle_id?: string` is declared and threaded.

#### Risk register for Phase 3

- **`pack.fan_out` shape change.** Mitigation: `bundle_id` is optional
  on the input; old call sites (if any besides Pack Runner) still work.
- **Migration from flat-list localStorage state.** Mitigation: on first
  load, if no bundle is selected and the old `enabledPackIds` storage
  exists, pick `profile-builder` as default; ignore the old key.
- **The "Augment This Set" landing (Phase 5) assumes Pack Runner opens
  ready-to-fire.** Mitigation: Phase 3 ships the default-bundle auto-
  selection (`profile-builder` if no last-used bundle), so Phase 5's
  landing path works.

**Acceptance:**
- Pack Runner shows a bundle selector with two bundles.
- Picking a bundle reveals its roster with correct defaults.
- `all`/`none`/`solo` work as roster-overrides within the selected bundle.
- Fire writes `bundle_id` to every ResponseRecord produced.
- Bundle choice + roster overrides persist per bundle across reloads.

---

### Phase 4 — Hierarchical Flow widget (Decision §8)

The biggest chrome change. New component, replaces the flat
`ModeToggle`-style segment with a three-tier widget.

**New component:** `shell/src/FlowWidget.svelte` (or extend
`ModeToggle.svelte` — decide by size; new file if the tier-2 strip is
non-trivial).

**Tiers:**
1. The word **Flow**, raised — visual parent.
2. **Bubble progress strip** — `REMOTES.map((r, i) => bubble(i, r.label, r.description))`.
   Active step = `layout.focusIndex`. Click a bubble = dispatch
   `augment-it:navigate` with `{ remoteId: REMOTES[i].id }`. Tooltip body
   from `REMOTES[i].description`.
3. **Split / Full** as small icon-with-tooltip toggles (same affordance
   pattern as Phase 2c).

**Position-toggle:** swap widget between top (horizontal bubble row,
current location) and left-hand column (vertical bubble row). Persist
the choice in `ShellLayout` as a new field (`flowWidgetPosition: 'top'
| 'left'`). **Default: `'top'`** (minimal layout disruption — argued
in spec Open questions).

**Coherence with Phase 2a:** when `flowWidgetPosition === 'left'`,
the left-anchored peek labels collapse into the rail (same information
twice is silly). Either suppress `.peek-overlay` rendering in left
mode, or visually merge.

**Open question pinned at build time:** the `REMOTES` rotation has
`promptTemplateManager` as a discrete step. With Decision §5 unifying
PTM ⇄ Pack Runner, should the strip render **one "Enrichment" bubble**
covering both, or two? Spec leans "one." Implementation: a small
`flowSteps` projection over `REMOTES` that collapses adjacent
PTM+packRunner entries into a single virtual step. Default to one.

**Acceptance:**
- Flow widget renders with parent label, bubble strip, Split/Full
  icon toggles.
- Bubble click navigates; tooltip reveals step name.
- Active bubble highlights from `focusIndex`.
- Position toggle works; persists.
- Left-column mode does not double-render peek labels.

---

### Phase 5 — "Augment This Set" + record-set pre-selection unification (Decision §4)

`apps/record-collector/src/App.svelte` — add the set-level button next
to (not replacing) the per-row `enrich ›`.

**Mechanic locked in spec:**
- Set the active record set in localStorage (key TBD — see implementation
  detail below) **before** dispatching nav.
- Dispatch `augment-it:navigate` with `{ remoteId: 'packRunner' }`.
- `packRunner` isn't in `REMOTES` rotation → shell's nav handler falls
  through to PAIRINGS → `layout.openPair('packRunner+promptTemplateManager')`.

**Implementation detail to resolve in this phase:** Pack Runner reads
`localStorage['augment-it:pack-runner:record-set']`; Prompt Template
Manager has its own key. **Unify** to a single shared key
(`'augment-it:active-record-set'` is a reasonable name) that both
remotes read, with one-time backward-read of each remote's old key for
migration. This is the prerequisite for Decision §4's "one write
pre-selects both."

**Acceptance:**
- "Augment This Set" button visible once a record set is selected in
  Record Collector.
- Click opens the PTM ⇄ Pack Runner split with the chosen record set
  pre-loaded on both sides.
- Existing per-row `enrich ›` continues to work unchanged.

---

### Phase 6 — Cross-cutting principles + per-surface audit harvest

Write up the cross-cutting principles section that the spec seeded but
left as a TBD comment. Promote from "candidates" to a stable list once
the phases above have proven them in code. Likely landing place: a
small companion doc `context-v/blueprints/Shell-UX-Coherence-Principles.md`
the spec links to, or appended to the spec's §Cross-cutting principles.

Also: fill in the four `needs-audit` surfaces (Request Reviewer, Chat,
Shell-rest, Enhanced-Records-promote-flow) with whatever this refactor
surfaced about them.

**Acceptance:** principles list exists as a stable doc; per-surface
audit table has no remaining `needs-audit` rows OR the remaining ones
have explicit "deferred to spec X" notes.

---

## Architectural spike (parallel to Phase 4, gate before Phase 5 final commit)

**Enrichment-surface composition (Decision §5 open question):**
should PTM + Pack Runner be wrapped in a single `enrichmentSurface`
parent remote, or stay separate remotes sharing mode state via the
existing window event?

Argument for **(a) wrapper remote**: cleaner conceptual unit; the
Flow widget's "one Enrichment bubble" question (Phase 3) answers
itself; one tile owns the icon switcher.

Argument for **(b) shared-state**: smaller change; preserves the
existing pairing; Phase 2c already works with this shape.

**Spike output:** a one-pager appended to this plan (or a child
context-v note) recommending (a) or (b), with an estimated
file-touch surface. **Gate:** don't ship Phase 5's final commit until
this resolves, because "Augment This Set"'s target — `packRunner` vs
a new `enrichmentSurface` remote — depends on it.

---

## Risk register

- **Deck→Flow localStorage migration (Phase 1).** Mitigation: one-line
  defensive map in `readStored()`. Test by hand-editing the stored
  JSON before launch.
- **Bubble click → navigate semantics (Phase 3).** `augment-it:navigate`
  is the existing primitive; if a remote doesn't handle it cleanly
  the click silently fails (a Dead-shape failure per the spec's own
  taxonomy — ironic). Mitigation: verify each `REMOTES[i].id` resolves
  to a registered handler before wiring the click.
- **Phase 4 left-column position-toggle interacts with Phase 2a peek
  labels.** Mitigation: build the toggle last within Phase 4 and pair
  with the peek-label rendering rule explicitly.
- **Phase 5 record-set key unification breaks in-flight runs.**
  Mitigation: read both old keys, write the new key, keep writing the
  old keys for one release; remove old-key writes in a follow-up PR.

## Out of scope (parked)

- Entity-name foot-gun warning (spec §2, Open questions).
- Default-scope nudge for first run (spec §2, Open questions).
- API-First In-App Documentation (spec Wish list, stubbed separately).
- Augment-it's dual-identity blueprint (stubbed separately).
- Initial-User-Experience spec (stubbed separately).
- Auth-Patterns blueprint (stubbed separately).

## Acceptance log

| Phase | Status | Branch tip | Notes |
|---|---|---|---|
| 0 — Branch + plan | ⏳ | — | this commit |
| 1 — Deck→Flow rename | ⏳ | — | |
| 2a — Peek labels anchor left | ⏳ | — | |
| 2b — Enrichment-mode exclusive UI | ⏳ | — | |
| 3 — Bundle-first Pack Runner | ⏳ | — | supersedes spec §1 helpers |
| 4 — Flow widget | ⏳ | — | |
| 5 — Augment This Set + key unification | ⏳ | — | gated on spike |
| 6 — Principles + audit harvest | ⏳ | — | |
| Spike — enrichment composition | ⏳ | — | gates Phase 5 |

## Related

- [[../specs/Shell-and-Micro-Frontend-UX-Coherence]] — source of record
- [[Run-as-First-Class-Operation]] — owns §3 (live progress + nav)
- [[../blueprints/Module-Federation-Rsbuild-Dev-Loop-Gotchas]] — shell
  federation mechanics this refactor builds on
- [[../blueprints/Packs-and-Bundles-Pattern]] — Triage Surface UX
  Requirements section sits adjacent to Phase 2a
- [[../reminders/Pickup-2026-06-01]] — session-resume notes
