// Chat dispatch.
//
// Receives chat_turn frames from the WebSocket, assembles the four-slab
// system prompt + the v0.0.1 chat tool definitions, publishes the assembled
// payload to prompt-runner via NATS, returns the chat_response frame to
// the WebSocket.
//
// LLM-gateway invariant: this file does NOT call Anthropic. It publishes
// chat.turn.requested onto NATS; prompt-runner is the sole holder of the
// Anthropic API key.
//
// See context-v/blueprints/Chat-As-Verb-Surface-Patterns.md (ai-labs) for
// the five patterns this implements: capability adapters, lifecycle events,
// anticipation, three response modes, four cache-eligible slabs.

import { dispatch } from './capabilities';
import { getNats } from './nats';
import { getActiveClientId } from './workspaces';

// --- Pattern 5: the four cache-eligible slabs. ---
//
// Slab 1 — static spine. Pinned to package version; changes only on
// release. Cache hits across every session.
//
// Persona: didi is the shared agent across the Lossless VC-tooling family
// (augment-it, dididecks-ai, memopop-ai) — see [[Didi-sh-One-Login-One-
// Agent-Three-Services]] (ai-labs). v0.0.1 here is deliberately augment-it
// -local: one name/voice, but no cross-service runtime, no shared memory
// across apps. The persona line says "didi" so the character is consistent
// wherever a user meets it; everything after it is scoped to this app only.
const STATIC_SPINE = `You are didi, the in-app teammate for augment-it — a corpus-curation, entity-augmentation, and grounded-research workspace. You are the SAME didi a user may also meet in dididecks or memopop, but right now you are operating strictly inside augment-it: only this app's capabilities exist for you. Never offer to do something in another app.

The user's two jobs here: (1) enriching record sets (uploaded CSVs of companies, contacts, deals) with LLM-generated columns, and (2) curating research into thesis/strategy corpora — triaging links and sources into the right corpus, tagging, and adding context as they find it.

You have exactly three response modes. Pick one per turn, by calling exactly one of the three tools below:

- chat_answer — text only, no capability invoked. Use for conversational questions or when no concrete action is implied.
- chat_propose — suggest one or more capabilities the user might invoke. Use when the user's intent is plausible but not explicit. This is the default for any ambiguity.
- chat_invoke — directly invoke a capability without proposing first. Use ONLY when the user named the specific verb explicitly OR previously accepted a proposal.

The chat is in STRICT alignment mode for v0.0.1. Prefer chat_propose over chat_invoke for anything ambiguous. The user can always click an affordance to accept a proposal — that's the gating discipline.

CRITICAL DISCIPLINE:
- prompt.improve is for refining an existing draft from user feedback. It does NOT run the prompt against records. Do not chain it into prompt.apply in the same turn.
- prompt.apply is the only verb that mutates records. Always prefer chat_propose for prompt.apply unless the user has just accepted a draft they want to run.
- prompt.draft creates a draft. The result is editable; do not assume the user will run the first draft as-is.
`;

// Slab 2 — capability schemas. The three v0.0.1 chat verbs that the model
// can route to. Each carries an args shape the model fills in.
//
// Hardcoded here rather than derived from CAPABILITY_TO_SUBJECT because
// augment-it's capability dispatch map doesn't yet carry args schemas
// per capability. v0.0.2 generalizes this; v0.0.1 is the hand-wired
// version for the four verbs that ship.
const V001_CHAT_VERBS = `Available capabilities (use these as the \`capability\` field in chat_propose / chat_invoke):

prompt.draft — Draft a prompt template against a record set, targeting one new output column.
  args: { goal: string, record_set_id: string, output_column: string }

prompt.improve — Refine an existing draft with feedback. Returns a new draft linked to its parent.
  args: { parent_id: string, feedback: string }

prompt.apply — Bind a draft prompt to a record set and run it. Flips status to 'applied' on success.
  args: { prompt_id: string, record_set_id: string, row_limit?: number }

corpus.inbox.add — Save a URL to the operator's Corpus Inbox for later triage. The capture-first destination for URLs the operator finds during research that don't yet have a specific record home. Backend Jina-fetches the URL, writes a markdown file with frontmatter to clients/<client_id>/corpus/inbox/. Use chat_invoke when the user explicitly types "/inbox <url>" or asks to save/inbox/park a URL. The active client_id is in the context slab.
  args: { client_id: string, url: string, note?: string, tags?: string[], captured_from?: "chat-verb" | "chat-paste" }

pipeline.promote_snapshot — Emit the next-version CSV in clients/<client_id>/inputs/ with corpus_* columns derived from filesystem truth at promotion time. The operator runs this between augmentation cycles to capture corpus-cycle work before switching to bundle/pack work. Reads the latest inputs/*_vN.csv, walks corpus/*/*.md indexing by record_id frontmatter, joins, emits vN+1.csv. No args beyond client_id. The active client_id is in the context slab.
  args: { client_id: string }

VERB RECOGNITION SHORTCUTS:
- "/inbox <url>" → chat_invoke corpus.inbox.add with captured_from: "chat-verb"
- "/inbox <url> [note text]" → same, with note populated from the trailing prose
- "/inbox <url> #tag1 #tag2" → same, with hashtag tokens parsed into tags[]
- "save this", "park this", "inbox this", "remember this URL" + a URL → chat_invoke corpus.inbox.add with captured_from: "chat-verb"
- "/promote-snapshot" → chat_invoke pipeline.promote_snapshot
- "snapshot this", "advance the tracker", "emit v9" (or "emit the next version"), "promote the pipeline" → chat_invoke pipeline.promote_snapshot
`;

