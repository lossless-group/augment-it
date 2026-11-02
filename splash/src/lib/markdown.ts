/**
 * Markdown bodies for the changelog and context-v detail pages, rendered through
 * LFM (@lossless-group/lfm). Pattern: lifted from the context-vigilance-kit splash.
 *
 * The loaders in content.config.ts store each entry's raw body and no rendered
 * HTML, so Astro's `render()` returns nothing here. Pages parse the body with
 * `renderable` and render the MDAST tree via components/markdown/AstroMarkdown.astro,
 * so callouts, hex-code citations, code blocks, and images all follow LFM.
 *
 * Wikilinks (`[[Name]]`, `[[Name|alias]]`) are resolved before parsing: a doc or
 * changelog entry links to its page, and anything else stays as plain text.
 * Relative links point at files that aren't pages here, so they go to GitHub.
 */
import { getCollection } from 'astro:content';
import { posix } from 'node:path';
import { parseMarkdown } from '@lossless-group/lfm';

const REPO_BLOB = 'https://github.com/lossless-group/augment-it/blob/rebuild/turbo-rsbuild';

type Index = Map<string, string>;
let index: Index | null = null;

/** Lowercased name or id → site path (relative to BASE_URL). */
async function siteIndex(): Promise<Index> {
  if (index) return index;
  index = new Map();
  for (const e of await getCollection('context-v')) {
    const href = `context-v/${e.id}/`;
    index.set(e.id.toLowerCase(), href);
    index.set(e.id.split('/').pop()!.toLowerCase(), href);
  }
  for (const e of await getCollection('changelog')) {
    index.set(e.id.toLowerCase(), `changelog/${e.id}/`);
  }
  return index;
}

/** Apply `fn` to the text outside code, where `[[Name]]` and links are literal. */
function outsideCode(body: string, fn: (text: string) => string): string {
  return body
    .split(/(```[\s\S]*?```|`[^`\n]*`)/)
    .map((part, i) => (i % 2 ? part : fn(part)))
    .join('');
}

async function resolveWikilinks(body: string): Promise<string> {
  const idx = await siteIndex();
  const base = import.meta.env.BASE_URL;
  return outsideCode(body, (text) =>
    text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_m, rawTarget: string, alias?: string) => {
      const noExt = rawTarget.trim().replace(/^(\.\.?\/)+/, '').replace(/^context-v\//, '').replace(/\.md$/i, '');
      const name = noExt.split('/').pop()!;
      // No alias? Show the filename the way an alias would: - and _ as spaces.
      const label = (alias ?? name.replace(/[-_]+/g, ' ')).trim();
      const href = idx.get(noExt.toLowerCase()) ?? idx.get(name.toLowerCase());
      return href ? `[${label}](${base}${href})` : label;
    }),
  );
}

function resolveRelativeLinks(body: string, sourcePath: string): string {
  const dir = posix.dirname(sourcePath);
  return outsideCode(body, (text) =>
    text.replace(/(\]\()([^)\s]+)/g, (match, open: string, url: string) => {
      if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(url)) return match;
      return `${open}${REPO_BLOB}/${posix.normalize(posix.join(dir, url))}`;
    }),
  );
}

/** `sourcePath` is the file's path from the repo root. */
export async function renderable(body: string | undefined, sourcePath: string) {
  // The page header already shows the title, so drop a leading `# Title`.
  const text = (body ?? '').replace(/^\s*#\s+[^\n]*\n/, '');
  const tree = await parseMarkdown(resolveRelativeLinks(await resolveWikilinks(text), sourcePath));
  const citations = ((tree as any)?.data?.citations?.ordered ?? []) as any[];
  return { tree, citations };
}
