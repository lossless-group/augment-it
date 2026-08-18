---
title: "Capability Gaps Surfaced by the First Triage Co-Pilot Run — One Collective Ledger, Not Five Tickets"
lede: "Five gaps from the first triage run — including direct SurrealDB writes whose string-typed ids silently failed to join their org rows."
date_created: 2026-07-25
date_modified: 2026-07-25
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.1
revisions:
  - 2026-07-25 — Initial ledger, written mid-run at operator request ("make sure these are in context-v/issues somewhere; don't need to be their own file").
tags:
  - Issue
  - Augment-It
  - Capabilities
  - Corpus-Triage
  - SurrealDB
status: Active
site_uuid: a704f082-384b-4c55-9e9e-265c48e78c39
hex_code: vdyn9p
date_authored_initial_draft: 2026-07-25
date_authored_current_draft: 2026-07-25
---

# Capability Gaps Surfaced by the First Triage Run

Run manifest with full context: `clients/reach-edu/corpus/inbox/_triage-runs/2026-07-24_1.md`.
Sibling issue: [[Parent-Child-Nested-Organizations-Not-Modeled]] (the one gap big
enough for its own file).

## 1. No org-side observation capability

`person.add_observation` exists; organizations have nothing. The operator's
"flag it association and network" / gov-entity flags had to be **direct
SurrealDB writes** mirroring `createObservation()`. Wants an
`organization.add_observation` twin.

**Why it's worse than inconvenient — the typing hazard:** the direct writes
initially stored subjects as *string-typed* record ids
(`organizations:⟨uuid⟩`) while org rows use *uuid-typed* ids
(`organizations:u"uuid"`). The observations were self-consistent but **did not
join to their org rows** — silently. Discovered and repaired 2026-07-25 (9
observations re-typed). This is exactly the class of bug the capability wire
exists to prevent; every future direct write risks reintroducing it.

## 2. `conventional_name` has no edit affordance in the entity card

`resolver.update_org` sets it (and does slug renames, preserving old slugs as
aliases), but the UI's chip editors cover only aliases/domains (per
Entity-Card-Edit-And-Remove-Affordances). Related: the create flow mints all
name fields from one string ("Stanford-PACS" became both complete_name and
conventional_name), so every UI-created org needs a post-create enrichment
pass. The ratified naming model (slug derived / conventional_name /
complete_name / greedy aliases) lives in the triage skill.

## 3. `source.add` has no slug override for fetch-hostile URLs

The capability Jina-fetches metadata to derive the source slug/filename. When
the fetch hits a wall, the slug is garbage: a ccdaily.com article slugged
`https-match-adsrvr-org-track-cmf-google` (ad-tracker redirect), a
bizneworleans.com article slugged `403-forbidden`. Disk files were renamed by
hand; **DB `source_usages.corpus_path` still records the junk paths** for
those two (workforce-development sources). Wants a `slug`/`title` override
arg, or a post-hoc path-patch capability.

## 4. `source.fetch` clobbers merged canonical bodies

The triage mechanics ruling (inbox-file-is-canonical) merges the already-
fetched inbox body over the metadata-only stub, but the DB registry still says
`metadata-only`. Running `source.fetch` on such a source would refetch and
overwrite the canonical verbatim body. Interim rule: never run it on merged
sources. Real fix: a registry-status patch, or a `source.add` variant that
accepts a provided body (which would also fix half of gap 3).

## 5. No org delete/merge capability

The duplicate `bhef` org row could not be removed over the wire. Resolution
used (2026-07-25, non-destructive, reversible): corpus entries moved to the
keeper via remove/add; keeper aliased `BHEF`/`bhef`; orphan row updated in
place — slug renamed to `bhef-merged-duplicate`, `merged_into` pointer set to
the keeper, `client_access` cleared (original value recorded in
`merged_note`) so it vanishes from workspace reads without losing data. Wants
a first-class `organization.merge` that does exactly this.
