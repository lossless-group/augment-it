---
title: "Sparse-Person Enrichment Surface — per-email triage where the operator finds the human behind the address, picks or creates the org they belong to, and writes both back to the canonical layer"
lede: "The 177 Turning-Jobs-Into-Degrees attendees just landed in SurrealDB as 177 emails with almost nothing else — no names, no titles, no LinkedIn URLs, and (for the 63 with personal-email domains) no org signal either. The default augment-it flow assumes records are URL-bearing and scrape-targetable; this set is the opposite shape. What the operator needs is a per-row enrichment surface: pick a sparse person, search for who they are (web search → LinkedIn → SerpApi), match to an existing `persons` row or create a new one, then pick or create the `organizations` row they belong to (with multi-domain handling for orgs like Sterling Foundations that spell themselves three ways), and save the result as observations on both sides. This is a *sibling* to [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] — same chrome pattern, same shell integration, different verbs and a two-entity save target. Bulk fan-out stays *secondary* (per that spec's hard-won lesson) until manual enrichment has surfaced what works."
date_created: 2026-06-15
date_modified: 2026-07-21
date_first_published: 2026-06-16
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.3
revisions:
  - 2026-07-21 — v0.0.0.3: status sweep — promoted to Shipped. The surface shipped 2026-06-16 as apps/person-enrichment (:3015, registered in the shell) per changelog 2026-06-16_01_Person-Enrichment-Surface-Ships; many-per-person affiliations + org autocomplete followed 2026-06-17.
  - 2026-06-15 — v0.0.0.2: four open questions resolved per operator. Search becomes "open a new tab," not a connector. Worklist is always scoped to one event, not generic-sparse. Verb palette named: `create_org`, `add_profile` (smart single-field parser), `fill_out_query` (URL → extract). Fuzzy matching dropped — no cross-client overlap to chase.
  - 2026-06-15 — v0.0.0.1: initial draft.
status: Shipped
tags:
  - Spec
  - Augment-It
  - Per-Record-Iteration
  - Person-Enrichment
  - Org-Resolution
  - Sparse-Records
  - Canonical-Layer
  - Network-First
  - Operator-Built-Flows
---

# Sparse-Person Enrichment Surface

## Why this exists

[[Canonical-Entity-Registry-on-SurrealDB-Cloud]] just landed the canonical
data layer in SurrealDB. The first non-trivial dataset to flow through it
— the 177 Gatsby-event attendees from Turning Jobs into Degrees — has a
shape no existing augment-it surface handles cleanly:

- **Identifier-only rows.** Each attendee is an email address plus a
  rsvp_event + warning. No name, no headline, no LinkedIn URL,
  no website.
- **63 of 177 have personal-email domains** (gmail / yahoo / hotmail /
  me.com / aol / comcast / mac / proton / fastmail / outlook). For these,
  the email-domain → organization inference [[Canonical-Entity-Registry-on-SurrealDB-Cloud]]
  describes is a dead-end on its own. We need a human to look at the
  person.
- **The remaining 114 have org-domain emails**, but even there the org's
  *name* needs to be set ("atlasnetwork.org" → "Atlas Network"), and
  some emails are ambiguous-with-the-context (e.g.
  `mark.houser@sterling-foundations.com` versus
  `roger.silk@sterlingfoundations.com` versus
  `jimlintott@sterlingfoundations.com` versus
  `paul.beckner@sterlingfoundations.com` — three spellings, one firm).

