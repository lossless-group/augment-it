---
title: "Shell & Micro-Frontend UX Coherence — Affordances That Are Found, Consistent, and Talk Back"
lede: >-
  A demo-prep chain of 'I can't find / reach / trigger X' is a verdict: the shell's affordances hide, die, or mismatch. Fix the pattern.
date_created: 2026-05-28
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.1.3
revisions:
  - 2026-05-28 — Initial audit + 8 locked decisions (0.0.0.1).
  - "2026-06-01 — Shipped Phases 0–2d of [[../plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor]]. Marked Decisions §6 (peek labels), §7 (Deck → Flow), and §5 (composition) as shipped. The §5 open question \"wrapper remote vs shared-state\" resolved as **Option C — shell-level composite slot**; recorded in Decision §5 and removed from Open questions. Decision §1 (pack selection helpers on a flat list) **superseded** by Phase 3 bundle-first refactor — the plan's reconciliation against [[../blueprints/Packs-and-Bundles-Pattern]] showed that polishing a flat 7-pack list cements a model the blueprint says is wrong. Open question about Enrichment in the Flow strip resolved: **one bubble**, locked by the `ROTATION` shape shipped in Phase 2d. Per-surface audit updated with shipped status. Plan-level history lives in the plan; spec-level history is just the decisions changing."
  - 2026-06-01 — Phases 3, 4, 5 shipped (bundle-first Pack Runner, hierarchical Flow widget, Augment This Set). Added evidence #13 (Pack Runner doesn't show what it's improving + asks for input it could infer) and Decision §9 (surface the target column near the Fire button + auto-infer the entity-name column with a small change-link affordance). Seeded by the user re-walking the flow end-to-end after Phase 5 with fresh eyes.
  - "2026-06-01 — Phase 6 — **cross-cutting principles promoted from commented candidates to a stable list** (12 principles, partitioned by the three failure shapes + a dual-identity cross-class). Each principle is *earned* by named evidence + decisions — they're not abstract preferences. Per-surface audit closed out — every row now reads as ✅ shipped, deferred-with-link to a child spec, or `needs-audit` with a clear scope. Spec moves from 0.0.0.x to **0.0.1.0** because the principles section is a stable contract future affordances should consult. Closes the refactor's planning loop: the spec captures decisions, the plan captures sequencing + status, the principles capture the patterns earned."
  - "2026-06-01 — Patch 0.0.1.1: flagged the **Tooltip System hanging issue** on principle §8 + added to Wish list. Native HTML `title=` is unreliable for the icon-with-tooltip pattern that's now load-bearing across the composite header, Flow widget, and Pack Runner's change-link affordance. Stubbed [[Tooltip-System]] so the work is discoverable when picked up. The principle stays — the plumbing needs replacing."
  - "2026-06-01 — Patch 0.0.1.2: **sharpened the Tooltip System scope** after the user named the real shape. Not one component — a family (`Tooltip--Simple`, `Tooltip--Rich`, `Tooltip--Popover`) with shared geometry (`from` directionality with arrow connector, `distance` in rem) and a higher-level **Tooltip-Walkthrough** surface for first-run onboarding and returning-user re-orientation. Locked the framing: *apps succeed at onboarding/orientation, not at functionality.* Updated Wish list entry + §8 annotation to point at the sharpened scope; [[Tooltip-System]] itself moves from stub to scoped (v0.0.0.2)."
  - "2026-06-01 — Patch 0.0.1.3: **two new decisions surfaced by the refactor**, not created by it. Added evidence #14 (Request Reviewer doesn't adapt to the request type — bundle/pack fires skip RR entirely) and Decision §10 (RR becomes a **request-driven composite slot** with two adaptive members: PromptRequestReview stays human-readable, BundleRequestReview is intimidating-but-recognizable JSON that names the translation Augment-It is doing on the user's behalf). Added evidence #15 (composite slot doesn't announce itself + \"Enrichment\" was data-engineering-speak that didn't match the product's verb) and Decision §11 (composite slots render their `label` in chrome + rename `Enrichment` → `Augment`). §11 is partially shipped in this patch (the rename + label rendering in `ToggleHeader`); §10 is locked-but-pending. Per-surface audit row for Request Reviewer updated to point at Decision §10 instead of generic `needs-audit`."
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
site_uuid: c54a3e2c-a6e3-4014-a1f3-be6c5c0d3380
hex_code: deee1i
date_authored_initial_draft: 2026-06-01
date_authored_current_draft: 2026-06-01
publish: true
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
13. **[Hidden + foot-gun] Pack Runner doesn't show what it's improving,
    and asks for input it could infer.** Surfaced 2026-06-01 after Phase 5
    (Augment-This-Set) shipped, when the user re-walked the flow end-to-end
    and looked at Pack Runner with fresh eyes. Two related observations:
    - **What's being improved is invisible.** Pack Runner fires packs
      whose responses land in `row.socials` (per
      [[../blueprints/Packs-and-Bundles-Pattern]] §Row write-back —
      `output_column: 'socials'` is hardcoded service-side for all packs).
      The pane never tells the user that. "Fire Profile Builder on 67
      rows" reads as input scope; the *target* — the column / property
      that will get richer once you accept the responses — is nowhere on
      screen. Whether you're augmenting `socials` or `url` or
      `linkedin_url` is a load-bearing piece of context the surface should
      carry, especially for a future bundle whose packs write to
      different output columns.
    - **The entity-name column should be pre-set, not picked.** Step 2
      ("Entity-name column") today renders as a dropdown asking the user
      to choose which column holds the name to search for. The blueprint's
      §"Default to ready-to-fire" already prescribes auto-pick from a
      small candidate list (`name`, `organization`, etc.), but Pack
      Runner doesn't do that yet — and the user's stronger framing is:
      this shouldn't be a *primary visible step* at all. It should be
      inferred (record set's schema + a small candidate list) and surfaced
      only as a secondary "what column are we reading?" affordance —
      tucked under "advanced" or shown inline as a read-only "we're
      reading entity names from `Prospect / Organization`" hint with a
      change-link.
    The two observations cluster under one pattern: **Pack Runner makes
    the user answer questions Pack Runner already knows the answer to,
    and hides answers the user actually needs.** Fix flips both: hide
    the entity-name picker (auto-infer + minor change-link), surface the
    target column (read-only, prominent, near the Fire button or in the
    head). See Decision §9 below.
    (2026-06-01)
14. **[Mismatched + Hidden] Request Reviewer doesn't adapt to the
    request type; bundle/pack fires skip the pre-flight entirely.**
    Surfaced 2026-06-01 *by* the refactor — Phase 2c put PTM and Pack
    Runner in one composite slot, and that put a spotlight on the
    asymmetry the prior layout had hidden: the **prompt path** goes
    PTM → Request Reviewer → fire (the human-readable resolved
    prompt is the pre-flight); the **pack/bundle path** goes Pack
    Runner → fire, **skipping Request Reviewer entirely.** Same verb
    ("fire / send the request") routes through two different gestures
    on two surfaces. Violates principle §7 (same verb = same gesture).
    More importantly: the user has no pre-fire moment to see what
    Augment-It is *translating* their human concept (a row + a bundle
    name) into — the JSON fan-out payload, the per-pack-per-row
    resolved queries, the providers being called, the response
    schemas expected. The fix is **make Request Reviewer adaptive**:
    detect the request type, render the right body. The prompt body
    stays human (resolved variables, model picker). The bundle body
    is intimidating-but-recognizable JSON — the fan-out payload, a
    sample of resolved queries (3 rows × all roster packs), provider
    per pack, expected response schema. Variable insertion stays
    visible so the user recognizes their data, but the rest stays
    technical on purpose. The UX intent: *"thank you for automating
    this for me"* → Fire. See Decision §10. (2026-06-01)
15. **[Misnamed + Hidden] The composite slot doesn't announce itself.**
    Surfaced 2026-06-01 right after Decision §9 shipped — the user
    pulled up Pack Runner in the composite slot and saw the ✎/⊞
    icon-toggle floating above a "PACK RUNNER" heading, with no
    label anywhere telling them what *slot* they were in. The slot
    has an identity (`composite.label`) but the chrome doesn't
    render it. Two related problems: (a) without the label,
    breadcrumbs and orientation suffer — the user can't tell at a
    glance whether they're in Augment, Request Reviewer, or
    elsewhere; (b) the legacy label "Enrichment" was
    data-engineering-speak and didn't match the verb the rest of
    the product uses (the product is augment-it, the button from
    Record Collector is "Augment This Set →", the Flow widget
    parent label is "Flow"). The composite was using a different
    vocabulary than every adjacent affordance. Fix: render the slot
    label in the composite-slot header (instance principle §3 —
    name what the surface is doing), and rename the composite
    `Enrichment` → `Augment` to align with the product verb. See
    Decision §11. (2026-06-01)

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

- **Shell** (peek-flow / split / cross-remote nav) — ✅ `augment-it:navigate`
  composite-aware (Phase 2c+2d). ✅ Peek labels anchored left (Phase 2a).
  ✅ Deck → Flow rename (Phase 1). ✅ Hierarchical Flow widget with
  bubble-progress strip (Phase 4 / Decision §8). Remaining `needs-audit`:
  **chat rail framing** — the four-roles model lives in
  [[../blueprints/Chat-As-Verb-Surface-Patterns]]; revisit when the chat
  surface gets its next pass. Forward link: the dual-identity blueprint
  ([[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]])
  also touches the shell.
- **Record Collector** — ✅ "Augment This Set" set-level forward action
  (Phase 5, Decision §4) lands on the Enrichment composite with the
  record set pre-selected via the canonical `augment-it:active-record-set`
  key. Per-row `enrich ›` retained for one-off enrichment. No
  outstanding audit items at this layer; deeper record-instance
  modelling (per-row context carrying THROUGH to the enrichment pane)
  remains on the Run-entity / record-instance roadmap.
- **Prompt Template Manager** — ✅ part of `ENRICHMENT_COMPOSITE` since
  Phase 2c. Mode UI lives at the shell level (composite slot header); PTM
  is pure body with no mode awareness. PTM does **not** currently bind
  to the canonical record-set key — that's a follow-up when PTM grows
  per-record-set awareness; the seam (the canonical key) already exists.
- **Request Reviewer** — scoped 2026-06-01 by Decision §10: RR
  becomes a **request-driven composite slot** with two members
  (`PromptRequestReview` for the existing human-readable resolved-
  prompt view; `BundleRequestReview` for the new intimidating-but-
  recognizable JSON view that names the translation Augment-It is
  doing on behalf of the user). Active member auto-selected from the
  incoming request type via a shared "pending request" state seam.
  Pack Runner's fire button becomes "Review →" so both modes route
  through RR — instances principle §7. Detailed landing lives in
  [[Request-Reviewer-Pre-Flight-Surface]]; first-contact framing in
  [[Initial-User-Experience]].
- **Response Reviewer** — by-record triage view is the strong surface;
  auto-refreshes on `response.created`. ✅ The "run a pack = click-to-fire"
  vs Pack Runner multi-select mismatch is **structurally resolved** by
  Phase 3's bundle-first model — both surfaces speak in bundles, the
  mismatch is gone. Group-by-bundle (made possible by `bundle_id` landing
  on every ResponseRecord in Phase 3) is its own follow-up. `needs-audit`
  for the by-record card's secondary affordances; deeper review is
  scoped under [[Response-Reviewer-and-Response-Store]].
- **Enhanced Records List** — promote success banner dead button (fixed
  pre-spec). `needs-audit` remains for the rest of the promote flow;
  scoped under [[Enhanced-Records-List-and-Promotion-Checkpoint]].
- **Chat** — `needs-audit`. The chat's role-in-the-shell story lives in
  [[../blueprints/Chat-As-Verb-Surface-Patterns]]; the affordance
  coherence pass against principles 1-12 above is deferred to its
  next implementation increment.
- **Pack Runner** — ✅ part of `ENRICHMENT_COMPOSITE` since Phase 2c.
  ✅ Phase 3 (bundle-first) closes evidence #1 (bundle is the orchestration
  unit; `none`/`all`/`solo` are roster overrides). ✅ Phase 5 unifies the
  record-set key (one write pre-selects). ✅ Decision §9 (target column
  visible near Fire; entity-name auto-inferred with change-link).
  ✅ Sticky Fire + nav to Response Reviewer (pre-spec). **Parked**:
  evidence #3 (entity-name foot-gun on default `url` column) and #7
  (default-scope all×all firehose) — both touched by Decision §9's
  inference but the broader "warn when the picked column looks like
  URLs" + "first-run bias small" haven't been picked up yet; revisit
  when needed.

