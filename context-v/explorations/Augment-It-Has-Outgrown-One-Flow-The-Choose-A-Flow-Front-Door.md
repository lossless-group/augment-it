---
title: "augment-it has outgrown one flow — ROTATION is the CSV-augmentation pipeline's shape wearing a general-purpose name, and strategy-curator's promotion to its head is a splice, not a fit"
lede: "augment-it started as one thing — augment a CSV, row by row — and ROTATION (shell/src/remotes.ts) is that flow's shape, hardcoded as THE numbered nav. Every use case since (DB-canonicalization for reach-edu's CRM exit, per-org/person corpus curation, now domain/thesis curation for humain-vc) has been reconciled onto that one array instead of recognized as its own flow. Strategy Curator's 2026-07-06 'promotion to the head of ROTATION' is the symptom: a domain-curation session doesn't hand off into recordCollector, but ROTATION was the only navigation primitive that existed, so that's where it landed. The fix isn't a bigger ROTATION array — it's a 'what are you trying to do?' front door that picks which flow mounts, so a use case that isn't CSV-row augmentation stops being forced to pretend it is."
date_created: 2026-07-06
date_modified: 2026-07-06
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
semantic_version: 0.0.0.3
status: Draft
tags:
  - Exploration
  - Augment-It
  - Shell
  - Rotation
  - Flow
  - Strategy-Curator
  - Thesis-Curator
  - Record-DB-Resolver
  - Workspaces
  - Humain-VC
  - Multi-Flow
  - Front-Door
  - UX-Architecture
---

# augment-it has outgrown one flow

## The observation — why this exists

2026-07-06, mid-session: after wiring didi.sh actor attribution end to end, the
operator opened `http://localhost:3017` expecting to see the strategy-curator
in context (auth badge, workspace switcher) and instead saw the bare remote —
no chrome, because `:3017` is `apps/strategy-curator`'s own standalone
rsbuild dev server, not the shell. The proximate fix is trivial: go to
`:3100` instead. But the operator's actual point, in their own words:

> "The standard augment-it flow doesn't have the corpus curator. It's an app
> we made to plug a hole. It is very handy though. We also kept running into
> workflows that don't fit the current shared shell header of 1-2-3-4."

That's not a bug report. It's a description of an architecture that has
quietly forked into multiple flows while the shell still presents exactly
one numbered sequence.

## How we got here — the actual history

Reconstructed from the operator's account plus the git/context-v trail:

1. **CSV augmentation (the original, proven flow).** Upload a CSV, author
   prompts, run them per row, triage responses, promote a snapshot. This is
   `recordCollector → promptTemplateManager → requestReviewer → responseReviewer`
   in spirit — today's `ROTATION` minus the parts added later. It works. It
   shipped first because it was the whole product at first.
