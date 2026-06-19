---
title: "JuiceFS — POSIX-Over-Object-Storage (Explored, Then Set Aside for rclone-to-R2)"
lede: "Explored JuiceFS to give the corpus a 'path off local.' Verdict: wrong shape for one-person, local-first content work — it's a network drive needing a macOS kernel extension, not Dropbox. Superseded by automated rclone sync to Cloudflare R2. Kept for the hard-won R2-credential recipe (which still works)."
date_created: 2026-06-18
date_modified: 2026-06-18
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8 (1M context)
semantic_version: 0.0.1.0
tags:
  - Exploration
  - Augment-It
  - JuiceFS
  - Storage-Substrate
  - Path-Off-Local
  - Object-Storage
  - Cloudflare-R2
  - rclone
  - Corpus
status: Deferred
deferral_note: "JuiceFS works and the R2 storage under it is verified, but it's the wrong access pattern for one-person local-first content development (network-drive semantics, no real local files, breaks offline, needs the macFUSE kernel extension). Superseded by automated rclone sync to R2 — same bucket, local-first, no kernel extension. JuiceFS stays relevant only if we later need a many-machine shared POSIX filesystem or datasets too big for local disk."
---

# JuiceFS — explored, then set aside for rclone-to-R2

## Verdict first (2026-06-18): we are NOT using JuiceFS

After standing the whole thing up end-to-end, the answer is **no — not for this**. Read this section before the rest; everything below it is the journey and the still-useful R2 plumbing.

**What JuiceFS actually is:** it stores *nothing itself*. It's a translator that makes cloud object storage (here Cloudflare R2) *look like a local folder* (`~/jfs`). Save a file into the folder → JuiceFS turns that into an upload to R2. To make "a folder" on macOS it needs **macFUSE**, a kernel extension.

**Why it's the wrong shape for us:** it's a **network drive, not Dropbox**. The folder isn't real local files — it's a live window into R2 with a cache. Stop the mount or lose the network and the contents aren't there. For one person doing heavy **local content development + data augmentation** (editing markdown, running scripts, working offline, wanting real local copies), that's backwards — every uncached read hits the network, and it depends on a kernel extension we'd rather not run.

| | Real local files? | Auto-sync? | Offline? | Needs |
|---|---|---|---|---|
| **JuiceFS mount** | ❌ window into the cloud | ✅ (it *is* the cloud) | ❌ | macFUSE kernel ext |
| **rclone, automated** | ✅ genuine local copies | ✅ every few min | ✅ | rclone (no kernel ext) |

**When JuiceFS *would* be right (its real niche, not ours):** a dataset too big to fit on local disk, or **many machines/containers reading-writing the same files at once** (compute clusters, ML training, shared scratch). None of that is our situation today.

**The decision:** keep **Cloudflare R2** as the cloud home for the corpus (zero egress, we own the data — all verified working), but reach it with **automated `rclone` sync**, local-first, Dropbox-style, **no macFUSE**. See [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]] for where the corpus fits. macFUSE can be uninstalled.

> The rest of this doc is preserved because the **R2 side is real and reusable**: the bucket, the credentials, and especially the non-obvious "Cloudflare never shows a Secret" recipe. rclone uses the exact same R2 keys.

## Why this got explored at all

augment-it's corpus lives as markdown files on one laptop's local disk — the right home for LLM-ingestible text (git-trackable, greppable; the DB stores entities + edges), but "one laptop" is a portability ceiling. The moment a second machine or a cloud job needs the corpus, local disk is the wall. JuiceFS was surveyed in [[Joined-People-UI-and-the-Network-First-Pivot]] as the *portability* answer (cloud-backed filesystem) — and it technically is. The journey below is how we proved R2 works and then concluded a live mount is the wrong access pattern for it.

It is **not** a competitor to SurrealDB. The hybrid stands: **SurrealDB for entities/edges, a filesystem for corpus/commentary, slug as the join** — the only question this doc settled is *how the corpus filesystem reaches the cloud* (answer: rclone sync to R2, not a JuiceFS mount).

## What it actually is

POSIX filesystem = **object storage (the data) + a metadata service (the directory tree, file names, permissions)**. Two editions:

- **Community** (open source): you bring your own metadata engine (Redis/Postgres/SQLite) — `juicefs format <metadata-url> <name>` then `juicefs mount <metadata-url> <mountpoint>`.
- **Cloud Service** (hosted metadata, juicefs.com): metadata is managed for you; you authenticate a *volume* with a **token**, then mount by volume name. **This is what we have** — the command `juicefs mount lossless-core ~/jfs` (volume name, no metadata URL) + a token is the Cloud edition's shape.