## Decisions locked this session

1. **~~Pack selection stays multi-select; add a `none` button + an "only this"
   per-pack affordance + a `solo`/"all" pair~~** mirroring the ROWS section.
   **SUPERSEDED 2026-06-01** by Phase 3 of the refactor plan — **bundle-first
   Pack Runner**. The original call was "conservative on purpose," but
   reconciling against [[../blueprints/Packs-and-Bundles-Pattern]] showed
   that polishing a flat 7-pack list cements a model the blueprint says is
   wrong: the orchestration unit is a **bundle**, not a list of packs. The
   helpers (`none` / `all` / `solo`) survive — but they operate inside the
   selected bundle's **roster panel**, where they're conceptually correct,
   rather than on a universe of all packs. See
   [[../plans/Shell-and-Micro-Frontend-UX-Coherence-Refactor]] §Phase 3.
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

   **✅ SHIPPED 2026-06-01 in Phases 2c + 2d.** Architectural composition
   resolved as **Option C — shell-level composite slot**, not (a) wrapper
   remote and not (b) shared-state alone. The shell learned about a new
   concept: a slot that hosts one-of-N remotes based on shared state. The
   icon-with-tooltip pair lives in `packages/shared-ui` as
   `ToggleHeader__PromptOrPackage--Icons.svelte`; the shell renders it as
   the composite slot's header and mounts only the active member. PTM and
   Pack Runner lost their intra-remote mode state entirely — the shell is
   the single source of truth for which member is active.
   **Emergent insight (Phase 2d):** composites must be **peers in the
   rotation**, not just slots inside pairings. We split `REMOTES` (federated
   registry) from `ROTATION` (ordered list of slot ids); composites can
   appear in `ROTATION`, so the in-slot toggle works in Flow, Split, and
   Full alike. Mechanic: `shell/src/composites.ts` defines
   `ENRICHMENT_COMPOSITE`; `shell/src/remotes.ts` defines `ROTATION`;
   `shell/src/App.svelte` walks `ROTATION` via `slotById` + `materializeSlot`.
