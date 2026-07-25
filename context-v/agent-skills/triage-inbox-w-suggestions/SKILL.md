---
name: triage-inbox-w-suggestions
description: The operator+agent discipline for draining a client's corpus inbox (clients/<client>/corpus/inbox/, 162 pending in reach-edu as of 2026-07-25) — agent scans each pending file, stamps a triage_suggestion, and proposes destinations in confidence-banded batches; the operator sweeps. Use whenever the user says "triage the inbox", "work through the inbox", "drain the inbox", "/triage-inbox", or asks to file/sort pending inbox captures. Encodes the destination model (funder org folder, person, or domain — with SurrealDB as the single canonical index and cheap reference .md copies fanned into any additionally-relevant folder), the six task lanes (TRIAGE/EXTRACT/ENRICH/DEDUPE/FLAG/DISCARD), the tagging convention (YAML array, Train-Case with lowercase connector words), and the batch/resume rhythm. Co-pilot phase: agent proposes, operator disposes; nothing files without an operator sweep.
---

# Triage Inbox with Suggestions

The inbox (per [[../../specs/Corpus-Inbox-Capture-and-Triage|Corpus-Inbox-Capture-and-Triage]])
promised "capture first, triage later." Capture shipped 2026-06-09; *later* is
now — reach-edu's inbox sits at **162 pending files** and the flat list broke
down at 86 (see [[../../explorations/Inbox-Sort-by-Agent-Tasks|Inbox-Sort-by-Agent-Tasks]],
whose taxonomy and confidence bands this skill operationalizes). The goal of a
triage run: **every item leaves `inbox/` for a core folder** — an existing one,
or a new one we create deliberately. Strive for a full drain; a residue of
genuinely-uncertain items staying `pending` is acceptable, forcing them is not.

## Ground truth (verified against code + disk, 2026-07-25)

- **Inbox files** live at `clients/<client>/corpus/inbox/<date>_<slug>.md` —
  real corpus markdown with the `captured_*` / `triaged_*` / `inbox_status`
  frontmatter blocks. Many have `tags: []` and empty `captured_note`.
- **Inbox items have NO SurrealDB row.** `corpus.inbox.add` writes the file
  only. The single-index belief holds for *filed* content — `source.add`
  mints a `source_uuid` (+ per-corpus `source_usages` rows) for domain
  corpora; `organization.corpus.add` / `person.corpus.add` mint
  `content_items` rows for org/person corpora — but the canonical uuid for an
  inbox item is **minted at triage time, by filing through a capability**.
  Never handcraft uuids or DB rows; the capability path also carries the
  `client` tag every canonical write requires.
- **Disk taxonomy** under `clients/<client>/corpus/`:
  - `funders/<org-slug>/` — corpora for organizations flagged as funders.
    (Canonically these are `organizations` in SurrealDB; *funder* is a role
    modifier, and not every collection-worthy org is one — a non-funder org
    destination means deciding where non-funder org corpora live: see Open
    decisions.)
  - `strategies/<slug>/sources/` — domain corpora; the folder name comes from
    the domain type (`strategy`→`strategies`, `topic`→`topics`,
    `thesis`→`theses`, `category`→`categories`,
    `market-segment`→`market-segments`). reach-edu's domains are strategies.
  - `inbox/` — the queue this skill drains.
  - `_discarded/` — created on first discard; plain visible folder, never
    dot-prefixed, never hard-delete.
  - `AGENTS.md` at the corpus root — read it at session start; it is the
    corpus's own operating guidance.

## The destination model

Each pending item gets **one primary home** plus optional reference copies:

1. **Primary home** — a funder org folder, a person, or a domain
   (thesis/strategy/topic/…). Filing goes **through the capability wire** so
   the canonical index row exists first: `source.add` (domains, resolves
   `(domain_type, domain_slug)` against the live `domain.list` — never
   fabricate a slug, per the [[../inbox-curation/SKILL|inbox-curation]]
   decision tree), `organization.corpus.add` (org/funder),
   `person.corpus.add` (person).
