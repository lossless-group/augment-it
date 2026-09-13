---
title: "Design System Convergence — the organ registry, its five verdicts, and the fingerprint ledger that catches drift while it happens"
lede: "The registry is what makes drift legible: a declared organ is a decision, an undeclared one is drift. The code can be identical in both cases."
date_created: 2026-09-13
date_modified: 2026-09-13
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 5 (1M context)
semantic_version: 0.0.1.0
status: Active
tags:
  - Spec
  - Augment-It
  - Design-System
  - Component-Library
  - Federation
  - Microfrontends
  - Platform-Engineering
site_uuid: 5e5f4977-e7a4-4b15-b49a-1b7d8e3a0d30
hex_code: jfqcni
date_authored_initial_draft: 2026-09-13
date_authored_current_draft: 2026-09-13
publish: true
---

# Design System Convergence — the organ registry

> **What this document is.** The master list of **organs** — recurring UI concepts
> — across the `augment-it` federation, each with its implementations, a
> fingerprint, and a verdict. Maintained by
> [[../loops/Converge-The-Federated-Design-System]].
>
> **What it is not.** A component library. A style guide. A mandate. Members build
> what they want; this document records what got built more than once and what the
> platform team decided about it.

## Why Care?

`augment-it` is heading toward one repo per app, owned by teams of one to three.
The architecture is already shaped for it — sovereign members, no shared
federation runtime, independent deploys.

**The moment a member leaves the monorepo, cross-member duplication stops being
greppable.** Everything not converged before the split is converged never. This
registry is the artifact that has to exist before the first member moves out.

It also encodes the governance stance, which is deliberately permissive:

> The difference between purposeful variation and drift is **not a property of the
> code**. It is whether a human wrote it down. Two members deliberately diverging
> is healthy, and gets recorded as `sanctioned`. The same two members diverging by
> accident is drift. **The code is identical in both cases.** Only this registry
> distinguishes them.

## Entry schema

```yaml
organ: ConnectorChip              # canonical PascalCase name
intent: >                         # one sentence — the user problem, not the markup
  A chip representing an available connector, selectable, showing enabled state.
state: candidate                  # see states below
verdict: PROMOTE                  # PROMOTE | CONVERGE | SANCTION | DEMOTE | WATCH
similarity: identical             # identical | near | structural | intent-only
implementations:
  - { member: pack-runner,       file: apps/pack-runner/src/ConnectorChip.svelte,       lines: 0, form: component, hash: "" }
  - { member: response-reviewer, file: apps/response-reviewer/src/ConnectorChip.svelte, lines: 0, form: component, hash: "" }
best_current: pack-runner         # the strongest implementation, and the promotion source
token_purity: clean               # clean | minor | violations — F8/F11 posture
a11y: documented                  # documented | partial | absent
first_seen: 2026-07-30            # when this organ entered the registry
last_measured: 2026-09-13
fingerprint_history:
  - { date: 2026-07-30, state: identical }
  - { date: 2026-09-13, state: identical }   # 6 weeks, no drift
refactor_doc: null                # context-v/refactors/... when a verdict creates work
gh_issue: null
```

### States

| State | Meaning |
|---|---|
| `local` | One member has it. No evidence of duplication. **This is the healthy default and most organs should stay here.** |
| `proposed` | A member volunteered it through the push channel. Awaiting a verdict. |
| `candidate` | The sweep found it in 2+ members and it is undeclared. Needs triage. |
| `sanctioned` | Implementations differ **on purpose**. Recorded here and under *Deviations* in each member's `DESIGN.md` (F9). A real outcome, not an undecided one. |
| `converging` | A canonical implementation is named; members are adopting at their own pace. |
| `published` | Lives in `packages/shared-ui`. Consumption is opt-in, always. |
| `retired` | Demoted out of `shared-ui` into its last consumer. |

### The five verdicts

Defined in full in [[../loops/Converge-The-Federated-Design-System]]. In brief:
**PROMOTE** (3+ members, stable, token-pure, a11y contract) · **CONVERGE** (should
be one dialect, not ready to graduate) · **SANCTION** (the needs genuinely differ)
· **DEMOTE** (`shared-ui` primitive with <2 consumers) · **WATCH** (evidence
insufficient — itself a finding, not a deferral).

