---
title: "URL auto-detector ships clickable links for socials / helpful_links / official_updates_index_urls; Per-Client-Privacy exploration lands; reach-edu becomes the first client submodule"
lede: "Three coupled drops in the same session. First, the URL auto-detector + clickable rendering plan dropped earlier today implemented end-to-end in Record Collector — `apps/record-collector/src/logic/format.ts` grew a `FieldShape` discriminated union (`empty | scalar | scalar_url | url_list | json`) that picks by VALUE-shape never field-name, plus a `UrlEntry` extractor that surfaces `url + chip (from pack_id) + label (from label or display_name)` from `Array<{ url, ... }>` payloads. The structured-value branch in `App.svelte` switches on `shape.kind`: `url_list` renders as a vertical flex of clickable `<a target=\"_blank\" rel=\"noopener noreferrer\">` entries showing hostname+path (truncated at 60 chars with full URL in `title=`) so the operator can verify links resolve without leaving Record Collector. Auxiliary metadata (display_name, confidence, source_metadata, response_id, accepted_at, ...) drops from the rendered view but stays on the row and round-trips through CSV. Read-only by design; the per-entry remove affordance lives in a sibling plan, not this one. The keyed-each was unkeyed mid-implementation when `(entry.url)` was identified as a Svelte 5 duplicate-key crash risk against any row whose URL array has repeats — for read-only lists, positional iteration is the right call. Second, a Response Reviewer drill-through audit on the live response-store revealed 1,982 responses with 1,109 (56%) from the three Entity-Pulse OfficialPulse packs at a combined 3-accept rate — `official-blog-pack` 99.5% reject, `official-social-posts-pack` 100% reject, `official-pressrelease-pack` 100% reject — confirming the operator's 'tons of junk links' read of the surface. Domain breakdown showed 65% of pressrelease responses come from `news.google.com` (the google-news-rss connector with weak entity-name binding); 45% of social-posts responses come from `youtube.com` (weakly bound). The packs with strong identity binding — wikipedia (matches article title to entity), linkedin (returns entity's own page) — reject at the normal 73-82% rate for a triage workflow. Third, the operator's response to the junk-volume reframed the next-feature direction entirely: STOP triaging URLs one-at-a-time in Response Reviewer; START treating those URLs as a seed list for a Jina.ai content-ingestion pipeline that writes deduped markdown per funder; build a per-client content corpus that powers cross-funder fundraising-strategy synthesis and per-funder outreach customization. That direction surfaced the broader ai-labs architectural question the operator named explicitly — when does the single-operator-on-localhost posture stop scaling, what stack do we reach for, and how do we architect today so the move is cheap when it comes? — and produced `context-v/explorations/Per-Client-Privacy-and-the-Path-Off-Local.md` (v0.0.0.1, Draft) mapping five candidate stacks (defer-everything, per-client Railway single-tenant, multi-tenant SaaS shape, hybrid posture, managed BaaS) across five axes (repo topology, storage substrate, identity/auth, multi-tenant data model, sensitivity constraints), naming six decision-forcing functions, and five architecture choices that cost almost nothing today but preserve cheap optionality for every path-flip. Operator signed off on Path D — hybrid posture — and committed to start local: `lossless-group/augment-reach-edu` created as a private repo (default README); `clients/reach-edu` registered as a git submodule pointing at it. The reach-edu corpus + operational data + Jina ingest pipeline land in that submodule in follow-up sessions; the augment-it parent stays on the docker-local posture until one of the named forcing functions actually fires."
publish: true
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Record-Collector
  - URL-Auto-Detector
  - Clickable-Links
  - Field-Rendering
  - FieldShape
  - Socials
  - Helpful-Links
  - Official-Updates-Index-Urls
  - Response-Reviewer
  - Entity-Pulse-Junk-Audit
  - OfficialPulse-Packs
  - Google-News-RSS
  - Per-Client-Privacy
  - Funder-Corpus
  - Jina-Ai
  - Local-to-SaaS
  - Path-D-Hybrid
  - Client-Submodule
  - reach-edu
files_changed:
  - apps/record-collector/src/logic/format.ts (FieldShape + UrlEntry + isLikelyUrl + objectArrayToEntries)
  - apps/record-collector/src/App.svelte (switch on shape.kind for the structured-value branch + displayUrl helper)
  - apps/record-collector/src/app.css (.field-value-urls / .field-value-url / .field-value-url-chip / .field-value-url-label / .field-value-url-link)
  - context-v/explorations/Per-Client-Privacy-and-the-Path-Off-Local.md (NEW — five candidate stacks, five axes, six forcing functions, recommended Path D)
  - .gitmodules (NEW — registers clients/reach-edu → lossless-group/augment-reach-edu)
  - clients/reach-edu (NEW — submodule entry)
