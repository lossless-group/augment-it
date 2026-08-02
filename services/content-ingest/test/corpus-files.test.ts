// Group F — Corpus file layer.
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// Test names are the registry's ✓-phrases, verbatim. Runs the real
// exported corpus-file functions against a temp CLIENTS_ROOT, with Jina
// mocked so nothing hits the network. CLIENTS_ROOT is a module-level const
// read at import, so the module is imported dynamically AFTER the temp root
// is set into the env.

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Jina is the only network dependency addSourceFile touches — stub it.
vi.mock('../src/jina', () => ({
  fetchViaJina: vi.fn(async (url: string) => ({
    ok: true,
    title: 'Consumer Immunology Primer',
    markdown: 'A short excerpt of the source body.',
    extra: {},
    url,
  })),
}));

let root: string;
let corpus: typeof import('../src/corpus');

const exists = async (p: string): Promise<boolean> => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'augment-it-corpus-files-'));
  process.env.CLIENTS_ROOT = root;
  corpus = await import('../src/corpus');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('Group F — corpus file layer', () => {
  test('adding a source writes its markdown file into the right client, type, and domain folder', async () => {
    const res = await corpus.addSourceFile({
      client_slug: 'humain-vc',
      domain_type: 'thesis',
      domain_slug: 'consumer-immunology',
      source_uuid: 'uuid-abc-123',
      url: 'https://example.com/immunology',
    });

    // thesis → theses; the path encodes the same identity the DB row carries.
    const expectedPath = join(root, 'humain-vc', 'corpus', 'theses', 'consumer-immunology', 'sources', `${res.source_slug}.md`);
    expect(await exists(expectedPath)).toBe(true);
    expect(res.corpus_path).toBe(`humain-vc/corpus/theses/consumer-immunology/sources/${res.source_slug}.md`);
    expect(res.created).toBe(true);

    // Idempotent on the slug — a second add doesn't rewrite.
    const again = await corpus.addSourceFile({
      client_slug: 'humain-vc',
      domain_type: 'thesis',
      domain_slug: 'consumer-immunology',
      source_uuid: 'uuid-abc-123',
      url: 'https://example.com/immunology',
    });
    expect(again.created).toBe(false);
    expect(again.source_slug).toBe(res.source_slug);
  });

  test('removing a source deletes its file and binary sibling; the DB and disk agree after', async () => {
    const added = await corpus.addSourceFile({
      client_slug: 'humain-vc',
      domain_type: 'thesis',
      domain_slug: 'specialized-foundation-models',
      source_uuid: 'uuid-def-456',
      url: 'https://example.com/sfm',
    });
    const dir = join(root, 'humain-vc', 'corpus', 'theses', 'specialized-foundation-models', 'sources');
    const mdPath = join(dir, `${added.source_slug}.md`);
    const pdfPath = join(dir, `${added.source_slug}.pdf`);
    await writeFile(pdfPath, 'fake-pdf-bytes'); // plant a binary sibling
    expect(await exists(mdPath)).toBe(true);
    expect(await exists(pdfPath)).toBe(true);

    const res = await corpus.removeSourceFile({
      client_slug: 'humain-vc',
      domain_type: 'thesis',
      domain_slug: 'specialized-foundation-models',
      source_slug: added.source_slug,
    });

    expect(res.removed).toBe(true);
    expect(await exists(mdPath)).toBe(false); // markdown gone
    expect(await exists(pdfPath)).toBe(false); // binary sibling gone too
  });

  test('a domain retype moves the corpus folder and patches frontmatter (one client; the caller loops over the rest)', async () => {
    // Seed a strategy domain with an index and one source that references it.
    const client = 'reach-edu';
    const slug = 'retype-fs';
    const stratDir = join(root, client, 'corpus', 'strategies', slug);
    const srcDir = join(stratDir, 'sources');
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(stratDir, 'index.md'), `---\ntype: "strategy"\nslug: "${slug}"\n---\n\n# ${slug}\n`);
    await writeFile(join(srcDir, 'a-source.md'), `---\ndomains:\n  - "strategy:${slug}"\n---\n\nbody\n`);

    const res = await corpus.retypeDomainFiles({ client_slug: client, old_type: 'strategy', new_type: 'thesis', slug });

    expect(res.moved).toBe(true);
    // Folder physically moved strategies → theses.
    expect(await exists(stratDir)).toBe(false);
    const newDir = join(root, client, 'corpus', 'theses', slug);
    expect(await exists(newDir)).toBe(true);
    // index.md `type:` scalar patched.
    expect(await readFile(join(newDir, 'index.md'), 'utf8')).toContain('type: "thesis"');
    // the source's domains: ref rewritten strategy:slug → thesis:slug.
    const srcAfter = await readFile(join(newDir, 'sources', 'a-source.md'), 'utf8');
    expect(srcAfter).toContain(`"thesis:${slug}"`);
    expect(srcAfter).not.toContain(`"strategy:${slug}"`);
  });
});