// Slab 2b — corpus-curation verbs (Build-Order Step 8 — the "inbox triage
// into theses" job). Full triage discipline lives in
// context-v/agent-skills/inbox-curation/SKILL.md; this is the condensed,
// always-loaded operational form v0.0.1 ships with rather than building a
// retrieval/skill-loading mechanism first.
const CURATOR_CHAT_VERBS = `Corpus-curation capabilities (use these as the \`capability\` field in chat_propose / chat_invoke):

source.add — File a URL as a source under an EXISTING corpus (domain).
  args: { url: string, domain_type: string, domain_slug: string, client_slug: string }

domain.create — Create a NEW corpus (thesis/strategy/topic — whatever type the workspace uses).
  args: { type: string, slug: string, title: string, client_slug: string, tags?: string[] }

extract.add — Append a pasted quote/extract to a source already filed under a corpus.
  args: { source_uuid: string, domain_type: string, domain_slug: string, client_slug: string, kind: string, text: string }

tag.apply — Add or remove a tag on a source.
  args: { source_uuid: string, domain_type: string, domain_slug: string, client_slug: string, tag: string, op: "add" | "remove" }

CORPUS-CURATION DISCIPLINE:
- "Existing corpora" below (if present) lists every corpus already in this workspace as "Title → type:slug". Resolve a name the user types (e.g. "consumer-immunology", "the immunology thesis") against that list — match on title OR slug, case/punctuation-insensitive.
- When the user names an EXISTING corpus by name (or slug) AND gives a URL — e.g. "file this link under consumer-immunology", "add this to the immunology thesis" — chat_invoke source.add directly with the resolved domain_type/domain_slug. The named corpus is unambiguous enough to skip proposing; this is the flow's core "fast triage" job.
- domain.create is a bigger decision than adding to one. Always chat_propose first, UNLESS the user explicitly says "create a new thesis/corpus called X" or equivalent.
- If the user gives a URL but names no corpus, or names one that doesn't match anything in "Existing corpora" — chat_propose between source.add (your best-guess existing corpus, if any is plausible) and corpus.inbox.add (park it, untriaged). Never invent or silently pick a corpus.
- Never fabricate a domain_slug or source_uuid. If you need a source_uuid (for extract.add/tag.apply) and don't have one from context or the conversation, say so and ask rather than guessing.
`;

// Workbench crawl verbs — didi's web crawl for one org, per
// context-v/specs/Augment-From-DB-Flow.md §v1.2. The capability is served
// by prompt-runner (Anthropic server-side web search + the per-workspace
// relevance brief); candidates come back for the operator to adjudicate —
// the crawl itself never writes.
const WORKBENCH_CHAT_VERBS = `Org-workbench crawl capability (use as the \`capability\` field in chat_propose / chat_invoke):

organization.crawl — didi crawls the web for one organization. Three targets:
  "crawl for relevant identity links"  → target: "links"   (official site, LinkedIn, socials, Wikipedia)
  "crawl for relevant pulse streams"   → target: "streams" (blog/newsroom/RSS/newsletters/topic hubs)
  "crawl for relevant team members"    → target: "team"    (leadership + team members selected per the workspace's relevance brief)
  args: { org_slug: string, target: "links" | "streams" | "team", client: string, max_results?: number }

CRAWL DISCIPLINE:
- The crawl returns CANDIDATES only — nothing is written until the operator accepts rows. It is slow (tens of seconds); tell the user it's running.
- Requires an org_slug. If the user names an organization, resolve it via context or ask; never guess a slug. Slug-shaped input (lowercase, hyphenated) IS the slug — use it directly.

VERB RECOGNITION SHORTCUTS:
- "/crawl-links <org-slug>" → chat_invoke organization.crawl with target "links".
- "/crawl-streams <org-slug>" → chat_invoke organization.crawl with target "streams".
- "/crawl-team <org-slug>" → chat_invoke organization.crawl with target "team".
- A bare "/crawl-links" / "/crawl-streams" / "/crawl-team" (no argument), or "this org" / "this organization", targets the focused organization from context when one is present — chat_invoke directly with its org_slug. No focused org and no argument → ask.
- Natural phrasings ("crawl for relevant pulse streams for X", "find X's team members") map to the same targets — chat_invoke when the org is unambiguous, chat_propose otherwise.
`;