The universal augment-it flow (fan out connectors against a URL-bearing
record) doesn't apply. The pack-fire surface
[[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] is the right
*shape* but for a different *verb set*. This spec describes the
per-email-row triage surface that fills the gap — and that, in the
[[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] sense, is the
second concrete instance of "flow shape that isn't the default fan-out."

## What it is

A per-row interactive surface where the operator works through sparse
`persons` rows one at a time. For each row:

1. **Scope** the work to one person (selected from a filtered worklist —
   "sparse persons matching <criteria>").
2. **Identify** — surface search verbs that help the operator decide who
   the human is behind the email. The verbs are connectors the operator
   already knows:
   - Web search (SerpApi) on the email and on common name guesses derived
     from the local-part.
   - LinkedIn search (the browser-snippet capture from
     `tools/browser-snippets/linkedin/` plus, eventually, an embedded
     LinkedIn link the operator clicks through).
   - Open the email's domain in a new tab.
   - Search the 882 existing canonical persons for a name match (in case
     the same human is already known from the LinkedIn-network capture).
3. **Match-or-create the person.** Three outcomes per row:
   - **Match** — operator confirms an existing `persons` row is the
     same human; the email + event observation get attached to that
     row. The sparse row created during ingest is merged in and
     dropped.
   - **Create** — operator types a name + (optionally) headline,
     LinkedIn URL; the sparse row gets enriched.
   - **Skip** — operator marks unresolved; row stays sparse.
4. **Match-or-create the organization.** Same three outcomes for orgs:
   - **Match** to an existing `organizations` row — if the email
     domain already lives in some org's `domains` array, the surface
     suggests that org pre-emptively.
   - **Create** — operator types a canonical name; the row's email
     domain gets stored on the new org with `kind: "primary"` per the
     domains schema agreed in
     [[Canonical-Entity-Registry-on-SurrealDB-Cloud]].
   - **Add domain to existing org** — operator picks an existing org
     and adds the new domain as `kind: "subunit"` or `"alias"`
     (covers the Sterling Foundations / sterling-foundations /
     sterlingfoundations spelling problem).
5. **Save.** Writes land as observations:
   - `has_email` (always, with the new info if it changed).
   - `affiliated_with` linking the person → org with qualifiers `{
     kind: "email-domain" | "operator-confirmed", confidence: 1.0,
     source: "sparse-enrichment-surface" }`.
   - `has_name` / `has_headline` / `has_linkedin_url` for any fields
     the operator filled.

Materialized fields on `persons` and `organizations` get refreshed in
the same write (per the [[feedback_redundancy_over_normalization]]
ethos — every "current" field is denormalized for triage speed).

## Where it lives

A new micro-frontend under `apps/` — call it `person-enrichment` for
now (rename later if a better word lands; per
[[feedback_context_v_evolves_in_prose]] we live with the working name
until use earns a better one).

It mounts in the same shell as Record Collector and Per-Record
Iteration, registers as a Flow type (per the
[[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] adaptive
Flow chrome), and uses the same step-number model with different
active members at each step:

- **Step 1: Pick the event.** The surface takes a single `events:<id>`
  as primary input. Worklist = all `persons` rows linked to that event
  via observations, whose canonical fields (name, headline,
  linkedin_profile_url) are still empty. No generic "sparse persons
  worklist" — staying centered on one event is the whole point.
- **Step 2: Per-row iteration.** The current row, with the verb
  palette below, and inline result panes for each verb.
- **Step 3: Save + advance.** Save commits the observations onto the
  person, the org, and the event-attendance edge. Advance goes to the
  next un-enriched attendee.

The Flow widget at the top of the shell shows progress against the
chosen event (`12 / 177 enriched on Turning-Jobs-Into-Degrees`) — same
Flow primitive [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]]
introduced.

Organizations created or updated during the work persist to the
canonical layer and remain available for *future* events. But the
operator's eye stays on the current event's attendees — moving to
"manage organizations" as a standalone surface is a different flow,
not this one.

## Composes with

- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — the data layer
  this surface writes to. Slug-as-join discipline applies on both
  `persons` and `organizations`. Observations table is the truth log.
- [[Client-Tagging-on-Canonical-Writes]] — every observation this
  surface creates carries the current workspace slug as `client`, and
  every canonical entity it touches gets the workspace added to its
  materialized `client_access` array. The worklist query at Step 1
  filters by `client_access CONTAINS $workspace_slug` so reach-edu
  never sees humain-vc's network and vice versa. The operator never
  has to think about this — it happens at write time and at read time
  automatically.
- [[Joined-People-UI-and-the-Network-First-Pivot]] — this surface IS
  the people-first sibling-pivot that exploration named. The org and
  person are jointly enriched because the org↔people join is a single
  primitive, not two flows.
- [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] — chrome
  pattern reuse: per-row scope, verbs as connectors, inline results,
  bulk-as-secondary. **Save Cost: zero new chrome primitives.** What's
  new is the verb set and the two-entity save target.
- [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] — this is
  the second concrete flow shape that proves the framing. First was
  pack-fires; second is sparse-person enrichment; the third will
  surface its own way.
- [[Workspaces-as-Tenant-Primitive]] — the worklist is scoped by
  client when the operator is in a per-client workspace, so reach-edu
  doesn't see humain-vc's sparse rows.

## Out of scope for v0.0.0.1

- **Bulk fan-out enrichment** (e.g. "enrich every sparse row with
  SerpApi automatically"). Stays secondary per
  [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]]'s lesson.
  We learn the verbs by hand first; if a deterministic pattern
  emerges, *then* we automate.
- **Agent-driven enrichment** (the chat resolves persons via tool
  calls). Real and useful, separate spec. The shell-side surface this
  spec describes should expose the same verbs as agent tools later,
  so the agent path doesn't reinvent the wheel.
- **Multi-person resolution from a single artifact** (e.g. "this PDF
  has 12 names; resolve them all"). Different shape; separate spec.
- **Confidence scoring / disagreement detection** across multiple
  observations of the same fact. The observation log already supports
  it (each observation has a `confidence`); the UI doesn't need to
  surface it in v0.

## Decisions

The four open questions an earlier draft listed have been resolved by
the operator. Recording them here so the next draft doesn't reopen
them.

### Search is "open a new tab," not a connector

No SerpApi, no Firecrawl, no on-page search-results pane. When the
operator wants to look someone up they use Google or DuckDuckGo
directly in another tab — that's already the workflow when they want
the right answer. The surface's job is just to **pre-fill a useful
query** for one click:

- One button → opens `https://www.google.com/search?q=<email> <local-part>`
  in a new tab. Operator reads the result themselves and decides what
  to paste back.
- Same idea for DuckDuckGo as a sibling button if useful.

Future: an agent path could take the operator's "I found them, here's
the LinkedIn URL" and parse it. That's a separate flow, see
[[Operator-Built-Flows-Beyond-The-Universal-Pipeline]].

### One event at a time — no generic worklist

The worklist is **always scoped to one event**. The surface's primary
input is `events:<id>`. There is no global "all sparse persons across
all events" mode. When the operator switches event focus, they re-pick
at Step 1. This keeps the eye on the deliverable (a fully-enriched
attendee list for *this* event) instead of drifting into a generic
person-enrichment treadmill.

Organizations created mid-event persist to the canonical layer and
become available the next time the same domain shows up, in any
client's worklist (canonical is cross-client by design). But the
operator's *attention* never leaves the event row they're working.

### Verb palette: three verbs, each does one thing well

The Step 2 verb palette is intentionally small and each verb has a
clear single-input form:

| Verb | Input | What it does |
|---|---|---|
| `create_org` | `complete_name` (formal, e.g. "Columbia Southern University"), `conventional_name` (shorthand, e.g. "Columbia Southern" — what people say in conversation), and an optional domain | Creates a new `organizations` row carrying *both* names together (paired, not primary-plus-optional). Slug derives from `complete_name`. Email's domain attaches as `kind: "primary"` (or `kind: "alias"` if the operator picks an existing org instead). Used when no existing org matches and the email-domain inference doesn't help (e.g. personal emails). Editing an existing org via this verb (or any sibling surface) always exposes both fields side-by-side. |
| `add_profile` | a single text field — paste a LinkedIn URL, an X handle, an `org-slug/page-path`, or any other identifier-bearing string | The verb parses what the operator pasted, decides which entity it belongs to (person vs org) and what kind of identifier it is, and adds the right field. **One field, smart parsing.** Examples: `linkedin.com/in/charlene-kuo` → person.linkedin_profile_url; `linkedin.com/company/atlas-network` → org.linkedin_url; `@bhorowitz` → person.x_handle. The list of recognized shapes grows when a new one shows up, not before. |
| `fill_out_query` | a URL whose page contains enough structured info to enrich the person or org | Fetches the URL, runs an extraction (LinkedIn DOM, Wikipedia infobox, ZoomInfo card, the org's own About page, etc.), surfaces extracted fields for the operator to accept or reject. Behind the scenes this *can* call Crawlbase / Jina / direct fetch — the verb is what the operator sees, the connector is implementation detail. |

`create_org` and `add_profile` are pure write verbs (no network call).
`fill_out_query` is the only verb that hits the network, and only when
the operator deliberately pastes a URL.

### No fuzzy matching, no cross-client overlap detection

The existing 882 `persons` rows in canonical came from the humain-vc
LinkedIn-network capture; the 177 attendees are reach-edu's event.
There is **no overlap** between the two sets — they're from
genuinely different worlds. So the "could this be the same human?"
fuzzy-matching cost is not worth paying.

When the same human DOES show up in two clients eventually (and they
will, especially among VC + LP attendees of education events), a
`same_as` observation predicate is the right shape to handle it. But
we wait until a real instance forces the design — no speculative
infrastructure.

`add_profile` and `create_org` therefore default to *create*, not
*match*. The only "search existing" affordance is the org picker
(which we need anyway for the multi-domain case — Sterling
Foundations etc.).

## What lands first

The smallest useful slice (call it v0.0.0.1 of this spec):

1. **Step 1 — Event picker.** Dropdown of `events` rows. Operator
   picks one (today: `2026-05-21-turning-jobs-into-degrees`). The
   worklist loads as the un-enriched attendees of that event.
2. **Step 2 — Per-row view.** Current attendee on the left
   (email, rsvp_event, warnings, source link to the gatsby URL,
   email domain), the three verbs on the right (each with its single
   input field), and a pre-filled "Search Google" / "Search DuckDuckGo"
   button pair. No automatic verb result panes — the operator
   *pastes back* whatever they find.
3. **Step 3 — Save** commits the observations:
   - `has_email` (refreshed if the operator edited it)
   - `has_name`, `has_headline`, `has_linkedin_url`, `has_x_handle`
     (whichever fields they filled via `add_profile`)
   - `affiliated_with` linking person → org (whatever org the
     operator confirmed or created via `create_org`)
   - The materialized `persons.organization` and
     `organizations.people` denormalized fields refresh in the same
     write.
4. **Step 4 — Advance.** Pick next un-enriched attendee of the same
   event. The Flow widget at the top of the shell shows
   `<N> / <total>` progress.

`create_org` and `add_profile` land in this slice. `fill_out_query`
lands in v0.0.0.2 if `add_profile` proves the URL-paste pattern
useful first.

No bulk mode. No agent integration. No fuzzy matching. The point of
the slice is to prove the surface against the 177 Turning-Jobs
attendees — and to let the verb palette grow under operator-led
demand rather than spec-led prediction.

## See also

- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — data layer
- [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] — chrome
  parent
- [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] — framing
- [[Joined-People-UI-and-the-Network-First-Pivot]] — pivot that
  produced the use case
- [[Workspaces-as-Tenant-Primitive]] — scope boundary
