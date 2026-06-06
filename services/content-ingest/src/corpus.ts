// Corpus markdown writer + reader. Spec: Funder-Content-Corpus-Workflow.md
// + Response-Reviewer-Shell-and-Content-Reader-Mode.md §Corpus markdown shape.
//
// Files land under:
//   /clients/<client_id>/corpus/<funder_slug>/<YYYY-MM-DD>_<title-slug>.md
//
// The /clients mount is a docker volume mapping to the host's clients/
// directory; each per-client repo (e.g. clients/reach-edu/) gets its own
// corpus/ subdirectory, and the operator commits via the per-client repo's
// git history.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CLIENTS_ROOT = process.env.CLIENTS_ROOT ?? '/clients';

export type AddCorpusArgs = {
  client_id: string;
  record_id: string;
  response_id: string;
  funder_slug: string;
  pack_id: string;
  title: string;
  tags: string[];
  exact_url: string;
  fetched_at: string;
  markdown_body: string;
  extra_metadata: Record<string, unknown>;
};

export type CorpusEntry = {
  corpus_path: string;
  response_id: string | null;
  record_id: string | null;
  exact_url: string;
  fetched_at: string;
  title: string;
  tags: string[];
};

export async function addToCorpus(
  args: AddCorpusArgs,
): Promise<{ corpus_path: string; written_at: string }> {
  const baseDir = join(CLIENTS_ROOT, args.client_id, 'corpus', args.funder_slug);
  await mkdir(baseDir, { recursive: true });

  const datePart =
    args.fetched_at.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ??
    new Date().toISOString().slice(0, 10);
  const slug = slugify(args.title);
  let filename = `${datePart}_${slug}.md`;
  let target = join(baseDir, filename);

  let tries = 0;
  while (await exists(target)) {
    const suffix = Math.random().toString(36).slice(2, 6);
    filename = `${datePart}_${slug}_${suffix}.md`;
    target = join(baseDir, filename);
    tries += 1;
    if (tries > 8) throw new Error('exhausted collision-suffix attempts');
  }

  const frontmatter = buildFrontmatter(args);
  const file = `${frontmatter}\n${args.markdown_body.trim()}\n`;
  await writeFile(target, file, 'utf8');

  const written_at = new Date().toISOString();
  const corpus_path = target.replace(`${CLIENTS_ROOT}/`, '');
  return { corpus_path, written_at };
}

export async function listForRecord(args: {
  client_id: string;
  record_id: string;
}): Promise<CorpusEntry[]> {
  const root = join(CLIENTS_ROOT, args.client_id, 'corpus');
  const entries: CorpusEntry[] = [];
  let funderDirs: string[];
  try {
    funderDirs = (await readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  for (const funder of funderDirs) {
    const dir = join(root, funder);
    const files = (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith('.md'))
      .map((d) => d.name);
    for (const f of files) {
      const path = join(dir, f);
      const raw = await readFile(path, 'utf8');
      const fm = parseFrontmatter(raw);
      if (!fm) continue;
      if (fm.record_id !== args.record_id) continue;
      entries.push({
        corpus_path: path.replace(`${CLIENTS_ROOT}/`, ''),
        response_id: typeof fm.response_id === 'string' ? fm.response_id : null,
        record_id: typeof fm.record_id === 'string' ? fm.record_id : null,
        exact_url: typeof fm.exact_url === 'string' ? fm.exact_url : '',
        fetched_at: typeof fm.fetched_at === 'string' ? fm.fetched_at : '',
        title: typeof fm.title === 'string' ? fm.title : '',
        tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
      });
    }
  }
  return entries;
}

function buildFrontmatter(args: AddCorpusArgs): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`title: ${yamlString(args.title)}`);
  lines.push(`exact_url: ${yamlString(args.exact_url)}`);
  lines.push(`fetched_at: ${args.fetched_at}`);
  lines.push(`record_id: ${yamlString(args.record_id)}`);
  lines.push(`response_id: ${yamlString(args.response_id)}`);
  lines.push(`client_id: ${yamlString(args.client_id)}`);
  lines.push(`funder_slug: ${yamlString(args.funder_slug)}`);
  lines.push(`pack_id: ${yamlString(args.pack_id)}`);
  if (args.tags.length === 0) {
    lines.push('tags: []');
  } else {
    lines.push('tags:');
    for (const t of args.tags) lines.push(`  - ${yamlString(t)}`);
  }
  const extraYaml = renderExtraMetadata(args.extra_metadata, 2);
  if (extraYaml.length === 0) {
    lines.push('extra_metadata: {}');
  } else {
    lines.push('extra_metadata:');
    lines.push(...extraYaml);
  }
  lines.push('---');
  return lines.join('\n');
}

function renderExtraMetadata(obj: Record<string, unknown>, indent: number): string[] {
  const lines: string[] = [];
  const pad = ' '.repeat(indent);
  for (const [key, val] of Object.entries(obj)) {
    if (val == null) continue;
    if (typeof val === 'object' && !Array.isArray(val)) {
      const nested = renderExtraMetadata(val as Record<string, unknown>, indent + 2);
      if (nested.length === 0) lines.push(`${pad}${key}: {}`);
      else {
        lines.push(`${pad}${key}:`);
        lines.push(...nested);
      }
    } else if (Array.isArray(val)) {
      if (val.length === 0) lines.push(`${pad}${key}: []`);
      else {
        lines.push(`${pad}${key}:`);
        for (const v of val) lines.push(`${pad}  - ${yamlString(String(v))}`);
      }
    } else {
      lines.push(`${pad}${key}: ${yamlString(String(val))}`);
    }
  }
  return lines;
}

function yamlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

function parseFrontmatter(raw: string): Record<string, unknown> | null {
  if (!raw.startsWith('---')) return null;
  const end = raw.indexOf('\n---', 3);
  if (end < 0) return null;
  const block = raw.slice(3, end).trim();
  const out: Record<string, unknown> = {};
  let pendingKey: string | null = null;
  for (const line of block.split('\n')) {
    if (line.startsWith('  - ')) {
      if (pendingKey && Array.isArray(out[pendingKey])) {
        (out[pendingKey] as string[]).push(unquote(line.slice(4).trim()));
      }
      continue;
    }
    const m = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
    if (!m) continue;
    const [, key, rest] = m;
    if (rest === '' || rest === '[]') {
      out[key] = [];
      pendingKey = key;
    } else if (rest === '{}') {
      out[key] = {};
      pendingKey = null;
    } else {
      out[key] = unquote(rest.trim());
      pendingKey = null;
    }
  }
  return out;
}

function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  return s;
}
