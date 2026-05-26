---
title: "Search Substrate — Tavily Misses Social Profiles; Stand Up SearXNG Without Losing Tavily"
lede: "The common-six (now common-seven) social packs go through Tavily today. Real-world smoke against the foundation dataset shows Tavily missing obvious social profiles that the user finds in seconds by Googling `\"OrgName\" facebook` manually. Tavily is the wrong substrate for social-profile discovery — it's a RAG-optimized content index, and social pages are sparse-text JS-rendered surfaces it under-represents. The fix is to stand up a self-hosted SearXNG container (Google/Bing/DuckDuckGo aggregator) and have the social packs route their queries through it. Tavily stays in the codebase as a first-class connector because a future pack/bundle (deep-research, document extraction) will want exactly what Tavily is good at. The architectural win is treating \"data connector\" as a first-class concern, decoupled from \"pack\" — packs declare which connector they invoke; the social-search service dispatches; Tavily and SearXNG live as peer connector modules."
date_created: 2026-05-26
date_modified: 2026-05-26
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Packs-and-Bundles
  - Search-Substrate
  - SearXNG
  - Tavily
  - Connector-Pattern
  - Social-Search
status: Open
---

# Switch Search Substrate from Tavily to SearXNG

## The symptom

Running pack-runner against the foundation dataset (96 philanthropic
organizations), then triaging in Response Reviewer's by-record view, the
user noticed a pattern: many `not_found` results from Facebook, X, and
similar social packs are organizations whose pages **actually exist** and
are immediately findable by Googling `"OrgName" facebook` manually.

Concrete instance the user named: typing `Bridgespan facebook` into a
browser surfaces the Bridgespan Group's Facebook page as the first result;
our `facebook-pack` returned `not_found` for that same row. Same pattern
across Instagram, X, and to a lesser extent LinkedIn.

## The diagnosis

Three concurrent issues, ordered by likely impact:

### Issue 1 — Tavily's index is thin on social profile pages

Tavily is a **RAG-optimized search**. Its index is curated and weighted
toward content-rich pages — articles, blog posts, documentation, structured
data sources. Social-profile pages (Facebook, Instagram, LinkedIn) are
sparse-text, JS-rendered surfaces whose value is in the URL + headline
metadata, not the body text. Tavily's index under-represents these by design
because they don't fit the "retrieve passages to ground an LLM answer" use
case Tavily was built for.

Google and Bing index social-profile pages comprehensively because they're
the actual reference for "what's on the web." A search-engine aggregator
(SearXNG → Google/Bing/DDG/Brave) would return what the manual searches
find.

### Issue 2 — Over-constrained query construction

Even where Tavily *does* index a relevant page, the queries we build are
narrowed past the threshold:

```ts
// services/social-search/src/packs.ts (current)
'facebook-pack': {
  tavily_query_template: '"{{entity_name}}" site:facebook.com',
  tavily_include_domains: ['facebook.com', 'fb.com'],
},
```

- **Quoted entity name** `"Bridgespan Group"` won't match "The Bridgespan
  Group" or "Bridgespan Group, LLC." A casual researcher types
  `Bridgespan facebook` (no quotes, just the salient tokens).
- **`site:` operator + `include_domains` is belt-and-suspenders.** Tavily
  applies both; the constraint stacks and excludes near-matches.
- **`max_results: 3` + `search_depth: 'basic'`** is conservative — even
  when Tavily has the page, it might not rank in the top 3 of its narrow
  search.

These are tweaks that might improve Tavily-side recall by ~30%, but
they're polish on the wrong substrate. They don't fix Issue 1.

### Issue 3 — Hardcoded coupling to one connector

`services/social-search/src/search.ts` imports `searchTavily` directly
from `./tavily`. Every pack runs through that single function. There's no
seam for "this pack uses a different search engine" or "this pack hits a
specific provider's API instead of search."

That's fine when one substrate fits all packs. It stops being fine the
moment a second substrate is needed — which is right now.

## The decision

**Stand up SearXNG as the primary substrate for the common-seven social
packs. Keep Tavily as a first-class peer connector for future packs that
want it.**

Two reasons we don't tear Tavily out:

1. **Tavily is the right tool for content-RAG retrieval.** A future
   "deep-research" pack/bundle — the kind that pulls a foundation's annual
   report text and feeds it to an LLM for summarization — is exactly
   Tavily's sweet spot. Removing the integration now would mean rebuilding
   it later.
2. **Connector swaps shouldn't be irreversible.** Today SearXNG is the
   answer for social. If SearXNG turns out to have a blind spot for some
   future pack, we route that pack through whatever fits. The architecture
   should treat connectors as plug-in.

