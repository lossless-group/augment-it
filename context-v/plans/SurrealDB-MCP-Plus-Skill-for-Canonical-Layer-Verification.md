---
title: "SurrealDB MCP + a verification skill — querying augment-it's canonical layer directly, starting with FreedomFest 2026"
date_created: 2026-07-07
date_modified: 2026-07-07
status: Shipped
tags:
  - Plan
  - MCP
  - Agent-Skills
  - SurrealDB
  - Augment-It
  - Canonical-Layer
  - FreedomFest
site_uuid: f3630861-b70d-412e-b9cf-22fa1afd5a46
hex_code: bjkhj7
date_authored_initial_draft: 2026-07-07
date_authored_current_draft: 2026-07-07
---

## Why this exists

Tonight's work on `apps/person-db-resolver` created real `persons` +
`organizations` + `affiliations` + `observations` rows in reach-edu's
SurrealDB Cloud instance — a handful of FreedomFest 2026 speakers and
orgs (Ethan Akimoto / Carl Menger Institute, Lyn Ulbricht, Rudolfo
Beltran, Kevin Brady, Lt Gov Stavros Anthony / State of Nevada, a
President-of-Basin-Ventures record, and others), created by hand while
testing the new UI. Every check on this data so far has been an ad-hoc
Node script (`connect → signin → use → query`, written fresh each time,
deleted after) — the same pattern used earlier tonight to clean up a
mis-created `ethan-akimoto` organization row. That's fine for a one-off
cleanup; it's the wrong tool for "verify tonight's batch is linked up
correctly," which is a recurring need every time a new event or client
gets processed through the resolver apps.

The fix is the same shape already proven for the Chroma corpus in this
tree ([[../skills/search-lossless-corpus/SKILL.md]]): an **MCP server**
for the raw query access, plus a **Skill** that carries the schema
knowledge and the verification discipline, so a future session doesn't
have to re-derive "what does an affiliation edge look like" from reading
`resolver.ts` again.

## Component 1 — SurrealMCP, project-scoped — SHIPPED

[SurrealDB ships an official MCP server](https://github.com/surrealdb/surrealmcp)
(`surrealmcp`) that talks to both self-hosted SurrealDB and SurrealDB
Cloud — exactly augment-it's setup — over stdio/HTTP with bearer-token
auth. This is the right default over a community alternative
(`lfnovo/surreal-mcp`, `nsxdavid/surrealdb-mcp-server` also exist) since
it's maintained by SurrealDB itself and Cloud auth is a first-class case,
not a workaround.

**Resolved 2026-07-07:** `surrealmcp` is a Rust binary with exactly two
distribution paths — build from source (`cargo install --path .`) or the
`surrealdb/surrealmcp:latest` Docker image; no npm/PyPI package, so no
`uvx`/`npx`-style one-liner like the `chroma` MCP server gets. Went with
**Docker** — zero submodule, zero build step, and Docker's already part of
this stack (`Dockerfile`, `docker-compose.yml`). A "submodule in an
`mcps/` folder, symlinked" structure (mirroring the skills-symlink
convention) was considered and rejected: MCP servers are discovered
exclusively through `.mcp.json`'s `command`/`args`, never by scanning a
folder, so a symlink step there would be pure overhead with no functional
effect.

Shipped:

- `scripts/mcp-surrealdb.sh` — sources `.env` relative to its own
  location (not `$PWD`, not the launching shell's environment) and execs
  the Docker container. This matters because Claude Code's `${VAR}`
  expansion in `.mcp.json` only reads variables already exported in the
  shell that launched `claude` — it does not read `.env` files — and this
  repo's habit is sourcing `.env` per-command, not exporting at shell
  startup.
- `.mcp.json` (project scope, per [[feedback_mcp_project_scope]]):
  ```json
  {
    "mcpServers": {
      "surrealdb": {
        "command": "${CLAUDE_PROJECT_DIR:-.}/scripts/mcp-surrealdb.sh"
      }
    }
  }
  ```
- Verified via `claude mcp list` → `surrealdb: ... ✔ Connected`.

**Open question — read-only vs. read-write. Still not resolved.** The
Docker container runs with the same full read-write credentials the app's
services already use, and surrealmcp additionally exposes **Cloud
instance management** (create/pause/resume a SurrealDB Cloud instance) —
capability none of augment-it's own services need. This is more blast
radius than a verification connector strictly requires. Flagged in the
`surrealdb-canonical-layer` skill as a standing caution (never issue a
write/Cloud-management tool call from a verification pass without an
explicit ask) rather than solved — provisioning a scoped read-only
SurrealDB Cloud role is worth doing before this becomes routine
infrastructure rather than an occasional tool.

## Component 2 — a verification skill — SHIPPED

Authored at `context-v/skills/surrealdb-canonical-layer/SKILL.md` in the
lossless-skills repo (per
[[feedback_skill_authoring_in_lossless_skills]] — never inside augment-it
directly), then symlinked via `sync-skills-symlinks.sh`.

**Scope decision:** generalized past augment-it, not augment-it-only.
Written with augment-it's live schema as the worked example (source of
truth: the code, cited explicitly as a snapshot that can drift) plus an
explicit "adapting this skill to a new project" section, since
`dididecks-ai` and `memopop-ai` are named as likely future SurrealDB
adopters of the same schemaless-canonical-layer + observations-as-log
pattern.

