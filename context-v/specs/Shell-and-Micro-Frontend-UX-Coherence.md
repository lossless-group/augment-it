---
title: "Shell & Micro-Frontend UX Coherence — Affordances That Are Found, Consistent, and Talk Back"
lede: "One demo-prep session turned into a chain of 'I can't find / reach / trigger X' failures across Pack Runner, Enhanced Records, and Response Reviewer. Individually each was a one-line patch; together they're a verdict — the augment-it shell's affordances hide, die, or mismatch. This spec audits the whole shell + its micro-frontends through that lens and fixes the pattern, not just the instances."
date_created: 2026-05-28
date_modified: 2026-05-28
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Spec
  - Augment-It
  - Shell
  - Micro-Frontends
  - Module-Federation
  - Interaction-Model
  - Triage-UX
  - Discoverability
status: Draft
---

# Shell & Micro-Frontend UX Coherence

<!-- developing — notes + scope captured 2026-05-28; per-surface audit and
     cross-cutting principles still being filled in with the user -->

## Project context — augment-it's dual identity

Before the audit findings, a framing the user named on 2026-06-01 that
**every UX decision in this spec should be evaluated under both lenses**:

1. **augment-it is a working app.** It could plausibly have outside users.
   UX choices need to be legible and productive for someone whose only goal
   is to enrich a record set and ship the result.
2. **augment-it is also a demonstration of microservices + microfrontend +
   API-first architecture.** Every remote, the shell, and every service is a
   teaching surface for those patterns. UX choices that *make the architecture
   visible* (per-remote API docs, service boundaries, data flow) have value
   beyond pure usability — they're how a visitor sees the patterns at work.

These two lenses are often complementary but can pull in opposite directions
(an "outside user" wants polish that hides the seams; a "demonstration visitor"
wants the seams visible). This framing is bigger than UX coherence and
probably deserves its own blueprint — see *Wish list* below.

## Why this exists (the trigger)

Prepping a live demo on 2026-05-28, a chain of small "I can't find / reach /
trigger X" failures piled up in a single session — each individually a one-line
patch, but together a signal. The breaking-point complaint: *"there is no way to
select the pack I want to run. Something is very wrong with our UI."*

The realization: this isn't a Pack Runner bug. It's a **shell-wide coherence
problem**. The same three failure shapes recur across surfaces. This spec audits
the whole shell + its federated micro-frontends and fixes the *pattern*.

## Scope (decided with the user, 2026-05-28)

- **Breadth: the whole shell + all micro-frontends.** The trigger was Pack
  Runner; the failure pattern is system-wide, so the audit is too.
- **Pack selection: keep the multi-select fan-out model.** The fix is the
  *missing* helpers (`none` / "only this") + clearer copy — **not** a
  redesign of the interaction model. Conservative on purpose.