2. **Reference copies** — once the canonical uuid exists, the markdown is
   cheap to replicate into *any other* folder where agents will later work,
   so deliverable-generation can stay inside one folder without hunting
   stragglers. Every reference copy MUST declare itself in frontmatter:

   ```yaml
   reference_of: "<canonical uuid (source_uuid or content_items id)>"
   canonical_path: "corpus/strategies/workforce-development/sources/2026-06-09_….md"
   reference_note: "replicated here because <one line>"
   ```

   The `reference_of` key is the loop-safety contract: anything scanning a
   folder dedupes by it, and coverage/count surfaces must learn to skip it
   (see Open decisions — double-count risk).
3. **Sweeping / hard-to-classify content** gets an *abstract* home, not a
   forced org: propose a `topic` (or `category`) domain via `domain.create`
   — always `chat_propose`-grade (creating a corpus is a visible,
   workspace-wide decision), never silent — and file there. Examples from
   the live inbox: cross-funder sector reports, Work-Trend-Index-style
   industry PDFs, regulatory documents.

## The suggestion pass (the scanning half)

For each `inbox_status: pending` file, read the cheap signals — `title`,
`exact_url` host, `published_at`, `captured_note`, first ~500 chars of body,
`binary_asset` presence — and match against three rosters loaded once per
run: the funder/org roster (slugs + known domains), the live `domain.list`,
and the harvested tag roster. Stamp the result into the file as the
`triage_suggestion:` block (schema per
[[../../explorations/Inbox-Sort-by-Agent-Tasks|Inbox-Sort-by-Agent-Tasks]] —
action, proposed destination, confidence 0–1, one-line rationale, signals
used). The block is a **proposal**; the operator's sweep decides.

Confidence bands govern the sweep affordance:

| Band | Confidence | Sweep shape |
|---|---|---|
| Auto-routable | ≥ 0.90 | Presented as a batch list; one operator yes files the whole batch |
| Suggested | 0.60–0.89 | Per-item confirm ("looks like X — yes / different / skip") |
| Uncertain | < 0.60 | Operator decides unaided; agent stays quiet |

Co-pilot phase rule: **no auto-apply, ever, without an operator sweep** —
even the ≥0.90 band files only after a batch yes. Downgrade this friction
only after calibration data exists (operator override rate per band).

## Task lanes

Every file maps to exactly one lane (taxonomy from the exploration):

- **TRIAGE** — destination is clear or suggestible. The main lane.
- **EXTRACT** — PDFs/binaries with empty bodies: run extraction before
  classification, or classify from title+URL alone with a confidence
  penalty and note `body_unextracted: true` in the suggestion.
- **ENRICH** — stub captures needing more context; agent may fetch linked
  pages, human picks.
- **DEDUPE** — `exact_url` (or binary sha256) already exists in
  `content_items` / `sources` or in a filed folder: propose merge-or-skip,
  never file a duplicate.
- **FLAG** — high-signal, operator wants it surfaced but not filed yet;
  stays pending with the flag noted.
- **DISCARD** — cookie walls, 404 bodies, consent boilerplate,
  `content_length_bytes` tiny: move to `corpus/_discarded/` (archive, no
  delete), `inbox_status: "discarded"`.

Drain order: auto-routable TRIAGE first, then suggested TRIAGE, EXTRACT,
DEDUPE, DISCARD, then the uncertain residue. Easy buckets first; the human's
attention goes to the hard tail.

## Mechanics of one filing

1. File through the capability → canonical uuid + client tag exist.
2. Place the markdown in the primary home; populate the `triaged_*` block
   (`triaged_by: "operator-confirmed:triage-inbox-w-suggestions"` when the
   operator confirmed an agent proposal — provenance matters) and flip
   `inbox_status: "triaged"`. Keep the `captured_*` block untouched forever.
