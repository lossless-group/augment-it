---
title: "Operator-built flows beyond the universal pipeline — the default augmentation path is a dud for most edge cases, and the cheaper-than-microfrontend escape is a view-spec the agent-chat composes from natural language and the UI renders generically"
lede: "The default flow lands cleanly on 17 of 96 reach-edu records. The escape isn't a microfrontend per scenario — it's a generic spec-renderer."
date_created: 2026-06-09
date_modified: 2026-06-09
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
tags:
  - Exploration
  - Augment-It
  - Records-Augmentation
  - Operator-Built-Flows
  - View-Specs
  - Composability
  - Agent-Chat
  - Edge-Cases
status: Draft
site_uuid: 88a68356-499a-4f81-84c9-10f1ffd20704
hex_code: xawo4c
date_authored_initial_draft: 2026-06-09
date_authored_current_draft: 2026-06-09
publish: true
---

# Operator-built flows beyond the universal pipeline

## The observation — why this exists

The 2026-06-09 audit produced a hard number: the operator built corpus content for **17 of 96** v8 prospects. Today's `/promote-snapshot` ship makes that gap visible on every row in Records Surface (the `corpus_count` chip) and in the v9 CSV's appended columns. The question staring back at the operator is: *now what?*

The honest read on those 96 records:

- **~17 rich-corpus prospects.** Big foundations, deep websites, active blogs, lots of indexable text. The default flow (SerpApi → Firecrawl → Jina → pack outputs → corpus) hits cleanly. These are *done for now*.
- **~24 deliberately-private prospects** — high-net-worth individuals (Bob Campbell, Bob Zorich, Karl Rathjen, Todd Fisher, James Patterson Philanthropy Advisor, Judy Dimon, Blair Miller), private family offices, small foundations operating by reputation. They have no public URL, no socials, no digital footprint to scrape. The default flow is a *dead end* and *should be*. Recognizing them as dead ends is itself a useful state — "we tried, here's why we don't have content" beats "blank row, unclear why."
- **~55 middle-band prospects** with URL + socials but thin or no corpus. The default flow under-performs: SerpApi misses sub-pages, Firecrawl loses Cloudflare-protected content (yesterday's Urban Institute capture surfaced this), Jina extracts text from PDFs but loses the binary (yesterday's plan fix), and a human-with-a-search-engine catches what the automated fan-out doesn't in two minutes of scrolling. *This is where the next chunk of ROI lives — and the default flow won't get us there.*

Operator framing 2026-06-09: *"Right now, we just assume we are firing known commands on the entire list, or we are firing them on them one by one. ... But now I realize to round out the data set/records and corpus, I need to do a bit by hand. But I want to focus on the records most likely to yield results."*

The universal pipeline assumes one path. The reality is three tiers with three very different next-step shapes — and that's just *today's* edge-case map. The list will grow. **What we need is not a microfrontend per tier; it's a way for the operator to construct the surface that fits their current job.**

## The concrete scenario — the tier-2 middle band

What the operator wants *right now*:

1. **Sort** by `corpus_count ascending` (focus the eye on the thinnest records).
2. **Filter** to `has_url == true AND has_socials == true` (skip the deliberately-private tier).
3. **Filter** to `corpus_count < 3` (skip the records that are already done-for-now).
4. **Show** these ~55 records as a focused worklist — Prospect name, URL, socials, current corpus_count, with one-click access to (a) open the URL in a new tab, (b) open social accounts, (c) save to inbox, (d) `+ add to corpus`.

Today none of that exists as a coherent surface. Records Surface filters but doesn't sort by augmentation state. Content Reader is per-record but doesn't surface URL/socials side-by-side. The operator would have to wire it together from existing surfaces — and *that itself* is the operator-built-flow problem in miniature.

## What augment-it knows that n8n / Flowise don't

The operator's pushback — *"frankly, I've never had an experience with them where it was easier AND better to build a flow"* — deserves a precise answer.

n8n and Flowise are **general-purpose flow builders**. They give you `if`, `loop`, `HTTP request`, `transform`, `wait` as primitives. To do anything domain-specific you wire those primitives together against an arbitrary data model. The flow is heavy because the data plumbing is heavy.

`augment-it` is **a records-augmentation system**. It has an implicit data spine — records keyed by `record_uuid`, derivable views via filter + sort + columns, augmentation verbs (`corpus.add`, `corpus.inbox.add`, `connector.fire`, `pack.fan_out`, `prompt.run`, `/promote-snapshot`) that all bind to that spine. The data-plumbing primitives are *implicit*. A "flow" in augment-it is always *"do these verbs against this subset of records"* — and that's a much smaller surface than "do these things, period."

The differentiator isn't polish. It's that **the spine is implicit**, so the operator's flow language can skip the verbs that make general-purpose flow builders feel like overkill.

