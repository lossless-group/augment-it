---
title: "LinkedIn network → tagged briefing pipeline lands end-to-end; augment-it's network-first sibling-flow gets named"
lede: "A real consulting engagement walked in asking for a curated NYC dinner list, and the org-first frame augment-it has been living in didn't fit. Tonight: ~250 LinkedIn profiles captured via Crawlbase land as flat CSV + full-shape JSONL (skeletons flagged for retry, no fields silently dropped), ~200 LinkedIn 'Save to PDF' downloads get slug-renamed via pdftotext extraction, a browser snippet writes a forward manifest so we never need to reconcile by hand again, the deep-profile DOM extractor catches up to LinkedIn's late-2025 hashed-class layout (pronouns / followers / connections / website / cover photo / robust headline classifier), and three composition scripts join everything into a tag-grouped markdown briefing and a brand-themed HTML export. The exploration sitting alongside the code names what just happened structurally: org-first and people-first are two pivots over the same org↔people join, and a canonical layer (the LinkedIn pipeline) belongs cleanly separated from a proprietary layer (per-engagement commentary). Sub-scale (~30K enumerable venture entities) is the differentiator the big CRMs structurally can't occupy."
publish: true
date_created: 2026-06-15
date_modified: 2026-06-15
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - LinkedIn
  - Crawlbase
  - Network-First
  - Org-People-Join
  - Canonical-Vs-Proprietary
  - CRM-Augmentation
  - Browser-Snippets
  - Tagged-Briefing
  - Branded-Export
  - Sub-Scale-Domain
semver: 0.0.2
files_changed:
  - scripts/crawlbase-bulk-collect.mjs
  - scripts/crawlbase-one-profile.mjs
  - scripts/crawlbase-debug-one-bulk.mjs
  - scripts/rename-linkedin-pdfs.mjs
  - scripts/join-linkedin-network-with-profiles.mjs
  - scripts/render-tagged-network.mjs
  - scripts/export-branded-briefing.mjs
  - tools/browser-snippets/linkedin/linkedin-profile-to-row.js
  - tools/browser-snippets/linkedin/linkedin-profile-save-pdf.js
  - context-v/explorations/Joined-People-UI-and-the-Network-First-Pivot.md
---

# LinkedIn network → tagged briefing, end-to-end. And the network-first pivot, named.

## Why Care?

augment-it's mental model since inception has been **org-first**: hand the
system a list of organizations, iterate, scrape, enrich, deliver
org-shaped artifacts. That model fits the funder-content corpus and the
sponsor-lens work. It does not fit the ask that triggered tonight's
work — a consulting engagement that started with **"we'll be in New
York next week, who do you know there?"** The input is a list of *people*,
specifically the operator's own LinkedIn network, and the deliverable
is a tag-grouped briefing of curated invites with CVs attached.

Tonight that flow exists end-to-end on the operator's disk. ~250 enriched
profile rows in CSV+JSONL form. ~200 LinkedIn CV PDFs renamed by vanity
slug. A browser-side manifest that pairs each Chrome-generic
`Profile.pdf` back to the right person without any post-hoc reconciliation
step. Composition scripts that take a hand-tagged spreadsheet and emit a
category-organized markdown briefing plus a brand-themed HTML export.

That alone earns the changelog entry. But the more durable thing tonight
produced sits in `context-v/explorations/` —
[[Joined-People-UI-and-the-Network-First-Pivot]] names the structural
pivot that the code just made implicit. Org-first and people-first aren't
two flows; they're two starting pivots over the **same** org↔people join.
And underneath the join, a **canonical layer** (LinkedIn truth,
refreshable, shareable across clients) lives in cleanly separated company
from a **proprietary layer** (this client's commentary, engagement-scoped,
absolutely never shareable). That split is what the existing CRM data
tools — Affinity, Attio, Gong, SalesQL, Crawlbase, Apollo — each got
partway right and none of them nailed for sub-scale, consulting-led,
domain-opinionated venture work. The venture universe is ~30K enumerable
entities. We can be opinionated about a knowable set in ways the big
platforms structurally cannot.

## What's New?

### Crawlbase pipeline: flat CSV at-a-glance + sibling JSONL with full shape

`scripts/crawlbase-bulk-collect.mjs` no longer dumps arrays/objects as
embedded JSON strings into CSV columns. The CSV now carries only
**at-a-glance scalars** suitable for sorting and filtering —
`canonical_profile_url`, `experience_total`, `education_count`,
`recommendations_count`, `website_link`, `profile_image`, `cover_image`,
`first_school`, `first_school_dates`. The full Crawlbase response per
profile lands one JSON object per line in a sibling `.jsonl` file at the
same base path. The two files stay aligned on profile_url: every row in
the CSV has exactly one line in the JSONL, including error stubs (`not
submitted` URLs, `parse_error` cases, RIDs that storage dropped).