3. Write any reference copies with their `reference_of` frontmatter.
4. Tags (see below) go on at filing time, not before.
5. Never clobber anything a human already filed — filing is additive;
   collisions become DEDUPE decisions.

> **Open mechanics fork (resolve in the first co-pilot run, then record the
> ruling here):** `source.add` fetches the URL fresh and writes its own file
> under `sources/` — but the inbox file already holds a fetched body (and
> sometimes a binary). Either (a) file via capability and treat the *inbox
> file* as the moved/reference artifact, or (b) let the capability write its
> file and demote the inbox original to a reference copy. Pick once, apply
> uniformly.

## Tagging convention

- YAML inline array of quoted strings: `tags: ["Workforce-Development", "State-of-the-Industry", "Future-of-Work"]`
- Casing is title-like with dashes: each substantive word capitalized,
  **connector/minor words lowercase** ("of", "the", "on", "an", "and"),
  acronyms uppercase (`"HNWI"`, `"AI-in-K-12"`). Not ALLCAPS; not
  every-word Train-Case.
- **Prefer an existing tag over minting a new one.** Harvest the roster at
  run start (grep `tags:` across the client's corpus + the domain sources'
  tags) and match against it; new tags need a reason a roster tag can't
  serve.

## Batch rhythm & resumability

- Work in batches of ~15–25 files; each batch = scan → stamp suggestions →
  operator sweep → file → log.
- Keep a run manifest at `clients/<client>/corpus/inbox/_triage-runs/<date>_<n>.md`
  (plain visible folder): one line per file — decision, destination, uuid,
  band, who decided. This is what makes a cleared-context session resumable
  and the calibration data for loosening the bands later.
- Idempotence: only `inbox_status: "pending"` files are in scope; a re-run
  after an interrupted session picks up exactly where the manifest stopped.

## Never

- Hard-delete anything (discard = archive to `_discarded/`).
- Fabricate a domain slug, org slug, or uuid — resolve against live rosters.
- File a canonical write without the `client` tag (the capability wire does
  this for you; another reason not to bypass it).
- Dot-prefix a folder meant for human review.
- Force the last uncertain items just to hit 100% — pending is an honest
  state.

## Open decisions (co-pilot phase resolves these; record rulings in place)

- [ ] The mechanics fork above (move-the-inbox-file vs capability-writes-
      fresh + inbox file becomes reference).
- [ ] **Non-funder organizations**: orgs worth collecting on that aren't
      funders — sibling folder (`corpus/organizations/<slug>/`?) or the
      funders folder with a DB flag distinction only?
- [ ] **Person-destined content**: `person.corpus.add` is DB-side; persons
      have no on-disk corpus folder today. Where does the markdown live?
- [ ] **Reference-copy double-counting**: coverage lenses and
      `corpus.list_for_record` walk the filesystem; teach them to skip
      `reference_of:` files before fanning references widely.
- [ ] When (if ever) the ≥0.90 band graduates from batch-confirm to
      auto-apply-with-undo.

## See also

- [[../../specs/Corpus-Inbox-Capture-and-Triage|Corpus-Inbox-Capture-and-Triage]] — capture spec; this skill is the triage layer it deferred.
- [[../../explorations/Inbox-Sort-by-Agent-Tasks|Inbox-Sort-by-Agent-Tasks]] — taxonomy, `triage_suggestion:` schema, confidence bands, phased plan.
- [[../inbox-curation/SKILL|inbox-curation]] — didi's live filing decision tree; this skill is its bulk/backlog sibling and shares its domain-resolution discipline.
- [[../../plans/Download-PDFs-into-Corpus-Inbox|Download-PDFs-into-Corpus-Inbox]] — why binaries sit beside markdown; feeds the EXTRACT lane.
- `clients/<client>/corpus/AGENTS.md` — the corpus's own standing guidance; read before every run.
