---
title: "Flow for Bundles & Packs — The Simplest Possible Thing"
lede: >-
  For 67 rows with a website URL, find each one's blog index. Two surfaces, no reviewers — this spec deliberately ignores the five before it.
date_created: 2026-06-02
date_modified: 2026-06-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.3
revisions:
  - 2026-06-02 — Initial draft (0.0.0.1).
  - 2026-06-02 — **Non-destructive refactor rule locked (0.0.0.2)**. Replaced the §"What gets thrown away" section with §"What stays untouched". The new Records Surface is purely additive — `apps/records-surface/` is a new federation remote alongside the existing `apps/pack-runner/`, `apps/response-reviewer/`, etc. Nothing in the existing remotes gets deleted, nothing in `services/social-search/` gets removed. The dispatch shim, the chip palette components in pack-runner and response-reviewer, the bundle configs — all stay as-is. The Records Surface uses its own connectors, its own state, its own components, and ignores response-store. The other surfaces keep working as they do today for anyone who's mid-workflow on them.
  - "2026-06-02 — **Response Reviewer becomes a shell (0.0.0.3)**. Added §\"Response Reviewer as a shell — fire type determines the inner UI\". The current Response Reviewer hard-codes the socials triage UI for every record, which is why a Blog fire surfaces socials noise. Response Reviewer becomes a thin shell remote that loads a different inner UI based on what was last fired against the active record set. Pairings: socials bundle → SocialsTriageView (current UI, preserved unchanged); URL-finder pack/bundle (the new flow) → CandidatesView (the inline-candidates UI the Records Surface uses, lifted into Response Reviewer as a reusable view); prompt apply → PromptResponseView (existing). When the user is reviewing a Blog fire, the SocialsTriageView is not even mounted — no noise, no need to scroll past it. Same pattern applies to future fire types: pack/bundle/prompt each pair with a view; the shell loads the right one."
tags:
  - Spec
  - Augment-It
  - Bundles-and-Packs
  - Simplest-Possible-Thing
  - Flow
  - Records-Surface
  - Component-Decomposition
  - No-App-Svelte-Bundling
status: Draft
site_uuid: 6abd4987-bdc9-4d55-9267-2f1b809e2ced
hex_code: nd2wz3
date_authored_initial_draft: 2026-06-02
date_authored_current_draft: 2026-06-02
publish: true
---

# Flow for Bundles & Packs

## The job

I have a dataset of 96 records. Each record is an entity (foundation,
school, org). 67 of those records have a valid URL in their `url` column.

For each of those 67, I want to find a single URL — the entity's blog,
news, press releases, insights, or whatever they call their public
content stream.

That's the job. Not bundles. Not rollups. Not curation layers. Not
adaptive request reviewers. Not registries of nine kinds of connector.

**Find a URL per row. Show it to me. Let me accept it.**

## The flow

```
┌──────────────────┐     ┌─────────────────────┐
│ Record Collector │ ──→ │  Records Surface    │
│   (existing)     │     │       (new)         │
└──────────────────┘     └─────────────────────┘
```

Two surfaces. That's it.

- **Record Collector** stays. It already does its job — pick a record
  set, see the rows.
- **Records Surface** is new. It is the only surface where bundle/pack
  work happens.

The numbered Flow chrome (1 → 2 → 3 → 4 → 5) at the top of the shell
**collapses to two steps for pack work**: step 1 is Record Collector,
step 2 is Records Surface. Steps 3 / 4 / 5 don't apply. The shell
should hide them when the active operation is a pack fire.

## The Records Surface

A list. One row per record. Each row shows three things:

1. **Entity name** — read-only.
2. **URL** — the row's existing URL field. Editable inline (sometimes
   the URL is wrong and the user can fix it).
3. **A small horizontal row of connector buttons.**

Click a connector button. See candidates appear inline below the row.
Click a candidate. The candidate URL gets saved to the row in the
target column. Done. Move to the next row.

That's the whole UI.

### What's hidden by default

Every other column on the record. You don't need to see "ACH grant
amount" or "executive director name" when you're trying to find a
blog URL. A small `[show all fields]` toggle per row exposes the rest
when you want it.