- **Defaults: out of scope for this spec.** The entity-name foot-gun and the
  all-rows × all-packs firehose are left **as-is** for now (parked in Open
  questions so they're not lost).

So: broad lens, conservative hands. Audit widely; change minimally.

## The systemic pattern — three failure shapes

Every issue this session fell into one of three classes. These are the lens for
the per-surface audit.

1. **Hidden** — the affordance exists and works, but the user can't *find* it.
   Primary action below the fold; no scroll cue (macOS overlay scrollbars);
   helpers present on one section but absent on a sibling.
   *Examples:* the Fire button below the fold; the PACKS section having no
   `none`/solo helper while the ROWS section has `all visible`/`none`.

2. **Dead** — the affordance is visible but does nothing useful, or silently
   the wrong thing.
   *Examples:* "Do another round of enhancements →" dismissed the banner
   instead of navigating; firing a SearXNG pack while its container was down
   produced no result and no error the user could see.

3. **Mismatched** — the same verb has a different interaction model on
   different surfaces, so a learned gesture fails.
   *Example:* "run a pack" is a single click-to-fire button in Response
   Reviewer's by-record view, but a multi-select fan-out in Pack Runner.

4. **Misnamed** *(emerging — N=1 so far)* — the label evokes a wrong mental
   model, so the user can't map it onto what the control actually does.
   *Example:* the top-left mode button reads "Deck", which connotes
   *presentation-slide deck* — but the underlying behaviour is a
   left-to-right *workflow*. The right word is "Flow". (See evidence #11,
   Decision §7.) Keep watching for more instances before promoting this
   shape formally.

## Evidence log (2026-05-28 session)

Raw capture, tagged by failure shape. The seed data for the audit.

1. **[Hidden + Mismatched] No "run just this pack" path.** PACKS renders all 7
   packs pre-checked with no `none`/solo helper; to run one pack you uncheck
   six. ROWS has `all visible`/`none`; PACKS doesn't.
2. **[Mismatched] Cross-surface "run a pack" verb.** Click-to-fire in Response
   Reviewer by-record; multi-select fan-out in Pack Runner.
3. **[Dead/foot-gun] Entity-name column silently wrong.** Set to `url` →
   searches URL strings, not names. No warning; rows render `unknown`/URLs.
   *(Parked — defaults out of scope this spec.)*
4. **[Hidden feedback] No live progress.** `pack.fan_out` blocks until all
   cells settle (672 cells default); Fire sits on "firing…" for minutes.
   Already [[../plans/Run-as-First-Class-Operation]] Part 4 (⏳ pending).
5. **[Dead/absent] No path to results.** Post-fire only set text "Switch to
   Response Reviewer"; no nav control. Also Run-plan Part 4 — never shipped;
   hand-added 2026-05-28.
6. **[Hidden/Dead] Below-fold + dead affordances.** Fire button below fold
   (sticky-pinned 2026-05-28); "Do another round" dead (fixed 2026-05-28).
7. **[foot-gun] Defaults nudge the worst run.** all×all = 672 cells, can
   exceed the 10-min workspace timeout. *(Parked — defaults out of scope.)*
8. **[Hidden/Mismatched] No set-level "next action" in Record Collector.**
   After choosing a record set, the only forward affordance is a *per-row*
   `enrich ›`. The user's mental model is set-level — "I picked this set, now
   augment it" — but the next step lives at the wrong grain. Named by the user:
   the missing button is **"Augment This Set."** (2026-05-28)
9. **[Mismatched] Off-mode surface stays visible in the enrichment split.**
   In the PTM ⇄ Pack Runner split, picking *Pre-built Pack →* highlights the
   right tab and brings Pack Runner forward, but **PTM's body still renders
   the prompt-authoring UI** (PROMPTS list, NEW PROMPT form) underneath.
   The mode toggle navigates but doesn't *hide* the now-off-mode flow, so
   both flows compete for the eye. User-proposed remedies: (a) hide the
   off-mode body; (b) collapse the two big tabs into **small icons with
   tooltips** (one for "custom prompt", one for "pre-built pack"); (c) at
   the architecture level, **wrap PTM + Pack Runner inside a single
   enrichment-surface remote**, or otherwise have one of them own the mode
   for both. (2026-05-28)
10. **[Hidden/legacy] Peek-deck position labels are centered, not anchored.**
    The vertical "REQUEST REVIEWER" (and the analogous deck-position
    indicators for every neighbour pane) renders **centered** in the peek
    slice — `.peek-overlay { justify-content: center }` in
    `shell/src/App.svelte` — so the label floats in the middle of the slice
    and visually competes with the active pane's content. User reads this
    as **legacy from the first cut, never revisited**. Fix: pin all deck-
    position labels to the pane's **left margin** (per Decision §6).
    Worth treating as the canonical example of *"things we did early and
    never came back to"* — a category of UX debt this audit should keep
    flagging. (2026-06-01)
11. **[Misnamed/legacy] "Deck" connotes presentation; the model is workflow.**
    The shell's top-left mode segment reads **Deck / Split / Full**. "Deck"
    evokes a *slide deck* (presentation), but the actual interaction is a
    **left-to-right workflow** — Record Collector → enrichment → Response
    Reviewer → Enhanced Records → promote. Rename: **"Deck" → "Flow"**
    everywhere it appears (UI label, `LayoutMode` type literal `peek-deck`,
    related CSS/comments). Surface area scoped: shell/src/App.svelte:199
    (UI label), shell/src/layout.svelte.ts:15 (type literal + default), plus
    comments in App.svelte and remotes.ts. (2026-06-01)
12. **[Hidden/Misnamed] Flow / Split / Full are peers, but they're not.**
    The current top-left segment treats Deck/Split/Full as three peer
    modes. Conceptually **Flow is the primary workflow concept**; Split
    and Full are *layout sub-options* of how to present the current Flow
    step (one pane full, or two cooperating). The flat segment hides that
    hierarchy AND hides the workflow itself — there's no visible
    indicator of *where in the flow you are*, of how many steps there
    are, or of what each step does. User-proposed shape:
    - **Flow** raised above Split/Full, as the parent.
    - **Numbered-bubble progress strip** beneath/beside the Flow label —
      `① → ② → ③ → ④ (→ ⑤)`, one bubble per REMOTES rotation entry,
      with **tooltips revealing the step name** (Record Collector, Prompt
      Templates, …). Current step is highlighted.
    - **Split / Full** sit beneath Flow as small icon-with-tooltip
      toggles (consistent with the icon-switcher pattern already locked
      in Decision §5 for enrichment mode).
    - **Position-toggle:** the whole Flow widget can swap between living
      at the **top** of the shell (current location, horizontal bubble
      row) and a **left-hand column** (vertical bubble row, persistent
      progress rail). Same information, two arrangements.
    Connects to Decision §6: the left-anchored peek-position labels are
    the **same "where am I" information** expressed beside each pane;
    the bubble strip is the same information rolled up at the top/side.
    (2026-06-01)

### Already patched this session (record so we don't double-spec)

- Sticky Fire button (`apps/pack-runner/src/app.css` — `.fire-card`
  `position: sticky`).
- "Response Reviewer →" nav button + live-results hint in Pack Runner
  (`apps/pack-runner/src/App.svelte`) — *this is Run-plan Part 4, done by hand;
  the real version subscribes to `run.updated`.*
- "Do another round" now dispatches `augment-it:navigate` to
  `promptTemplateManager` (`apps/enhanced-records-list/src/App.svelte`).
- (Operational, not UI) SearXNG container brought up; was never running.

## Per-surface audit

Scaffold — one entry per federated surface. Fill as we walk each. `needs-audit`
means no deliberate pass yet this session.

- **Shell** (peek-deck / split / cross-remote nav) — `augment-it:navigate`
  event works but is under-used; remotes don't all expose nav to their natural
  next step. **Peek/deck position labels are centered rather than anchored to
  the pane edge** — `.peek-overlay { justify-content: center }` in
  `shell/src/App.svelte` (legacy from the first cut). See evidence #10,
  Decision §6. Still `needs-audit` for the rest (discoverability of
  Deck/Split/Full mode buttons, chat rail framing).
- **Record Collector** — the only forward action is a *per-row* `enrich ›`
  button (`enrichRecord()` → `augment-it:enrich-record`, which the shell turns
  into "open the recordCollector+promptTemplateManager pair"). There is **no
  set-level forward action**. [Hidden/Mismatched] — the next step is at the
  wrong grain. **Decision: add "Augment This Set"** (Decisions §4).
- **Prompt Template Manager** — has the working `augment-it:navigate` (the
  model others should copy). But in the PTM ⇄ Pack Runner split, **PTM's body
  stays rendered even when the user has picked Pre-built Pack mode** — both
  off-mode and on-mode UI compete for the eye. See evidence #9. `needs-audit`
  for the rest of the surface.
- **Request Reviewer** — `needs-audit`.
- **Response Reviewer** — by-record triage view is the strong surface; auto-
  refreshes on `response.created`. Source of the "run a pack = click-to-fire"
  model that Pack Runner contradicts.
- **Enhanced Records List** — promote success banner had a dead primary button
  (fixed). `needs-audit` for the rest of the promote flow.
- **Chat** — `needs-audit`.
- **Pack Runner** — items 1–7 above. The most acute surface.

## Decisions locked this session

1. **Pack selection stays multi-select; add a `none` button + an "only this"
   per-pack affordance + a `solo`/"all" pair** mirroring the ROWS section, so
   narrowing to one pack is one click, not six un-clicks.
2. **Defaults unchanged** (entity-name + scope) — parked, see Open questions.
3. **Ship [[../plans/Run-as-First-Class-Operation]] Part 4 properly** rather
   than leaving the by-hand stand-ins: Pack Runner subscribes to `run.updated`
   for live per-outcome progress; the nav button stays.
4. **"Augment This Set" set-level action (Record Collector).** Once a record
   set is selected, a prominent, plainly-labelled **"Augment This Set"** button
   takes the *whole set* to enrichment. Complements, doesn't replace, the
   per-row `enrich ›`. **Both label and target locked by the user (2026-05-28):**
   - **Target:** open the **Prompt Templates ⇄ Pack Runner split** so the user
     chooses custom prompt OR pre-built pack — matches the existing "either/or
     for the same intent" pairing.
   - **Mechanic:** dispatch `augment-it:navigate` with `{ remoteId: 'packRunner' }`.
     `packRunner` isn't in the `REMOTES` rotation, so the shell's nav handler
     falls through to the PAIRINGS lookup and `layout.openPair(
     'packRunner+promptTemplateManager')` — exactly the split we want.
   - **Pre-selection detail (implementation):** before navigating, set the
     active record set so both surfaces restore it. Pack Runner reads
     `localStorage['augment-it:pack-runner:record-set']`; Prompt Templates has
     its own key — confirm/unify these so one write pre-selects both. (Open
     implementation detail, not a design fork.)
5. **Enrichment-mode is exclusive UI; the off-mode surface hides.** When the
   user picks a mode in the PTM ⇄ Pack Runner split, **only the chosen mode's
   body renders**; the other side hides. The two big tab-buttons collapse into
   **small icon-with-tooltip switchers** (one icon for "custom prompt", one
   for "pre-built pack") — replacing the verbose tabs that currently sit at
   the top of both panes. Label/affordance locked by the user (2026-05-28).
   *Architectural composition is the open detail* (see Open questions): wrap
   PTM + Pack Runner inside a single `enrichmentSurface` parent remote, vs.
   keep them as separate remotes that share mode state via the existing
   `augment-it:enrichment-mode` window event + localStorage.
6. **Peek-deck position labels anchor to the left margin.** The vertical
   per-pane indicators (e.g. "REQUEST REVIEWER", same for every neighbour)
   move from centered to **anchored at the pane's left margin** — they're
   landmarks, not floating titles. Locked by the user (2026-06-01).
   Mechanic: change `.peek-overlay { justify-content: center }` to
   `flex-start` (or equivalent) in `shell/src/App.svelte`; revisit the
   `padding-top: 1.5rem` so the label sits where the eye expects.
   Implementation detail: confirm whether left-side and right-side peek
   neighbours both want the label at the *outer* left edge, or at the
   *inner* edge (toward the active pane) — call out at build time.
7. **Rename "Deck" → "Flow" across the shell.** The top-left mode button
   becomes **Flow / Split / Full**. Internal identifier follows the same
   rename: `LayoutMode = 'peek-flow' | 'co-existence' | 'full'` (or just
   `'flow'` — implementation detail). Surface area is contained:
   - `shell/src/App.svelte:199` — UI label `'Deck'` → `'Flow'`.
   - `shell/src/layout.svelte.ts:15` — type literal `'peek-deck'`; lines
     28, 32 — `mode: 'peek-deck'` default and `defaultMode`.
   - Comments in `shell/src/App.svelte` (lines 66, 103, 112) and
     `shell/src/remotes.ts` (73, 85) and `shell/src/layout.svelte.ts`
     (6, 19, 20, 99).
   - Confirm no localStorage key persists `'peek-deck'` (would need a
     read-old/write-new migration if so). Locked by the user (2026-06-01).
8. **Flow is the primary; Split/Full are its layout sub-options;
   progress is bubble-numbered with tooltips.** The flat mode segment
   is restructured into a *hierarchical workflow widget*. Locked
   shape (2026-06-01):
   - **Tier 1 (parent):** the word **Flow**, raised above the layout
     toggles.
   - **Tier 2 (progress strip):** a numbered-bubble row paralleling the
     `REMOTES` rotation — one bubble per step (`① → ② → ③ → ④ → ⑤` for
     the current five rotation entries). Active step is highlighted.
     Each bubble has a **tooltip revealing the step's name** (Record
     Collector, Prompt Templates, Request Reviewer, Response Reviewer,
     Enhanced Records). Clicking a bubble navigates to that step (reuses
     `augment-it:navigate`).
   - **Tier 3 (layout sub-options):** **Split** and **Full** as small
     icon-with-tooltip toggles beneath Flow — same pattern as Decision §5.
     They modify *how* the current Flow step renders, not which step.
   - **Position-toggle:** a control that swaps the whole widget between
     the **top** of the shell (horizontal bubble row) and a **left-hand
     column** (vertical bubble row). User-preference; persisted.
   - **Coherence with Decision §6:** the left-anchored vertical peek
     labels and the bubble strip are the *same information* in two
     locations. When the user toggles to the left-column variant, the
     bubble strip and the peek-labels collapse into one rail — they
     don't both render in the same place.
   - **Implementation note:** the bubble numbers are derived from
     `REMOTES.findIndex(focused)` — no new data model needed. Step
     names are `REMOTES[i].label`. Tooltip body could pull from
     `REMOTES[i].description` (already exists).

