// organization.crawl — didi's web crawl for one org: identity links, pulse
// streams, or team members. One model call with Anthropic server-side web
// search does query composition, retrieval, and relevance filtering against
// the operator's per-workspace relevance brief; results come back as
// CANDIDATES the operator adjudicates — this handler never writes to the
// canonical layer. Org context (name, domains, existing URLs for dedupe)
// and the brief are fetched over NATS so chat and button doors share one
// source of truth.
// Spec: context-v/specs/Augment-From-DB-Flow.md §v1.2.
// Plan: context-v/plans/Didi-Crawl-Three-Targets-Relevance-Brief-And-Staged-Team-Ingest.md

import { type NatsConnection } from '@nats-io/transport-node';
import { runPrompt, describeError } from './anthropic';
import { buildRequest } from './request';

// Crawls want speed and web-search competence over max depth — Sonnet, not
// the Opus enrichment default. Overridable like CHAT_MODEL.
const CRAWL_MODEL = process.env.CRAWL_MODEL ?? 'claude-sonnet-4-6';
const CRAWL_MAX_TOKENS = Number(process.env.CRAWL_MAX_TOKENS ?? 4096);
// Per-crawl web-search budget — each search bills; 8 is plenty for the
// find-the-page + confirm pattern the crawl prompts describe. Uncapped,
// a crawl of a huge publisher searched open-endedly (see request.ts).
const CRAWL_MAX_WEB_SEARCHES = Number(process.env.CRAWL_MAX_WEB_SEARCHES ?? 8);

export type CrawlTarget = 'links' | 'streams' | 'team';

export type CrawlInput = {
  org_slug: string;
  target: CrawlTarget;
  client: string;
  max_results?: number;
};

type CrawlLinkCandidate = {
  url: string;
  kind?: string;
  name?: string;
  title: string;
  content: string; // the model's one-line relevance reason
};

export type CrawlPerson = {
  name: string;
  role: string | null;
  headline: string | null;
  linkedin_url: string | null;
  bio_url: string | null;
};

type OrgDetail = {
  complete_name: string | null;
  conventional_name: string | null;
  slug: string;
  domains: { domain?: string }[];
  org_links: { url?: string }[];
  media_streams: { url?: string }[];
};

async function natsJson<T>(
  nc: NatsConnection,
  subject: string,
  body: unknown,
  timeout = 30_000,
): Promise<T> {
  const reply = await nc.request(subject, JSON.stringify(body), { timeout });
  return JSON.parse(new TextDecoder().decode(reply.data)) as T;
}

// The model is asked for bare JSON, but tolerate a fenced block or stray
// prose around it — find the outermost JSON array/object and parse that.
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to bracket hunt */
  }
  const starts = ['[', '{'];
  for (const open of starts) {
    const close = open === '[' ? ']' : '}';
    const s = trimmed.indexOf(open);
    const e = trimmed.lastIndexOf(close);
    if (s !== -1 && e > s) {
      try {
        return JSON.parse(trimmed.slice(s, e + 1));
      } catch {
        /* try the other bracket */
      }
    }
  }
  throw new Error('crawl reply contained no parseable JSON');
}

function orgBlock(org: OrgDetail, existing: string[]): string {
  const name = org.complete_name ?? org.conventional_name ?? org.slug;
  const domains = (org.domains ?? []).map((d) => d?.domain).filter(Boolean).join(', ') || 'unknown';
  const existingList = existing.length > 0 ? existing.map((u) => `- ${u}`).join('\n') : '- (none yet)';
  return `ORGANIZATION\nName: ${name}\nKnown domains: ${domains}\n\nURLs ALREADY ON FILE — do NOT return any of these, or trivial variants of them:\n${existingList}`;
}

function briefBlock(brief: string | null): string {
  return `RELEVANCE BRIEF (the operator's standing intent — what "relevant" means for this workspace):\n${
    brief?.trim() || '(none provided — use general relevance for the organization itself)'
  }`;
}