Skeleton detection ships in the same change: when Crawlbase succeeds but
the underlying LinkedIn render came back empty (no name, no headline, no
about, no current company), the row is marked
`crawlbase_status=empty_skeleton` instead of being silently counted as
"ok." The JSONL still records the full empty shape so we can audit the
failure mode and know the rid for a re-submit later.

```
csv:    clients/<slug>/inputs/<run>.csv      (slim, scannable)
jsonl:  clients/<slug>/inputs/<run>.jsonl    (one-per-line, complete)
```

`scripts/crawlbase-one-profile.mjs` ships alongside as the **tail-fill
companion**: take one or more profile URLs (CLI args or piped on stdin),
submit them async to Crawlbase, decode the storage response, and
**append to the most recent CSV + JSONL pair** with the same column
order. Built specifically to retry skeleton rows:

```bash
awk -F, 'NR>1 && $20=="empty_skeleton" {print $1}' run.csv \
  | xargs node scripts/crawlbase-one-profile.mjs
```

`scripts/crawlbase-debug-one-bulk.mjs` is the **one-rid diagnostic**:
pick a rid from the most recent jobs.json (by index, by url, or
default-first), POST it to `/storage/bulk`, dump the decoded body to
`/tmp/crawlbase-debug-decoded.txt`. This was the tool that earned its
keep when the docs page lied about field names — see the four prior
commits this week against `crawlbase-linkedin-profiles.mjs` for the
journey.

### LinkedIn browser snippets: forward manifest + 2026-DOM extractor

`tools/browser-snippets/linkedin/linkedin-profile-save-pdf.js` now writes
a **forward manifest** to localStorage every time the user triggers
LinkedIn's "Save to PDF." Each entry captures
`{ profile_url, slug, name, triggered_at }` *before* the click. The
problem this solves is real: LinkedIn's Save-to-PDF generates files all
named `Profile.pdf` / `Profile (1).pdf` / `Profile - <timestamp>.pdf`
and the only way to know whose profile each file came from is to
`pdftotext` the file and grep for the LinkedIn URL. The manifest writes
the answer forward, in the moment.

`window.__liPdfManifestDownloadJson()` and
`window.__liPdfManifestDownloadCsv()` snapshot the manifest to a file,
`__liPdfManifestClear()` resets it between engagements. Manifest is
keyed by profile_url with last-wins, so re-saving a profile across
multiple sessions doesn't pollute the list.

`tools/browser-snippets/linkedin/linkedin-profile-to-row.js` got a real
overhaul to match LinkedIn's late-2025 hashed-class DOM. New fields land
in the output row: `pronouns`, `website` (decoded from LinkedIn's
`/safety/go/?url=…` redirect wrapper), `followers_count`,
`connections_count`, `profile_image`, `cover_image`. The classifiers got
sharper too:

- **Location uses a DOM anchor**, not text-shape regex. The location
  `<p>` sits in the same parent block as the "Contact info" link; that
  structural anchor is stable across LinkedIn's class rotations. The
  old regex was false-matching real headlines like *"Principal, Private
  Equity Fund Investments"* against a "Word, Word, …" pattern.
- **Company vs school tiles classify by SVG id**
  (`company-accent-4` vs `school-accent-4`) instead of assuming
  company-first order. A school-only profile (recent grad, retiree) used
  to populate `current_company` with the school name; not anymore.
- **Headline classifier excludes everything that lives inside a
  `role="button"` tile**, so tile text never leaks into the headline
  candidate pool. The headline-minimum length dropped to 12 to admit
  short real headlines (`"Founder & CEO"`, `"Investor · Advisor"`) once
  pronoun / follower / connection / UI-label / location / name /
  degree-marker exclusions had pre-filtered the short noise.
- **Headline hygiene pass at the end**: if the chosen headline equals
  the current_company or current_school, clear it. Belt-and-suspenders
  against the classifier still occasionally grabbing tile text on
  profiles with no actual headline.
- **Clipboard fallback**: DevTools holds focus when the snippet runs,
  which makes `navigator.clipboard.writeText` reject on most paste-runs.
  Falls back silently to a hidden-textarea + `execCommand('copy')`
  pattern. If both fail, stays quiet — the row is already in
  localStorage and printed.

