---
title: "A person's bio page on another org's site is an affiliation signal, not just an identity link — the UI should offer the promotion"
lede: "A bio on another org's domain is three facts — identity link, affiliation evidence, observation. The card captures one and drops two."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Issue
  - Usability
  - Augment-It
  - Affiliations
  - Persons
  - Identity-Links
  - Org-Workbench
status: Shipped
date_first_published: 2026-07-24
post_ship_note: "Shipped 2026-07-24 — → affiliation row action + AddAffiliationInline (gate inverted), org_domain seeded on create, bio URL as observation source (no has_bio_at predicate for v1). Riders named not built: server inferLinkKind bio vocabulary, search-and-add rail promotion, didi-chat verb. Per [[../plans/Workbench-Usability-Sweep-Corpus-Visibility-Stream-Editing-Affiliation-Promotion]]; gh #25 closed."
site_uuid: 7be9f4c7-9430-4bc9-84d4-699ec595855f
hex_code: 8k95aa
date_authored_initial_draft: 2026-07-24
date_authored_current_draft: 2026-07-24
publish: true
---

# Person bio pages are affiliation signals

## The rule of thumb the operator already uses

**If it's static, it goes in identity.** Profiles, bios, involvement pages
→ `personal_links[]`. That instinct is right and stays.

## What gets dropped today

A bio hosted on *someone else's* org domain carries more than identity.
The live case: Jamie Merisotis (Lumina Foundation card) has links to
linkedin, luminafoundation.org, forbes.com, **bipartisanpolicy.org**, and
wikipedia — every non-linkedin one badged `other`. The bipartisanpolicy.org
link is really:

1. an identity link (captured ✓)
2. **evidence of an affiliation** with the Bipartisan Policy Center — an
   organization worth its own record, which may not exist yet (dropped ✗)
3. **an observation** — `affiliated_with`, source: that URL (dropped ✗)

The schema handles all three today (`person.affiliate` is N-per-person and
match-or-CREATES the org; observations ride along automatically). Only the
UI path is missing: from a person's link row, there's no "this is also an
affiliation" affordance.

## Direction (jotted)

- **A "promote to affiliation" action on person link rows** — takes the
  link's domain as the org seed → org match-or-create (the
  `AddPersonInline` gate pattern, inverted: person is fixed, org is being
  resolved) → `person.affiliate` with optional role → observation cites
  the bio URL as source. Three clicks, no retyping.
- Composes with the existing candidate machinery: `resolver.search` by
  domain (D4 already matches `domains[*].domain`) makes the org
  suggestion nearly free.
- Same promotion logic belongs in the search-and-add rail eventually —
  a result row that IS a bio page could offer add-link *and*
  promote-to-affiliation.
- Sibling fact: those `other` badges show `inferLinkKind` needs richer
  vocabulary (org-bio / press-profile / wikipedia), or the same
  editable-kind treatment as [[Pulse-Streams-Need-Editable-Kind-And-User-Facing-Names]].

## Open questions

- [ ] Where does the affordance live — a per-row action on the person
  card's link list, a didi-chat verb, or both?
- [ ] When the org doesn't exist: create thin (name + domain from the
  bio page) or route through a full org-resolution gate first?
- [ ] Should the observation's free-text predicate distinguish
  `has_bio_at` from `affiliated_with`, letting the human upgrade later?
