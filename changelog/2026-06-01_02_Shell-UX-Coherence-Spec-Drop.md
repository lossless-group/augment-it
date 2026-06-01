---
title: "Shell & micro-frontend UX coherence — a demo-prep session pivots from patching into a broad-scope spec, four sibling stubs, and the framing of augment-it's dual identity"
lede: "What started as live demo-prep — patching a sticky Fire button, wiring a dead 'Do another round' affordance, adding a navigation to where results land — became a verdict: augment-it's affordances hide, die, mismatch, and (a newly emerging fourth shape) misname. Rather than patching one more thing, the session pivoted to spec mode. The result is a whole-shell UX coherence audit with eight locked decisions, twelve evidence items, four surfaces audited, and three open architectural questions; four sibling context-v stubs (per-remote in-app API docs, initial user experience, the dual-identity blueprint, the auth-patterns-following-Astro-Knots blueprint); and a substantive pickup doc so the next session can resume cold. No code shipped from the spec arc itself — everything held at the sign-off gate — except three small forward-affordance fixes that landed alongside as a separate fix commit and are recorded in the spec's evidence log."
publish: true
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
tags:
  - Augment-It
  - Shell
  - Micro-Frontends
  - UX-Coherence
  - Spec-Development
  - Context-Vigilance
  - Dual-Identity
  - Architecture-Demonstration
  - API-First
  - Onboarding
  - Auth-Patterns
  - Pickup
files_changed:
  - context-v/specs/Shell-and-Micro-Frontend-UX-Coherence.md
  - context-v/specs/API-First-In-App-Documentation.md
  - context-v/specs/Initial-User-Experience.md
  - context-v/blueprints/Augment-It-as-Working-App-and-Architecture-Demo.md
  - context-v/blueprints/Auth-Patterns-following-Astro-Knots-Patterns.md
  - context-v/reminders/Pickup-2026-06-01.md
  - apps/pack-runner/src/App.svelte
  - apps/pack-runner/src/app.css
  - apps/enhanced-records-list/src/App.svelte
---

## Why care?

Single observations are easy to patch. A chain of them is a verdict. The demo-prep session on 2026-05-28 (continued 2026-06-01) produced exactly that chain — Fire button below the fold, "Do another round" button that dismissed the banner instead of navigating, SearXNG fires silently returning Tavily's pre-existing candidates because the SearXNG container was never created, no way to select the pack the user actually wanted to run, off-mode UI competing for the eye in the enrichment split, a vertical "REQUEST REVIEWER" label floating in the middle of the wrong pane, the "Deck" mode button connoting presentation when the actual model is workflow. Each one was a one-line patch; together they're a verdict the user named: *"Something is very wrong with our UI. Can we take notes and develop a spec?"*

What this commit captures is the work of doing that — pausing the patching reflex, naming the systemic pattern (affordances that **Hide**, **Die**, **Mismatch**, or **Misname**), framing the project's dual identity (working app + microservices/microfrontend/API-first demonstration) as the lens every UX decision in the audit must pass under, and turning each observation into either a locked decision or an explicitly parked open question. Three small forward-affordance fixes did land alongside this drop as a separate fix commit (the spec's evidence log calls them out as "Already patched this session" so they're not re-implemented), but the spec itself ships zero behavior change — it ships shared language and locked direction for the work to come.

This matters because the alternative is what we just lived: an agent (this agent) hand-patching four discrete things in a row without recognizing two of them were already specced-but-unshipped in [[../context-v/plans/Run-as-First-Class-Operation]] Part 4. The memory deltas saved this session ([[cluster-then-spec-not-patch]] and [[holistic-framing-preferred]]) are the discipline written down so the next session reaches for system-level reading first, single-symptom patching last.

## What's captured

### The systemic pattern — three confirmed failure shapes + one emerging

Every issue this session fits into:

1. **Hidden** — the affordance exists and works, but the user can't *find* it (Fire button below fold; no `none` helper on the PACKS section while ROWS has one).
2. **Dead** — visible but does nothing useful or silently the wrong thing ("Do another round" dismissed; SearXNG fires silently failing into the pre-existing Tavily candidates).
3. **Mismatched** — same verb has a different interaction model across surfaces ("run a pack" is click-to-fire in Response Reviewer's by-record view, multi-select fan-out in Pack Runner).
4. **Misnamed** *(emerging — N=1 so far)* — the label evokes a wrong mental model ("Deck" → presentation slide deck, when the actual model is left-to-right workflow). Promoted formally once more examples surface.

### Eight locked decisions

1. Pack selection stays multi-select; add the missing `none`/"only this" helpers symmetric with the ROWS section. Not a model redesign.
2. Defaults explicitly **parked** (entity-name foot-gun, all×all firehose) — out of scope this spec.
3. Ship [[../context-v/plans/Run-as-First-Class-Operation]] Part 4 properly; replace the hand-patched stand-ins.
4. **"Augment This Set"** — a set-level button in Record Collector dispatches `augment-it:navigate { remoteId: 'packRunner' }`, which the shell turns into the enrichment split with the set pre-selected. Label and target both locked by the user.
5. Enrichment-mode is exclusive UI; the off-mode surface hides; the two big tabs collapse into icon-with-tooltip switchers.
6. Peek-deck position labels anchor to the pane's left margin — `.peek-overlay { justify-content: flex-start }`.
7. Rename **"Deck" → "Flow"** across the shell. UI label, `LayoutMode` type literal `peek-deck`, plus comments in App.svelte / layout.svelte.ts / remotes.ts.
8. Flow is the primary; Split/Full are layout sub-options. Three-tier widget: Flow parent → numbered-bubble progress strip with tooltips (one bubble per `REMOTES` step, click-to-navigate) → Split/Full small icon-with-tooltip toggles. Plus a top ↔ left-column position toggle, persisted.

### Three open architectural questions (parked, awaiting decision)

1. Enrichment-surface composition (from §5): wrap PTM + Pack Runner inside a single `enrichmentSurface` parent remote, or keep them as separate paired remotes that share mode state via the existing `augment-it:enrichment-mode` window event?
2. Flow widget default position (from §8): top (minimal change) or left-column (always-visible workflow rail)?
3. One or two enrichment bubbles in the Flow strip? `REMOTES` currently lists PTM and Pack Runner separately; the unified-mode decision in §5 argues for one.

### The dual-identity framing

augment-it lives two lives: **working app** that augments record sets (could plausibly have outside users), **and** a demonstration of microservices + microfrontend + API-first architecture (every remote and service is a teaching surface). The two lenses are usually complementary but can pull opposite directions (outside-user wants seams hidden; demo-visitor wants seams legible). The spec's "Project context" section locks this framing as the meta-lens for every UX decision in the audit; the dual-identity blueprint stub holds the standalone framing for cross-spec reference.

### The four sibling stubs

Spawned from the parent spec's evidence and wish list:

- [[../context-v/blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] — codifies the dual-identity framing as a project-level blueprint.
- [[../context-v/specs/API-First-In-App-Documentation]] — per-remote / per-service in-app documentation revealed inline via a small CTA, reusing the icon-with-tooltip pattern. The first concrete feature motivated by the architecture-demo identity.
- [[../context-v/specs/Initial-User-Experience]] — landing through a skippable, non-blocking onboarding to the first productive action; auth-gate first impression in scope.
- [[../context-v/blueprints/Auth-Patterns-following-Astro-Knots-Patterns]] — translates Astro Knots auth conventions (session cookie, public allowlist, no-silent-bypass) into augment-it's Rsbuild + Module Federation + NATS architecture. Names what translates literally and what doesn't (Astro middleware-vs-prerender mechanics don't directly apply; the *failure family* — a gate that looks present but doesn't run on every request — does).

All four sibling docs are stub-shape: frontmatter-only with H1, an HTML placeholder comment explaining where each was seeded from and the topics the body needs to address, plus a Related section with `[[wikilinks]]` so they're discoverable from the start. Bodies are deliberately not pre-written; they wait for dialog with the user.

### The pickup

[[../context-v/reminders/Pickup-2026-06-01]] — a substantive session-handoff doc. Names every decision verbatim, every parked item, the verify-before-resume command block (`docker compose ps` to confirm all ten services including the freshly-created `searxng`), and the two memory deltas the next agent should load on turn one. The pickup is the entry point for any next session that wants to resume this arc cold.

## What also shipped — three small forward-affordance fixes (separate fix commit)

These rode in alongside as `fix(pack-runner, enhanced-records-list): wire the dead/hidden forward affordances`. They're listed in the spec's evidence log as "Already patched this session" so future work doesn't re-implement them:

- `apps/pack-runner/src/app.css` — the `.fire-card` is now `position: sticky; bottom: 0`. The Fire button can no longer hide below the fold.
- `apps/pack-runner/src/App.svelte` — a "Response Reviewer →" button in the fire-card, available *during* firing, dispatches `augment-it:navigate { remoteId: 'responseReviewer' }`. The while-firing hint explains that fan_out is server-side and Response Reviewer auto-refreshes on the `response.created` broadcast — so the user can hop over and watch results stream in instead of staring at "firing…" for minutes.
- `apps/enhanced-records-list/src/App.svelte` — the "Do another round of enhancements →" button used to call `dismissSuccess` (banner-close only); it now dispatches `augment-it:navigate { remoteId: 'promptTemplateManager' }`. The shell's nav handler comment had literally named this affordance, but the dispatch was never wired.

The honest caveat: items 1 and 2 are un-shipped slices of [[../context-v/plans/Run-as-First-Class-Operation]] Part 4 hand-implemented under demo pressure. Decision §3 in the new spec says ship Part 4 *properly* (subscribe to `run.updated`, real per-outcome live progress) and replace these stand-ins.

## What's not in this drop

- **Sign-off.** The spec is `status: Draft`. Per the [[../context-v/skills/context-vigilance/references/developing-a-spec]] rhythm, implementation against the locked decisions waits on the user's explicit sign-off.
- **Narrative pass.** The spec body is captured-as-it-emerged, not polished for flow. Per the rhythm, the narrative pass happens *after* sign-off, not before.
- **Prompt pairing.** Once signed off, the locked decisions chunk into prompts under `context-v/prompts/` for executable handoff. Not yet.
- **The four sibling stubs' bodies.** Frontmatter + topic placeholders only. Bodies develop with the user when each is picked up.

## Related

- [[../context-v/specs/Shell-and-Micro-Frontend-UX-Coherence]] — the parent spec this drop produces
- [[../context-v/plans/Run-as-First-Class-Operation]] — Decisions §3 and §8 lean on this plan; Part 4 still ⏳ pending
- [[2026-06-01_01_SearXNG-Joins-as-Peer-Provider]] — the substantive landing this session was demo-prep for; surfaced the chain of UX issues the spec captures
- [[2026-05-26_02_Packs-and-Bundles-End-to-End]] — the two-day arc whose triage cockpit the demo-prep was walking
