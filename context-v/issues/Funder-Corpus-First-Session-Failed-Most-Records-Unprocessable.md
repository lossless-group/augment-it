---
title: "Funder Corpus First Session Failed — 75 markdown files across 15 of 96 funders, 81 records unprocessable, hours spent layering filters on stale data instead of producing clean fresh data, rebuild against the goals spec exists in code but was never validated against a real pack fire because the session ended"
lede: "Six hours produced 75 corpus files across 15 of 96 funders — 81 records still have nothing. This is the failure-mode list for morning-self."
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-05 — Initial draft, written end-of-session at operator's explicit request. Captures real numbers (75 markdown files, 15 funders, 81 of 96 records empty) and the specific failure modes that consumed the session.
tags:
  - Issue
  - Augment-It
  - Funder-Corpus
  - Workflow-Failure
  - Session-End-Failure
  - Reach-Edu
  - URGENT
status: Open · First Session Failed · Rebuild Unvalidated · Multiple Root Causes Outstanding
site_uuid: e814af34-132c-4f27-bec2-913499133761
hex_code: 4kyq9q
date_authored_initial_draft: 2026-06-05
date_authored_current_draft: 2026-06-05
---

# Funder Corpus First Session Failed

## What was supposed to happen

The session goal was to populate the per-client funder content corpus
for reach-edu by firing `entity-blog` (one pack: `official-blog-pack`)
against the 96-row Master-Pipeline-Tracker, previewing the discovered
articles per record in Response Reviewer, and adding the relevant
items as markdown files in `clients/reach-edu/corpus/<funder-slug>/`.

## What actually happened

| | |
|---|---|
| Corpus markdown files written | **75** |
| Funder subdirectories created | **15 of 96 funders** |
| Funders with zero corpus content | **81** |
| Hours invested | ~6 |
| Commits produced | 5 (incl. one full revert mid-session) |
| Number of times code was patched, surface inspected, code re-patched | lost count |
| Validations of the final rebuild against a fresh pack fire | **0** |

The 15 funders that produced corpus content are the ones whose
pack-yesterday-fire happened to discover at least one same-domain
URL that survived the layered display-time filters. Most of those
75 markdown files are hub pages, section landings, and a small
minority of real articles. Quality of what was actually added to
corpus is uneven and a second pass — eyes on every file — is
needed before the corpus is usable for downstream LLM work.

The other 81 funder records produced no corpus because of one or
more of: wrong `url` field (citadel.com for Griffin Catalyst,
google.com for Google.org, `"unknown"` for ~14 rows), URL repair
script missed them, pack-yesterday-fire returned only off-domain
garbage that this session's filters correctly hid, pack
returned only navigation pages (pagination, taxonomy, archives,
section landings — Schusterman, Hewlett), pack-yesterday-fire never
ran on the row, or some combination.

## Specific failure modes that consumed the session

These are the bugs and friction points that ate the night. Listing
them flat so morning-self can attack them as a punch list rather
than re-discovering them.

### F1 — Row.url is wrong on ~25% of rows and the repair process is too manual

The audit on v8 found 23 of 96 rows (24%) with broken `url` field —
"unknown" sentinel strings, LLM-prose-with-URL-buried-mid-sentence,
wrong-entity URLs (Griffin Catalyst → citadel.com; Google.org →
google.com), articles-about-the-entity-not-the-entity's-site (Bob
Campbell → ksufoundation.org article; Haslam → tn.gov article). The
session's bulk-repair script fixed 25 entities × 5 generations =
~85 row.update calls based on a heuristic (helpful_links hostname
contains entity-name word). Several rows still have wrong URLs
because the heuristic only catches the obvious cases. Google.org's
`url = google.com` was caught only after the operator noticed
news.google.com pollution. Every wrong URL requires either
heuristic-matching that misses cases, or eyes-on operator review of
all 96 rows. The inline URL editor in Content Reader (added in
the very last code change of the session) addresses the repair
affordance but the operator never ran it against the data.

### F2 — Pack uses operator-curated URLs only as of the final-final patch