2. **An event CSV needed dynamic person↔org iteration.** reach-edu wanted off
   their CRM entirely, so the natural move was to write canonical records to
   SurrealDB directly — with CRM-specific and client-specific flags — rather
   than bolt a migration script onto the side. This is
   `record-db-resolver` (spec: [[../specs/Record-DB-Resolver]]): match-or-create
   against canonical `organizations`/`persons`, additive, one row at a time.
   It got folded into `ROTATION` as step 3 (`recordDbResolver` — "bridge —
   reconcile records to canonical orgs") — a reasonable fit, because it
   still operates per-CSV-row.
3. **Organizations and some individuals warranted their own corpora** — links
   and downloads gathered independent of any one CSV row. This is where
   `content-ingest`, the `sources`/`source_usages`/`domains` SurrealDB tables,
   and the whole corpus-curation substrate ([[../specs/Funder-Content-Corpus-Workflow]])
   came from. Still record-adjacent at this point — corpus entries hung off
   `record_id`.
4. **reach-edu needed corpora for "strategies"** — cases to support or flesh
   out potential fundraise directions, decoupled from any single CSV row.
   This is `strategy-curator` ([[../specs/Strategy-Curator-Entry-Point-for-Augment-It]]):
   pick a `domain` (type='strategy'), gather sources against IT, not against
   a record. **This is the fork.** The unit of work stopped being a record row
   and became a domain. `strategy-curator` had no natural slot in `ROTATION`
   — it isn't a step in the CSV pipeline, it's the entry point to a
   different pipeline — so it shipped as a standalone remote, reachable only
   by its own dev port.
5. **humain-vc now wants the identical shape for "theses"** — corpora that
   will become decks via `dididecks-ai` downstream. This is Build-Order step 5
   ([[../plans/Build-Order-Humain-VC-Unlock-Flow]]): make the curator's
   `domain_type` workspace-derived instead of hardcoded `'strategy'`, so
   humain-vc reads "Thesis" and reach-edu keeps "Strategy." Same app, second
   client, second domain-type — proof the domain-curation flow is now a
   first-class citizen, not a one-off.
6. **2026-07-06: strategy-curator promoted to the head of ROTATION**
   (commit `1d4acc0`, `shell/src/remotes.ts:34-42`, +4/-2 lines). This gave
   the curator a reachable, chrome-having entry point for the first time —
   genuinely useful, unblocks Flow 1's "primary surface" framing in the
   Build-Order plan. But look at what the diff actually did: it spliced a
   domain-curation entry point onto the front of an array whose remaining
   six members (`recordCollector` → `recordDbResolver` → `augment` →
   `recordsSurface` → `responseReviewer` → `enhancedRecordsList`) are all
   CSV-row-augmentation steps. Nothing in strategy-curator hands off into
   `recordCollector`. The "numbered flow" is now a lie for one out of seven
   steps — you don't walk from Strategy Curator into Record Collector as
   part of one continuous task.

## The actual architectural collision

`ROTATION` (`shell/src/remotes.ts:34-42`) is one hardcoded array. It is
simultaneously trying to be:

- **The CSV-row-augmentation pipeline's step order** (its original and
  still-true shape for 6 of 7 members).
- **THE numbered navigation for the whole shell** (its assumed role — every
  new capability gets a slot, because a slot is the only way to be reachable
  with chrome).

Those two roles were the same thing when augment-it did one thing. They
aren't anymore. Three distinct flows exist in the product today, and only
one of them is what `ROTATION` actually models:

| Flow | Unit of work | Apps | In `ROTATION` today? |
|---|---|---|---|
| **A — CSV Row Augmentation** | one CSV row | recordCollector, recordDbResolver, augment (PTM⇄PackRunner⇄SortFilterLens), recordsSurface, responseReviewer, enhancedRecordsList | Yes — this IS what `ROTATION` models |
| **B — Canonical DB Reconciliation** | one person/org | recordDbResolver | Embedded inside Flow A (step 3) — also directly useful standalone once reach-edu is fully off their CRM |
| **C — Domain/Thesis Corpus Curation** | one domain (strategy or thesis) | strategyCurator, content-ingest's corpus tables, (soon) dididecks-ai downstream | Spliced onto Flow A's front as step 1, despite sharing no data spine with steps 2-7 |

Flow C doesn't key off `record_uuid` the way Flow A does — it keys off
`domain_type:domain_slug`. There is no natural "next step" from Strategy
Curator into Record Collector; an operator finishing a thesis-curation
session doesn't want to walk into CSV upload. The promotion made the curator
*reachable*, which was worth doing, but it didn't make it *belong* where it
landed.

### A second, smaller collision: three senses of "Flow"

Worth naming so a future session doesn't conflate them (surfaced while
researching this):

1. **Shell "Flow"** — `ROTATION`, the numbered nav sequence
   (`FlowWidget.svelte`, "Flow 1", "Flow step 1" in code comments).
2. **Build-Order "Flow 1"** — a whole user-journey for humain-vc: auth →
   workspace → thesis corpus, spanning both `id-didi-sh` and `augment-it`
   ([[../../context-v/plans/Unlock-Humain-VC-Team-Access-To-Augment-It]]).
