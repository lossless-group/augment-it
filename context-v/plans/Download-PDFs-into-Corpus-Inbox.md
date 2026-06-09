---
title: "Download PDFs into Corpus Inbox — preserve the original binary alongside Jina-extracted markdown; wire both inbox vectors (UI and agent-chat) so the operator's PDF discoveries land as commit-able evidence, not just summarized text"
lede: "Today's inbox flow Jina-fetches every URL and writes the extracted markdown to `clients/<client>/corpus/inbox/<date>_<slug>.md`. For HTML pages this is fine — the markdown IS the content. For PDFs it loses information that matters: the original PDF (with its tables, figures, signatures, page numbering, citation-able URL) is gone, and the operator is left with whatever text Jina could pull out of it. The DOL workforce-strategy PDF captured in the 2026-06-08 milestone ship is exactly this case — useful text, but the binary that needs to be cited downstream isn't preserved. This plan adds a binary-download primitive to `services/content-ingest`, threads PDF detection + filesystem persistence through `corpus.inbox.add`, extends the inbox frontmatter contract with a `binary_asset` block, surfaces 'PDF saved' affordances in both the agent-chat result bubble AND the Content Reader UI (which gets a small 'send to inbox instead' toggle as an interim inbox-UI surface before the dedicated microfrontend ships), and lays down a per-client `.gitattributes` git-lfs discipline so PDFs don't bloat the per-client repo's git history. PDFs first; the same scaffolding extends to docx/pptx/xlsx when those become operator pain points."
date_created: 2026-06-08
date_modified: 2026-06-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-08 — Initial draft. Written immediately after the agent-chat `/inbox` milestone ship, when the first real captures surfaced the lost-binary problem (the DOL workforce-strategy PDF Jina extracted text from, with the original PDF gone). Operator's framing: *"add to inbox functionality on both UI and agent-chat to download PDFs for corpus."*
tags:
  - Plan
  - Augment-It
  - Corpus-Inbox
  - PDF
  - Binary-Assets
  - Content-Ingest
  - Agent-Chat
  - Content-Reader
  - Git-LFS
status: Draft
---

# Download PDFs into Corpus Inbox

## Why this plan exists

The 2026-06-08 milestone ship (`5910914`) put the first real inbox
captures on disk. Two of them via `/inbox <url>`:

- `2026-06-09_america-s-talent-strategy-building-the-workforce-for-the-gol.md`
  — Jina-extracted text from
  `https://www.dol.gov/.../Americas-Talent-Strategy-Building-the-Workforce-for-the-Golden-Age.pdf`
- `2026-06-09_just-a-moment.md`
  — Cloudflare interstitial; the actual page (an Urban Institute
  event) was unreachable.

The first one *worked* but lost something load-bearing: **the
original PDF is gone**. What landed is a markdown extraction of its
text. The operator can't cite the PDF the way the operator would
cite a PDF (page-numbered quote, figure reference, the URL of the
PDF as the *source*), can't hand the binary to a co-researcher,
can't re-extract with a better tool later, can't include it as
evidence in a memo. Jina is upstream of all of that — it gives us
text but the binary is *upstream* of it.

This plan adds PDF download to the inbox flow so the binary lands
**alongside** the markdown, in the same per-client repo, with a
frontmatter contract that ties them together. Operator framing
2026-06-08: *"add to inbox functionality on both UI and agent-chat
to download PDFs for corpus."*

## Scope of this plan

In scope:

- A binary-download primitive in `services/content-ingest`
  (`downloadBinaryAsset`) that does Content-Type / suffix
  detection, GET with size cap, sha256 hashing, returns
  `{ filename, content_type, size_bytes, sha256, buffer }` or
  null.
- Threading through `corpus.inbox.add` so the binary lands
  alongside the markdown file with matching slug.
- Extending the inbox frontmatter contract with a `binary_asset`
  block.
- Updating the agent-chat result bubble to show "📄 PDF saved" when
  binary_asset is non-null.
- Updating the Content Reader manual-add UI to (a) signal PDF
  detection in the preview and (b) add a "save to inbox instead"
  toggle so the operator can route PDFs to inbox from the surface
  they're already on (interim inbox-UI surface; the dedicated
  `apps/corpus-inbox/` microfrontend per
  [[../specs/Corpus-Inbox-Capture-and-Triage]] is the longer-term
  home).
- A per-client `.gitattributes` git-lfs discipline so PDFs don't
  bloat the per-client repo's git pack.

