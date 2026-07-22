---
date_created: 2026-07-22
date_modified: 2026-07-22
title: "Augment-from-DB Phase 1 lands — organization.detail, organization.affiliations, search.fire, and Exa as a peer connector"
lede: "The service floor under the new Augment-from-DB flow is in and proven over raw NATS: the org card and people-reveal reads, a registry-resolved generic search fire (SearXNG free default, Exa as the newest paid peer), and alias/domain matching in org autocomplete — all before a single pixel of the two new microfrontends exists."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - docker-compose.yml
  - services/social-search/src/connectors/types.ts
  - services/social-search/src/connectors/exa.ts
  - services/social-search/src/connectors/index.ts
  - services/social-search/src/registry/register-connectors.ts
  - services/social-search/src/search-fire.ts
  - services/social-search/src/server.ts
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/person-resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/record-surrealdb-resolver/src/person-handlers.ts
  - services/workspace/src/capabilities.ts
  - scripts/prove-augment-from-db-capabilities.mjs
  - context-v/specs/Augment-From-DB-Flow.md
  - context-v/plans/Augment-From-DB-Phase-1-Service-Capabilities.md
tags:
  - Progress-Update
  - Augment-From-DB
  - Capabilities
  - Search-Providers
  - Exa
  - SurrealDB
---

# Augment-from-DB Phase 1 lands — the capabilities exist before the surfaces do

Phase 1 of [[../context-v/specs/Augment-From-DB-Flow.md]] (Signed-Off 2026-07-22) is implemented and proven. The whole point of sequencing the flow this way: every read and fire the two upcoming remotes (org-workbench :3014, search-and-add :3016) will make is now a NATS subject a script can hit — so Phase 2/3 UI work starts against a floor that's already green.

## What shipped

**Two new reads in `record-surrealdb-resolver`.** `organization.detail` returns the full org card — identity, `aliases`, `domains`, and all three additive lists (`org_links`, `media_streams`, `org_corpus`) — client-filtered like every read path. `organization.affiliations` is the people reveal: every person RELATEd to one org with role + relevance off the edge and links + corpus-count off the person, using the same two-query discipline as `getAffiliationDetail` (resolve the org's live RecordId by slug, then filter edges — RecordIds never cross the wire).

**`search.fire` in `social-search`.** The generic query-shaped fire the search-and-add surface needs: explicit provider wins, else the registry resolves the intent free-tier-first (SearXNG). Unlike `connector.fire` (errors localized inside `ok:true` for the triage loop), this replies `ok:false` on failure so the UI can tell "provider failed" from "zero results."

**Exa joins the registry.** `connectors/exa.ts` (POST api.exa.ai/search, `x-api-key`, snippet-sized contents) + `EXA_REG` (paid tier, `search.web` + the six social intents) + the legacy `CONNECTORS` map entry — which gives `provider_override: 'exa'` on the existing pack path for free. Env name is the repo's historical `EXA_AI_API_KEY`, now passed through compose; when it's absent the registry flips Exa to `needs-env` and everything else keeps running.

**D4 — smarter org autocomplete.** `resolver.search` now also matches `aliases[]` and `domains[*].domain`, so "gary-lauder" finds `lauder-family-fund` whose alias is the only place that string lives.

## Proof

`scripts/prove-augment-from-db-capabilities.mjs the-aspen-institute reach-edu gary-lauder` — seven checks, all green on first run: org detail (1 link), 10 affiliated people (led by the CRG associates), SearXNG default fire, Exa fire, unknown-provider localized `ok:false`, the alias match, and `exa` visible in `connectors.inventory` as paid/available. The needs-env negative was toggled live: with the key unset, `provider:'exa'` fails localized (`connector exa is needs-env`) while the SearXNG default stays green; restored, Exa returns 10 results again. All three touched services typecheck clean.

Both SurrealQL constructs the plan flagged as version-sensitive (`array::join(domains[*].domain ?? [], ' ')` and the nested `in.person_uuid` edge projection) worked as written against the live SurrealDB Cloud instance — no fallbacks needed.

## What's next

Phase 2: the `org-workbench` remote (:3014) — flow registration, org search over the now-alias-aware `resolver.search`, and the org card with working ➕ on all three lists. The proof script stays in the loop as the service-floor regression check.
