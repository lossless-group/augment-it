---
title: "Source Content Storage — SurrealDB-Primary, Local as a Per-User Toggle"
lede: "Flip the content store: the fetched article body becomes a field on the canonical `sources` row and analyst Extracts become per-`source_usages` — so content access unifies with canonical-layer access, both through the didi.sh-authed DB. The local filesystem write demotes to an explicit per-workspace + per-user toggle: an export for each collaborator's own local RAG, not the primary store. R2 (backup) and Syncthing (live FS mirror) stay as already-scoped substrate."
date_created: 2026-08-02
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.2
status: Draft — Forks A/B/C Decided; Migration + Collaboration Transport Open
tags:
  - Spec
  - Augment-It
  - Content-Ingest
  - SurrealDB
  - Storage
  - Corpus
  - RAG
  - Cloudflare-R2
  - Syncthing
  - Path-Off-Local
---

# Source Content Storage — SurrealDB-Primary, Local as a Per-User Toggle

## Why Care?

Today the storage model is the inverse of what it should be. The markdown body
lives **only on the filesystem** (`CLIENTS_ROOT`); SurrealDB is "the rebuildable
**index**" (domains.ts:16) and holds no content. There's **no local toggle**
(the file write is unconditional) and the write order is **local-first, then
DB, non-atomic**.

That shape is a fossil of an ambition never shipped: corpus files on a **remote
filesystem**. We explored it ([[JuiceFS-Pinned-Path-Off-Local-Substrate]]),
rejected a live mount, and landed on **R2 via rclone for backup** — but the
content itself never left the filesystem, so local-first bought nothing but
drift. The body is just a markdown **string**; SurrealDB stores that trivially.

**Decision (operator, 2026-08-02): store the content in SurrealDB; make the
local write an explicit per-workspace + per-user toggle.**

## The North Star this serves

Enable **RAG/KAG for a whole team, by topic**. A topic = a domain/corpus. Every
collaborator should be able to retrieve over the corpus — some through the
hosted app, some by syncing a topic's content down to *their own* local folder
for local retrieval. For that, the canonical content has to live somewhere every
authed collaborator can reach: the **DB**, not one operator's laptop.

## The key structural win

The [[Syncthing-For-Collaborator-Access-To-The-Corpus]] exploration drew a hard
line: *Syncthing only solves the filesystem-corpus leg; the SurrealDB canonical
layer (persons/orgs/observations) is a separate access problem needing didi.sh
auth.* **Putting content in the DB erases that line** — content access becomes
canonical-layer access, one auth path (didi.sh) for both. Collaborators no
longer *need* a filesystem mirror to read content; the mirror becomes an
optional local-RAG convenience.

## The decision, stated

1. **SurrealDB is the primary content store.** The fetched body is a `content`
   field on the canonical **`sources`** row (client-agnostic — same URL, same
   body). Analyst **Extracts** are stored per **`source_usages`** (each client's
   own curation of that source). Reads serve both from the DB.
2. **Local filesystem write is an explicit toggle**, off by default, scoped
   **per-workspace AND per-user** — each collaborator names their own local FS
   location for a topic-scoped sync of the content, for their local RAG. (This
   is the export/sync leg the Syncthing exploration was circling; content-in-DB
   makes it optional, not load-bearing.)
3. **Write order is DB-first.** DB success = "saved." When a local destination
   is enabled, that write must **also** succeed for the operation to report done
   — a failure surfaces explicitly ("saved to db, local export failed"), never a
   silent half-write.
4. **`corpus_path` becomes optional** — populated only where a local mirror
   exists. R2 backup (rclone) and any Syncthing FS mirror operate on that
   optional local tier, unchanged.

## Resolved forks (operator, 2026-08-02)

| Fork | Decision |
|---|---|
| **A — body location** | `content` field on **`sources`** (client-agnostic). *Implementation note:* project it away on list/metadata reads so the blob loads only when content is actually requested. |
| **B — Extracts location** | Per **`source_usages`** (per client). Two clients annotate the same canonical source independently. |
| **C — local toggle** | **Per-workspace + per-user**, default **off**. Each user picks their own local sync location. |

## Still open (need a call before/at build)

- **D — Migration.** Bodies + Extracts currently live only in files, across
  **three** diverging copies: Michael's laptop (`clients/*/corpus`), the Railway
  volume (`/data/clients`), and git (committed corpus). Backfill has to read
  existing corpus `.md`, split body vs Extracts, write into the new columns —
  *and* reconcile which of the three copies is source-of-truth per record.
- **Collaboration transport.** With content in the DB, is the per-user local
  sync a **DB→FS export** (new, simple, one-directional) or does it reuse the
  **Syncthing** `Receive-Only` mesh from the exploration? Leaning DB→FS export
  now that content is canonical in the DB; Syncthing/R2 remain for FS-tier
  mirror/backup, not the primary access path.
- **Blob size in Surreal.** Bodies are ~tens of KB (the Springer one was ~83KB);
  fine as a field, but confirm query/storage patterns don't regress on large rows
  (drives the "project away on list reads" note in Fork A).

## Write contract (target)

```
fetch/save(source):
  1. resolve content + metadata (Jina, two-profile parser)
  2. WRITE DB:  sources.content (body) + source_usages (Extracts, status='fetched', bib)
       └─ fail → abort, report "save failed (db)"; nothing half-committed
  3. FOR each enabled local destination (per-workspace and/or per-user):
       WRITE file (dest/…/<slug>.md), preserving Extracts
         └─ fail → report "saved to db, local export failed at <dest>" (explicit)
  4. return { ok, source_uuid, stored: ['db', ...enabledLocalDests] }
```

Reads serve body + Extracts from the DB; local files are mirrors, and R2 backs
up the local tier via rclone as already decided.

## Cross-references

- [[Syncthing-For-Collaborator-Access-To-The-Corpus]] — the FS-mirror leg; this spec makes it optional.
- [[Per-Client-Privacy-and-the-Path-Off-Local]] — isolation posture that shapes per-user/per-client scoping.
- [[Best-Way-to-RAG-Over-the-Corpus]] — the retrieval design this storage model feeds.
- [[JuiceFS-Pinned-Path-Off-Local-Substrate]] — the R2/rclone backup decision, not re-litigated here.
- [[Fetch-Full-Content-Clobbers-Operator-Metadata]] · [[Jina-Metadata-Parser-Is-Blog-Only-Needs-Two-Profiles-And-Routing]] — the fetch/parse steps feeding step 1.
- [[Strategy-Curator-Entry-Point-for-Augment-It]] — the surface.