## The architectural goal — separate Pack concerns from Connector concerns

Today's shape:

```
search.ts → searchTavily (hardcoded)
packs.ts has tavily_query_template + tavily_include_domains (Tavily-shaped)
```

Target shape:

```
connectors/
  tavily.ts        — Tavily REST client
  searxng.ts       — SearXNG REST client (local docker, no API key)
  (future: brave.ts, propublica-npo.ts, candid.ts, ...)

packs.ts — each PackConfig declares:
  connector: 'tavily' | 'searxng' | 'brave' | ...
  query: connector-specific query config (typed via discriminated union)

search.ts — single runOnePackSearch dispatches:
  switch (pack.connector) {
    case 'tavily':  return runTavilySearch(pack, entityName, nc);
    case 'searxng': return runSearxngSearch(pack, entityName, nc);
    ...
  }
```

This is a real architectural concern, not just a refactor:
- **Pack identity stays stable** across connector swaps. A `linkedin-pack`
  is still a `linkedin-pack` whether it runs through SearXNG, Brave Search,
  or a direct LinkedIn-scraping client. The pack_id on response records is
  the same; the row.socials write-back is the same; the triage UI is the
  same.
- **New packs only need a connector reference + connector-specific config.**
  They don't reimplement search plumbing.
- **A/B testing connectors per pack becomes trivial.** Want to compare
  Tavily vs SearXNG for `wikipedia-pack`? Run both, compare confidence
  distributions and not_found counts.

## Proposed work

In rough sequence:

1. **`services/social-search/src/connectors/` directory** — pull `tavily.ts`
   in (rename minimally), add `searxng.ts` peer. Both export a common
   interface that's a thin wrapper over a real search engine call.
2. **Connector interface contract**:
   ```ts
   type ConnectorResult = {
     url: string;
     title: string;
     content: string;
     score?: number;
     published_date?: string;
   };
   type Connector = (query: string, opts: {
     include_domains?: string[];
     max_results: number;
     signal?: AbortSignal;
   }) => Promise<ConnectorResult[]>;
   ```
3. **`PackConfig` type extension** — discriminated union:
   ```ts
   type PackConfig =
     | { connector: 'tavily';  pack_id; display_name; domain_whitelist;
         query: { template: string; include_domains?: string[]; ... } }
     | { connector: 'searxng'; pack_id; display_name; domain_whitelist;
         query: { template: string; engines?: string[]; categories?: string[] } };
   ```
4. **`search.ts` dispatcher** — picks connector based on `pack.connector`.
5. **SearXNG Docker container** in `docker-compose.yml`. Self-hosted, no
   API key, free. Configure default engines (Google, Bing, DDG, Brave).
   Expose on internal Docker network as `searxng:8080`.
6. **Pack reconfiguration** — flip the common-seven social packs to
   `connector: 'searxng'`. Query templates drop the `site:` operator
   (SearXNG handles domain restriction differently) and drop the quotes
   around entity_name (broader match).
7. **Smoke** against the foundation dataset — re-fire all seven packs
   against the rows we previously got `not_found` on, count how many now
   resolve.
8. **Document the connector pattern** in
   [[Packs-and-Bundles-Pattern]] as a new sub-section under §Pack
   anatomy: "Connector reference" replacing the implicit "MCP server" wording.

## Not in scope for this issue

- **Tearing out Tavily.** Stays as a peer connector for future use.
- **Brave Search / Google CSE / other commercial APIs.** Worth their own
  evaluation later; SearXNG fills the need now without API keys or cost.
- **Per-pack quality scorecards.** Right idea, but premature until SearXNG
  is in and we have new baseline numbers.

## Acceptance — done when

- SearXNG container runs alongside the other services in `docker-compose up`
- The common-seven social packs route through SearXNG and resolve
  significantly more `found` outcomes against the foundation dataset
  (target: at least 60% of the previously-not_found social rows resolve to
  a real URL on re-fire)
- Tavily client still works — re-running an old fixture or wiring a
  test-only pack against `connector: 'tavily'` succeeds
- The new connector pattern is documented in
  [[Packs-and-Bundles-Pattern]]

## Related

- [[Packs-and-Bundles-Pattern]] — the blueprint; gets the connector
  pattern codified after this lands
- [[Entity-Profile-Augmentation-Workflow]] — the exploration; mentions
  Tavily as the v1 substrate (noted there as a choice we'd revisit)
- [[Run-as-First-Class-Operation]] — the active plan; this issue is an
  orthogonal substrate concern, not blocked on Run-entity work
- [[Common-Six-Social-Packs]] (now common-seven with Instagram) — the
  original implementation prompt; will reference this issue once SearXNG
  lands
