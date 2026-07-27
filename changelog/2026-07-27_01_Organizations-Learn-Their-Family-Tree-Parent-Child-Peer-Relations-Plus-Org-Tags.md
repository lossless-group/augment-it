---
date_created: 2026-07-27
date_modified: 2026-07-27
title: "Organizations Learn Their Family Tree — Parent/Child/Peer Relations Plus Org Tags"
lede: "Org→org edges land in the canonical layer — parent, child, or peer, with a typed flavor and free-text human context — and organizations get their first tags (Initiative, Program, Funder), all workable from the Org Workbench card."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - context-v/plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags.md
  - context-v/loops/Implement-Feature-Loop.md
  - context-v/issues/Parent-Child-Nested-Organizations-Not-Modeled.md
  - context-v/agent-skills/triage-inbox-w-suggestions/SKILL.md
  - services/record-surrealdb-resolver/src/org-relations.ts
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/record-surrealdb-resolver/src/domains.ts
  - services/record-surrealdb-resolver/src/server.ts
  - services/workspace/src/capabilities.ts
  - services/workspace/src/chat.ts
  - apps/org-workbench/src/RelatedOrgs.svelte
  - apps/org-workbench/src/OrgCard.svelte
  - apps/org-workbench/src/App.svelte
  - apps/org-workbench/src/AdditiveList.svelte
  - apps/org-workbench/src/lib/types.ts
  - apps/org-workbench/src/lib/org-client.ts
  - scripts/prove-org-relations.mjs
---

# Organizations Learn Their Family Tree

> Written beat-by-beat *as the work landed* — the first run of the
> [[../context-v/loops/Implement-Feature-Loop|Implement-Feature-Loop]]
> (tickets #49–#57, `init(feature, org-relations)` →
> `ship(feature, org-relations)` in one day, human gate included).

## Why Care?

The canonical layer knew thousands of facts about individual organizations
and exactly zero facts about how organizations contain, fund, or shadow each
other. The Upward Mobility Foundation is an initiative of the Urban
Institute; Stand Together Trust is a Koch-network arm; the Beacon fund lives
inside the Denver Foundation — and until now every one of those truths was
either welded into a folder slug or simply absent. For a philanthropic-funding
client, knowing that a grant from any arm is the same network's money is
analysis a flat org table can't produce. This ships the edges — and, because
a child org's *nature* is a fact about the org itself, organizations get
their first tag mechanism too.

