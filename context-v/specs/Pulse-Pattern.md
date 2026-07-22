---
title: "Pulse pattern — one operator burst against one entity, expressed as N independent pulse-dimensions composed in a pulse-surface, each dimension potentially owning its own microservice"
lede: "Building the first version of the person-enrichment remote surfaced a pattern hiding inside the existing per-record / per-flow vocabulary. Operators don't think in 'steps' when they're enriching one person — they think in *bursts*. One Google search reveals a name, a LinkedIn URL, an X handle, two alt emails, and which org the person works for. That's not five sequential UI steps; it's one operator-attention burst against one entity, and the UI should let the operator commit all of it in one save. The pattern: a `pulse` is the burst itself; a `pulse-dimension` is one independent editable concern within the burst (name, socials, emails, org); a `pulse-surface` is the parent that loads the entity, hosts its dimensions, collects them, and writes them as one observation batch. Dimensions can be nested (OrgPicker contains OrgCreate). Dimensions are reusable across pulse-surfaces (NameFields is the same in person-enrichment as it will be in org-enrichment). Each dimension can grow its own microservice when it earns one — matching the existing pack / surface pattern."
date_created: 2026-06-15
date_modified: 2026-07-21
date_first_published: 2026-06-16
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
status: Shipped
post_ship_note: "Shipped 2026-06-16 inside apps/person-enrichment (changelog 2026-06-16_01: 'Person-Enrichment-Surface-Ships-Pulse-Pattern'); the pulse-dimension components live in apps/person-enrichment/src/pulse-dimensions/ and gained many-per-person affiliations + org autocomplete 2026-06-17. Reuse on a second pulse-surface (org-workbench) is proposed in the Augment-From-DB exploration."
tags:
  - Spec
  - Augment-It
  - Pulse-Pattern
  - Pulse-Dimension
  - Pulse-Surface
  - Composable-UI
  - Operator-Built-Flows
  - Entity-Enrichment
---

# Pulse pattern

## Why this exists

