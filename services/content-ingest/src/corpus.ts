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
import { extensionFromContentType } from './binary-asset';

const CLIENTS_ROOT = process.env.CLIENTS_ROOT ?? '/clients';

export type AddCorpusArgs = {
  client_id: string;
  record_id: string;
  // The stable identity that survives record-set promotions. Optional
  // because legacy call sites may not supply it (and the writer
  // proceeds without — the reader degrades gracefully via row-store
  // lookup), but new call sites should pass it so the frontmatter
  // carries both keys and the reader doesn't need a row-store
  // round-trip per file.
  record_uuid?: string;
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

// Per [[Corpus-Inbox-Capture-and-Triage]] §Frontmatter schema. Lands at
// clients/<client_id>/corpus/inbox/<date>_<slug>.md with the extended
// captured_* + triaged_* sibling blocks. funder_slug is the literal
// string "inbox" and record_id / response_id are null until triage.
export type AddInboxArgs = {
  client_id: string;
  url: string;
  title: string;
  tags: string[];
  fetched_at: string;
  markdown_body: string;
  extra_metadata: Record<string, unknown>;
  captured_from: 'content-reader' | 'chat-verb' | 'chat-paste' | 'plugin' | 'inbox-direct';
  captured_note: string;            // empty string allowed
  captured_session_id: string;      // empty string allowed
  // Optional binary companion — when the source URL is a downloadable
  // binary (v1: PDF). When buffer is non-null the writer writes a
  // sibling file at `<slug>.<extension>`; when null (size_capped /
  // http_error / fetch_failed) the frontmatter still carries the
  // binary_asset block with download_status set so the operator can see
  // we tried.
  binary_asset?: {
    buffer: Buffer | null;
    content_type: string;
    size_bytes: number;
    sha256: string;
    downloaded_at: string;
    download_status: 'ok' | 'size_capped' | 'http_error' | 'unsupported_type' | 'fetch_failed';
  };
};

export type BinaryDownloadStatus =
  | 'ok'
  | 'size_capped'
  | 'http_error'
  | 'unsupported_type'
  | 'fetch_failed';

export type InboxWriteResult = {
  corpus_path: string;
  written_at: string;
  binary_asset?: {
    filename: string | null;
    size_bytes: number;
    sha256: string;
    sha256_short: string;
    download_status: BinaryDownloadStatus;
  } | null;
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

export async function addToInbox(args: AddInboxArgs): Promise<InboxWriteResult> {
  const baseDir = join(CLIENTS_ROOT, args.client_id, 'corpus', 'inbox');
  await mkdir(baseDir, { recursive: true });

  const datePart =
    args.fetched_at.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ??
    new Date().toISOString().slice(0, 10);
  const slug = slugify(args.title || args.url);
  let stem = `${datePart}_${slug}`;
  let mdFilename = `${stem}.md`;
  let mdTarget = join(baseDir, mdFilename);

  // The collision-suffix loop runs against the .md path; the binary
  // sibling reuses the resolved stem so the pair stays atomic.
  let tries = 0;
  while (await exists(mdTarget)) {
    const suffix = Math.random().toString(36).slice(2, 6);
    stem = `${datePart}_${slug}_${suffix}`;
    mdFilename = `${stem}.md`;
    mdTarget = join(baseDir, mdFilename);
    tries += 1;
    if (tries > 8) throw new Error('exhausted collision-suffix attempts');
  }

  // Resolve the binary companion (if any) so the frontmatter can name
  // its sibling filename.
  const binary = args.binary_asset ?? null;
  const ext = binary && binary.download_status === 'ok'
    ? extensionFromContentType(binary.content_type)
    : null;
  const binaryFilename = binary && binary.buffer && ext ? `${stem}${ext}` : null;

  const frontmatter = buildInboxFrontmatter(args, binaryFilename);
  const body = args.markdown_body.trim();
  const file = body.length === 0 ? `${frontmatter}\n` : `${frontmatter}\n${body}\n`;
  await writeFile(mdTarget, file, 'utf8');

  if (binary && binary.buffer && binaryFilename) {
    await writeFile(join(baseDir, binaryFilename), binary.buffer);
  }

  const written_at = new Date().toISOString();
  const corpus_path = mdTarget.replace(`${CLIENTS_ROOT}/`, '');
  const result: InboxWriteResult = { corpus_path, written_at };
  if (binary) {
    result.binary_asset = {
      filename: binaryFilename,
      size_bytes: binary.size_bytes,
      sha256: binary.sha256,
      sha256_short: binary.sha256.slice(0, 8),
      download_status: binary.download_status,
    };
  }
  return result;
}

function buildInboxFrontmatter(
  args: AddInboxArgs,
  binaryFilename: string | null,
): string {
  const lines: string[] = [];
  lines.push('---');
  lines.push(`title: ${yamlString(args.title)}`);
  lines.push(`exact_url: ${yamlString(args.url)}`);
  lines.push(`fetched_at: ${args.fetched_at}`);
  lines.push(`client_id: ${yamlString(args.client_id)}`);
  lines.push(`funder_slug: "inbox"`);
  lines.push(`record_id: null`);
  lines.push(`response_id: null`);
  lines.push(`pack_id: "inbox"`);
  if (args.tags.length === 0) {
    lines.push('tags: []');
  } else {
    lines.push('tags:');
    for (const t of args.tags) lines.push(`  - ${yamlString(t)}`);
  }
  // captured_* block — set at capture, immutable.
  lines.push(`inbox_status: "pending"`);
  lines.push(`captured_at: ${args.fetched_at}`);
  lines.push(`captured_from: ${yamlString(args.captured_from)}`);
  lines.push(`captured_note: ${yamlString(args.captured_note)}`);
  if (args.captured_session_id) {
    lines.push(`captured_session_id: ${yamlString(args.captured_session_id)}`);
  } else {
    lines.push(`captured_session_id: null`);
  }
  // triaged_* block — null until triage runs.
  lines.push(`triaged_at: null`);
  lines.push(`triaged_to: null`);
  lines.push(`triaged_by: null`);
  lines.push(`triaged_note: null`);
  // binary_asset block — present when the source URL is a downloadable
  // binary (v1: PDF). Even on failure (size_capped / http_error /
  // unsupported_type / fetch_failed) the block is emitted so the
  // operator can see "we tried and this is why we don't have it";
  // filename is null in the failure cases.
  if (args.binary_asset) {
    const ba = args.binary_asset;
    lines.push('binary_asset:');
    lines.push(`  filename: ${binaryFilename ? yamlString(binaryFilename) : 'null'}`);
    lines.push(`  content_type: ${yamlString(ba.content_type)}`);
    lines.push(`  size_bytes: ${ba.size_bytes}`);
    lines.push(`  sha256: ${yamlString(ba.sha256)}`);
    lines.push(`  downloaded_at: ${ba.downloaded_at}`);
    lines.push(`  download_status: ${yamlString(ba.download_status)}`);
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

export async function listForRecord(args: {
  client_id: string;
  record_id: string;
  // Optional row_id → record_uuid map (from row-store). When present
  // the reader joins by record_uuid lineage so files written under
  // an earlier record-set's row_id (the v8 → v9 case) still surface
  // for the same conceptual record. Without the map the reader
  // degrades to strict record_id match — the v0 behavior.
  record_uuid_by_row_id?: Map<string, string>;
}): Promise<CorpusEntry[]> {
  const root = join(CLIENTS_ROOT, args.client_id, 'corpus');
  const entries: CorpusEntry[] = [];
  const map = args.record_uuid_by_row_id;
  // Resolve the requested row_id to its record_uuid (if the map is
  // available + the row is known). When this is set, we match files
  // by record_uuid lineage; when it's not set, we fall back to
  // strict record_id match.
  const requestedUuid = map?.get(args.record_id) ?? null;
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
      const fileRecordId = typeof fm.record_id === 'string' ? fm.record_id : null;
      const fileRecordUuid = typeof fm.record_uuid === 'string' ? fm.record_uuid : null;
      // Match strategy, in order of cost:
      //   1. strict record_id match (cheapest; the v0 path).
      //   2. record_uuid stamped in the file matches the requested uuid
      //      (writes from this commit forward carry record_uuid).
      //   3. legacy file (no record_uuid stamp): resolve its record_id
      //      to a uuid via the map and compare to the requested uuid.
      //      This is what makes v8-era corpus files surface for v9 rows.
      let matches = false;
      if (fileRecordId === args.record_id) {
        matches = true;
      } else if (requestedUuid != null && fileRecordUuid === requestedUuid) {
        matches = true;
      } else if (requestedUuid != null && fileRecordId != null && map) {
        const fileResolvedUuid = map.get(fileRecordId);
        if (fileResolvedUuid != null && fileResolvedUuid === requestedUuid) {
          matches = true;
        }
      }
      if (!matches) continue;
      entries.push({
        corpus_path: path.replace(`${CLIENTS_ROOT}/`, ''),
        response_id: typeof fm.response_id === 'string' ? fm.response_id : null,
        record_id: fileRecordId,
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
  // record_uuid is the lineage-stable identity that survives
  // /promote-snapshot. New writers pass it; legacy files without it
  // are still findable because listForRecord resolves their
  // record_id → record_uuid via row-store at read time.
  if (args.record_uuid) {
    lines.push(`record_uuid: ${yamlString(args.record_uuid)}`);
  }
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