---

# URL auto-detector, Per-Client-Privacy exploration, reach-edu submodule

## What shipped

### 1. URL auto-detector + clickable rendering in Record Collector

Implements the plan from earlier today
(`context-v/plans/URL-Auto-Detector-and-Clickable-Rendering-for-List-Fields.md`,
v0.0.0.1).

`apps/record-collector/src/logic/format.ts` extends the formatter with
a `FieldShape` discriminated union:

```ts
type FieldShape =
  | { kind: 'empty' }
  | { kind: 'scalar'; text: string }
  | { kind: 'scalar_url'; url: string }
  | { kind: 'url_list'; entries: UrlEntry[] }
  | { kind: 'json'; text: string };
```

Shape detection is purely value-based (never field-name-based) so the
affordance applies uniformly to any future URL column. `isLikelyUrl`
matches `http://` / `https://` / `//` prefixes after trim — render
hint, not validation; rejects bare paths so prose isn't accidentally
linkified.

`isStringUrlArray` returns true iff every element of an array is a
URL-string. `isObjectUrlArray` returns true iff every element is a
non-null object with a `url` property passing `isLikelyUrl`. The
latter handles `socials` (`Array<SocialProfile>`) and `helpful_links`
(`Array<HelpfulLink>`) cleanly. `objectArrayToEntries` surfaces the
URL plus an optional `chip` (from `pack_id`, with `-pack` suffix
stripped to match the existing `.socials` chip-row) and an optional
`label` (from `label` if non-empty, otherwise `display_name`). All
other auxiliary metadata (`socials_id`, `confidence`, `snippet`,
`source_metadata`, `response_id`, `accepted_at`, `link_id`, `note`,
`source`, `added_at`) is intentionally dropped from view — it's
preserved on the row and round-trips through CSV via the existing
`download.ts` path.

`apps/record-collector/src/App.svelte:444` swaps the structured-value
branch from `if (isStructured)` to a switch on `shape.kind`:

- `url_list` renders as a vertical flex of clickable links. Each
  entry shows the optional chip, optional label, and an
  `<a target="_blank" rel="noopener noreferrer">` whose text is
  `displayUrl(entry.url)` — strip the scheme + leading `www.`, clip
  at 60 chars with ellipsis — and whose `title=` holds the full URL
  for hover.
- `json` keeps the existing read-only structured branch with the
  `(empty [])` / `(empty {})` placeholder for empty arrays / objects.
- Everything else (`empty`, `scalar`, `scalar_url`) flows through
  the existing contenteditable scalar branch. `scalar_url` routing
  through `scalar` preserves edit-on-click for single-URL fields;
  the optional icon-button affordance for `scalar_url` stays
  out of scope per the plan.

`apps/record-collector/src/app.css:288` adds `.field-value-urls`
(flex column container, theme `--color-field` background, 10em
max-height with overflow), `.field-value-url` (per-entry row),
`.field-value-url-chip` (uppercase pill, theme `--color-border`
background, `--color-text-muted` text), `.field-value-url-label`
(compact, muted, max-width 12em with ellipsis), `.field-value-url-link`
(theme accent color, ellipsis-truncated, underline on hover,
`accent-2` on visited).

The keyed-each `{#each shape.entries as entry (entry.url)}` was
unkeyed mid-implementation when `entry.url` was identified as a
Svelte 5 duplicate-key crash risk against any row whose URL array
has repeats (helpful_links accumulated across sessions, socials
whose pack_ids resolve to the same profile URL). For a read-only
list with no reordering, positional iteration is the right call. The
prior bug it explained: rows pane went blank while the surrounding
template (filename, "Augment this Set" panel, sidebar) kept
rendering — classic single-iteration error in a keyed `{#each}`
within the parent rows `{#each}`.

### 2. Per-Client Privacy and the Path Off Local — exploration

`context-v/explorations/Per-Client-Privacy-and-the-Path-Off-Local.md`
(v0.0.0.1, Draft) maps the option space surfaced by two coupled
forcing functions:

1. **Funder content corpus needs storage.** The Jina-pull-to-markdown
   pipeline the operator wants must be private per client. reach-edu
   and Laerdal share little; both treat the material as highly
   sensitive.
2. **ai-labs broader posture is hitting the local-only ceiling.**
   Active collaborator joining, client asking for login soon, funder
   corpus expanding the data substantially.

