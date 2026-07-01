#!/usr/bin/env node
// Decile Hub MCP server (stdio).
//
// Exposes the CRM-core Decile operations (the ones the spec marks
// x-agent-tool) as MCP tools. Base URL + token come from the per-client
// environment (DECILE_API_URL, DECILE_HUB_API_KEY) — set them in the MCP's
// env block when registering, scoped to the client whose tenant you're hitting.
//
// Register (per the project's MCP-scope rule):
//   claude mcp add -s project decile -- node services/decile-mcp/dist/server.js
// with env DECILE_API_URL + DECILE_HUB_API_KEY pointing at the client's tenant.
//
// This is the CRM-core foundation. Every other endpoint in
// references/endpoint-inventory.md follows the same wrap-a-client-call pattern.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { DecileClient, DecileError } from './client.js';

const client = new DecileClient({
  baseUrl: process.env.DECILE_API_URL ?? '',
  token: process.env.DECILE_HUB_API_KEY ?? '',
});

const server = new McpServer({ name: 'decile-hub', version: '0.1.0' });

/** Wrap a client call so errors come back as readable tool output, not crashes. */
async function run(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    const msg =
      err instanceof DecileError
        ? `Decile error ${err.status} [${err.code}]: ${err.message}${err.field ? ` (field: ${err.field})` : ''}`
        : `Error: ${(err as Error).message}`;
    return { content: [{ type: 'text' as const, text: msg }], isError: true };
  }
}

// ── Connection / introspection ──────────────────────────────────────────
server.tool(
  'decile_whoami',
  'Identify the authenticated Decile token: kind (user/admin), user, account, roles, and accessible pipeline IDs. Use first to confirm the connection and capabilities.',
  {},
  () => run(() => client.get('whoami')),
);

// ── People (Directory) — Pattern A pagination, upsert by email ───────────
server.tool(
  'decile_list_people',
  'List people in the Decile directory. Offset pagination (page is 0-indexed). Filter by first_name/last_name/email/created dates; pass custom_data_points="*" to include custom fields.',
  {
    page: z.number().int().min(0).default(0),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().optional(),
    include: z.string().optional().describe('comma list: notes,referred_by,organizations'),
    custom_data_points: z.string().optional().describe('"*", a comma list, or omit'),
  },
  (a) => run(() => client.listA('people', a)),
);

server.tool(
  'decile_get_person',
  'Get one person by id.',
  { id: z.number().int(), custom_data_points: z.string().optional(), include: z.string().optional() },
  ({ id, ...q }) => run(() => client.get(`people/${id}`, q)),
);

server.tool(
  'decile_upsert_person',
  'Create or update ONE person, matched by email (the natural key). Returns { status, person_id, changes }. Required: first_name, last_name, email.',
  {
    first_name: z.string(),
    last_name: z.string(),
    email: z.string(),
    middle_name: z.string().optional(),
    phone: z.string().optional(),
    linkedin: z.string().optional(),
    tag_list: z.string().optional().describe('comma-separated tags to add'),
    custom_data_points: z.record(z.string(), z.any()).optional(),
    organizations: z.array(z.object({ name: z.string(), title: z.string().optional() })).optional(),
  },
  (person) => run(() => client.post('person', { person })),
);

server.tool(
  'decile_add_person_note',
  'Append a note to a person. Required: id, body.',
  { id: z.number().int(), body: z.string(), context: z.string().optional() },
  ({ id, body, context }) => run(() => client.post(`people/${id}/notes`, { note: { body, context } })),
);

// ── Organizations (Directory) — Pattern A, upsert by name ────────────────
server.tool(
  'decile_list_organizations',
  'List organizations in the Decile directory. Offset pagination (page is 0-indexed). Filter by name/created dates; custom_data_points="*" includes custom fields.',
  {
    page: z.number().int().min(0).default(0),
    name: z.string().optional(),
    include: z.string().optional().describe('comma list: notes,people,referred_by'),
    custom_data_points: z.string().optional(),
  },
  (a) => run(() => client.listA('organizations', a)),
);

server.tool(
  'decile_get_organization',
  'Get one organization by id.',
  { id: z.number().int(), custom_data_points: z.string().optional(), include: z.string().optional() },
  ({ id, ...q }) => run(() => client.get(`organizations/${id}`, q)),
);

server.tool(
  'decile_upsert_organization',
  'Create or update ONE organization, matched by name (the natural key). Returns { status, organization_id, changes }. Required: name.',
  {
    name: z.string(),
    website: z.string().optional(),
    description: z.string().optional(),
    tag_list: z.string().optional(),
    custom_data_points: z.record(z.string(), z.any()).optional(),
  },
  (organization) => run(() => client.post('organization', { organization })),
);

server.tool(
  'decile_add_organization_note',
  'Append a note to an organization. Required: id, body.',
  { id: z.number().int(), body: z.string(), context: z.string().optional() },
  ({ id, body, context }) => run(() => client.post(`organizations/${id}/notes`, { note: { body, context } })),
);

// ── Pipelines & prospects ────────────────────────────────────────────────
server.tool(
  'decile_list_pipelines',
  'List active pipelines (deal/relationship boards). Optionally filter by kind (investor, investment, recruiting, portfolio, …).',
  { kind: z.string().optional() },
  (a) => run(() => client.get('pipelines', a)),
);

server.tool(
  'decile_list_pipeline_prospects',
  'List prospects in a pipeline. pipeline_id is REQUIRED. Offset pagination (page 0-indexed). Filter by stage_name/tags/contact dates.',
  {
    pipeline_id: z.number().int(),
    page: z.number().int().min(0).default(0),
    stage_name: z.string().optional(),
    include: z.string().optional().describe('comma list: notes,referred_by,assigned,stage,capital_account'),
    custom_data_points: z.string().optional(),
  },
  (a) => run(() => client.listA('pipeline_prospects', a)),
);

server.tool(
  'decile_upsert_pipeline_prospect',
  'Create or update ONE pipeline prospect. pipeline_id REQUIRED; provide exactly one of person or organization. On create, stage_id sets the stage; on update, stage only changes if apply_stage_id_to_existing=true.',
  {
    pipeline_id: z.number().int(),
    stage_id: z.number().int().optional(),
    apply_stage_id_to_existing: z.boolean().optional(),
    person: z
      .object({ first_name: z.string(), last_name: z.string(), email: z.string() })
      .partial({ first_name: true, last_name: true })
      .optional(),
    organization: z.object({ name: z.string() }).optional(),
    probability: z.number().optional(),
    rating: z.number().optional(),
    tag_list: z.string().optional(),
    custom_data_points: z.record(z.string(), z.any()).optional(),
  },
  ({ pipeline_id, stage_id, apply_stage_id_to_existing, person, organization, ...rest }) =>
    run(() =>
      client.post('pipeline_prospect', {
        pipeline_id,
        stage_id,
        apply_stage_id_to_existing,
        prospect: { ...rest, ...(person ? { person } : {}), ...(organization ? { organization } : {}) },
      }),
    ),
);

// ── Boot ──────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.DECILE_API_URL || !process.env.DECILE_HUB_API_KEY) {
    // Don't hard-exit — the tools will surface a clear error per call — but warn on stderr.
    console.error('[decile-mcp] DECILE_API_URL and/or DECILE_HUB_API_KEY not set; tool calls will fail until provided.');
  }
  await server.connect(new StdioServerTransport());
  console.error('[decile-mcp] ready on stdio');
}

main().catch((err) => {
  console.error('[decile-mcp] fatal:', err);
  process.exit(1);
});