`row.fields.official_updates_index_urls` is populated for ~45 rows
from the operator's earlier records-surface per-record connector
work (Schusterman's 3 URLs, AECF's 2, Arnold Ventures' set, etc.).
Until the final rebuild commit, the pack ignored these and
re-discovered indexes via SerpApi. The re-discovery returned
off-domain garbage (Merriam-Webster for Gates Family Foundation,
pressofatlanticcity.com, pressccc.com), hub-page subsection
landings (Schusterman /press-center, /resource-hub instead of the
articles inside them), and pagination pages (Hewlett /page/2/,
/page/190/). The fix to honor curated URLs landed but was never
validated against a real fire.

### F3 — Pack returns hub pages, not articles, on the rows that "worked"

Even on the 15 funders that produced corpus content, what got
added is often a hub page rather than an article. Schusterman's
"Press Center" / "Press Kit" / "Resource Hub" / "Toward Magazine"
corpus entries are section landings, not articles. Hewlett's
`/latest-updates/page/2/` was being returned as a "post" by
`pickPostLinks`. The pack's heuristic accepts any same-host URL
deeper than the index path, which includes pagination, sub-section
landings, taxonomy pages, etc. The navigation-pattern reject added
late in the session would have caught pagination + taxonomy but
NOT sub-section landings. Sub-section landings would need a
two-levels-deep walk: scrape the curated index, find its
sub-section URLs, scrape each, harvest article links from each.
~30 lines of pack code; not done.

### F4 — RSS feeds where they exist were not parsed

Most foundation sites publish RSS at `/feed/`, `/rss/`, or
`/feed.xml`. The pack has `parseRssFeed` infrastructure used as a
secondary date-source but does NOT recognize feed-shaped index URLs
and parse them as the PRIMARY content source. Foundations like
Hewlett, Bridgespan, and AECF all have RSS that would yield clean
article URLs + titles + dates + summaries with zero scraping. Not
implemented.

### F5 — Off-domain pollution accumulated in response-store from yesterday's fires

Yesterday's pack-fire (before this session's same-host filter) wrote
1,109 OfficialPulse pack responses to response-store. Many of those
were on Merriam-Webster, pressofatlanticcity, news.google.com, etc.
Even with the same-host filter in the UI, the operator's preview
list kept surfacing yesterday's stale junk because of how
record-set scoping interacts with response-store row_ids. fire_id
stamping was added end-of-session but doesn't retroactively label
the stale responses; the UI's "show only latest fire" defaults to
"include responses where fire_id is null" which means yesterday's
garbage stays visible until response-store is purged or the data
is migrated.

### F6 — Re-firing never happened in this session

