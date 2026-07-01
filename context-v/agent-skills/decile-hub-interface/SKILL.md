---
name: decile-hub-interface
description: The operator-facing workflow layer for getting real-world data INTO and OUT OF a client's Decile Hub CRM — sitting on top of the decile-hub-connector API contract. Use whenever importing a batch of real records into Decile (voice-note transcripts, CSV lead lists, LP rosters, event attendees), matching hand-collected records to existing Decile prospects by name, appending notes to people/prospects, or reasoning about the People-vs-Organizations-vs-Pipelines-vs-Prospects data model for a fundraising pipeline. Triggers when the user says "import these into Decile", "add these to the pipeline", "match these to Decile", "put these voice notes / this list into Decile", "attach a note to the prospect", "which pipeline do these belong to", or names the importer script decile-import-voicenotes.mjs. Encodes the read-only introspection recipe (whoami → pipelines?kind=investor → stages → prospect shape), the name-matching import pattern (Apple Voice Memos and most hand-collected records carry NO email, so the filename/typed-name is the identity key and Decile supplies the rest), where notes actually land (the Person/prospectable, NOT the pipeline row — so they surface across every pipeline that Person is in, tied to one pipeline only by the note's context label), the idempotent + additive + dry-run-first import discipline, the aliases.json spelling-bridge, and the .env gotchas that silently break the connector. The authoritative API contract is [[decile-hub-connector]] + the on-disk swagger; this skill is how a human operator drives it.
---

# Decile Hub Interface

The **operating patterns** for moving real-world data into and out of a client's Decile Hub
CRM. Where [[decile-hub-connector]] documents the *API* (auth, the three pagination patterns,
endpoint inventory, upsert semantics), **this** skill documents the *workflow* an operator +
agent run together: introspect the tenant, find the right pipeline, match hand-collected
records to existing prospects by name, and append notes — safely, idempotently, and with the
human in the driver's seat.

> **Two layers, one system.** If you need a field name, an endpoint, or a pagination envelope,
> read [[decile-hub-connector]] and the swagger at
> `clients/humain-vc/inputs/decilehub/202506_decilehub-docs_swagger.yaml`. If you need to know
> *how we actually push a pile of notes or leads in without making a mess*, you're in the right
> place.

## The data model, in the order you reason about it

Decile is three layers, not two. Getting this right answers the recurring "is this a person or
an organization?" question:

1. **People** — individuals. Natural key **email**.
2. **Organizations** — firms / funds / family offices. Natural key **name**.
3. **Pipelines → PipelineProspects → Notes** — the relationship layer *on top* of People & Orgs.
   - A **Pipeline** has a `kind`. **`kind=investor`** is the LP-fundraising type.
   - A **PipelineProspect** is a row in a pipeline pointing at *exactly one of* a Person **or**
     an Organization (`prospectable_type` / `prospectable_id`). For individual LP leads the
     prospect **is the Person**; their fund/family-office rides along as `person.organizations[]`,
     never as the prospect itself. You only make the *Organization* the prospect when the
     institution — not a named human — is the relationship.
   - The prospect carries the pipeline-scoped facts: **stage** (`{id, name}`), `rating`,
     `probability`, `capital_commitment`, `last_contact`, `next_contact`, `assigned_name`.
   - **Notes** are their own entity (`{id, body, context, created_at, author}`).

### Where a note actually lands (important, and counter-intuitive)

`POST /api/v1/pipeline_prospects/{id}/notes` does **not** attach the note to the pipeline row.
Per the spec, "the note is stored against the prospect's **prospectable** (Person / Organization)
when one exists, falling back to the prospect itself otherwise." Since LP prospects are
`prospectable_type: "Person"`, **the note attaches to the Person**.

Consequence: a note added via the Fund I prospect shows on that person's card in **every**
pipeline they belong to (e.g. the same LP who is also in a CogScAI-SPV pipeline). The note's
**`context`** field — which we set to the pipeline name — is the *only* thing tying it to one
pipeline. That's usually what you want (whole-relationship-at-a-glance). If you truly need
per-pipeline siloed notes, Decile's model doesn't do that — encode the pipeline into the note
`body` instead.

## Step 1 — read-only introspection (always run first, mutates nothing)

Never write blind. Ground every import in the live tenant:

```
GET /api/v1/whoami                       # token works? kind? accessible_pipeline_ids?
GET /api/v1/pipelines?kind=investor      # the investor pipelines + which is is_primary
GET /api/v1/pipelines/{id}               # the REAL stage names + ids (don't guess)
GET /api/v1/pipeline_prospects?pipeline_id={id}&page=0   # prospect shape; paginate (Pattern A)
```

A prospect row looks like:
`{ id, name, first_name, last_name, email, prospectable_type, prospectable_id, stage:{id,name},
rating, probability, capital_commitment, notes:[{body,…}], … }` — note that `notes[]` comes
back inline on the list response, so you can dedup against existing notes without an extra GET.

