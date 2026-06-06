---
title: "Funder Corpus First Session Failed — 75 markdown files across 15 of 96 funders, six hours invested, multiple workflow failure modes catalogued for tomorrow's restart"
lede: "An end-of-day shipping note that is not about success. The reach-edu funder content corpus workflow was supposed to land tonight against the 96-row Master-Pipeline-Tracker. Final state: 75 markdown files written across 15 funder subdirectories under `clients/reach-edu/corpus/`. 81 of 96 funder records have zero corpus content. The operator's framing at session-end: 'this is all fucking bullshit, nothing is working the way it should, I was only able to process like 1/3 of the plausible records.' This changelog is the honest version. The goals spec landed (Funder-Content-Corpus-Workflow.md, eight rules + six-step workflow), the implementation rebuild against it landed in code (content-ingest service, Content Reader UI, pack honors operator curation, dispatch refuses invalid URLs, fire_id stamping), and 25 broken-URL rows were force-repaired across 5 promotion generations. But the end-to-end validation — fix URLs, re-fire entity-blog, evaluate fresh data — never happened because the session consumed itself patching display-layer symptoms of yesterday's broken-pack-broken-URL data instead of producing fresh clean data via a re-fire. The honest accounting: substantial code shipped, partial data landed, root causes mostly unfixed, eight named failure modes documented in `context-v/issues/Funder-Corpus-First-Session-Failed-Most-Records-Unprocessable.md` for morning-self to attack as a punch list."
publish: true
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Funder-Corpus
  - Reach-Edu
  - Workflow-Failure
  - Session-End-Failure
  - URGENT