| n8n / Flowise primitive | augment-it equivalent |
|---|---|
| `HTTP request` node | implicit in `pack.fan_out` / `connector.fire` |
| `Loop over items` | implicit — every verb runs against a *view* (filtered+sorted subset) |
| `Set` / `Transform` | implicit in the view-spec's column derivations |
| `If` / `Switch` | the *view* is the predicate; sort tiers replace branching |
| `Wait` / `Trigger` | mostly irrelevant — augmentations are operator-fired |
| `Code` node | the verb itself, configurable but not user-authored |

The flow language augment-it actually needs is roughly: **"for the view `<view-spec>`, fire verbs `<verb-1>, <verb-2>, ...` per row."** Three primitives. Bounded surface. Tractable.

## The design space — four tiers, climb only as needed

Sketched coarsely from cheapest / proven-shape to ambitious / unproven.

### Tier 1 — Sort + filter + named views

The cheapest move. Records Surface already filters; add sort-by-system-column and persisted **named views**. A view is a `(filter, sort, columns, row_actions)` quadruple — stored on disk per client (or per user later), addressable by name, shareable.

The operator's scenario above ships in this tier: "Tier-2 manual focus" is a named view with three filter clauses, one sort clause, and four row-actions wired to existing verbs.

**Proven shape because:** every other tool in this category (Airtable, Notion, Linear, even Excel) has converged on saved views as the primary composability primitive. Mature pattern; doesn't require new architecture.

**Cost estimate:** small. The state already exists in v9 columns; Records Surface needs sort UX and a "save this view" affordance. Maybe a new view-spec storage on disk under `clients/<client>/views/`.

### Tier 2 — Named playbooks (sequenced verbs against views)

Once views exist as nouns, the operator can name a sequence: *"playbook 'middle-band sweep': fire pack X on view Y, then for each row, open the URL in a side panel, then prompt the operator to mark done or save-to-inbox."* That's a playbook — a verb sequence + an optional per-row review loop.

This is the first thing that meaningfully resembles a flow. But notice the surface: it doesn't need branching, doesn't need loops (the view *is* the iteration), doesn't need transforms (the view-spec carries derived columns). It needs (sequence, per-row checkpoint, completion criteria).

**Proven shape because:** linear playbooks with a per-row review loop are exactly how investigators / SDRs / researchers work today, with checklists. The chat-verb registry already exists — playbooks are *named sequences* of verbs the registry already knows about.

**Cost estimate:** medium. Storage shape similar to views; new "playbook runner" UI (or extend Records Surface with a per-row checkpoint mode); new chat verb `/run-playbook <name>`.

### Tier 3 — Agent-composed view-specs and playbooks

The ambition the operator named: *"core users could essentially use agent-chat to build a custom microfrontend that fits into their flow."*

The realization: **the user doesn't need a microfrontend. They need a view-spec that the existing UI renders.** And agent-chat is *very good* at producing structured output that matches a schema. If view-specs are a stable JSON shape, the chat composes them from natural language:

> **Operator:** "Show me records with URL and at least one social but fewer than 3 corpus files, sorted by lowest corpus_count first."
>
> **Agent:** `{ "view_name": "Tier-2 manual focus", "filter": { "corpus_count": { "lt": 3 }, "has_url": true, "has_socials_count_gte": 1 }, "sort": [{ "column": "corpus_count", "direction": "asc" }], "columns": ["Prospect / Organization", "url", "socials", "corpus_count", "Stage"], "row_actions": ["open_url", "open_socials", "save_to_inbox", "add_to_corpus"] }`

The chat output IS the view-spec. The UI is a generic spec-renderer. No code generation, no transient microfrontend; just *a configurable rendering of the existing primitives*. This is dramatically more tractable than "agent generates a microfrontend" because the surface area is bounded by the view-spec schema.

**Proven shape because:** structured-output prompting is what Claude tool-use is built for. The verb registry is already half-there ([[../specs/Chat-Context-Awareness-Architecture]] v0.0.2 derives it from per-verb descriptors). The view-spec is a small additional schema.

**Cost estimate:** medium-to-large. Depends on Tiers 1 + 2 having proven the view-spec shape first. The chat-side composition is a new tool (`compose_view_spec`) and a new result-renderer branch.

### Tier 4 — A formal flow editor

The thing the operator explicitly *doesn't* want — yet. *"This is like a flow builder. How is it different than n8n or Flowise. Well, frankly, I've never had an experience with them where it was easier AND better."*

A formal flow editor would let the operator draw a DAG of verbs with conditionals, branching, loops, transforms. **It is the never-shipped fourth tier unless the prior three prove insufficient.** The prior three skip the data-plumbing primitives that make general flow builders feel like overkill *because the data spine is implicit*. If a real use case appears where the spine doesn't carry the load (e.g. multi-client cross-comparisons, conditional fan-outs based on prior-run state), the case for a flow editor strengthens. Until then, three tiers is the budget.