The design rulings that shaped it: the relationship IS an affiliation (the
existing `affiliations` RELATE table takes org→org edges alongside its
person→org rows — no new table); relations are parent/child/**peer** (some
org pairs just aren't hierarchies) with free-text description for the context
only humans hold; and tags ride the same `has_tag`-observation +
`tag_vocab` pattern persons already use. Full reasoning:
[[../context-v/plans/Org-Relations-Parent-Child-Peer-Plus-Org-Tags|the plan]]
and the issue that demanded it,
[[../context-v/issues/Parent-Child-Nested-Organizations-Not-Modeled]].

## What landed

<!-- one beat per closed ticket — step, code sample of the interesting part, gotchas -->

### The capability slab: six new verbs, one new module (#49, #50)

`services/record-surrealdb-resolver/src/org-relations.ts` is the whole
backend: `organization.relate / relations / unrelate / relation.update`
plus `organization.tag.add / tag.remove`, registered domains.ts-style and
mapped through the workspace verb table. Org→org edges live in the same
`affiliations` RELATE table as person→org edges, discriminated explicitly:

```sql
RELATE $child->affiliations->$parent SET
    edge_type = 'org_org', rel = $rel, kind = $kind, description = $description,
    client_access = [$client], added_at = time::now();
```

The parent/child/peer trichotomy the operator speaks is a read-time
projection — canonical direction is always `in` = child, `out` = parent,
and `projectRel()` names the edge from whichever org you're looking at:

```ts
function projectRel(edge: PairEdge, focused: unknown): OrgRelKind {
  if (edge.rel === 'peer') return 'peer';
  return String(edge.in) === String(focused) ? 'parent' : 'child';
}
```

One relation per org pair (dedup scans both directions; an existing edge
unions `client_access` and reports `created: false`, the `person.affiliate`
precedent — not an error). A parent↔child flip in `relation.update`
re-normalizes by delete + re-relate, because RELATE edges can't swap
`in`/`out` in place.

Org tags are `has_tag` observations (subject = org RecordId, per-client),
never fields on the shared org row — the same multi-tenant rationale that
put `relevance` on the affiliation edge. `organization.detail` now returns
`tags: string[]`. Two gotchas worth recording: `tag.suggest`/`tag.apply`
already existed (so no new vocab verb — the datalist rides `tag.suggest`,
and the handlers reuse `ensureTagInVocab`, newly exported), and the house
tag normalizer `toDashed` deliberately **preserves operator casing**
("Impact of AI" → "Impact-of-AI"), so Train-Case lives in the vocabulary
convention, not a forced normalizer.

Verified: both services typecheck clean, resolver boots with the new
registrations, and three live NATS checks pass (empty trichotomy read on
`the-aspen-institute`, self-relation guard → localized `ok:false`,
`detail.org.tags` present). Full write-path proof is the proof script's
job (#51).

### The proof script — 22 checks, and it earned its keep immediately (#51)

`scripts/prove-org-relations.mjs` mints three throwaway orgs under a
throwaway client slug (invisible to every real workspace even mid-run),
proves the full write path over NATS — relate/trichotomy-from-both-sides/
duplicate-rejection/peer/flip/unrelate/tags — then runs the
surrealdb-canonical-layer client-tagging audit (re-query **without** the
client filter, inspect `client_access` on every row) and deletes down to
zero residue.

First run caught two real bugs in `relation.update`:

1. **`$access` is a protected SurrealDB variable** — binding the carried
   `client_access` under that name threw
   `'access' is a protected variable and cannot be set`.
2. **Destructive order** — the flip deleted the old edge *before* the
   RELATE that then failed, silently destroying the relation. Reordered to
   create-new-then-delete-old, so a failed RELATE now leaves the original
   edge intact.

Second run: 22/22 green, `cleanup: zero residue`.

### The card grows a family-tree section (#52)

`RelatedOrgs.svelte` sits on the org card above People: **Part of /
Contains / Peers**, each row showing the related org, its `kind` badge,
and the free-text description. The row itself is the navigation — click a
related org and the workbench loads it (`onopen` → `OrgCard` →
`App.loadOrg`, which already handles active-entity broadcast), so walking
a constellation like Koch / Stand Together is edge-by-edge click-through.

The ➕ opens an inline relate form: the existing `OrgSearch` picker, a
plain-language rel select ("is the parent of this org / is a child of
this org / is a peer"), a `kind` input with the seed-vocabulary datalist,
and the description field. Relating is to **existing orgs only** — the
no-match path routes through the header's gated `+ New organization`, so
org creation keeps its single door. ✎ edits rel/kind/description in place
(a parent↔child flip re-normalizes server-side); × uses the same
inline-confirm as the alias chips, with the reassurance spelled out:
*both orgs stay — only the edge goes*.

### Tags join the identity block (#53)

A **Tags** row now sits in the identity `<dl>` between Aliases and
Domains: chips with the same ✕-inline-confirm the alias chips use, and a
➕ that opens a one-field add with a datalist fed by the shared per-client
`tag_vocab` (via the existing `tag.suggest` — org tags and source tags
deliberately share one vocabulary). Tag removal rides its own verb rather
than `resolver.update_org`, because tags are per-client observations, not
fields on the shared org row. The row renders even when empty so the
affordance is discoverable — an untagged org shows the ➕, not nothing.

### The agent drove it before asking a human to (#54)

Playwright drive against the live shell (`localhost:3100`, Augment-from-DB
flow), throwaway `drive-proof-*` orgs only, accessibility snapshots
throughout, deleted to zero residue after: relate via the ➕ form →
**Part of** renders with kind badge + description → row click navigates
the workbench to the parent → reverse projection shows **Contains** →
tag add renders the chip → ✕-confirm removes it (empty row keeps its ➕)
→ relation ✕-confirm removes the edge. Zero console errors across the
whole drive.

One finding, fixed live: the hover-revealed ✎/× used `visibility: hidden`,
which also removed them from keyboard focus and the accessibility tree —
the drive's click literally couldn't reach them. Now opacity-based with
`:focus-within`, so Tab reveals them too. The drive proving the buttons
*work* is exactly the rung that caught the button you couldn't Tab to;
the human walk-through still judges whether the surface is *usable*.

### didi learns the family tree, and triage learns to ask "parent or child?" (#55)

`WORKBENCH_CHAT_VERBS` now carries `organization.relations / relate /
tag.add` with the relations discipline: **propose by default** — a
relation is a judgment call, so didi chat_invokes only when the operator
stated the relationship themselves ("X is an initiative of Y"), quoting
their phrasing into the edge's `description`. The triage slab gains
**step 5b (aboutness routing)**: when a destination org has relations or
the page names an initiative of a parent, ask which entity the content is
*about* before filing — and an initiative that's a real actor with no row
yet gets minted, related, and tagged `Initiative` instead of parked. The
triage SKILL.md's parent-child open decision flips to **MODEL LANDED**,
and the `initiative_hub` stream kind sheds its "while parent/child
modeling is unresolved" caveat — it's now only for initiatives that don't
merit their own org row.

### Human-gate finding: corpus kinds stop drifting (#57)

The operator's walk-through surfaced it in minutes: the Corpus items
adder's free-text `kind` breeds near-duplicates (`report` vs `reports`).
Fix: `organization.corpus.kinds` returns the distinct kinds already in use
across the client's orgs — 19 in reach-edu on first fire (`annual_report`,
`article`, `blog_post`, …) — and `AdditiveList` grew an optional
`kindSuggestions` datalist on both the add and edit kind inputs.
Autocomplete, never enforcement: a non-match creates exactly what the
operator typed, the same open-vocabulary philosophy as relation kinds.
Refreshed per card load, so a kind minted on one org suggests on the next.

### The pilot untangle — and the conflation confesses (#56)

The acceptance test was the case that started it all:
`funders/upmobility-foundation-urban-institute/`. Walking it through the
live workbench produced the run's best finding: **the weld was never a
parent and its initiative — it was two distinct entities.** UpMobility
Foundation (upmobility.org, a nonprofit donor) and Urban Institute's
*Upward Mobility* initiative (upward-mobility.urban.org) had been fused by
a host-family match. The operator ruled them **peers** (`partners_with`
edge), minted `urban-institute` (+`Think-Tank` tag) through the UI, and
the 17-file sweep split the folder by aboutness: seven UpMobility captures
into the renamed `funders/upmobility-foundation/`, six Urban files into
`think-tanks/urban-institute/` (including the three captures parked since
triage batch 1, now registered as `content_items`), two fetch-blocked
profiles gated, two mis-packed third parties re-inboxed — and **zero
`reference_of:` pointers**, because the DB edge itself is the connection.
reach-edu commit `30e0453`.

The issue's remaining welds (Truist↔LiftFund, Beacon, the Koch
constellation edges, USDA↔Rural Development, the Harvard chain) untangle
lazily at filing pressure, now with the tools this ship built.

## What's next

- The rest of the reconciliation worklist, case by case, in triage sessions.
- Corpus roll-up lenses (child content surfacing on the parent) — deferred
  until the edges earn it.
- Multi-hop chains (Project on Workforce ⊂ HKS ⊂ Harvard) render one hop
  today; walking is click-through.
