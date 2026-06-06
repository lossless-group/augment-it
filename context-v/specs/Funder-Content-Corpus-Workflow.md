---
title: "Funder Content Corpus Workflow — what the system has to do, ranked by quality bar, with no implementation prescribed"
lede: "Tonight's session went sideways because the implementation got ahead of an explicit shared statement of goals. This spec captures the goals — what the operator wants the funder-content augmentation workflow to actually produce, in what shape, with what quality bar — without prescribing how. Any future implementation choices (refactoring the pack, evolving Content Reader, swapping connectors, adding curation surfaces) must measure themselves against these goals. The deeper failure mode tonight was a class of fixes that filtered yesterday's bad data tighter at display time instead of producing today's good data via a fresh fire; the goals here are written so a future agent can resist that pull. Treat the prior specs ([[Response-Reviewer-Shell-and-Content-Reader-Mode]], [[Flow-for-Bundles-Packs]], [[Entity-Pulse-Bundle]]) as compatible siblings — this spec sits at the level of 'what we want,' those describe pieces of the 'how.'"
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-05 — Initial draft. Written at the end of a long session that produced a working but not-fit-for-purpose result; operator's call was to revert tonight's uncommitted code and restart from these goals.
tags:
  - Spec
  - Augment-It
  - Funder-Corpus
  - Per-Record-Augmentation
  - Quality-Bar
  - Goals
  - Reach-Edu
status: Draft
---

# Funder Content Corpus Workflow

## What we are actually trying to produce

For each client (today: reach-edu; later: Laerdal and others), a
private repository of markdown files containing **content from each
funder's official update channels** — their news index, blog,
grants announcements, press center, newsroom, magazine, stories
archive. The corpus exists to support two downstream uses:

1. Cross-funder fundraising-strategy synthesis (analyze priorities,
   styles, programs across many funders at once).
2. Per-funder outreach customization (cite their own recent work,
   match their language, demonstrate alignment).

Per-client privacy isolation lives in the per-client repo
([[Per-Client-Privacy-and-the-Path-Off-Local]] §Path D). The
corpus shape lands as
`clients/<client>/corpus/<funder-slug>/<YYYY-MM-DD>_<title-slug>.md`
with the frontmatter contract from
[[Response-Reviewer-Shell-and-Content-Reader-Mode]] §Corpus markdown
shape.

This spec captures the WORKFLOW that produces those files — what
data flows through the system, what each step has to honor, and
where the operator has authority.

## The hard rules — quality bar that any implementation must meet

Stated bluntly so they can't be diluted by patches:

### Rule 1 — The funder's own domain is the only valid domain

"Literally anything not on the funder's domain is invalid and spam"
— operator, 2026-06-05.

A piece of content goes into the funder's corpus ONLY when its URL's
hostname matches the funder's official hostname (or a subdomain of
it). No exceptions for "well-known publishers," no exceptions for
press wires, no exceptions for Google News, no exceptions for
third-party news sites that mention the funder. If `aecf.org` is
Annie E. Casey's domain, the only legal corpus URLs for AECF are
`aecf.org` and `*.aecf.org`. Period.

**This rule applies at three layers and any one of them is
sufficient to enforce it:**

- The pack must not emit responses on off-domain URLs.
- The preview server (content-ingest or equivalent) must not fetch
  off-domain URLs.
- The review UI must not display off-domain URLs as previewable.

A future implementation MAY choose to enforce at only one layer for
simplicity, but enforcement at the pack layer is preferred because
it stops the bad data at the source instead of letting it
accumulate in the store and then filtering it on display.

### Rule 2 — Navigation pages are not content

Pagination (`/page/N/`), taxonomy (`/category/X/`, `/tag/X/`,
`/topic/X/`, `/author/X/`), archives (`/archive/`, `/YYYY/`,
`/YYYY/MM/`), feeds (`/feed/`, `/rss/`, `/atom.xml`), and section
landing pages (`/news/`, `/press/`, `/news-and-insights/press-center`)
are NOT articles and never belong in the corpus. They might appear
as INDEX URLs (the operator-curated starting points the pack walks
INTO), but they themselves are not corpus content.

The Hewlett `/latest-updates/page/2/`, `/page/3/`, `/page/190/`
case and the Schusterman `/news-and-insights/press-center`,
`/resource-hub`, `/press-center/press-kit` case both violated this
rule. Any implementation must reject these shapes BEFORE the
operator sees them.

### Rule 3 — Operator curation is authoritative

When the operator has curated `official_updates_index_urls` on a
row via the records-surface per-record connector flow, those URLs
are the INDEXES the pack walks into. The pack must not "improve"
them by re-discovering, must not "augment" them with SerpApi
backfill, must not "broaden" them with path-guessing. The operator
has already done the discovery; the pack's job is the next step
(harvest article links from inside the curated indexes).

The pack MAY fall through to discovery (SerpApi + homepage scrape +
path-guess) only when `official_updates_index_urls` is empty for the
row. That fallback path is for rows the operator hasn't curated yet.