function promptFor(
  target: CrawlTarget,
  org: OrgDetail,
  existing: string[],
  brief: string | null,
  max: number,
): string {
  const head = `You are didi, augment-it's research agent. Use web search to find CANDIDATES for the operator to review — be fast, precise, and only include entries you are confident belong to THIS organization (beware similarly-named organizations).\n\n${orgBlock(org, existing)}\n\n${briefBlock(brief)}\n`;
  if (target === 'links') {
    return `${head}
TASK — identity & social links: the organization's official website(s), LinkedIn company page, X/Twitter, YouTube, Facebook, Instagram, Bluesky, Wikipedia, Crunchbase, and notable profile pages about the org on other reputable sites.

OUTPUT: respond with ONLY a JSON array (no prose, no markdown fence), at most ${max} entries:
[{"url": "https://…", "kind": "website|linkedin_company|x_profile|youtube|facebook_profile|instagram_profile|bluesky_profile|wikipedia|other", "title": "short human label", "content": "one line: why this is this org's link"}]`;
  }
  if (target === 'streams') {
    return `${head}
TASK — pulse streams: the organization's recurring publication streams — blog index, newsroom/press-release page, RSS/Atom feeds, named newsletters, Substack, YouTube channel, podcast index, topic hubs. Prefer streams relevant per the brief; a stream's NAME is its real title as the org uses it ("Today's Credentials", "Insights").

OUTPUT: respond with ONLY a JSON array (no prose, no markdown fence), at most ${max} entries:
[{"url": "https://…", "kind": "blog_index|newsroom|rss|substack|youtube_channel|topic_hub|updates_index", "name": "the stream's real title, if it has one", "title": "short human label", "content": "one line: what this stream publishes and why it's relevant"}]`;
  }
  return `${head}
TASK — team members: find the organization's team / leadership / people / staff / board page(s) and extract people. SELECTION POLICY — apply the brief's people policy; when the brief names none, default to: ALL major leadership (CEO/president/EDs/VPs/board chairs), PLUS all team members whose role or coverage area relates to Education & Workforce Development and related strategies/topics. Do not return the whole directory of a large organization; the policy is the filter.

OUTPUT: respond with ONLY a JSON object (no prose, no markdown fence):
{"source_urls": ["the team page URL(s) you extracted from"],
 "people": [{"name": "…", "role": "title at the org", "headline": "one-line bio if given", "linkedin_url": "if shown or confidently findable", "bio_url": "their bio page on the org's site if any"}],
 "filtered_note": "N others on the page excluded by policy (or empty string)"}
At most ${max} people.`;
}

// Bounded parallelism. The search-results queue made concurrent crawls the
// norm (N searches in flight across N orgs), and the old awaited-in-loop
// consumer serialized them — a batch of five put the tail past the caller's
// 600s ceiling (observed live 2026-07-24: both NYT crawls timed out behind
// three others). Cap of 3 keeps parallel model turns modest for rate limits;
// a released slot hands off directly to the next waiter.
const MAX_CONCURRENT_CRAWLS = Number(process.env.MAX_CONCURRENT_CRAWLS ?? 3);
let activeCrawls = 0;
const crawlWaiters: (() => void)[] = [];

function acquireCrawlSlot(): Promise<void> {
  if (activeCrawls < MAX_CONCURRENT_CRAWLS) {
    activeCrawls += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => crawlWaiters.push(resolve));
}

function releaseCrawlSlot(): void {
  const next = crawlWaiters.shift();
  if (next) next(); // the slot passes directly; activeCrawls stays counted
  else activeCrawls -= 1;
}

type CrawlMsg = { json<T>(): T; reply?: string; respond(data: string): void };

export function registerCrawlHandler(nc: NatsConnection): void {
  (async () => {
    const sub = nc.subscribe('organization.crawl.requested');
    for await (const msg of sub) {
      // Spawn, don't await — the loop keeps consuming while crawls run.
      void (async () => {
        await acquireCrawlSlot();
        try {
          await handleCrawl(nc, msg as unknown as CrawlMsg);
        } finally {
          releaseCrawlSlot();
        }
      })();
    }
  })();
}

