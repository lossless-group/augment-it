---
title: "Inbox Sort by Agent Tasks — moving the inbox from a flat 86-item pending queue into a task-typed work surface where the operator sees what's next and the agent does the safe parts automatically"
lede: "86 pending inbox files render identically, so the operator context-switches between four task types on every scroll."
date_created: 2026-06-11
date_modified: 2026-06-11
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-11 — Initial draft, written immediately after the published_at lift + corpus session ship landed. Inbox is at 86 pending files (75 .md + 11 PDFs), which is the right size to feel the flat-list pain — small enough that nothing has been lost, large enough that "scroll through and triage one by one" is no longer ergonomic. Captures the task taxonomy and the suggested-task-at-capture-time pattern; the phased plan at the end sequences from simplest move (frontmatter-level grouping) to fanciest (auto-routing high-confidence triages with a soft confirmation).
tags:
  - Exploration
  - Augment-It
  - Inbox
  - Triage
  - Agent-Tasks
  - Sort-Filter-Lens
  - Confidence-Bands
  - Frontmatter
  - Living-Roster
status: Active

related_skills:
  - lossless-flavored-markdown
site_uuid: fa0852b5-d2c6-4cc6-85cc-614c252164c2
hex_code: 37t51c
date_authored_initial_draft: 2026-06-11
date_authored_current_draft: 2026-06-11
---

# Inbox Sort by Agent Tasks

## The problem

Tonight's inbox has 86 files in `clients/reach-edu/corpus/inbox/`,
all carrying `inbox_status: "pending"`. The Sort & Filter Lens
renders them as a flat list. The operator triages by hand —
scrolling, opening, reading the first paragraph, deciding what
funder dir it belongs in, doing a `mv` or a lens action, repeat.

That's fine at 10 files. At 86 it's already friction. The friction
isn't volume per se — it's **context-switching between task types**.
In any given scroll the operator passes through, in random order:

- A press release that obviously goes in `the-gates-foundation/`
  based on the URL and title alone — a 5-second decision the
  operator shouldn't be making
- A PDF where the .md sidecar body is empty because Jina can't
  fetch a `file://` URL (the ResearchGate workflow tonight) — needs
  PDF text extraction before it's useful
- An inbox file that's a near-exact duplicate of one already in an
  assigned funder dir from a previous session — needs a dedupe
  decision, not a triage decision
- A low-signal capture (a Wikipedia disambiguation page accidentally
  triaged in, a "Page not found" Jina output, a captured page that
  ended up being mostly cookie-consent boilerplate) — should be
  discarded outright, no funder routing needed
- A high-signal capture that the operator wants to flag for
  follow-up but doesn't have time to triage yet — needs to stay
  surfaced, not get lost in the queue

These are five different kinds of work. The lens treats them as
one kind of item.

## Task taxonomy

Six task types cover the inbox population we've seen tonight:

| Task | When it applies | Agent-doable? |
|---|---|---|
| **TRIAGE** | Title / URL / domain clearly maps to one funder in the roster | Yes (high confidence) — auto-route with soft-confirm |
| **EXTRACT** | File has `binary_asset` block but no body text (PDF that needs extraction) | Yes — fire a PDF extraction pass (Marker / PyMuPDF) and write the text into the .md body |
| **ENRICH** | File is a stub (Wikipedia page about an entity, a sparse landing page) where the operator wants more context | Partial — agent can crawl linked pages; human picks what's worth keeping |
| **DEDUPE** | File matches an existing file in an assigned funder dir by URL, title, or sha256 | Yes — propose the merge; human confirms |
| **FLAG** | High-signal capture (new grant program announcement, op-ed about a funder, exec change) that needs visibility but not immediate triage | No — operator-only; agent surfaces but doesn't act |
| **DISCARD** | Low-signal (cookie wall, 404, disambiguation page, accidental capture) | Yes (high confidence) — propose; human confirms |

The taxonomy is small on purpose. Every inbox file maps to exactly
one task type, and every task type has a different affordance in
the lens.

### What "agent-doable" means concretely

For TRIAGE: the agent looks at the .md's `title`, `exact_url`,
domain, and (now) `published_at`. It compares against the funder
roster (the v10 record set's `corpus_funder_slug` values and
`Prospect / Organization` names). If the match is high-confidence —
e.g., `exact_url` matches a known funder domain, or the title
contains the funder name as a substring — the agent stamps a
proposed `triage_suggestion:` block in the file's frontmatter, the
lens shows a green "auto-route to <slug>" button, and the operator
clicks once.

