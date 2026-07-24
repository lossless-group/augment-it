---
title: "The Org Workbench can't create an organization — and creation must sit behind a 'be sure there is no match' gate"
lede: "The workbench's front door only finds orgs that already exist; there's no way to mint one from the UI. When creation lands, it can't be a bare form — the operator should be shown every plausible existing match (name, slug, alias, domain) and create only past an explicit gate, same discipline as adding a person."
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
  - Org-Workbench
  - Organizations
  - Candidate-Gate
status: Shipped
date_first_published: 2026-07-24
post_ship_note: "Shipped 2026-07-24 in 2864cf3 — '+ New organization' beside OrgSearch (answering the open question: standing ➕, not the empty-state), OrgCreateInline gate over resolver.candidates, create rides person.affiliate's org-only path with domain seeded + website as first link; resolveOrgRow's create-hits-existing-slug branch unions client_access. gh #29 closed."
---

# Create an organization from the Org Workbench — behind the gate

## The gap

The Org Workbench opens with `OrgSearch` — find an existing org, load its
card. If the org isn't in the canonical layer yet, the operator's only paths
are indirect: the CSV/record-resolution flows, or (since today) creating one
as a side effect of promoting a bio link
([[Person-Bio-Pages-Are-Affiliation-Signals-Not-Just-Identity-Links]]).
There is no first-class "create an organization" in the workbench itself.

## The rule: try to be sure there is no match

Creation is the dangerous half of match-or-create — a casually-minted org is
tomorrow's duplicate. The gate discipline that already governs persons
(`AddPersonInline`: candidates ALWAYS shown, create is an explicit choice
past them) applies verbatim:

1. Operator types a name (+ optional domain/URL).
2. Candidates surface from every signal the resolver already scores — slug
   (100), domain via D4 `domains[*].domain` (90), fuzzy name (60), aliases —
   not just the autocomplete's name-contains.
3. Zero candidates still gates: an explicit "No match — create
   ‹name›" action, never a silent create on submit.
4. Create seeds the thin row the existing paths seed (name → slug,
   `client_access`, and — per today's promotion work — a domain when one was
   given, so the new org is domain-matchable from birth).

## Existing machinery (nothing new server-side, probably)

- `resolveOrgRow(action:'create')` — the create verb half, already defends
  against slug races and (since today) seeds `domains[]`.
- `findCandidates` — the scored candidate path (`resolver.candidates`);
  `searchOrgs` is the lighter autocomplete. The gate wants the scored one.
- `AddAffiliationInline` — shipped today; its gate → create shape is the
  closest UI precedent. An `OrgCreateInline` (or a mode of `OrgSearch`'s
  empty-result state) is the org-first sibling.

## Open questions

- [ ] Where does it live — `OrgSearch`'s "no results" state growing a gated
  create, or a standing ➕ beside the search box, or both?
- [ ] Does workbench-create take a domain up front (recommended — it powers
  the strongest match signal AND seeds the new row)?
- [ ] Minimum viable row: name + domain + client — or also kind/notes?