3. **This exploration's "flow"** and the sibling exploration's "operator-built
   flow" — a top-level use-case (this doc) or a verb-sequence-against-a-view
   (the sibling doc) — neither is the shell's numbered nav.

Same word, three referents, three different docs. Not urgent to rename, but
worth a one-line disambiguation wherever "Flow" appears without qualification.

## Relationship to the sibling exploration

[[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] is about the SAME
underlying tension — "the universal pipeline is a dud outside its happy
path" — but one layer down: it's about customizing *granularity within Flow
A* (which records, in what order, with what verbs). This exploration is one
layer up: *which flow is even active*. They compose cleanly:

- This doc's "choose a flow" front door picks Flow A, B, or C.
- Once Flow A is chosen, the sibling doc's Tiers 1-4 (saved views → named
  playbooks → agent-composed view-specs → deferred flow-editor) apply
  *inside* Flow A, same as today.
- Flow C (domain/thesis curation) might eventually want its own Tier-1-style
  saved views ("my open theses," sorted by source count) — same pattern,
  different flow. Not scoped here; noted for later.

## The design space — climb only as needed, same ethos as the sibling doc

### Option 1 — Do nothing; keep splicing (status quo)

Every new use case gets folded into `ROTATION` wherever it fits best, or
shipped standalone if it doesn't fit at all. Cheapest, and it's *why*
strategy-curator exists and works today. Cost: `ROTATION` keeps meaning less
as it grows (it's already lying for 1 of 7 members); each new flow that
doesn't fit either gets awkwardly spliced in (repeat 2026-07-06's move) or
stays a standalone-port app operators have to remember, as happened today.

### Option 2 — A header-level "jumbo popdown," not a pre-auth front door (recommended direction, corrected 2026-07-06)

**Revised after operator feedback:** the original draft of this option
proposed a pre-auth landing screen (sign in → pick a flow → mount). That's
the wrong shape for right now — with exactly two users (Michael, Aniel),
gating flow-choice behind auth machinery is complexity with no payoff yet.
The corrected, much lighter shape:

**Use the existing "jumbo popdown" convention** — a large, content-rich
dropdown menu triggered from the header, documented at
`astro-knots/context-v/blueprints/Jumbotron-Popdown-Patterns.md` and
implemented (Astro) at
`astro-knots/sites/fullstack-vc/src/components/ui/menus/JumboPopdown__*.astro`.
Shape per that blueprint: a trigger button with a chevron
(`aria-haspopup="menu"`, `aria-expanded`), a panel (`role="menu"`,
`hidden` until opened, hover-open + click-toggle, Esc/click-outside closes)
containing a grid of items — each item a title + one-line description,
6-8 items max. augment-it's shell is Svelte, not Astro, so this is a
**pattern port** (same interaction/visual contract, native Svelte
implementation), not a shared dependency — consistent with the
"no shared dependency across ai-labs apps" convention (patterns get
copied/adapted per app, never imported as a package or microfrontend
across `dididecks-ai`/`augment-it`/`memopop-ai`). The shell's own
`WorkspaceSwitcher.svelte` is the closest existing analog in augment-it
today, but it's a compact `role="listbox"` single-column dropdown — the
jumbo variant is the richer, grid-based sibling for a menu that wants to
say more than one line per item.

**Scope for right now: exactly one entry.** The popdown ships with a
single item — **"Build Corpora"** — which mounts `strategyCurator` as its
own focused surface (no CSV steps trailing behind it, same fix for today's
`:3017` confusion as the original draft: the popdown becomes the on-ramp,
replacing the memorized-port habit). `ROTATION` itself is untouched — it
keeps mounting as the shell's default/home state, exactly as today. No
`ActiveFlow` persistence, no landing screen, no auth-gating: clicking
"Build Corpora" is just a navigation action, same mechanism as any
existing `augment-it:navigate` event to a non-rotation remote (`chat`,
`packRunner`, `personEnrichment` already work this way).