Out of scope:

- Other binary types (docx, pptx, xlsx). The scaffolding extends
  trivially; PDF-first is the proof.
- Re-extraction with a better PDF tool (PyMuPDF, Marker,
  unstructured.io). The binary lands, so the future re-extraction
  step has something to chew on. That's the value the binary
  unlocks.
- The dedicated `apps/corpus-inbox/` microfrontend. Touched
  tangentially (the Content Reader interim path is the
  near-term surface); the full surface ships in its own arc.
- The conversational-paste vector (Vector 2b from
  [[../specs/Corpus-Inbox-Capture-and-Triage]]). When that ships
  it inherits the binary download automatically — same backend
  capability.
- Triage of inbox PDFs. When triage moves the .md to a per-funder
  corpus directory, the .pdf moves with it; the triage spec
  handles the move semantics.

## Architecture

```
        +-----------------------+
        | Vector A: Content     |
        | Reader UI manual-add  |
        |  - "save to inbox"    |
        |    toggle             |
        +----------+------------+
                   |
        +-----------------------+
        | Vector B: Agent-chat  |
        |  /inbox <url>         |
        +----------+------------+
                   |
                   v
        +-----------------------+
        | corpus.inbox.add      |
        |   handler             |
        |   (services/          |
        |    content-ingest)    |
        +----------+------------+
                   |
        +----------v--------------------------+
        | NEW: downloadBinaryAsset(url)        |
        |   1. HEAD to check Content-Type      |
        |   2. fallback: URL suffix check      |
        |   3. GET with size cap + sha256      |
        |   4. return { filename, content_type,|
        |               size, sha256, buffer } |
        +----------+--------------------------+
                   |
                   v
        +-----------------------+
        | Jina (existing)       |
        |   markdown text       |
        +----------+------------+
                   |
                   v
        +-----------------------+
        | addToInbox (extended) |
        |   - writes .md w/     |
        |     binary_asset      |
        |     frontmatter block |
        |   - writes .pdf       |
        |     sibling           |
        +-----------------------+
                   |
                   v
   clients/reach-edu/corpus/inbox/
     2026-06-09_dol-talent-strategy.md
     2026-06-09_dol-talent-strategy.pdf   <-- NEW
```

The key invariant: **binary and markdown share the same dated slug**
and are siblings in the same directory. Trivial filesystem
correlation; no separate `_assets/` tree.

## Frontmatter contract extension

The inbox `.md` gains an optional top-level `binary_asset` block.
When present, it carries the binary's metadata; absent means there
is no companion binary (the URL was HTML or the binary download
failed).

```yaml
---
title: "America's Talent Strategy: Building the Workforce for the Golden Age"
exact_url: "https://www.dol.gov/.../Americas-Talent-Strategy.pdf"
fetched_at: 2026-06-09T04:31:12.192Z
client_id: "reach-edu"
funder_slug: "inbox"
record_id: null
response_id: null
pack_id: "inbox"
tags: []
inbox_status: "pending"
captured_at: 2026-06-09T04:31:12.192Z
captured_from: "chat-verb"
captured_note: ""
captured_session_id: null
triaged_at: null
triaged_to: null
triaged_by: null
triaged_note: null

# NEW — when the source URL is a downloadable binary:
binary_asset:
  filename: "2026-06-09_dol-talent-strategy.pdf"  # sibling in this directory
  content_type: "application/pdf"
  size_bytes: 2841920
  sha256: "ab12cd34…"
  downloaded_at: 2026-06-09T04:31:13.500Z
  download_status: "ok"          # ok | size_capped | http_error | unsupported_type

extra_metadata:
  jina_status: "200"
  content_length_bytes: "77704"
---
<Jina-extracted markdown body — still useful for fulltext search,
preview snippets, and inline reading. The PDF is the source of
truth; the markdown is the index into it.>
```

`download_status` is informational — even a `size_capped` or
`http_error` outcome leaves the binary_asset block (so the operator
can see "we tried and this is why we don't have it") with the
filename field set to null in the error cases.

When triage moves the .md to a per-funder corpus directory, the
triage step moves the sibling `.pdf` alongside it and updates
`binary_asset.filename` only if the slug changes (it shouldn't —
slugs are stable across triage).

## Phases

Each phase is independently shippable. Phase 1 alone gives the
backend the primitive without any user-facing change; Phases 2-4
unlock the user-visible value. Phase 5 is operator discipline.