For EXTRACT: the agent fires a PDF extraction handler (a new
`corpus.extract_pdf_text.requested` capability — wraps Marker or
PyMuPDF), the extracted text replaces the empty body, the file's
inbox_status changes from "pending" to "ready-for-triage" (a new
intermediate state).

For DEDUPE: the agent does a sha256 lookup across the corpus
(cheap — every .md file has the binary_asset's sha256 in
frontmatter); if no exact hit, an embedding-similarity check (the
RAG side from the sibling doc). High-similarity match (>0.92) gets
a "looks like a duplicate of <existing path>" suggestion; the
operator confirms or rejects.

For DISCARD: the agent looks for known low-signal patterns —
`content_length_bytes < 2000`, title contains "Page not found" /
"Access denied" / "Just a moment", domain in a low-signal-list
(YouTube watch pages with no description, etc.). Stamps a
`triage_suggestion.action: "discard"` with `reason: ...`.

For ENRICH and FLAG: the agent surfaces, doesn't act. These are
operator-decision tasks.

## The `triage_suggestion:` frontmatter block

The cheapest way to make this work without rebuilding the lens
from scratch: bake the suggested task into the file's frontmatter
at capture time. The lens reads the existing frontmatter for the
chip count and inbox status; reading one more block is free.

```yaml
triage_suggestion:
  action: "triage" | "extract" | "enrich" | "dedupe" | "flag" | "discard"
  proposed_funder_slug: "hewlett-foundation"      # only for action: triage
  proposed_destination_path: "corpus/hewlett-foundation/"
  confidence: 0.93                                 # 0.0 to 1.0
  rationale: "Title 'Hewlett Foundation 2025 priorities' matches funder roster (hewlett-foundation), exact_url domain hewlett.org matches the funder's known canonical domain"
  proposed_by: "auto-router-v0.1"
  proposed_at: 2026-06-12T03:14:52.000Z
  signals:                                         # the inputs the agent used
    title_match: "exact"
    domain_match: "exact"
    funder_name_in_body: true
    published_within_funder_corpus_range: true
  similar_existing_files:                          # for action: dedupe
    - corpus_path: "reach-edu/corpus/hewlett-foundation/2026-06-09_hewlett-2025-priorities.md"
      match_kind: "title-similar"
      similarity: 0.94
```

The frontmatter block is **proposed**, not authoritative — the
operator's action (or non-action) decides what actually happens.
But the lens has something concrete to group by, sort by, and act
on.

When the operator accepts a triage suggestion, the file moves to
the proposed dir + the `triage_suggestion` block migrates into the
existing `triaged_*` block (which already exists in the inbox
frontmatter schema):

```yaml
triaged_at: 2026-06-12T03:15:21.000Z
triaged_to: "corpus/hewlett-foundation/"
triaged_by: "operator-confirmed:auto-router-v0.1"  # operator confirmed an agent proposal
triaged_note: ""
```

The provenance is preserved — we can tell later whether a triage
was operator-decided, agent-routed-and-operator-confirmed, or
agent-routed-without-confirmation (which we'd only allow in the
highest-confidence band).

## Confidence bands

Three bands gate the affordance the lens shows:

| Band | Confidence | Lens affordance |
|---|---|---|
| Auto-routable | >= 0.90 | "Apply" button. One click. Operator can undo. Optionally: auto-apply on a delay (e.g. "auto-apply in 10s unless cancelled") |
| Suggested | 0.60 - 0.89 | "Looks like <funder>" chip + "Confirm" / "Different funder..." buttons. No auto-action. |
| Uncertain | < 0.60 | No suggestion shown. File renders as "needs triage" with the standard manual affordance. |

