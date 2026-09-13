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

| Organ | Members | 2026-07-30 | 2026-09-13 | Signal |
|---|---|---|---|---|
| `ConnectorChip` | `pack-runner`, `response-reviewer` | identical | **identical** | ✅ stable six weeks — strongest promotion candidate in the product |
| `ConnectorPalette` | `pack-runner`, `response-reviewer` | identical | **identical** | ✅ same |
| `ColumnMapper` | `person-db-resolver`, `affiliation-rating-resolver` | identical | ⚠️ **2 distinct versions** | **diverged in the queue** |
| `RecordCard` | `person-db-resolver`, `record-db-resolver` | identical | ⚠️ **2 distinct versions** | **diverged in the queue** |

> **The finding that justifies the fingerprint ledger.** Two of the four drifted
> *while sitting in a list whose entire purpose was to catch drift*. Nobody
> re-measured for six weeks, so the list kept asserting "byte-identical" long after
> it stopped being true.
>
> A list written once and never re-measured decays into a historical document that
> reads like a live one — which is **worse than no list, because it is believed.**
> This is the same failure as a config comment claiming a scope it no longer has,
> and it has the same fix: measure it on a trigger, and record the measurement date
> next to the claim.

---

## Organ registry

> Populated by the first sweep (2026-09-13). Scanners cover four member clusters;
> entries merge here after cross-cluster deduplication.

<!-- SWEEP:2026-09-13 -->

_Sweep in progress — entries land as scanner inventories are merged and triaged._

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
