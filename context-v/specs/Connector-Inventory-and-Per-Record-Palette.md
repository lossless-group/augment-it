---
title: "Connector Inventory & Per-Record Palette — Hot-Swap Providers, Re-Fire One Record at a Time"
lede: "Today's connectors are hardcoded into a small ProviderId union and bound to specific packs at compile time. The reality of LLM web research is that providers churn — new ones launch, old ones rate-limit, costs shift, a specific entity needs a specific connector to crack a stubborn search. The system needs to (a) accept any connector at runtime via a registry that resolves by *capability* not by hardcoded id, and (b) give the human, at triage time, a per-record palette of short-labeled buttons — click `f` to re-fire just this record through the next Facebook connector in priority order, or long-press to pick a specific one. The killer UX from prior live attempts: per-row, per-intent, per-connector, one click. This spec scopes the registry, the pack-intent declarations, the bundle-level chain config, the per-record palette, and the integration with the Pulse Curation Layer."
date_created: 2026-06-02
date_modified: 2026-07-21
date_first_published: 2026-06-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Spec
  - Augment-It
  - Connectors
  - Provider-Plurality
  - Per-Record-Palette
  - Triage-UX
  - Hot-Swap
  - Capabilities
  - Pulse-Curation
status: Partially-Shipped
---

# Connector Inventory & Per-Record Palette

## Why this exists

The 2026-06-02 engineering-handoff read on
[[Entity-Pulse-Bundle]] flagged "Connector inventory + which are
NEW" as a blocking gap — the spec named providers without saying
which need building or how they'd be added later. The user's
sharpening pushed past that:

> *"The reality is we should be able to expand and experiment with
> the connector inventory ad-hoc and on the fly. So there needs to
> be both a coded and UI interface that allows for the abstraction
> of 'accepts any connector.'*
>
> *In our last live attempt at this in the social profile finder
> pack, I found that running specific connectors by clicking a
> button for that specific record item the most helpful. So per
> record, clicking 'Facebook Page' (shortened with `f`). But I want
> to say that each connector/API should be available from the same
> button."*

Two halves:

1. **Code abstraction.** A registry that any connector can register
   into; packs declare *intents* (capabilities) and a *priority
   chain* of connectors that serve them; the system can swap which
   connector fires for a given intent at any granularity (per-
   bundle default, per-pack default, per-fire override, per-record
   override).
2. **UI abstraction.** A **per-record palette** at triage time — a
   row of short-labeled intent buttons attached to each record card.
   Default click fires the pack through its next-preferred connector
   for that record; long-press / right-click reveals the full
   connector menu for that intent (with cost tier + availability).
   Multiple connectors live behind one button — the button names
   the *intent* ("Facebook"), not the connector.

The combination is what makes the system *responsive* in the
live-triage sense: when the human notices the LinkedIn pack returned
junk for one specific row, they click that row's `in` button to
re-fire through the next connector, and the result lands in the
curated layer alongside the original. Augmenting becomes a
conversation between human and registry, one row at a time.

## The two abstractions, conceptually

### Intent ≠ connector

Today the LinkedIn pack is implicitly bound to "search via SearXNG."
That binding is wrong — *the user wants the LinkedIn page*; the
connector is *one of several ways* to get it. The decoupling:

- **Intent**: `search.social.linkedin` — *"find this entity's
  LinkedIn page"*. A first-class capability the system reasons about.
- **Connector**: `searxng` / `tavily` / `serpapi` / `linkedin-api` /
  some future connector — *one of N ways to serve that intent*.

A pack declares which intent it serves, NOT which connector it uses.
The pack's `preferred_connectors` chain is configuration (orderable,
overridable, swappable) rather than code (hardcoded in the pack
body). Adding a new connector for an existing intent is a
registration + a config line — no pack changes.

### Same button, many connectors

The per-record palette button labeled `f` ("Facebook") fires the
**intent** `search.social.facebook`. Behind it sits whatever connector
chain the user has configured for that intent. Default click walks
the chain in priority order; the user can also pop the menu and pick
a specific connector for that one fire. Multiple connectors live
behind one button because *the button names what the human wants*,
not the implementation detail.

## Code seam — the Connector Registry

### `Capability` — the enum of intents

