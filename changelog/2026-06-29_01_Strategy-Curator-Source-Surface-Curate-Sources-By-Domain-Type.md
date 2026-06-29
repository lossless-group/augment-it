---
date_created: 2026-06-29
date_modified: 2026-06-29
title: "Strategy Curator ships its source surface — curate sources by domain:type"
lede: "Pick a strategy, gather sources for it, and fully control each one: fetch full content, retry past anti-bot pages, edit the bibliographic fields, rename the file, attach a PDF you downloaded yourself, tag it — all writing straight to the corpus filesystem and a SurrealDB registry that never decouples. The landing-page-vs-PDF problem finally has an answer."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
files_changed:
  - apps/strategy-curator/src/curation.svelte.ts
  - apps/strategy-curator/src/SourceDetail.svelte
  - apps/strategy-curator/src/types.ts
  - apps/strategy-curator/src/app.css
  - services/record-surrealdb-resolver/src/domains.ts
  - services/content-ingest/src/corpus.ts
  - services/content-ingest/src/handlers.ts
  - services/content-ingest/src/jina.ts
  - services/content-ingest/Dockerfile
  - services/workspace/src/capabilities.ts
  - nats.conf
  - context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md
tags:
  - Progress-Update
  - Strategy-Curator
  - Source-Curation
  - Domain-Catalog
  - SurrealDB
  - Corpus
  - Ghostscript
  - reach-edu
---

## Why Care?

Real source curation is messy in ways a clean data model doesn't anticipate. The URL you
want to cite — a think-tank's report page, a GAO product page — usually **isn't** the actual
document; the PDF lives somewhere else, often behind an anti-bot wall that a fetcher can't get
past. Titles come back as `Just a moment…` (Cloudflare) or `Preparing to download…` (a PMC
interstitial). Reports weigh 30MB for no good reason. And the moment you tag or edit something,
you want it reflected in the file on disk, not trapped in a database.

This release makes the Strategy Curator handle all of that **from the source form itself** —
the analyst looks at a source and curates it, and the corpus + registry stay in lockstep
underneath. It's the difference between a demo and a tool you'd actually use to assemble a
grounded body of evidence for a strategy.

## What's New?

The full per-source lifecycle, every action a capability, every write landing on the corpus
filesystem **and** the SurrealDB index at once:

- **Fetch / Retry** — pull full content via Jina; retry bypasses Jina's cache for stale or
  interstitial captures.
- **Edit in place** — `title`, `publisher`, `published_date` are editable fields that write
  to both the registry and the file frontmatter. Editing the title **re-slugs and renames the
  file**, so a source never stays stuck as `just-a-moment.md`.
- **Rename** — a Filename field renames the file on disk directly and repoints the DB.
- **Attach a file** — download the real PDF yourself and attach it in the form. The source's
  identity (its citation URL) is unchanged; the bytes hang underneath as `sources/<slug>.pdf`.
- **Compress** — attached PDFs over 3MB get Ghostscript-squeezed (`/ebook`) on the way to disk,
  keeping the smaller of compressed/original (never inflates).
- **Remove** — drops the file + usage row, keeps the shared canonical identity.
- **Tag** — tags now write through to the file's `tags:` frontmatter, with a casing fix (below).

## The landing-page-vs-PDF answer

A GAO source is the cleanest example: you cite `gao.gov/products/gao-25-107040` (the durable,
human-facing page), but the report is a separate PDF that Jina gets a `403` on. So we split
**identity** from **content artifact**:

```
source.url   = gao.gov/products/gao-25-107040   ← identity, what you cite (unchanged)
sources/<slug>.pdf  ← the report you downloaded, attached underneath
```

One source, not two. The attach rides the same browser→WS→NATS path the app already uses for
CSV uploads. Which surfaced a real limit...

## Why your 30MB report wouldn't upload (and now does)

The file isn't stored in SurrealDB — it's written to the corpus filesystem; SurrealDB only
holds metadata. The size cap was a **transport** limit: bytes travel as base64 over NATS, and
`max_payload` was 8MB. We bumped it to **48MB** (a 28.5MB report base64s to ~38MB), and added
**server-side Ghostscript compression** so the *stored* copy stays a few MB even though the
upload was tens of MB. Government PDFs are usually bloated with high-DPI scans; `/ebook`
downsampling is exactly the right tool. The fallback is safe — if compression can't help, it
keeps the original and never makes a file bigger.

## "Impact-of-AI", not "Impact-Of-Ai"

Tags used to be forced to Train-Case, which mangled real tags: `Impact of AI` became
`Impact-Of-Ai` — "Of" shouldn't capitalize, "Ai" isn't an acronym. New rule: **enforce
dashes-not-spaces, preserve the casing you typed.** `Impact of AI` → `Impact-of-AI`,
`rural workforce` → `rural-workforce`. The user owns the casing. (`toTrainCase` → `toDashed`,
duplicated per-app per knots discipline.)

## Under the hood — what the live stack taught us

Everything is now **runtime-verified end-to-end** (`pnpm stack up`): UI → workspace WS → NATS →
resolver → SurrealDB + content-ingest → corpus files. Getting there meant collecting a few
scars worth writing down:

- **SurrealDB strict mode** needs `DEFINE TABLE/INDEX IF NOT EXISTS` before any use; `ORDER BY`
  a field requires that field in the `SELECT`; and identity keys must be `type::string(...)` —
  the raw `uuid` type doesn't survive a JSON/NATS round-trip and silently fails `WHERE` matches.
- **"Is my change live?"** A backend change is inert until its container is rebuilt. The single
  most useful debug move when something "doesn't work": `docker compose ps` (is it `Up Ns` or
  `Up Nh`?), then fire the NATS subject directly to isolate a correct backend from a stale
  frontend. Twice this turn the code was right and only the deploy was stale.
- **Svelte 5 reactivity:** mutating a nested `$state` field in place doesn't reliably re-render
  — replace the whole array element with a new object.

Full as-built detail and the gotcha checklist live in the spec:
[[Strategy-Curator-Entry-Point-for-Augment-It]].

## What's Next

- An **interstitial detector** so `Just a moment…` / `Preparing to download…` get flagged at
  add time instead of becoming junk-titled sources.
- **Auto text-extraction** from attached PDFs (currently attach stores + marks fetched; extracts
  are added by hand).
- An optional **`content_url`** for "the PDF is fetchable, just elsewhere" — no manual download
  needed.

## Files Touched

The Svelte remote (`apps/strategy-curator/`), the resolver's `domains.ts` (capability handlers
+ the `toDashed` normalizer), content-ingest's `corpus.ts` / `handlers.ts` / `jina.ts` / its
Dockerfile (Ghostscript), `nats.conf` (the payload bump), workspace `capabilities.ts` (new
capability routes), and the spec.