The full sequence "fix URLs → re-fire entity-blog with the new pack
code → see clean data in Content Reader" was never executed. Every
display-layer fix the session built was layered on top of
yesterday's broken-pack-broken-URL-corrupted response-store data.
The operator correctly identified the pattern mid-session ("we keep
filtering the same wrong stuff") but the conversation didn't
re-direct to "re-fire then evaluate" — instead it continued patching
the display layer. The rebuild against the goals spec exists in
code (commit 5c269a7) but has never been exercised against a real
pack fire.

### F7 — Operator workflow requires more manual steps than is feasible at 96-row scale

For each record that yields any corpus content, the operator's
hand-touch sequence is currently:

1. Verify the row's `url` is correct; if not, repair via Records
   Surface (or now the inline editor in Content Reader).
2. Verify the row has `official_updates_index_urls` curated; if
   not, fire per-record connectors via Records Surface and accept
   the right URLs. (~1-3 min per record when discovery works,
   longer when it doesn't.)
3. Wait for entity-blog pack fan-out to complete.
4. Open Content Reader, click Preview content on the row, wait
   ~30-60s for Jina-fetches.
5. For each preview, edit the title, type tags, click "+ add to
   corpus." (~30s-2min per item × N items per record.)
6. Decide which non-added items to leave behind; their absence is
   the absence of a decision (Rule 5).

The math at 96 records × even 3 minutes per record of manual
review = ~5 hours minimum. The session burned ~6 hours and only
got ~13% of records through the full sequence. The workflow
needs significant automation OR per-batch operator-curation
shortcuts (bulk-accept-all-from-this-domain, auto-add-when-confidence-high,
preview-and-add-in-one-click) before it can land 96 records in a
single session.

### F8 — Repeated context-loss / patch-chasing

The session pattern of "operator surfaces a symptom → agent adds
a filter to hide the symptom → operator surfaces the next symptom"
consumed hours that should have been spent on the underlying
fixes (re-fire with clean inputs, fix the pack's hub-page bug,
parse RSS where available). The agent's failure mode was "good at
building coherent big things from scratch, not good at
troubleshooting small things" — operator named this explicitly
at the moment of revert. The rebuild from the goals spec was the
correct response but happened after most of the session was
already spent.

## What's working (so this issue isn't entirely a void)

These pieces are in place and validated. Not nothing.

- **The 75 corpus markdown files exist.** They have the spec'd
  frontmatter (title, exact_url, fetched_at, record_id, response_id,
  client_id, funder_slug, pack_id, tags, extra_metadata catchall),
  they're inside the per-client repo's working tree, and the
  filenames follow `<YYYY-MM-DD>_<title-slug>.md`. Quality is
  uneven but the shape is right.
- **The content-ingest service runs end-to-end.** Jina-pull,
  30-min cache, per-host bounded-parallel + retry-on-429, file
  write with collision-resistant suffix.
- **The goals spec exists** (`context-v/specs/Funder-Content-Corpus-Workflow.md`)
  with eight hard rules and a six-step workflow. It's the binding
  contract for what should be built.
- **The rebuild in code** (commit 5c269a7) implements the rules:
  pack honors operator curation, dispatch refuses invalid URLs,
  same-host + navigation filters at the source, fire_id stamping
  for distinguishing new fires from old, Content Reader shows
  ALL 96 rows with status classification (has-content / not-found /
  invalid-url / no-responses), per-record inline URL editor.
- **The data fixes** from the bulk-repair script (25 entities × 5
  generations) are in row-store. Griffin Catalyst now has
  griffincatalyst.org on every generation; same for Howard
  Schultz, Lumina, McGovern, Tepper, DeLaski, Schultz Family
  Foundation, etc.

What's NOT working is the end-to-end validation of all that
against a real fresh pack fire.

## What to do tomorrow (morning-self read this first)

In order of leverage:

1. **Don't patch the display layer first.** Whatever the
   symptoms in Content Reader are at morning open, treat them as
   yesterday's-data artifacts until proven otherwise.
2. **Audit every row's `url` field by eye.** Open the v8 record
   set in Records Surface (or write a quick script that lists
   `row_id`, `Prospect / Organization`, `url`, `official_updates_index_urls[0]`).
   Eyes-on the full list. Fix the ones the heuristic missed
   (Google.org → google.org, Haslam → ??, Bob Campbell → ??,
   Judy Dimon → ??, Blair Miller → ??, etc.) via the inline
   editor in Content Reader or directly in Records Surface.
   Target: 96 of 96 rows have a correct `url` field.
3. **Audit every row's `official_updates_index_urls`.** Where
   it's missing, fire per-record connectors via Records Surface
   and accept the right URLs. Schusterman / AECF / Arnold /
   Bridgespan already have curated. Many others don't.
4. **Fix the pack's hub-page bug.** Two paths, pick one:
   - **RSS-first**: when the curated index URL ends in `/feed`,
     `/rss`, or `/atom.xml`, parse the feed XML directly and emit
     items from each `<item>` / `<entry>`. Cleaner data than
     scraping HTML.
   - **Two-levels-deep walk**: when scraping a curated index
     returns links that are themselves index-shaped (Schusterman's
     `/news-and-insights` → `/press-center`, `/toward-magazine`),
     scrape THOSE one level deeper and harvest article links from
     each.
   - Or both.
5. **Purge response-store of yesterday's OfficialPulse responses.**
   1,109 records of mostly junk. Either delete-by-pack_id filter,
   or backfill them with fire_id=`legacy_pre_2026-06-05` and have
   the UI default-hide them.
6. **Then re-fire entity-blog on v8.** ONE fire. fire_id will
   stamp. Don't touch the UI or pack code until you see the
   results.
7. **Open Content Reader scoped to v8.** Either it's transformed
   (rows with curated URLs now show real articles, others show
   correct "not_found" because no curation) or it's still broken
   in a different way. If still broken, the bug is in one of the
   fixes from steps 4-5 and the patch should be at that layer,
   not display.

## Open questions still unresolved

1. **Does the inline URL editor actually save through?** Code was
   written end-of-session. Never clicked by the operator.
2. **Does the curated-URL path in the pack actually skip
   discovery?** Code was written; never fired.
3. **Does fire_id scoping actually hide yesterday's data in
   Content Reader?** Code was written; never tested because no
   new fire happened.
4. **Are the 75 corpus files actually useful?** Eyes-on review
   needed. Some will be section-landing junk; some will be real
   articles. Unknown ratio.

## See also

- [[Funder-Content-Corpus-Workflow]] — the goals spec. Eight rules,
  six-step workflow. The binding contract for what should be built.
- [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]] — the
  earlier session's audit naming the 1,109-junk-3-accepts pattern
  in response-store. F5 above is the same issue, still unresolved.
- [[Incorrect-Base-URLs-on-a-Real-Minority-of-Records]] —
  documented mid-session but reverted with everything else. The
  Rule 4 problem (24% of rows have wrong url) is what F1 above
  is.
- [[Augment-Transformations-Not-Reliably-Persisting]] — earlier
  audit; partial root cause of F1.
- [[Per-Client-Privacy-and-the-Path-Off-Local]] §Path D — where
  the 75 corpus files live (`clients/reach-edu/corpus/`).