Five candidate stacks across five axes (repo topology, storage
substrate, identity/auth, multi-tenant data model, sensitivity):

- **Path A — Defer everything.** Per-client repos + markdown only +
  operator-only auth + per-client isolation by deployment. Zero new
  infra cost; costs migration work later.
- **Path B — Per-client Railway single-tenant.** Each client gets
  their own Railway project. Magic-link auth. Application work:
  auth flow, deployment automation, per-user routing.
- **Path C — Multi-tenant SaaS shape.** Single hosted deployment,
  `client_id` on every table, full identity provider, RLS. Most
  durable; most upfront work.
- **Path D — Hybrid posture (RECOMMENDED, signed off).** Per-client
  repo for corpus + per-client Chroma collection now; augment-it
  docker-local for operational data, stashed inside the per-client
  repo so it's the migration source when the flip comes; auth +
  hosting deferred until a forcing function fires.
- **Path E — Managed BaaS.** Powabase flagged expensive; Supabase /
  Convex / PocketBase-cloud worth a survey if Path C ever becomes
  target.

Six decision-forcing functions named (watch for these, don't guess
timing): collaborator needs remote access to operational data, a
client wants a login URL, two collaborators want to write the same
client simultaneously, a client demands audit logs / SSO, corpus
crosses a size threshold, a client asks for SOC 2 / GDPR posture.

Five architecture choices that cost almost nothing today and
preserve cheap optionality: funder corpus as markdown files,
operational data in per-client repo (not docker volume only),
`client_id` as a first-class field in every new artifact, Chroma
collections as the retrieval primitive, auth shape declared but
not implemented.

### 3. reach-edu — first client submodule

Path D's first concrete action.

- `lossless-group/augment-reach-edu` — private repo created on
  GitHub via `gh repo create --private --add-readme`. Default
  README; description points back to this exploration.
- `.gitmodules` registers the new submodule:
  ```
  [submodule "clients/reach-edu"]
    path = clients/reach-edu
    url = https://github.com/lossless-group/augment-reach-edu.git
  ```
- `clients/reach-edu/` — submodule entry pointing at the initial
  commit of the new repo.

The corpus directory shape, the Jina ingest pipeline, the per-client
Chroma collection, and the operational-data co-location stash all
land in that submodule in follow-up sessions. The augment-it parent
stays on the docker-local posture; nothing in this commit changes
how the existing stack runs.

Sibling client submodules — `clients/laerdal` (against a
`lossless-group/augment-laerdal-edu` or similar private repo) — drop
in beside `reach-edu` whenever that client work begins. The
`clients/` directory is gitignored from the lens of the running
augment-it app; only the submodule pointers are tracked at the
parent level.

## Verified

- `tsc --noEmit` clean across `apps/record-collector` after the
  format.ts shape additions and the App.svelte switch.
- `lossless-group/augment-reach-edu` exists at
  https://github.com/lossless-group/augment-reach-edu (private).
- `git submodule status` shows `clients/reach-edu` registered
  against the new repo's initial commit.

## What's next on this branch

Out of scope for this commit; named so the next session has a
landing spot:

- **Funder corpus shape inside `clients/reach-edu/`** — `corpus/`
  directory, per-funder subdirectory, `<YYYY-MM-DD>_<title-slug>.md`
  naming, YAML frontmatter (source URL, fetched_at, original
  published date if extractable, content hash, entity_id).
- **`content-ingest` service** — Jina.ai integration. Consume a URL
  list (seed from the entity-pulse pack responses already sitting
  in response-store), call `r.jina.ai/<url>` per entry, dedupe by
  URL canonicalization → content hash → title+date, write
  markdown.
- **`reach-edu-funder-corpus` Chroma collection** — paralleling the
  existing four (`context-vigilance-corpus`, `lossless-changelog`,
  `claude-code-sessions`, `claude-code-tool-traces`). Ingest script
  extends `context-vigilance-kit/scripts/`.
- **Per-entry remove affordance in Record Collector** — the curate
  half of [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]].
  Sibling plan to today's URL-Auto-Detector plan; not started.
- **Pre-promote review step in PromoteBar** — same OfficialPulse
  issue's §Prevention #2.
- **Triage / clear the 1,109 OfficialPulse-pack responses** sitting
  in response-store — likely via the existing
  `response.delete_all` capability filtered by pack_id, or by
  hand once the Jina ingest pipeline has consumed the seed URLs.

Each gets its own context-v artifact (spec / plan / issue) when
the work begins.