> A tenant can have several investor pipelines all flagged `is_primary: true` (humain-vc has
> three: a Fund I pipeline and two SPV pipelines). Don't assume one. Pick the pipeline whose
> **stages match the vocabulary in your source data** — e.g. voice notes that say "Declined" /
> "Future Interest" belong to the pipeline that actually has those stages.

## Step 2 — match hand-collected records to prospects BY NAME

Most real inputs (Apple Voice Memos, scraped lists, business cards) carry **no email**. So:

- **The typed name is the identity key.** The operator typed it deliberately — trust it, but
  it may not match Decile's spelling.
- **Decile supplies the rest.** Once you match by name you recover the email, stage, and
  prospect id from the prospect record.
- **Normalize before comparing:** NFKD → strip diacritics → lowercase → collapse non-alphanumerics
  to single spaces. (So `Coutiño` == `Coutino`, `HO Maycotte` == `ho maycotte`.)
- **Three match outcomes to report, not silently resolve:**
  - **exact** (unique normalized full-name hit) → queue it
  - **last-name-only** (unique surname, first name differs) → *suggest*, never auto-apply
  - **none / multiple** → report for the human to resolve
- **Spelling mismatches are the norm, not the exception.** In the 2026-06-11 humain-vc import,
  6 of 35 LPs were spelled differently in Decile (`Danby`→`Dabby`, `Shetty`→`Shetti`,
  `Schlecht`→`Schlect`, `Du Monceux`→`Dumonceaux`, …). Two resolution paths — pick per your
  correction's permanence:
  - **Fix the source spelling** (rename the file + fix the body) when the operator confirms the
    canonical name. Preferred — the source becomes correct.
  - **`aliases.json`** in the input dir (`{ "Typed Name": "Decile Name" }`) when you want to
    keep the source as-is. The importer redirects the *lookup* name but keeps the idempotency
    marker keyed to the source filename, so it stays safe to re-run.

## Step 3 — import with the reusable script

`scripts/decile-import-voicenotes.mjs` (in the augment-it parent repo) is the worked reference
implementation of this whole pattern:

```
node scripts/decile-import-voicenotes.mjs                 # DRY RUN (default) — mutates nothing
node scripts/decile-import-voicenotes.mjs --apply         # append the matched notes
node scripts/decile-import-voicenotes.mjs --pipeline "Fund I" --client humain-vc \
     --dir clients/humain-vc/inputs/<batch> --alias "Typed Name=Decile Name"
```

Design invariants worth copying into any new importer:

- **Dry-run by default.** `--apply` is the only thing that writes. The dry run *is* the match
  report the operator signs off on.
- **Idempotent.** Every note body is prefixed with a stable marker `[voice-note:<date>:<slug>]`;
  a prospect already carrying that marker is skipped. Re-running never duplicates.
- **Additive, never destructive.** It only *appends* notes. It never edits existing notes and —
  deliberately — **never moves stages**. Stage is report-only; stage changes are a human call.
- **Per-client env, resolved from `clients/<slug>/.env`** (falls back across the legacy alias
  var names). Token sent **raw** in `Authorization` (no `Bearer`).

## Operator discipline (why this skill exists)

Web/voice/scraped data isn't accurate enough to auto-trust, and CRM writes are semi-permanent:

- **Human-in-the-driver's-seat.** Show the match report; let the operator confirm spellings and
  approve the write. Don't auto-resolve ambiguous or missing matches.
- **Additive enrichment never overrides.** Notes accumulate; they don't clobber
  operator-curated fields or existing notes. Re-runs surface only what's new.
- **Preserve the raw before you clean.** If you rewrite transcripts (grammar cleanup), commit
  the raw first so the edit is a reviewable, recoverable diff.
- **Faithfulness over polish** when cleaning source text: fix grammar and obvious mis-hears,
  but never invent facts, names, numbers, or stage words.

## Gotchas that silently break things

- **`DECILE_API_URL` must be the tenant ROOT** (`https://<tenant>.decilehub.com`), not the docs
  page. humain-vc's `.env` was set to `.../docs/api` and every call 404'd. Routes live under
  `/api/v1/`.
- **Var names are `DECILE_API_URL` + `DECILE_HUB_API_KEY`** (what `services/decile-mcp/server.ts`
  reads). Older `.env`s used `DECILE_API_BASE_URL` / `DECILE_API_KEY`; if the code reads the new
  names and the `.env` only has the old ones, it silently gets empty strings.
- **Notes attach at the Person level** (see above) — don't promise a user that a note is scoped
  to one pipeline; it isn't.
- **`is_primary` is not unique** — several investor pipelines can all be primary. Match on stage
  vocabulary, not the flag.

## See also

- [[decile-hub-connector]] — the API contract this skill sits on (auth, pagination, endpoints,
  upsert semantics, SurrealDB mapping)
- `clients/humain-vc/inputs/decilehub/202506_decilehub-docs_swagger.yaml` — authoritative OpenAPI spec
- `scripts/decile-import-voicenotes.mjs` — the reference importer
- [[Workspaces-as-Tenant-Primitive]] — the per-client connector seam Decile plugs into
- [[Client-Tagging-on-Canonical-Writes]] — provenance when syncing Decile → SurrealDB
