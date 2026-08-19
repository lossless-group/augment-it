---
title: "Workspace + corpora connection is slow-to-hanging, and the auth token won't persist"
lede: "The Corpora Curator sits at 'connecting…' and the workspace switcher at 'loading…' — corpora never arrive — while the didi session drops within a minute of signing in, forcing a re-login. Two symptoms that most likely share one root cause."
date_created: 2026-08-02
date_modified: 2026-08-02
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.8
semantic_version: 0.0.0.1
tags:
  - Issue
  - Augment-It
  - Workspace-Auth
  - Transport
  - Performance
  - Debugging-Journey
status: Active
site_uuid: b3d32edd-fecd-4382-87df-d6cc35b445f3
hex_code: sstrq5
date_authored_initial_draft: 2026-08-02
date_authored_current_draft: 2026-08-02
publish: true
---

# Workspace + corpora connection is slow-to-hanging, and auth won't persist

## Symptom (operator report, 2026-08-02)

On production **`augment.didi.sh`** in **Zen browser** (screenshot; the
header's `tiling host · :3100` is a cosmetic shell label, not the origin):

- The **Corpora Curator** header shows `connecting…` next to the `strategy`
  chip, and a separate `connecting` badge top-right; the `CORPORA` rail is
  empty. It stays this way — *"so slow it doesn't seem to work."*
- The **workspace switcher** (top-right) shows `loading…` rather than a
  resolved workspace name.
- **Connecting to workspaces is slow; connecting to corpora/strategies is
  *super* slow** — slow enough to read as broken.
- **Auth doesn't persist:** signed in as `mpstaton@gmail.com`, then had to
  **re-login within a minute** of a login done a minute earlier.

## Environment — production only; local is fine

- **Production `augment.didi.sh`**, viewed in **Zen browser** (a Firefox
  fork the operator uses specifically to exercise the deployed surface).
- **Local dev works well** — same code, same cloud SurrealDB. That is the
  load-bearing fact: it **rules out a logic bug** in the transport or
  curator (local runs them fine) and points at things that differ **only
  in production**: the deployed build, the prod infra, and the browser.

## Ranked hypotheses (production-specific by elimination)

1. **Zen/Firefox partitions the cross-subdomain session cookie.** The
   `didi_session` cookie is set by `id.didi.sh` and read by
   `augment.didi.sh` — different subdomains of `.didi.sh`. Firefox's Total
   Cookie Protection / Enhanced Tracking Protection (which Zen inherits and
   often hardens) can **partition or block** such a cookie as third-party,
   so it never comes back on the next request → the session looks absent →
   `4401` → the transport's auth-death path clears `user` (forced re-login)
   and retries glacially (30s) → reads as **"connecting… forever."** *First
   probe: load augment.didi.sh in Chrome/Safari; if auth persists there, it's
   Zen's cookie handling.* This single cause explains BOTH symptoms.
2. **Production backend is under-resourced / cold.** The workspace-service
   ↔ cloud SurrealDB round-trip, or a small Railway instance (id-didi-sh
   OOM'd at 256 MB before its bump — augment's services may be similarly
   tight), makes the WS connect + `domain.list` genuinely slow even once
   authed. Explains the "super slow corpora" independent of the cookie.
3. **The deployed build is stale.** The zombie-session fix (`9fc2543`:
   hourly/on-focus refresh + 4401 auth-death) and the transport reconnect
   fix (Group C) landed **after** the production flip (`4298be0`). If prod
   was never redeployed from current trunk, it lacks the refresh timer that
   would keep a session alive — compounding hypothesis 1. *Confirm what
   commit augment.didi.sh is actually running.*

## Note on the cloud DB

- Even with auth solid, corpora reads cross the network to the **cloud
  SurrealDB**; a cold/latent instance makes `domain.list` /
  `domain.assemble` slow. Local feeling "fine" may just mean a warm cloud
  connection at the time — worth timing directly in both environments.
## Next probes (for the fix session)

1. **Another browser first.** Load `augment.didi.sh` in Chrome or Safari.
   If auth persists and corpora load there, it's **Zen/Firefox cookie
   handling** (hypothesis 1) — the cheapest, highest-signal test.
2. **Zen's cookie inspector.** On `augment.didi.sh`, check whether a
   `didi_session` cookie exists, its `Domain`/`SameSite`/partition state,
   and whether ETP is blocking it (Zen shows a shield / cookie report).
3. **Network tab:** repeated `4401` socket closes at ~30s intervals? Is
   `POST id.didi.sh/api/session/refresh` firing, with credentials, and what
   does it return (200 refreshed vs 401)?
4. **What commit is prod running?** Confirm `augment.didi.sh` was
   redeployed from current trunk — specifically that it has the zombie-fix
   refresh timer (`9fc2543`). The prod flip predated it.
5. **Time the cloud read** directly (a `prove-*`-style `domain.list` over
   prod NATS) to size the DB-latency contribution separately from auth.

## Relation to prior work

- The transport's `4401` auth-death handling is **working as designed**
  ([[Session-Expiry-Turns-The-App-Into-A-Zombie]]) — but if the session can
  *never* persist (cookie-domain mismatch), that correct behavior presents
  as an endless "connecting" loop. The bug is upstream of the transport.
- Not the same as [[Search-And-Add-Invokes-Never-Reach-The-Workspace]]
  (mount-time invoke loss) nor the refused-connection reconnect gap fixed
  in the transport suite (Group C) — though both should be ruled out.

## See also

- [[Session-Expiry-Turns-The-App-Into-A-Zombie]] — the auth-death contract this rides on
- [[Search-And-Add-Invokes-Never-Reach-The-Workspace]] — a different "never connects" shape
- [[Corpora-Builder-Harmony-Test-Registry]] — Group C (transport) + Group I (chain) coverage
- `id-didi-sh/README.md` — the local-vs-deployed cookie note