### Phase 1 — `downloadBinaryAsset` primitive

New file: `services/content-ingest/src/binary-asset.ts`.

Exports `downloadBinaryAsset(url, options?)` →
`Promise<BinaryAssetResult>`:

```ts
type BinaryAssetResult =
  | { ok: true; content_type: string; size_bytes: number; sha256: string;
      buffer: Buffer; status: 'ok' | 'size_capped' }
  | { ok: false; status: 'http_error' | 'unsupported_type' | 'fetch_failed';
      error: string };

type Options = {
  max_bytes?: number;     // default 50 * 1024 * 1024 = 50MB
  accepted_types?: string[]; // default ['application/pdf']
};
```

Implementation:

1. Probe with `fetch(url, { method: 'HEAD' })`. Read
   `content-type`. If it's in `accepted_types`, proceed; otherwise
   try the URL-suffix fallback.
2. If HEAD failed or content-type is `text/html` AND the URL ends
   in `.pdf` (common case — content-type set generically by some
   servers), proceed.
3. GET with `Content-Length` checked against `max_bytes`. If
   exceeded, abort and return `{ status: 'size_capped' }`.
4. Stream into a Buffer (or write to a temp file if we want
   to avoid memory bloat; v1 keeps it in memory — 50MB cap makes
   that fine).
5. Compute sha256 over the buffer.
6. Return.

Standalone-testable. No NATS, no filesystem write — the handler
owns those.

### Phase 2 — Wire into `corpus.inbox.add`

Touch: `services/content-ingest/src/handlers.ts`,
`services/content-ingest/src/corpus.ts`.

Handler changes (`handlers.ts`):

- After Jina fetch (existing), call `downloadBinaryAsset(url)`.
  Default-on for any URL whose `content-type` resolves to
  `application/pdf` or whose suffix is `.pdf`. New optional arg
  `fetch_binary?: boolean` lets the operator opt out (defaults to
  true; false skips the binary download).
- If the download returns ok, pass the buffer + metadata into
  `addToInbox`. The writer writes the binary file alongside the
  .md.
- If the download fails (http_error / size_capped / fetch_failed),
  still write the .md but include the binary_asset block with
  `download_status` reflecting the failure so the operator can
  retry later.

Writer changes (`corpus.ts`):

- `AddInboxArgs` gains optional `binary_asset?: { buffer, content_type, size_bytes, sha256, status }`.
- `addToInbox` does the .md write as today AND, if `binary_asset`
  is present and `buffer` is non-null, writes
  `<slug>.<extension>` next to it. Extension derived from
  content_type (`application/pdf` → `.pdf`).
- `buildInboxFrontmatter` emits the `binary_asset:` block when
  the arg is present.

