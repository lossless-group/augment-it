---
title: "Person-enrichment surface ships — the pulse pattern lands as our second flow shape, per-field Enter-to-save with cross-doc UUID verification, and orgs auto-detect across attendees"
lede: "Last night the canonical layer landed in SurrealDB; tonight the operator-facing surface that turns sparse rows into rich ones starts running in the browser. The new `apps/person-enrichment/` remote is a *pulse-surface* — a per-event UI where the operator iterates one attendee at a time and fills as many dimensions as one Google search surfaces: name (paste a full name and it splits surname + first_name; or edit either field directly), additional emails, personal links (LinkedIn, X, Substack, GitHub — kind auto-inferred from URL), personal corpus (the LLM/RAG ingest target — articles, podcasts, interviews), an organization (find-or-create by slug), org links, and org corpus. Every input commits on Enter; every save announces the doc-table AND relational-table writes it caused; corpus URLs get a shared UUID across the `content_items` relational row and any number of `personal_corpus` / `org_corpus` array entries, with in-browser verification confirming the cross-doc id matches; orgs auto-detect on the next attendee from the same domain so the operator stops typing 'Stand Together Foundation' fourteen times. Two new context-v docs — the spec naming the pulse pattern, the issue file capturing the query lenses we'll want once `has_personal_link` observations accumulate. 14 of 177 reach-edu attendees enriched in real use this evening before the operator paused for a safety commit."
publish: true
date_created: 2026-06-16
date_modified: 2026-06-16
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Person-Enrichment
  - Pulse-Pattern
  - Pulse-Dimensions
  - Pulse-Surface
  - SurrealDB
  - Canonical-Layer
  - Cross-Doc-UUID
  - Org-Auto-Detect
  - Per-Field-Save
  - LLM-Corpus
  - RAG
  - Federation
  - Svelte-5
semver: 0.0.4
files_changed:
  - apps/person-enrichment/package.json
  - apps/person-enrichment/rsbuild.config.ts
  - apps/person-enrichment/tsconfig.json
  - apps/person-enrichment/src/index.ts
  - apps/person-enrichment/src/mount.ts
  - apps/person-enrichment/src/App.svelte
  - apps/person-enrichment/src/app.css
  - apps/person-enrichment/src/env.d.ts
  - apps/person-enrichment/src/lib/surreal.ts
  - apps/person-enrichment/src/lib/types.ts
  - apps/person-enrichment/src/pulse-dimensions/NameFields.svelte
  - apps/person-enrichment/src/pulse-dimensions/EmailListField.svelte
  - apps/person-enrichment/src/pulse-dimensions/LinkList.svelte
  - apps/person-enrichment/src/pulse-dimensions/OrgCreate.svelte
  - context-v/specs/Pulse-Pattern.md
  - context-v/issues/Personal-Link-Observations-Need-Query-Lenses.md
  - scripts/surreal-verify-corpus-ids.mjs
  - shell/rsbuild.config.ts
  - shell/src/remotes.ts
  - pnpm-lock.yaml
---

# Person-enrichment surface ships — pulse pattern, per-field saves, auto-detected orgs

## Why Care?

The 177 reach-edu attendees from the Turning-Jobs-Into-Degrees event landed in SurrealDB last night as email-only sparse rows. Tonight they start becoming useful. Open `http://localhost:3015`, pick a person, and turn their row into something a consulting analyst can actually triage from: surname + first_name + full_name, additional emails, LinkedIn URL, Substack, the team page the org has them on, the article the org's communications office published about them, the org itself with its own slug + canonical/conventional name + website + LinkedIn company page + the blog posts they publish. Save as you go — every Enter on a field commits to the canonical layer immediately and stacks a confirmation line showing *which* table got written.

For the corpus URLs that have LLM/RAG futures — every unique URL becomes one row in `content_items` with its own UUID, and that same UUID gets stamped on every `personal_corpus` / `org_corpus` entry that references it across the canonical layer. The browser verifies the cross-doc id matches on every save. When we later wire up an embeddings pipeline, deduplication is free.

For the operator: when you finish Cassie Wood (Stand Together Foundation) and the next Stand Together attendee comes up, the org section pre-fills automatically. The cyan stripe above it tells you *why* — *"matched email domain `standtogether.org` → Stand Together Foundation, Enter to confirm the affiliation."* You stop typing the same org name fourteen times.

It is working. 14 of 177 done in the first evening session, before this changelog.

## What's New?

