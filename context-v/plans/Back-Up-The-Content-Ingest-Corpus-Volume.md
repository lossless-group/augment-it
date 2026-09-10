---
title: "Back Up the Content-Ingest Corpus Volume — the corpus has no second copy"
lede: >-
  Every fetch writes to a single Railway volume that nothing backs up, nothing mirrors, and only one process can even read.
date_created: 2026-09-10
date_modified: 2026-09-10
date_authored_initial_draft: 2026-09-10
date_authored_current_draft: 2026-09-10
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
at_semantic_version: 0.0.0.1
status: Open
tags:
  - Plan
  - Augment-It
  - Railway
  - Volumes
  - Backup
  - Corpus
  - Durability
site_uuid: d2e5fc43-a311-44e7-bda0-15dfd2a3cf85
hex_code: 1sx7fg
publish: true
---

# Back Up the Content-Ingest Corpus Volume

## Why care?

The corpus is the accumulated product of every fetch, every curation decision, and every
manually attached PDF. It lives on one Railway volume, with no backup, no mirror, and no
export path. If that volume is lost, the markdown and the binaries are gone — SurrealDB would
still hold the `corpus_path` rows pointing at files that no longer exist.

This is already named as a Known Gap in `DEPLOYMENT.md`. This plan is about closing it rather
than continuing to record it.

## Current state

```
Service:  content-ingest
Volume:   content-ingest-volume  (c57f3cb0-0f63-4b95-a687-939fb61a69cf)
Mount:    /clients   (CLIENTS_ROOT=/clients)
Layout:   /clients/<client_slug>/corpus/<type>s/<domain_slug>/sources/<source_slug>.md
```

Three properties make this harder than a normal backup:

1. **Railway volumes are strictly single-service** — confirmed via Railway docs and support.
   `content-ingest` is the only process that can read these files. `workspace-service` has its
   own separate volume at `/data`.
2. **The original plan doesn't translate.** It assumed a DigitalOcean box whose filesystem an
   `rclone` cron job could reach directly. Railway's volume model has no such external handle.
3. **The laptop is not a copy.** Local `clients/humain-vc/corpus/theses/` holds three of the
   seven thesis corpora. `wearables-and-somatic-markers` — which holds a fetched article —
   does not exist locally at all.

## The plan

### Phase 1 — Get a copy off the volume today (one-off, unblocks everything)

Before designing anything durable, take a snapshot. This doubles as the first backup that
volume has ever had.

```bash
railway link   # augment-it / production / content-ingest
railway run -- tar czf - -C /clients . > augment-it-clients-$(date +%Y%m%d).tar.gz
```

Read-only, no service changes, no redeploy. Verify the archive lists the expected client dirs
and that at least one known file is present and non-empty before trusting it.

### Phase 2 — Decide the durable target

Options, in rough order of fit:

- **Cloudflare R2** — what `DEPLOYMENT.md` already sketches. S3-compatible, no egress fees,
  cheap at corpus scale.
- **Backblaze B2** — similar economics, one more vendor.
- **A git repo per client** — the `clients/<slug>` dirs are already git repos (submodules).
  Attractive for the markdown, wrong for multi-MB PDFs without LFS.

Recommendation: **R2 for everything**, with the per-client git repos continuing to carry
markdown as they do now. Decide before building; record the decision.

### Phase 3 — Periodic push from inside content-ingest

Because the volume is single-service, the backup job must run **inside** `content-ingest`. A
sidecar cannot mount it.

1. Add an S3-compatible client to the service.
2. Add a scheduled task that syncs `/clients` to the bucket under a dated prefix.
3. Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` as Railway
   variables on `content-ingest` only.
4. Emit a NATS event on completion so success and failure are observable rather than assumed.

### Phase 4 — Prove restore

A backup nobody has restored is a hypothesis. Restore into a scratch location and diff
against the live volume. Write down the restore procedure.

### Phase 5 (optional) — Sync to laptop

Once R2 holds the corpus, a laptop pull is `rclone sync` from the bucket rather than anything
Railway-specific. This is what would make local-only use of augment-it a real option instead
of a lossy one.

## Verification

- [ ] Phase 1 archive exists, lists all client dirs, and a spot-checked file is non-empty
- [ ] Scheduled sync completes and objects appear under the dated prefix
- [ ] A restore into a scratch dir diffs clean against the live volume
- [ ] Failure of the sync is visible (event emitted / run reddens), not silent
- [ ] `DEPLOYMENT.md`'s Known Gaps entry is updated to reflect the new state

## Risks and notes

- **Binaries dominate the size.** Attached PDFs (2.5 MB and up) are recorded separately as
  `binary_filename` on the usage row. Size the bucket and the sync window for those, not for
  the markdown.
- **Content-addressed storage is already in motion.** Commit `55eaffb` moves reach-edu corpus
  binaries to content-addressed storage; check whether that changes the on-volume layout
  before building against the current one.
- **Secrets handling.** Per `DEPLOYMENT.md`, set Railway variables without reading values
  back — confirm via `{"set": true}`-style responses.
- **Do not run the Phase 1 tar against a service mid-write** if a large fetch is in flight;
  it is read-only but the snapshot would be non-atomic.

## References

- `DEPLOYMENT.md` — Volumes section, and Known Gaps → "Corpus sync / backup"
- `services/content-ingest/` — the only process that can reach `/clients`
- [[Augment-It-as-CRM-Augmentation-Pipeline]]
