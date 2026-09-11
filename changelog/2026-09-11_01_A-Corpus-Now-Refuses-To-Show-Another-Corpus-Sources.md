---
title: "A Corpus Now Refuses to Show Another Corpus's Sources"
lede: "Three corpora showed identical sources under three names. The data was right; the UI was answering a question it had stopped asking."
publish: true
date_authored_initial_draft: 2026-09-11
date_authored_current_draft: 2026-09-11
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
files_changed:
  - services/record-surrealdb-resolver/src/domains.ts
  - apps/corpora-curator/src/curation.svelte.ts
  - apps/corpora-curator/test/curation.test.ts
  - context-v/plans/Stale-Corpus-Sources-When-The-Workspace-Socket-Is-Down.md
site_uuid: 2cd51333-3736-4356-8b7f-cdd94748fcdc
hex_code: 3mmw2r
---

# A Corpus Now Refuses to Show Another Corpus's Sources

## Why Care?

If you curate research, the worst thing a tool can do is show you the wrong
material **confidently**. Not an error page — those you notice. The wrong
sources, under the right heading, with a plausible count beside them.

That is what the Corpora Curator was doing. Open Consumer Immunology and you
saw three sources. Open Reinvented Fertility & Maternity: the same three. Open
AI Infrastructure for Bioscience: the same three again. Each with its own name
in the header and its own confident "3 sources" badge.

Only one of those was telling the truth.

## What's New?

- **`domain.assemble` now echoes back the `(type, slug)` it answered for.** The
  reply says which corpus it describes.
- **The curator refuses replies it did not ask for.** A late or misrouted answer
  is dropped instead of rendered.
- **Sources clear the instant you switch corpora**, before the fetch resolves —
  so the previous corpus's rows cannot linger under the new name.
- **Out-of-order replies can no longer win.** Click three corpora quickly and
  you get the one you picked last, not the one the server answered last.
- **Four regression tests**, and a test suite that had been silently dead is
  running again.

## What we ruled out first

Two obvious suspects, both innocent.

**The data.** Queried production SurrealDB directly:

```
ai-infrastructure-for-bioscience          3
consumer-immunology                       2
quantum-innovation-computational-biology  4
reinvented-fertility-maternity            1
specialized-foundation-models             5
wearables-and-somatic-markers             1
wellness-experiences                      1
```

Seven corpora, distinct `source_uuid`s, no duplication. Clean.

**The query.** `assembleDomain` filters on
`domain_type = $t AND domain_slug = $s AND client_slug = $c`, and every write
path is scoped the same way. Correct.

The three titles on screen resolved to exactly one corpus:
`ai-infrastructure-for-bioscience` — the first one opened that session. The
server had been right all along; the screen was stale.

## What was actually happening

The workspace-service log gave it away:

```
20:28:35  ws connect ×3
20:28:37  invoke ×4 answered   ← ai-infrastructure-for-bioscience loads
20:30:39  ws close ×3
          ───── 28-minute dead window ─────
20:57:20/26/33                 ← three corpora clicked. No socket. No invokes.
20:58:43  ws connect
```

Every click landed in a window with no WebSocket — the signature of a slept
laptop or a long-backgrounded tab, where browsers throttle the reconnect timers.

And `select()` was written in the order that makes that fatal:

```ts
this.activeSlug = slug;                     // header updates instantly
const r = await this.call('domain.assemble', …);  // queued; socket is closed
this.sources = (r?.sources ?? []).map(withSlug);  // never runs
```

Identity moved. Content did not. Nothing detected the disagreement, because
nothing knew they were supposed to match — a list of sources carried no trace
of the corpus it came from, so the UI could not have noticed it was wrong.

## The fix: make the wrong state unrepresentable

Clearing `sources` before the await stops the symptom. It does not stop the
class. Two rapid switches on a slow link can still resolve out of order, and
last-write-wins means *whichever reply landed last*, not *whichever corpus you
picked*.

So the reply now carries its own identity, and the client checks it:

```ts
if (this.activeSlug !== slug) return;              // superseded by a later pick
if (!replyMatches(r, wantType, slug)) { … }        // answer to a different question
```

The information already existed — `source_usages` has `domain_slug` — it was
just being dropped on the way out.

**One deliberate softness:** the match is enforced only when the echo is
present. `record-surrealdb-resolver` and the curator deploy independently, so a
resolver still running the old build sends no echo. Rejecting that would blank
the surface entirely — trading a subtle wrong-data bug for a total outage. Once
both sides are everywhere, it can tighten.

## A dead test suite, found by accident

Adding tests surfaced something else: `apps/corpora-curator/test/curation.test.ts`
had not run since gh #93 centralised the WS endpoint. That commit added
`resolveWsUrl()` at module scope; the test's mock of `@augment-it/workspace`
never gained the export, so importing the module threw.

Vitest reports that as **"no tests"** — not as a failure. Eight tests vanished
and the output never said anything was wrong.

Which is the same shape as the bug we came to fix, and as the deploy watchdog's
own guard against it:

> An empty service list must NEVER read as healthy.

A curator that renders an unanswered fetch as content. A suite that reports zero
tests as fine. **Absence of signal rendered as positive signal**, three times in
one codebase. Worth naming as a class, not three incidents.

Mock repaired, suite alive: 12 passing.

## Under the Hood

```
 ✓ a reply carrying a different slug is refused, not rendered
 ✓ switching corpora clears the previous sources before the reply arrives
 ✓ a superseded selection does not overwrite the corpus that replaced it
 ✓ a resolver that does not echo (type, slug) is still trusted
```

`sourcesStatus` (`idle | loading | ready | error`) now tracks whether `sources`
actually describes `activeSlug`, so the surface can tell "empty" from "unknown".

Verification: resolver typecheck clean, curator builds, 12 curator tests and 21
resolver tests green. The ten pre-existing `gallery/catalog.ts` type errors are
untouched and unrelated — confirmed identical with and without this change.

## What's Next

Two layers from the plan remain:

1. **Loading and error states rendered in the curator.** The state exists now;
   the pane still has no connection indicator, while the shell's
   `WorkspaceSwitcher` has had one all along.
2. **Reconnect on `visibilitychange` / `online`** instead of throttled backoff
   timers — the change that shortens the 28-minute dead window itself. It lives
   in `transport.ts`, which all five remotes bundle separately, so it needs all
   five rebuilt.

## References

- [[Stale-Corpus-Sources-When-The-Workspace-Socket-Is-Down]] — the plan
- [[Webhook-As-Wake-Up-Not-As-Truth]] — the same don't-trust-what-you-can't-verify discipline, one layer up