- **`apps/person-enrichment/`** — a new federated remote at port 3015, registered in the shell as `PERSON_ENRICHMENT_REMOTE` (not in the rotation; reachable via direct navigation). Standalone-runnable: `pnpm --filter @augment-it/person-enrichment dev`.

- **Pulse pattern, named.** [[Pulse-Pattern]] spec defines the three nouns:
  - **`pulse`** — one operator-attention burst against one entity (the conceptual unit, not a class)
  - **`pulse-dimension`** — one independent editable concern, composed against the entity (`NameFields`, `EmailListField`, `LinkList`, `OrgCreate`)
  - **`pulse-surface`** — the parent that loads the entity, hosts the dimensions, collects them on save (`apps/person-enrichment/src/App.svelte`)
  - Future surfaces (`organization-enrichment`, `event-enrichment`) reuse the same dimensions in different orders with different additional ones.

- **Per-field Enter-to-save.** Every input commits on Enter with `e.preventDefault() + e.stopPropagation()`, so the keystroke never reaches the surface and triggers any nav action. Each save announces its targets in a stacked log:

  ```
  ✓  1:05:39  persons (first_name, surname, full_name)
  ✓  1:05:39  persons.personal_links
  ✓  1:05:41  organizations (new row) + affiliations edge (persons→organizations)
  ✓  1:05:58  content_items (019ecefe-…) + organizations.org_corpus    cross-doc ✓
  ```

  Window-level keydown listener (capture phase) handles Enter when focus is NOT in a field — first Enter outside any input pops a "review writes before advancing?" prompt, second Enter (or click `next → (N writes)`) opens a summary panel listing every write from this session, **then** advancing.

- **Cross-doc UUID contract for corpus URLs.** When the operator pastes a URL into `personal_corpus` (Diena's article) AND `org_corpus` (CSU's communicator), both arrays get the same `content_id` pointing at the one `content_items` row for that URL. We `UPSERT content_items WHERE url = $url` on first sight, return the id, stamp it into both doc-side entries. In-browser verification queries `content_items WHERE url = $url` immediately after each corpus save, extracts the UUID portion of both ids (the SDK returns them in inconsistent string formats: `content_items:u'…'` from one path, `content_items:⟨…⟩` from another), and resolves the log row's icon from `…` to `✓` once they match. The standalone `scripts/surreal-verify-corpus-ids.mjs` walks the same contract offline.

- **Org auto-detect on the next attendee.** On `hydrateForm` for each new attendee, `autoDetectOrg()` runs two checks in order:
  1. Is the person already affiliated? `SELECT ->affiliations->organizations.* FROM persons:X` — if yes, pre-fill that org and mark the in-session "affiliations created" flag so we don't double-edge.
  2. Email-domain match — `cwood@standtogether.org` → `standtogether.org` — query `organizations WHERE org_links.*.url_domain CONTAINS 'standtogether.org' OR org_corpus.*.url_domain CONTAINS 'standtogether.org'`. If exactly one match, pre-fill. Personal email domains (`gmail.com`, `yahoo.com`, etc.) are skipped — they don't identify an org.

- **`content_items` table + UNIQUE INDEX on url.** Schema-less but with the one constraint that matters: no two rows for the same URL. The verifier script defines them idempotently on every run.

- **`Personal-Link-Observations-Need-Query-Lenses.md`** — new context-v issue capturing the query lenses we anticipate once `has_personal_link` observations accumulate (per-person rollup, per-domain corpus rollup as the lens onto [[Funder-Content-Corpus]], kind-filtered slice for "all substacks across reach-edu"). Resolution deferred until friction hits.

## How it Works

### The shape of one pulse-surface

