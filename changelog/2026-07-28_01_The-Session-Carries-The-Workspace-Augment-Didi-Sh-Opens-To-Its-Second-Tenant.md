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