```ts
export type Capability =
  // Generic web
  | 'search.web'
  | 'search.news'
  | 'search.scholar'
  // Social — per platform
  | 'search.social.linkedin'
  | 'search.social.x'
  | 'search.social.bluesky'
  | 'search.social.facebook'
  | 'search.social.instagram'
  | 'search.social.youtube'
  | 'search.social.tiktok'        // future
  | 'search.social.threads'       // future
  // Crawl + extract
  | 'crawl.site'
  | 'crawl.extract'
  // Knowledge / structured
  | 'fetch.knowledge_graph'
  | 'fetch.wikipedia';
```

Adding a capability is **one line**. Connectors then declare they
serve it; packs declare they want it. The enum is the language the
registry speaks.

### `ConnectorRegistration` — the registry entry

```ts
export type ConnectorRegistration = {
  id: string;                          // 'serpapi-google'
  display_name: string;                // 'Google via SerpApi'
  short_label: string;                 // 'SerpApi/G' — shows in the per-record menu
  capabilities: Capability[];          // ['search.web', 'search.social.linkedin', ...]
  cost_tier: 'free' | 'free-tier' | 'paid';
  requires_env: string[];              // ['SERPAPI_API_KEY']
  rate_hints?: {
    per_second?: number;               // soft cap; the registry throttles
    daily_cap?: number;                // for budget-tier UI hints
  };
  status: 'available' | 'disabled' | 'rate-limited' | 'auth-failed' | 'needs-env';
  fire: ConnectorFn;                   // the function the call dispatcher invokes
};

export type ConnectorFn = (
  intent: Capability,
  query: string,
  opts: ConnectorOpts,
) => Promise<ConnectorResult[]>;
```

The `fire` function takes the **intent** along with the query. Most
connectors care only about the query, but some serve multiple intents
with different sub-strategies (SerpApi changes `engine=` based on
the intent — `'google'` for web, `'google_news'` for news,
`'google_scholar'` for scholar).

### `ConnectorRegistry` — runtime introspection

```ts
export interface ConnectorRegistry {
  register(reg: ConnectorRegistration): void;
  unregister(id: string): void;
  /** Resolve all connectors that serve a given intent, in user-preferred priority. */
  resolve(intent: Capability, prefs: UserPrefs): ConnectorRegistration[];
  /** Lookup by id (for explicit per-fire override). */
  byId(id: string): ConnectorRegistration | undefined;
  /** All registered connectors — for the UI inventory view. */
  all(): ConnectorRegistration[];
  /** Available + serving intent — for the per-record palette menu. */
  availableFor(intent: Capability): ConnectorRegistration[];
}
```

The registry lives in the social-search service (or a future shared
package) and is queried by both backend dispatchers and UI.

### Hot-add / hot-disable

Registration is **runtime**, not compile-time. Three implications:

1. **Adding a connector**: drop a file in `connectors/`, call
   `registry.register(...)` from its module init (or from an
   auto-discovery hook). It's immediately available — no rebuild
   of consumer packs.
2. **Disabling a connector**: `registry.unregister(id)` or set
   `status: 'disabled'`. Per-fire overrides referencing it fail
   gracefully ("connector X is disabled — falling back to the next
   in chain").
3. **Auth / env detection**: at registration, the registry checks
   `requires_env` against `process.env`. Missing → `status:
   'needs-env'` with the UI surfacing "needs SERPAPI_API_KEY to
   activate." Users see in the inventory which connectors are dark
   for env reasons vs disabled by choice.

### Pack declarations grow `intent` + `preferred_connectors`

```ts
export type PackConfig = {
  pack_id: string;
  display_name: string;
  short_label: string;                   // 'f' for Facebook — shows on the per-record palette
  description: string;
  intent: Capability;                    // what the pack does
  preferred_connectors: string[];        // ordered ConnectorRegistration ids
  // ...rest of existing PackConfig
};
```

`preferred_connectors` is the **pack's default chain** for its intent.
The dispatcher walks it on fire: first connector returns results →
done. Empty / error / rate-limited → next. Cost-tier-aware ordering
is a future enhancement (move free-tier ahead of paid by default).

Bundles, in turn, can override the chain per pack at the bundle
level (`BundleMember.connector_chain_override`), and the per-record
palette overrides per-fire.

## UI seam — the per-record palette

### Where it lives

Inside any per-record card that surfaces row-level enrichment —
primarily the **Response Reviewer** triage views (per
[[Response-Reviewer-and-Response-Store]]) and the
[[Pulse-Curation-Layer-and-UI]] per-category cards. Possibly also
Record Collector's row list when a row is selected (as a quick
"augment just this one" affordance, complementing
"Augment This Set →" per spec §4).

