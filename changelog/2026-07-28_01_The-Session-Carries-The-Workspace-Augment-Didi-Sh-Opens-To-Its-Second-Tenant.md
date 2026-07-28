---
title: "The session carries the workspace — augment.didi.sh opens to its second tenant"
lede: "One domain, two client orgs: workspace-service learns the org↔workspace mapping the identity spec always designed, every capability frame gets server-side tenant enforcement, and reach-edu's Stephenie Tesoro becomes the first client user who isn't us."
date_created: 2026-07-28
date_modified: 2026-07-28
publish: true
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
files_changed:
  - services/workspace/src/workspaces.ts
  - services/workspace/src/didi.ts
  - services/workspace/src/ws.ts
  - services/workspace/src/capabilities.ts
  - context-v/plans/Open-Augment-Didi-Sh-To-Reach-Edu.md
---

# The session carries the workspace

## Why Care?

Until today, augment.didi.sh was a product exactly one person could log
into. The door was a stack of environment pins — `DIDI_AUTH=required`,
`REQUIRED_ORG_ID=humain.vc`, `ACTIVE_CLIENT_ID=humain-vc` — that admitted
one org into one workspace, while the reach-edu canonical layer (400+
organizations with relations and strategy tags, 500+ people, a seeded CRM)
sat behind the same deployment with nobody able to see it but the operator.

The identity service was designed for better than that. The id-didi-sh spec
keeps the auth token deliberately minimal (`didi_id` + session id) and puts
the tenancy where it belongs: `/api/me` supplies org memberships, and
augment-it maps **org ↔ workspace** per session. What was running had only
the binary org gate; the mapping was never built, the active workspace was
a single instance-global variable that `workspace.activate` switched for
*every connected session*, and capability frames carried their `client`
argument untrusted from the UI. Safe solo. Disqualifying the moment a
second person logs in.

This run builds the designed path — session-scoped tenancy, server-side
client enforcement — and then opens the door: org `reach.edu` in the
identity service, an invite for **Stephenie Tesoro**, and the Augment-from-DB
workbench deployed to production for her to land on.

## What landed

<!-- appended per ticket during the loop; polished at ship -->

### Workspaces declare their org (#62)

Each workspace now carries its identity binding in a `workspace.json` next
to its `.env` — committed in the client repo itself, so the map lives with
the workspace:

```json
{ "org_id": "reach.edu" }
```

`WorkspaceConfig`/`WorkspaceSummary` gained `org_id`, plus three lookups
the tenancy tickets build on: `getWorkspaceOrgId`, `hasOrgMappedWorkspaces`
(the signal that the org-mapped gate applies vs the legacy binary check),
and `workspacesForOrgs`. Because the deployed instance keeps `clients/` on
a volume rather than in git, a `WORKSPACE_ORG_MAP` env fallback
(`humain-vc=humain.vc,reach-edu=reach.edu`) covers production without
volume surgery — the file wins when both exist.

### The gate learns orgs, not one org (#63)

`didi.ts` now fetches and caches the *memberships themselves*
(`getMemberships`, per-session, failures cached too so reconnect storms
don't hammer the id service) instead of a single boolean. Admission
becomes regime-aware: when any workspace declares an `org_id`, you're
admitted iff your memberships map onto at least one workspace on the
instance (superuser anywhere still walks in); only when no workspace is
org-mapped does the legacy binary `REQUIRED_ORG_ID` check apply. An id-
service outage still fails closed.

### The active workspace becomes per-user (#64)

The heart of the run: `tenancy.ts`. Tenant state is keyed by the didi
**session id** — the shell and every remote open their own WebSocket, but
they all ride the same `didi_session` cookie, so one user's tabs share one
tenant state and two users never do. Each session carries
`allowed_clients` (org-mapped; superuser → all) and its own
`active_client`; `workspace.activate` validates against the allowed set
and, for client users, moves only their session:

```ts
if (!isClientAllowed(ctx, client_id)) {
  throw new Error(`workspace not available to this session: ${client_id}`);
}
```

The old global active survives with a narrower meaning — it is the
row-store family's scope and the anonymous/dev default, and only
superuser (or anonymous) switches move it. Per-session switches broadcast
`workspace.active.changed` stamped with the `sid`; ws.ts forwards those
only to the same user's sockets, and row-store explicitly ignores them —
one client user changing workspaces can no longer swap anyone else's
data out from under them. The session frame now carries
`allowed_clients` + `active_client_id` + `superuser` so the shell knows
its tenancy at connect.

### Every frame gets checked at the door (#65)

The security-critical line. The `client` argument in a capability frame
comes from the browser and was, until now, trusted verbatim. `dispatch()`
now runs `enforceTenant()` before any handler or NATS subject sees the
frame: for restricted sessions, every client-key spelling the services
use (`client`, `client_id`, `client_slug`) must name a workspace in the
session's allowed set, and the records family (`row.*`, `record_set.*`,
`prompt.*`, `response.*`, `variant_family.*`, `pipeline.*`) — which has
no per-frame tenant because row-store follows the instance's global
active — is served only while that global active is in the session's
allowed set. Refusal, not remap: contamination is structurally
impossible rather than merely unlikely. Chat gets the same treatment:
a restricted session's `chat_turn` context has its `client_id`
overwritten from the session before dispatch. Superuser and dev
sessions bypass, byte-for-byte pre-tenancy behavior.