The existing augment-it vocabulary has a few good nouns —
[[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] gave us per-row
chrome; [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] named the
operator-composes-flows ethic; [[Sparse-Person-Enrichment-Surface]]
specced the first non-fan-out flow shape. But building the first version of
that surface (`apps/person-enrichment/`) made something clearer than any
of those docs had: **when an operator searches one entity, they often
fill many things at once.**

One Google query against `paul.beckner@sterlingfoundations.com` returns:

- a LinkedIn URL → fills the person's `linkedin_profile_url`
- the person's name → fills `first_name` + `surname`
- the company name on the LinkedIn header → confirms/creates the org
- an alternate email pattern visible on About pages → adds to `emails[]`
- a domain mismatch in the URL → adds a domain alias on the org

That's not five UI steps. It's **one search burst, against one entity,
saved as one batch**. The pattern the surface needs is: load entity →
present N independent edit areas → collect → save → next entity.

We are calling that pattern a **pulse**.

## Three nouns

### `pulse-dimension`

A single independent edit concern. Operationally: one Svelte component
that owns one slice of state (zero or more fields), exposes that slice as
`$bindable` props, and represents one type of fact about the entity.

Current pulse-dimensions in `apps/person-enrichment/src/pulse-dimensions/`:

| Component | Fields |
|---|---|
| `NameFields.svelte` | `first_name`, `surname` (+ derived `full_name` preview) |
| `SocialsFields.svelte` | `linkedin_profile_url`, `x_handle` |
| `EmailListField.svelte` | `emails: string[]` (additional, beyond `email`) |
| `OrgPicker.svelte` | `selected_org_id` + nested `OrgCreate.svelte` (`complete_name`, `conventional_name`) |

A dimension is **independent** because:
- It owns its UI presentation.
- It owns its local validation.
- It owns its serialization shape (what gets written when its slice fires).
- It does NOT own navigation, save orchestration, or knowledge of sibling
  dimensions. Those belong to the surface.

A dimension is **reusable**. The same `NameFields.svelte` works in
person-enrichment today and will work in any future per-person pulse —
attendee-detail, contact-card-edit, advisor-edit, agent-suggested-edit.

A dimension can be **nested**. `OrgPicker` contains `OrgCreate` — the
nested one only appears when the picker's `selected_org_id === 'NEW'`.
Nesting is the natural way to handle "fill this field OR create the
referenced thing inline."

### `pulse-surface`

The parent that hosts a pulse against one entity. Responsibilities:

- Load the entity (and any reference data the dimensions need — e.g., the
  list of organizations for `OrgPicker`).
- Render the dimensions in some order, each bound to a slice of surface
  state.
- Provide search/discovery affordances around the entity (the "Search
  Google" / "Search DuckDuckGo" buttons live at the surface level, not on
  any one dimension).
- Collect the dirty state from all dimensions on save.
- Write the batch atomically (observations are independent rows, so
  "atomic" means "in one transaction" or "in one quick sequence with
  rollback on error" — the v0 surface does sequence-with-error-stop).
- Navigate to the next entity in the worklist.

The current surface is `apps/person-enrichment/src/App.svelte`. It's a
federation remote at port 3015 and follows the
[[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] chrome pattern
(per-row scope, verbs/buttons that act on the current row, navigation at
the bottom).

### `pulse`

The conceptual unit: **one operator-attention burst against one entity,
expressed as the simultaneous filling of N pulse-dimensions, committed
as one batch.**

Not a noun in code (no `Pulse` class, no `pulse_id` column). It's the
*name of what the operator is doing*, and it's what the surface is built
to support. When we say "the operator does one pulse per attendee," we
mean: they load one row, fill what they can across the dimensions,
save+advance.

## Composes with

- [[Sparse-Person-Enrichment-Surface]] — the first concrete
  pulse-surface. v0.0.0.1 lands the chrome + four dimensions described
  above. Future verbs (`add_profile`, `fill_out_query`) are new
  pulse-dimensions or extensions to existing ones.
- [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] — the
  shared per-row chrome. A pulse-surface IS a per-record-iteration
  surface where the per-record verbs are pulse-dimension components.
  Pack-runner's per-record-iteration surface is a *different* shape of
  per-record work (one verb fan-out instead of N independent edits)
  but the chrome is the same.
- [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] — the
  composition ethic. A pulse-surface is built by *composing*
  pulse-dimensions; the operator's working set of dimensions is what
  earns being a surface. Future surfaces (organization-enrichment,
  event-enrichment) compose the same dimensions in different orders
  with different additional dimensions.
- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — the data layer.
  Each dimension writes observations under specific predicates
  (`has_first_name`, `has_surname`, `has_full_name`,
  `has_linkedin_profile_url`, `has_x_handle`, `has_email`,
  `affiliated_with`). The predicate vocabulary belongs to the data
  layer; the dimension knows which predicate(s) its slice maps to.
- [[Client-Tagging-on-Canonical-Writes]] — every observation a
  dimension writes carries the current workspace's `client` slug. The
  surface plumbs it down via context or prop; dimensions don't know
  which client is active, they just consult the surface.

## Per-dimension microservice (when each one earns it)

Per the operator's call: **each pulse-dimension can grow its own
microservice when it justifies one**. The pattern follows the existing
pack/surface model.

Today's surface talks to SurrealDB directly because:
- v0 is a single-operator local-dev situation.
- All four current dimensions are pure-write — no fetch, no async
  enrichment.

The first dimension that likely earns its own service is
`fill_out_query` (per the enrichment spec): paste a URL, the service
fetches it, runs an extraction, returns structured fields the operator
can accept or reject. That URL fetch should not run from the browser
(CORS, secrets, rate limits). When it lands:

```
apps/person-enrichment/    ─ pulse-surface (frontend)
                                 │
                                 ▼ HTTP
services/fill-out-query/    ─ pulse-dimension service (backend)
                                 │
                                 ▼ Crawlbase / Jina / etc.
external sources
```

`apps/person-enrichment/src/pulse-dimensions/FillOutQuery.svelte`
becomes a thin frontend over `services/fill-out-query/` — same shape
as a pack remote (the surface) calling a pack-runner service (the
microservice) does today. Each pulse-dimension is a candidate for the
same split.

**Dimensions that may never earn a service:** purely synchronous
operator-typed text (NameFields, EmailListField, OrgCreate). They write
to the canonical layer; that's the only backend they need.

**Dimensions that probably will earn services:**
- `FillOutQuery` — URL fetch + extraction (Crawlbase, Jina, OpenGraph.io)
- `LinkedInLookup` — if/when we ship server-side LinkedIn fetching beyond
  the browser-snippet capture
- `DomainResolver` — if/when the email-domain → organization resolution
  grows complex enough that the matching algorithm + personal-email
  denylist + suffix-matching belong on the server

The decision is **per-dimension, when it earns it** — not pre-committed.

## Naming convention

| What | Convention |
|---|---|
| Pulse-dimension component | `src/pulse-dimensions/<DomainConcern>.svelte` (e.g. `NameFields.svelte`, `OrgPicker.svelte`). One-word verbs in the filename when they describe an action (`AddProfile.svelte`), noun phrases when they describe a data slice (`SocialsFields.svelte`). |
| Pulse-dimension service | `services/<dimension-slug>/` (e.g. `services/fill-out-query/`) — same naming as a pack service. |
| Pulse-surface | An app under `apps/<entity>-enrichment/` (today: `person-enrichment/`). Future: `apps/organization-enrichment/`, `apps/event-enrichment/`. |
| CSS scope | Dimension styles live in the shared `pd-*` namespace; surface styles live in `pe-*` (person-enrichment), `oe-*` (organization-enrichment), etc. When dimensions stabilize, the `pd-*` styles can move to `@augment-it/theme` or a new `@augment-it/pulse-dimensions` package. |

## What's not in scope for v0.0.0.1

- **A `@augment-it/pulse-dimensions` shared package.** v0 has the
  dimensions co-located with the first surface. When the second
  pulse-surface lands (probably `organization-enrichment`), the
  dimensions get hoisted to a workspace package — and the surface's
  `app.css` `pd-*` styles get hoisted with them.
- **Cross-surface dimension state preservation.** When the operator
  switches from person-enrichment to organization-enrichment mid-pulse,
  no dirty-state carries over. Each surface owns its own pulse lifecycle.
- **An agent path into pulses.** A future surface lets the chat suggest
  dimension-by-dimension edits the operator accepts or rejects. The
  dimension components already expose `$bindable` state, so the chat
  can drive them programmatically when that surface lands.

## See also

- [[Sparse-Person-Enrichment-Surface]] — the spec the first surface
  implements; the pulse pattern names what was implicit in that spec.
- [[Per-Record-Iteration-as-Primary-Surface-for-Pack-Fires]] — the
  chrome parent; a pulse-surface inherits its per-row-scope shape.
- [[Operator-Built-Flows-Beyond-The-Universal-Pipeline]] — the
  composition ethic; a pulse is one shape of operator-built flow.
- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — predicate
  vocabulary each dimension writes under.
- [[Client-Tagging-on-Canonical-Writes]] — every observation a
  dimension writes carries the workspace slug.
- [[Entity-Pulse-Bundle]] — pre-existing related concept; the "pulse"
  naming aligns deliberately, future work clarifies how the two
  compose.