The collision-suffix logic for the .md filename runs once; the
.pdf reuses the same dated_slug (no separate collision check —
they're written atomically as a pair).

Test fire: re-fire the DOL workforce-strategy PDF URL via `/inbox`
and verify both files land.

### Phase 3 — Agent-chat result bubble + Content Reader signal

Touch: `apps/chat/src/ResponseModeRenderer.svelte`,
`apps/response-reviewer/src/App.svelte`,
`apps/response-reviewer/src/app.css`,
`services/content-ingest/src/handlers.ts` (preview_url).

**Chat side.** The existing inbox result branch shows
"✓ Saved to inbox" + corpus_path. When the result carries a
`binary_asset` field (the handler should return it in the reply),
add a second line: "📄 PDF saved (size · sha256-short)". Make the
icon and tone match the rest of the bubble.

For this to work, `corpus.inbox.add`'s reply envelope needs to
grow from `{ corpus_path, written_at }` to
`{ corpus_path, written_at, binary_asset?: { filename, size_bytes, sha256_short } }`.

**Content Reader side.** Two additions:

1. **PDF detection in the preview.** When the operator pastes a URL
   into the manual-add field, the existing `content_ingest.
   preview_url` Jina-fetches and returns the preview. Extend
   `content_ingest.preview_url` to ALSO HEAD-probe content-type
   (or check URL suffix) so the preview's `extra_metadata` carries
   `is_pdf: true|false`. The preview-card UI shows a "📄 PDF" chip
   when true.
2. **"Save to inbox instead" toggle.** A small toggle below the
   existing "+ add to corpus" button on the manual-add preview
   card. Default is the existing behavior (write to the active
   record's per-funder corpus via `corpus.add`); flipping the
   toggle reroutes the click to `corpus.inbox.add` instead. The
   interim inbox UI without scaffolding a new microfrontend.

The toggle is the cheap interim. The dedicated
`apps/corpus-inbox/` microfrontend is the longer-term home; the
toggle goes away when that surface ships.

### Phase 4 — End-to-end verification

The proof:

1. Re-fire `/inbox https://www.dol.gov/.../Americas-Talent-Strategy.pdf`
   via the chat. Verify:
   - .md lands with `binary_asset` block populated.
   - .pdf sibling lands with matching dated_slug.
   - chat result bubble shows "📄 PDF saved (2.7 MB ·
     `ab12cd34…`)".
2. Paste a PDF URL into the Content Reader manual-add for any
   record. Verify:
   - Preview shows the "📄 PDF" chip.
   - "Save to inbox instead" toggle is visible.
   - Toggling + clicking add writes to
     `clients/reach-edu/corpus/inbox/` (not the per-funder
     directory).
3. Re-fire a non-PDF URL (any HTML page) via either vector and
   verify `binary_asset` is absent from the frontmatter.
4. Re-fire a PDF URL with `fetch_binary: false` (via a chat
   message hinting "save the URL only, don't download the PDF" —
   if the model picks up the negation, otherwise leave for v2)
   and verify only the .md lands.

### Phase 5 — Per-client `.gitattributes` git-lfs discipline

Touch: `clients/reach-edu/.gitattributes` (NEW), update
[[../specs/Corpus-Inbox-Capture-and-Triage]] to document the
discipline.

PDFs in git history bloat the git pack fast. The per-client repo
adopts git-lfs for binary types:

```gitattributes
# clients/reach-edu/.gitattributes
*.pdf  filter=lfs diff=lfs merge=lfs -text
*.docx filter=lfs diff=lfs merge=lfs -text
*.pptx filter=lfs diff=lfs merge=lfs -text
*.xlsx filter=lfs diff=lfs merge=lfs -text
```

Steps:

1. Operator runs `git lfs install` once per machine (one-time).
2. The `.gitattributes` file lands in the per-client repo's root.
3. Existing PDFs in the working tree need a one-time
   `git lfs migrate import --include="*.pdf"` to move them into
   lfs storage. (Or — if the operator prefers — leave existing
   PDFs in normal git and let new ones go to lfs from now on. Less
   clean but lower-friction.)
4. Document the discipline in the inbox spec's "Filesystem shape"
   section: "binary assets are LFS-tracked in the per-client
   repo's .gitattributes."

LFS is the right discipline because the per-client repos are
private (per [[../explorations/Per-Client-Privacy-and-the-Path-Off-Local]]
§Path D) — there's no public-host bandwidth concern. The cost is
LFS bandwidth on `git push` / `git pull`; for a small team that's
fine.

## Files changed

| File | Phase | Change |
|---|---|---|
| `services/content-ingest/src/binary-asset.ts` | 1 | NEW — `downloadBinaryAsset` primitive |
| `services/content-ingest/src/handlers.ts` | 2, 3 | Wire `downloadBinaryAsset` into `corpus.inbox.add`; extend reply envelope; HEAD-probe in `content_ingest.preview_url` |
| `services/content-ingest/src/corpus.ts` | 2 | `AddInboxArgs.binary_asset?`; writer handles binary file write + frontmatter block |
| `services/workspace/src/capabilities.ts` | 2 | Timeout bump on `corpus.inbox.add` from 30s to 90s (PDFs at 50MB cap can take real seconds on a slow link) |
| `apps/chat/src/ResponseModeRenderer.svelte` | 3 | Result bubble shows "📄 PDF saved" line when binary_asset is returned |
| `apps/chat/src/app.css` | 3 | Style for the PDF saved line (matches existing inbox-path) |
| `apps/response-reviewer/src/App.svelte` | 3 | PDF chip in manual-add preview; "save to inbox instead" toggle |
| `apps/response-reviewer/src/app.css` | 3 | Styles for the chip + toggle |
| `clients/reach-edu/.gitattributes` | 5 | NEW — git-lfs rules for binary types |
| `context-v/specs/Corpus-Inbox-Capture-and-Triage.md` | 2, 5 | Document `binary_asset` block in the frontmatter contract; document LFS discipline in filesystem-shape section. Revision entry. |

## Open questions

- **HEAD vs probe-by-GET-and-bail-on-non-PDF.** Some servers
  reject HEAD or lie about Content-Type. Lean: HEAD first, fall
  back to URL-suffix detection, GET only when we're confident.
  Don't GET-and-bail; wasteful.
- **Size cap.** 50MB is generous for most foundation-quality PDFs
  but cuts off the very long reports. The cap is configurable per
  fire (`max_bytes?` option on `downloadBinaryAsset`); the v1
  default sits at 50MB.
- **PDF re-extraction with a better tool.** Marker / PyMuPDF /
  unstructured.io produce much better extraction than Jina on
  table-heavy PDFs. The binary download enables this — but the
  extraction itself is a separate plan. When that lands, the
  inbox's `extra_metadata` should gain a `pdf_reextraction:
  { tool, extracted_at, body_path? }` block.
- **Triage of a .md + .pdf pair.** When triage moves
  `inbox/2026-06-09_<slug>.md` to
  `<funder-slug>/2026-06-09_<slug>.md`, does the .pdf move
  alongside? Lean: yes, atomic pair. The triage spec needs to
  honor this; flag in [[../specs/Corpus-Inbox-Capture-and-Triage]]
  open questions.
- **Per-funder corpus binary support.** Today's
  `corpus.add` (per-funder) doesn't download binaries. Should this
  plan extend it? Lean: yes, in a follow-on — the operator wants
  PDFs filed to a specific funder's corpus too, not just inbox.
  Same primitive, same writer pattern, different directory.
- **The interim "save to inbox instead" toggle.** Lives in
  Content Reader as a stopgap. When `apps/corpus-inbox/` ships
  the toggle goes away. Is that the right move, or should
  Content Reader keep an inbox-target affordance permanently?
  Lean: keep it. Inbox-from-Content-Reader is a valuable rhythm
  even with the dedicated surface.
- **Git-LFS on existing PDFs.** Should we migrate the existing
  inbox .pdf captures from yesterday's milestone (none yet, but
  the DOL one's .pdf will be the first when this plan ships) into
  LFS retroactively, or only LFS-track new ones? Lean: LFS from
  the start — phase 5 lands before phase 2 if practical.
- **Bandwidth cost.** Per-host serialization for the binary
  download (same as the Jina fetcher) prevents bursts. Don't
  download the same URL twice if it's already cached on disk
  (sha256 check against existing inbox files).
- **What about the Cloudflare-stub case** (`just-a-moment.md`
  from yesterday)? The URL is gone, the content is gone, the
  binary wouldn't have been a PDF anyway. The plan doesn't
  address Cloudflare interception; that's a separate "URL
  refresher" concern.

## Migration / sequencing

Per the [[branch-cadence]] feedback memory:

- Phase 1 alone is a trunk-shaped commit (single file, no
  user-facing change).
- Phases 2 + 4 land together on trunk (handler + writer + verify).
- Phase 3 (UI work in two surfaces) is named-branch territory —
  multi-file, multi-microfrontend, user-visible.
- Phase 5 is trunk + a one-time submodule commit.

Suggested order: **1 → 5 → 2 → 4 → 3.** LFS before any binary
hits the repo. Backend primitive before either UI touches it.
Verification before the UI shows it. Then the two UI surfaces
together because they share the chip / toggle patterns.

## See also

- [[../specs/Corpus-Inbox-Capture-and-Triage]] — the parent spec.
  `binary_asset` is a new frontmatter block on top of its existing
  contract. The dedicated `apps/corpus-inbox/` microfrontend
  it specs will inherit the PDF affordances trivially.
- [[../specs/Funder-Content-Corpus-Workflow]] — the per-funder
  corpus workflow. The follow-on extension lifts `corpus.add` to
  support binaries the same way `corpus.inbox.add` will.
- [[../specs/Chat-Context-Awareness-Architecture]] — the chat
  result-bubble extension is a small instance of the Layer 3 verb
  registry's `result_renderer` hook (not yet specced; candidate
  for that layer).
- [[../explorations/Per-Client-Privacy-and-the-Path-Off-Local]]
  §Path D — the per-client filesystem layout binaries land in.
  LFS bandwidth is paid privately.
- [[../explorations/In-App-Browser-Or-Plugin-For-Corpus-Add]] —
  the future plugin path will inherit PDF download cleanly
  (operator clicks "save this tab" on a PDF page; backend writes
  the binary).
- 2026-06-08 milestone commit `5910914` — the inbox-verb ship
  this plan extends. The DOL PDF captured there is the worked
  example of what this plan unlocks.
