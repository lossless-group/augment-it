---
title: "Syncthing for Collaborator Access to the Corpus (R2 Backup Already Decided)"
lede: "R2 already won the backup leg — rclone, not a live mount. This is the separate, still-open question: could Syncthing give other humans live access to the same corpus, without breaking the single-writer discipline that's kept things sane so far?"
date_created: 2026-07-17
date_modified: 2026-07-17
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
semantic_version: 0.0.0.1
status: Draft
tags:
  - Exploration
  - Augment-It
  - Syncthing
  - Cloudflare-R2
  - Storage-Substrate
  - Path-Off-Local
  - Corpus
  - Collaboration
site_uuid: 108297f8-c766-48fb-a43e-3518225723ea
hex_code: 50pdz4
date_authored_initial_draft: 2026-07-17
date_authored_current_draft: 2026-07-17
---

# Syncthing for Collaborator Access to the Corpus

## Why this exists

Two separate questions keep getting bundled together as "how does the corpus get off one laptop," and they have different answers:

1. **Backup / disaster recovery** — settled. [[JuiceFS-Pinned-Path-Off-Local-Substrate]] explored a live cloud-mount (JuiceFS) and rejected it; the decision is **automated `rclone` sync to Cloudflare R2**, local-first, real files, no kernel extension. `context-v/plans/pickups/Pickup-2026-07-13.md` re-confirmed this and additionally **ruled Syncthing out for this specific leg** — it only syncs between two Syncthing daemons, no native S3/R2 support, so it physically cannot be the thing that gets bytes into R2. That's rclone's job and rclone's alone.
2. **Live access for other humans** — open. Not the backup question at all. If a second operator (a reach-edu team member, another Lossless collaborator) needs to read or write the corpus without going through the full deployed stack, what does that look like? This is the question this doc is actually about.

The pickup note flagged this as a "do we actually want this" open question and stopped there. This is a first pass at actually mapping the option space — not a finished decision, not a stub either.

## Current state, for context

- Corpus lives as markdown files on Michael's laptop (`clients/<slug>/corpus/`) — the canonical filesystem copy.
- The deployed instance (`augment.didi.sh` on Railway) has its **own** copy on a Railway Volume (`content-ingest`'s `/clients`), written to by whoever's using the hosted shell.
- Policy today, per the Build-Order plan: **single-writer, sync deliberately, never concurrently** — "team writes hosted; Michael's local edits sync deliberately." No live two-way sync exists between laptop and hosted volume today; Step 11 (corpus sync) is itself still unbuilt, tracked as its own open item.
- R2 is the backup destination, reached via rclone from one canonical source. Not designed to be read/written by multiple independent writers.

Any Syncthing shape has to either respect that single-writer policy or make a deliberate case for relaxing it.

## What Syncthing actually is (the parts that matter here)

Peer-to-peer, block-level file sync between **Syncthing daemons** — no central server required (though a self-hostable discovery/relay server exists for privacy). Folders are shared device-to-device by folder ID + device ID, not through any cloud storage provider. Two properties matter a lot for this use case:

- **No native object-storage support.** Confirmed by the pickup note. A Syncthing node is always a real daemon on a real machine (or container) — never R2, never S3. This is why it's orthogonal to the backup leg, not a competitor to it.
- **Per-device folder types.** This is the part that resolves the single-writer tension (see below): each device in a shared folder can be set to `Send & Receive`, `Send Only`, or `Receive Only` — independently. That's a real lever, not a workaround.

## The core tension, and the lever that resolves it

Syncthing's native mode is symmetric multi-writer — every device can edit, conflicts get renamed (`file.sync-conflict-<date>-<device>.md`) rather than merged. That's a direct clash with "sync deliberately, never concurrently."

**But per-device folder types make asymmetric sync a first-class mode, not a hack:**

- Michael's laptop → `Send & Receive` (or `Send Only`, if we want to be strict) — the real write surface, same as today.
- Collaborator laptops → `Receive Only` — they get a live, read-only mirror. No conflict possibility, because Syncthing on that device physically can't push changes back (a local edit on a receive-only folder gets flagged as a "receive-only conflict" and never propagates out — it's rejected, not merged).