### What's NOT here

- No bundle picker.
- No roster check-boxes.
- No "filter by has-url / no-url" (the 29 rows without a URL show as
  rows with no buttons available + a `[paste a URL]` affordance).
- No fan-out preview.
- No cost estimate.
- No Request Reviewer.
- No Response Reviewer.
- No status-by-pack chip palette at the top of each row.
- No `accepted` ✓ badge soup.
- No re-fire menu with cost tiers.

If you want any of those later, they're additive. Not now.

## The connectors (v0 — three are enough)

1. **`serpapi-site-search`** — sends `site:<row.url> blog OR news OR
   press OR insights OR stories` to SerpApi. Returns up to 10
   candidate URLs from the entity's domain.
2. **`firecrawl-nav-scan`** — scrapes the row's URL with Firecrawl,
   extracts links from `<header>` and `<footer>` and any `<nav>`
   blocks, returns those candidates as-is.
3. **`firecrawl-nav-agent`** — same scrape, but pipes the nav/header/
   footer links + their anchor text through Haiku with a one-line
   prompt: *"Which of these links is a blog, news, press, or
   insights index? Return the URLs."* The agent's filtered list is
   the candidate set.

That's the v0 connector inventory. Three. All target the same
capability: *"find an index URL for this entity's content stream."*

### How the agent connector works

The agent isn't a magical thing. It's:

1. Firecrawl scrape returns `links[]` + `markdown`.
2. Extract the links inside the markdown's top section (header) and
   bottom section (footer) using simple position-based slicing.
3. For each link, find the anchor text in the markdown (`[text](url)`).
4. Build a list: `[{ url, text }, ...]`.
5. One Haiku call: *"Here is a list of nav links from a foundation's
   homepage. Return only the URLs that point at a blog / news / press
   / insights / publications / stories / grants-news index. Output
   one URL per line."*
6. Parse the response, dedupe against the input, return.

Cost: one Haiku call per row. Order of cents per 1000 rows.

## Result: candidates inline

When a connector returns, candidates render below the row:

```
┌─ Walton Family Foundation ────────────────────────────────┐
│ url: https://www.waltonfamilyfoundation.org   [edit]      │
│                                                            │
│ [serpapi] [firecrawl-nav-scan] [firecrawl-nav-agent ←]    │
│                                                            │
│ ▼ firecrawl-nav-agent · 4 candidates                       │
│   • https://www.waltonfamilyfoundation.org/news     [pick] │
│   • https://www.waltonfamilyfoundation.org/stories  [pick] │
│   • https://www.waltonfamilyfoundation.org/our-work [pick] │
│   • https://www.waltonfamilyfoundation.org/grants   [pick] │
└────────────────────────────────────────────────────────────┘
```

Click `[pick]` on one → that URL is written to the target column on
the row. The candidates block collapses. The chosen URL appears
inline at the top of the row.

Want to try a different connector? Click another button. The new
results render below. Pick one if it's better — additively. Old
accepted value stays unless explicitly replaced.

That's the entire interaction.

## Component architecture — the non-negotiable

**App.svelte is a thin shell. Logic and components live in their own
files.** This is a hard rule.

The user has lived through previous projects (~1.5 years ago, building
this same app via Bolt.new and Lovable) where complex functionality
got dumped into a single App.js / App.svelte file and the codebase
became unworkable. **That pattern is not going to repeat here.**

### What App.svelte is allowed to do

- Mount the workspace WebSocket (one-line `workspace.connect`).
- Render the top-level layout (header / records list / nothing else).
- Import + render component files.

That's it. No state declarations beyond what's needed to wire the
imported state stores. No business logic. No connector configs. No
pack/bundle data. No event handlers beyond passing them to children.

### File structure for the Records Surface

