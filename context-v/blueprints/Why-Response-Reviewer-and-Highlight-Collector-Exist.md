---
title: "Why Response Reviewer and Highlight Collector Exist — The Verbose-Prose-to-Tabular Bridge"
lede: "The core impedance mismatch Augment-It solves: CRM data is tabular (rows × columns, succinct cells), while LLM and Deep-Research responses are verbose markdown prose (paragraphs, hedging, citations, expansion). Augment-It's purpose is to turn prose back into something that fits in a CRM cell. The response-reviewer and highlight-collector are the two pipeline stages where that bridge gets built — and they exist because no structured-output regime, however good, removes the need for a human-in-the-loop integrity check before tabular data gets written back into a system of record."
date_created: 2026-05-18
date_modified: 2026-05-18
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Blueprint
  - Augment-It
  - Pipeline-Design-Rationale
  - LLM-Output
  - Human-in-the-Loop
  - Tabular-Data
  - Response-Reviewer
  - Highlight-Collector
status: Draft
---

# Why Response Reviewer and Highlight Collector Exist

## The mismatch that defines Augment-It

CRMs hold **tabular data**. A row is a prospect, a customer, an account. Columns are short, succinct, queryable: `name`, `industry`, `funding_stage`, `most_recent_round`, `decision_maker_email`. Each cell is the kind of thing you can sort, filter, dedupe, and dashboard.

LLM and Deep-Research responses are **verbose markdown prose**. Multi-paragraph analysis. Hedging language. Citations. "Based on the available information, it appears that..." Tables sometimes — but embedded in prose. Lists with prose around them. Genuinely useful content, mostly the wrong shape.

Augment-It exists to bridge the two. The job is:

1. Take a CSV / CRM export (tabular)
2. Augment each row by asking an LLM (or research agent) for additional information
3. Write the augmented result **back into the CRM as tabular data** (back to the original shape)

The middle step — the LLM call — produces prose, not cells. Closing that gap is the whole product.

## Why structured output doesn't eliminate this

The obvious objection: *"Modern LLMs do structured output. Ask for JSON. Done."*

Two things wrong with that as the whole answer:

**(1) Structured output still hallucinates.** The model returns a perfectly-shaped JSON object whose `most_recent_round_size` field says `$45M Series B` when the company actually raised $25M. The schema is correct; the value is wrong. **Data integrity is not a schema problem; it's a content problem.** Structured output gives you confidence about the shape, not the truth.

**(2) The interesting content is the prose.** A research agent's value is in the *reasoning* it shows along the way — the sources it cites, the inferences it chains, the things it found that you didn't ask for. Forcing the entire response into a flat JSON tail loses that. The pattern Augment-It commits to is: **let the LLM produce rich prose, then distill it through a human-in-the-loop pass that preserves the reasoning trace while extracting the tabular cell value.**