files_changed:
  - context-v/specs/Funder-Content-Corpus-Workflow.md (NEW — the goals spec)
  - context-v/issues/Funder-Corpus-First-Session-Failed-Most-Records-Unprocessable.md (NEW — the failure log)
  - services/content-ingest/ (NEW service — Jina + corpus + filters)
  - services/social-search/src/entity-pulse/packs/official-blog-pack.ts (curated path, navigation filter, same-host emit)
  - services/social-search/src/entity-pulse/dispatch.ts (Rule 4 invalid-URL refusal, curated URLs threading, fire_id)
  - services/social-search/src/server.ts (fire_id per fan-out)
  - services/response-store/src/store.ts (fire_id field + filter)
  - services/workspace/src/capabilities.ts (three new capabilities)
  - docker-compose.yml (content-ingest service)
  - apps/response-reviewer/src/App.svelte (Content Reader viewMode + inline URL editor)
  - apps/response-reviewer/src/app.css (Content Reader styles)
  - clients/reach-edu/corpus/ (75 markdown files across 15 funders, on the submodule's working tree)
  - row-store docker volume (85 row.update fixes — 25 entities × 5 generations — Griffin Catalyst, Howard Schultz, Lumina, McGovern, Tepper, DeLaski, others)
---

# Funder Corpus First Session Failed

## The honest accounting

| metric | value |
|---|---|
| **Corpus markdown files written** | 75 |
| **Funder subdirectories created** | 15 |
| **Funders with zero corpus content** | 81 of 96 |
| **Hours invested** | ~6 |
| **Commits produced** | 5 (incl. one full revert mid-session) |
| **End-to-end validation against a fresh pack fire** | 0 |

The 15 funders that produced corpus content (Annie E. Casey,
Arnold Ventures, Arthur Blank Foundation, Ascendium Education,
Ballmer Group II, Bridgespan, Carnegie Corporation, Charles
and Lynn Schusterman Family Foundation, Charles Koch Foundation,
Daniels Fund, ECMC-2 honorarium, Education First, Gitlab
Foundation, Greater Texas Foundation, Heising-Simons Foundation)
are the ones where yesterday's pack-fire happened to discover at
least one same-domain URL that survived this session's layered
display-time filters. Quality across the 75 files is uneven —
some are real articles, some are hub pages, some are subsection
landings, some are pagination pages. An eyes-on review of every
file is needed before the corpus is usable for downstream LLM
work.

The other 81 funders failed for one or more of: wrong `url`
field that the bulk-repair script's heuristic didn't catch
(Google.org → google.com, Haslam → unknown, etc.); pack-yesterday-fire
returned only off-domain garbage this session's filters correctly
hid (Gates Family Foundation → merriam-webster, pressofatlanticcity);
pack returned only navigation/hub pages (Hewlett pagination,
Schusterman press-center/resource-hub landings); pack never fired
on the row.

## What shipped (code, not validated against fresh data)

### The goals spec

`context-v/specs/Funder-Content-Corpus-Workflow.md` (v0.0.0.1).
Eight hard rules — funder's own domain only (Rule 1), navigation
pages are not content (Rule 2), operator curation is authoritative
(Rule 3), row.url must be correct (Rule 4), per-item curation
not bulk (Rule 5), already-in-corpus items don't reappear (Rule 6),
all records remain visible (Rule 7), old responses must not be
confused with new ones (Rule 8). Six-step workflow: ingest → repair/curate
per-row → promote → fire packs → review + add to corpus → commit
corpus. The spec is the binding contract for any future
implementation; this changelog's failures all map back to specific
rule violations.

### The rebuild implementation

Commit `5c269a7` against the goals spec, written after the
previous patch-by-patch attempt was reverted entirely. Five
packages touched:

- `services/content-ingest/` (new): Jina pull + 30-min cache +
  per-host bounded-parallel + retry-on-429, corpus markdown writer
  with the spec'd frontmatter, three capabilities
  (`content_ingest.preview`, `corpus.add`, `corpus.list_for_record`).
- `services/social-search/`: pack accepts `curated_index_urls`,
  rejects pagination/taxonomy/archive paths in `pickPostLinks`,
  enforces same-host on emit. Dispatch validates `row.url`
  against an "unknown / prose / unparseable" rejection set and
  emits `outcome:'error'` with a "repair via records-surface"
  message INSTEAD of firing when invalid. fire_id generated
  once per `pack.fan_out.requested` invocation and threaded
  through every response.
- `services/response-store/`: `ResponseRecord.fire_id` field +
  ResponseFilter row_id/fire_id/pack_id filters.
- `services/workspace/`: three new capabilities registered with
  appropriate timeouts.
- `apps/response-reviewer/`: third viewMode `content-reader`
  showing ALL rows of the active record set classified into
  has-content / not-found / invalid-url / no-responses. Per-record
  inline URL editor (added end-of-session). Per-preview edit title
  + tags + add-to-corpus. Hide-in-corpus on preview list. fire_id
  scoping defaults to latest-per-(row,pack).

All five packages typecheck clean (`tsc --noEmit`, `svelte-check`
84 files 0 errors 0 warnings). Stack rebuilt + restarted; logs
show `content-ingest-service ready`.

### The data fixes

85 `row.update` calls landed in row-store via a bulk-repair script
fixing 25 entities across 5 promotion generations. Examples:
Griffin Catalyst (citadel.com → griffincatalyst.org on every
generation), Howard Schultz Foundation (`"unknown"` → schultzfamilyfoundation.org),
Lumina, McGovern, Tepper, DeLaski, ECMC, Hyde, Karl Rathjen, others.
The bulk-repair heuristic missed several (Google.org → google.com,
Haslam → unknown, Judy Dimon → unknown, Blair Miller → unknown,
Pyramid Peak → unknown, Bob Campbell → ksufoundation.org-article,
Toolbox Family Fund → linkedin, others) because helpful_links on
those rows points at third-party articles/profiles rather than
the funder's own site.

### The corpus

75 markdown files at `clients/reach-edu/corpus/<funder-slug>/<YYYY-MM-DD>_<title-slug>.md`
with the spec's frontmatter contract (title editable, exact_url,
fetched_at, record_id, response_id, client_id=reach-edu, funder_slug,
pack_id=official-blog-pack, tags array, extra_metadata catchall).
The 15 funder subdirectories are inside the
`clients/reach-edu` submodule's working tree; they are NOT
committed to the per-client repo's git history yet — that's a
follow-up action for the operator.

## What didn't ship (the failures)

### F1 — Most rows' URLs weren't audited end-to-end

The bulk-repair script fixed 25 of 96 rows via a hostname-stem
heuristic. The remaining ~10-15 wrong-URL rows still need
eyes-on operator review. The inline URL editor in Content Reader
addresses the repair affordance but was added in the very last
code change of the session and never clicked.