### What it looks like

A horizontal row of short-labeled chips, one per *intent* relevant
to the current category or bundle. Each chip is a button:

```
[ f ]  [ in ]  [ x ]  [ wp ]  [ bs ]  [ yt ]  [ gn ]
```

Each chip's visual state per record:

- **idle** (default): outline, muted
- **firing**: spinner replaces label
- **found**: filled (accent), small count badge ("3")
- **not_found**: outline with strikethrough
- **error**: outline in error color; click retries
- **rate-limited**: outline with delay indicator (`f ⏱`)
- **needs-env**: outline disabled; tooltip "needs SERPAPI_API_KEY"

The chip's **default click**:

1. Resolves `pack.intent` against the registry.
2. Walks `pack.preferred_connectors` for that record's existing
   `connector_history` (skip ones that already fired and returned
   results this record).
3. Picks the next-in-chain.
4. Fires.

The chip's **long-press / right-click / hover-then-tap-menu**: opens
the connector menu for that intent. The menu shows every
ConnectorRegistration that serves the intent, with:

- short_label
- cost_tier indicator (🆓 / 💰 / 💰💰)
- last-fired-for-this-record metadata ("fired 2 min ago — found 4")
- "Fire through this connector" action

The user clicks one → fires explicitly through that connector. The
result joins the per-record `connector_history` and the curated
layer (per the integration below).

### Short labels — the namespace

A small, ergonomic alphabet. Two- or three-char-max. Locked at the
pack level, customizable per user.

Starting set:

| Intent | Short label |
|---|---|
| `search.social.linkedin` | `in` |
| `search.social.x` | `x` |
| `search.social.bluesky` | `bs` |
| `search.social.facebook` | `f` |
| `search.social.instagram` | `ig` |
| `search.social.youtube` | `yt` |
| `search.social.tiktok` | `tk` |
| `search.social.threads` | `th` |
| `search.web` | `w` |
| `search.news` | `gn` (Google News) or `n` |
| `search.scholar` | `gs` |
| `fetch.wikipedia` | `wp` |
| `fetch.knowledge_graph` | `kg` |
| `crawl.site` | `c` |

Open: should the label be configurable per user (in case `f` is too
overloaded with Facebook + future-something)? Lean: yes,
shown-and-overridable in user settings.

### Integration with the Pulse Curation Layer

Per [[Pulse-Curation-Layer-and-UI]], the curated layer holds
per-item triage state across runs. The per-record palette adds a
**re-fire action** that's *not* one of the three locked triage
verbs (accept-canonical / accept-context / discard) but a fourth
sibling:

```ts
refire(record, pack, connector?): Promise<void>
```

- Fires `pack` through `connector` (or the pack's preferred chain
  if unset) for THAT ONE record.
- Result lands as **additive items** in `raw_output.items[]` for
  the relevant category, each item carrying:
  - `connector_id` (which connector returned it)
  - `fired_at` (timestamp)
  - `triggered_by: 'human-refire'` (vs `'initial-fanout'`)
- The curated layer carries forward existing triage states for
  items already in the rollup — re-fire is **additive**, never
  overwriting an item the human has already curated. (Mirrors the
  existing memory feedback: *additive enrichment never overrides
  accepted.*)
- The summary / themes do NOT auto-regenerate on a single re-fire
  — that's the "Refresh synthesis" action (a separate triage-time
  affordance per Pulse-Curation open questions).

### `connector_history` per record per intent

Each row maintains, per intent, a small log of fires:

```ts
row.connector_history: Record<Capability, ConnectorFireLogEntry[]>;

type ConnectorFireLogEntry = {
  connector_id: string;
  fired_at: string;                  // ISO-8601
  triggered_by: 'initial-fanout' | 'human-refire' | 'scheduled-refresh';
  outcome: 'found' | 'not_found' | 'error' | 'rate_limited';
  result_count?: number;
  error?: string;
};
```

Used to:

- Drive the chip's visual state (already-fired connectors show
  metadata in the menu).
- Skip already-fired connectors when the default chip click walks
  the preferred chain (don't re-fire the same connector unless the
  user explicitly picks it).
