# decile-mcp

An MCP server for the **Decile Hub API v1** — the first per-client custom connector in
augment-it. It wraps the Decile REST API (VC CRM + fund admin) as MCP tools, so an agent
can pull and push people, organizations, pipeline prospects, and notes for a given client's
Decile tenant.

The full operating guide is the **`decile-hub-connector` skill**
(`context-v/skills/decile-hub-connector/`); this server implements its CRM-core slice. The
authoritative API contract is the on-disk OpenAPI spec at
`clients/humain-vc/inputs/decilehub/202506_decilehub-docs_swagger.yaml`.

## Connection

Decile is **per-tenant** (each client has its own subdomain) and uses a **raw API token in
the `Authorization` header** (no `Bearer`). Both come from the client's `.env`:

```
DECILE_API_URL=https://humain.decilehub.com      # the tenant base URL
DECILE_HUB_API_KEY=<API token from Hub /settings/api>
```

## Build & register

```bash
cd services/decile-mcp
pnpm install
pnpm build

# Register at PROJECT scope (lands in .mcp.json, persists across sessions).
# Point the env at the client tenant you're working in.
claude mcp add -s project decile \
  --env DECILE_API_URL=https://humain.decilehub.com \
  --env DECILE_HUB_API_KEY=<token> \
  -- node services/decile-mcp/dist/server.js
```

> Multi-client: register one entry per client (e.g. `decile-humain`, `decile-<next>`),
> each with that client's `DECILE_API_URL` + token. The server is tenant-agnostic; the
> tenant is entirely in the env.

Verify with the `decile_whoami` tool — it returns the token kind, user, account, roles, and
accessible pipeline IDs.

## Tools (CRM core)

| Tool | Decile endpoint | Notes |
|---|---|---|
| `decile_whoami` | `GET /whoami` | connection + capability check |
| `decile_list_people` | `GET /people` | offset pagination (page 0-indexed) |
| `decile_get_person` | `GET /people/{id}` | |
| `decile_upsert_person` | `POST /person` | match/create by **email**; returns `changes` diff |
| `decile_add_person_note` | `POST /people/{id}/notes` | |
| `decile_list_organizations` | `GET /organizations` | |
| `decile_get_organization` | `GET /organizations/{id}` | |
| `decile_upsert_organization` | `POST /organization` | match/create by **name** |
| `decile_add_organization_note` | `POST /organizations/{id}/notes` | |
| `decile_list_pipelines` | `GET /pipelines` | |
| `decile_list_pipeline_prospects` | `GET /pipeline_prospects` | `pipeline_id` required |
| `decile_upsert_pipeline_prospect` | `POST /pipeline_prospect` | one of person\|organization |

## Architecture

- **`src/client.ts`** — `DecileClient`: base URL + raw-token auth, a helper per pagination
  pattern (`listA` 0-indexed `{data,pagination}`, `listB` 1-indexed `{key,page,per_page,total}`,
  `listC` keyset `{data,pagination:{next_page_token,has_more}}`), and `normalizeError` that
  handles both the wrapped `ErrorResponse` and the bare `{error:"string"}` shape.
- **`src/server.ts`** — registers the tools above on a stdio `McpServer`.

## Extending

Every other endpoint in
`context-v/skills/decile-hub-connector/references/endpoint-inventory.md` follows the same
pattern: add a `server.tool(...)` that calls `client.get/post/patch` or the matching
`listA/B/C` helper. Prioritize operations the spec marks `x-agent-tool: true`. Likely next
additions: deal shares, deal memos, portfolio companies, tasks, files, events.
