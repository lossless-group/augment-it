---
date_created: 2026-07-24
date_modified: 2026-07-24
title: "Workbench usability sweep — corpus entries visible, streams named and correctable, bio links promotable to affiliations"
lede: "The first real workbench session filed seven issues; the three in today's scope ship together: person cards list their corpus entries instead of a bare count, pulse streams gain a user-facing name and an in-place kind/name editor, and a bio page on another org's site can be promoted to an affiliation in three clicks."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/record-surrealdb-resolver/src/resolver.ts
  - services/record-surrealdb-resolver/src/person-resolver.ts
  - services/record-surrealdb-resolver/src/handlers.ts
  - services/workspace/src/capabilities.ts
  - apps/org-workbench/src/AdditiveList.svelte
  - apps/org-workbench/src/OrgCard.svelte
  - apps/org-workbench/src/PersonCard.svelte
  - apps/org-workbench/src/AddAffiliationInline.svelte
  - apps/org-workbench/src/lib/org-client.ts
  - apps/org-workbench/src/lib/types.ts
tags:
  - Org-Workbench
  - Corpus
  - Pulse-Streams
  - Affiliations
  - Usability
---

# Workbench usability sweep — three of the 2026-07-24 issues ship

The first real session with the org workbench (2026-07-24) produced seven jotted
issues. Three made today's scope — the plan that evaluated them against the
codebase is
[[context-v/plans/Workbench-Usability-Sweep-Corpus-Visibility-Stream-Editing-Affiliation-Promotion|the sweep plan]],
and each shipped as its own commit, closing GitHub issues
[#20](https://github.com/lossless-group/augment-it/issues/20),
[#26](https://github.com/lossless-group/augment-it/issues/26), and
[#25](https://github.com/lossless-group/augment-it/issues/25).

## Corpus entries are visible on person cards (#20)

"Corpus items 3" with no list is a count you can't assure coverage with.
`organization.affiliations` now carries `personal_corpus[]` alongside the count
(eager, symmetric with `personal_links`), and the person card renders it with
the same `AdditiveList` the links use — kind badge, host, date, plus the
existing ➕ and 🔍. The Phase 1 count-only contract is formally disproven and
retired. Entries render URL+kind for v1: `content_items` holds no titles today,
so title hydration is a content-ingest rider, and the coverage roster ("which
entities have NO corpus?") folds into the component-library sweep.

## Pulse streams get a name and an editable kind (#26)

"Today's Credentials" is not an `updates_index`. Stream entries gain an
optional operator-facing `name` (hostname stays the display fallback), the ➕
form takes it at add time, and a new `organization.streams.update` capability —
the first patch on an entity-list entry — corrects `kind`/`name` on an existing
row, matched by its de-facto key, the exact URL. Entries stay additive (no
delete); fields on them are now correctable, with the same
`client_access`/`last_touched` stamping `resolver.update_org` models. Safe
because stream kind is descriptive-only today: `stream-scan` routes every kind
down the same path. `inferStreamKind` also learns `topic_hub`, so `/topics/…`
paths stop landing as `updates_index` in the first place.

## Bio-page links promote to affiliations (#25)

Jamie Merisotis's bipartisanpolicy.org bio was filed as an `other` identity
link — correct, and two facts short: the affiliation it evidences, and the
observation citing it. Person link rows now carry a **→ affiliation** action
opening `AddAffiliationInline`: `AddPersonInline`'s gate inverted, person fixed
and org being resolved. Candidates load from the bio's domain via
`resolver.search` (D4 already matches `domains[*].domain`); the gate always
shows — pick an existing org or create a thin one. `person.affiliate` does what
it always did (match-or-create, N-per-person dedupe, automatic
`affiliated_with` observation), now with the bio URL as the observation's
source and one new input: `org_domain`, seeded into `domains[]` on create so a
promotion-born org stays domain-matchable forever after.

## Verification

Resolver + workspace typechecks clean; org-workbench svelte-check 0/0; org-
workbench and shell builds green. The write paths are not exercised headlessly
per the additive-writes discipline — the operator walk-through is: Lumina →
People → Jamie Merisotis → see the three corpus entries; rename the
Today's Credentials stream and fix its kind; promote the bipartisanpolicy.org
link and watch the affiliation + observation appear.
