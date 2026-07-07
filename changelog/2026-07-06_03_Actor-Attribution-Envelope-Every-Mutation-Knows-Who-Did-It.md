---
date_created: 2026-07-06
date_modified: 2026-07-06
title: "Actor attribution envelope — every mutation knows who did it"
lede: "The verified didi.sh identity now rides beside every capability invoke into the domain services, stamping created_by/updated_by on domains, sources, and source_usages rows in SurrealDB and created_by into the corpus frontmatter content-ingest writes — no consumers yet, just the wire proven end to end against local dev."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Sonnet 5
files_changed:
  - services/workspace/src/ws.ts
  - services/workspace/src/capabilities.ts
  - packages/workspace/src/types.ts
  - packages/workspace/src/transport.ts
  - packages/workspace/src/state.svelte.ts
  - apps/chat/src/chat-state.svelte.ts
  - services/record-surrealdb-resolver/src/domains.ts
  - services/content-ingest/src/corpus.ts
  - scripts/prove-didi-auth.mjs
tags:
  - Progress-Update
  - Auth
  - Didi-Platform
  - Attribution
  - Resolver
  - Content-Ingest
---

## Why Care?

Step 3 proved the membership gate — only the right people get onto an
instance's WS. Step 4 answers the next question the humain-vc flow needs
before real content lands: once someone's in, whose fingerprints are on
what they touch? Every domain, source, and source_usage row was anonymous
until now. That's fine solo; it stops being fine the moment Michael and
Aniel are both curating the same thesis corpus.

## What's New?

- **The envelope.** `ws.ts` builds `{ didi_id, via? }` from the verified
  session (never client-asserted) and threads it into `dispatch()`;
  `capabilities.ts` merges it into the NATS request body beside `args` for
  every domain-service capability. Mirrors the existing `client_id`
  tenant-envelope pattern rather than inventing a new shape.
- **Resolver stamps it.** `domains.ts` gained an `actorSetClause()` helper —
  `created_by`/`created_via` on every CREATE, `updated_by`/`updated_via` on
  every actor-driven UPDATE (domain re-touch, source registry edits,
  source_usages fetch/attach/tag/re-slug). Never clobbers a stamped value
  with NULL when a request arrives with no actor (background Jina fetches,
  dev with `DIDI_AUTH=off`).
- **Frontmatter carries it too.** `domain.create` and `source.add` forward
  `created_by` to content-ingest, which writes it into the domain's
  `index.md` and the source's per-file frontmatter — the corpus stays
  self-describing on disk, not just in the DB.
- **Chat turns get a `via` tag.** When the chat surface replays an accepted
  `chat_invoke` tool call, `workspace.invoke(capability, args, 'didi-agent')`
  threads a `via` field through the same envelope, landing as
  `updated_via`/`created_via` — didi's writes are distinguishable from a
  direct click without a second code path.
- **No consumers.** Per the flow plan's rule: no filtering, no UI, no
  gating on any of this yet. It's provenance, waiting for step 8's chat
  surface and any future curator UI to read it.
- **Proven live.** Added an `ATTRIBUTION=1` mode to
  `scripts/prove-didi-auth.mjs`: signs in, fires `domain.create` +
  `source.add` over the authenticated WS session, and asserts the
  response's `created_by` matches the signed-in `didi_id`. Ran it against
  local dev (docker compose backend + `id-didi-sh` on :4000) — confirmed
  both the DB round-trip and the on-disk frontmatter (`index.md` and the
  source file) carry the didi_id. Test rows cleaned from the shared
  SurrealDB Cloud instance after.

## What's Next

Step 5 — thesis vocabulary: swap the curator's hardcoded `strategy` domain
type for a per-workspace default so humain-vc reads "Thesis" while
reach-edu keeps "Strategy." Directly serves the humain-vc flow's actual
goal (domain:thesis corpus building) and has no deploy dependency.