### Slug-renaming the PDF pile, with cross-check

`scripts/rename-linkedin-pdfs.mjs` walks a directory of generically-named
`Profile.pdf` downloads, `pdftotext`s each one, extracts the LinkedIn
vanity slug from the `linkedin.com/in/<slug>` line that LinkedIn prints
in every PDF's Contact block, and renames the file to `<slug>.pdf`.

Two affordances that matter:

- `--csv <path>` cross-checks slugs against a known profile_url column
  and warns on drift. Catches the case where the operator captured rows
  for some profiles but missed clicking Save-to-PDF for them, or vice
  versa.
- **Collision-aware**: two PDFs claiming the same slug (re-saves across
  multiple sessions) get `-2.pdf`, `-3.pdf` suffixes and a summary
  report at the end. No silent data loss.

The slug regex tolerates the line-break pdftotext sometimes inserts
between `/in/` and the slug.

### Joins, tag-grouped briefings, branded HTML export

Three scripts compose the data into deliverables:

- `scripts/join-linkedin-network-with-profiles.mjs` joins the
  search-results CSV (output of an earlier browser snippet) with the
  deep-profile-capture JSON (output of `linkedin-profile-to-row.js`) by
  `profile_url`, producing an enriched CSV with `deep_visited`,
  `deep_visited_at`, `deep_headline`, `deep_location`,
  `experience_json` columns. Where deep capture is empty, the
  search-results values stand on their own; `deep_visited` is still
  useful as the "I clicked into this one during curation" signal.