## Key considerations

- **The data spine is the load-bearing simplification.** Every tier above works *because* `record_uuid` keys everything and views are subsets of that spine. The moment we try to express something that *isn't* "verbs against a record subset" — say, "trigger a flow when an external webhook fires" — the n8n/Flowise primitives reappear and the simplicity collapses. Stay within the spine.
- **View-specs need to be the same shape across all tiers.** If Tier 1's "saved view" and Tier 3's "agent-composed view" use different JSON shapes, the agent ends up generating a different artifact than the human builds, and the abstraction leaks. *One spec, two authors* (human-via-UI, agent-via-chat) is the contract.
- **The state v9 added is the prerequisite for Tier 1.** `corpus_count`, `corpus_last_updated`, `corpus_funder_slug`, `corpus_by_pack` are columns the operator can now sort and filter on. The 2026-06-09 ship made the next move *possible*; this exploration is what to do with it.
- **What other state needs to exist?** For the operator's specific scenario: `has_url` (derived from `url` non-empty), `has_socials` (derived from `socials` non-empty), `socials_count` (derived from parsing the socials column). These are derivable today at view-render time without storing them. If they become load-bearing across many views, they graduate into the augmentation-state register (the [[../plans/Augmentation-State-Preservation-and-Snapshot-Promotion]] plan deferred the register; this would be a motivating use case).
- **Per-tier prospect classification.** The "rich / middle / private" tier model could itself be a derived column (`augmentation_tier: rich | middle | sparse | private`). That makes "show me all middle-tier prospects" a one-clause filter. The classification rules are operator-editable; the agent can suggest the thresholds.
- **What about edge cases beyond the middle-band scenario?** Easy to name three more: (a) PDF-heavy prospects where the Jina extraction is poor and Marker/PyMuPDF re-extraction is needed; (b) press-release-only prospects whose blog index is hostile to scraping but whose press wire is RSS-able; (c) cross-foundation theme analysis where the unit isn't a single record but a slice across many. Each is its own tier-2 named view + tier-2 playbook. None requires a microfrontend.
- **Privacy + per-client isolation.** Views/playbooks live in the per-client repo (`clients/<client>/views/`, `clients/<client>/playbooks/`). They're operator artifacts, not system state — the operator owns them, commits them to the per-client repo's history, and they travel with the corpus.
- **The "completeness anxiety" framing.** The operator's stated motivation — *"going to my client with strategies and content informed by only 10-15 funders would make me look like I didn't really try"* — names something real. Tier 1 ships a tool that *makes the gap visible*, then lets the operator close it efficiently. That framing is worth keeping; it should drive how the named views are surfaced ("**26 records need attention**" beats "**all records**").
- **The agent's confidence on composition.** Tier 3 only works if the agent reliably produces valid view-specs. The schema needs to be tight and the prompt needs to be example-driven. We've seen the chat do this well for `/inbox` arg-parsing; view-spec composition is harder because the parameter space is larger. Bench it with five real natural-language requests before committing.
- **What "execute the flow" actually means at each tier.** Tier 1: the view *is* the surface — no execution beyond rendering. Tier 2: the playbook is fired as a single chat verb; the chat orchestrates the sequence. Tier 3: same as Tier 2; the chat just *produced* the view-spec / playbook-spec instead of receiving it from a saved-list. No flow-execution-engine needed; the chat's already a flow runner of sorts.
- **What if the operator wants to share a view with a colleague?** Views in `clients/<client>/views/<slug>.yaml` (Lossless flavor — YAML, frontmatter, train-case slug) are git-trackable artifacts. Sharing is `git pull`. No view-sharing service needed in v1.

## Recommendation — sequence

Three concrete next steps, sequenced; the fourth tier remains explicitly deferred.

**Step 1 — Tier 1 spec + ship.** Author a context-v spec for `Operator-Built-Views-and-Sort-Filter-Persistence` (working title). Scope: sort by any column (including system columns), persisted named views in `clients/<client>/views/<slug>.yaml`, row-actions row-bound to existing verbs (`open_url`, `open_socials`, `save_to_inbox`, `add_to_corpus`). Ships the immediate tier-2 middle-band scenario. Builds on the v9 system columns we just shipped.

**Step 2 — Tier 2 spec + small ship.** Author a spec for `Named-Playbooks-as-Sequenced-Verbs-Over-Views` (working title). One playbook = view + verb-sequence + per-row checkpoint UX. Ships one real playbook ("middle-band sweep") to validate the shape before generalizing. Likely depends on [[../specs/Chat-Context-Awareness-Architecture]] v0.0.2 having landed (the derived verb registry).

