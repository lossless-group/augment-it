---
title: "Domain type is ambient state, so a failed workspace load hides every corpus"
lede: "humain-vc opened the Corpora Curator and saw 'strategy' and 'No corpora yet' — it has theses, and plenty of them. One guessed value at load time silently filtered the whole surface, and the same symptom was debugged out once already on 2026-07-07."
date_created: 2026-08-08
date_modified: 2026-08-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
semantic_version: 0.0.1.0
tags:
  - Issue
  - Augment-It
  - Corpora-Curator
  - Workspaces
  - Domains
  - Bug
status: Resolved
site_uuid: 36e2f4f0-a9b7-40e4-ae37-a6563da7c6cc
hex_code: 4bqfl4
date_authored_initial_draft: 2026-08-08
date_authored_current_draft: 2026-08-08
publish: true
---

# Domain type is ambient state, so a failed workspace load hides every corpus

## Why Care?

An operator on `humain-vc` opened the Corpora Curator and was told they had no
corpora. They have theses. The surface had guessed `strategy` for the domain
type, queried `domain.list` with it, got nothing back, and rendered "No corpora
yet" — a sentence indistinguishable from the truth.

This exact symptom was fixed once already, on 2026-07-07 (`618ec0d`). That fix
repaired the *switching* path — the curator now tracks whichever workspace is
actually active. It left the guess in place. So the symptom came back the first
time `workspace.list` was slow, and it will keep coming back, because the
underlying design still requires the client to know a value it may not have yet.

## What was observed

Header chip read `humain-vc` / `strategy`, connection `open`, body "No corpora
yet." The tell is that `humain-vc` rendered as a **pill**, not a `<select>`:

```svelte
{#if curation.workspaces.length}   <select class="cc-ws">          ← normal
{:else if connection !== 'open'}   <span>connecting…</span>
{:else}                            <span class="cc-pill">{clientSlug}</span>  ← observed
```

A pill plus `open` means `curation.workspaces` was **empty** — the workspace
list never arrived, while the socket was healthy. `workspace.list timed out
after 120s` was in the console.

## Root cause

`domainType` was global ambient state standing in for a property of the
selected corpus. It was threaded into ~15 calls — `domain.list`,
`domain.assemble`, every `source.*`, `tag.apply` — so one wrong value at load
time poisoned everything downstream.

Its only source could fail open:

```ts
private defaultDomainTypeFor(client_id: string): string {
  return workspace.workspaces.find((w) => w.client_id === client_id)?.default_domain_type
    ?? DEFAULT_DOMAIN_TYPE;   // 'strategy'
}
```

Empty list → `'strategy'` → `domain.list { type: 'strategy' }` against a
thesis-only workspace → zero rows → "No corpora yet."

**Not a backend defect.** `clients/humain-vc/.env` carries
`DEFAULT_DOMAIN_TYPE=thesis`, the container reads it, and
`services/workspace/src/workspaces.ts:268` maps it correctly.

**Not caused by the `corpora-curator` rename.** `curation.svelte.ts` had zero
non-comment changes in that refactor; `CorpusPicker.svelte` had only class
renames. See [[Rename-Strategy-Curator-To-Corpora-Curator]].

## The deeper problem — the filter was never wanted

Domains were abstracted precisely so that **any type shows up**. The types have
no behavioural difference today; they are vocabulary preference — reach-edu says
"strategy," humain-vc says "thesis." The resolver already treats the filter as
optional:

```ts
export async function listDomains(db, args: { type?: string; client_slug?: string })
```

`type` is optional and is projected in the result set. The client was imposing a
narrowing the backend never asked for, and paying for it with an entire class
of bug.

## The fix

1. **Stop filtering the list.** `domain.list` is called with `client_slug`
   only. Every corpus in the workspace appears regardless of type, and each row
   shows its type as a chip so a thesis and a strategy are distinguishable.
2. **The type follows the selected corpus.** `domain.assemble`, every
   `source.*`, and `tag.apply` read `active.type` — a property of the thing the
   operator clicked — instead of an ambient mode.
3. **`domainType` demotes to the create-form default**, i.e. "what this client
   calls things." A wrong value can now only mis-prefill one visible text field
   the operator can see and change; it can no longer hide anything.
4. **`ACTIVE_STRATEGY_KEY` keys on `type:slug`.** Uniqueness is `(type, slug)`
   — "apprenticeship" can be a strategy *and* a topic — so a bare slug would
   restore the wrong corpus once a workspace holds both.
5. **The broadcast filter drops its type check.** Any domain change in this
   client is now relevant, because the list is no longer type-scoped.

No backend change.

## What this closes for good

The failure mode required a guessed global type. There is no longer a guessed
global type, so "workspace list is slow" degrades to "the create form's Type
field is pre-filled with the wrong word" — visible, local, and correctable —
rather than "you have no corpora."

## Related

- [[Rename-Strategy-Curator-To-Corpora-Curator]] — the refactor this surfaced during
- [[Workspaces-as-Tenant-Primitive]] — the per-workspace `.env` contract
- `changelog/2026-07-07_01_Thesis-Vocabulary-Lands-Per-Workspace-Default-Plus-Domain-Retype.md` — the 2026-07-07 fix that repaired switching but left the guess