```
┌─ event header ───────────────────────────────────┐
│ Turning Jobs into Degrees …              14/177  │
├─ pulse card ─────────────────────────────────────┤
│ email   cwood@standtogether.org                  │
│ source  gatsby-events                            │
│ gatsby  open gatsby table                        │
│ ↗ google …      ↗ duckduckgo                     │
│                                                  │
│ NAME                                             │
│   full_name [Cassie Wood    ]   ← Enter saves   │
│   first_name [Cassie] surname [Wood]             │
│                                                  │
│ ADDITIONAL EMAILS                                │
│   [+ add email]                                  │
│                                                  │
│ PERSONAL LINKS                                   │
│   [linkedin.com/in/cassie-…]  linkedin_profile  ×│
│   [+ add link]                                   │
│                                                  │
│ PERSONAL CORPUS (content for LLM/RAG)            │
│   [+ add link]                                   │
│                                                  │
│ ✓ Org pre-filled — matched email domain         │
│   standtogether.org → Stand Together Foundation  │
│                                                  │
│ ORGANIZATION                                     │
│   complete_name [Stand Together Foundation]      │
│   conventional_name [Stand Together]             │
│   → find or create by slug: stand-together-fdn   │
│                                                  │
│   ORG LINKS                                      │
│     [standtogether.org]  website  ×              │
│     [+ add link]                                 │
│                                                  │
│   ORG CORPUS                                     │
│     [linkedin.com/company/…]  linkedin_company × │
│     [+ add link]                                 │
│                                                  │
├─ actions ────────────────────────────────────────┤
│ ← back   Enter saves field   next → (7 writes)   │
├─ stacked save log ───────────────────────────────┤
│ ✓ 1:05:39 persons (first_name, surname, full…)   │
│ ✓ 1:05:39 persons.personal_links                 │
│ ✓ 1:05:41 organizations (new row) +              │
│           affiliations edge (persons→organiz…)   │
│ ✓ 1:05:43 organizations.org_links                │
│ ✓ 1:05:58 content_items + organizations.org_cor… │
│   cross-doc ✓                                    │
└──────────────────────────────────────────────────┘
```

Voice: monospace throughout, all Tier-2 theme tokens (no hex), accent-magenta for headers, accent-cyan for the auto-detect stripe, ok-green for the save log, error-red reserved for actual mismatches.

### What writes happen on one save click

Operator pastes Stephen Allison into `full_name`, hits Enter:

```sql
UPDATE persons:⟨X⟩ SET
  first_name      = "Stephen",
  surname         = "Allison",
  full_name       = "Stephen Allison",
  client_access   = array::union(client_access ?? [], ["reach-edu"]),
  last_touched_by = "reach-edu",
  last_touched_at = time::now();
```

1 round-trip. Save log: `✓ persons (first_name, surname, full_name)`.

Operator pastes Stephen's LinkedIn URL into personal_links, hits Enter — auto-infer says `linkedin_profile` — 1 round-trip, log: `✓ persons.personal_links`.

Operator types `Philanthropy Roundtable` in org complete_name, hits Enter. We slug-search organizations:

```sql
SELECT id FROM organizations WHERE slug = "philanthropy-roundtable" LIMIT 1;
```

Hit. Refresh the names (one UPDATE), then RELATE the affiliations edge:

```sql
RELATE persons:⟨X⟩->affiliations->organizations:⟨Y⟩ SET
  kind     = "operator-confirmed",
  added_at = time::now(),
  client   = "reach-edu";
```

`affiliationCreated = true` for the session. Log: `✓ organizations (existing — refreshed names) + affiliations edge`.

Operator pastes a Stephen article URL into personal_corpus, hits Enter. URL not in `content_items` yet:

```sql
CREATE content_items SET
  id = rand::uuid::v7(),
  url = "https://…",
  url_domain = "philanthropyroundtable.org",
  kind = "blog_post",
  first_seen_at = time::now(),
  last_referenced_at = time::now(),
  reference_count = 1
RETURN id;
```

Get back `content_items:⟨019ef033-…⟩`. Stamp that id into the entry:

```sql
UPDATE persons:⟨X⟩ SET
  personal_corpus = array::concat(personal_corpus ?? [], [{
    url:        "https://…",
    kind:       "blog_post",
    url_domain: "philanthropyroundtable.org",
    added_at:   time::now(),
    content_id: content_items:⟨019ef033-…⟩
  }]),
  client_access = array::union(client_access ?? [], ["reach-edu"]),
  ...;
```

Fire-and-forget verification query: `SELECT id FROM content_items WHERE url = $url` — extract UUID, compare to the just-stamped content_id, resolve `…` → `✓` on the log row.

### Why query by URL not by record id

The `surrealdb@2.0.3` browser SDK returns record ids in different string formats depending on the call path. From a `RETURN id` post-CREATE you get `content_items:u'019ecefe-…'`. From a subsequent `SELECT id FROM content_items WHERE url = $url` you might get `content_items:⟨019ecefe-…⟩`. Same UUID, different wrapper. The naive `String(a) === String(b)` compare fails. Bug visible in the wild this evening — the operator pinged us with two `✗ mismatch` log rows on real Stand Together saves that *were* actually consistent. Fix landed: pull just the canonical UUID portion via regex from both sides, compare those. Query by URL (the stable, indexed, unique field) rather than by record id (the wrapper-dependent string).

### Why the per-field commit beat the batched save