6. **Peek-flow position labels anchor to the left margin.** The vertical
   per-pane indicators (e.g. "REQUEST REVIEWER", same for every neighbour)
   move from centered to **anchored at the pane's left margin** — they're
   landmarks, not floating titles. Locked by the user (2026-06-01).
   **✅ SHIPPED 2026-06-01 (Phase 2a).** `.peek-overlay` switched to
   `justify-content: flex-start` + `padding-left: 0.75rem`. The
   left-outer-vs-inner-edge question got a uniform `flex-start` default;
   the CSS carries a one-line comment flagging the directional re-evaluation
   for in-browser review if the right-peek's inner-edge label reads wrong.
   (Renamed from "peek-deck" to "peek-flow" by Decision §7.)
7. **Rename "Deck" → "Flow" across the shell.** The top-left mode button
   becomes **Flow / Split / Full**. Internal identifier follows the same
   rename: `LayoutMode = 'peek-flow' | 'co-existence' | 'full'`. Locked by
   the user (2026-06-01).
   **✅ SHIPPED 2026-06-01 (Phase 1).** Type literal, defaults, UI label,
   and all in-code comments renamed. localStorage *did* persist `'peek-deck'`
   in `augment-it:shell-layout`; `readStored()` carries a one-line
   `migrateMode()` that maps the old value on read so existing users keep
   their layout. The historical context-v doc
   `Build-the-Shell-Tiling-and-Peek-Deck.md` retains its filename — the
   doc's identity is its filename.
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
     `ROTATION` (introduced in Phase 2d as the rotation-order peer to
     `REMOTES`). Step names are `slotById(ROTATION[i]).label` —
     `composite.label` for composites, `remote.label` otherwise. Tooltip
     body pulls from `description`. With the `enrichment` composite already
     a peer in `ROTATION`, the Open question "one bubble or two for
     enrichment?" resolves naturally: **one bubble**, because PTM and Pack
     Runner are already collapsed into the composite at the rotation level.
