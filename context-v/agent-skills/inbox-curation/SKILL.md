---
name: inbox-curation
description: didi's triage discipline for filing captured links and sources into the right corpus (thesis/strategy/topic) inside augment-it. Use whenever the user gives didi a URL to save, asks to "file this under <corpus name>", names an existing thesis/strategy by name for a link to go under, or it's unclear which corpus a captured link belongs to. Encodes the decision tree (named + existing corpus → source.add directly; new corpus → propose domain.create first; unclear → propose or park in the inbox), the domain-resolution discipline (resolve names against the live "Existing corpora" list, never fabricate a domain_type/domain_slug), and the boundary with corpus.inbox.add (the untriaged capture-first fallback). The capability catalog and args shapes live in services/workspace/src/chat.ts's CURATOR_CHAT_VERBS slab — this skill is the reasoning on top of it.
---

# Inbox curation

didi's job, Flow 1: **a person captures a link while researching, and didi files
it under the right corpus without becoming a second click for the operator to
make.** "Corpus" here is augment-it's `domains` table — a typed grouping
(`thesis`, `strategy`, `topic`, …) each workspace names for itself; `humain-vc`
calls them theses, `reach-edu` calls them strategies. Same mechanism, different
noun.

## The data model, in the order you reason about it

1. **A corpus is a `(type, slug)` pair** — e.g. `thesis:consumer-immunology`.
   Titles are for humans; `type` + `slug` is what every capability actually
   takes as an argument.
2. **A source is a URL filed under one or more corpora**, identified by
   `source_uuid` once it's been added. `source.add` does the filing (DB
   registry row + Jina metadata fetch + on-disk file, per
   [[../../specs/Strategy-Curator-Entry-Point-for-Augment-It|Strategy-Curator-Entry-Point-for-Augment-It]]).
3. **The inbox (`corpus.inbox.add`) is NOT a corpus.** It's a flat,
   untriaged holding pen — a markdown file with frontmatter, no `domain_type`/
   `domain_slug` at all. It exists for exactly the case this skill's decision
   tree below routes to it: a link with no clear corpus home yet.

## The decision tree (this is the whole skill)

Every turn where the user hands didi a URL, ask two questions in order:

**1. Did the user name an existing corpus?**

Check the name (or slug) they typed against the **"Existing corpora"**
context slab (a live `domain.list` read, injected into every chat turn as
`Title → type:slug`). Match on title OR slug, case- and
punctuation-insensitive — "consumer-immunology", "the immunology thesis", and
"Consumer Immunology" should all resolve to the same `thesis:consumer-immunology`
row if it's in the list.

- **Match found** → `chat_invoke source.add` directly, with the resolved
  `domain_type`/`domain_slug`. Do not propose first — the named corpus is
  unambiguous, and re-confirming a decision the user already made is the
  friction this flow exists to remove. This is the acceptance case: *"didi,
  file this link under consumer-immunology"* ends with a real source row in
  `thesis:consumer-immunology`, attributed to the signed-in user (rides
  automatically via the `via: 'didi-agent'` actor tag — no extra work needed
  here).
- **No match, but the user clearly means a NEW corpus** (e.g. "start a new
  thesis on X and put this under it") → `chat_propose domain.create` first.
  Creating a corpus is a bigger, more visible decision than adding one more
  source to an existing one — it changes what the curator's sidebar shows
  for everyone on the workspace. Never `chat_invoke` it silently.

**2. Named nothing, or named something that doesn't match?**

→ `chat_propose`, offering the most plausible existing corpus (if the link's
subject matter clearly matches one title) **and** `corpus.inbox.add` as the
park-it-for-later option, side by side. Let the operator pick. **Never
silently guess a corpus and file into it** — a wrong guess is worse than
asking, because it makes the source invisible in the corpus the operator
actually meant.

## Never fabricate identifiers

`domain_slug` must come from the live "Existing corpora" list (for filing
into an existing one) or from a slug didi itself proposes for a NEW domain
via `domain.create` (never invent one to hand to `source.add` directly —
`source.add` requires the domain to already exist; `domain.create` is what
makes it exist). Similarly, `extract.add` and `tag.apply` need a real
`source_uuid` — if the conversation hasn't surfaced one (e.g. the user says
"add a quote to that last source" and didi doesn't have its uuid in context),
ask rather than guess. A wrong write here isn't reversible-by-refresh the way
a UI mis-click is; the discipline matters more here than in the curator's own
click-driven surface.

## Boundary with `corpus.inbox.add`

Do not treat the inbox as a lesser `source.add`. It has no `domain_type`,
skips the Jina metadata fetch's role in a corpus's index, and its content
lives in a different filesystem location
(`clients/<client_id>/corpus/inbox/`, not
`clients/<client_id>/corpus/<type-plural>/<slug>/sources/`). A link parked in
the inbox needs a **second, separate** triage pass later — either a human
walking `corpus/inbox/` and manually filing things, or a future didi capability
that doesn't exist yet. Don't imply to the user that inboxing is equivalent to
filing; say "parked in your inbox for later" or similar, not "saved."

## Worked examples

- *"didi, file this under consumer-immunology: https://example.com/paper"*
  → "consumer-immunology" matches `thesis:consumer-immunology` in Existing
  corpora → `chat_invoke source.add` with `{ url, domain_type: "thesis",
  domain_slug: "consumer-immunology", client_slug: <active> }`.
- *"save this for later, not sure where it goes: https://example.com/news"*
  → no corpus named → `chat_propose` with one plausible existing-corpus
  guess (only if the URL's subject clearly matches a title) plus
  `corpus.inbox.add`.
- *"start a new thesis on gut-brain axis research and put this in it"*
  → no match, but a new corpus is explicitly requested → `chat_propose
  domain.create` with a slugified title, then (after acceptance) `source.add`
  as the natural follow-up turn.
- *"add a note to that immunology source saying it's peer-reviewed"* →
  `extract.add` needs `source_uuid`; if it's not already in the visible
  transcript/context, ask which source before calling anything.

## See also

- `services/workspace/src/chat.ts` — `CURATOR_CHAT_VERBS`, the capability
  catalog and args shapes this skill reasons on top of; `existingCorporaSlab`,
  the live `domain.list` read this skill's decision tree depends on.
- [[../../specs/Strategy-Curator-Entry-Point-for-Augment-It|Strategy-Curator-Entry-Point-for-Augment-It]]
  — the click-driven UI this skill is the conversational equivalent of.
- [[../../../context-v/plans/Unlock-Humain-VC-Team-Access-To-Augment-It|Unlock-Humain-VC-Team-Access-To-Augment-It]]
  (ai-labs level) — Flow 1 item 5, "DiDi assists," the flow this skill serves.
- `decile-hub-interface` (sibling agent-skill) — the format precedent this
  doc follows.
