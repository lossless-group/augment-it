---
title: "Pulse streams need an editable kind and a user-facing name — 'Today's Credentials' is not an 'updates_index'"
lede: "The auto-inferred stream kind is wrong often enough to need a correction path, and streams have no name field at all — but real publication streams have titles. Lumina's https://www.luminafoundation.org/topics/todays-credentials/ is called 'Today's Credentials', and the operator can neither fix its classifier nor record what it's called."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
tags:
  - Issue
  - Usability
  - Augment-It
  - Pulse-Streams
  - Org-Workbench
  - Media-Streams
status: Open · Jotted
---

# Pulse streams need editable kind + user-facing names

## The two symptoms (same list, same row)

1. **Wrong kind, no correction path.** `inferStreamKind` guessed a
   classifier for Lumina's Today's Credentials stream that doesn't fit
   (a `/topics/...` path isn't a blog index in the usual sense, and the
   operator reading the row can see it's mislabeled). The org card's
   streams list renders the kind badge but offers no way to change it —
   the additive-only write discipline (`organization.streams.add`,
   `shapeStream`) has add and nothing else. The ➕ form does accept a
   manual kind at add time, but a stream that arrived with a wrong
   inferred kind is stuck with it.
2. **No name at all.** `media_streams[]` entries carry
   `{url, kind, party, url_domain, added_at}` — no `name`/`title` field.
   Many organizations title their publication streams ("Today's
   Credentials", "Insights", named newsletters); the operator knows the
   name at add time and has nowhere to put it. The card then renders a
   bare hostname, which reads as noise once an org has three streams on
   the same domain.

## Directions (jotted)

- **Schema is SCHEMALESS — adding `name` is free** on the entry shape;
  the work is the verb + UI, not migration. `shapeStream` gains an
  optional `name`; the ➕ form gains a name input.
- **An update verb** — `organization.streams.update` (match by URL,
  patch `kind`/`name`) breaks new ground: the entity-list discipline so
  far is strictly additive. Precedent for careful updates exists
  (`resolver.update_org` edits name/slug with the old slug pushed into
  aliases). The same match-by-URL + patch shape presumably extends to
  `org_links` kinds later (same misclassification risk there —
  see the person-card 'other' badges).
- **UI**: kind badge and name become click-to-edit on the stream row —
  the view-AND-edit-in-place ruling already governs this card.
- **Naming convention check**: confirm the observed classifier value and
  whether `inferStreamKind`'s vocabulary (blog_index / newsroom / rss /
  youtube_channel / substack …) wants a `topic_hub` or `publication`
  member, or whether operator-set names make finer kinds unnecessary.

## Open questions

- [ ] Does `kind` even matter once `name` exists, beyond scan-mode
  routing (rss/blog_index get the dependable scan path)? Maybe kind
  collapses to "scannable-how" and name carries the meaning.
- [ ] Update semantics vs the additive discipline — is match-by-URL patch
  acceptable, or does correction mean remove+re-add with provenance?