The bands aren't fixed — operator feedback adjusts them. If the
operator overrides the agent's auto-applied triage on three
consecutive files, the auto-apply threshold should rise (or get
the operator's attention with a "are you sure auto-route is
calibrated right?" prompt).

This is where the suggested-task discipline composes with the
retrieval discipline from the sibling doc. The agent that proposes
triages can use semantic similarity over the existing assigned
corpus — "this inbox file's content is most similar to X content
already in `hewlett-foundation/`" — to ground the funder proposal
in more than title/URL string match. That cross-doc retrieval is
exactly Phase 2 of the RAG doc.

## Lens grouping

Today the lens is one list. The inbox-task-aware version groups
by `triage_suggestion.action` first, then sorts within each group
by `confidence DESC, captured_at ASC` (highest-confidence first
within a group; oldest first when confidence ties).

The order the operator sees:

1. **Auto-routable TRIAGE** — green pills. One-click. Often a
   dozen of these in a session. Cleared in 30 seconds.
2. **Suggested TRIAGE** — yellow pills. 5-10 seconds each.
3. **EXTRACT-pending PDFs** — blue pills. "Run extraction" button.
4. **Suggested DEDUPE** — gray pills. "Merge" / "Keep separate."
5. **Suggested DISCARD** — red pills. "Discard" / "Keep."
6. **Uncertain** — no pill. Full manual triage.
7. **FLAG** — pinned to top with a star, doesn't participate in
   the main triage queue.

The operator's mental model becomes "drain the easy buckets first,
then handle the residual." That's the trip-report pattern from
the prior changelog entry on the chat verbs — drain the obvious,
focus the human on the hard.

## Where the proposer lives

A new content-ingest handler `corpus.inbox.propose_triage.
requested`:

```ts
args: { client_id: string; corpus_path: string }
returns: { triage_suggestion: TriageSuggestion | null }
```

Fires automatically as the last step of `corpus.inbox.add` (so new
captures land with a suggestion already populated). Also callable
on-demand for re-evaluation when the funder roster changes (a new
record set lands).

Inputs the proposer uses:
- The file's frontmatter (title, exact_url, published_at, tags)
- The file's body (first 500 chars + last 500 chars for signal
  density; doesn't need the whole thing)
- The current funder roster from row-store
  (`corpus_funder_slug` + `Prospect / Organization` + the funder's
  known canonical URL domains, where known)
- The corpus's existing structure (for dedupe — sha256 + similarity)
- A small ruleset for DISCARD signals (length thresholds, title
  patterns)

Outputs go straight into the file's frontmatter via an in-place
edit (same pattern as the `record_uuid` backfill — insert a block
in the existing frontmatter, don't regenerate).

The proposer is **idempotent** — re-running on a file that already
has a `triage_suggestion` block compares the new proposal to the
existing one; if confidence dropped (e.g., the operator manually
overrode and the agent should learn), the new proposal is logged
but the existing one stays. If confidence rose (new evidence — a
new corpus file made dedupe more confident), the suggestion
updates.

## How this composes with retrieval (the sibling doc)

The RAG doc proposes a `corpus.retrieve` capability that returns
top-K by hybrid retrieval. The triage proposer uses it as an input:

> "Given this inbox file, what existing corpus files are most
> similar? Group by funder_slug. The funder with the most/best
> similar files is a candidate for the triage suggestion's
> `proposed_funder_slug`."

The retrieval-grounded suggestion is more robust than title-only
matching because:

- It catches the case where the title is generic ("Annual Report
  2024") but the body is clearly about Hewlett's K-12 program
- It surfaces the case where multiple funders have similar
  content (the "this could go in either Hewlett or Gates"
  ambiguity) — the proposer can flag that with a lower confidence
  and the lens shows a "two candidates" affordance
- It bootstraps cross-document context — if the corpus has 30
  files on Hewlett's K-12 strategy and a new inbox file mentions
  "Bay Area schools," the retrieval finds the connection that a
  title-only proposer would miss

So the dependency direction is: RAG Phase 1 (the
`corpus.retrieve` capability) → triage proposer's medium-band
confidence improves substantially → the auto-routable band
captures more of the workload.

## Phased plan

### Phase 1: frontmatter + grouping only

- Add the `triage_suggestion:` block to the inbox frontmatter
  schema (allow it; don't require it).
- New script `scripts/propose-triage-for-inbox.mjs` —
  off-line, walks inbox files, applies title/URL/domain matching
  against the funder roster, stamps a suggestion block when
  confidence > 0.6.
- Lens groups inbox by `triage_suggestion.action` and renders the
  pill UI per the §"Lens grouping" table.
- One-click "apply" for the auto-routable band. The "apply"
  action moves the file and migrates the suggestion → triaged_*.
- Verify: operator can clear an auto-routable batch in under a
  minute. Today's inbox of 86 has maybe 30-40 auto-routable
  candidates (foundation press releases with the funder name in
  the URL).

### Phase 2: capture-time proposer

- Move propose-triage from a script into a `corpus.inbox.propose_
  triage.requested` NATS handler.
- Fire it as the last step of `corpus.inbox.add` so new captures
  land with a suggestion already.
- Add the EXTRACT path: `corpus.extract_pdf_text.requested` runs
  Marker / PyMuPDF on a binary_asset, replaces the empty body,
  the inbox file becomes triage-ready.
- Add the DISCARD ruleset.

### Phase 3: retrieval-grounded suggestions

- After the RAG doc's Phase 1 lands (`corpus.retrieve` capability),
  the proposer uses it as an additional signal. Confidence on the
  hard cases improves.
- DEDUPE branch lands — sha256 lookup + embedding-similarity check
  + propose merge.
- Per-operator calibration: log every operator override of an
  agent suggestion + the file's signals. Use that as training data
  for confidence-band tuning. Initially manual (operator reviews
  log periodically); eventually a small classifier.

### Phase 4: bulk operations

- "Apply all auto-routable" — single click drains the green
  pills. Audit log of what landed where. Easy undo on the batch.
- Scheduled background pass: re-evaluate every inbox file's
  suggestion when the funder roster changes (new record set, new
  `corpus_funder_slug` value).
- A "triage health" lens that shows the inbox over time — how big
  is it, what task types dominate, are auto-routables landing
  cleanly, what's the agent vs operator accuracy split.

## Open questions

- **What about non-funder inbox files?** Some captures are about
  the workforce-development domain generally (the WEF Future of
  Jobs report, the JFF reports) — they don't belong to one funder.
  Today they live in `inbox/` indefinitely. Should there be an
  `assigned-to-domain` dir (e.g. `corpus/_domain/workforce/`) that
  the triage proposer routes to?
- **Operator-curated DISCARD list**: should low-signal patterns be
  learned, hand-curated, or both? Recommendation: both — a small
  YAML in `clients/<client>/inbox-discard-rules.yaml` that the
  operator edits + a learned signal from the operator's accept/
  reject history.
- **What happens to discarded files?** Hard-delete, or move to a
  `corpus/_discarded/` zone for later audit? Recommendation: the
  latter, with a 30-day retention before hard-delete.
- **FLAG persistence**: a flagged file stays in the lens; should
  flags expire? Recommendation: yes — flag with a 14-day default,
  operator can renew. Otherwise flags accumulate as
  pseudo-discarded.
- **Multi-suggestion**: a file could legitimately belong to two
  funders' corpus (a joint Gates+Hewlett initiative announcement).
  Should the proposer surface both, and should the operator's
  apply make a copy in each? Current schema is single-destination;
  this would need a "copy-and-attribute-to-both" affordance.
- **Calibration cold-start**: with no operator history yet, what
  thresholds do we start with? Recommendation: conservative — the
  auto-routable band starts at 0.95 and lowers as the operator
  confirms suggestions cleanly.

## See also

- [[Best-Way-to-RAG-Over-the-Corpus]] — the sibling exploration.
  Phase 3 of this doc depends on Phase 1 of that one.
- [[../issues/Some-Records-Show-Empty-Corpus-Despite-Directories-on-Disk]] —
  the issue whose resolution tonight (the slug-join) is what makes
  the agent-proposed `proposed_funder_slug` worth acting on (the
  slug really is the join key).
- [[Agent-Chat-Skills-and-Commands-Candidates]] — the running
  roster of agent verbs; the new triage capabilities land here when
  they graduate to specs.
- [[Multi-Agent-Research-Fan-Out-Per-Row]] — the prior exploration
  on parallel research agents; the triage proposer is a similar
  fan-out shape, just inbox-side rather than per-row research-side.
- `services/content-ingest/src/corpus.ts` — `buildInboxFrontmatter`
  is where the `triage_suggestion:` block would be written; the
  existing `triaged_*` block is the post-apply destination.
- The `/inbox <url>` verb (changelog `2026-06-09_01`) — the entry
  point that this triage layer sits behind; capture-time proposer
  fires here in Phase 2.
