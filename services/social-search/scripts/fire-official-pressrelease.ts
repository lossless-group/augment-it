// fire-official-pressrelease — one-off CLI driver for the
// official-pressrelease-pack.
//
// USAGE (from augment-it/):
//
//   pnpm tsx services/social-search/scripts/fire-official-pressrelease.ts \
//     --entity="Reach University"
//
// Optional flags:
//   --row-id=<id>            Default: "cli-fire"
//   --row-url=<url>          Optional disambiguator carried through meta.
//   --max-per-wire=N         Cap per wire service. Default: 5.
//   --relevance-context="..."

import { runOfficialPressreleasePack } from '../src/entity-pulse/packs/official-pressrelease-pack';

type CliArgs = {
  entity?: string;
  row_id?: string;
  row_url?: string;
  max_per_wire?: number;
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
      case 'entity': out.entity = value; break;
      case 'row-id': out.row_id = value; break;
      case 'row-url': out.row_url = value; break;
      case 'max-per-wire': out.max_per_wire = Number.parseInt(value, 10); break;
      case 'relevance-context': out.relevance_context = value; break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.entity) {
    console.error('fire-official-pressrelease: --entity="<name>" is required');
    process.exit(2);
  }

  const started = Date.now();
  const response = await runOfficialPressreleasePack({
    row_id: args.row_id ?? 'cli-fire',
    entity_name: args.entity,
    row_url: args.row_url,
    relevance_context: args.relevance_context ?? null,
    max_per_wire: args.max_per_wire,
  });
  const elapsed_ms = Date.now() - started;

  console.error(JSON.stringify({
    level: 'info',
    msg: 'fire-official-pressrelease done',
    elapsed_ms,
    items_found: response.items.length,
    by_provider: response.meta.by_provider,
  }, null, 2));

  console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error('fire-official-pressrelease failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