## Cross-cutting principles (to develop)

<!-- TBD with the user. Candidates seeded by the failure shapes and the
     decisions already locked:
  - Primary action is always in view (sticky footer, or above the fold).
  - Sibling controls get symmetric helpers (if ROWS has none/all, PACKS does).
  - Same verb = same gesture across surfaces (resolve "run a pack").
  - Long operations always report progress + offer a path to results.
  - No silent failure: a control that can't act says why.
  - Icon-with-tooltip is the standard small-control affordance — already
    used by Decisions §5 (enrichment mode) and §8 (Flow's Split/Full layout
    toggles); promote from instance to shell-wide pattern.
  - Honor the dual identity (see Project context): every affordance should
    work for an outside user AND make the underlying architecture legible
    to a demo visitor. When the two are in tension, name the tension
    rather than picking one default silently.
-->

## Wish list / parked for a future spec

Items the user explicitly flagged as "should be mentioned" but not necessarily
inside this pass. Parked here so they're discoverable; each likely deserves
its own context-v doc when picked up.

- **Per-remote in-app API documentation (CTA reveals docs *inside* the
  remote).** Each remote, the shell, and each service exposes its own
  documentation surface — not generic external API docs but **relevant**
  to that surface: what data flows in, which services are called with which
  payloads, what the response shapes look like, plus diagrams. A small CTA
  (top-right candidate) toggles the panel; the docs reveal inline within
  the remote, not in a separate browser tab. Reuses the icon-with-tooltip
  affordance pattern (Decisions §5, §8) for the toggle. Motivated by the
  dual identity (see Project context): augment-it is also a demonstration
  of microservices + microfrontend + API-first practice, and in-app docs
  are how that demonstration surfaces inside the working app.
  **Stubbed 2026-06-01:** [[API-First-In-App-Documentation]] (spec) and
  [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]]
  (sibling blueprint for the dual-identity framing). Body of both
  pending dialog with the user.

