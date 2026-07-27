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
---

# Organizations Learn Their Family Tree

> **Stub note:** this entry is being written *as the work lands*, per the
> [[../context-v/loops/Implement-Feature-Loop|Implement-Feature-Loop]] (its
> first run). `## What landed` accumulates a beat per closed ticket; the
> polish pass happens at ship. Tickets: augment-it #49–#56.

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
