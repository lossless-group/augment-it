---
title: "Inbox verb stops losing PDFs — the binary lands alongside Jina's markdown, sha256-verified, LFS-tracked; the chat composer grows an upward-opening commands popover so the verb is discoverable from the surface itself"
lede: "Yesterday `/inbox <url>` shipped and the very first capture exposed the load-bearing failure: the DOL workforce-strategy PDF Jina-extracted into a 5KB markdown stub and the original binary was *gone* — no page-numbered citation, no figure reference, no re-extraction by a better tool, no copy to hand a co-researcher. Today the inbox handler grew a HEAD-probe → URL-suffix → streamed-GET binary downloader behind the same NATS subject; the .pdf lands as a sibling of the .md with a matching dated slug, sha256-verified end-to-end (the response envelope hash matches the on-disk hash, byte for byte), under a per-client `.gitattributes` that LFS-tracks `*.pdf` so the per-client repo's git pack stays sane. Verified live: `/inbox https://insights.hanoverresearch.com/.../Top-Career-Skills-for-2-Year-Grads-2026.pdf?_gl=…` (full Hanover URL with eight tracking params) landed a 1.15 MB PDF (`file` confirms PDF v1.7) next to a markdown index with the `binary_asset:` frontmatter block populated. Same scaffolding extends to docx/pptx/xlsx the moment those become operator pain. While we were in `apps/chat/` we added a small unrelated affordance the inbox verb had been quietly begging for: a Commands popover under the composer that opens *upward*, lists the slash-verb registry, and inserts the chosen verb at the start of the textarea — discoverability for a surface where the only way to know `/inbox` existed was to read the changelog."
publish: true
date_created: 2026-06-09
date_modified: 2026-06-09
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Corpus-Inbox
  - PDF
  - Binary-Assets
  - Content-Ingest
  - Agent-Chat
  - Content-Reader
  - Git-LFS
  - Discoverability
files_changed:
  - services/content-ingest/src/binary-asset.ts (NEW — downloadBinaryAsset(url, options?) primitive; HEAD probe → URL-suffix fallback → streamed GET with 50MB cap; sha256 over the buffer; returns BinaryAssetOk | BinaryAssetFail; standalone-testable, no NATS, no filesystem)
  - services/content-ingest/src/corpus.ts (AddInboxArgs gains optional binary_asset block; addToInbox returns InboxWriteResult with binary_asset summary; writer resolves a single dated stem and writes .md + .pdf atomically as siblings; buildInboxFrontmatter emits the binary_asset YAML block when the arg is present, with null filename in failure cases)
  - services/content-ingest/src/handlers.ts (corpus.inbox.add handler calls downloadBinaryAsset default-on; non-ok statuses other than unsupported_type still record a download_status block so the operator can see "we tried"; reply envelope and corpus.inbox.added event carry binary_asset; content_ingest.preview_url HEAD-probes and surfaces extra_metadata.is_pdf for the Content Reader chip)
  - services/workspace/src/capabilities.ts (corpus.inbox.add timeout bumped 30s → 90s for the binary-download path)
  - apps/chat/src/ResponseModeRenderer.svelte (inbox result bubble shows "📄 PDF saved (size · sha256-short)" on ok; a "PDF not saved — <status>" line on failure; fmtBytes helper)
  - apps/chat/src/ChatSurface.svelte (NEW Commands popover: COMMANDS registry, commands-bar trigger below the composer, popover anchored bottom:100% so it opens upward, click-outside + Escape close, pickCommand inserts the verb at the start of the textarea and parks the caret right after)
  - apps/chat/src/app.css (.inbox-binary, .commands-bar, .commands-trigger, .commands-popover, .command-row / verb / summary / example styles)
  - apps/response-reviewer/src/App.svelte (manual-add preview gains a "📄 PDF" chip from extra_metadata.is_pdf; "save to inbox instead" checkbox; addManualToInbox path routes to corpus.inbox.add with captured_from: 'content-reader' when the toggle is on)
  - apps/response-reviewer/src/app.css (.cr-pdf-chip, .cr-inbox-toggle styles)
  - clients/reach-edu/.gitattributes (NEW — LFS rules for *.pdf, *.docx, *.pptx, *.xlsx in the per-client repo)
---

# Inbox verb stops losing PDFs

## Why care

Yesterday's milestone (`5910914`) shipped `/inbox <url>` and the
chat could finally *do* something the operator wanted. Within the
hour, the first real capture exposed the load-bearing failure:

> `2026-06-09_america-s-talent-strategy-building-the-workforce-for-the-gol.md`
> — Jina-extracted text from
> `https://www.dol.gov/.../Americas-Talent-Strategy-Building-the-Workforce-for-the-Golden-Age.pdf`