- Audit-trail "we tried X, Y, Z and none worked for this row."

## Starting connector inventory (the EXISTS / NEW / EXTEND table)

Tracks what's needed for the bundles currently spec'd
([[Entity-Pulse-Bundle]] + the existing Profile Builder). Living
table — updated as connectors land. The spec is *not* the source of
truth (the registry is), but the spec records the planned starting
set.

| Connector | Intents served | Status | Notes |
|---|---|---|---|
| `tavily` | `search.web`, `search.news` (limited), `crawl.site`, `crawl.extract` | **EXISTS** | Already wired; existing pattern. May need `crawl` endpoint surfaced. |
| `searxng` | `search.web`, `search.social.*` (via site-restrict), `fetch.wikipedia` | **EXISTS** | Self-hosted; existing pattern. The current Profile Builder default. |
| `serpapi` | `search.web`, `search.news`, `search.scholar`, `search.social.*`, `fetch.knowledge_graph` (via `engine` param) | **NEW** | Paid. Threads `engine` into the connector. Per [[Entity-Pulse-Bundle]] available as override across most intents. |
| `google-news-rss` | `search.news` | **NEW** | Free, no auth. v1 default for `media-news-coverage-pack`. |
| `gdelt` | `search.news` | **NEW** | Free, no auth. Immediate peer to google-news-rss. |
| `firecrawl-server` | `crawl.site`, `crawl.extract` | **NEW** | Server-side; the MCP equivalent is dev-tooling only. Lean for Entity-Pulse extract-posts stage. |
| `wikipedia-api` | `fetch.wikipedia`, `search.scholar` (light) | **NEW** | Free, public API. Cheap fallback for Wikipedia. |
| `linkedin-public` | `search.social.linkedin` (limited) | **FUTURE** | Public profile search via official endpoints where available. Likely paid. |
| `x-search-api` | `search.social.x` | **FUTURE** | Paid; X has moved aggressively on rate-limiting. |

The "EXTEND" status (vs NEW) signals connectors that already exist
but need additional endpoints surfaced — e.g. Tavily's
`/crawl` endpoint may need a connector method beyond the existing
`/search`. Migrations land per-connector as needed.

## Migration / cross-spec implications

This pattern crosses several existing specs and bundles. The
migration sequence:

1. **Land the registry + Capability enum + base shape.** No
   functional change — existing packs continue with their current
   provider seam. The registry is parallel infrastructure for now.
2. **Migrate existing Profile Builder packs** to declare
   `intent` + `short_label` + `preferred_connectors`. The existing
   `connector` field on `PackConfig` becomes a deprecation alias
   for `preferred_connectors[0]`. SearXNG-default-with-Tavily-peer
   is the chain.
3. **Update the in-app palette in Response Reviewer's by-record
   view** to read the registry and render chips. Default-click +
   menu work; cost-tier indicators surface.
4. **Add SerpApi connector.** First real per-record override
   target — the user can now click `f` and pick "fire through
   SerpApi instead of SearXNG" for that one row.
5. **[[Entity-Pulse-Bundle]] pack declarations adopt the pattern.**
   Their `provider_override` shape (`{ find?, extract? }`)
   becomes `preferred_connectors` chains per intent. The existing
   `provider_override.score: 'llm' | 'keywords-only' | 'none'`
   stays separate — that's an LLM-scoring escape hatch, not a
   connector swap.
6. **Hot-add a connector at runtime** is the smoke test for the
   whole pattern: drop a file, call `register`, refresh the
   triage view, see the new chip-menu entry.

## Open questions

- **Capability enum extensibility.** Easy to add via TS unions, but
  the registry needs to know about new capabilities to render them
  in the UI palette. v1: hardcoded enum; capabilities ship in code.
  v2 candidate: dynamic capability registration (a plugin declares
  a new capability + intent). Lean: hardcoded for v1; revisit if a
  user tries to add a capability without a code change.
- **Short-label collisions.** Two packs declaring `short_label: 'f'`
  — what wins? Lean: collision is an error at registration; the
  later-registered pack must pick a different label. The default
  set above is namespaced enough.
- **Cost-tier preference policy.** Default chain orders by user-
  preferred priority. When the user hasn't set a preference, does
  the system order by cost-tier (free first, paid last)? Lean: yes
  by default; the user can override per-pack in settings.
