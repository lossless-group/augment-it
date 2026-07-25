---
name: triage-inbox-w-suggestions
description: The operator+agent discipline for draining a client's corpus inbox (clients/<client>/corpus/inbox/, 162 pending in reach-edu as of 2026-07-25) — agent scans each pending file, stamps a triage_suggestion, and proposes destinations in confidence-banded batches; the operator sweeps. Use whenever the user says "triage the inbox", "work through the inbox", "drain the inbox", "/triage-inbox", or asks to file/sort pending inbox captures. Encodes the destination model (funder org folder, person, or domain — with SurrealDB as the single canonical index and cheap reference .md copies fanned into any additionally-relevant folder), the six task lanes (TRIAGE/EXTRACT/ENRICH/DEDUPE/FLAG/DISCARD), the tagging convention (YAML array, Train-Case with lowercase connector words), and the batch/resume rhythm. Co-pilot phase: agent proposes, operator disposes; nothing files without an operator sweep.
---

# Triage Inbox with Suggestions

## Why (operator framing, 2026-07-25)

Triage is not just filing content — it is **indexing all the actors and
players in the space, peeling the onion toward a MECE knowledge graph**
(mutually exclusive, collectively exhaustive: every real entity gets exactly
one canonical home, and the buckets jointly cover the space). Consequences
for triage judgment:

- **The actor matters even when the page is thin.** A 2KB homepage is weak
  *content*, but if it names a real player (TradesFutures, a state agency,
  an employer network), mint the org row and file it — the entity is the
  point, the page is just its first evidence.
- **Bucket questions are taxonomy questions.** When a capture fits no
  bucket (an operating provider, a nested initiative), that's a signal the
  MECE partition is incomplete — surface it as a decision, don't force-fit.
- **Relations complete the graph.** Pointer files, streams, and (pending)
  parent/child edges are how one fact serves multiple entities without
  breaking mutual exclusivity of the canonical home.

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
  - `gov-entities/<slug>/` — organizations clearly initiated by government,
    or government itself (state workforce offices, federal programs, …).
    Ruled 2026-07-25; same org-row + corpus-add wire as funders.
  - `think-tanks/<slug>/` — think tanks and research institutions (Brookings,
    Urban Institute, New America, …). Ruled 2026-07-25 in the same run. The
    non-funder-org question is resolving into role-named sibling buckets
    (funders / gov-entities / think-tanks) rather than one generic
    `organizations/` folder; DB org rows stay undifferentiated, disk
    placement carries the role.
  - `associations-networks/<slug>/` — membership associations AND networks
    (renamed from `associations/` 2026-07-25 when WEF was identified as a
    network — the bucket covers both) (BHEF,
    NAWDP, …). Ruled 2026-07-25 later in the same run; fourth role-named
    bucket. The org-attributable routing rule below applies to these too
    (BHEF's ED559688 report: canonical in `associations/bhef/`, pointer in
    workforce-development).
  - `academic-institutions/<slug>/` — university research centers and
    academic units (Project on Workforce at Harvard, …). Ruled 2026-07-25,
    fifth role bucket; same org-row-first + routing rules. These are also
    inherently NESTED (Project on Workforce ⊂ HKS ⊂ Harvard) — every filing
    here feeds the parent/child issue.
  - `data-services/<slug>/` — nonprofit data utilities (Credential Engine,
    …). Ruled 2026-07-25, sixth role bucket. Distinct from the
    grant-prospecting-tools TOPIC: the topic holds tool homepages as
    content; this bucket holds data-infrastructure orgs as actors.
    **Routing rule (ruled 2026-07-25):** think-tank reports/articles are often
    topical too — when content is attributable to a single think tank, the
    canonical file goes in the think tank's folder, and **pointer markdown
    files** (`reference_of:` frontmatter) fan into every relevant domain's
    `sources/` folder (`topics/<slug>/sources/`,
    `strategies/<slug>/sources/`). Pointers are disk-only — no `source.add`
    row is minted for them (that would double-register the content); the
    double-count caution in Open decisions applies.
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
4. **Identity-link hosts** (ruled 2026-07-25): Cause IQ, Charity Navigator,
   GrantForward, Grant Bay — Crunchbase-like profile databases (roster also
   effectively includes projects.propublica.org, instrumentl.com,
   fconline.foundationcenter.org, grantable.co-style prospect pages seen in
   funder folders). Routing: a *profile page* on one of these is a profile
   OF an org → file it to the org it's about (these should eventually be
   smartly handled by the UI as org identity links); the tool's own
   homepage / content marketing → a topic (first instance:
   `topics/grant-prospecting-tools/`, created this run).

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
- **STREAM** *(ruling, first co-pilot run 2026-07-25)* — a capture that is a
  *rolling index page* on a tracked org's site (a topic hub, blog index,
  issues page — Brookings' /topics/artificial-intelligence/, New America's
  /issues/education-and-work/) is not corpus content and not a discard: it's
  a **pulse stream**. Propose `organization.streams.add {org_slug, url,
  kind, name, client}` on the org, then archive the capture file to
  `_discarded/` with a superseded-by-stream note. The stream keeps pulsing;
  a one-time capture of it is worthless. Known `kind` vocabulary (grows by
  operator precedent):
  - `topic_stream` — a topic/issues hub (Brookings AI, New America
    Education & Work)
  - `blog_index` — an org's blog/news index (BHEF Blog)
  - `initiative_hub` — the hub page of a named org *initiative* — a program
    with its own rolling identity inside the org (AEI's Workforce Futures
    Initiative on `american-enterprise-institute`, added 2026-07-25). Also
    the lightweight answer for initiative-shaped pages while the
    parent-child org model is unresolved: a hub can be a stream on the
    parent org without minting a child org.