---

## The published surface today

`packages/shared-ui` — **2 components**, against 79 `.svelte` files across 19
members. That ratio is the whole problem in one line.

| Organ | File | Consumers | Verdict |
|---|---|---|---|
| `ConfidencePill` | `packages/shared-ui/src/ConfidencePill.svelte` | ⚠️ reportedly **reimplemented inline** in `record-collector` rather than consumed | — pending sweep |
| `ToggleHeader__PromptOrPackage--Icons` | `packages/shared-ui/src/ToggleHeader__PromptOrPackage--Icons.svelte` | unknown | — pending sweep |

---

## Standing candidates — measured 2026-09-13

These four were recorded in the root `DESIGN.md` on **2026-07-30** as byte-identical
promotion candidates. Re-measured six weeks later, by hash:

Re-measured by `git show` at four points in history — birth, 2026-07-30, and HEAD:

| Organ | Members | at birth | 2026-07-30 | 2026-09-13 | Verdict |
|---|---|---|---|---|---|
| `ConnectorChip` | `pack-runner`, `response-reviewer` | identical | identical | **identical** | ✅ real candidate, six weeks stable |
| `ConnectorPalette` | `pack-runner`, `response-reviewer` | identical | identical | **identical** | ✅ real candidate |
| `ColumnMapper` | `person-db-resolver`, `affiliation-rating-resolver` | ❌ different | ❌ different | ❌ different | **never identical — the claim was false when written** |
| `RecordCard` | `person-db-resolver`, `record-db-resolver` | ❌ different | ❌ different | ❌ different | **never identical — and unchanged since birth** |

> **The finding that justifies the ledger — and it is not the one we expected.**
>
> The first reading of this table was "two of the four drifted while sitting in a
> queue meant to catch drift." **That was wrong, and the truth is worse.**
> `ColumnMapper` and `RecordCard` were **never byte-identical at any commit in the
> repository's history.** Both were copy-pasted at birth from a sibling — the copy
> happened in someone's clipboard, not in version control — and each was already
> carrying its own types, prefix and field list in its very first commit. Neither
> file has changed since 2026-07-30 at all.
>
> So nothing drifted. **The list was wrong on the day it was written**, because
> "byte-identical" was asserted rather than measured, and for six weeks every
> reader inherited the error — including the first draft of this document.
>
> A hand-written measurement is a claim wearing the costume of evidence. The fix is
> not "re-measure more often"; it is **never hand-write the measurement.**
> `pnpm organ:drift` generates this table, which is why it can be trusted and why
> the prose above it can not.

---

## Organ registry

> Populated by the first sweep (2026-09-13). Scanners cover four member clusters;
> entries merge here after cross-cluster deduplication.

<!-- SWEEP:2026-09-13 -->

**Sweep 1 complete.** Four read-only scanners across 19 members + the platform
layer. 24 organs identified; the 17 with cross-member evidence are registered
below. Counts are measured, not estimated.

### PROMOTE — evidence is sufficient

| Organ | Members | Similarity | Evidence | Blocker |
|---|---|---|---|---|
| **WsConnectionStatusPill** | **11+** | 3 byte-identical (`saa`/`ow`/`srq`) + 8 variants | **17 of 19 packages depend on `@augment-it/workspace`** and observe the *same* `connection_status`, then render it 11 ways. `sort-filter-lens` and `person-enrichment` need it and render **nothing**. | none — **start here** |
| **ConnectorChip** + **ConnectorPalette** | `pack-runner`, `response-reviewer` | **identical** (md5 `3aab2e76…` / `e0aa8368…`) | 6 weeks zero drift. Discriminated-union `ChipState`, inventory-as-prop, exported types. Suspected 3rd copy in `search-and-add` **checked and ruled out** — `ProviderPalette` is a different organ. | 4 mechanical fixes, below |

**`ConnectorChip` pre-promotion fixes** (≈2 hours, not a redesign): `color: white`
×2 → `var(--color-on-accent)`; `role="menu"` declares no `role="menuitem"` children
(invalid — copy `chat/ChatSurface.svelte`, the one correct ARIA menu in the
product); add `aria-haspopup`/`aria-expanded` (it *is* a menu button); add the
first `:focus-visible` consumer of `--focus-ring`. Also `box-shadow` literal →
`var(--fx-popover-shadow)`, which exists and is used by nobody.

