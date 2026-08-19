---
title: "Augment from DB · Phase 4 — people reveal, person cards, add-person with automatic affiliation"
lede: "The org card grows its people: every affiliated person revealed with role + relevance, nested identity links with their own ➕ and 🔍, and an inline add-person where the affiliation edge materializes without the operator ever managing it."
date_created: 2026-07-22
date_modified: 2026-07-22
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.1.0
date_first_published: 2026-07-22
spec_reference: "[[../specs/Augment-From-DB-Flow]] §Phase 4"
post_ship_note: "Executed same day as authored. svelte-check 0/0 (90 files), org-workbench + shell builds green. Zero service changes, as planned. Add-person write path deliberately left to the operator walk-through (no canonical-layer pollution for a smoke test); its verbs were live-proven in prior flows."
tags:
  - Plan
  - Augment-It
  - Augment-From-DB
  - Phase-4
  - People-Reveal
  - Affiliations
  - Pulse-Pattern
status: Shipped
site_uuid: 2b0b4a7f-9684-4db2-b043-6ef0681a3069
hex_code: udksef
date_authored_initial_draft: 2026-07-22
date_authored_current_draft: 2026-07-22
publish: true
---

# Augment from DB · Phase 4 — people reveal + add-person

## Spec reference

Implements **Phase 4** of [[../specs/Augment-From-DB-Flow]]. All UI lands in `apps/org-workbench`; zero service changes — every verb (`organization.affiliations`, `person.candidates` / `person.apply` / `person.affiliate`, `person.links.add` / `person.corpus.add`) shipped in Phase 1 or earlier flows. Branch: `rebuild/turbo-rsbuild`.

Wire shapes verified against `person-resolver.ts`: `PersonNormRecord` (`name` required; `linkedin_url`, `role`, `observation` optional), `PersonCandidate` (`person_uuid` + score + match_reason), `PersonApplyInput` (`action: 'match'|'create'`, `person_uuid` required for match), `PersonAffiliateInput` (`person_uuid` + `org_action:'match'` + `org_slug` + `role?` + `client`).

**Scope note:** `AffiliatedPerson` carries `personal_corpus_count`, not the corpus entries (Phase 1 contract). The person card therefore lists links in full (AdditiveList reuse) but shows corpus as count + ➕ + 🔍 only — entry listing rides `affiliation.detail` in a later pass if the operator wants it.

## Steps

1. **Client lib** (`org-client.ts` + `types.ts`) — `PersonCandidate`, `PersonNormRecord` mirrors; wrappers for `person.candidates`, `person.apply`, `person.affiliate`, `person.links.add`, `person.corpus.add`.
2. **`PersonCard.svelte`** — one affiliated person expanded: headline · role · relevance; `AdditiveList` reuse for `personal_links` (➕ → `person.links.add`, 🔍 → person-shaped envelope, target `links`); corpus row (count + ➕ → `person.corpus.add`, 🔍 target `corpus`). Every write dispatches `augment-it:entity-updated { person_uuid }`.
3. **`AddPersonInline.svelte`** — the spec's "magic": name (+ optional LinkedIn URL, role) → `person.candidates` → operator gate ALWAYS (pick a candidate or "create new" — scores + match_reason shown) → `person.apply` → `person.affiliate` with the org pre-bound (`org_action:'match'`, this card's `org_slug`) — the edge + paired observation materialize without an explicit affiliation step. Callable again later for other orgs (N-affiliation assumption).
4. **`PeopleReveal.svelte`** — collapsible "People · N" section on the org card over `organization.affiliations` (already relevance-sorted server-side); rows expand to `PersonCard`; footer hosts `AddPersonInline`; refetches on its own writes and on person-shaped `augment-it:entity-updated`.
5. **`OrgCard.svelte`** — mounts `PeopleReveal` under the three lists.
6. **Verify** — svelte-check + build org-workbench; shell build regression; `organization.affiliations` live data already proven (Aspen, 10 people). The add-person write path is NOT exercised headlessly — it creates real canonical persons, and polluting the shared layer for a smoke test violates the additive-writes discipline; the verbs themselves shipped and were live-proven in the person-db-resolver flow. Operator walk-through: reveal Aspen's 10 → expand one → ➕ a link → add a real person → see the affiliation appear with no explicit step.
7. Changelog, commit + push as `attempt(augment-from-db, people-reveal, step4):`.