- `scripts/render-tagged-network.mjs` reads a hand-tagged CSV (the
  operator's spreadsheet, tagged in Numbers per the dinner brief), an
  enriched CSV (for about/company/school/photo), and a PDF directory
  (renamed by slug). Joins them on the LinkedIn vanity slug, groups
  rows by tag, splits multi-tag rows across all their categories
  (`VCs, Founders` → present in both sections), and emits a single
  category-organized markdown briefing. Handles the Numbers export
  gotcha where unquoted comma-in-headline fields shift the row by N
  columns — merges the broken-off pieces back into the headline and
  empties the now-corrupted location field rather than letting bad
  data through.
- `scripts/export-branded-briefing.mjs` takes the rendered markdown +
  the PDF folder + a memopop brand-config YAML and emits a branded
  `index.html` in a chosen output directory: firm colors, fonts, logo,
  confidential footer, anchor-link TOC. Copies the PDFs into
  `<out-dir>/pdfs/` so the relative links in the markdown resolve.
  Uses a focused subset of Markdown (h1/h2/h3, hr, bullets, paragraphs,
  links, bold) because we control the input — no need to pull in a
  full Markdown parser.

```
network CSV  ┐
profile JSON ┤→ join → enriched CSV
             │
operator     ├→ tagged CSV (Numbers)
hand-tags    │
             │
enriched CSV ┐
tagged CSV   ├→ render → briefing.md
PDF dir      ┘
             │
briefing.md  ┐
PDF dir      ├→ export → branded index.html + pdfs/
brand YAML   ┘
```

### The exploration that names what happened

[[Joined-People-UI-and-the-Network-First-Pivot]] is the longer arc — and
the more durable artifact of the night. The headers, in order:

- **What augment-it has assumed** (org-first) and what the consulting
  engagements keep surfacing (people-first asks).
- **What we now have on disk for one such network** — the data already
  exists; what's missing is a surface.
- **What the joined UI would need to do** — filter / tag / rank, in that
  order of frequency.
- **Addendum 1**: both directions are the *same* primitive. Org→people
  and people→org are two pivots over one join. The row store should
  carry a `kind` discriminator (`person | org | person_org_role`), not
  fork into a sibling store.
- **Addendum 2**: the canonical / proprietary layer split, named
  explicitly. Canonical = reality at a point in time, refreshable,
  shareable. Proprietary = this client's commentary, engagement-scoped,
  must not cross client boundaries. Refreshing canonical data must
  NEVER overwrite a `soft-yes` note; tagging someone differently must
  NEVER force a manual canonical re-sync.
- **Addendum 3**: a read on what Attio, Affinity, Gong, SalesQL, and
  Crawlbase each got right and where each stops being right for our
  shape. Affinity's "warmth inferred from email" presumes the
  operator's behavior IS the signal — fails when you know someone
  without ever having emailed them. Crawlbase isn't a competitor; it's
  a *supplier* feeding the canonical pipeline.
- **Addendum 4**: sub-scale is the differentiator. ~30K enumerable
  venture entities is curatable in ways the big CRMs structurally
  can't be. Specific permissions follow: hard-coded entity shapes for
  `startup | vc | lp | person` are appropriate for us, opinionated
  domain-specific tag taxonomies can ship with the workspace,
  reference-data freshness can be a sub-daily background job for the
  whole canonical layer at this scale.
- **Addendum 5**: storage substrate, where the filesystem stops working.
  The conceptual limit (not technical) is blending a universal
  canonical entity with this client's local notes — different update
  cadences, different ownership, different visibility. Co-locate as
  markdown → git conflicts every refresh. Split across two files →
  relational problem with no relations. Surveys Postgres, Mongo,
  NocoDB/Baserow, JuiceFS, SurrealDB; lands on a hybrid recommendation:
  proper DB for the canonical entity registry, filesystem for
  proprietary commentary, slug as the join. Positions this as a
  forcing-function sibling to
  [[Per-Client-Privacy-and-the-Path-Off-Local]].

The exploration's closing line is the one to remember: *we don't need
to commit to a substrate this week. We need to commit to the **shape**
so the work tonight (already producing slug-keyed records) compounds
correctly.*

## How it Worked Out

The Crawlbase scraping work this week went through a long
docs-vs-reality cycle (see commits `1e9c281`, `996e07a`, `32f1fb5`,
`928426c` against `crawlbase-linkedin-profiles.mjs`) — the documented
response shape didn't match the actual JSON Crawlbase returns for
LinkedIn profiles. Tonight's `crawlbase-bulk-collect.mjs` rewrite landed
the rowFromScrape mapping that survives contact with real data,
and the JSONL companion file is the discipline that ensures we never
have to re-litigate that question again: keep the full shape, drop
nothing, let the CSV stay narrow.

The browser-snippet manifest pattern came from a specific pain point —
walking back through ~200 PDFs to figure out which `Profile.pdf` was
whose was strictly worse than writing the answer forward. The fix
generalizes: any browser-side capture step that produces files with
generic names should write a manifest in the same gesture.

The DOM extractor rewrite is the third in a sequence as LinkedIn
continues to rotate hashed class names (`6499ca8`, `c338147`,
`244e57a`, `67158b7`). The lesson encoded in tonight's rewrite is
**structural anchors over text-shape regex** wherever possible — the
location-block fix is the clearest example, but the company-vs-school
SVG-id classifier is a sibling. Both will outlast the next class rotation.

The render-tagged-network's Numbers-export shift-by-N fix is the kind
of gotcha that earns its dedicated comment block — *Numbers drops
quotes around fields with embedded commas, so the row gets MORE fields
than headers, and the broken-off pieces shift into the wrong columns.*
Operator-friendly inputs and operator-friendly debugging are usually
the same conversation.

## What's Next

- **Spec the joined UI** the exploration sets up. Three questions to
  answer first: (1) one row store with `kind` discriminator or two;
  (2) tag editor first or table view first; (3) does the LinkedIn
  pipeline graduate to a first-class corpus type. The exploration
  leans one way on each but a spec should force the answer.
- **Storage-substrate decision**, sibling to
  [[Per-Client-Privacy-and-the-Path-Off-Local]]. Boring choice
  (Postgres) for canonical, filesystem for proprietary, slug as join.
  Not this week.
- **Skeleton-row re-fetch workflow**, automated. The CSV-awk-xargs
  one-liner in `crawlbase-one-profile.mjs`'s usage block is the
  cookbook; making it a single command would be small and high-value.
- **Manifest-vs-disk diff utility** for the PDF-save flow: read the
  forward manifest from localStorage export, list the PDF directory,
  warn on entries-without-files (Save-to-PDF dialog was dismissed)
  and files-without-entries (saved-before-snippet-was-loaded). Catches
  the silent gaps before they propagate.

## See Also

- [[Joined-People-UI-and-the-Network-First-Pivot]] — the exploration
  this changelog cites throughout; the durable artifact of the night.
- [[LinkedIn-Network-Explorer-For-Curated-Invites]] — the original
  framing of this tooling before there was data on disk.
- [[Entity-Profile-Augmentation-Workflow]] — the org-first sibling,
  now repositioned as a sibling-pivot rather than a sibling-flow.
- [[Per-Client-Privacy-and-the-Path-Off-Local]] — the privacy-axis
  framing of the same canonical/proprietary split the exploration
  derives from the schema axis.
- [[Funder-Content-Corpus]] — already an opinionated canonical-layer
  shape for one entity kind; the model worth extending.