9. **Pack Runner surfaces its target, infers its inputs.** Added 2026-06-01
   in response to evidence #13. Two coupled fixes that reframe Pack
   Runner's pre-fire surface around the **target column** (the property
   being improved) instead of around inputs the surface could infer.
   - **Surface the target column, near the Fire button.** A read-only
     line in the fire-card subhead: *"Augmenting `socials` on 67 rows · 5
     packs × 67 rows · 335 fetches"*. The target column comes from the
     bundle (today every pack writes to `'socials'` per the 2026-05-25
     pivot; future bundles may write to other columns or multiple
     columns). When more than one target column is in play across the
     bundle's roster, list them: *"Augmenting `socials`, `linkedin_url` on
     67 rows · …"*. The user always knows *what gets richer* on accept.
   - **Hide the entity-name column picker as a primary step; auto-infer.**
     Step 2 today is a dropdown asking the user to pick which column holds
     the entity name. Replace with **automatic best-guess** from a small
     candidate list (`Prospect / Organization`, `name`, `organization`,
     `company`, `entity_name`) walked against the active record set's
     schema. The chosen column appears as a small, read-only hint near
     the Fire button — *"Reading entity names from **Prospect /
     Organization**"* — with a tiny `change ›` link that drops down the
     dropdown for the rare case the heuristic is wrong. Persist any
     manual override per record set in localStorage (keyed by
     `record_set_id`) so the override doesn't leak across sets.
   - **Mechanic notes:**
     - Target-column source: derive from the active bundle's roster — for
       v1 of the bundle architecture every pack writes to `'socials'`, so
       this is a constant. For future packs with diverse output columns,
       resolve `union(roster.map(m => packById(m.pack_id).output_column))`
       and render the union.
     - Entity-name heuristic: a small ordered candidate list scanned
       against `recordSet.schema.fields` — first match wins, fallback to
       "no inference possible — pick a column" only when none match.
     - Storage key for per-set override (matches the canonical key
       pattern from Phase 5):
       `augment-it:entity-name-field:<record_set_id>`. Cleaner than the
       current global `augment-it:pack-runner:entity-name-field`, which
       leaks across sets.
   - **Failure-shape mapping:** Hidden (what's improved is invisible) +
     foot-gun (user is asked for input that should be inferred). The fix
     instances the cross-cutting principle *"don't ask the user for what
     the surface can infer"* and *"name what the surface is doing right
     where the action lives."*
10. **Request Reviewer becomes a request-driven composite.** Locked
    2026-06-01 in response to evidence #14. RR is reshaped as a
    **composite slot** whose active member is chosen **adaptively from
    the incoming request type** — no user toggle, no human decision.
    Two members:
    - **`PromptRequestReview`** — the existing surface, shipped. Shows
      the resolved prompt body with `{{variables}}` filled in from the
      current row, the model picker, the row scope, and a fire button.
      Human-readable on purpose; the user is reviewing prose they
      authored.
    - **`BundleRequestReview`** — new. Shows the **fan-out request
      payload** (the JSON Pack Runner would send to the social-search
      service: `{ pack_ids, bundle_id, record_set_id, row_ids,
      entity_name_field, provider_override }`), plus a **sample of
      resolved per-pack-per-row queries** (3 rows × full roster, with
      the entity name substituted: `LinkedIn → "Acme Corp site:linkedin.com"`,
      `Wikipedia → "Acme Corp nonprofit"`, …), plus the **provider per
      pack** and the **expected response schema**. Variable insertion
      stays visible so the user recognizes *their* data going into
      *that* JSON; the rest stays technical on purpose. The UX intent
      is the opposite of the prompt path: the prompt path humanizes,
      the bundle path *intimidates-but-recognizably* so the user lands
      on *"thank you for automating this for me"* → click Fire.
    - **Auto-selection mechanism (locked at the seam):** a shared
      "pending request" state seam — both PTM's *Apply* and Pack
      Runner's *Review* write a typed payload (`{ kind: 'prompt' | 'bundle', … }`)
      to a known key + broadcast a window event. RR reads it on mount
      and listens. The composite's `defaultMemberId` is the fallback
      when no pending request exists.
    - **Pack Runner's fire button changes shape.** From "Fire Profile
      Builder on 67 rows" → "Review → Profile Builder on 67 rows"; the
      actual fire happens in RR. (Power-user "skip review" preference
      possible later, but default is review for both paths — that's
      what makes the verb symmetric.)
    - **Composability with other composites.** This is the *second*
      composite the shell hosts (the first is `AUGMENT_COMPOSITE`, see
      Decision §11). It's also the first **request-driven** composite —
      the prior pattern was user-toggle. The shell's `CompositeEntry`
      type supports both; the difference is whether the slot renders the
      toggle UI in its header. Request-driven composites either hide the
      toggle entirely or render a small read-only "this is a
      Prompt/Bundle request" indicator. (Implementation detail —
      whatever reads cleanest in the chrome.)
    - **Failure-shape mapping:** Mismatched (same verb, two gestures)
      + Hidden (the JSON translation was invisible). The fix instances
      principles §7 (same verb = same gesture) and §3 (name what the
      surface is doing).
    - **Implementation surface area (estimated):** the request seam
      (1 module), the new `BundleRequestReview` remote or sub-view,
      Pack Runner's fire-button copy + dispatch change, and the
      composite registration. Deeper detail belongs in the child
      surface spec — see [[Request-Reviewer-Pre-Flight-Surface]] for
      the full landing.