```
apps/records-surface/src/
├── App.svelte                      ← thin shell, ~30 lines max
├── components/
│   ├── RecordsList.svelte          ← the list of rows
│   ├── RecordRow.svelte            ← one row (name, url, connectors)
│   ├── ConnectorButton.svelte      ← one fire button
│   ├── CandidatesPanel.svelte      ← inline candidates block
│   └── CandidateItem.svelte        ← one [pick] row inside the panel
├── state/
│   ├── records.svelte.ts           ← record-set + rows store
│   ├── fires.svelte.ts             ← per-row fire state (firing /
│   │                                  results / accepted)
│   └── target-column.svelte.ts     ← which column accepted URLs land in
├── logic/
│   ├── connectors/
│   │   ├── serpapi-site-search.ts
│   │   ├── firecrawl-nav-scan.ts
│   │   └── firecrawl-nav-agent.ts
│   ├── fire.ts                     ← orchestration (which connector,
│   │                                  publish result, update state)
│   └── accept.ts                   ← write a candidate to the row
├── types.ts                        ← Row, Candidate, FireResult, …
└── app.css                         ← styles only
```

Every component file is its own concern. Every logic file is its own
function. State stores expose typed getters + actions, no inline
mutation from components.

### Rules

- **Components are dumb.** They take props, emit events, render. They
  do not import from `logic/` directly.
- **Logic is pure.** Functions in `logic/` take inputs, return
  outputs, may call connectors / workspace. They do not touch DOM.
- **State is the bridge.** Components subscribe to stores; stores call
  logic; logic updates stores. One-way.
- **App.svelte is a router and a mount point.** Nothing else.

If a component file goes past ~150 lines, split it. If a logic file
goes past ~100 lines, split it. If `App.svelte` goes past ~50 lines,
move something out of it.

## What stays untouched

**Non-destructive refactor rule. Nothing gets deleted. No remotes
removed. No files removed.**

The user has been clear: previous projects (~1.5 years ago, Bolt.new /
Lovable era) hit pain when refactors deleted work and then needed it
back. This spec is purely **additive**:

- **All existing remotes keep running.** `apps/pack-runner/`,
  `apps/response-reviewer/`, `apps/request-reviewer/`,
  `apps/record-collector/`, `apps/chat/`, `apps/enhanced-records-list/`
  — every one of these stays exactly as it is. Their dev ports, their
  federation registration, their localStorage keys, their behavior —
  all unchanged.
- **The work on `feat/bundle-media-packs` stays.** The dispatch shim
  (`services/social-search/src/entity-pulse/dispatch.ts`), the chip
  palette components in pack-runner and response-reviewer, the bundle
  configs in both `bundles.ts` files, the Entity Pulse pack handlers,
  the connector registry, the NATS payload bump, the iso-helper —
  none of it gets removed. None of it gets reverted.
- **Response-store contents stay.** The 575+ existing responses across
  v4 / v5 record sets stay. Whatever's mid-triage stays mid-triage.

### How the Records Surface coexists

The Records Surface is **a new federation remote** added alongside
the existing ones. It:

- Has its own port (e.g. `:3011` — picked to not collide).
- Has its own federation registration in the shell.
- Has its own dev script entry under `pnpm stack frontend`.
- Has its own WebSocket connection to the workspace (same workspace
  the other remotes use).
- Reads the same row data as everyone else but uses its own state
  store, its own components, its own connectors.
- Does NOT write to response-store. Accepted URLs go to `row.update`
  directly via the existing workspace capability.

The shell's Flow chrome gets a small adaptation: when the user picks
the Records Surface as their step-2 destination (a new option
alongside Pack Runner), the steps 3 / 4 / 5 hide for that session.
The user can still navigate back to step 1 (Record Collector) or
into any other remote via the existing nav — nothing is locked.

### What about the work that was code-only on this branch?

The half-finished per-row palette wiring in
`apps/pack-runner/src/App.svelte` (the `fireOneRow` handler,
`PACK_PALETTE_META`, the inline palette markup) stays. It typechecks,
it just isn't proven to work visually. The Records Surface doesn't
depend on it; it's there if someone wants to keep iterating on
Pack Runner specifically.

### Reuse without deletion

The Records Surface IS allowed to import and reuse:

- The `firecrawlScrape` client from
  `services/social-search/src/connectors/firecrawl.ts`.
- The `serpapiConnector` from
  `services/social-search/src/connectors/serpapi.ts`.
- The `runOfficialBlogPack` handler from the entity-pulse pack —
  via a new wrapper connector that adapts its output to the
  `Candidate[]` shape this spec specifies.

