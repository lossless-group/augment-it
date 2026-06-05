---
title: "Per-Client Privacy and the Path Off Local — when does single-operator-local-only stop scaling, what stack do we reach for, and how do we architect today so the move is cheap when it comes"
lede: "Two forcing functions converged in the same week. (1) The funder-content corpus the operator wants to build for reach-edu — Jina-pulled markdown from each funder's blog / press / RSS — must be private per client; reach-edu's corpus and Laerdal's would share little, and both treat the material as highly sensitive. (2) Across all ai-labs projects, the single-operator-on-localhost posture is bumping up against the seam where typical SaaS concerns (auth, workspaces, per-client isolation, admin controls) would normally live. An active collaborator is joining; a client wants login soon. The exploration's job is NOT to commit to a stack now — the operator's instinct that 'we're not quite there in terms of actually needing it, maybe in a few weeks' is the right call — but to (a) map the option space across repo topology, storage substrate, identity, and multi-tenant data model, (b) identify which architecture choices made TODAY (about the funder corpus, the augment-it record store, the chroma collections) preserve cheap optionality for the move off local, and which lock us in, (c) name the decision-forcing functions that would flip 'not yet' to 'now'. Anchor reference: the dididecks-ai client-private-repos pattern (calmstorm-decks et al.). Candidate stacks include all-local-private-repos, Railway-Postgres-per-client (single-tenant), Railway-Postgres-multi-tenant with auth, hybrid markdown-in-repos + Chroma-for-retrieval, and managed BaaS (Powabase.ai surveyed, flagged expensive). The exploration ends with a recommended posture, not a decision."
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-05 — Initial draft.
tags:
  - Exploration
  - Augment-It
  - Ai-Labs-Architecture
  - Per-Client-Privacy
  - Multi-Tenancy
  - Funder-Corpus
  - Jina-Ai
  - Markdown-Corpus
  - Railway
  - Postgres
  - Nocodb
  - Powabase
  - Local-to-SaaS
  - Auth
  - Workspaces
  - Repo-Topology
status: Draft
---

# Per-Client Privacy and the Path Off Local

## What we're trying to figure out

Two questions that have been adjacent for a while just collided into the
same week:

1. **Where does the funder-content corpus live?** The operator wants to
   stop triaging URLs candidate-by-candidate in Response Reviewer and
   start pulling content (via Jina.ai) from each funder's blog / press
   / RSS, deduping, and persisting as markdown. The corpus then powers
   (a) cross-funder fundraising strategy synthesis, (b) per-funder
   outreach customization. For reach-edu, this is highly sensitive
   material; for the next client (Laerdal), it's a different corpus
   with little to no overlap, also highly sensitive. Two clients today,
   N clients soon.
2. **When does the broader ai-labs posture move off local?** Augment-it
   today runs entirely in Docker on the operator's laptop —
   workspace-service on :3001, row-store / response-store / prompt-store
   / NATS / SearXNG / social-search all in `docker-compose`. The local
   Chroma database (per the ai-labs CLAUDE.md backstop) is wired in via
   MCP. That topology has been working for a single operator. Three
   things are changing it: an active collaborator wants to dive into
   development, a client wants their own login soon, and the funder
   corpus would expand the data substantially (potentially gigabytes of
   markdown per client).

The exploration **does not** try to decide a stack. The operator's
instinct that we are "not quite there — maybe in a few weeks" is the
right call. The job here is to map what's actually different across
the candidate paths, identify which choices made today preserve cheap
optionality, and name the decision-forcing functions that would flip
"not yet" to "now."

## Reference architecture — dididecks-ai's client-private-repos

The pattern the operator already runs in [[dididecks-ai]] is the
implicit reference for the corpus side: each client gets a private
repo under `ai-labs/dididecks-ai/client-sites/<client-slug>/`
(calmstorm-decks, etc.). The repo is git-private; access is scoped at
the GitHub-org level; the agent sees it only when explicitly opened.
Sensitive material (decks, client research) lives there; shared
tooling / dependencies live in the parent.

Strengths of that pattern for the funder corpus:
- **Privacy is git-native** — no application-level multi-tenancy code
  needed, no possibility of leaking client B's data into a query
  against client A.
- **Versioning is free** — every ingest pass is a commit. Diff between
  two ingest dates is a `git diff`. Rollback is `git revert`.