11. **Composite slots render their label, and Enrichment is renamed
    Augment.** Locked 2026-06-01 in response to evidence #15. Two
    coupled fixes:
    - **Render the slot label.** The shared `ToggleHeader__PromptOrPackage--Icons`
      component takes a `slotLabel` prop. When set, the label renders
      to the left of the icon-toggle pair in accent color + small-caps
      letterform — the composite slot announces itself in chrome. The
      shell passes `composite.label` for every composite stage item.
      For request-driven composites (Decision §10) where the toggle is
      hidden, the label still renders on its own.
    - **Rename `Enrichment` → `Augment`.** The composite's id, label,
      modeKey, PAIRING key, and ROTATION entry all carry the new
      vocabulary. The verb the rest of the product uses is *augment*
      (app name, Record Collector button, Flow widget parent label);
      "Enrichment" was data-engineering-speak. Concrete surface area:
      - `shell/src/composites.ts` — `AUGMENT_COMPOSITE` (was
        `ENRICHMENT_COMPOSITE`, kept as deprecated re-export for one
        release), id `'augment'`, label `'Augment'`, modeKey
        `'augment-it:augment-mode'`.
      - `shell/src/remotes.ts` — `ROTATION` entry `'augment'` (was
        `'enrichment'`), PAIRING key `'recordCollector+augment'`.
      - `apps/record-collector/src/App.svelte` —
        `augment-it:navigate { remoteId: 'augment' }` (was
        `'enrichment'`).
      - localStorage migration: `readActiveMemberId()` reads the new
        key first; falls back to the legacy
        `'augment-it:enrichment-mode'` so existing users don't lose
        their last-active member.
    - **Failure-shape mapping:** Misnamed (slot used vocabulary
      different from every adjacent affordance) + Hidden (slot had no
      visible label in chrome). The fix instances principles §3 (name
      what the surface is doing) and §10 (labels evoke the right
      model).

