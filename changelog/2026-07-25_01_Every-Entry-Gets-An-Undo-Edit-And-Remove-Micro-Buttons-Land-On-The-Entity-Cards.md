---
date_created: 2026-07-25
date_modified: 2026-07-25
title: "Every Entry Gets an Undo — Edit & Remove Micro-Buttons Land on the Entity Cards"
lede: "A misclicked ➕ put alpha.school on Princeton and the only undo was a raw database write. Now every list entry and identity property on the org and person cards carries hover-revealed ✎ and × — patch it, or remove it with a one-line confirm."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/person-resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/record-surrealdb-resolver/src/person-handlers.ts
  - services/workspace/src/capabilities.ts
  - apps/org-workbench/src/AdditiveList.svelte
  - apps/org-workbench/src/OrgCard.svelte
  - apps/org-workbench/src/PersonCard.svelte
  - apps/org-workbench/src/AddAffiliationInline.svelte
  - apps/org-workbench/src/PeopleReveal.svelte
  - apps/org-workbench/src/lib/org-client.ts
  - apps/org-workbench/src/app.css
  - context-v/specs/Entity-Card-Edit-And-Remove-Affordances.md
tags:
  - Org-Workbench
  - Canonical-Layer
  - Workspace
---

# Every Entry Gets an Undo

## Why Care?

The org card's founding ruling was "one screen that views AND edits in
place" — but it only ever edited in one direction. Additive-only writes
protect canonical data from over-eager agents, and they also locked the
*human* out of corrections: this morning an accidental ➕ put
`alpha.school` on Princeton University's identity links, and the fix
required an agent session running a raw SurrealDB `UPDATE`. That's
backwards. The operator disposes, and disposal includes removing what's
wrong.

Now every entry on the card's three lists (identity links, pulse streams,
corpus items — and the person cards' lists, which ride the same
component) reveals ✎ and × on hover. ✎ patches the URL itself, the kind,
and (streams) the name, in place. × asks once, inline — "remove? yes /
keep" — and when the target is a stream whose domain fed corpus items,
the confirm says so: *"this stream's domain fed 1 corpus item — they
stay."* The identity block joined too: org names edit inline, aliases and
domains are ✕-chips.

## What's New?

- **Seven new capabilities** — `organization.links.update/.remove`,
  `organization.streams.remove`, `organization.corpus.update/.remove`,
  `person.links.remove`, `person.corpus.remove` — all match-by-URL,
  served by record-surrealdb-resolver beside their add siblings.
  `organization.streams.update` gains `new_url`, so stream URLs edit the
  same way.
- **Removal leaves a trail.** Every remove writes one `entry_removed`
  observation (URL, list, client, source) — canonical history keeps
  what-was-there-and-when without keeping the wrong data live.
- **Corpus removes detach, never delete.** `content_items` rows and
  fetched corpus files stay; a corpus URL *edit* re-resolves the entry's
  `content_id` so the ledger bond stays true.
- **Provenance survives edits** — updates patch the entry in place, so
  `added_at` rides through a typo fix (verified live: same timestamp
  across a kind patch and a URL move).
- **Identity block editing** via `resolver.update_org`, which gains
  `aliases`/`domains` full-array replacement for the chip editors.
- **Micro-buttons rest invisible** — rows stay quiet; hover or keyboard
  focus reveals ✎/×, per the spec's D5.
- **Affiliations too** *(same-evening extension)* — a person accepted
  against the wrong org had no way out (the Marla Blow case: filed under
  Aspen, actually CEO at Skoll). The expanded person card now shows its
  affiliation with × (`person.unaffiliate` — edge delete plus an
  `affiliation_removed` observation; the person and their history stay)
  and a "+ other org" door reusing the bio-promotion gate without a
  seeding entry. People rows also stopped overflowing narrow cards
  (the same min-width:auto disease as the search rail).

## Under the Hood

Proven over the live stack against the Aspen safe target: add a scratch
link → patch its kind → move its URL (`added_at` unchanged both times) →
remove → the card shows it gone and the `entry_removed` observation is in
the observations table. Browser-driven end-to-end: the stream × confirm
rendered the fed-corpus caution and "keep" backed out cleanly; a scratch
link added through the ➕ came out through the × confirm with the list
count restored.

The operator resolved the spec's two open questions in review: yes, warn
when a stream fed the corpus (implemented as a domain-match approximation
— corpus entries don't record their source stream yet), and alias/domain
removal rides `resolver.update_org` rather than growing dedicated verbs.

Spec of record: [[Entity-Card-Edit-And-Remove-Affordances]] · gh #44 ·
the motivating incident is 2026-07-24's alpha.school-on-Princeton fix.