**What it carries** (matches what was scoped here originally):

- The schema shape: `persons`, `organizations`, `affiliations` (a real
  `RELATE` edge, `in`/`out`/`kind`/`client_access`/`added_at`),
  `observations` (`subject`/`predicate`/`object`/`source`/`observed_at`/
  `client` — schemaless, predicates grow freely: `has_name`,
  `has_email`, `has_linkedin_url`, `affiliated_with`, `located_in`, and
  the event-tie family `speaker_at`/`sponsor_of`/`exhibitor_at`/
  `attended`), `events` (`slug`/`name`/`client`/`client_access`/`source`).
- **The verification pattern**, generalized past tonight's specific
  case: given a batch, confirm (a) rows exist with the right fields, (b)
  client tagging is correct **checked explicitly, not inferred from a
  filtered query**, (c) relationships exist where the write path is
  supposed to create them. Flag, don't silently fix — a gap can be a
  correct outcome (skip is first-class; an org resolved independently of
  any person is first-class).
- Query recipes for the common shapes, including the
  `observed_at`-must-be-in-projection SurrealDB 2.x gotcha hit while
  building tonight's diagnostic.
- **Client tagging as its own explicit check** — the per-table shape
  documented precisely: `persons`/`organizations`/`events`/`affiliations`
  use `client_access: string[]`; `observations` uses `client: string`
  (singular — a real inconsistency, not a typo); `events` carries both.

## Tonight's actual verification task — RUN, findings below

Ran directly against SurrealDB Cloud (a disposable diagnostic script,
before the MCP+skill were wired — the MCP server came online mid-session
after this ran). Scope: everything touched by the People-CSV flow in the
last 3 days, cross-checked against
`clients/reach-edu/inputs/events/freedomfest/2026-07-08_freedomfest-2026-speakers.csv`.

**1. Client tagging — clean.** All 65 `persons` rows and all 40
`organizations` rows created in the batch carry `client_access:
["reach-edu"]` correctly. Zero tagging gaps found, including on the
re-check that didn't filter by client first (the check the plan called
out as the one a naive filtered query would miss).

**2. Person↔org affiliation — mostly missing.** Only **1 of 65 persons**
(Ethan Akimoto, the original hand-test) has an `affiliations` edge. The
other 64 — all created via the batch run — have `has_name` +
`speaker_at` observations but no affiliation edge, even though 39
additional organizations were independently created/matched during the
same run, correctly tagged, just never `RELATE`d to their person. This is
exactly the gap the prior changelog entry (person-db-resolver's ship
entry) flagged as an open question: nothing retroactively relates a
person to an org resolved on the same row unless both steps happen in one
pass with the person resolved first.

**3. Duplicate person rows — a new finding, not previously flagged.**
"Ethan Akimoto" and "Rudolfo Beltran" each have two separate `persons`
rows (one from early hand-testing, one from the batch run); "Lt Gov
Stavros Anthony" and "Stavros Anthony" look like the same person split
across two rows by title-stripping. Candidate matching should have caught
these on the second pass — worth investigating whether the fuzzy-match
threshold or the create-without-reviewing-candidates path is the cause.

**Coverage:** 65 of 200 CSV speakers resolved so far (the batch run
stopped partway through, around "Jonathan Riches").

## Open questions

- ~~Exact skill name~~ — resolved: `surrealdb-canonical-layer`, written
  generally per the scope decision above.
- Read-only MCP role (see Component 1) — still open, resolve before this
  becomes a routine tool, not just an occasional one.
- Whether the skill should also carry write patterns — resolved: no,
  stays read/verify only, so the UI's match/create/skip discipline (and
  its idempotency guarantees) isn't bypassed by a raw `CREATE`/`RELATE`
  run through MCP.
- New from tonight's findings: does the People-CSV flow's next iteration
  need a "resolve org, then retroactively RELATE any already-resolved
  person on the same row" step, or should the operator workflow just be
  documented as "resolve person before org, always"? Deferred — the user
  is not fixing the UI right now, may iterate after more diagnostics.
- New from tonight's findings: the duplicate-person gap (Ethan Akimoto,
  Rudolfo Beltran, Stavros Anthony) — worth a look whenever UI iteration
  resumes.

## See also

- `augment-it/context-v/plans/Person-Aware-Canonical-Resolver-Extension.md`
  — the schema and the person/org/affiliation/observation write path this
  skill reads, doesn't reinvent.
- `context-v/skills/search-lossless-corpus/SKILL.md` — the Chroma
  precedent this plan's shape (MCP for access, Skill for discipline) is
  copied from.
- `context-v/skills/surrealdb-canonical-layer/SKILL.md` — the shipped skill.
- [SurrealMCP GitHub](https://github.com/surrealdb/surrealmcp),
  [SurrealMCP announcement](https://surrealdb.com/blog/introducing-surrealmcp)