## Cross-cutting principles

Promoted 2026-06-01 (Phase 6) from the commented candidates to a stable
list. Each principle is *earned* by specific evidence + decisions —
they're not abstract design preferences, they're the patterns the
refactor itself proved are load-bearing. New surfaces and new affordances
should consult this list before re-litigating any of the same fights.

The principles partition into three classes that mirror the audit's three
failure shapes: **affordance discoverability** (counters *Hidden*),
**affordance liveness** (counters *Dead*), and **affordance coherence**
(counters *Mismatched* + *Misnamed*).

### Affordance discoverability — counter *Hidden*

1. **Primary action is always in view.** Sticky-pin the primary CTA
   instead of relying on the user to scroll for it. macOS overlay
   scrollbars hide that scrolling is possible. *Earned by evidence #6
   (Fire button below the fold → sticky `.fire-card`).*
2. **Sibling controls get symmetric helpers.** If one section has
   `all` / `none`, its peer section has the same — not by accident, by
   convention. *Earned by evidence #1 (PACKS missing the helpers ROWS
   had); shipped as roster-overrides inside the bundle (Phase 3
   roster panel).*
3. **Name what the surface is doing, right where the action lives.**
   Don't make the user infer the *target* of a fire from context. The
   fire-card subhead says what gets richer; the chip on the row says
   what verb produced it. *Earned by evidence #13 and Decision §9
   ("Augmenting `socials` on N rows" line near the Fire button).*

