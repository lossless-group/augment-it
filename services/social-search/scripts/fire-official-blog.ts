// fire-official-blog — one-off CLI driver for the official-blog-pack.
//
// Imports the pack handler directly (no NATS, no response-store, no rest of
// the service). Fastest way to iterate on the find-index + extract pattern
// against a real domain, and the surface Agent Chat will eventually wrap
// when it can call packs as tools.
//
// USAGE (from augment-it/):
//
//   pnpm tsx services/social-search/scripts/fire-official-blog.ts \
//     --url=https://reachuniversity.edu
//
// Optional flags:
//   --row-id=<id>                  Carried through to the response meta. Default: "cli-fire".
//   --relevance-context="..."      Free-text brief carried through meta.
//   --max-index-candidates=N       How many index URLs to scrape. Default: 3.
//   --max-posts-per-index=N        Cap per index page. Default: 10.
//   --max-posts-total=N            Hard cap across all index pages. Default: 20.
//
// Requires SERPAPI_API_KEY + FIRECRAWL_API_KEY in the environment. The script
// exits early with a readable error if either is missing.

import { runOfficialBlogPack } from '../src/entity-pulse/packs/official-blog-pack';

type CliArgs = {
  url?: string;
  row_id?: string;
  relevance_context?: string;
  max_index_candidates?: number;
  max_posts_per_index?: number;
  max_posts_total?: number;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    const m = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2] ?? 'true';
    switch (key) {
      case 'url': out.url = value; break;
      case 'row-id': out.row_id = value; break;
      case 'relevance-context': out.relevance_context = value; break;
      case 'max-index-candidates': out.max_index_candidates = Number.parseInt(value, 10); break;
      case 'max-posts-per-index': out.max_posts_per_index = Number.parseInt(value, 10); break;
      case 'max-posts-total': out.max_posts_total = Number.parseInt(value, 10); break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('fire-official-blog: --url=<entity-website> is required');
    console.error('  example: --url=https://reachuniversity.edu');
    process.exit(2);
  }
  if (!process.env.SERPAPI_API_KEY) {
    console.warn('fire-official-blog: SERPAPI_API_KEY not set — find-index will fall back to path-guessing only');
  }
  if (!process.env.FIRECRAWL_API_KEY) {
    console.error('fire-official-blog: FIRECRAWL_API_KEY is required for the extract stage');
    process.exit(2);
  }

  const started = Date.now();
  const response = await runOfficialBlogPack({
    row_id: args.row_id ?? 'cli-fire',
    row_url: args.url,
    relevance_context: args.relevance_context ?? null,
    max_index_candidates: args.max_index_candidates,
    max_posts_per_index: args.max_posts_per_index,
    max_posts_total: args.max_posts_total,
  });
  const elapsed_ms = Date.now() - started;

  // Print the full structured response so the iteration loop can eyeball
  // every field; meta + a tight items summary go to stderr for quick scan.
  console.error(JSON.stringify({
    level: 'info',
    msg: 'fire-official-blog done',
    elapsed_ms,
    items_found: response.items.length,
    source_indexes: response.meta.source_indexes,
    by_provider: response.meta.by_provider,
  }, null, 2));

  console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error('fire-official-blog failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