The first version of the save logic batched everything to a `save + next` button. The operator's first reaction: *"I just hit enter on Diane Mosely and it went to the next person — I didn't even get the data in."* The Enter that was supposed to save the name field was also activating the primary button via the implicit form-submit behavior browsers carry forward from forms made of `<input>` + `<button>` even outside a `<form>`. Two fixes ran together: `stopPropagation` on every input handler, AND a window-level capture-phase listener that handles Enter only when focus is NOT in a field. The capture phase matters — it sees the Enter before any default button activation could.

Then the operator asked for receipts: *"a message should show up and ask to confirm, if I hit enter AGAIN it should perform the final save/write."* That landed as a two-stage advance: first Enter outside a field surfaces a prompt; second Enter (or click `next →`) opens the summary panel; a third Enter (or click `confirm + next →`) actually advances. Three explicit commits, three opportunities to bail.

## Under The Hood

### Tables and arrays touched by one full enrichment session

```
persons:⟨X⟩            ─ identity fields + nested arrays
  ├─ first_name, surname, full_name, emails
  ├─ personal_links: [{ url, kind, url_domain, added_at }]
  └─ personal_corpus: [{ url, kind, url_domain, added_at, content_id }]
                                                            │
content_items:⟨c⟩      ─ ONE row per unique URL              │
  ├─ url (UNIQUE INDEX)                                      │
  ├─ first_seen_at, last_referenced_at, reference_count      │
  └─ id  ←──── stamped into doc arrays above ────────────────┘
                                                            ┌────
organizations:⟨Y⟩      ─ identity + nested arrays            │
  ├─ complete_name, conventional_name (slug derives)         │
  ├─ org_links:  [{ url, kind, url_domain, added_at }]       │
  └─ org_corpus: [{ url, kind, url_domain, added_at, content_id ─┘
                                                            │
affiliations:⟨e⟩       ─ GRAPH EDGE (RELATION table)         │
  ├─ in:  persons:⟨X⟩                                        │
  ├─ out: organizations:⟨Y⟩                                  │
  └─ kind, added_at, client                                  │
```

Per-save round-trip count:
| Action | Round-trips | Targets |
|---|---:|---|
| Enter on name field | 1 | persons (3 fields + client_access + touch metadata) |
| Enter on email row | 1 | persons.emails |
| Enter on a personal_links URL | 1 | persons.personal_links |
| Enter on a personal_corpus URL | 2 + 1 verify | content_items (UPSERT) + persons.personal_corpus + read-back verify |
| Enter on org name (new org) | 1 SELECT + 1 CREATE + 1 RELATE | organizations + affiliations edge |
| Enter on org name (auto-detected) | 0 SELECT + 1 RELATE | affiliations edge only |
| Enter on org_links URL | 1 | organizations.org_links |
| Enter on org_corpus URL | 2 + 1 verify | content_items (UPSERT) + organizations.org_corpus + read-back verify |

### Where the design crystallized as the operator typed

The session started with batched saves and a single "save + next" button. Six progressive corrections from the operator reshaped the surface:

1. *"having fields/forms don't really work. I just need to click a button and add them."* — Default-empty arrays, no pre-rendered empty input row. `+ add` button only.
2. *"with full_name I should be able to paste the full name and have it infer first_name and surname."* — Single full_name input parses to first_name + surname (last whitespace-delimited word is surname). Three fields, all bidirectional.
3. *"NO I should be able to edit the first_name, surname separately, or paste the whole thing."* — Both full_name and first_name + surname remain editable; full_name input feeds back into the parts via `oninput`, the parts feed back into full_name via `$effect`.
4. *"Pick an existing org? Absolutely not — the entire thing we just discussed was the ability to create an organization on the fly."* — Dropped the org dropdown. Operator types names; the surface does find-or-create-by-slug silently.
5. *"Why are you making a dropdown for link type? It should be totally flexible. I had to pick linkedin from a dropdown. I should just be able to add them and move on."* — Kind dropdown deleted. Operator pastes URLs; kind auto-infers from URL pattern and shows as a small read-only badge next to the input. Title field deleted entirely.
6. *"This form is fucking ugly, it doesn't stick with any of our design system. Our design system is tight, you are off script."* — Full visual rewrite against the Tier-2 token system. Monospace throughout (`var(--font-mono)`), namespaced selectors (`pe-*` for surface, `pd-*` for dimensions), uppercase accent-colored section headers, surface cards with `var(--fx-card-shadow)`, inputs with `var(--color-field)` + accent-2 focus outline. Zero hex, zero sans-serif.

### Things named explicitly so they don't drift