The markdown landed. The PDF — the *thing* — did not. Which means
the operator can't cite it the way a PDF gets cited (page-numbered
quote, figure reference, the URL of the PDF as the *source*), can't
hand the binary to a co-researcher, can't re-extract with a better
tool later (Marker, PyMuPDF, unstructured.io all do dramatically
better on table-heavy reports than Jina's plain-text pass), and
can't include it as evidence in a memo. Jina gives us text but
the binary is *upstream* of it.

Today the inbox stops losing the upstream. Binary download is
default-on for any URL that resolves to an accepted binary type
(`application/pdf` today; docx/pptx/xlsx reserved). The .pdf lands
**alongside** the .md with a matching dated slug, sha256-verified,
under per-client LFS discipline so we don't bloat the git pack.

## What's new

- **A `downloadBinaryAsset` primitive** in `services/content-ingest/src/binary-asset.ts`.
  HEAD probe → URL-suffix fallback → streamed GET with a 50MB cap
  and sha256-over-the-buffer. Returns
  `{ ok: true; content_type; size_bytes; sha256; buffer } | { ok: false; status; error }`.
  Standalone-testable; no NATS, no filesystem — those belong to the
  handler.
- **The `corpus.inbox.add` handler now downloads the binary** when
  the source resolves to PDF. On success the writer drops
  `<dated_slug>.pdf` next to `<dated_slug>.md` and the reply
  envelope grows a `binary_asset` summary. On failure (other than
  `unsupported_type`, which is the common HTML case) the
  frontmatter still carries a `binary_asset:` block with
  `download_status` set so the operator can see we tried.
- **The chat result bubble shows "📄 PDF saved (1.1 MB · `653134d4`)"**
  when the binary lands, and a muted "📄 PDF not saved — <status>"
  line when it doesn't. The sha256 short-hash is intentional: it's
  the fingerprint the operator quotes to a co-researcher to prove
  they have the same bytes.
- **The Content Reader manual-add preview gains a PDF chip and a
  "save to inbox instead" toggle.** Paste a PDF URL into the
  per-record add box and the preview now shows a "📄 PDF" chip
  (from `extra_metadata.is_pdf` on the preview, set by a HEAD
  probe in `content_ingest.preview_url`). Tick the toggle and the
  add button reroutes from `corpus.add` (per-funder) to
  `corpus.inbox.add` (inbox, with binary download). The toggle is
  the interim inbox-UI surface; the dedicated
  `apps/corpus-inbox/` microfrontend per
  [[../specs/Corpus-Inbox-Capture-and-Triage]] is the longer-term
  home, but today the operator can inbox PDFs from where they
  already are.
- **Per-client LFS discipline.** `clients/reach-edu/.gitattributes`
  LFS-tracks `*.pdf`, `*.docx`, `*.pptx`, `*.xlsx`. The per-client
  repos are private (per [[../explorations/Per-Client-Privacy-and-the-Path-Off-Local]]
  §Path D) so there's no public-host bandwidth concern; the cost
  is LFS bandwidth on push/pull which for a small team is fine.
- **A Commands popover under the chat composer.** The slash-verb
  registry has one entry today (`/inbox`) and that was the surface
  area the operator had no way to *discover* — the only paths to
  learning the verb existed were "read the changelog" or "have
  someone tell you." A small `Commands ▴` trigger lives below the
  textarea; click it and a popover opens upward listing every
  verb with a one-line summary and an example. Pick one and it
  drops into the textarea at the leading position with the caret
  right after, ready for the URL.

## How it works

```
Operator types  /inbox <url>  in chat
        │
        ▼
chat-turn.ts → workspace.chat
        │
        ▼
chat_invoke('corpus.inbox.add', { client_id, url, captured_from })
        │
        ▼
NATS: corpus.inbox.add.requested
        │
        ▼
handlers.ts corpus.inbox.add branch
        │
        ├──► fetchViaJina(url)            ───► markdown_body, title, fetched_at
        │                                       (existing path — unchanged)
        │
        └──► downloadBinaryAsset(url)     ───► { ok, content_type, size, sha256, buffer }
                  │                              (new path — Phase 1 primitive)
                  │
                  ▼
              HEAD → URL-suffix → streamed GET with 50MB cap → sha256
        │
        ▼
addToInbox({ ..., binary_asset })
        │
        ├──► writeFile(<stem>.md, frontmatter + markdown_body)
        └──► writeFile(<stem>.pdf, buffer)         ◄── NEW sibling
```

The key invariant: **binary and markdown share the same dated slug
and live as siblings in the same directory**. No separate
`_assets/` tree, no UUID lookup, no manifest. The filesystem
correlates the pair by name, full stop. When triage moves the .md
into a per-funder corpus directory, the .pdf moves with it — same
slug, atomic pair.

The frontmatter contract extension is a single optional top-level
`binary_asset:` block. Present means there's a binary companion;
absent means the URL was HTML (or binary-fetch was opted out):

```yaml
binary_asset:
  filename: "2026-06-09_top-career-skills-for-2-year-grads-2026-pdf.pdf"
  content_type: "application/pdf"
  size_bytes: 1152367
  sha256: "653134d438b7d362575d0b349e48ac5382d4ec4d5023ec78241ef904805a25f3"
  downloaded_at: 2026-06-09T18:59:40.106Z
  download_status: "ok"          # ok | size_capped | http_error | unsupported_type | fetch_failed
```

A `download_status` of `ok` ships with a real filename; the
failure statuses ship with `filename: null` so the operator can
see "we tried and this is why we don't have it" without
re-firing the URL just to find out.

## Under the hood

### The probe ladder

```ts
// binary-asset.ts
async function downloadBinaryAsset(url, options) {
  // 1. HEAD probe — read content-type
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  const probedType = normalizeContentType(head.headers.get('content-type'));

  // 2. URL-suffix fallback — for servers that lie about content-type
  //    or set application/octet-stream on a perfectly good PDF
  const suffixType = typeFromUrlSuffix(parsed);

  // 3. Reconcile — accept only if the resolved type is in accepted_types
  const resolvedType = (probedType && accepted_types.includes(probedType))
    ? probedType
    : (suffixType && accepted_types.includes(suffixType))
      ? suffixType
      : null;
  if (!resolvedType) return { ok: false, status: 'unsupported_type', ... };

  // 4. Streamed GET — bail at the cap rather than buffer-then-reject
  const reader = (await fetch(url, { redirect: 'follow' })).body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max_bytes) { capped = true; await reader.cancel(); break; }
    chunks.push(value);
  }

  // 5. sha256 over the assembled buffer
  return { ok: true, content_type, size_bytes, sha256, buffer, status: 'ok' };
}
```

Why HEAD first: some servers reject HEAD or lie about Content-Type
(Hanover's hubfs is fine; some foundation CDNs aren't). Paying an
extra round-trip beats GETing a 50MB PDF and then deciding to bail.
Why a streamed GET with `reader.cancel()`: a 1GB PDF would consume
1GB of memory if we buffered first and rejected after; the stream
stops as soon as we cross the cap, no matter how big the response
actually is.

Why the Hanover URL was the right verification case: it carries
**eight Google Analytics tracking parameters** in the query string
(`_gl=1*19bjwln*_gcl_au*…*_ga_E09YTKFFM7*…`). The URL-suffix check
inspects the pathname only, so a tracking-laden URL doesn't confuse
detection. And it landed clean — `file(1)` confirms PDF v1.7, sha256
matches the response envelope byte-for-byte.

### The frontmatter writer changes shape

The collision-suffix loop now runs against a single **dated stem**
(`2026-06-09_top-career-skills-for-2-year-grads-2026-pdf`) rather
than against the `.md` filename. The .pdf reuses the resolved stem
— same slug, no separate collision check, atomic pair.

```ts
// corpus.ts
let stem = `${datePart}_${slug}`;
while (await exists(join(baseDir, `${stem}.md`))) {
  const suffix = Math.random().toString(36).slice(2, 6);
  stem = `${datePart}_${slug}_${suffix}`;
  if (++tries > 8) throw new Error('exhausted collision-suffix attempts');
}
// ...
await writeFile(join(baseDir, `${stem}.md`), frontmatter + body);
if (binary?.buffer && ext) {
  await writeFile(join(baseDir, `${stem}${ext}`), binary.buffer);
}
```

If the .md collision-resolves to `<stem>_a3f1.md`, the .pdf lands
as `<stem>_a3f1.pdf`. Triage moves them as a pair; nothing in the
schema needs to track "which .pdf goes with which .md" because the
filesystem does.

### The Commands popover

```svelte
<div class="commands-bar" bind:this={commandsContainerEl}>
  <button class="commands-trigger" onclick={toggleCommands}>
    <span class="caret">{commandsOpen ? '▾' : '▴'}</span>
    Commands <span class="muted">({COMMANDS.length})</span>
  </button>
  {#if commandsOpen}
    <div class="commands-popover" role="menu">  <!-- absolute; bottom: 100% + 0.35rem -->
      …
    </div>
  {/if}
</div>
```

`COMMANDS` is a simple in-file registry today (one entry, `/inbox`).
That's deliberate — the chat verb roster is itself v0.0.1 and the
[[../specs/Chat-Context-Awareness-Architecture]] spec calls out
deriving the registry from per-verb descriptors as the v0.0.2 cleanup.
When that lands the popover rerenders straight from the new source,
no shape change needed.

The popover anchors via `bottom: calc(100% + 0.35rem); left: 0.8rem;
right: 0.8rem` so it opens *upward* from the trigger and stretches
across the composer width up to `max-width: 28rem`. Click-outside
and Escape both close it. Clicking a row inserts the verb at the
start of the textarea (replacing any leading slash-word the operator
already started typing), parks the caret right after the verb via
`setSelectionRange`, and focuses the textarea — so the next
keystroke types the URL.

## Verified live

Fired `/inbox <hanover-url>` end-to-end through the rebuilt stack
(content-ingest + workspace-service Docker containers; NATS, Jina,
filesystem):

```json
{
  "corpus_path": "reach-edu/corpus/inbox/2026-06-09_top-career-skills-for-2-year-grads-2026-pdf.md",
  "written_at": "2026-06-09T18:59:40.112Z",
  "binary_asset": {
    "filename": "2026-06-09_top-career-skills-for-2-year-grads-2026-pdf.pdf",
    "size_bytes": 1152367,
    "sha256": "653134d438b7d362575d0b349e48ac5382d4ec4d5023ec78241ef904805a25f3",
    "sha256_short": "653134d4",
    "download_status": "ok"
  }
}
```

On disk:

```
.rw-r--r-- 6.3k  2026-06-09_top-career-skills-for-2-year-grads-2026-pdf.md
.rw-r--r-- 1.2M  2026-06-09_top-career-skills-for-2-year-grads-2026-pdf.pdf
```

```
$ file 2026-06-09_top-career-skills-for-2-year-grads-2026-pdf.pdf
PDF document, version 1.7

$ shasum -a 256 2026-06-09_top-career-skills-for-2-year-grads-2026-pdf.pdf
653134d4…  2026-06-09_top-career-skills-for-2-year-grads-2026-pdf.pdf
```

Response-envelope sha256 matches the on-disk sha256 byte for byte.
Negative case (an HTML URL) verified separately: the .md lands, no
.pdf sibling, no `binary_asset:` block in the frontmatter — exactly
what the `unsupported_type` short-circuit promises.

## What's next

- **Operator step (Phase 5 one-time):** `git lfs install` once per
  machine and, in `clients/reach-edu/`, decide whether to
  `git lfs migrate import --include="*.pdf"` retroactively or only
  LFS-track new ones. The plan leans "LFS from the start" — the
  Hanover PDF is the first to land under the new discipline so
  there's nothing legacy to migrate yet.
- **Per-funder corpus binary support.** Today `corpus.add` (the
  per-funder writer) doesn't download binaries. When the operator
  wants a PDF filed to a specific funder's corpus, not the inbox,
  the same primitive lifts cleanly — flagged as a follow-on in the
  plan's open questions.
- **Triage of a .md + .pdf pair.** When triage moves
  `inbox/2026-06-09_<slug>.md` to `<funder-slug>/2026-06-09_<slug>.md`,
  the .pdf moves alongside as an atomic pair. The
  [[../specs/Corpus-Inbox-Capture-and-Triage]] spec needs to honor
  this; flagged as an open question.
- **PDF re-extraction with a better tool.** The binary download
  unlocks this — Marker / PyMuPDF / unstructured.io produce much
  better extraction on table-heavy PDFs than Jina's text pass. The
  inbox's `extra_metadata` would gain a `pdf_reextraction: { tool,
  extracted_at, body_path? }` block. Separate plan when that lands.
- **More chat verbs → more popover rows.** The Commands popover is
  scaffolding for a discoverability surface that gets meaningfully
  more useful with each verb that ships. v0.0.2 of the chat-context
  architecture is where the registry stops being a hand-written
  array.

## See also

- [[../context-v/plans/Download-PDFs-into-Corpus-Inbox]] — the plan
  this commit implements end-to-end (all five phases). Operator
  framing was three words: *"add to inbox functionality on both UI
  and agent-chat to download PDFs for corpus."*
- [[2026-06-08_02_Agent-Chat-First-Useful-Verb-Inbox-And-Context-Awareness-Architecture]]
  — yesterday's milestone. The inbox verb shipped; today's commit
  makes it stop losing the upstream artifact.
- [[../context-v/specs/Corpus-Inbox-Capture-and-Triage]] — the
  parent spec. `binary_asset:` is a new optional frontmatter block
  on top of its existing contract; the dedicated
  `apps/corpus-inbox/` microfrontend it specs will inherit the PDF
  affordances trivially.
- [[../context-v/specs/Chat-Context-Awareness-Architecture]] — the
  v0.0.2 cleanup that turns the chat verb registry into a derived
  thing; the Commands popover renders straight from whichever
  registry shape lands.
- [[../context-v/explorations/Per-Client-Privacy-and-the-Path-Off-Local]]
  §Path D — the per-client filesystem layout binaries land in. LFS
  bandwidth is paid privately.
