---
title: "Entity-Card Edit & Remove Affordances — every visible property gets a micro-button pair"
lede: "The org card views and edits in place, but only additively — a misclicked ➕ today required a direct database write to undo. Every entry and identity property the card shows grows ✎ and × micro-buttons."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Spec
  - Augment-It
  - Org-Workbench
  - Workspace
  - Canonical-Layer
status: Draft
---

# Entity-Card Edit & Remove Affordances

## Why Care?

The operator ruling that shaped the org card — "no two loops, two apps;
one screen that views AND edits in place" — was only half-honored. The
card edits in one direction: additive. Today (2026-07-24) the operator
accidentally ➕'d `alpha.school` as Princeton University's identity URL,
and the only undo was an agent session doing a raw SurrealDB `UPDATE`.
The additive discipline that protects canonical data from agents also
locks the *human* out of corrections — exactly backwards for the
human-in-the-drivers-seat model: agents propose, the operator disposes,
and disposal includes *removing what's wrong*.

The rule this spec sets: **anything the card renders, the operator can
edit; anything the operator (or an accepted candidate) put on a list, the
operator can remove.** Micro-buttons, in place, no other surface.

## Scope

1. **List entries** — org card's three `AdditiveList`s (identity/social
   links, pulse streams, corpus items) and the person-card lists that
   reuse the component. Each row gets:
   - **✎ edit** — patch `kind` (all lists), `name` (streams — already
     shipped via `organization.streams.update`), and `url` itself.
   - **× remove** — delete the entry, inline confirm ("remove
     alpha.school from Identity & social links?"), no modal.
2. **Identity block** — the `<dl>` properties: complete/conventional
   name (rides the existing `resolver.update_org`, which the workbench
   never exposed), aliases (add ✕-chip removal), domains (same chip
   pattern).
3. **Out of scope** — People rows (affiliation edges have their own
   promotion/rating flows), and merge/dedupe (gh #30, its own surface).

## Decisions

- **D1 — Removal is a first-class capability, not a UI trick.** New
  verbs, mirroring the add pair shapes, all match-by-URL (the de-facto
  entry key everywhere — dedupe, scan, streams.update precedent):
  `organization.links.remove` / `organization.links.update`,
  `organization.streams.remove`, `organization.corpus.remove`,
  and the person twins (`person.links.remove`, `person.corpus.remove`).
  Served by record-surrealdb-resolver beside their add siblings; 30s
  Cloud round-trip budget.
- **D2 — URL edits are remove+re-add server-side, patch-shaped on the
  wire.** `*.update {org_slug, url, patch: {url?, kind?, name?}, client}` —
  the handler swaps the entry in place so `added_at` provenance survives
  a typo fix. (`organization.streams.update` keeps its current shape;
  the new verbs generalize it.)
- **D3 — Corpus removes detach the entry, never delete content.**
  `organization.corpus.remove` pulls the entry off `org_corpus`; fetched
  markdown in the per-client corpus filesystem and `content_items` rows
  stay (other records/clients may reference them; storage is subscale —
  the redundancy ethos). A later sweep can garbage-collect orphans if it
  ever matters.
- **D4 — Removal leaves a trail.** Every remove writes one observation
  (`predicate: 'entry_removed'`, object = the URL, `client` tag, actor
  attribution) so canonical history keeps what-was-there-and-when without
  keeping the wrong data live. Accumulate observations, not overwrites.
- **D5 — Micro-buttons are hover-revealed, confirm inline.** Row rest
  state stays as today; hover (or row focus) reveals `✎ ×` at the row's
  right edge, sized to the existing `.ow-plus` class. × flips to an
  inline "remove? yes / keep" pair — the Search-Results-Queue dismiss
  confirm pattern, no dialogs. The streams ✎ generalizes to all lists.
- **D6 — Wire discipline unchanged.** Slugs/uuids only, `client` on
  every call, `augment-it:entity-updated` broadcast after every mutation
  so the card, roster counts, and any open search-rail cards refetch.

## Implementation sketch

1. **Capabilities** — handlers in record-surrealdb-resolver (links.ts /
   streams / corpus modules beside the adds), capability map + timeout
   entries in `services/workspace/src/capabilities.ts`.
2. **AdditiveList** — `onedit` generalizes from streams-only to all
   lists (kind editing everywhere, name where `nameable`); new
   `onremove` prop with the inline confirm; hover-reveal CSS.
3. **OrgCard / PersonCard** — wire the new verbs; identity block gains
   name-edit (via `resolver.update_org`) and alias/domain chip removal.
4. **Proof** — extend `prove-augment-from-db-capabilities.mjs` with the
   remove/update round-trips against the Aspen safe target; browser
   drive: add a wrong link, edit its kind, remove it, watch the card and
   roster counts refetch.

## Open questions

- [ ] Does × on a stream that has corpus items scanned from it warn
  ("this stream fed 12 corpus items — they stay")? Lean yes, same inline
  note, no gate.
- [ ] Alias/domain removal via `resolver.update_org` sparse patch or
  dedicated verbs? Lean update_org — it already owns the identity block.

## Related

- [[Augment-From-DB-Flow]] — the card this corrects; its D-series set the
  additive discipline this spec now balances.
- [[../plans/Workbench-Usability-Sweep-Corpus-Visibility-Stream-Editing-Affiliation-Promotion]] —
  the `streams.update` match-by-URL precedent (#26).
- [[Search-Results-Queue-Remote]] — the inline-confirm pattern D5 copies.