**Step 3 — Tier 3 prototype only, then revisit.** Build a small prototype of `compose_view_spec` as a chat tool. Bench it against five real operator prompts. If it produces valid view-specs ≥4/5 of the time, it's worth a real spec; otherwise the gain over Tier 1's manual-construction UX isn't worth the engineering. Decide after the bench, not before.

**Step 4 — Flow editor deferred.** Don't write the spec. Don't reserve the directory. Don't sketch the UX. Tier 4 is *blocked on Tier 3 being insufficient*, which is itself blocked on Tier 2 being insufficient. Three tiers of evidence first; only then is the n8n-comparison worth re-having.

## Open questions

- **Should "view" and "named playbook" be one concept or two?** A playbook is a view + a verb-sequence + a row-loop. Could be modeled as a view with optional `playbook:` block. Lean: separate top-level concepts because a view-only artifact has a much smaller surface and ships earlier; merging risks ballooning the spec.
- **Where does the operator's "I tried this view and it didn't work" feedback live?** Probably a `notes:` field on the view artifact, edited inline. Or a `view-history.yaml` log. Don't pre-decide; let the second view shape the third.
- **What about a record-level "marked done for this cycle" flag?** Adjacent. The operator's tier-2 scenario implies the rich-corpus tier is "done for now" — but there's no flag for that. Could be a per-cycle field in `clients/<client>/augmentation-state/<record_uuid>.yaml` (the register deferred by the snapshot-promotion plan). Worth raising on the snapshot-promotion plan as a motivating use case for the register.
- **Cross-client views.** Out of scope for v1 — augment-it is single-client today. But a view-spec that referenced only spine columns (Prospect, url, socials, corpus_count) is structurally portable across clients. Worth holding the shape portable even if v1 doesn't use it.
- **Agent-driven *suggestions* vs agent-driven *construction*.** Different gradients. Tier 3 is full construction. A cheaper intermediate: the agent suggests three views the operator might find useful given the current data shape, and the operator picks/edits. Worth prototyping alongside Tier 3.
- **Does this collide with the existing Connector Palette?** The palette is verb-per-row; Tier 2 playbooks are verb-sequences-per-row. They compose: a playbook step might *be* "fire the connector palette's preferred chain." Worth a sketch.
- **What's the smallest valid view-spec?** Probably `{ filter, sort }` — columns and row-actions default to the current Records Surface defaults. The schema should make the minimum bare-bones, with everything else optional with sensible defaults.
- **Snake-case vs camel-case in the view-spec.** Per the context-v frontmatter discipline ([[../specs/Funder-Content-Corpus-Workflow]] § frontmatter), snake_case throughout — `record_uuid`, `corpus_count`, `view_name`. The chat output should match.

## See also

- [[../plans/Augmentation-State-Preservation-and-Snapshot-Promotion]] — the plan that just shipped the system columns this exploration's Tier 1 sorts on. The deferred "augmentation-state register" returns in Tier 2's "marked done for this cycle" sketch.
- [[../specs/Funder-Content-Corpus-Workflow]] — the parent spec. Rule 5 (operator authority per item) is the principle that makes operator-built flows ideologically aligned, not a deviation.
- [[../specs/Chat-Context-Awareness-Architecture]] — Tier 3 directly depends on v0.0.2 of this spec landing (the verb registry derived from per-verb descriptors). The view-spec is a new schema the chat composes; the verb registry is the catalog it composes from.
- [[../specs/Response-Reviewer-Shell-and-Content-Reader-Mode]] — Records Surface and Content Reader both live in the response-reviewer app; Tier 1's sort UX and named-view affordance ships there.
- [[../specs/Connector-Inventory-and-Per-Record-Palette]] — Tier 2 playbooks should compose with the per-record palette, not replace it.
- [[Multi-Agent-Research-Fan-Out-Per-Row]] — the sibling exploration that frames "research as N parallel agents per row." Operator-built flows is the *containing* idea; multi-agent research is one *kind* of playbook that fits inside.
- [[Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door]] — the layer above this one: this doc customizes granularity *within* the CSV-row-augmentation flow (Tiers 1-4, all views/playbooks over records); that doc is about choosing *which* flow is active at all (augmentation vs. domain/thesis curation vs. DB reconciliation) before any of these tiers apply.
- [[../../changelog/2026-06-09_01_Inbox-PDFs-Land-as-Binaries-Plus-Chat-Commands-Popover]] — today's ship. The Commands popover this exploration extends to include `/save-view` and `/run-playbook` once Tiers 1 + 2 ship.
- 2026-06-09 in-session audit — the 17/96 coverage number that motivates this exploration; the conversation that produced this doc treated "where do we go next" as the load-bearing question once visibility was solved.