- **Markdown is the right substrate** — Chroma's local ingestion
  pipeline (`context-vigilance-kit/scripts/`) already groks
  section-chunked markdown with YAML frontmatter; per-client Chroma
  collections would parallel the existing
  `context-vigilance-corpus` / `lossless-changelog` / etc. pattern.
- **Collaborator onboarding is git-native** — give them access to the
  repo, they have access; revoke, they don't.

Limits the operator already named:
- "The corpus for each would be different, they have different goals
  and very little overlap if any at all." Per-client repos make that
  separation structural, not policy.
- "Everyone believes their data is private and needs to be secure."
  Git-private repo is a real boundary, not an application policy.

This pattern is well-tested for **client-private content**. It does
NOT cover the operational data (record sets, response store, prompt
store) — those today sit in the augment-it docker stack and would be
the thing that needs a different story when remote access becomes
real. See §[Storage substrate](#storage-substrate-options) below.

## The axes

This is a cross-axis decision. Each axis has independent option-space;
combining them produces the candidate stacks in
§[Candidate stacks](#candidate-stacks).

### Repo topology

- **Option R1 — One private repo per client** (`ai-labs/augment-it-clients/<slug>/`,
  or `client-repos/<slug>/` outside the augment-it tree). Mirrors
  dididecks-ai. Per-client `corpus/` directory, per-client `record-sets/`
  if we eventually export record-set JSON there, per-client config.
- **Option R2 — One shared private repo with client-namespaced
  directories.** Lower repo-management overhead; access control
  becomes "who can see this repo" not "who can see THIS repo for
  THAT client." Worse if a future client demands their own repo as
  a compliance artifact.
- **Option R3 — Hybrid.** Corpus and sensitive content per-client
  repo (mirrors dididecks-ai); operational data (record sets,
  responses, prompts) in a shared deployment with multi-tenant
  isolation at the database layer.

### Storage substrate options

- **Option S1 — Markdown files only.** Funder corpus as
  `corpus/<funder-slug>/<YYYY-MM-DD>_<title-slug>.md`. Operational
  data stays in the JSON files row-store / response-store / prompt-store
  already use. No database. Git is the persistence layer.
- **Option S2 — Local SQLite per client** alongside markdown.
  Operational data moves out of the docker JSON files into per-client
  SQLite databases living in the same per-client repo. Survives
  docker restarts; queryable; still git-trackable (if we accept the
  binary-diff cost).
- **Option S3 — Remote Postgres single-tenant per client** (Railway
  per the operator's note). One Postgres instance per client; auth
  at the connection-string level; cheap-ish per client (Railway
  hobby plan + small Postgres). Funder corpus markdown still lives
  in the per-client repo; structured data lives in the remote DB.
- **Option S4 — Remote Postgres multi-tenant** with a `client_id`
  column on every table and application-layer auth. Single
  deployment serves all clients. SaaS-shaped. More work upfront
  (auth, RLS / app-layer isolation, admin controls); less ongoing
  ops cost as the client count grows.
- **Option S5 — Managed BaaS** (Powabase.ai surveyed and flagged
  expensive by the operator; could survey Supabase, Convex,
  PocketBase-cloud as alternatives). Trades cost for less devops.
- **Option S6 — Hybrid: markdown corpus per-client + Chroma
  per-client for retrieval + remote Postgres for operational data
  later.** Maximizes optionality. The corpus side moves to the
  per-client-repo pattern NOW; the operational-data side stays
  local until the collaborator + client-login forcing functions
  arrive; then a clean lift to Railway-Postgres-multi-tenant.

### Identity & auth

- **Option I1 — No app-level auth.** Operator-only. Today's state.
  Client login: doesn't exist. Collaborator: clones the repo.
- **Option I2 — Git-level access only.** Per-client repos with
  GitHub-org access control. Collaborator gets repo invites;
  client gets a read-only repo invite OR a "viewer" GitHub account
  in the org. Works for content browsing; doesn't work if the
  client expects a polished login flow on a hosted app.
- **Option I3 — Magic-link / passwordless auth on a hosted app
  surface.** Client visits a URL, gets emailed a sign-in link,
  lands in their workspace. Stripe-style minimalism; no password
  store. Reasonable first auth implementation.
- **Option I4 — Full identity provider** (Clerk, Auth0, Supabase
  Auth, Better-Auth). More work upfront; gives roles, admin
  surfaces, audit logs. Right when the client count grows past
  hand-management.

### Multi-tenant data model

Independent of where the data lives:

- **Option T1 — Per-client isolation by deployment.** One docker
  stack per client; one Railway project per client; one repo per
  client. Strongest isolation, most ops overhead.
- **Option T2 — Per-client isolation by namespace.** Shared
  deployment, `client_id` column on every table, application-layer
  enforcement. Standard SaaS shape. Riskier (a bug leaks); cheaper
  to run.
- **Option T3 — Per-client isolation by row-level security**
  (Postgres RLS). Shared deployment, RLS policy on every table
  scoped to the connecting user's tenant. Belt-and-suspenders over
  T2.

### Sensitivity constraints

Both reach-edu and Laerdal treat the material as highly sensitive.
This narrows the options:

- **Rules out S5 (managed BaaS)** unless the vendor's compliance
  posture matches what the clients would demand. Worth asking the
  clients explicitly before committing — "your funder research
  corpus would live on Supabase, is that acceptable" is a real
  question.
- **Favors R1/R3 (per-client repos)** over R2 (shared repo with
  client-namespaced dirs) for the funder corpus specifically. A
  per-client repo can be encrypted at rest by the operator's disk
  encryption + GitHub's at-rest encryption; the access boundary
  is "is this person in the GitHub repo."
- **Favors local-only for now** until at least one of the
  collaborator-needs-remote-access or client-needs-login functions
  fires.

## Candidate stacks

Concrete combinations across the axes. Each is shippable; the
question is which one preserves cheap optionality for the OTHERS.

### Path A — Defer everything

Stack: R1 (per-client repos) + S1 (markdown files only) + I1
(operator only) + T1 (per-client isolation by deployment).

What it looks like: a new repo
`ai-labs/augment-it-clients/reach-edu/` with a `corpus/` directory.
Jina ingestion writes markdown there. Augment-it's docker stack stays
on the operator's laptop. The collaborator clones the same repo,
runs the same docker locally. The client doesn't have access to
anything yet.

Defers: auth, hosting, multi-tenancy, remote DB, admin controls.

Buys: zero new infra cost. Per-client privacy at the git level.
Immediate path to the funder corpus that the operator can use to
develop reach-edu strategy and outreach this week.

Costs: when the client login arrives, every operational thing
(record sets, responses, prompts, run history) has to move from
docker-JSON-on-laptop to somewhere remote. That's the work being
deferred. Mitigation: keep the row-store / response-store / etc.
JSON files inside the per-client repo so they ARE the migration
artifact later.

### Path B — Per-client Railway single-tenant

Stack: R1 + S3 (Railway Postgres per client) + I3 (magic-link
auth) + T1 (per-client isolation by deployment).

What it looks like: each client gets their own Railway project. A
single deployable image runs in each; data isolation is the Railway
project boundary. The augment-it app is hosted; the collaborator
and client both log in via magic-link.

Buys: real client-login. Per-client isolation is structural.

Costs: Railway-per-client ops (small but non-zero). Application
work: auth flow, deployment automation, "which Railway project does
this user belong to" routing. The funder corpus could stay in the
per-client repo (markdown is fine to keep there even with a
hosted DB).

### Path C — Multi-tenant SaaS shape

Stack: R3 (hybrid — corpus in per-client repos, operational data
shared) + S4 (one Postgres, multi-tenant) + I4 (Clerk/Auth0/etc.)
+ T2 + T3 (namespace + RLS).

What it looks like: single hosted augment-it deployment serves all
clients. Every row of operational data has a `client_id`. Auth
provider issues tokens scoped to a workspace. The funder corpus
markdown still lives in per-client repos (privacy at the git
level), and the hosted app reads it for display + LLM workflows.

Buys: SaaS-ready. Adding the Nth client is application work, not
infrastructure work.

Costs: substantial upfront work. Auth provider integration. RLS
policies on every table. Admin surfaces (invite users, manage
roles). Migrations from today's docker JSON files. The corpus
acquisition (Jina pulls) probably runs as a background worker
keyed by client_id.

### Path D — Hybrid posture (recommended-for-discussion)

Stack: R1 + S6 (markdown per client + per-client Chroma now;
operational data lift to S4-shaped later) + I1 (operator only) +
T1 (deployment) **with one accommodation**: build the new
`content-ingest` service AND the per-client Chroma collection
patterns BUT keep the augment-it docker stack local-only for now.

What it looks like: start a new repo
`ai-labs/augment-it-clients/reach-edu/` today. The funder corpus
acquisition runs as a script the operator invokes against a URL
list. Ingest writes markdown to `corpus/<funder-slug>/...`. A
sidecar script ingests the markdown into a per-client Chroma
collection (`reach-edu-funder-corpus`). The collaborator gets
repo access. The client login is still deferred.

Buys: the work that has the LEAST in common with future-state
SaaS — the corpus ingestion pipeline, the markdown shape, the
Chroma indexing — gets done NOW under the operator's full
control, in repos that are private by construction. The work that
has the MOST in common with future-state SaaS — auth, multi-tenant
DB, admin surfaces — is left for when the trigger functions
actually fire.

Costs: the operational data still has the migration cost when the
flip comes. Mitigation: keep the augment-it docker stack's JSON
files inside the per-client repo (`reach-edu/operational/`) so
"flip to remote" becomes "import these JSON files into Postgres
once, then run the Postgres-backed version."

### Path E — Managed BaaS (probably ruled out, worth surveying)

Stack: R1 + Supabase or similar + I4 (provider auth) + T2/T3.

Operator already flagged Powabase as expensive. Supabase, Convex,
PocketBase-cloud, and Better-Auth-hosted are worth a one-hour
survey each for cost/posture comparison if Path C ever becomes the
target. Out of scope for this exploration to evaluate fully;
called out so we don't blindly skip "buy" in favor of "build."

## Decision-forcing functions

Names what would flip "not yet" to "now." Watching for these is the
actionable output of this exploration.

1. **Collaborator needs remote access to operational data** — not
   just the repo, but the running augment-it stack. If the
   collaborator's workflow requires hitting `workspace-service` at
   :3001 from a machine that isn't the operator's laptop, the local
   docker posture breaks. Path A is over; Path D's accommodation
   (operational data in the per-client repo) becomes critical.
2. **A client wants a login URL.** The first time a client says
   "give me a URL I can log into," Path A is over and either B or
   C is required. Path B is faster; Path C is more durable.
3. **Two collaborators want to work on the same client at the
   same time.** Local-laptop posture means one operator at a time
   on a given client. Real concurrency means hosted.
4. **A client demands audit logs / role separation / SSO.** Path
   I4 (full identity provider) becomes load-bearing. Path B's
   magic-link doesn't cut it.
5. **The funder corpus crosses a size threshold** (1 GB? 10 GB?)
   where holding it in a single repo becomes painful. Git LFS or
   a separate content-addressed store comes in. Not urgent.
6. **A client asks for SOC 2 / GDPR posture.** Probably forces
   managed-BaaS-with-compliance or self-hosted with explicit
   controls. Re-runs the Path E survey.

If NONE of these fire in the next few weeks, Path A or Path D is
correct. If ONE fires, the timing decision is forced.

## What architecture choices today preserve optionality

These hold regardless of which path we pick:

- **Funder corpus as markdown files** — round-trips through every
  candidate stack. Chroma indexes them. LLM workflows consume
  them. Git versions them. Postgres can ingest them later as TEXT
  if needed.
- **Operational data in per-client repo, not in the augment-it
  docker volume only** — even if today the row-store / response-store
  / prompt-store JSON files are read by the local docker, also
  symlink (or `cp` on save) them into the per-client repo. When
  the migration to Postgres comes, the JSON files are the import
  source. This is the smallest accommodation; it's load-bearing.
- **Client identity as a first-class concept in NEW code from now
  on** — every new artifact (corpus markdown, ingest run, response
  record) carries a `client_id` field. Even if today there's only
  one client and the field is always `"reach-edu"`, the field
  being there means multi-tenancy is data-shape ready when the
  flip comes.
- **Chroma collections as the retrieval primitive** — already true
  per the ai-labs CLAUDE.md backstop. Adding
  `reach-edu-funder-corpus` and `laerdal-funder-corpus` is one
  ingest script each; they sit next to the existing four
  collections.
- **Auth shape declared but not implemented** — write down where
  auth WOULD enter (which capabilities check tenant, which
  surfaces show admin) even though today none of it does. When
  the flip comes, the hooks are already named.

These cost almost nothing today. They make every path-flip cheap.

## Recommended posture (for discussion, not commitment)

**Path D — hybrid.** Start the per-client repo for reach-edu this
week. Build the funder-corpus ingest pipeline (Jina-pull → markdown
→ per-client Chroma collection). Stash the augment-it operational
data inside the per-client repo so the migration source exists. Do
NOT build auth or hosting yet — wait for one of the decision-forcing
functions to actually fire. If/when one fires, the conversion
target is Path B (single-tenant Railway per client) for speed or
Path C (SaaS-shaped multi-tenant) for durability — that decision
gets its own spec at the time.

Rationale:
- The funder corpus work the operator wants to do this week is
  the work that has the LEAST in common with future SaaS
  architecture. Doing it now under operator control, in private
  repos, costs nothing in optionality.
- The augment-it stack's current docker-local posture is fine for
  one operator + one client + a collaborator who clones the repo
  and runs their own copy. It stops being fine the moment two
  people want to write to the same record set at the same time
  remotely, OR a client logs in. Neither is true today.
- The operator's note "we are not quite there in terms of
  actually needing it" is the correct read of the situation.
  Premature SaaS-ification is expensive and the wrong work.

## What this exploration is NOT trying to decide

- The actual Jina ingestion pipeline shape (URL list → fetch →
  markdown → dedupe → write). That's a separate spec once we
  agree the corpus lives in a per-client repo.
- The corpus-browser UI (operator + client read surface). Same.
- The per-client Chroma collection ingestion mechanics. Same;
  parallels existing `context-vigilance-kit` work.
- The specific provider choice if/when we move off local (Railway
  vs Supabase vs self-hosted on Hetzner / DO). That's the
  decision the forcing-function fires.

Each of those is a sibling artifact this exploration would
produce, once the high-level posture is signed off.

## Open questions for the operator

1. **Repo location for the per-client artifact.** Inside
   `ai-labs/augment-it-clients/<slug>/` (sibling to other
   augment-it work)? Inside `ai-labs/<slug>-corpus/` (per-client
   peer at the ai-labs level, similar to how dididecks-ai sits)?
   Outside ai-labs entirely (`~/code/lossless-monorepo/clients/<slug>/`)?
2. **Operational data co-location.** Do we mirror the augment-it
   docker JSON files into the per-client repo (as
   `reach-edu/operational/{rows.json,responses.json,prompts.json}`)
   even though they're consumed by the local docker stack? Yes
   keeps optionality cheap. No keeps the repo focused on content.
3. **Where the augment-it app eventually hosts.** If the answer is
   Railway, the path from Path D → Path B is short. If the answer
   is "we self-host on a Hetzner box," different. If "Vercel +
   Postgres+ Auth0", different again. The exploration doesn't
   need this answered now but the answer narrows the options at
   forcing-function time.
4. **Client expectations about provider.** Will reach-edu or
   Laerdal accept "your data sits on Railway / Supabase / your
   own provider"? Worth a single email per client when the time
   comes. Affects whether Path E re-enters consideration.

## See also

- [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]] —
  the audit that surfaced the response-store junk volume; the
  Jina-ingest pipeline this exploration anchors is the
  alternative to triaging each URL.
- [[Flow-for-Bundles-Packs]] §"The connectors" — the seed-URL
  producers whose output this corpus pipeline would consume
  instead of routing through Response Reviewer.
- [[Entity-Profile-Augmentation-Workflow]] — the prior arc on
  packs + bundles; the per-client corpus is the workflow's
  downstream consumer.
- `ai-labs/dididecks-ai/client-sites/` — the reference pattern
  for per-client private repos.
- `ai-labs/CLAUDE.md` §"Local RAG over the Lossless corpus" —
  the four Chroma collections this exploration's per-client
  collections would parallel.
- `ai-labs/context-vigilance-kit/` — the ingestion machinery for
  Chroma; the per-client funder-corpus ingest would extend the
  same scripts.
- `content-farm/` — the existing content-production pseudomonorepo;
  candidate parent for client corpora if we don't put them under
  ai-labs.