### Affordance liveness — counter *Dead*

4. **No silent failure: a control that can't act says why.** A control
   that fires-into-nothing (no result, no error) is the worst kind
   because the user can't diagnose. Either fix the underlying state or
   show the obstacle. *Earned by evidence #6 (SearXNG silent-fire
   failure) and the operational fix of bringing the container up; the
   permanent fix is provider-plurality, see [[../issues/Search-Providers-as-First-Class-SearXNG-Default]].*
5. **Long operations always report progress + offer a path to
   results.** A button that sits on "firing…" for minutes with no
   feedback is dead-shaped. The path to results is its own
   affordance — surface it. *Earned by evidence #4 + #5; partially
   shipped (Pack Runner's "Response Reviewer →" nav button), full
   landing is [[../plans/Run-as-First-Class-Operation]] Part 4 with
   live `run.updated` progress.*
6. **Don't ask the user for what the surface can infer.** If a small
   ordered candidate list + the active context (record set schema,
   active bundle, active record) can answer the question, answer it.
   Surface the answer as a read-only hint with a change-link, not as
   a primary visible step. *Earned by evidence #13 and Decision §9
   (entity-name auto-inference + change-link affordance).*

### Affordance coherence — counter *Mismatched* + *Misnamed*

7. **Same verb = same gesture across surfaces.** When a single user
   intent ("run a pack", "augment this set", "open the toggle") shows
   up on multiple surfaces, the interaction model must be identical.
   *Earned by evidence #2 (Response Reviewer click-to-fire vs Pack
   Runner multi-select); resolved structurally by Phase 3's bundle-
   first model — "run" means "fire a bundle," same everywhere.*