### CONVERGE — should be one dialect

| Organ | Members | Canonical | Why |
|---|---|---|---|
| **CandidateGate** | 4 (**3 inside `org-workbench`**) | `org-workbench/OrgCreateInline` | Triplicated *within one member*, plus a `srq-`-prefixed copy in `search-results`. **`AddAffiliationInline` dropped the `.ow-gate-score` span** — it fetches score + `match_reason` and throws them away, so one gate shows candidates without the evidence that justifies them. |
| **AdditiveUrlList** | 5 | `org-workbench/AdditiveList` (384L) | The only version that is a *contract*: typed props, 6 optional callbacks, edit-in-place, destructive-action confirm, `:focus-within` keyboard reveal. `person-enrichment` has the same 46-line skeleton **three times** (`LinkList`/`DomainList`/`EmailListField`); `affiliation-rating-resolver` has it **four times inline in one file**. |
| **ResultRow** | `search-and-add`, `search-results` | `search-and-add/ResultRow` | Per-row component owning its own state vs. flattened into the list. **Self-documented**: the copy's header cites the source file *and* the tracking issue. |
| **DebouncedAutocomplete** | `org-workbench`, `person-enrichment` | **hybrid** | Split: `person-enrichment` has the correct *behaviour* (sequence-number stale guard, Enter-picks-first, Escape, edit-dissociates-pick) in **keyboard-inaccessible markup** (`<li onclick>` with a11y warnings suppressed). `org-workbench` has the correct *markup* (`role="listbox"` + `<button>`) and weaker behaviour. Promote behaviour into markup. |
| **EditableField** | `records-surface`, `record-collector`, `person-db-resolver` | `records-surface/EditableField` | Only one treating focus, Escape and accessible name as first-class; its comment records rejecting `autofocus` for a11y reasons. `record-collector`'s `contenteditable` + `role="textbox"` has **no accessible name at all**. |
| **ConfidencePill** | **published** + `record-collector` | `packages/shared-ui` | Already federal; `record-collector` reimplemented it inline with the same bands, thresholds and `color-mix` formula — **and does not depend on `@augment-it/shared-ui` at all**. The federal one clamps out-of-range input; the copy renders `142` raw. |
| **InlineErrorNotice** | **all 19** | — | ~25 error sites product-wide. **Zero `role="alert"`, zero `aria-live`, anywhere.** `prompt-template-manager` renders errors *grey* (`saveStatus = 'error: …'` lands in `.muted`) while defining an unused red `.warn`. `pack-runner` renders `fan_out failed` into `.result`, which has an **ok-tinted green background**. |

### SANCTION — differ on purpose

| Organ | Members | Why it stays local |
|---|---|---|
| **MessageBubbleTranscript** | `chat` | Sole holder; turn-kind dispatch is chat-specific. *(Separately: worst token purity in the product — 6 phantom tokens.)* |
| **FilterAndSortControl** | `sort-filter-lens`, `org-workbench` | Genuinely different capability, not drift. `sort-filter-lens`'s persisted 3-key sort with rank badges is the most capable control in the product; `org-workbench`'s is a one-field search. |
| **PromptEditorSurface** | `prompt-template-manager`, `chat`, `request-reviewer` | Three legitimate views of one artifact — author / refine / resolved-preview. |
| **FileIngestUploader** | `record-collector` | Sole holder. Flagged as the *least-designed* surface in the product, not a candidate. |

### WATCH — evidence insufficient

`EmptyState` (best copy: `chat`, `search-results` — the only ones naming the action
that fills them) · `SpinnerIndicator` (3 copies, 3 keyframe names, 3 durations — two
on screen rotate out of sync) · `CardChrome` · `CollapsibleDisclosure`
(`record-collector` is the **only** one setting `aria-expanded`) · `FireAndForgetQueue`
· `CrossRemoteHandoff` ⚠️ *(`enhanced-records-list` omits the localStorage step the
other two treat as mandatory — a latent bug, not a design variant)*.

### BLOCKED on the platform, not on agreement

