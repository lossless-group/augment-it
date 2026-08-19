---
title: "Org Relations (parent/child/peer) + Org Tags — model, capabilities, and the Org Workbench surface"
lede: "Organizations finally get edges to each other — parent, child, or peer, with a typed flavor and free-text human context — plus their first tag mechanism (Initiative, Program, Funder), all workable from the Org Workbench card."
date_created: 2026-07-27
date_modified: 2026-07-27
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
date_first_published: 2026-07-27
issue_reference: "[[../issues/Parent-Child-Nested-Organizations-Not-Modeled]]"
post_ship_note: "Executed same day as authored, first run of [[../loops/Implement-Feature-Loop]] (tickets #49–#57, init 570d0b6 → ship). Proof script caught two real relation.update bugs; the browser drive caught a keyboard-unreachable affordance; the human gate added #57 (corpus-kind datalist) and a superseding pilot ruling — UpMobility Foundation and Urban Institute are DISTINCT entities, peer/partners_with, so the pilot needed no reference_of pointers at all."
revisions:
  - "2026-07-27 — v0.0.1.0 — Shipped. All four phases landed; pilot untangled with the peer ruling; #56 worklist tracked in the issue file."
  - "2026-07-27 — v0.0.0.2 — status → Implementing at loop start ([[../loops/Implement-Feature-Loop]] first run). Superseded by reality: `tag.suggest` / `tag.apply` verbs already exist (capabilities.ts:240-241, domains.ts) — §1.4's 'add a thin tags.vocab' is unnecessary; the UI datalist rides `tag.suggest`, and the org tag handlers reuse `ensureTagInVocab` + `toDashed` from domains.ts. (`tag.apply` itself is source_usages-scoped, not reusable for orgs.)"
tags:
  - Plan
  - Augment-It
  - Organizations
  - Canonical-Layer
  - Org-Workbench
  - Data-Modeling
status: Shipped
site_uuid: 22f7ff73-9f0b-4b1c-894e-34e09a962472
hex_code: rc6mbj
date_authored_initial_draft: 2026-07-27
date_authored_current_draft: 2026-07-27
publish: true
---

# Org Relations (parent/child/peer) + Org Tags

## Why care?

The canonical layer knows thousands of facts about individual organizations
and exactly zero facts about how organizations contain, fund, or shadow each
other. The Upward Mobility Foundation is an initiative of the Urban Institute;
Stand Together Trust is a Koch-network arm; the Beacon fund lives inside the
Denver Foundation — and today every one of those truths is either welded into
a folder slug or simply absent. [[../issues/Parent-Child-Nested-Organizations-Not-Modeled]]
holds the full trigger story and the reconciliation worklist; this plan is the
build that closes its section C.

Two operator rulings shape the design (2026-07-27):