These imports are READ-ONLY usage. The source files don't change.

## What the workspace exposes

One capability for v0:

```
connector.fire
  args: { row_id, row_url, connector_id, target_column }
  returns: { candidates: Candidate[], fired_at, connector_id }
```

`connector_id` is one of `'serpapi-site-search'`,
`'firecrawl-nav-scan'`, `'firecrawl-nav-agent'`.

The return shape:

```ts
type Candidate = {
  url: string;
  title?: string;
  anchor_text?: string;
  // optional confidence: 0-100 if the connector emits one (the agent
  // can). Otherwise undefined.
  confidence?: number;
};
```

Result is **not persisted** to response-store. It rides on the
workspace reply and lives in the Records Surface's fires store for
the session. The user accepts a candidate → the workspace's existing
`row.update` writes the URL to the row's target column.

That's the whole capability surface for v0.

## Response Reviewer as a shell — fire type determines the inner UI

The current Response Reviewer hard-codes the socials triage UI (the
seven-pack chip row, the per-pack response items, the tavily badges,
the URL-edit affordances). It works beautifully for socials. It is
**absolute noise** when the user is trying to find a blog/feed/press
URL because every record's card surfaces the full socials UI whether
the user fired socials or not.

The fix: **Response Reviewer becomes a shell.** It is a federation
remote frame that loads a different *inner view* depending on what
was last fired against the active record set. The shell renders the
list of records and the top-level filter chrome (record set picker,
triage filters). The inner view per record card is swapped.

### The pairing

| Fire type | Inner view |
|---|---|
| Socials bundle (Profile Builder, common-seven) | **SocialsTriageView** — the current UI, unchanged. Seven-pack chip row, per-pack candidates, inline URL edits, ✓-accepted badges, tavily provider badges. |
| URL-finder pack/bundle (Entity Blog, Press, Insights) | **CandidatesView** — the same inline-candidates panel the Records Surface uses. Name + URL on the row, list of candidate URLs below with `[pick]` buttons. No socials chips. No prior-fire mixing. |
| Prompt template `apply` | **PromptResponseView** — the existing prompt-output view per `prompts.apply` results. Unchanged. |
| Future fire types | **Future view** — each new fire type pairs with a view; the shell loads the right one. |

When the user reviews a Blog fire, the SocialsTriageView is **not
mounted** in the DOM. There is nothing to scroll past. The Records
Surface inline-candidates view IS the review for that fire.

### How the shell knows which view to load

A single piece of state per record set: `last_fire_type`. Set by
whichever surface fired against the set most recently. Read by the
Response Reviewer shell on mount + on record-set change.

`last_fire_type` values (v0):