| Organ | Scale | Blocker |
|---|---|---|
| **ButtonRecipe** | **158 rule-sets** federation-wide; 16 distinct ways in `response-reviewer` alone | [[../refactors/The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z]] |
| **StatusBadge / Pill** | **34 treatments**; 12 distinct recipes in `response-reviewer` alone | same |

> **Do not promote these yet.** A promoted `Button` must pick one radius and one
> padding. Picking them from literals rather than a named scale makes one member's
> accident into federal law. **The token families come first.**

---

## What the sweep found that nobody asked about

Three findings surfaced by **all four scanners independently**, none of which was
in any scanner's brief:

1. **170 declarations across 10 members reference tokens that do not exist.**
   `--space-*`, `--radius-*` and `--z-*` have **zero declarations** in
   `packages/theme`. Members invented the names they expected and let the CSS
   fallback carry the value. → [[../refactors/The-Federal-Layer-Never-Shipped-Space-Radius-Or-Z]]

2. **`sort-filter-lens` leaks 61 unnamespaced classes**, and `.error` / `.row` /
   `.muted` collide with 16 / 19 / 14 other surfaces **today**. →
   [[../refactors/The-Sort-Filter-Lens-Containment-Breach]]

3. **Zero of 19 members have a `DESIGN.md`.** All 19 `doc:` paths in the federal
   registry are dangling references. `design-index.json` and every
   `.design-context.json` — the documented *agent entry points* — do not exist
   either. The portal reads none of them: `docs-portal` has no glob and no markdown
   renderer, and its member list is a hand-maintained array with **one** entry.

> **The pattern under all three.** The federal layer documented a vocabulary, a
> per-member doc layer, and an agent context contract. Members complied with what
> existed and improvised the rest. **Nothing ever compared the contract to the
> runtime** — `design-drift.mjs` compares CSS to CSS, so a token members consume
> and the theme never declares is invisible to it.
>
> This is the same disease as
> [[../issues/Structural-Invariants-Live-In-Prose-So-Sweeps-Stop-Halfway]], in a
> different layer, and it has the same fix.

## The push channel already existed — informally, with nowhere to go

The strongest evidence for the governance model is that **teams were already
flagging their own duplication in code comments**:

- `search-results/ResultsAccept.svelte`: *"copy-adapted from search-and-add (spec
  D7: per-remote copies, no shared runtime; **knowingly more fuel for the component
  library, gh #22**)"*
- `search-and-add/ProviderPalette.svelte`: *"Borrowed shape: apps/pack-runner's
  ConnectorPalette/ConnectorChip"*
- `affiliation-rating-resolver/app.css`: *"trimmed subset of person-db-resolver's
  `pdr-*` sheet"*

Nobody was careless. Three teams **named the file they copied and the debt they
were taking on**, in the commit, at the time. There was simply no registry for that
declaration to land in, so it stayed in a comment nobody aggregates.

**That is what this document is for.** The push channel does not need to be built —
it needs somewhere to write to.

---

## Known organ seeds

From [[../issues/No-Component-Library-UI-Improvised-Not-Component-Based]]
(2026-07-24), unverified at the time and now under sweep:

- **WS status pill + client badge header** — every remote, copied N times
- **Additive URL list with ➕ form** — `org-workbench` (`AdditiveList`), `affiliation-rating-resolver` (four lists), `person-enrichment` (`LinkList`)
- **Candidate picker with score + match_reason** — `record-db-resolver`, `person-db-resolver`, `org-workbench` (`AddPersonInline`)
- **Connector/provider chip palette** — `pack-runner`, `response-reviewer`, `search-and-add`
- **Debounced autocomplete** — `person-enrichment` (org picker), `person-db-resolver`, `org-workbench` (`OrgSearch`)
- **Result/source row with one-click action** — `response-reviewer`, `corpora-curator` (`SourceList`), `search-and-add` (`ResultRow`)

Plus the federation-wide measurement that started this: **158 button rule-sets and
34 badge treatments, none of them components.**

## Related

- [[../loops/Converge-The-Federated-Design-System]] — the loop that maintains this
- [[../issues/No-Component-Library-UI-Improvised-Not-Component-Based]] — the seed
- [[../loops/Sweep-Local-Federated-Design-System-for-Fidelity]] — the token lane
- `DESIGN.md` §The promotion path · §The federation contract · §Local design systems