### Rule 4 — The row's `url` field must be the funder's correct domain

If `row.fields.url` is wrong, every downstream step is poisoned —
the pack searches the wrong domain, returns wrong-entity results,
and the operator wastes time triaging garbage. Examples observed
2026-06-05:

- Griffin Catalyst: `url = "https://www.citadel.com"` (Ken Griffin's
  hedge fund, not the foundation)
- Google.org: `url = "https://www.google.com"` (Google's main search
  engine, not google.org)
- Howard Schultz Foundation, Lumina, ~20 others: `url = "unknown"`
- Colorado Succeeds: `url` field contains LLM prose with the URL
  buried in a paragraph

The system must surface these rows to the operator for repair and
must NOT silently use them for pack fires. See [[Incorrect-Base-URLs-on-a-Real-Minority-of-Records]]
for the audit; that issue is the systemic statement.

### Rule 5 — The operator decides what enters the corpus, per item

No bulk "ingest everything" step. The operator reviews each
discovered article, optionally edits the title and adds tags, and
explicitly clicks "add to corpus" for each item that belongs. Items
not added simply aren't; their absence from the corpus is the
absence of a decision. Re-triggering preview can re-surface them.

### Rule 6 — Already-in-corpus items don't reappear in preview lists

Once an item has been added to the corpus (its markdown file
exists), it must NOT show up in the operator's preview list on
subsequent reviews. The operator has already decided; making them
re-decide is friction. A future "show items already in corpus"
affordance is fine, but it must be off by default.

### Rule 7 — All records remain visible, even those with zero content

The Content Reader must show every record in the active record set,
including records where the pack found nothing or hasn't been
fired. Records with zero content responses get a clear "no content
yet" affordance (with a suggestion to fire the pack from Pack
Runner, or to fix the row's URL if that's why nothing was found).
Showing only records with existing content responses is misleading
— it hides the work that's left to do.

### Rule 8 — Old responses must not be confused with new ones

When a pack is re-fired with corrected URLs or new filters, the
operator must be able to tell that the NEW responses are different
from the OLD responses still in the store. Either: replace
on re-fire, or version the responses with a fire_id, or surface
"last fire was YYYY-MM-DD" so the operator can scope to recent.
Without this distinction, every "improvement" looks like it had no
effect because the OLD data dominates what's visible.

## The workflow — what flows through the system

These are the steps in order. Implementation details (which
service, which UI, which capability) are deliberately omitted.

### Step 1 — Ingest a record set

CSV/XLSX upload produces a record set. Each row carries an entity
name and (ideally) a primary URL. Many rows will have wrong or
missing URLs from the upload data — that's normal and must be
repaired before pack fires can succeed.

### Step 2 — Repair / curate per-row data

The operator works through the record set in the records-surface
flow:

- Confirms/corrects each row's `url` field (Rule 4).
- Fires per-record connectors (Firecrawl scan, Firecrawl + agent,
  SerpApi) to discover the right index URLs.
- Picks the correct discovered URLs into `official_updates_index_urls`.
  Multiple indexes per row are allowed and expected (a funder may
  have `/news/`, `/blog/`, `/grants/`, all valid; the operator
  accepts each).

This step is the OPERATOR'S CURATION. Every downstream step must
respect it.

### Step 3 — Promote, when curation is sufficiently complete

The operator promotes the record set, producing a new generation.
Promote must preserve the operator's URL fixes (Rule 4) and curated
indexes — not silently overwrite them.

### Step 4 — Fire content packs against the promoted set

A pack-fire (`entity-blog` bundle, single pack `official-blog-pack`)
walks each row's curated indexes and emits article-URL responses
into the response store. Per-row outcomes:

- **Curated path** (operator has `official_updates_index_urls`):
  pack scrapes each curated index, picks article-shaped links
  (Rule 2 rejects), returns one response per article. The
  response's URL is on the funder's own domain (Rule 1 enforced
  at emit time).