**The "helpful marketing" framing (operator's words) is a real, but later,
upgrade path.** Once there's more than one flow-entry worth surfacing, the
popdown's panel is the natural place for a richer showcase — a vertical
carousel of use-cases, each with a short pitch, matching the blueprint's
"content-rich" intent rather than a bare link list. Not needed for a
one-item menu; worth revisiting when a second or third "Build ___" entry
exists (see Recommendation).

**Why this is the right first move, not over-engineering:** it's a single
new header component, no new global state, no backend changes, no
interaction with Step 7's (still-open) sign-in wall. `ROTATION`,
`FlowWidget`, and the composite-slot mechanism are completely untouched.

**Cost estimate:** small. One Svelte component (`JumboPopdown.svelte` or
similar, ported from the astro-knots blueprint's interaction contract),
wired into the shell header next to `WorkspaceSwitcher`/`DidiBadge`, one
menu item, one navigate-to-strategyCurator action.

### Option 3 — Let each flow be its own top-level shell (defer)

Spin up a second shell instance entirely for Flow C, federation-composed
independently. Overkill today — one shell already composes remotes fine;
the problem is navigation-model, not composition-model. Would only become
worth it if Flow C's UI needs (theme, layout grid, chat-rail behavior)
diverge from Flow A's, which they don't yet.

## Key considerations

- **`recordDbResolver` (Flow B) is genuinely dual-use** — it's both step 3
  of Flow A AND, once reach-edu is fully off their CRM, plausibly its own
  standalone reconciliation flow. Don't force a premature decision; the
  front door can grow a third button later without disturbing the first two.
- **Workspace ≠ Flow.** `active_workspace_slug` (which client — reach-edu vs
  humain-vc) is a persisted piece of state; which flow-entry the operator
  just clicked in the jumbo popdown is not (it's a one-shot navigate, not a
  mode the shell remembers across reloads) — at least until there's a
  reason to persist it. Keep the two conceptually separate even though only
  one of them is stateful today.
- **This directly un-blocks today's confusion.** The reason the operator
  went to `:3017` is that there was no "curate a domain" on-ramp at `:3100`
  to click instead. The popdown's "Build Corpora" entry is that on-ramp;
  once it exists, the standalone-port habit has no reason to persist (the
  remote stays federation-registered and technically reachable standalone,
  same as `chat`/`packRunner`/`personEnrichment` today, but nobody needs to
  remember the port).
- **Doesn't block Build-Order step 5.** Making strategy-curator's
  `domain_type` workspace-derived (humain-vc → thesis, reach-edu →
  strategy) is orthogonal to which flow-picker button reaches it, and should
  proceed regardless of when/whether Option 2 ships.
- **dididecks-ai as the eventual downstream of Flow C.** Theses become decks.
  That hand-off (domain/thesis → deck generation) is itself a candidate
  future flow or a Flow-C exit action ("build a deck from this thesis") —
  not scoped here, but the front-door framing should leave room for it
  rather than assume Flow C's endpoint is just "more curated sources."

## Recommendation — sequence

1. **Name the flows explicitly in code, even before the popdown ships.**
   Keep `ROTATION`, but add a one-line comment (or a `FLOW_A_ROTATION`
   alias) marking it as CSV-row-augmentation's sequence specifically, not
   "the" rotation. Cheap, immediately reduces the "strategyCurator doesn't
   belong here" confusion for the next reader.
2. ✅ **DONE 2026-07-06 — shipped the jumbo popdown (Option 2).**
   `shell/src/JumboPopdown.svelte` (new, ported from the astro-knots
   blueprint's interaction contract) + one line in `shell/src/App.svelte`
   wiring a "Flows" trigger with one item, "Build Corpora," dispatching
   `augment-it:navigate` to `strategyCurator` in `mode: 'full'`. No new
   persisted state, no auth interaction, `ROTATION` untouched. Verified:
   `svelte-check` clean (zero new errors/warnings vs. baseline), the
   compiled dev bundle at `:3100` confirmed serving the new component, and
   the didi-auth GATE prove-script mode still passes. Auth access for the
   curator itself needed no new wiring — its own WS connection to
   `workspace-service` already carries the same `didi_session` cookie, so
   Step 4's attribution envelope already applies. Changelog:
   `2026-07-06_04_Build-Corpora-Jumbo-Popdown-Gives-The-Curator-A-Real-Front-Door.md`.
3. **Leave Flow B (DB reconciliation) embedded in Flow A** until reach-edu's
   CRM exit is far enough along that a standalone reconciliation session is
   an actual asked-for workflow, not a hypothetical one.
4. **Don't build a general flow-editor, a config-driven flow registry, or
   a pre-auth landing experience.** Same "climb only as needed" ethos as
   the sibling exploration — one popdown, one item, hardcoded. Grow the
   panel (more items, the "helpful marketing" vertical-carousel framing)
   only when a second or third flow-entry is actually needed.

## Open questions

- **Should the popdown grow a second item before or after Build-Order
  step 7's sign-in wall lands?** No dependency either way today (the
  popdown doesn't touch auth), but worth a quick check-in once Step 7
  ships in case the two end up wanting shared header real estate.
- **Is `strategyCurator` the right name once the popdown exists and
  humain-vc reads "Thesis"?** The app id and remote label still say
  "Strategy Curator" everywhere; Build-Order step 5 handles the in-app
  copy but the code identifier will keep saying strategy. Fine to leave —
  renaming identifiers is friction without payoff — but worth a code
  comment noting the id is legacy-named once step 5 ships.
- **What does Flow C's own "done for now" checkpoint look like?** Flow A
  has `enhancedRecordsList` as its checkpoint step. Flow C has nothing
  analogous yet — probably fine until there's more than one app in Flow C's
  rotation.

## See also

- `astro-knots/context-v/blueprints/Jumbotron-Popdown-Patterns.md` — the
  "jumbo popdown" convention this doc's Option 2 ports into augment-it's
  Svelte shell (pattern port, not a shared dependency). Reference
  implementation: `astro-knots/sites/fullstack-vc/src/components/ui/menus/JumboPopdown__*.astro`.
- [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] — the sibling
  exploration, one layer down (customizing granularity *within* a flow,
  not choosing *which* flow).
- [[../specs/Strategy-Curator-Entry-Point-for-Augment-It]] — the spec of
  record for the Flow-C entry point this doc discusses; already self-titled
  "An Entry-Point App," which this exploration takes at face value and
  argues should get a real front door rather than a ROTATION splice.
- [[../specs/Record-DB-Resolver]] — Flow B's spec; the "dual-use, embedded
  in Flow A today" app.
- [[../specs/Workspaces-as-Tenant-Primitive]] — the sibling axis
  (`active_workspace_slug`) this doc's flow-navigation is conceptually
  distinct from, even though the popdown itself carries no persisted state.
- [[../plans/Build-Order-Humain-VC-Unlock-Flow]] — step 5 (thesis
  vocabulary) proceeds independently of this exploration; step 7 (sign-in
  wall) has no hard dependency on the popdown either way.
- [[../../context-v/plans/Unlock-Humain-VC-Team-Access-To-Augment-It]] —
  where "Flow 1" names the whole humain-vc user-journey, the second sense
  of "Flow" this doc disambiguates from the shell's `ROTATION`.
- [[../../context-v/explorations/Two-Clients-One-Flow-Corpora-Auth-and-Deployment-Converge]] —
  the ai-labs-level strategic framing this doc's Flow C is the tactical,
  shell-navigation-level version of; its Thread 1 ("domain-type becomes
  operator-facing") is exactly Build-Order step 5, which this doc treats as
  proceeding independently of the front-door question.
- 2026-07-06, mid-session — the operator opened `:3017` expecting shell
  chrome, found none, and named the underlying gap in their own words: "we
  kept running into workflows that don't fit the current shared shell
  header of 1-2-3-4." That's the origin of this doc.
