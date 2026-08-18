---
title: "Workbench usability sweep — corpus visibility, stream editing, and promote-to-affiliation (issues #20 · #26 · #25)"
lede: "Today's scope from the first real workbench session: make the person card's three invisible corpus items visible, let the operator fix a stream's kind and give it its real name, and turn a bio-page link row into a three-click affiliation."
date_created: 2026-07-24
date_modified: 2026-07-24
date_first_published: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Plan
  - Augment-It
  - Org-Workbench
  - Corpus
  - Pulse-Streams
  - Affiliations
  - Usability
status: Shipped
post_ship_note: "All three slices landed 2026-07-24 as commits 90dd83b (#20), 895a6a6 (#26), b86f079 (#25). The operator walk-through (steps 4/9/14's live halves) remains the human rung; browser-drive rung deferred — Playwright MCP loads next session."
site_uuid: 57284422-9b02-409e-b98c-a83be6ef3bb2
hex_code: wtp084
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
---

# Workbench usability sweep — #20 · #26 · #25

## Issue references

Executes three of the 2026-07-24 workbench-session issues, in ascending complexity:

- **A.** [[../issues/Corpus-Items-Not-Visible-On-Person-Cards-Coverage-Hard-To-Assess]] — [gh #20](https://github.com/lossless-group/augment-it/issues/20)
- **B.** [[../issues/Pulse-Streams-Need-Editable-Kind-And-User-Facing-Names]] — [gh #26](https://github.com/lossless-group/augment-it/issues/26)
- **C.** [[../issues/Person-Bio-Pages-Are-Affiliation-Signals-Not-Just-Identity-Links]] — [gh #25](https://github.com/lossless-group/augment-it/issues/25)

Branch: `rebuild/turbo-rsbuild`. All UI lands in `apps/org-workbench`; service changes are confined to `services/record-surrealdb-resolver` + the capability map in `services/workspace`. Close each gh issue as its slice ships (the new create-task/close-task habit), and move each issue doc's `status` on the same commit.

## Decisions taken in this plan (resolving the issues' open questions)

1. **#20 goes eager, not lazy.** Extend `listOrgAffiliations` to carry `personal_corpus[]` alongside the existing count. Rejected lazy (`affiliation.detail` on expand): `PersonCard` mounts with the already-loaded affiliation row and no detail wrapper exists in `org-client.ts` — lazy is *not* zero-work on this frontend, and eager makes corpus symmetric with `personal_links`, which are already eager. Payload is single-digit entries per person; the 8MB NATS ceiling is nowhere near.
2. **#20 v1 renders URL+kind, no titles.** `content_items` has **no title field at all today** (`findOrCreateContent` writes only url/domain/kind/counters — `resolver.ts:364-369`); "titles live in the ledger" was optimistic. Title hydration = a rider for the content-ingest path, not this sweep.
3. **#20's coverage roster (layer 2) is out of scope today.** The per-card fix ships now; the "which entities have NO corpus?" roster folds into the component-library sweep ([[../issues/No-Component-Library-UI-Improvised-Not-Component-Based]] / gh #22) where thin-row rosters get built once, properly.
4. **#26's update verb is a match-by-URL patch, not remove+re-add.** Precedent: `resolver.update_org` (`resolver.ts:709-767`) already does sparse `SET` patches with `last_touched_*` stamping. URL is the de-facto stream key everywhere (dedupe, scan). Safe because stream `kind` has **zero routing effect today** — `stream-scan.ts` declares `stream_kind` and ignores it; every scan routes to `runOfficialBlogPack`.
5. **#26 also adds `topic_hub` to `inferStreamKind`** — one regex line fixes the `/topics/…` misclassification at the source; the editable kind remains the correction path for everything else.
6. **#25 v1 lives on the link row, not in didi-chat.** The `AdditiveList` `entryaction` slot exists and is unused on person links — that's the mounting point. A chat verb (`CURATOR_CHAT_VERBS` block + `CHAT_CAPABILITY_NAMES` allow-list, `chat.ts:87-129`) is a named follow-up, not this sweep.
7. **#25 creates orgs thin — but with a domain.** `resolveOrgRow`'s create branch seeds no `domains[]` (`resolver.ts:606-614`), so an org created from a bio link would be invisible to future D4 domain matching. Extend `PersonAffiliateInput` with optional `org_domain`, seeded into `domains[]` on the create branch only. No full org-resolution gate for v1.
8. **#25's observation is `affiliated_with` with the bio URL as `source`.** `PersonAffiliateInput.source` already exists and flows into the auto-observation (`person-resolver.ts:562-568`) — pass the link URL; no separate `has_bio_at` predicate for v1 (free-text predicates via `person.add_observation` remain available if the distinction earns its keep later).

## Steps

### A — Corpus items visible on person cards (gh #20)

1. **Query** — `listOrgAffiliations` (`services/record-surrealdb-resolver/src/person-resolver.ts:857-864`): add `in.personal_corpus ?? [] AS personal_corpus` beside the existing `array::len(...) AS personal_corpus_count` (count stays — `PeopleReveal`'s collapsed rows use it).
2. **Types** — `AffiliatedPerson` gains `personal_corpus: ShapedLink[]` in both mirrors: `person-resolver.ts:835-843` and `apps/org-workbench/src/lib/types.ts:61`.
3. **Render** — `PersonCard.svelte:82-108`: replace the count-only corpus block with an `AdditiveList` (same reuse as links at `:74-80`): title "Corpus items", entries `person.personal_corpus`, `onadd` → existing `person.corpus.add`, `onsearch` → existing corpus-target envelope. Row shape comes free: kind badge · host · date (`AdditiveList.svelte:106-118`). Delete the bespoke count/➕/🔍 markup; also remove the now-false scope comment at `PersonCard.svelte:2-6`.
4. **Verify** — svelte-check + build org-workbench + shell build regression; then live: Lumina → People → Jamie Merisotis shows the three entries that today render as "Corpus items 3" and nothing.

### B — Stream name + editable kind (gh #26)

5. **Shape** — `ShapedStream` (`resolver.ts:32-38`) and `shapeStream` (`:146-157`) gain optional `name`; `OrgStreamAddInput` (`:838`) gains `name?`, passed through `addOrgStream` (`:841-854`). SurrealDB is schemaless — no migration.
6. **Classifier** — `inferStreamKind` (`resolver.ts:117-133`): add `topic_hub` for paths matching `topics|/tag/|/category/`, ahead of the `updates_index` fallback.
7. **Update verb** — new `updateOrgStream(db, {org_slug, url, kind?, name?, client})` beside `addOrgStream`: load `media_streams`, patch the entry whose trimmed `url` matches, `UPDATE ... SET media_streams = $patched` + the `client_access` union / `last_touched_*` stamps `updateOrg` already models (`resolver.ts:739-741`). Throw if no entry matches. New subscription `organization.streams.update.requested` in `handlers.ts` (beside `:182-198`); capability + 30s timeout in `services/workspace/src/capabilities.ts` (beside `:184`/`:291`); wrapper in `apps/org-workbench/src/lib/org-client.ts` (beside `addOrgStream`, `:61-69`).
8. **UI** — `AdditiveList.svelte`: add form (`:81-101`) gains a name input, threaded through `onadd`; entry rows render `name` (falling back to `host(url)`) at `:110`; kind badge (`:109`) and name become click-to-edit by adapting `apps/records-surface/src/components/EditableField.svelte`, committing via a new optional `onedit(url, patch)` prop so the component stays generic — `OrgCard.svelte` passes it only for the streams list (→ `updateOrgStream` → existing `makeAdd`-style refetch + `augment-it:entity-updated`). The "Additive only" header comment (`AdditiveList.svelte:1-7`) gets amended: additive entries, patchable fields.
9. **Verify** — builds as in step 4; live: rename Lumina's `todays-credentials` stream to "Today's Credentials", correct its kind, confirm the row survives a refetch and a scan still routes (kind is not consumed by `stream-scan.ts` — confirm no regression, not new behavior).

### C — Promote a bio link to an affiliation (gh #25)

10. **Verb extension** — `PersonAffiliateInput` (`person-resolver.ts:507-519`) gains `org_domain?`; `resolveOrgRow`'s create branch (`resolver.ts:606-614`) seeds `domains: [{domain: $org_domain}]` when provided. The `affiliatePerson` wrapper (`org-client.ts:118-134`) un-hardwires `org_action: 'match'` and exposes the full input.
11. **`AddAffiliationInline.svelte`** — new org-workbench component: `AddPersonInline`'s form → gate → writing state machine (`AddPersonInline.svelte:28-83`) inverted — person fixed (from the card), org being resolved. Seeded from the link row: org-name field pre-filled empty, domain pre-filled from the link's hostname; candidates via `resolver.search` (D4 domain clause already matches `domains[*].domain` — `resolver.ts:327`), queried with the domain. Gate ALWAYS: pick a candidate (`org_action:'match'`, its slug) or "Create new org + affiliate" (`org_action:'create'`, typed name + seeded `org_domain`). Optional role input → `role`. `source` = the bio URL. On success: dispatch `augment-it:entity-updated {person_uuid}` (the existing refetch path, `PeopleReveal.svelte:50-55`).
12. **Mounting** — `PersonCard.svelte:74-80`: pass `entryaction: {label: '→ affiliation', fn: openPromote(entry)}` on the personal-links `AdditiveList` (slot exists unused — `AdditiveList.svelte:25-27, 111-115`); the action opens `AddAffiliationInline` under the list, bound to that entry.
13. **Riders, named not built** — (a) port the bio-relevant kinds (`author_bio`, `team_page`, `publication`) from `apps/person-enrichment/src/pulse-dimensions/LinkList.svelte:41-51` into the server `inferLinkKind` (`resolver.ts:91-114`) so future bio links stop badging `other`; (b) same promote affordance on search-and-add result rows (`ResultRow.svelte` + `verbFor`, `search-client.ts:65-82`); (c) didi-chat promotion verb per Decision 6. Each is a small follow-up once v1 proves the flow.
14. **Verify** — builds as in step 4. The write path is NOT exercised headlessly — `person.affiliate` creates real canonical orgs/edges/observations, and the additive-writes discipline reserves browser-driven writes for the designated safe target (Aspen Institute card). Mechanical drive: browser-drive the gate open/candidates/cancel path read-only (Playwright MCP is wired in `.mcp.json` but loads next session — if unavailable, this rung falls to the walk-through). Operator walk-through: Jamie Merisotis → bipartisanpolicy.org row → "→ affiliation" → gate shows candidates (or none) → create "Bipartisan Policy Center" with domain → affiliation + observation appear; re-open the gate on the same row → the new org now domain-matches.

### Tail

15. **Changelog** entry per [[changelog-conventions]]; commit per [[git-conventions]] (one commit per slice: `fix(org-workbench, corpus): …`, `new(streams, resolver): …`, `new(org-workbench, affiliations): …`); push; `gh issue close 20/26/25 --reason completed` as each slice lands; flip the three issue docs to `Shipped` with `date_first_published` on the same commits.