### The contamination proof (#66)

`scripts/prove-session-tenancy.mjs` — fully self-contained: it mints an
EdDSA keypair, serves a fake id-plane (JWKS + `/api/me`) on a local port,
boots a scratch workspace-service in `required` mode against it, and
connects real WebSocket sessions as four personas (alice = humain.vc,
stephenie = reach.edu, bob = both orgs, root = superuser). Twenty
assertions, green on the first run:

```
✓ stephenie refused row.list (row.list is scoped to this instance's
  operator-active workspace (humain-vc), which this session cannot access)
✓ bob's second socket received his sid-scoped switch
✓ alice's socket saw no workspace.active.changed at all
```

The script deliberately performs no global-active moves — the broadcast
test rides bob, a two-org *client* user whose switches are per-sid only —
so a dev row-store listening on the shared NATS is never flipped as a
side effect of proving the feature.

### The frontends already follow (#67)

The audit found no frontend changes needed — the surfaces were built
against the capability contract, and the contract is what moved:
the WorkspaceSwitcher renders the (now server-filtered) `workspace.list`;
`pinned` folds in "only one workspace available," so single-workspace
client sessions hide the switcher without new code; the localStorage-
persisted workspace pick is honored only when it survives the filtered
list, so a foreign slug left by a previous user on a shared machine
silently drops to the server's session active; and every remote's
`workspace.active` read rides the same cookie → same sid → same
per-session state. svelte-check: org-workbench fully clean; the shell's
two errors pre-date this run (untouched files).

### The remotes learn to deploy; the runbook learns multi-tenancy (#69, #71)

The Augment-from-DB surfaces — org-workbench, search-and-add,
search-results, the workbench Stephenie actually needs — each gained a
Dockerfile (the proven chat/strategy-curator shape) and an env-driven
`output.assetPrefix`, and the shell's remote map went env-parameterized
for all three with localhost fallbacks. All three production-build clean.
DEPLOYMENT.md gained the standing multi-tenant section: the
`workspace.json` / `WORKSPACE_ORG_MAP` binding, the env delta from the
single-tenant era (`REQUIRED_ORG_ID` and `ACTIVE_CLIENT_ID` both
retired), the row-store caveat, and the full onboard-the-next-client-org
recipe down to the Fly `~s(...)`/`\x20` quoting gotcha.

### The door actually opens (#68, #69, #70 — live)

With the operator approving each production mutation: org `reach.edu`
("Reach University") created on the live id service, Stephenie's account
and `editor` membership upserted (her membership verified resolving via
`memberships_for`) — the invite email deliberately left for the operator
to send. Production quoting lessons for the runbook: `\x20` does NOT
survive the Fly transport (`List.to_string(codepoints)` does), and map
literals need arrow syntax (`%{:key=>v}`) because `key: v` requires the
space the transport eats.

Railway grew three services — org-workbench, search-and-add,
search-results — all built green on the first Dockerfile'd attempt and
serving their `remoteEntry.js`. The workspace-service flipped to the
mapped regime live: `WORKSPACE_ORG_MAP` set, `REQUIRED_ORG_ID` and
`ACTIVE_CLIENT_ID` emptied, `ACTIVE_STORE_PATH` added (restart no longer
resets the operator's active), startCommand seeding both workspace
stubs. Deployed posture verified: `/config` still `required`, anonymous
upgrade still closes `4401`. One found-in-production fix: the shell's
Dockerfile never declared the three new build args, so the first bake
silently kept localhost fallbacks — Docker only passes ARGs a Dockerfile
names.

### The human gate caught a zombie (#73, filed and fixed same hour)

The operator's walk-through hit a wall that looked exactly like a dead
database — empty roster, searches dying with *"the workspace did not
reply"* — while the backend answered a freshly-minted session perfectly
(441-org roster, instant search). Root cause: id-didi-sh's JWT lives
~12h inside a 30-day cookie with a `/api/session/refresh` contract, and
**nothing ever called it**. On expiry the UI stayed rendered from
localStorage, the transport reconnect-looped on 4401 at ~2/sec (a
literal reject storm in the production logs), and queued invokes
blamed the server at their 120s deadline.

The fix landed both halves in `packages/workspace`: every surface now
refreshes the token hourly and on tab-focus (the endpoint re-mints even
an expired JWT while the session row lives), and the transport treats
close 4401/4403 as auth-death — failing all pending work instantly with
an honest *"session expired — sign in again"*, emitting a new
`auth_required` status that clears `user` so the SignInWall reappears
over the stale UI, trying one silent refresh-then-reconnect (mid-flight
expiry heals invisibly), and retrying at a glacial 30s instead of
storming. Operator findings on the header chrome landed as a second
issue (#72) for the polish pass.