## Open questions

- **Entity-name foot-gun** (parked): should picking a column whose values look
  like URLs at least *warn*? Out of scope now; revisit.
- **Default scope** (parked): is all×all the right default, or should the first
  run bias small? Out of scope now; revisit.
- **Audit order:** which surface next after Pack Runner — Response Reviewer
  (to resolve the verb mismatch) or a sweep of the `needs-audit` surfaces?
- Does the broad audit want to **fork per-surface child specs**, or stay one
  doc with the audit table? (Fork-early discipline if it balloons.)
- **Enrichment-surface composition (from Decision §5):** is the right shape
  **(a) a new `enrichmentSurface` wrapper remote** that mounts PTM and Pack
  Runner as internal views and owns the icon-mode switcher — clean conceptual
  unit, one tile in the shell — *or* **(b) keep PTM and Pack Runner as
  separate paired remotes** and have each hide its body when the shared
  `augment-it:enrichment-mode` says the other mode is active — smaller change,
  preserves the existing pairing? Either way the visible-mode rule is locked;
  this is purely *how* to compose it.
- **Flow widget default position (from Decision §8):** does the bubble strip
  default to **top** (current location, horizontal) or **left-hand column**
  (vertical rail)? The toggle exists either way; only the default needs
  picking. Argument for *top*: minimal layout change from today. Argument
  for *left*: persistent always-visible workflow rail makes "where am I"
  unmissable, and frees the top chrome for context-bar info.