- **GATED** *(ruling, first co-pilot run 2026-07-25)* — fetch-blocked
  captures (403 "Access Denied", CAPTCHA/"Just a moment" walls, paywall
  stubs) are NOT discards: the URL is still wanted, only the fetch failed.
  Move to `inbox/gated/` (plain visible folder), `inbox_status: "gated"`.
  They stay parked for a later re-fetch attempt via a different fetcher;
  a gated item whose URL later lands successfully becomes purgeable.
- **DISCARD** — genuinely worthless captures: 404 bodies, consent
  boilerplate, empty nav/index pages, `content_length_bytes` tiny with
  nothing behind it. Move to `corpus/_discarded/` (archive, no delete),
  `inbox_status: "discarded"`. Fetch-blocked pages go to GATED, not here.

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

> **Mechanics fork RESOLVED (first co-pilot run, 2026-07-25): the inbox file
> is canonical — option (a).** Call the capability first so the uuid + client
> tag exist (`source.add` writes a metadata-only stub and returns
> `source_uuid` + `corpus_path`), then **merge**: graft the stub's registry
> keys (`source_uuid`, `url`, `normalized_url`, bib fields, `domains`) into
> the inbox file's frontmatter, set `status: "fetched"` /
> `content_pulled: true`, append the `# Extracts` skeleton, write the result
> over the stub at `corpus_path`, delete the inbox original. PDF siblings
> move too, **renamed to the destination basename** (and update
> `binary_asset.filename`) — a binary is never left behind in the inbox.
> ⚠️ Registry gotcha: the DB `sources`/`source_usages` rows still say
> `metadata-only` after this — never run `source.fetch` on a merged source
> (it would refetch and clobber the canonical body). Open follow-up: a
> registry-status patch or a source.add variant accepting a provided body.
>
> **Funder/org filings (same run): SurrealDB is the source of truth.** A new
> org folder REQUIRES an org row first — **but search before minting**:
> `resolver.search {q, client}` / `organization.detail` first, because the
> operator may have created the org in the UI in parallel (a duplicate
> `bhef` row got minted this way and had to be consolidated). Then
> `resolver.apply {action: "create", record: {name, slug_hint, url}, client}`
> (stamps `client_access`), then `organization.corpus.add {org_slug, url,
> client}` mints the `content_items` entry, then move the inbox file into
> the org's folder (keep its inbox basename), stamping `content_uuid` +
> `org_uuid` and swapping `funder_slug: "inbox"` → the real slug (or null
> for non-funder buckets, with `org_slug` carrying the identity). Legacy
> funder folders may be rowless (jff was) — mint the row on first filing.
>
> **Slug naming (ruled 2026-07-25): long-form full-name slugs** —
> `business-higher-education-forum`, not `bhef`;
> `national-association-of-workforce-development-professionals`, not
> `nawdp`. The acronym/short form goes in `aliases` and `conventional_name`
> (settable via `resolver.update_org`, which also does slug renames —
> though conventional_name has no edit affordance in the app yet). Disk
> folder always matches the DB slug. Legacy short slugs (`jff`) rename
> lazily, folder + row together.
>
> **The org naming model (ratified on stanford-pacs, 2026-07-25).** Typed
> name fields answer *rendering* ("what do I print here"); `aliases[]`
> answers *resolution* ("what strings should find this entity"), like
> Obsidian frontmatter aliases:
> - `slug` — derived, never authored: long-form kebab of the conventional
>   name; identity key; matches the disk folder.
> - `conventional_name` — what humans call it ("Stanford PACS", "TWC",
>   "CRS"); prose and chips.
> - `complete_name` — the full formal name ("Stanford Center on
>   Philanthropy and Civil Society"); documents and disambiguation.
> - (`legal_name` — only if it ever diverges AND a surface needs it;
>   until then it's just an alias.)
> - `aliases[]` — greedy, additive, untyped: acronyms, smushed forms,
>   hyphen variants, former names, misspellings — every form seen in the
>   wild. Costs nothing; the resolver matches on it; slug renames
>   auto-preserve the old slug here.
> When any create flow (UI or agent) mints an org from one string, enrich
> immediately with `resolver.update_org` — one string can't fill a
> three-field model.

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

- [x] ~~The mechanics fork~~ — RESOLVED: inbox file is canonical; see the
      ruling block in "Mechanics of one filing".
- [x] ~~Discard vs fetch-blocked~~ — RESOLVED: GATED lane added; blocked
      fetches park in `inbox/gated/`, discards are for genuinely worthless
      content only.
- [x] **Government entities** (ruled 2026-07-25): entities clearly initiated
      by government, or government itself, get `corpus/gov-entities/<slug>/`
      — clients (reach-edu certainly) want to track all kinds of
      government-related entities. Same filing wire as funders (org row via
      `resolver.apply action:create`, then `organization.corpus.add`, then
      move the file); disk placement carries the gov distinction, DB-side
      flagging is a follow-up. First filing: accelerate-ms.
- [ ] **Non-funder, non-government organizations**: orgs worth collecting on
      that are neither funders nor gov-initiated (membership forums like
      BHEF, professional associations like NAWDP, employer networks like
      Human Potential Network) — sibling folder
      (`corpus/organizations/<slug>/`?) or something else? Still open;
      captures accumulate pending in the inbox.
- [ ] **Parent-child organizations** (raised in batch 1, 2026-07-25):
      urban-institute is the parent org; upmobility-foundation is an
      initiative of it. Operator ruling: do NOT file content into either
      until the relationship is modeled. Full write-up + candidate shape:
      [[../../issues/Parent-Child-Nested-Organizations-Not-Modeled|Parent-Child-Nested-Organizations-Not-Modeled]].
      Affected captures stay pending in the inbox.
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