async function handleCrawl(nc: NatsConnection, msg: CrawlMsg): Promise<void> {
  const args = msg.json() as CrawlInput;
  const started = Date.now();
  console.log(JSON.stringify({ level: 'info', msg: 'crawl started', ...args }));
  try {
    if (!args.org_slug?.trim()) throw new Error('organization.crawl: org_slug is required');
    if (!['links', 'streams', 'team'].includes(args.target)) {
      throw new Error(`organization.crawl: unknown target ${String(args.target)}`);
    }
    const max = Math.min(Math.max(args.max_results ?? 12, 1), 25);

    const detail = await natsJson<{ ok: boolean; org?: OrgDetail; error?: string }>(
      nc,
      'organization.detail.requested',
      { org_slug: args.org_slug, client: args.client },
    );
    if (!detail.ok || !detail.org) throw new Error(detail.error || 'organization.detail failed');
    const org = detail.org;

    const briefReply = await natsJson<{ ok: boolean; brief?: string | null }>(
      nc,
      'client.brief.get.requested',
      { client: args.client },
    );
    const brief = briefReply.ok ? (briefReply.brief ?? null) : null;

    const existing =
      args.target === 'streams'
        ? (org.media_streams ?? []).map((e) => e?.url ?? '').filter(Boolean)
        : (org.org_links ?? []).map((e) => e?.url ?? '').filter(Boolean);

    const request = buildRequest(promptFor(args.target, org, existing, brief, max), {
      model: CRAWL_MODEL,
      maxTokens: CRAWL_MAX_TOKENS,
      tools: ['web_search'],
      webSearchMaxUses: CRAWL_MAX_WEB_SEARCHES,
    });
    const text = await runPrompt(request);
    const parsed = extractJson(text);

    if (args.target === 'team') {
      const obj = (parsed ?? {}) as {
        source_urls?: unknown[];
        people?: Partial<CrawlPerson>[];
        filtered_note?: string;
      };
      const people: CrawlPerson[] = (obj.people ?? [])
        .filter((p) => typeof p?.name === 'string' && p.name.trim())
        .slice(0, max)
        .map((p) => ({
          name: (p.name as string).trim(),
          role: p.role?.toString().trim() || null,
          headline: p.headline?.toString().trim() || null,
          linkedin_url: p.linkedin_url?.toString().trim() || null,
          bio_url: p.bio_url?.toString().trim() || null,
        }));
      const reply = {
        ok: true,
        people,
        filtered_note: obj.filtered_note?.toString() ?? '',
        source_urls: (obj.source_urls ?? []).map(String).filter(Boolean),
      };
      if (msg.reply) msg.respond(JSON.stringify(reply));
    } else {
      const have = new Set(existing.map((u) => u.trim()));
      const seen = new Set<string>();
      const results = ((Array.isArray(parsed) ? parsed : []) as Partial<CrawlLinkCandidate>[])
        .filter((r) => typeof r?.url === 'string' && r.url.trim())
        .map((r) => ({
          url: (r.url as string).trim(),
          kind: r.kind?.toString().trim() || undefined,
          name: r.name?.toString().trim() || undefined,
          title: r.title?.toString().trim() || (r.url as string).trim(),
          content: r.content?.toString().trim() || '',
        }))
        .filter((r) => {
          if (have.has(r.url) || seen.has(r.url)) return false;
          seen.add(r.url);
          return true;
        })
        .slice(0, max);
      if (msg.reply) {
        msg.respond(JSON.stringify({ ok: true, provider: 'didi-crawl', results }));
      }
    }
    console.log(JSON.stringify({
      level: 'info',
      msg: 'crawl completed',
      org_slug: args.org_slug,
      target: args.target,
      ms: Date.now() - started,
    }));
  } catch (err: unknown) {
    const error = describeError(err);
    console.error(JSON.stringify({ level: 'error', msg: 'crawl failed', error }));
    if (msg.reply) msg.respond(JSON.stringify({ ok: false, error }));
  }
}