- **Per-record fire budget.** A row could trigger 20 re-fires
  across intents — cost can be material at SerpApi rates. v1: no
  enforcement; surface a per-row LLM-call estimate. v2 candidate:
  per-row daily cost cap with a "spend more?" prompt.
- **`scheduled-refresh` triggered_by.** Reserved in
  `ConnectorFireLogEntry`. v2 feature: schedule a re-fire of an
  intent on a recurring interval (a "show me Reach's latest news
  weekly"). Out of v1 scope.
- **Registry storage / persistence.** v1: registry lives in-memory
  in the service process (re-registered on each connector module's
  init). v2 candidate: persist registration metadata so the UI can
  show "this connector was disabled at 2026-05-14 by user X."
- **Palette responsiveness UX.** When the user clicks `f` and the
  fire takes 8 seconds, what does the chip do? Lean: spinner +
  optimistic-not-found state at 5s; cancel-on-second-click. Reuses
  the Run-as-First-Class-Operation Part 4 mechanic ([[../plans/Run-as-First-Class-Operation]]).
- **Profile Builder retroactive adoption order.** Should Profile
  Builder migrate to this pattern BEFORE Entity Pulse ships, or
  in parallel? Lean: before — Profile Builder is the smaller
  surface; getting the registry + palette working there proves the
  pattern in isolation, then Entity Pulse plugs in.
- **Bundle-level chain override per pack.** Bundles declare an
  ordered roster of packs; should bundles also declare per-pack
  `connector_chain_override` to express *"this bundle prefers
  SerpApi for LinkedIn instead of SearXNG"*? Lean: yes; the field
  exists on BundleMember; default to the pack's own chain.

## Related

- [[Entity-Pulse-Bundle]] — the bundle whose engineering-handoff
  read surfaced this gap. Pack declarations in that spec adopt the
  new pattern at migration step 5 of the §Migration plan above.
- [[Pulse-Curation-Layer-and-UI]] — defines the per-row triage
  surface where the palette lives. Per-record re-fire is the
  fourth triage action sibling (additive, never overwriting prior
  human-curated state).
- [[../issues/Search-Providers-as-First-Class-SearXNG-Default]] —
  the original provider-plurality framing; this spec is the
  natural extension (provider plurality → connector inventory +
  per-record palette).
- [[Response-Reviewer-and-Response-Store]] — the surface where
  per-record cards render; the per-record palette ships into that
  card's UI.
- [[../blueprints/Packs-and-Bundles-Pattern]] — the pack model
  grows `intent` + `short_label` + `preferred_connectors`. Blueprint
  addendum candidate when this spec ships.
- [[../plans/Run-as-First-Class-Operation]] — the run-progress
  mechanic this palette reuses for chip's firing-state UX.
- Existing memory feedback
  *"Additive enrichment never overrides accepted"* — re-fire is
  additive; never destroys human-curated items.

## Remaining work (as of 2026-07-21)

Assessed against a code scan on 2026-07-21 (branch
`rebuild/turbo-rsbuild`) — flag-don't-fix; correct this list if the
scan missed something.

**Shipped** (commit `904704a`, 2026-06-02 "Connector-Inventory step
1"):

- The capability registry —
  `services/social-search/src/registry/{types,capabilities,registry,register-connectors}.ts` —
  resolving connectors by capability, with searxng / tavily /
  serpapi / gdelt / google-news-rss registered
- GDELT connector; SerpApi shape captured; Profile Builder pack
  migrated onto the registry
- Palette UI components exist:
  `apps/pack-runner/src/ConnectorPalette.svelte` +
  `ConnectorChip.svelte` (mirrored in response-reviewer) — pre-fire
  connector selection

**Not confirmed in code:**

- The *per-record, at-triage* palette as specced — short-labeled
  buttons on the triage card, click to re-fire this one record
  through the next connector in priority order, long-press to pick
  (the existing palettes select before firing; the re-fire-from-triage
  loop isn't wired)
- Bundle-level connector-chain config with priority order
- Cost-tier surfacing / pre-fire estimate line
- Pulse Curation Layer integration (that layer itself is unshipped)

The editable-search-term + provider-swap surface in
[[../explorations/Augment-From-DB-Flow-Two-New-Microfrontends]]
(Remote B) is the next natural carrier of this spec's re-fire loop.