This is the shape that's actually worth building, if any is: **live read access for collaborators, write access stays exactly where it is today.** It doesn't touch the single-writer policy at all — it extends *read* reach without extending *write* reach.

## Option space

### A. Direct laptop-to-laptop mesh (no hosted infra involved)

Michael's laptop and each collaborator's laptop run Syncthing directly, paired by device ID. Simplest to reason about — doesn't touch Railway, doesn't touch R2, doesn't need the deployed stack to know anything happened. Downside: only syncs when both machines are online at the same time (or reachable via a relay when NAT'd) — no "always-on" hosted copy in this shape alone.

### B. Hub through the hosted Railway instance

The Railway `content-ingest` container also runs a Syncthing instance (as a second process — Railway volumes are single-service-only, so this can't be a separate service, per the pickup note's own caveat), acting as an always-on hub. Michael's laptop is `Send & Receive` with the hub; collaborators are `Receive Only` from the hub. Gets you "always available, no two-laptops-online-at-once requirement," at the cost of real infra complexity inside a container that wasn't designed to run a second daemon.

### C. Laptop-to-laptop mesh, R2 stays purely a backup snapshot

Same as A, but explicit that R2/rclone is a *separate, unrelated* safety net — not something collaborators ever touch directly. This is probably the least entangled option: two independent systems, each doing one job, no shared failure mode.

**First read:** (C) is the shape with the fewest new moving parts and the clearest story — R2 for disaster recovery (already decided, already working), Syncthing purely for human-to-human live reach, `Receive Only` on every collaborator device so the single-writer policy is structurally enforced rather than just agreed-to. (B) is more useful long-term (always-on) but shouldn't be attempted until the container-as-second-daemon question has its own real answer — not assumed to work.

## Open questions — genuinely unresolved, not rhetorical

- **Who actually needs this, and for what?** No named collaborator or workflow has asked for live corpus access yet — this is anticipatory, not responding to a real request. Worth checking whether "send someone a git clone / a periodic export" is simply good enough before building live sync at all.
- **Discovery/relay privacy posture.** Public Syncthing discovery + relay servers are the default and are how most setups Just Work through NAT — but corpus content is client-confidential (reach-edu, humain-vc). Does device pairing alone (device IDs are the auth) suffice, or does this need a private discovery/relay server too? Not researched yet.
- **Folder scope.** Whole corpus, or per-client (so a reach-edu collaborator only ever receives `clients/reach-edu/`, never sees `clients/humain-vc/`)? Given the client-isolation concerns already live in [[Per-Client-Privacy-and-the-Path-Off-Local]], per-client folder scoping is almost certainly the right default — flagged here, not designed here.
- **What about the SurrealDB half?** Syncthing only ever solves the filesystem-corpus leg. A collaborator with a live corpus mirror still has zero access to the canonical entity layer (persons/organizations/observations/affiliations) unless they're also signed in through didi.sh and hitting the real deployed instance. This doc doesn't pretend to solve that — worth being explicit that "corpus access" and "canonical-layer access" are different problems with different answers.
- **Is `Receive Only` actually conflict-proof in practice**, or does it just relocate the conflict to "collaborator made a local edit, now it's silently orphaned and never synced anywhere"? The mechanism is real but the failure mode for the collaborator (their edit doesn't disappear, it just stops propagating) needs to be understood and probably surfaced to them somehow, not just trusted.

## Explicitly not covered by this pass

- No installation, credentials, or setup steps — none of this has been stood up.
- No decision on which option (A/B/C) to pursue, or whether to pursue any of them.
- No design for how a collaborator would actually be onboarded (device ID exchange, folder invite flow).

## Cross-references

- [[JuiceFS-Pinned-Path-Off-Local-Substrate]] — the R2/rclone backup decision this doc deliberately does not re-litigate
- `context-v/plans/pickups/Pickup-2026-07-13.md` — where Syncthing was first scoped out (ruled out for backup, flagged open for live sync)
- [[Per-Client-Privacy-and-the-Path-Off-Local]] — the isolation concerns that should shape folder scoping if this gets built
- [[Funder-Fit-Engine-Org-Corpora-and-the-Story-Unlock-Cycle]] — where the corpus itself is defined; unaffected by whichever sync mechanism reaches it