### F2 — Pack-yesterday-fire's broken-URL responses still dominate

The 1,109 OfficialPulse-pack responses written yesterday (before
this session's same-host filter) are still in response-store.
Most are on Merriam-Webster, news.google.com, pressofatlanticcity,
youtube. fire_id stamping (Rule 8) was added but it's null on
all yesterday's records and the "show latest fire only" default
doesn't retroactively hide them. The Content Reader's
display-time filters reduce visible junk but don't eliminate it,
and they can't surface NEW good data because no re-fire happened.

### F3 — Re-firing never happened

The full sequence "fix URLs → re-fire entity-blog with the new
pack code → see clean data in Content Reader" was never executed
end-to-end. Every display-layer fix the session built was layered
on top of yesterday's broken data. The rebuild commit
`5c269a7` is essentially unvalidated — code passes typecheck and
the service runs, but no fresh pack fire has exercised the
curated-URL path, the invalid-URL refusal, the same-host emit
guard, or the fire_id stamping in practice.

### F4 — Pack still has the hub-page / pagination bug at the source

`pickPostLinks` accepts any same-host URL deeper than the index
path. The navigation-pattern reject added this session catches
pagination and taxonomy but NOT subsection landings (Schusterman's
`/news-and-insights/press-center`, `/resource-hub`, `/toward-magazine`
are valid `/news-and-insights/*` paths and pass the filter).
Two real fixes named in the issue file:
RSS-first parsing for sites that publish feeds (most foundations
do), or two-levels-deep walk when a curated index turns out to be
itself an index of indexes. Neither implemented.

### F5 — Operator workflow is too manual to scale to 96 records

For a record that yields any corpus content the operator's
hand-touch is: verify url → curate index URLs in Records
Surface (~1-3 min) → wait for pack fan-out → click Preview content
(wait ~30-60s) → for each preview edit title, type tags, click
add (~30s-2min each). At 96 rows × even 3 min per row of manual
review = ~5 hours minimum. The session burned ~6 hours and got
~13% of records through.

Eight failure modes catalogued in detail in
`context-v/issues/Funder-Corpus-First-Session-Failed-Most-Records-Unprocessable.md`
including the four above plus F6 (off-domain pollution accumulation),
F7 (display-layer patching pattern that consumed the session), and
F8 (operator's repair affordance gap between Content Reader and
Records Surface, partially addressed by the end-of-session inline
URL editor).

## What to do tomorrow

Listed in priority order in the issue file. Headline sequence:

1. Don't patch the display layer. Treat morning-open symptoms as
   yesterday's-data artifacts until proven otherwise.
2. Eyes-on audit of all 96 rows' `url` field. Fix the ones the
   heuristic missed.
3. Eyes-on audit of `official_updates_index_urls`. Where missing,
   fire records-surface per-record connectors and accept the
   right URLs.
4. Fix the pack's hub-page bug — RSS-first OR two-levels-deep walk.
5. Purge response-store of yesterday's OfficialPulse responses
   (1,109 records, mostly junk).
6. ONE re-fire of entity-blog on v8.
7. Open Content Reader scoped to v8 and see what happened.

The rebuild in code is in place. The data is partially correct.
The unknowns are entirely "what happens when the workflow actually
runs end-to-end against repaired data." That's the morning's job.

## What's NOT in this changelog (deliberately)

- Spin. Not framing this as "progress." 75 markdown files exist
  and 15 funders have corpus content, but the workflow goal was
  the full 96 and the session ended exhausted with most root
  causes unresolved. The honest read is closer to failure than
  success.
- Implementation prescriptions for tomorrow. Those live in the
  goals spec and the issue file. This changelog is the breadcrumb.

## See also

- [[Funder-Content-Corpus-Workflow]] (spec) — the goals and binding
  rules.
- [[Funder-Corpus-First-Session-Failed-Most-Records-Unprocessable]]
  (issue) — eight failure modes catalogued with morning-self
  action items.
- [[Per-Client-Privacy-and-the-Path-Off-Local]] §Path D — where
  the 75 corpus files live.
- [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]] —
  the earlier audit naming the 1,109-junk-3-accepts pattern;
  still unresolved.