1. **The relationship is an affiliation.** Rather than minting a new
   `org_relations` edge table (the issue's original candidate shape), reuse
   the existing `affiliations` RELATE table — org→org edges alongside the
   person→org edges it already holds. Relations are tagged
   **parent / child / peer** (peer is required — Truist↔LiftFund is a
   funding partnership, not a hierarchy) and carry a **free-text
   description** for the context only humans hold (the
   upmobility ↔ urban-institute nuance).
2. **Organizations get tags** — `Initiative`, `Program`, `Fund`, `Funder`, … —
   because a child org's *nature* is a fact about the org itself, not about
   any one edge. There is no org tag mechanism today; the persons
   `has_tag`-observation + `tag_vocab` pattern extends directly.

## Decision record — why edges, why not attributes-on-the-row

The alternative considered (and declined as the source of truth): written
document-style attributes on each organization row (e.g.
`parent_orgs: [...]`, `related_orgs: [...]`).

- **Multi-tenant leak.** Org rows are shared across clients; a relation one
  client asserts would surface to every client with row access. This is the
  exact rationale that put `relevance` on the affiliation edge instead of the
  person/org rows (`person-resolver.ts:586-598`) — edges and observations
  carry `client_access`/`client`; shared rows must not carry per-client
  judgment.
- **One-directional.** Attributes on the child don't answer "list this
  parent's children" without a table scan; a RELATE edge queries both ways.
- **The human context survives anyway.** The free-text `description` on the
  edge *is* the written-document register the operator wanted — it just lives
  on the relationship, where it belongs.

Redundancy stays welcome downstream ([[Redundancy beats normalization]] house
ethos): `organization.detail` and the entity card can materialize relation
summaries at read time freely. What's declined is attributes-on-the-shared-row
as the *system of record*.

### Why reusing `affiliations` is safe (verified against live code)

- The table is **schemaless** — shape is set entirely by `RELATE … SET` at
  write time (`person-resolver.ts:567-571`). Org→org edges need no migration.
- `listOrgAffiliations` (`organization.affiliations`) already filters rows
  without a `person_uuid` (`person-resolver.ts` — `.filter((r) => r.person_uuid)`),
  so org→org edges are invisible to the People Reveal by construction.
- `getAffiliationDetail` and `affiliation.rate` look edges up by
  `(person_uuid, org_slug)` — org→org edges can never match.
- Every org→org edge additionally carries `edge_type: 'org_org'` (explicit,
  redundant, greppable) so relation reads filter on it and never depend on
  "no person_uuid" as a negative signal.

## The model

### Edge shape (org→org rows in `affiliations`)

Canonical direction: **`in` = child, `out` = parent** — same "smaller party
points at larger" grain as person→org.

| Field | Value |
|---|---|
| `in` | RecordId of the child (or one peer) `organizations` row |
| `out` | RecordId of the parent (or other peer) `organizations` row |
| `edge_type` | `'org_org'` — the explicit discriminator |
| `rel` | `'child_of'` (hierarchical) or `'peer'` (direction meaningless; reads scan both ways) |
| `kind` | optional short typed flavor: `initiative_of`, `fund_of`, `program_of`, `agency_of`, `chapter_of`, `funds`, `partners_with`, … (open vocabulary, datalist-suggested, never enum-enforced) |
| `description` | optional free text — the human context ("initiative of Urban Institute, probably in cooperation with others") |
| `client_access` | `string[]` — every canonical write carries the client slug (house rule) |
| `added_at` | `time::now()` |

The **parent/child/peer trichotomy the operator sees** is a read-time
projection: from the focused org's perspective, an inbound `child_of` edge is
a **child**, an outbound `child_of` edge is a **parent**, and a `peer` edge in
either direction is a **peer**. The wire verb takes
`rel: 'parent' | 'child' | 'peer'` relative to the focused org and the
handler normalizes to the canonical direction — operators never think about
edge direction.

On create, also append an observation (audit-trail parity with
`person.affiliate`'s `affiliated_with`): subject = child org id, predicate =
`related_to`, object = parent/peer org id, with `rel`, `kind`, `description`,
`client` (singular, per observations convention) riding along schemaless.

### Org tags (observations, not row fields)

- One `has_tag` observation per tag: `subject` = org RecordId, `predicate` =
  `'has_tag'`, `object` = the tag, `client` (singular), `observed_at`. Exactly
  the persons pattern (`scripts/surreal-backfill-tags-relevance.mjs`).
- Tags are **Train-Case** (house convention, enforced in the handler with the
  same normalizer the persons path uses): `Initiative`, `Program`, `Fund`,
  `Funder`, `Think-Tank`, `Government-Agency`, `Academic-Institution`,
  `Community-Foundation`, `CDFI`, `Intermediary`.
- Vocabulary rides the existing **`tag_vocab`** table (`domains.ts:82-83` —
  `client_slug + tag` unique) — org tags and source tags share one per-client
  vocabulary on purpose; no second table.
- **Not materialized onto the org row** — same multi-tenant rationale as the
  decision record above. Reads are one indexed observations query.

"Funder" remains *also* a filesystem-corpus concept (`corpus/funders/<slug>/`
buckets) — the tag doesn't replace the bucket, it makes the org's nature
queryable in the DB where today it is only implied by disk location.

## Phase 1 — capabilities (no UI)

All handlers land in a **new module**
`services/record-surrealdb-resolver/src/org-relations.ts` (resolver.ts is
already large and carries a stray non-text byte that breaks plain grep;
person-resolver.ts is person-scoped). Subscriptions in a matching block in
`handlers.ts`. Follow the two-query discipline (resolve slugs → RecordIds
first, then operate; never trust RecordIds across the wire).

### 1.1 `organization.relate`

Args: `{ org_slug, other_slug, rel: 'parent'|'child'|'peer', kind?, description?, client }`

- Resolve both slugs (`WHERE slug = $slug AND client_access CONTAINS $client`);
  error clearly on either miss (`organization not found: <slug>` — the UI's
  cue to route through org creation first).
- Normalize direction: `rel:'parent'` → RELATE focused→other; `rel:'child'` →
  RELATE other→focused; `rel:'peer'` → RELATE focused→other. Hierarchical
  edges store `rel:'child_of'`.
- Dedup **both directions**: one relation per org pair. If an edge exists
  between the pair, return `ok:false` with `relation exists (<rel>)` — the
  operator edits or removes it instead of stacking a second.
- `SET edge_type='org_org', rel=$rel, kind=$kind, description=$description,
  client_access=[$client], added_at=time::now()`, union `client_access` if the
  dedup finds an existing edge for another client.
- Append the `related_to` observation.

### 1.2 `organization.relations`

Args: `{ org_slug, client }` → three arrays, each entry
`{ slug, display_name, rel: 'parent'|'child'|'peer', kind, description, added_at }`:

```sql
-- parents:  focused is the child
SELECT out.slug AS slug, out.complete_name AS complete_name,
       out.conventional_name AS conventional_name, kind, description, added_at
  FROM affiliations
  WHERE in = $org AND edge_type = 'org_org' AND rel = 'child_of';
-- children: focused is the parent (project in.*)
-- peers:    (in = $org OR out = $org) AND rel = 'peer' (project the other side)
```

`display_name` coalesces `complete_name ?? conventional_name ?? slug` in JS,
matching the workbench's `displayName` derivation.

### 1.3 `organization.unrelate` + `organization.relation.update`

- `unrelate` — `{ org_slug, other_slug, client }`: delete the pair's edge
  (either direction, `edge_type='org_org'`), append a `relation_removed`
  observation (parity with `person.unaffiliate`'s `affiliation_removed`).
- `relation.update` — `{ org_slug, other_slug, kind?, description?, rel?, client }`:
  patch in place; a `rel` change that flips parent↔child re-normalizes
  direction (delete + re-relate inside the handler). This is the ✎ affordance
  backing (Entity-Card-Edit-And-Remove-Affordances precedent).

### 1.4 `organization.tag.add` / `organization.tag.remove` + tags in detail

- `tag.add` — `{ org_slug, tag, client }`: Train-Case-normalize, upsert into
  `tag_vocab` (existing helper in `domains.ts`), dedup (`has_tag` observation
  for this subject+object+client already present → no-op ok), append the
  observation.
- `tag.remove` — delete the matching `has_tag` observation(s) for this
  subject+tag+client.
- Extend `getOrgDetail` (`resolver.ts:1182`) with a second query returning
  `tags: string[]` (observations `WHERE subject=$org AND predicate='has_tag'
  AND client=$client`). Additive to the response shape — no caller breaks.
- Vocabulary read for the UI datalist: reuse the existing tag_vocab read path
  in `domains.ts` if a verb already fronts it; otherwise add a thin
  `tags.vocab` → `{ client }` → `string[]`.

### 1.5 Workspace verb map

`services/workspace/src/capabilities.ts` — six entries in
`CAPABILITY_TO_SUBJECT` (`'<verb>': '<verb>.requested'`) + `TIMEOUTS` at
30_000, alongside the existing `organization.*` block.

### 1.6 Proof script

`scripts/prove-org-relations.mjs`, same conventions as
`prove-augment-from-db-capabilities.mjs` (createRequire, fail-fast checks,
direct NATS). Checks, run against throwaway orgs it mints and cleans up —
never canonical data:

1. relate parent (child_of lands, direction correct both read-sides)
2. relate peer + duplicate-pair rejection
3. `organization.relations` returns the trichotomy correctly from *both*
   orgs' perspectives
4. `relation.update` flips parent→child and patches description
5. `unrelate` deletes; `organization.affiliations` (People Reveal read) shows
   **zero contamination** from org→org edges throughout
6. tag add (Train-Case normalization: `initiative` in → `Initiative` stored) /
   detail shows `tags` / tag remove
7. client-tagging audit per the surrealdb-canonical-layer discipline: re-query
   the minted edges **without** the client filter and inspect
   `client_access` / `client` on every row

## Phase 2 — Org Workbench surface

### 2.1 `RelatedOrgs.svelte` (new section on the card)

Sits in `OrgCard.svelte`'s `ow-lists` column above `<PeopleReveal>`; fetched
via `organization.relations` on card load (own fetch, own loading state —
`organization.detail` stays untouched for relations).

- Three labeled groups: **Part of** (parents), **Contains** (children),
  **Peers**. Each row: related-org display name, `kind` badge when present,
  `description` in muted text, and the standard ✎ / × affordances (edit patches
  kind/description/rel via `relation.update`; remove uses the inline-confirm
  pattern from the alias chips).
- Row click **navigates the workbench to that org** — `RelatedOrgs` emits
  `onopen(slug)`, `OrgCard` forwards it, `App.svelte` wires it to the existing
  `loadOrg` (which already handles active-entity broadcast + localStorage).
  This is the payoff interaction: walk the Koch constellation edge by edge.
- Add-relation inline (the list's ➕): org picker reusing the `OrgSearch`
  resolver.search pattern, a parent/child/peer segmented select, `kind` input
  with a datalist of the seed vocabulary, `description` free-text input.
  **No-match does not create** — relating is to existing orgs only; the
  operator routes through the existing gated `+ New organization` first, then
  relates (keeps org creation single-doored through `OrgCreateInline`).

### 2.2 Tags row on the identity block

In `OrgCard.svelte`'s `ow-identity` `<dl>`, after Domains: a **Tags** row of
chips (Train-Case values), ✕-with-inline-confirm exactly like the alias
chips, and a ➕ input with a datalist from the tag vocab. Writes ride
`organization.tag.add` / `organization.tag.remove`; every success calls
`bump()` so the card refetches DB truth (`org.tags` arrives via the extended
detail).

### 2.3 Verification drive (named now, per house rule)

Playwright MCP drive against the local shell: search `stand-together-trust` →
add relation (child of `charles-koch-foundation`… operator will correct the
real topology; the drive uses throwaway orgs) → assert the row renders in
**Part of** → click it → assert the workbench navigated → add tag
`Initiative` → assert chip → remove both → assert gone. Reads unrestricted;
writes only against drive-minted throwaway orgs.

## Phase 3 — didi + triage integration

- **Chat slab**: extend `WORKBENCH_CHAT_VERBS` (`services/workspace/src/chat.ts:114`)
  with `organization.relate` / `organization.relations` / `organization.tag.add`
  — args, the parent/child/peer semantics, and recognition shortcuts
  ("X is an initiative of Y" → chat_propose `organization.relate` with
  rel:'parent', kind:'initiative_of'). Propose-first: relations are judgment
  calls; didi proposes, the operator invokes (human-in-drivers-seat).
- **Triage skill**: `context-v/agent-skills/triage-inbox-w-suggestions` gains
  the "parent or child?" aboutness step the issue's section C names — when a
  suggestion's org has relations, ask which entity the content is *about*
  before filing; `reference_of:` pointer across the seam when both want it.
  Update SKILL.md + its condensed `ACTIVE_SKILLS` slab together (they're a
  pair by convention).

## Phase 4 — reconciliation pilot (the acceptance test)

Work the issue's worklist through the new surface — the issue file is the
tracker; check items off there as they land.

1. **Pilot: upmobility ↔ urban-institute.** Create `urban-institute` via the
   workbench (+ tag `Think-Tank`); relate `upmobility-foundation` → child of
   `urban-institute`, kind `initiative_of`, description carrying the operator's
   nuance; tag `upmobility-foundation` as `Initiative`. Split
   `funders/upmobility-foundation-urban-institute/` by aboutness with
   `reference_of:` pointers (BlackRock↔jff precedent); file the three parked
   inbox captures.
2. Then, at filing pressure (lazily, per the issue's ruling): Truist↔LiftFund
   (peer, kind `funds`), Beacon fund_of Denver Foundation, the Koch / Stand
   Together constellation edges, USDA↔Rural Development (`agency_of`), the
   Harvard academic chain.
3. Update the issue's section C checkboxes + `revisions`; changelog entry per
   [[changelog-conventions]]; flip this plan's status.

## Out of scope (named so they're not forgotten)

- **Corpus roll-up lenses** (child content surfacing on the parent's corpus
  view) — wants the edges to exist first; own plan when filing pressure
  demands it.
- **Multi-hop chain rendering** (Harvard ⊂ HKS ⊂ Project on Workforce as one
  breadcrumb) — v1 renders one hop; walking is click-through.
- **Backfilling tags across the existing roster** — happens organically at
  triage/workbench touch, not as a batch pass.
- **`organization.create` as a first-class verb** — creation stays doored
  through the existing inline-create path.

## Close-out checklist

- [ ] Phases 1–2 landed, proof script green, browser drive green
- [ ] `pnpm -r typecheck` clean
- [ ] Update the **surrealdb-canonical-layer** skill's schema snapshot
      (affiliations: person→org OR org→org via `edge_type`; org tags via
      `has_tag` observations) + run the skills symlink sync
- [ ] Changelog entry; issue file section C checked off with pointers here
- [ ] gh issue (the worklist trail) commented/closed per house convention
- [ ] Do **not** bump parent pseudomonorepo gitlinks (standing rule)

## Related

- [[../issues/Parent-Child-Nested-Organizations-Not-Modeled]] — the issue this closes; holds the per-case worklist
- [[Augment-From-DB-Phase-1-Service-Capabilities]] — the capability-plan shape and proof-script conventions this follows
- [[../specs/Augment-From-DB-Flow]] — the flow the Org Workbench fronts
- [[../agent-skills/triage-inbox-w-suggestions/SKILL|triage-inbox-w-suggestions]] — gains the aboutness step in Phase 3
- `context-v/skills/surrealdb-canonical-layer` (anchor root) — schema snapshot to update at close-out