> **Two-layer auth (the thing that bit us):** the **token** unlocks the *metadata* only. The *data* lives in an **object-storage bucket** that needs its **own** credentials (`--access-key`/`--secret-key`). **JuiceFS Cloud manages metadata ONLY — you always bring your own object storage; there is no JuiceFS-hosted-data option** (confirmed 2026-06-18: the console's storage dropdown is all external providers — Amazon S3, GCS, Azure, Backblaze B2, Wasabi, DigitalOcean Spaces, MinIO, … even local disk). Token-auth succeeding does NOT mean storage works; that's checked at mount via a storage test.

> **Why BYO storage (it's by design, not a gap):** JuiceFS sells the *hard* part — a managed, low-latency distributed **metadata** engine — and treats the bytes as commodity object storage you already own. Keeping data in *your* bucket means no lock-in, no egress bill to extract it, and you control region / cost / compliance while JuiceFS never sees the data. For us that's a *feature*: per-client isolation, encryption, and residency (the [[Per-Client-Privacy-and-the-Path-Off-Local]] concerns) stay in our hands.

## Current state (as of 2026-06-18)

| Thing | State |
|---|---|
| Volume | **`lossless-core`** — our own tree-wide volume (the throwaway `demo-c4345fed11297` was ditched). Use the exact name from the JuiceFS console if it differs. |
| Token | **`JUICEFS_LOSSLESS_TOKEN` in `~/.secrets`** (laptop-wide, not project `.env`) — the lossless-core volume spans the whole monorepo, so its token is laptop-wide infra alongside `ANTHROPIC_API_KEY` etc. |
| `juicefs` CLI | ✅ installed (via `curl -sSL https://d.juicefs.com/install \| sh -`) |
| macFUSE (required to mount on macOS) | ✅ installed (`/Library/Filesystems/macfuse.fs`) |
| Mountpoint | use `~/jfs` — **macOS `/` is read-only, you can't mount at `/jfs`** |
| Data storage backend | **Cloudflare R2, SOLVED + VERIFIED 2026-06-18.** R2 read/write confirmed two ways: native API (token-only) and **S3 SigV4 with derived keys** (the protocol JuiceFS uses) — PUT/GET/DELETE all 200/204. See **Resolution** below. Creds saved in `~/.secrets` (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`). |

**Secret-loading gotcha:** `~/.secrets` uses bare `KEY=value` (no `export`) and is not sourced by any shell profile, so `$JUICEFS_LOSSLESS_TOKEN` is not in the shell automatically. Load it for a command with `set -a; source ~/.secrets; set +a`.

## Standing it up (the three real steps)

`juicefs mount …` on its own is the *last* step. The full sequence:

```bash
# 1. Install the CLI (DONE — kept here for a fresh machine).
curl -sSL https://d.juicefs.com/install | sh -       # puts juicefs on PATH

# 2. AUTH — uses the token. NO sudo (sudo strips the env var). Load the token from
#    ~/.secrets (bare KEY=val, no export → use `set -a`), then auth. If the volume
#    needs object-store keys, the console's "Mount" tab prints the full line.
set -a; source ~/.secrets; set +a
juicefs auth lossless-core --token "$JUICEFS_LOSSLESS_TOKEN"   # writes ~/.juicefs/lossless-core.conf

# 3. MOUNT. macOS root volume / is READ-ONLY — you CANNOT mkdir /jfs (even with sudo).
#    Mount under your home dir, NO sudo (macFUSE handles it). -d = background.
mkdir -p ~/jfs
juicefs mount -d lossless-core ~/jfs

# verify / use / unmount
mount | grep jfs                 # confirm it's mounted
df -h ~/jfs                      # shows the volume
echo hi > ~/jfs/hello.txt        # write test
juicefs umount ~/jfs             # clean unmount
```

> The authoritative source for the install one-liner and the full `auth` command (with
> any access/secret keys) is the JuiceFS Cloud console for the `lossless-core` volume —
> it personalizes them.

### Cloudflare R2 backend (chosen 2026-06-18)

Zero egress fees — the right call for a corpus read repeatedly by retrieval. R2 is S3-compatible, so in JuiceFS it's the **Amazon S3** provider pointed at R2's endpoint.

**On Cloudflare:**
1. Dashboard → **R2** → **Create bucket** → name it `juicefs-lossless-core` (match the volume's existing bucket field). Location: Automatic is fine.
2. **Create the S3 keys — verified path** (Cloudflare docs, <https://developers.cloudflare.com/r2/api/tokens/>): on the **R2 Object Storage** page, in the **Account Details** box (same place the Account ID + endpoint live), click **"Manage"** next to **"API Tokens"** → **Create API Token** → permission **Object Read & Write** (scope to the bucket). The result screen shows, **once**: **Access Key ID** (= token id) and **Secret Access Key** (= SHA-256 of the token value — Cloudflare displays it, you don't compute it). Copy both immediately.
   - **THE REAL ROOT CAUSE (cost us an hour, 2026-06-18; confirmed by [Cloudflare community thread #843594, Oct 2025](https://community.cloudflare.com/t/cannot-generate-s3-compatible-api-key-for-r2-object-storage/843594)):** the S3 **Access Key ID + Secret are only generated when the token includes the R2 Storage permission.** Cloudflare's current UI routes you through the **permission-groups "Edit policy"** editor; if you create a token *without* adding R2 (e.g. it has "SAML Certificates Write, +38" but no R2), you get only a bearer **token** and **no secret** — which looks like "there is no secret option." Fix: in the **"Search for permission groups…"** box type **`R2`** → add **"Workers R2 Storage" → Edit** → create. *Now* the result screen shows Access Key ID + Secret. Must be an **Account** API token (Super Admin), not a User API token.
   - **Deterministic fallback** (Cloudflare docs): for R2, **Access Key ID = the token's ID**, **Secret Access Key = SHA-256 of the token value** → `printf "%s" "<TOKEN_VALUE>" | shasum -a 256`. So even a plain token can be converted to S3 creds.
   - Secret Access Key is shown once and cannot be retrieved — miss it → create a new token.
   - Confirmed values for our setup: bucket `lossless-core`, region **WNAM** (Western North America), endpoint `https://db2f7ba69a4181557f7f5a53ac598ca2.r2.cloudflarestorage.com`.

**In the JuiceFS console (volume → Object Storage):**
- Provider: **Amazon S3** · Bucket: `juicefs-lossless-core`
- Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (Region: `auto` if asked)
- Access Key / Secret Key: the R2 token pair · **Save** (clients must remount)

**Then re-auth + mount (no sudo):**
```bash
set -a; source ~/.secrets; set +a
juicefs auth lossless-core --token "$JUICEFS_LOSSLESS_TOKEN" \
  --access-key <R2_ACCESS_KEY_ID> --secret-key <R2_SECRET_KEY>
juicefs mount -d lossless-core ~/jfs && mount | grep jfs && df -h ~/jfs
```
Store the R2 config in `~/.secrets` **only** (laptop-wide; remove any copy from `augment-it/.env` to avoid split-brain), with consistent names:
```
CLOUDFLARE_R2_API_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY_ID=…
CLOUDFLARE_R2_SECRET_ACCESS_KEY=…
CLOUDFLARE_R2_BUCKET=juicefs-lossless-core
```
**Note: JuiceFS does NOT read these from `.env`/`.secrets`** — pass them on the `auth` CLI (or the console). The env vars are for our own scripts and as a re-auth reference.

### RESOLUTION — how the R2 S3 keys actually work (2026-06-18, verified)

We burned an hour because **Cloudflare R2 never shows a "Secret Access Key" in the dashboard.** It only gives you a single **API token**. The S3 pair is *derived* from that token (confirmed working against the live S3 endpoint via SigV4):

| S3 field | Where it comes from |
|---|---|
| **Access Key ID** | the API **token's ID** — get it from `GET https://api.cloudflare.com/client/v4/accounts/<ACCT>/tokens/verify` (header `Authorization: Bearer <TOKEN>`) → `result.id`. Ours: `d259de0aeb65100528f3137cdf8c0531`. |
| **Secret Access Key** | `SHA-256(token value)` → `printf "%s" "<TOKEN>" \| shasum -a 256`. 64 hex chars. |

Dead ends that wasted time (avoid):
- The **"Account API tokens"** page / permission-groups "Edit policy" editor → only ever yields a bearer token; **there is no "secret" field anywhere**, by design.
- `GET /user/tokens/verify` returns **"Invalid API Token"** for an account-scoped R2 token — misleading; use the **`/accounts/<ACCT>/tokens/verify`** path instead.

Proof the creds work (don't need the dashboard at all):
- Token-only read/write via the **native R2 API**: `PUT/GET/DELETE https://api.cloudflare.com/client/v4/accounts/<ACCT>/r2/buckets/lossless-core/objects/<key>`.
- Derived S3 keys via **SigV4** against `https://<ACCT>.r2.cloudflarestorage.com/lossless-core/<key>`, region **`auto`** → 200/200/204.

### Finishing the mount via CLI (no console needed)

`juicefs auth` accepts `--bucket` / `--access-key` / `--secret-key`, so point the volume at R2 entirely from the CLI:
```bash
set -a; source ~/.secrets; set +a
juicefs auth lossless-core --token "$JUICEFS_LOSSLESS_TOKEN" \
  --access-key "$R2_ACCESS_KEY_ID" --secret-key "$R2_SECRET_ACCESS_KEY" \
  --bucket "https://lossless-core.$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com"
juicefs mount -d lossless-core ~/jfs
```
**Gotcha:** if you ever ran `sudo juicefs mount`, `~/.juicefs/` becomes **root-owned** and later non-sudo `auth` fails with `permission denied` on `lossless-core.conf.tmp`. Fix once: `sudo chown -R $(whoami) ~/.juicefs`, then never use sudo again (mount under `~/jfs`, not `/jfs`).

## Reading the output (the part that's hard to interpret)

### `juicefs auth …`
- ✅ **Success:** a short line like `Volume "lossless-core" is authenticated` (or just writes the config silently and exits 0). A config file appears at `~/.juicefs/lossless-core.conf`.
- ❌ `invalid token` / `401` → the token didn't load from `~/.secrets` (did you run `set -a; source ~/.secrets; set +a`?), or it's wrong/expired — regenerate in the console.
- ❌ `access denied` on the bucket → the `--access-key`/`--secret-key` are wrong, not the token.

### `juicefs mount …`
It prints timestamped log lines. You're looking for ONE thing — the ready line:
- ✅ **Success:** `<INFO>: OK, lossless-core is ready at ~/jfs`. With `-d` you get your prompt back; without it the terminal **hangs** (normal — it's the running mount; use a new terminal for `~/jfs`).
- ❌ `command not found` → CLI not installed (step 1).
- ❌ `mkdir /jfs: read-only file system` (macOS, observed 2026-06-18) → the root volume `/` is read-only on modern macOS; you can't create a top-level mountpoint there even with sudo. **Mount under your home dir (`~/jfs`), without sudo.** This is the one we actually hit.
- ❌ `fuse: … macfuse` / `mount_macfuse` errors → macFUSE issue (we have it installed, but a macOS update can require re-approving the system extension in System Settings → Privacy & Security).
- ❌ `mountpoint is not empty` / `already mounted` → something's at `~/jfs`; `juicefs umount ~/jfs` first.
- ❌ `permission denied` → don't use `sudo` on macOS (it strips the token env and isn't needed for a home-dir mountpoint).
- ❌ `storage test failed … InvalidAccessKeyId … please create bucket … manually` (observed 2026-06-18) → token authed the metadata, but the **object-store bucket** (here AWS S3 `juicefs-lossless-core`, `ap-east-1`) rejected the access key — because we passed none. Fix: pick a real object-store provider in the console, create a bucket + access/secret key there, then re-auth with `juicefs auth lossless-core --token … --access-key <AK> --secret-key <SK>`. (There is no managed-storage shortcut — BYO storage always.)

**Rule of thumb:** for `mount`, scan for `is ready at` = win; anything with `<ERROR>`/`<FATAL>` = read that line to me. When you run any of these with a leading `!` in this session, the output lands here and I'll decode the actual lines.

## When we'd actually reach for it / caveats

- **Use it when** a second operator/machine needs the corpus, or a cloud job (indexing, the funder-fit retrieval in [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]]) needs to read corpus files without shipping them around.
- **`lossless-core` is tree-wide, not per-client.** It's the whole monorepo's shared volume; per-client isolation (separate buckets / encryption-at-rest) is still the open privacy question — see [[Per-Client-Privacy-and-the-Path-Off-Local]] before putting a client's corpus on a shared volume.
- **It does not solve sync with SurrealDB.** The filesystem ↔ DB reconciliation in [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]] (Problem A) is unchanged — JuiceFS just changes *where* the filesystem lives, not the join to the DB.
- **It does not solve the schema/blend question** — that was the explicit verdict in the survey.

## Status & cross-refs

**Decision: deferred. Reference: pinned.** Nothing to install today; this exists so that if the path-off-local question forces the issue, the setup + interpretation is already written down.

- [[Joined-People-UI-and-the-Network-First-Pivot]] — the storage-substrate survey that placed JuiceFS (addendum, 2026-06-15).
- [[Per-Client-Privacy-and-the-Path-Off-Local]] — the portability/privacy question JuiceFS answers.
- [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]] — the corpus that would be the payload; its filesystem ↔ DB sync is orthogonal.
- `~/.secrets` — `JUICEFS_LOSSLESS_TOKEN` (the auth credential; laptop-wide, bare `KEY=val`, no `export`). **Remove the stale `JUICEFS_TOKEN` and `JUICEFS_LOSSLESS_TOKEN` from `augment-it/.env`** — the token belongs in `~/.secrets` only, to avoid a split-brain copy.
- Console: JuiceFS Cloud volume `lossless-core` (the authoritative source for the personalized install + auth commands).