- `'socials-bundle'`
- `'url-finder'` (covers the Records Surface's pack-or-bundle fires)
- `'prompt-apply'`

Lives in workspace state (server-side), broadcast on change. The
shell subscribes. Any open Response Reviewer window re-renders when
the type changes.

### What this means for the existing Response Reviewer code

**Nothing gets deleted** (per the non-destructive rule). The current
`App.svelte` in `apps/response-reviewer/` keeps its socials triage
logic. That code becomes the body of `SocialsTriageView.svelte` —
moved into a component file, imported into the shell. The shell
file becomes thin (`App.svelte` ~30 lines, just routing + view
loading).

`CandidatesView.svelte` is a NEW component file. It shares its
implementation with the Records Surface's row-results panel — both
import the same `CandidatesPanel.svelte` component from a shared
location (`apps/response-reviewer/src/components/` or, if both
remotes need it, a shared package).

`PromptResponseView.svelte` is whatever already exists for prompt
responses, moved into its own file.

### Component decomposition reminder

The same rule from §"Component architecture" applies here. The
`App.svelte` shell file is a router. Inner views live in
`components/`. State stores live in `state/`. Logic lives in
`logic/`. No bundling.

```
apps/response-reviewer/src/
├── App.svelte                          ← thin shell, ~30 lines max
│                                         (mount workspace + load
│                                          the active view)
├── components/
│   ├── SocialsTriageView.svelte        ← current UI lifted here
│   ├── CandidatesView.svelte           ← new — for URL-finder fires
│   ├── PromptResponseView.svelte       ← prompt outputs (existing)
│   ├── CandidatesPanel.svelte          ← shared with Records Surface
│   └── ... (any sub-components of the above)
├── state/
│   ├── records.svelte.ts
│   ├── last-fire-type.svelte.ts        ← reads the workspace state
│   └── ...
└── logic/
    └── ... (per-view logic in own files)
```

### Why this matters

Without this pairing the Records Surface is half a solution. The
user fires a Blog pack from the Records Surface, accepts the URL
inline, the row updates — good. But the moment they navigate to
Response Reviewer (out of habit, or to check on prior socials work,
or because they fire a second time and want history), they see the
old socials triage UI on every card whether it applies or not.

With the pairing the Response Reviewer surface always shows the
right tool for the job. No noise. No scrolling past.

## Done-when

v0 of this flow ships when:

1. A user can open the shell, click step 1 → step 2.
2. The Records Surface shows the rows of the active record set with
   names and URLs visible, all other columns hidden behind a per-row
   toggle.
3. Per row, three connector buttons render.
4. Clicking a button fires the connector and renders candidates
   inline within 30 seconds (Firecrawl's typical latency).
5. Clicking `[pick]` on a candidate writes that URL to the row's
   target column, visible immediately.
6. The next click on a different connector for the same row shows
   new candidates without losing the accepted URL.
7. Rows without a `url` field render the connector buttons disabled
   and a `[paste URL]` affordance.
8. Response Reviewer's `App.svelte` becomes a shell that loads
   `SocialsTriageView` for socials fires and `CandidatesView` for
   URL-finder fires. When the active record set's `last_fire_type`
   is `'url-finder'`, the SocialsTriageView is not mounted; the user
   sees only the candidates for the fire they ran.

Nothing else. No bundles. No rollups. No fan-out. No bulk fire. No
promote step.

## Why this spec is so short

Because the previous specs were so long. The Entity-Pulse-Bundle spec
is 980 lines. The Connector-Inventory spec is 476. The
Pulse-Curation-Layer spec is 436. The Per-Record-Iteration spec is
~700. Combined: ~2600 lines of spec for what is fundamentally a job
that needs three connectors and one screen.

The user's words: *"this is not hard, whatever it is we are
remarkably overthinking it."*

This spec is short on purpose. If the simplest possible thing works,
the rest of those specs can stay archived as future-feature notes —
the bundle composition, the curation layer, the rollup-agents, the
per-record palette, the registry of capabilities. They're not
incorrect; they're just not v0.

## What about the previous data, the 575 stale responses, the broken UI?

Out of scope here. v0 of this surface ignores response-store entirely.
The accepted URLs land on the row directly. Whatever's in
response-store from prior experiments can stay there or be wiped — it
doesn't affect this flow.

The previous Augment / Request Reviewer / Response Reviewer surfaces
keep working for prompt-template fires (Profile Builder etc.).
Bundle/pack fires move to the Records Surface and nowhere else.

## What gets built in what order

1. Create `apps/records-surface/` as a new federation remote. Get it
   mounted in the shell. Empty surface.
2. Wire it to the workspace. Read the active record set, list rows
   with name + url. Read-only.
3. Implement `serpapi-site-search` connector + `connector.fire`
   capability. Wire a button on each row that calls it. Render
   candidates inline. *Skipped if no SerpApi key — go to 4 first.*
4. Implement `firecrawl-nav-scan` connector. Same wiring.
5. Implement `firecrawl-nav-agent` connector. Adds the Haiku call.
6. `[pick]` → `row.update` writes the URL.
7. Per-row `[show all fields]` toggle for the hidden columns.
8. `[paste URL]` affordance for rows without a URL.
9. Refactor Response Reviewer's `App.svelte` into a shell. Move the
   existing socials triage logic into `SocialsTriageView.svelte`.
   Add `last_fire_type` reading. Add a stub `CandidatesView.svelte`
   that renders inline candidates (lifted from Records Surface's
   panel). Wire the shell to load the right view.

Each step is small when done correctly. If a step starts blowing past
that, the step is wrong, not big — back out and reframe.

## Done.

That's the spec.