- **Discovery path** (operator hasn't curated yet):
  pack uses SerpApi `site:<row_url_host>` + homepage scrape +
  path-guess to find candidate indexes, then walks the same way.
  Off-domain results from SerpApi backfill are rejected (Rule 1).
- **No URL path** (`row.fields.url` is broken):
  pack does NOT fire against this row. Response is a clear
  "url missing or invalid, repair via records-surface" outcome.

### Step 5 — Review per record, preview content, curate to corpus

The operator opens the review surface (today: Content Reader inside
Response Reviewer; future: a dedicated corpus-browser may emerge).
For each record:

- Click "Preview content" — server fetches the body of each
  pack-discovered article URL via Jina, returns title + excerpt +
  fetched-at.
- Optionally edit the title.
- Optionally add tags (free-text for v0.0.1; controlled vocabulary
  later).
- Click "+ add to corpus" — writes a markdown file with the
  spec'd frontmatter to
  `clients/<client>/corpus/<funder-slug>/`.

Already-in-corpus items don't appear in the preview list (Rule 6).
Records with zero pack responses still appear (Rule 7) with a
"fire from Pack Runner" suggestion.

### Step 6 — Commit the corpus and use it

The operator commits the per-client repo's corpus directory. The
markdown files become the input to downstream analysis (cross-funder
strategy LLM, per-funder outreach customization).

## What this spec is NOT trying to decide

- Which service owns the pack-fire orchestration.
- Whether Content Reader is a tab in Response Reviewer or its own
  microfrontend.
- Whether the pack walks index pages with Firecrawl or with raw
  fetch + cheerio.
- Whether Jina is the only content-extractor; equivalents
  (BeautifulSoup-server, Mercury Parser, etc.) may substitute.
- How dedup across re-fires happens at the data-model level.

These are implementation choices. The goals above bind any
implementation choice, but don't dictate one.

## What we tried tonight and why it failed (so the next attempt doesn't repeat it)

Tonight's session built:

- A new `content-ingest` service with Jina-pull + corpus.add +
  corpus.list_for_record capabilities.
- A Content Reader view mode inside `apps/response-reviewer`.
- A same-host filter at three layers (pack, content-ingest, UI).
- A navigation-pattern filter at three layers.
- A subdomain-aware host match.
- A `curated_index_urls` plumbed through pack input.
- 25 row.update fixes to broken url fields (Griffin Catalyst,
  Howard Schultz, etc.).
- A hide-in-corpus filter on previews.

It produced a UI that showed 20 records of 96, mostly with hub-page
junk from yesterday's pack fire, and the operator's reaction was
correctly "this is fucked up." The failure mode was:

1. **Filtered yesterday's bad data tighter at display time instead
   of producing today's good data.** Without re-firing the pack,
   every "improvement" was a display-layer narrowing of the same
   stale responses. The operator saw the same wrong stuff with
   slightly different framing each iteration.
2. **Didn't enforce Rule 3 until very late.** The pack ignored
   operator-curated `official_updates_index_urls` until the final
   patch of the session. Earlier patches were repairing symptoms
   of that single architectural miss.
3. **Didn't enforce Rule 4 systematically.** Tonight's bulk
   url-repair found 23 broken rows on v8 and force-corrected most;
   but several more (Google.org's `google.com`, perhaps others)
   slipped through the heuristic. A new audit pass with
   eyes-on per row is the only reliable fix.
4. **Didn't enforce Rule 7.** Content Reader's "show only records
   with content responses" filter hid the 74 not-found rows the
   operator most needed to see (so they could fire packs against
   them or fix their URLs).
5. **Didn't enforce Rule 8.** The operator had no way to tell that
   what they were seeing was yesterday's data vs. today's; the
   UI looked the same after every code change.

## What to do on restart

The operator's call: revert tonight's uncommitted code, restart
from these goals.

1. Re-read this spec end-to-end.
2. Audit `row.fields.url` for every row in v8 — eyes on, not a
   heuristic. Fix any that are wrong.
3. Re-fire `entity-blog` (1 pack: `official-blog-pack`) on v8
   against rows that have either (a) a correct `url` AND curated
   `official_updates_index_urls`, OR (b) the operator's explicit
   "try this row" trigger.
4. Open whatever review surface ships against the new data.
5. If quality is still poor, the pack's `pickPostLinks` /
   `looksLikePost` need deeper work — likely RSS-first parsing for
   sites with feeds, and walk-two-levels-deep for sites whose
   curated indexes are themselves indexes of articles.

The data-fixes from tonight's `row.update` sweep (25 entities
across 5 generations) are NOT part of "code reverts" — those were
genuine repairs of broken state that pre-dated tonight's session.
Whether to keep them is the operator's call. The repaired Griffin
Catalyst, Howard Schultz, Lumina, and others have correct `url`
fields now and that's actually useful.

## See also

- [[Response-Reviewer-Shell-and-Content-Reader-Mode]] — the
  implementation spec written earlier today. The shell + mode
  pattern still applies; tonight's work just didn't execute it
  cleanly. Treat as the next-most-detailed sibling.
- [[Flow-for-Bundles-Packs]] §"The connectors" — the
  records-surface per-record fire path where
  `official_updates_index_urls` gets populated. Step 2 of the
  workflow above.
- [[Entity-Pulse-Bundle]] — the pack family this workflow uses.
  This spec narrows the focus to JUST the content-shaped subset
  (official-blog-pack) and explicitly defers the press-release +
  social-posts packs (which need different review modes and
  ingest patterns, per Rule 1's strict domain enforcement and
  Rule 2's no-navigation enforcement).
- [[Per-Client-Privacy-and-the-Path-Off-Local]] §Path D — where
  the corpus markdown lives.
- [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]] — the
  audit that found 1,109 responses with 3 accepts. Confirms Rule 1
  is real and was being violated at scale.
- [[Incorrect-Base-URLs-on-a-Real-Minority-of-Records]] — the
  audit that quantified Rule 4's violation rate at 24% of rows.
- [[Augment-Transformations-Not-Reliably-Persisting]] — the
  earlier audit that named the pre-June-3 records-surface bug
  responsible for some of Rule 4's broken state.
