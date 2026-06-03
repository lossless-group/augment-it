// fire-official-social-posts — one-off CLI driver for the
// official-social-posts-pack.
//
// USAGE (from augment-it/):
//
//   pnpm tsx services/social-search/scripts/fire-official-social-posts.ts \
//     --socials="https://www.linkedin.com/company/reach-university/,https://x.com/reach_univ,https://www.youtube.com/@ReachUniversity"
//
// Optional flags:
//   --row-id=<id>                  Default: "cli-fire"
//   --max-posts-per-platform=N     Default: 10
//   --relevance-context="..."

import { runOfficialSocialPostsPack } from '../src/entity-pulse/packs/official-social-posts-pack';

type CliArgs = {
  socials?: string;
  row_id?: string;
  max_posts_per_platform?: number;
  relevance_context?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv) {
    const m = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2] ?? 'true';
    switch (key) {
      case 'socials': out.socials = value; break;
      case 'row-id': out.row_id = value; break;
      case 'max-posts-per-platform': out.max_posts_per_platform = Number.parseInt(value, 10); break;
      case 'relevance-context': out.relevance_context = value; break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.socials) {
    console.error('fire-official-social-posts: --socials="<url1>,<url2>,..." is required');
    process.exit(2);
  }
  const socials = args.socials.split(',').map((s) => s.trim()).filter(Boolean);
  if (!process.env.FIRECRAWL_API_KEY) {
    console.error('fire-official-social-posts: FIRECRAWL_API_KEY required');
    process.exit(2);
  }

  const started = Date.now();
  const response = await runOfficialSocialPostsPack({
    row_id: args.row_id ?? 'cli-fire',
    socials,
    relevance_context: args.relevance_context ?? null,
    max_posts_per_platform: args.max_posts_per_platform,
  });
  const elapsed_ms = Date.now() - started;

  console.error(JSON.stringify({
    level: 'info',
    msg: 'fire-official-social-posts done',
    elapsed_ms,
    items_found: response.items.length,
    by_provider: response.meta.by_provider,
    platforms_skipped: response.meta.source_indexes,
  }, null, 2));

  console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error('fire-official-social-posts failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