// Slab 3 — active skills. First resident (2026-07-25): the condensed
// operational form of context-v/agent-skills/triage-inbox-w-suggestions —
// the inbox-triage discipline proven on the first co-pilot run (reach-edu
// 141→4). Same pattern as CURATOR_CHAT_VERBS: the SKILL.md is the source
// of truth, this slab is its always-loaded condensation; update together.
const ACTIVE_SKILLS = `TRIAGE SKILL — corpus-inbox triage (condensed from agent-skills/triage-inbox-w-suggestions).

Purpose: triage is INDEXING — every real actor in the space gets exactly one canonical home (a MECE knowledge graph), and every capture leaves inbox/ for a bucket, a domain, a stream, gated, or a deliberate park. The actor matters even when the page is thin.

Additional capabilities for triage (use as the \`capability\` field in chat_propose / chat_invoke):

organization.corpus.add — Register a URL as corpus content on an EXISTING organization.
  args: { org_slug: string, url: string, client: string }

resolver.search — Look up existing organizations by name/alias fragment. ALWAYS search before minting; the operator may have created the org in the UI already.
  args: { q: string, client: string }

resolver.apply — Mint a new organization row (action "create"). Long-form full-name slug (business-higher-education-forum, not bhef); stamps client_access.
  args: { action: "create", record: { name: string, slug_hint: string, url: string }, client: string, source?: string }

resolver.update_org — Enrich names right after ANY one-string create: complete_name (full formal name), conventional_name (what humans call it), aliases[] (greedy: acronyms, smushed forms, former names). Also renames slugs (old slug auto-preserved as alias).
  args: { org_slug: string, new_slug?: string, complete_name?: string, conventional_name?: string, aliases?: string[], client: string }

organization.streams.add — Register a rolling page as a pulse stream on an org. Kinds: "topic_stream" (topic/issues hub), "blog_index" (blog/news index), "initiative_hub" (a named initiative's hub page — also the lightweight answer for initiative-shaped pages while parent/child org modeling is unresolved).
  args: { org_slug: string, url: string, kind: string, name: string, client: string }

TRIAGE DECISION SEQUENCE (per item):
1. First-party? The client's own content registers on the client's own org row — never mint a bucket for their own programs.
2. Duplicate? Same URL already captured/filed → propose discarding the lesser capture. Page-vs-PDF of the same artifact are NOT dupes — both file.
3. Rolling index page (topic hub / blog index / initiative hub) on a tracked org? → organization.streams.add, not corpus content. A one-time capture of a page that keeps pulsing is worthless.
4. Fetch-blocked capture (403/CAPTCHA/paywall)? → gated, not discarded: the URL is still wanted. Discard is only for genuinely worthless content (404 bodies, nav-only pages, consent boilerplate).
5. Destination: org-attributable content → the org (search first, mint via resolver.apply if truly absent, enrich names immediately); topical content → an existing domain via source.add (resolve the slug against "Existing corpora" — never fabricate); tool homepages / content marketing → the tools topic; a profile page on an identity-link site (Candid, Cause IQ, Charity Navigator, GrantForward…) → the org it profiles.
6. Org role buckets on disk (funders / gov-entities / think-tanks / associations-networks / academic-institutions / data-services) and the disk half of a filing (canonical file moves, reference_of pointer files, binary siblings) are handled by operator-side sessions, not chat — register the DB side here and tell the operator the file placement runs in the triage session.

TRIAGE DISCIPLINE:
- Minting an org or a domain is chat_propose-grade unless the operator explicitly named it. Filing onto an existing, unambiguous org/domain is chat_invoke-grade.
- Slugs: long-form full names; acronyms live in aliases and conventional_name. Government-initiated entities (state workforce agencies, federal programs, NGA/NACo-style bodies whose members ARE governments, multilaterals like IFC/OECD) are gov-entities; membership orgs and networks are associations-networks; nonprofit data utilities are data-services.
- Never fabricate a slug or uuid; resolve against resolver.search and "Existing corpora". Tags are Train-Case with lowercase connector words.
`;

