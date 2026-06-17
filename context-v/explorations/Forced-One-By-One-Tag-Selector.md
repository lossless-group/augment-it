---
title: "Forced One-By-One Tag Selector — a pulse-dimension pattern for deliberate triage instead of lazy bulk-tick"
lede: "Bulk-checkbox UX produces uniform half-considered tags. We want a reusable pulse-dimension component that presents one tag at a time, with apply / skip / skip-rest controls, so each tag forces a deliberate per-entity decision. Surfaces first as a 'flag high-value under-the-radar lead' affordance on the person-enrichment worklist; reusable across orgs (sector / region / funder-priority), corpus content (quality tier, sensitivity, voice-fit), and any triage flow where deliberation matters more than throughput. Pattern is abstracted: instantiate with a tag set + an entity ref + an onApply callback; the component owns the one-at-a-time stepping and the keyboard rhythm."
date_created: 2026-06-16
date_modified: 2026-06-16
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-16 — Initial draft. Captured at the end of the person-enrichment session that surfaced the need. Operator framing was: *"I will want to flag high value under-the-radar leads. Possibly by creating an abstracted tag selector component that can accept different tags and force me to apply them one by one."* The 'one by one' part is the load-bearing claim — bulk tagging produces lazy tags; this exploration is the pattern that resists that drift.
tags:
  - Exploration
  - Augment-It
  - Pulse-Pattern
  - Person-Enrichment
  - Triage
  - UI-Component
  - Reusable-Pulse-Dimension
---

# Forced One-By-One Tag Selector

## The problem this is solving

The person-enrichment surface ([[../specs/Sparse-Person-Enrichment-Surface]]) currently lets the operator move through a worklist of attendees and fill structured fields (names, affiliations, links, corpus). What it doesn't do is force a **deliberate tagging pass** — the kind of pass where you stop on each entity and decide whether THIS specific qualifier applies to THIS specific person.

The first concrete instance is **"high-value under-the-radar lead."** It's the kind of tag that bulk-checkbox UX gets wrong every time:

- Show the operator 100 attendees with a checkbox column → they tick the obvious 5, miss the 12 who'd actually qualify, and the tag becomes noise.
- Show them an "apply tag in bulk" verb → they apply it to a filter result and lose the deliberation entirely.
- Show them a per-entity multi-select → they default to leaving everything blank because clicking through each entity is friction without scaffold.

What works for **deliberation-shaped triage** is the opposite shape: present **one tag at a time**, present it **with the entity it might apply to**, and force a yes / no / skip decision before moving on. The operator can't drift into reflex-ticking because they're only ever looking at one (tag, entity) pair.

## The pattern, abstracted

A `TagSelector` pulse-dimension that:

1. **Takes a tag set** — `Tag[]`, where each tag is `{ key, label, description?, color? }`. The set is a prop, not hardcoded — so the same component handles "high-value under-the-radar lead" today and "sector: education" tomorrow.
2. **Takes an entity ref** — `{ table, id }` against the canonical layer; the component knows how to read existing tags and where to write new ones.
3. **Takes an `onApply` callback** — `(entity, tag) => Promise<void>`. The component handles UX state (current index, animation, undo); the parent handles the actual SurrealDB write.
4. **Owns the stepping** — there's a current tag, a current entity (or set of entities), and an `index` that advances on each decision.
5. **Three actions per tag**: **Apply** (writes, advances), **Skip** (advances without writing), **Skip the rest** (closes the pass — operator has decided they don't want to keep going).
6. **Keyboard-first**: `Y` / `Enter` to apply, `N` / `Esc` to skip, `Q` to skip the rest. No mouse needed for a fast pass.

The mental model the operator should land on: *"the system is asking me a question about each entity; I am answering Y / N / done."* Not: *"I am looking at a list and ticking boxes."*

## Two modes — pick one per instantiation

**Mode A: one tag, many entities.** "For each attendee, is this person a high-value under-the-radar lead?" The component steps through entities, asking the same question. Output: that tag applied to some subset of the entities.

**Mode B: many tags, one entity.** "For this person, which of these tags apply?" The component steps through tags, asking each. Output: a (possibly empty) set of tags applied to that one entity.

Both modes use the same component — what changes is which axis advances on each Apply / Skip. The instantiating surface picks the mode via a prop: `axis: 'entity' | 'tag'`.

The **person-enrichment "flag high-value leads"** flow is Mode A: one tag, ranged over the worklist. The **"classify this org along several dimensions"** flow (later, on the org-enrichment surface that doesn't exist yet) is Mode B: many tags, one entity at a time.

## Where it surfaces first, where it goes next

- **First instance — person-enrichment surface, "high-value under-the-radar lead" pass.** Operator finishes a normal enrichment pass on an event's attendees, then runs the tag-selector pass over the worklist with `{ key: 'hv_undr', label: 'High-value under-the-radar', description: '…' }` as the only tag. Each attendee gets one yes / no / skip decision.
- **Second instance — org triage.** Once the org-enrichment surface exists, the same component instantiates with a sector tag set (`{ education, workforce, civic, philanthropy, ... }`) in Mode B against each org. Operator runs through orgs one at a time, applies whichever sectors fit.
- **Third instance — corpus triage.** The Corpus Inbox ([[../specs/Corpus-Inbox-Capture-and-Triage]]) sorts captured URLs into routes (per-funder, reference, discard). A tag-selector pass over the inbox classifies each item by quality tier or by topic — same component, different tag set.
- **Fourth instance — prospect warmth.** When the org-side affiliations layer matures, the same component over a list of prospects: cold / warm / hot, one at a time.

The pattern is one component, many tag sets, many surfaces. That's why it's worth abstracting now rather than hardcoding "high-value lead" into the worklist.

## Tie-in with the pulse-pattern

The [[../specs/Pulse-Pattern]] vocabulary is **pulse**, **pulse-dimension**, **pulse-surface**. A pulse-surface hosts an entity and composes multiple pulse-dimensions against it. The tag-selector is a **pulse-dimension** — it operates against an entity (or a stream of them), it composes alongside the other dimensions on a surface.

Compared with the existing pulse-dimensions ([[../specs/Sparse-Person-Enrichment-Surface]] uses NameFields, EmailListField, LinkList, AffiliationCard), the tag-selector is different in one important way: **it owns the worklist's pace**, not just one entity's pulse. It pulls the worklist's index forward (or holds it on one entity in Mode B) instead of letting the surface's own next-→ control it. So instantiating it should probably swap the surface into "tag-selector mode" — the normal save-and-advance affordances dim or hide, and the tag-selector becomes the active driver.

## What the data shape looks like

Tags live on the entity, not in a separate table. SurrealDB SCHEMALESS handles this cleanly:

```surql
UPDATE $entity_id SET
  tags = array::union(tags ?? [], [$tag]),
  client_access   = array::union(client_access ?? [], [$client]),
  last_touched_by = $client,
  last_touched_at = time::now();
```

Where `$tag` is the tag's `key` string. Per [[feedback_redundancy_over_normalization]], denormalize freely — the tag string sits in an array on the entity; we don't need a `tags` table or a relation. Querying for "all attendees flagged hv_undr" is `WHERE 'hv_undr' IN tags`.

For audit: every tag application also writes an `observations` row with `predicate = "tagged"`, `subject = entity`, `object = tag_key`, `client = $client`, `at = time::now()`. Same as every other observation in the canonical layer — and per [[project_canonical_client_tagging]] this is what makes "who tagged this and when" answerable later.

## Open questions / decisions deferred

- **Undo.** A fast pass needs an undo affordance — operator decides reflexively, realizes the call was wrong, wants to go back one. Should the component own an N-deep undo stack, or just one-deep? One-deep is the simpler shape and matches the "keep moving" rhythm; deeper is overkill.
- **Tag descriptions.** Should the tag's `description` show inline next to the label, or below as a smaller hint, or only on hover / focus? The description is what makes the tag's edge-cases legible; without it the operator drifts toward their own private definition.
- **Visual cue for "already tagged".** When stepping through Mode A, the component needs to show whether the current entity already carries the tag from a prior session. If yes, the Apply action becomes "remove the tag" — operator gets the same yes / no / skip rhythm but inverted.
- **Cross-tag dependencies.** Some tag sets have order: "if sector = education, then also pick education subtype." That's Mode B + branching. Out of scope for v1.

## Why this is an exploration, not a spec

Per [[feedback_cluster_then_spec_not_patch]], pattern naming earns a context-v doc — but the level of commitment matters. This is an exploration because:

- The shape isn't validated yet — Mode A and Mode B might not both be needed.
- The "owns the worklist's pace" claim needs to survive one real implementation before we promote it to spec.
- The tag-set vocabulary is going to drift; pinning it now would be premature.

When the first instance (the high-value-lead pass on person-enrichment) ships and the rhythm proves out, this exploration graduates into `context-v/specs/Tag-Selector-Pulse-Dimension.md`.

## See also

- [[../specs/Pulse-Pattern]] — the vocabulary this component slots into
- [[../specs/Sparse-Person-Enrichment-Surface]] — where the first instance lives
- [[../specs/Corpus-Inbox-Capture-and-Triage]] — a future surface for a different tag set
- [[../specs/Client-Tagging-on-Canonical-Writes]] — the `client` field on every write, including tag observations
- [[feedback_human_in_drivers_seat]] — operator drives each pick; tag selector is the affordance shape that resists agent-driven triage
- [[feedback_cluster_then_spec_not_patch]] — why this is named at the pattern level instead of bolted in as a one-off