- **No fuzzy matching across clients.** humain-vc's 882 LinkedIn-network persons and reach-edu's 177 attendees have zero overlap by construction. `OrgCreate` defaults to `create`, not `match-then-create`. Same-human-across-clients is a `same_as` predicate we'll add when it's a real instance.
- **Hardcoded event slug for v0.** The surface takes `2026-05-21-turning-jobs-into-degrees` as a constant. Event-picker is v0.0.0.2 work.
- **Browser-side SurrealDB SDK for v0.** Credentials baked into the bundle at build time from `.env` via rsbuild's `source.define`. Single-operator local-dev posture. A proxy service replaces this when a second operator joins or production becomes a thing.
- **One predicate per fact-log slice, kind in qualifiers.** Not 11 predicates for 11 link kinds. `has_personal_link` covers everything URL-shaped about the person; `has_org_link` everything about the org; `kind` discriminates. The vocabulary grows by adding to the dropdown's option list — schema doesn't move.

## What's Next

The data flowing in tonight is already enough to power some derivative queries the [[Personal-Link-Observations-Need-Query-Lenses]] issue catalogued:

- **All substacks across reach-edu's network.** `SELECT object, qualifiers.url FROM observations WHERE predicate = "has_personal_link" AND qualifiers.kind = "substack"` — *(when we migrate the doc-arrays into observation form for the lens query)* OR equivalent on `persons.personal_links` directly.
- **All corpus from philanthropyroundtable.org.** `SELECT * FROM content_items WHERE url_domain = "philanthropyroundtable.org"` — feeds an embeddings pipeline.
- **Who do we know at Stand Together?** `SELECT <-affiliations<-persons.* FROM organizations:⟨standtogether⟩` — the graph traversal makes this trivial.

Operator continues at 14 of 177. Each subsequent attendee from a previously-saved org should auto-detect cleanly — that's the working hypothesis the next 163 saves will test.

Sibling slices that build on what landed:

- A small `personal_email_domains` table on SurrealDB so the auto-detect's skip-list is data, not code.
- A second pulse-surface — `apps/organization-enrichment/` — that takes an `organizations:⟨X⟩` as primary input and lets the operator enrich the org's fields + corpus more deeply without going through a person.
- Hoist the four pulse-dimensions to a shared `@augment-it/pulse-dimensions` package once the second surface needs them.
- A `personal_links` lens surface that surfaces the accumulated URLs — substacks, blogs, podcasts — as a worklist for "look at content these people are producing."

## Files Changed

New federation remote — `apps/person-enrichment/`:

- `package.json`, `tsconfig.json`, `rsbuild.config.ts`
- `src/index.ts`, `src/mount.ts`, `src/env.d.ts`, `src/app.css`
- `src/App.svelte` (the pulse-surface)
- `src/lib/surreal.ts` (browser SDK connect + helpers)
- `src/lib/types.ts` (Person, Organization, EventRow, Link, LinkKind)
- `src/pulse-dimensions/NameFields.svelte`
- `src/pulse-dimensions/EmailListField.svelte`
- `src/pulse-dimensions/LinkList.svelte`
- `src/pulse-dimensions/OrgCreate.svelte`

Shell registration — federation as `personEnrichment` at port 3015:

- `shell/rsbuild.config.ts` (remote registration)
- `shell/src/remotes.ts` (PERSON_ENRICHMENT_REMOTE entry)

Context-v:

- `context-v/specs/Pulse-Pattern.md` (new — names pulse / pulse-dimension / pulse-surface)
- `context-v/issues/Personal-Link-Observations-Need-Query-Lenses.md` (new — query lenses we'll want once the fact log fills up)

Scripts:

- `scripts/surreal-verify-corpus-ids.mjs` (new — offline cross-doc UUID verifier)

Dependencies:

- `pnpm-lock.yaml` (surrealdb pulled into the new remote, already at workspace root)

## See Also

- [[Sparse-Person-Enrichment-Surface]] — the spec the surface implements
- [[Pulse-Pattern]] — the pattern this is the first concrete instance of
- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — the data layer the surface writes to
- [[Client-Tagging-on-Canonical-Writes]] — every write carries reach-edu as the client
- [[Personal-Link-Observations-Need-Query-Lenses]] — the future lenses
- [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] — the chrome parent the surface inherits from
- [[Funder-Content-Corpus]] — the content_items rows feed this corpus when an ingest pipeline lands
- [[Joined-People-UI-and-the-Network-First-Pivot]] — the exploration that made this work obvious two days ago