// Slab 4 — per-org reminders. Empty in v0.0.1; cache breakpoint reserved.
const PER_ORG_REMINDERS = '';

// The full v0.0.1 capability vocabulary — the enrichment verbs from
// V001_CHAT_VERBS plus the corpus-curation verbs from CURATOR_CHAT_VERBS.
// One shared list so the two chat_propose/chat_invoke schemas below can't
// drift out of sync with each other.
const CHAT_CAPABILITY_NAMES = [
  'prompt.draft',
  'prompt.improve',
  'prompt.apply',
  'corpus.inbox.add',
  'pipeline.promote_snapshot',
  'source.add',
  'domain.create',
  'extract.add',
  'tag.apply',
  'organization.crawl',
] as const;

// --- The chat tool definitions the model picks among. ---
// These mirror the three response modes from STATIC_SPINE. The SDK returns
// a tool_use block naming one of these names + an input matching the
// declared schema; we translate to ChatResponseFrame.

export const CHAT_TOOLS = [
  {
    name: 'chat_answer',
    description: 'Reply to the user with text. No capability is invoked.',
    input_schema: {
      type: 'object',
      required: ['text'],
      properties: {
        text: { type: 'string', description: 'The conversational reply.' },
      },
    },
  },
  {
    name: 'chat_propose',
    description: 'Suggest one to three capability invocations the user might want. Strict alignment default; use this for any ambiguity.',
    input_schema: {
      type: 'object',
      required: ['text', 'proposals'],
      properties: {
        text: { type: 'string', description: 'A short framing sentence the chat shows above the proposal cards.' },
        proposals: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            required: ['capability', 'hint', 'args'],
            properties: {
              capability: {
                type: 'string',
                enum: CHAT_CAPABILITY_NAMES,
              },
              hint: { type: 'string', description: 'One-line label for the affordance button.' },
              args: {
                type: 'object',
                description: 'Prefilled args. The user can edit before confirming.',
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'chat_invoke',
    description: 'Directly invoke a capability without proposing. Use only when the user named the verb explicitly or accepted a prior proposal.',
    input_schema: {
      type: 'object',
      required: ['text', 'capability', 'args'],
      properties: {
        text: { type: 'string', description: 'A short narration of what the capability is doing.' },
        capability: { type: 'string', enum: CHAT_CAPABILITY_NAMES },
        args: { type: 'object' },
      },
    },
  },
];

// --- Assemble + dispatch. ---

export type ChatTurnInput = {
  message: string;
  thread?: { role: 'user' | 'assistant'; content: string }[];
  context?: {
    focused_prompt_id?: string;
    record_set_id?: string;
    client_id?: string;
    // The org card open in the Org Workbench — "this org" resolves to it.
    focused_org_slug?: string;
    focused_org_name?: string;
  };
  suggestions?: { capability: string; hint: string }[];
};

// The shape prompt-runner returns. One of the three tool calls, or an
// error envelope.
export type ChatTurnResult =
  | { ok: true; tool_name: 'chat_answer'; input: { text: string } }
  | {
      ok: true;
      tool_name: 'chat_propose';
      input: { text: string; proposals: { capability: string; hint: string; args: unknown }[] };
    }
  | {
      ok: true;
      tool_name: 'chat_invoke';
      input: { text: string; capability: string; args: unknown };
    }
  | { ok: false; error: string };

function suggestedVerbsSlab(suggestions?: { capability: string; hint: string }[]): string {
  if (!suggestions || suggestions.length === 0) return '';
  const lines = suggestions.map((s) => `- ${s.capability} — ${s.hint}`).join('\n');
  return `Suggested next verbs (based on the user's current screen and most-recent action):\n${lines}\n`;
}

function contextSlab(ctx?: ChatTurnInput['context']): string {
  const parts: string[] = [];
  // Active workspace — resolved from the browser's persisted choice
  // (sent on every chat_turn) with the server's process-wide active
  // slug as a fallback. Per [[Workspaces-as-Tenant-Primitive]] § "Per-
  // workspace .env pickup". Null means no workspaces exist on disk —
  // the model should refuse client-scoped capabilities in that case.
  const active = ctx?.client_id ?? getActiveClientId();
  if (active) {
    parts.push(`The active client is: ${active} (this is the client_id arg for corpus.inbox.add and any other client-scoped capability).`);
  } else {
    parts.push(`No workspace is active. Refuse client-scoped capabilities and ask the user to pick a workspace from the header switcher.`);
  }
  if (ctx?.focused_prompt_id) parts.push(`The user is currently looking at prompt: ${ctx.focused_prompt_id}`);
  if (ctx?.record_set_id) parts.push(`The user is currently in record set: ${ctx.record_set_id}`);
  if (ctx?.focused_org_slug) {
    parts.push(
      `The user is currently viewing the organization "${ctx.focused_org_name ?? ctx.focused_org_slug}" (org_slug: ${ctx.focused_org_slug}) in the Org Workbench. "This org" / "this organization" refers to it — use this org_slug for organization.crawl and any org-scoped capability.`,
    );
  }
  return parts.join('\n') + '\n';
}

/**
 * "Existing corpora" — every domain (thesis/strategy/topic/…) already in
 * the active workspace, so didi can resolve a name the user types ("file
 * this under consumer-immunology") against a real domain_type/domain_slug
 * instead of guessing or fabricating one. Read-only; a fresh domain.list
 * per turn is cheap next to the LLM round-trip it feeds. Best-effort — a
 * resolver hiccup degrades to an empty slab (didi falls back to
 * chat_propose per CORPUS-CURATION DISCIPLINE) rather than failing the turn.
 */
async function existingCorporaSlab(clientSlug: string | null): Promise<string> {
  if (!clientSlug) return '';
  try {
    const result = (await dispatch('domain.list', { client_slug: clientSlug })) as {
      domains?: { type: string; slug: string; title: string }[];
    };
    const domains = result.domains ?? [];
    if (domains.length === 0) return '';
    const lines = domains.map((d) => `- ${d.title} → ${d.type}:${d.slug}`).join('\n');
    return `Existing corpora in this workspace (Title → type:slug):\n${lines}\n`;
  } catch (err) {
    console.warn('[chat] existingCorporaSlab: domain.list failed', err);
    return '';
  }
}

/**
 * Build the full message array Anthropic will receive. The four cacheable
 * slabs become one combined system string with cache_control breakpoints
 * applied where the prompt-runner converts to the SDK call (the SDK
 * accepts a system: Array<{type, text, cache_control?}> form).
 *
 * For v0.0.1, slabs 3 and 4 are empty strings but the assembly path is in
 * place so v0.0.2 can drop content in without restructuring.
 *
 * Async because the volatile "existing corpora" slab does a live
 * domain.list read — the one slab in this stack that isn't pure string
 * assembly. Everything else stays synchronous string-building.
 */
async function assembleSystemSlabs(input: ChatTurnInput): Promise<{ text: string; cache_control?: { type: 'ephemeral' } }[]> {
  const slabs: { text: string; cache_control?: { type: 'ephemeral' } }[] = [
    { text: STATIC_SPINE, cache_control: { type: 'ephemeral' } },
    { text: V001_CHAT_VERBS, cache_control: { type: 'ephemeral' } },
    { text: CURATOR_CHAT_VERBS, cache_control: { type: 'ephemeral' } },
    { text: WORKBENCH_CHAT_VERBS, cache_control: { type: 'ephemeral' } },
  ];
  // Only include non-empty optional slabs so the SDK doesn't reject empties.
  if (ACTIVE_SKILLS) slabs.push({ text: ACTIVE_SKILLS, cache_control: { type: 'ephemeral' } });
  if (PER_ORG_REMINDERS) slabs.push({ text: PER_ORG_REMINDERS, cache_control: { type: 'ephemeral' } });
  // Volatile slabs (no cache_control). Order: context → existing corpora → suggestions.
  const ctx = contextSlab(input.context);
  const corpora = await existingCorporaSlab(input.context?.client_id ?? getActiveClientId());
  const sug = suggestedVerbsSlab(input.suggestions);
  if (ctx) slabs.push({ text: ctx });
  if (corpora) slabs.push({ text: corpora });
  if (sug) slabs.push({ text: sug });
  return slabs;
}

function assembleMessages(input: ChatTurnInput): { role: 'user' | 'assistant'; content: string }[] {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [];
  if (input.thread) msgs.push(...input.thread);
  msgs.push({ role: 'user', content: input.message });
  return msgs;
}

/**
 * Publish a chat-turn request to prompt-runner and return its reply.
 *
 * Timeout 60s — Sonnet at typical-ish latency lands ~3-15s for a single
 * tool-use response; 60s is generous for the slowest case.
 */
export async function dispatchChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const system = await assembleSystemSlabs(input);
  const reply = await getNats().request(
    'chat.turn.requested',
    JSON.stringify({
      system,
      messages: assembleMessages(input),
      tools: CHAT_TOOLS,
    }),
    { timeout: 60_000 },
  );
  return reply.json() as ChatTurnResult;
}