Even with the best structured-output regime imaginable, you need a step where a human (or a downstream agent acting on the human's behalf) confirms that the cell value reflects the truth before it lands in a system of record. That step is the **response-reviewer**, and the mechanism by which it distills the verbose prose into a cell is the **highlight-collector**.

## What the response-reviewer is for

The response-reviewer is the post-flight inspection surface. It presents:

- The verbose LLM response, rendered as markdown (preserving structure, links, code blocks, embedded tables)
- The row that was augmented (so the human sees what context the LLM was working from)
- The prompt that was fired (so the human can check if the question was right)
- Tools to flag the response (good / partial / wrong / needs-rerun)

The response-reviewer is **read-mostly**. It's where a human (or an agent in human-in-the-loop mode) inspects what came back and decides whether it's worth keeping. If the response is wrong, the row gets sent back for a re-augment with a different prompt or different model.

In the bolt monolith, this stage was `QueryResponse.tsx`, `QueryResponseList.tsx`, and `ResponseObjectReviewer.tsx` ([[Bolt-Codebase-Analysis]]). In Tanuj's federated split, this stage never got built. The rewrite picks it back up.

## What the highlight-collector is for

The highlight-collector is the **distillation surface**. It exists because even when a response is good, only a fraction of its prose is the answer.

The mechanism is span-selection over the markdown. A user (or an agent) clicks the start, clicks the end, and the selected text becomes either:

1. **A structured cell value.** "This phrase — `$25M Series B led by Sequoia, October 2024` — is what goes in the `most_recent_round` column." The highlight gets typed (string, currency, date, enum) and saved as the cell value with provenance back to the source response.
2. **An abbreviated freeform response.** Sometimes the right "tabular" answer isn't a single value — it's a one-sentence summary. The highlight-collector lets the user extract a sentence-length distillation and store *that* as the cell, replacing the verbose paragraph it came from.

In the bolt monolith, this was `HighlightsList.tsx`, `ResponseHighlight.tsx`, and `ResponseObjectHighlighter.tsx` ([[Bolt-Highlight-Collector-Analysis]]). It's the most-built feature of the bolt branch and the only existing description of the distillation pattern.

## Why both stages exist (rather than collapsing them)

Tempting design: one combined "review-and-distill" UI. The response-reviewer and highlight-collector look like they overlap.

The reason to keep them as distinct stages:

- **Review is a triage operation.** Most responses get glanced at, accepted or rejected, no highlights extracted. The reviewer is high-throughput.
- **Distillation is a precision operation.** Only the responses worth keeping get highlights extracted, and that work is careful, click-by-click. The highlight-collector is low-throughput-but-deep.

Forcing the same UI to handle both means either making triage too heavy (slows down the high-throughput path) or making distillation too light (you can't carefully select spans in a triage-shaped UI). They share data; they don't share interaction shape.

A second reason: **the chat-as-shell architecture** ([[Federation-and-Bundler-Decision]]) means each stage can be invoked independently by a capability. "Show me responses for memo X that I haven't reviewed yet" mounts the response-reviewer. "Extract the funding-round value from this response" mounts the highlight-collector. The chat orchestrates which stage you're in; the stages don't have to know about each other.

## What this means for the rewrite

The forward sitemap will describe the response-reviewer and highlight-collector as **federated remotes mounted by the chat shell**, with prop contracts that look like:

- Response-reviewer: `(response_id, record_id, prompt_id) → renders the inspection UI`
- Highlight-collector: `(response_id, suggested_field?: string) → renders the span-selection UI, on save emits a highlight to the shell's store`

The shell owns the records, the prompts, the responses, the highlights. The remotes are presentation. The flow back into the CRM is owned by the insight-manager remote (the "land" stage) which reads highlights from the shell and emits per-CRM payloads.

## Anti-patterns to avoid

- **Inline span selection in the response-reviewer.** Reviewing and distilling are different operations. Don't combine.
- **Forcing tabular shape at LLM call time.** Let the LLM be verbose. Distill afterward. The verbose response is information for the reviewer; only the highlight is information for the CRM.
- **Auto-extracting "the obvious" highlight.** Tempting and reasonable for low-stakes fields. Becomes catastrophic when the obvious highlight is wrong — the whole point of the human-in-the-loop is that no auto-extraction reaches the CRM without confirmation. Auto-suggest, never auto-commit.
- **Treating Deep Research output the same as raw chat output.** Deep Research returns sources + reasoning chains alongside conclusions. The reviewer should render those sources inline; the highlight-collector should be able to attribute extracted highlights to specific sources. Bolt didn't do this and it's a meaningful missing feature.

## Related

- [[Augment-It-Prior-Art-Survey]]
- [[Bolt-Highlight-Collector-Analysis]] — the only existing operational description of the distillation stage
- [[Bolt-Codebase-Analysis]] — where response-reviewer lived in the monolith
- [[Federation-and-Bundler-Decision]] — the architecture this rationale assumes
- [[In-App-Chat-as-Agent-Surface-for-Client-Apps]] (ai-labs) — the chat substrate that orchestrates which stage is active