- **Enrichment step in the Flow strip:** the `REMOTES` rotation currently
  has `promptTemplateManager` as a discrete step (#2). With Decision §5
  unifying PTM ⇄ Pack Runner as one enrichment surface, should the bubble
  strip render **one "Enrichment" step** that covers both, or two? Two is
  legacy from before the pair existed; one matches the new mental model.

## Related

- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] — the
  dual-identity framing this spec's Project-context section seeded
- [[API-First-In-App-Documentation]] — the first concrete feature spawning
  from the architecture-demo identity (stubbed 2026-06-01)
- [[Initial-User-Experience]] — landing-through-onboarding spec; the
  coherence principles here apply most acutely on first contact
  (stubbed 2026-06-01)
- [[../blueprints/Auth-Patterns-following-Astro-Knots-Patterns]] — auth
  affordances belong to this audit too; the blueprint translates Astro
  Knots conventions into the augment-it stack (stubbed 2026-06-01)
- [[../reminders/Pickup-2026-06-01]] — session-resume notes covering
  everything from today
- [[../plans/Run-as-First-Class-Operation]] — already covers Run-entity, live
  progress (Part 4), and the Response-Reviewer nav button; ship it
- [[../blueprints/Packs-and-Bundles-Pattern]] — the pack/bundle pattern these
  surfaces invoke; §Triage Surface UX Requirements is adjacent
- [[../blueprints/Module-Federation-Rsbuild-Dev-Loop-Gotchas]] — the shell's
  federation mechanics
- [[../issues/Search-Providers-as-First-Class-SearXNG-Default]] — the SearXNG
  provider work; the silent-fire failure (item 6) is adjacent
- [[Response-Reviewer-and-Response-Store]] — where runs land for triage
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] — the promote flow
