---
date_created: 2026-08-08
date_modified: 2026-08-08
title: "Same symptom, second cause — the type filter that hid a whole workspace"
lede: "'No corpora yet' showed up twice in one week from two unrelated causes. The first was a dead NATS subject. The second was one guessed word, filtering a list nobody ever asked to have filtered."
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5
files_changed:
  - apps/corpora-curator/src/curation.svelte.ts
  - apps/corpora-curator/src/CorpusPicker.svelte
  - apps/corpora-curator/test/curation.test.ts
  - context-v/issues/Domain-Type-Is-Ambient-State-So-A-Failed-Workspace-Load-Hides-Every-Corpus.md
tags:
  - Augment-It
  - Corpora-Curator
  - Workspaces
  - Debugging
  - State-Management
  - Bug-Fix
---

# Same symptom, second cause

## Why Care?

Earlier this week a workspace opened and its corpora weren't there. We found it:
[[2026-08-08_01_The-Corpora-Were-Never-Missing-One-Bad-Message-Had-Killed-The-Subject|one
unanswerable message had killed a NATS subject]] until restart. Fixed, tested,
logged.

Then it happened again. Different workspace, different cause, **identical
sentence on screen**: "No corpora yet."

That is the part worth caring about. "No corpora yet" is indistinguishable from
the truth. It is what the surface says when you genuinely have nothing, and it
is also what the surface said when humain-vc had nine theses sitting in the
database. A message that cannot tell those two states apart will keep costing
you debugging hours, from a new cause each time, forever.

## What's New?

**The corpus list is no longer filtered by type.** `domain.list` is called with
the workspace slug and nothing else. Every corpus in the workspace shows up
regardless of its type, and each row carries its type as a chip so a thesis and
a strategy are still tellable apart.

**The type follows the corpus you clicked.** `domain.assemble`, every `source.*`
call and `tag.apply` now read the type off the selected corpus — a property of
the thing itself — instead of off an ambient mode. Roughly fifteen call sites.

**Selection is keyed on `(type, slug)`, not slug alone.** "apprenticeship" can
legitimately be a strategy *and* a topic. Restoring a saved selection by bare
slug picks whichever one sorted first. Saved selections from before this change
still resolve, so nobody loses their place on upgrade.

**No backend change.** Not one line.

## How we found it

The tell was in the header, and it was visual rather than logged.

```svelte
{#if curation.workspaces.length}   <select class="cc-ws">                    ← normal
{:else if connection !== 'open'}   <span>connecting…</span>
{:else}                            <span class="cc-pill">{clientSlug}</span>  ← observed
```

The workspace name rendered as a **pill**, not a dropdown, while the connection
status read `open`. That combination has exactly one meaning: the workspace list
is empty even though the socket is healthy. `workspace.list timed out after
120s` was indeed sitting in the console.

From there the chain is short and entirely client-side:

```ts
private defaultDomainTypeFor(client_id: string): string {
  return workspace.workspaces.find((w) => w.client_id === client_id)?.default_domain_type
    ?? DEFAULT_DOMAIN_TYPE;   // 'strategy'
}
```

Empty list → fall back to `'strategy'` → query a thesis-only workspace for
strategies → zero rows → "No corpora yet."

Worth being clear about what this was **not**. Not a backend defect —
`clients/humain-vc/.env` carries `DEFAULT_DOMAIN_TYPE=thesis`, the container
reads it, the workspace service maps it correctly. And not fallout from the
[[2026-08-08_04_The-Name-Finally-Catches-Up-Strategy-Curator-Becomes-Corpora-Curator|corpora-curator
rename]] that was running at the same time: `curation.svelte.ts` had zero
non-comment changes in that refactor.

## Under the Hood: we fixed this once already

On 2026-07-07 we shipped a fix for this exact symptom. It made the curator track
whichever workspace is actually active, instead of holding a stale one. That fix
was correct and it is still in place.

It repaired the **switching** path and left the **guess** alone. So the surface
still had to know a value at load time that it might not have yet, and the bug
sat dormant for a month waiting for `workspace.list` to be slow once.

The deeper reading is that the filter was never wanted in the first place.
Domains were abstracted precisely so that *any* type shows up. The types carry
no behavioural difference — they are vocabulary preference, reach-edu saying
"strategy" where humain-vc says "thesis." And the resolver had always treated
the narrowing as optional:

```ts
export async function listDomains(db, args: { type?: string; client_slug?: string })
```

`type` is optional and gets projected into the result either way. **The client
was imposing a narrowing the backend never asked for**, and paying for it with a
whole class of bug.

So `domainType` got demoted rather than repaired. It is now the create form's
default — "what this client calls things" — and nothing else. A wrong value
there can mis-prefill one visible text field that the operator can see and type
over. It can no longer hide anything.

That is the actual fix. Not "guess better." **Stop needing the guess.**

## What this closes for good

The failure mode required a guessed global type to exist. There isn't one
anymore, so a slow workspace load now degrades to "the Type field is pre-filled
with the wrong word" — visible, local, correctable — instead of "you have no
corpora."

Three regression tests pin it, including the one that matters: a workspace whose
summary never arrives at all still sees every corpus it owns.

Full write-up, including the observed console state and the five-part fix:
[[context-v/issues/Domain-Type-Is-Ambient-State-So-A-Failed-Workspace-Load-Hides-Every-Corpus.md]]
(gh #88).
