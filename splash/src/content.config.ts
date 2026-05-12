import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { readFile, glob as fsGlob } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseFrontmatter } from '@loaders/frontmatter';

// ─── Lenient preprocessors — never throw on author-written frontmatter ────

const lenientString = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.string().optional(),
);

const lenientStringArray = z.preprocess(
  (v) => {
    if (v === '' || v === null || v === undefined) return undefined;
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string') return [v];
    return v;
  },
  z.array(z.string()).optional(),
);

const lenientDate = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
    if (typeof v === 'number') {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    if (typeof v === 'string') {
      const t = v.trim();
      if (t === '' || t === '[]' || t === '~' || t === 'TBD' || t === 'tbd') return undefined;
      const d = new Date(t);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }
    return undefined;
  },
  z.date().optional(),
);

const lenientNumber = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.number().optional(),
);

const lenientBoolean = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.boolean().optional(),
);

// ─── Local-only loader — single-project variant (no rollup) ───────────────
// Astro runs this from splash/. Local content lives one level up.

const SPLASH_DIR = process.cwd();
const PARENT_DIR = resolve(SPLASH_DIR, '..');
const PARENT_CHANGELOG = resolve(PARENT_DIR, 'changelog');
const PARENT_CONTEXT_V = resolve(PARENT_DIR, 'context-v');

interface LocalLoaderOptions {
  dir: string;
  collectionName: string;
  provenance: string;
}

function localLoader(options: LocalLoaderOptions) {
  return {
    name: `local-loader:${options.collectionName}`,
    load: async ({ store, parseData, logger }: any): Promise<void> => {
      store.clear();

      let loaded = 0;
      let skipped = 0;

      try {
        for await (const file of fsGlob('**/*.md', { cwd: options.dir })) {
          const abs = resolve(options.dir, file);
          const text = await readFile(abs, 'utf8');
          const { data, body } = parseFrontmatter(text);
          const idBase = file.replace(/\.md$/, '');

          if (data.publish === false) { skipped++; continue; }

          const merged = {
            ...data,
            from: data.from ?? options.provenance,
            from_path: data.from_path ?? file,
          };

          const id = idBase;
          const parsed = await safeParse({ id, data: merged }, parseData, logger);
          store.set({ id, data: parsed, body });
          loaded++;
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }

      logger.info(
        `[${options.collectionName}] ${loaded} loaded — ${skipped} skipped(publish:false).`,
      );
    },
  };
}

async function safeParse(
  args: { id: string; data: unknown },
  parseData: (a: { id: string; data: unknown }) => Promise<unknown>,
  logger: { warn: (msg: string) => void },
): Promise<Record<string, unknown>> {
  try {
    return (await parseData(args)) as Record<string, unknown>;
  } catch (err) {
    logger.warn(`schema couldn't validate ${args.id} (${(err as Error).message}); storing raw frontmatter.`);
    return { ...(args.data as Record<string, unknown>) };
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────

const provenanceFields = {
  from: lenientString,
  from_path: lenientString,
};

const changelogSchema = z
  .object({
    ...provenanceFields,

    title: lenientString,
    lede: lenientString,
    summary: lenientString,
    description: lenientString,

    date: lenientDate,
    date_authored_initial_draft: lenientDate,
    date_authored_current_draft: lenientDate,
    date_authored_final_draft: lenientDate,
    date_first_published: lenientDate,
    date_last_updated: lenientDate,
    date_created: lenientDate,
    date_modified: lenientDate,

    category: lenientString,
    status: lenientString,
    at_semantic_version: lenientString,
    semantic_version: lenientString,
    augmented_with: lenientStringArray,
    publish: lenientBoolean,
    usage_index: lenientNumber,

    tags: lenientStringArray,
    authors: lenientStringArray,
    files_added: lenientStringArray,
    files_modified: lenientStringArray,
    files_removed: lenientStringArray,
    files_changed: lenientStringArray,

    image: lenientString,
    image_prompt: lenientString,
    image_text: lenientString,
    banner_image: lenientString,
    portrait_image: lenientString,
    square_image: lenientString,
  })
  .passthrough();

const contextVSchema = z
  .object({
    ...provenanceFields,

    title: lenientString,
    lede: lenientString,
    summary: lenientString,
    description: lenientString,
    purpose: lenientString,

    date: lenientDate,
    date_created: lenientDate,
    date_modified: lenientDate,
    date_authored_initial_draft: lenientDate,
    date_authored_current_draft: lenientDate,
    date_authored_final_draft: lenientDate,
    date_first_published: lenientDate,
    date_last_updated: lenientDate,
    date_updated: lenientDate,
    last_verified: lenientDate,

    category: lenientString,
    status: lenientString,
    at_semantic_version: lenientString,
    semantic_version: lenientString,
    augmented_with: lenientStringArray,
    publish: lenientBoolean,
    applies_to: lenientString,

    authors: lenientStringArray,
    tags: lenientStringArray,
    image: lenientString,
    image_prompt: lenientString,
  })
  .passthrough();

// ─── Curated collections (local to splash/) ───────────────────────────────

const featureHighlights = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/feature-highlights' }),
  schema: z
    .object({
      title: lenientString,
      lede: lenientString,
      order: lenientNumber,
      status: lenientString,
      icon: lenientString,
      featured: lenientBoolean,
      tags: lenientStringArray,
      docs: lenientString,
    })
    .passthrough(),
});

// ─── Long-form collections (point at parent dirs) ─────────────────────────

const changelog = defineCollection({
  loader: localLoader({
    collectionName: 'changelog',
    dir: PARENT_CHANGELOG,
    provenance: 'augment-it',
  }),
  schema: changelogSchema,
});

const contextV = defineCollection({
  loader: localLoader({
    collectionName: 'context-v',
    dir: PARENT_CONTEXT_V,
    provenance: 'augment-it',
  }),
  schema: contextVSchema,
});

export const collections = {
  'feature-highlights': featureHighlights,
  changelog,
  'context-v': contextV,
};