8. **Icon-with-tooltip is the standard small-control affordance.**
   When a binary or short-list pick needs to live in chrome (not in a
   numbered step), use icon + `title` + `aria-label`. *Earned by
   Decisions §5 (enrichment ⇄ toggle), §8 (Flow widget's Split/Full),
   and §9 (Pack Runner's `change ›`). The shared component is
   `@augment-it/shared-ui/ToggleHeader__PromptOrPackage--Icons.svelte`;
   the pattern is the rule.*
   **⚠ Hanging issue (2026-06-01):** the implementation today uses
   the native HTML `title=` attribute, which has uncontrollable delay,
   unstyled rendering, and patchy touch / screen-reader support. The
   principle is right; the *plumbing* needs to become a first-class
   Tooltip *system* — a family of primitives (`Tooltip--Simple`,
   `Tooltip--Rich`, `Tooltip--Popover`) with shared geometry (`from`
   directionality + arrow connector, `distance` in rem, dismissal
   discipline), plus a higher-level **Tooltip-Walkthrough** surface
   for first-run onboarding and returning-user re-orientation tours.
   See [[Tooltip-System]] (sharpened 2026-06-01) for scope, the
   family, the geometry props, the walkthrough mechanics, and the
   migration plan.
9. **The toggle belongs to the slot, not the layout mode.** Mode
   switches that pretend to be intra-remote but are actually shell-
   level slot choices will break in some layout modes. Composite slots
   in the shell host one-of-N remotes; the in-slot toggle is the
   shell's responsibility, not each remote's. *Earned by Phase 2b's
   shipped-then-reverted intra-remote toggle; resolved in Phases 2c
   (composite slot) and 2d (composites are peers in `ROTATION`).*
10. **Labels evoke the right model.** A label whose connotation maps
    onto a different mental model than the underlying behaviour is a
    `Misnamed` foot-gun. Audit early; rename without ceremony. *Earned
    by evidence #11 (Deck → Flow) and Decision §7.*
11. **Same information should not render in two places at once.** When
    a piece of information (e.g. "where am I in the flow") has both a
    primary indicator and a secondary one, hide the secondary when the
    primary is sufficient. *Earned by Decision §8 (peek-labels collapse
    when the Flow widget is on the left rail) — same information in two
    locations is silly.*

### Cross-class — augment-it's dual identity

12. **Honor the dual identity.** Every affordance should work for an
    outside user AND make the underlying architecture legible to a
    demo visitor. When the two are in tension, *name the tension* in
    the spec rather than picking one default silently. *Earned by the
    Project context framing (2026-06-01) and stubbed in
    [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]];
    the first concrete instance is
    [[API-First-In-App-Documentation]].*

### How to use this list

When you propose a new affordance, walk it through 1-12. If a principle
applies and the proposed shape violates it, the violation is a deliberate
choice to be defended in the spec — not an oversight. If a principle is
*missing* for the affordance you're designing, add it here when you
ship — principles are earned, not invented.

## Wish list / parked for a future spec

Items the user explicitly flagged as "should be mentioned" but not necessarily
inside this pass. Parked here so they're discoverable; each likely deserves
its own context-v doc when picked up.

- **Tooltip System — a versatile first-class family, plus a Walkthrough
  for new and returning users.** Surfaced 2026-06-01 after Decision §9
  shipped; sharpened later the same day. The first cut framed the gap
  as "native `title=` is unreliable; build one Tooltip component." The
  sharpened framing is bigger: it's a **family of primitives**
  (`Tooltip--Simple`, `Tooltip--Rich`, `Tooltip--Popover`) with shared
  geometry (`from` directionality with arrow connector, `distance` in
  rem, dismissal + accessibility discipline) AND a higher-level
  **Tooltip-Walkthrough** surface that uses the family to deliver
  first-run onboarding and returning-user re-orientation tours since a
  declared milestone. The locked framing: *most apps don't succeed or
  fail at functionality; they succeed or fail at onboarding,
  orientation, and re-orientation.* Tooltips and the walkthrough that
  uses them are how augment-it earns those moments. **Stubbed and
  sharpened 2026-06-01:** [[Tooltip-System]] (spec, v0.0.0.2).
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
- ~~**Enrichment-surface composition (from Decision §5)**~~ — **RESOLVED
  2026-06-01** as **Option C — shell-level composite slot.** Neither (a)
  wrapper remote nor (b) shared-state alone; the shell learned a new
  concept (a slot that hosts one-of-N remotes). See Decision §5 for the
  resolution narrative and the shipped mechanic.
- **Flow widget default position (from Decision §8):** does the bubble strip
  default to **top** (current location, horizontal) or **left-hand column**
  (vertical rail)? The plan defaults to *top* for minimal layout change;
  the toggle exists either way. Re-open if the eyeball test prefers left.
- ~~**Enrichment step in the Flow strip**~~ — **RESOLVED 2026-06-01** as
  **one bubble**, locked by Phase 2d's `ROTATION` shape. The rotation now
  reads `recordCollector → enrichment → requestReviewer → responseReviewer
  → enhancedRecordsList`; the bubble strip will derive directly from it.

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
