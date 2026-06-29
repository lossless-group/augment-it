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

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { downloadBinaryAsset, extensionFromContentType } from './binary-asset';
import { fetchViaJina } from './jina';

const execFileP = promisify(execFile);

// Compress an uploaded PDF with Ghostscript (/ebook ≈ 150dpi, screen-readable).
// Stores the SMALLER of (compressed, original) at finalPath. Falls back to the
// original if gs is missing, errors, or produces a larger file. Non-PDFs and
// small PDFs (< 3MB) skip this entirely.
async function storePdfCompressed(buffer: Buffer, finalPath: string): Promise<{ stored_bytes: number; original_bytes: number; compressed: boolean }> {
  const original_bytes = buffer.length;
  const tmpPath = `${finalPath}.upload`;
  await writeFile(tmpPath, buffer);
  try {
    await execFileP(
      'gs',
      [
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/ebook',
        '-dDetectDuplicateImages=true',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        `-sOutputFile=${finalPath}`,
        tmpPath,
      ],
      { timeout: 180_000 },
    );
    const out = await stat(finalPath).catch(() => null);
    if (out && out.size > 0 && out.size < original_bytes) {
      await rm(tmpPath).catch(() => {});
      return { stored_bytes: out.size, original_bytes, compressed: true };
    }
  } catch {
    // gs absent or failed — keep the original below
  }
  await rename(tmpPath, finalPath); // overwrite any partial gs output with the original
  return { stored_bytes: original_bytes, original_bytes, compressed: false };
}

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
  const { extra, publishedAt } = liftPublishedAt(args.extra_metadata);
  lines.push('---');
  lines.push(`title: ${yamlString(args.title)}`);
  lines.push(`exact_url: ${yamlString(args.url)}`);
  lines.push(`fetched_at: ${args.fetched_at}`);
  if (publishedAt) lines.push(`published_at: ${yamlString(publishedAt)}`);
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
  const extraYaml = renderExtraMetadata(extra, 2);
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
  // The requested row's corpus_funder_slug column (from the records
  // sheet). When present, this is the primary join: scan only
  // `corpus/<slug>/` and treat every .md file in that dir as belonging
  // to this row. Per-funder dirs are 1:1 with rows by convention and
  // the operator controls the slug cell directly — so this column IS
  // the override surface. The full-walk + lineage path below stays as
  // the fallback for rows without a slug. This also dissolves a
  // 5s-timeout race: full-walk reads ~300 files, slug-walk reads a
  // dozen, so the 96-row lens fan-out no longer blows the workspace
  // capability's default timeout.
  corpus_funder_slug?: string;
}): Promise<CorpusEntry[]> {
  const root = join(CLIENTS_ROOT, args.client_id, 'corpus');
  const entries: CorpusEntry[] = [];
  const map = args.record_uuid_by_row_id;
  const slug = typeof args.corpus_funder_slug === 'string' && args.corpus_funder_slug.trim() !== ''
    ? args.corpus_funder_slug.trim()
    : null;
  // Resolve the requested row_id to its record_uuid (used by the
  // lineage-fallback path; ignored when slug pins us to a single dir).
  const requestedUuid = map?.get(args.record_id) ?? null;
  let funderDirs: string[];
  if (slug) {
    // Slug-primary: scan only this one directory.
    funderDirs = [slug];
  } else {
    try {
      funderDirs = (await readdir(root, { withFileTypes: true }))
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }
  for (const funder of funderDirs) {
    const dir = join(root, funder);
    let files: string[];
    try {
      files = (await readdir(dir, { withFileTypes: true }))
        .filter((d) => d.isFile() && d.name.endsWith('.md'))
        .map((d) => d.name);
    } catch (err) {
      // Slug points at a dir with no files on disk yet — empty result.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    for (const f of files) {
      const path = join(dir, f);
      const raw = await readFile(path, 'utf8');
      const fm = parseFrontmatter(raw);
      if (!fm) continue;
      const fileRecordId = typeof fm.record_id === 'string' ? fm.record_id : null;
      const fileRecordUuid = typeof fm.record_uuid === 'string' ? fm.record_uuid : null;
      // Match strategy:
      //   0. slug match (operator's explicit assertion via the records
      //      sheet — every file in this dir belongs to this row).
      //      Bypasses the record_id/record_uuid checks because the
      //      slug cell IS the override surface.
      //   1. strict record_id match (legacy path).
      //   2. record_uuid stamped in the file matches the requested uuid.
      //   3. legacy file (no record_uuid stamp): resolve its record_id
      //      via the map and compare to the requested uuid.
      let matches = false;
      if (slug) {
        matches = true;
      } else if (fileRecordId === args.record_id) {
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

// --- domain index.md (a typed grouping's definition file) ------------------
// A "domain" is a typed grouping (type ∈ strategy | topic | thesis | …). Its
// index.md lands at clients/<client_slug>/corpus/<type-plural>/<slug>/index.md.
// Idempotent: an existing authored body is preserved (never clobbered). The
// folder is created here — the filesystem home of the domain.
// See context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md.

// type → corpus folder (plural). Irregular plurals handled explicitly; fallback +s.
const DOMAIN_FOLDERS: Record<string, string> = {
  strategy: 'strategies',
  topic: 'topics',
  thesis: 'theses',
  category: 'categories',
  'market-segment': 'market-segments',
};
function domainFolder(type: string): string {
  return DOMAIN_FOLDERS[type] ?? `${type}s`;
}

export type DomainIndexArgs = {
  client_slug: string;
  type: string;
  slug: string;
  title: string;
  client_slugs: string[];
  tags: string[];
  created_at: string; // YYYY-MM-DD
};

export async function addDomainIndex(args: DomainIndexArgs): Promise<{ corpus_path: string; created: boolean }> {
  const dir = join(CLIENTS_ROOT, args.client_slug, 'corpus', domainFolder(args.type), args.slug);
  await mkdir(dir, { recursive: true });
  const target = join(dir, 'index.md');
  const corpus_path = target.replace(`${CLIENTS_ROOT}/`, '');

  // idempotent — don't clobber an authored definition if the file exists
  try {
    await readFile(target, 'utf8');
    return { corpus_path, created: false };
  } catch {
    // not present — write it
  }

  const fm = buildDomainFrontmatter(args);
  const body = `# ${args.title}\n\n<!-- Definition / statement of the case for this ${args.type}. -->\n`;
  await writeFile(target, `${fm}\n\n${body}`, 'utf8');
  return { corpus_path, created: true };
}

function buildDomainFrontmatter(args: DomainIndexArgs): string {
  const lines: string[] = ['---'];
  lines.push(`type: ${yamlString(args.type)}`);
  lines.push(`slug: ${yamlString(args.slug)}`);
  lines.push(`title: ${yamlString(args.title)}`);
  if (args.client_slugs.length === 0) {
    lines.push('client_slugs: []');
  } else {
    lines.push('client_slugs:');
    for (const c of args.client_slugs) lines.push(`  - ${yamlString(c)}`);
  }
  if (args.tags.length === 0) {
    lines.push('tags: []');
  } else {
    lines.push('tags:');
    for (const t of args.tags) lines.push(`  - ${yamlString(t)}`);
  }
  lines.push(`created_at: ${yamlString(args.created_at)}`);
  lines.push('---');
  return lines.join('\n');
}

// --- per-source files (the sources a domain gathers) ----------------------
// Land at clients/<client>/corpus/<type-plural>/<domain-slug>/sources/<source-slug>.md.
// source.add writes a METADATA-ONLY file (Jina title + excerpt, # Extracts skeleton);
// source.fetch later pulls the full body + PDF sibling. Idempotent on the slug.

export type AddSourceFileArgs = {
  client_slug: string;
  domain_type: string;
  domain_slug: string;
  source_uuid: string;
  url: string;
  normalized_url?: string;
};

function sourceExcerpt(markdown: string): string {
  const body = markdown
    .replace(/^Title:\s*.+$/gim, '')
    .replace(/^URL Source:\s*.+$/gim, '')
    .replace(/^Published Time:\s*.+$/gim, '')
    .replace(/^Markdown Content:\s*$/gim, '')
    .trim();
  if (body.length <= 400) return body;
  return body.slice(0, 400).replace(/\s+\S*$/, '') + '…';
}

const EXTRACTS_SKELETON = '# Extracts\n\n## Quotes\n\n## Stats\n\n## References\n\n## Mentions\n';

export async function addSourceFile(
  args: AddSourceFileArgs,
): Promise<{ corpus_path: string; source_slug: string; title: string; excerpt: string; status: string; created: boolean }> {
  // Jina metadata fetch — title + a short excerpt. We store metadata-only here;
  // the full body lands on source.fetch.
  let title = args.url;
  let excerpt = '';
  const jr = await fetchViaJina(args.url);
  if (jr.ok) {
    title = jr.title || args.url;
    excerpt = sourceExcerpt(jr.markdown);
  }
  const source_slug = slugify(title) || slugify(args.url) || args.source_uuid.slice(0, 8);
  const dir = join(CLIENTS_ROOT, args.client_slug, 'corpus', domainFolder(args.domain_type), args.domain_slug, 'sources');
  await mkdir(dir, { recursive: true });
  const target = join(dir, `${source_slug}.md`);
  const corpus_path = target.replace(`${CLIENTS_ROOT}/`, '');

  try {
    await readFile(target, 'utf8');
    return { corpus_path, source_slug, title, excerpt, status: 'metadata-only', created: false };
  } catch {
    // not present — write it
  }

  const fm = buildSourceFrontmatter({ ...args, title, status: 'metadata-only', content_pulled: false });
  const body = excerpt ? `${excerpt}\n\n` : '';
  await writeFile(target, `${fm}\n\n${body}${EXTRACTS_SKELETON}`, 'utf8');
  return { corpus_path, source_slug, title, excerpt, status: 'metadata-only', created: true };
}

function buildSourceFrontmatter(args: {
  source_uuid: string;
  url: string;
  normalized_url?: string;
  title: string;
  domain_type: string;
  domain_slug: string;
  status: string;
  content_pulled: boolean;
  binary_filename?: string | null;
  tags?: string[];
}): string {
  const lines: string[] = ['---'];
  lines.push(`source_uuid: ${yamlString(args.source_uuid)}`);
  lines.push(`url: ${yamlString(args.url)}`);
  if (args.normalized_url) lines.push(`normalized_url: ${yamlString(args.normalized_url)}`);
  lines.push(`title: ${yamlString(args.title)}`);
  lines.push('domains:');
  lines.push(`  - ${yamlString(`${args.domain_type}:${args.domain_slug}`)}`);
  lines.push(`status: ${yamlString(args.status)}`);
  lines.push(`content_pulled: ${args.content_pulled}`);
  lines.push(renderTagsBlock(args.tags ?? []));
  if (args.binary_filename) {
    lines.push('binary_asset:');
    lines.push(`  filename: ${yamlString(args.binary_filename)}`);
  }
  lines.push(`fetched_at: ${yamlString(new Date().toISOString())}`);
  lines.push('---');
  return lines.join('\n');
}

// source.fetch — pull the FULL body via Jina (and a PDF sibling if applicable),
// (re)write the per-source file, preserving any # Extracts the analyst already
// added. Self-sufficient: works whether or not a metadata-only file exists yet
// (so it also rescues sources added before source.add fetched metadata).
export type FetchSourceArgs = {
  client_slug: string;
  domain_type: string;
  domain_slug: string;
  source_uuid: string;
  url: string;
  source_slug?: string;
  no_cache?: boolean; // retry → bypass Jina's cached snapshot
};

export async function fetchSourceContent(
  args: FetchSourceArgs,
): Promise<{ corpus_path: string; source_slug: string; title: string; content_pulled: boolean; via: string; binary_filename: string | null }> {
  const jr = await fetchViaJina(args.url, { noCache: args.no_cache });
  const title = jr.ok ? jr.title || args.url : args.url;
  const fullMd = jr.ok ? jr.markdown.trim() : '';
  const source_slug = args.source_slug || slugify(title) || slugify(args.url) || args.source_uuid.slice(0, 8);
  const dir = join(CLIENTS_ROOT, args.client_slug, 'corpus', domainFolder(args.domain_type), args.domain_slug, 'sources');
  await mkdir(dir, { recursive: true });
  const target = join(dir, `${source_slug}.md`);
  const corpus_path = target.replace(`${CLIENTS_ROOT}/`, '');

  // PDF sibling (same basename) if the URL is a PDF
  let binary_filename: string | null = null;
  const bin = await downloadBinaryAsset(args.url);
  if (bin.ok && (bin.content_type || '').includes('pdf')) {
    const ext = extensionFromContentType(bin.content_type) ?? '.pdf';
    binary_filename = `${source_slug}${ext}`;
    await writeFile(join(dir, binary_filename), bin.buffer);
  }

  // preserve any existing # Extracts section + analyst tags across the rewrite
  let extractsSection = EXTRACTS_SKELETON;
  let existingTags: string[] = [];
  try {
    const existing = await readFile(target, 'utf8');
    const idx = existing.indexOf('# Extracts');
    if (idx >= 0) extractsSection = existing.slice(idx);
    existingTags = parseTagsFromFrontmatter(existing);
  } catch {
    // fresh — use the skeleton
  }

  const fm = buildSourceFrontmatter({
    source_uuid: args.source_uuid,
    url: args.url,
    title,
    domain_type: args.domain_type,
    domain_slug: args.domain_slug,
    status: 'fetched',
    content_pulled: jr.ok,
    binary_filename,
    tags: existingTags,
  });
  await writeFile(target, `${fm}\n\n# ${title}\n\n${fullMd}\n\n${extractsSection.trimStart()}`, 'utf8');
  return { corpus_path, source_slug, title, content_pulled: jr.ok, via: jr.ok ? 'jina' : 'none', binary_filename };
}

// source.remove — delete a source's per-source file (+ any binary sibling).
export type SourceFileRef = { client_slug: string; domain_type: string; domain_slug: string; source_slug: string };

export async function removeSourceFile(args: SourceFileRef): Promise<{ corpus_path: string; removed: boolean }> {
  const dir = join(CLIENTS_ROOT, args.client_slug, 'corpus', domainFolder(args.domain_type), args.domain_slug, 'sources');
  const target = join(dir, `${args.source_slug}.md`);
  const corpus_path = target.replace(`${CLIENTS_ROOT}/`, '');
  let removed = false;
  try {
    await rm(target);
    removed = true;
  } catch {
    // already gone
  }
  for (const ext of ['.pdf', '.docx', '.pptx', '.xlsx']) {
    try {
      await rm(join(dir, `${args.source_slug}${ext}`));
    } catch {
      // no sibling of this type
    }
  }
  return { corpus_path, removed };
}

// source.update — patch frontmatter fields (title / publisher / published_date) on
// a source file. The filename (source_slug) is NOT renamed on a title edit — the
// slug is the stable id, the title is display. Scoped to the frontmatter block.
export type UpdateSourceArgs = SourceFileRef & { fields: Record<string, string>; tags?: string[] };

// Render a frontmatter `tags:` block (Train-Case list, or `tags: []` when empty).
function renderTagsBlock(tags: string[]): string {
  if (!tags.length) return 'tags: []';
  return ['tags:', ...tags.map((t) => `  - ${yamlString(t)}`)].join('\n');
}

// Pull the tags list out of a frontmatter string (handles both `tags: []` inline
// and the indented `- item` block form). Used to preserve analyst tags across a
// re-fetch that would otherwise rewrite the file from scratch.
function parseTagsFromFrontmatter(content: string): string[] {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  const block = fm[1].match(/^tags:(.*)((?:\n[ \t]+-.*)*)/m);
  if (!block) return [];
  if (block[1].trim().startsWith('[')) {
    const inner = block[1].trim().replace(/^\[|\]$/g, '').trim();
    return inner ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : [];
  }
  return (block[2].match(/-\s*(.+)/g) ?? []).map((l) => l.replace(/^-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

export async function updateSourceFile(args: UpdateSourceArgs): Promise<{ corpus_path: string; updated: boolean; source_slug: string }> {
  const dir = join(CLIENTS_ROOT, args.client_slug, 'corpus', domainFolder(args.domain_type), args.domain_slug, 'sources');
  const oldSlug = args.source_slug;
  const oldTarget = join(dir, `${oldSlug}.md`);
  let content = '';
  try {
    content = await readFile(oldTarget, 'utf8');
  } catch {
    return { corpus_path: oldTarget.replace(`${CLIENTS_ROOT}/`, ''), updated: false, source_slug: oldSlug };
  }
  const m = content.match(/^(---\n)([\s\S]*?)(\n---\n)([\s\S]*)$/);
  if (!m) return { corpus_path: oldTarget.replace(`${CLIENTS_ROOT}/`, ''), updated: false, source_slug: oldSlug };

  // `slug` is a rename directive, not a frontmatter field — split it out.
  const { slug: explicitSlug, ...fields } = args.fields;

  // Renaming: an explicit slug wins; otherwise a title edit re-slugs the file
  // so it stops being stuck on a junk interstitial name (e.g. "just-a-moment"
  // from a Cloudflare challenge, "preparing-to-download" from a PMC anti-bot
  // page). Either way the filename follows the operator's intent.
  let newSlug = oldSlug;
  if (typeof explicitSlug === 'string' && explicitSlug.trim()) {
    const candidate = slugify(explicitSlug);
    if (candidate) newSlug = candidate;
  } else if (typeof fields.title === 'string' && fields.title.trim()) {
    const candidate = slugify(fields.title);
    if (candidate && candidate !== oldSlug) newSlug = candidate;
  }

  let fm = m[2];
  for (const [k, v] of Object.entries(fields)) {
    const line = `${k}: ${yamlString(v)}`;
    const re = new RegExp(`^${k}:.*$`, 'm');
    fm = re.test(fm) ? fm.replace(re, line) : `${fm}\n${line}`;
  }
  // tags arrive as a whole array (not a scalar field) — rewrite the tags block
  if (Array.isArray(args.tags)) {
    const block = renderTagsBlock(args.tags);
    const re = /^tags:.*(?:\n[ \t]+-.*)*/m;
    fm = re.test(fm) ? fm.replace(re, block) : `${fm}\n${block}`;
  }
  // keep the binary_asset filename pointer aligned with the renamed slug
  if (newSlug !== oldSlug) fm = fm.replaceAll(`${oldSlug}.`, `${newSlug}.`);

  const newTarget = join(dir, `${newSlug}.md`);
  await writeFile(newTarget, `${m[1]}${fm}${m[3]}${m[4]}`, 'utf8');
  if (newTarget !== oldTarget) {
    await rm(oldTarget).catch(() => {});
    for (const ext of ['.pdf', '.docx', '.pptx', '.xlsx']) {
      try {
        await rename(join(dir, `${oldSlug}${ext}`), join(dir, `${newSlug}${ext}`));
      } catch {
        // no sibling of this type
      }
    }
  }
  return { corpus_path: newTarget.replace(`${CLIENTS_ROOT}/`, ''), updated: true, source_slug: newSlug };
}

// Attach a locally-downloaded file (the operator pulled it themselves because
// the report's PDF is paywalled / anti-bot, or lives at a URL different from the
// source's citation page). The source's identity stays its profile URL; this
// just hangs the bytes underneath it as sources/<source_slug>.<ext> and marks
// the source fetched. The file rides in base64 over the same WS→NATS path the
// app already uses for CSV uploads (subject to NATS max_payload).
export type AttachFileArgs = SourceFileRef & {
  filename: string;
  content_base64: string;
  content_type?: string;
};

export async function attachSourceFile(args: AttachFileArgs): Promise<{ corpus_path: string; binary_filename: string; bytes: number; original_bytes: number; compressed: boolean; updated: boolean }> {
  const dir = join(CLIENTS_ROOT, args.client_slug, 'corpus', domainFolder(args.domain_type), args.domain_slug, 'sources');
  const mdTarget = join(dir, `${args.source_slug}.md`);
  const corpus_path = mdTarget.replace(`${CLIENTS_ROOT}/`, '');
  const buffer = Buffer.from(args.content_base64, 'base64');

  // Match the binary basename to the source slug (so it renames with the source).
  const dot = args.filename.lastIndexOf('.');
  const ext = dot > 0 ? args.filename.slice(dot).toLowerCase() : (args.content_type ? extensionFromContentType(args.content_type) ?? '.pdf' : '.pdf');
  const binary_filename = `${args.source_slug}${ext}`;
  const finalPath = join(dir, binary_filename);
  await mkdir(dir, { recursive: true });

  // PDFs over 3MB get Ghostscript-compressed on the way to disk; everything else
  // is stored verbatim.
  let stored_bytes = buffer.length;
  let original_bytes = buffer.length;
  let compressed = false;
  if (ext === '.pdf' && buffer.length > 3_000_000) {
    const res = await storePdfCompressed(buffer, finalPath);
    stored_bytes = res.stored_bytes;
    original_bytes = res.original_bytes;
    compressed = res.compressed;
  } else {
    await writeFile(finalPath, buffer);
  }
  const sha256 = createHash('sha256').update(await readFile(finalPath)).digest('hex');

  // Patch the .md frontmatter to fetched + a fresh binary_asset block, preserving
  // the body and any # Extracts the analyst already wrote.
  let content = '';
  try {
    content = await readFile(mdTarget, 'utf8');
  } catch {
    return { corpus_path, binary_filename, bytes: stored_bytes, original_bytes, compressed, updated: false };
  }
  const m = content.match(/^(---\n)([\s\S]*?)(\n---\n)([\s\S]*)$/);
  if (!m) return { corpus_path, binary_filename, bytes: stored_bytes, original_bytes, compressed, updated: false };

  let fm = m[2];
  // Drop any prior binary_asset block + the scalars we're about to reset.
  fm = fm.replace(/^binary_asset:\n(?:[ \t]+.*\n?)*/m, '');
  fm = fm.replace(/^status:.*$\n?/m, '').replace(/^content_pulled:.*$\n?/m, '');
  fm = fm.replace(/\n{2,}/g, '\n').replace(/\n+$/, '');
  const block = [
    `status: ${yamlString('fetched')}`,
    'content_pulled: true',
    'binary_asset:',
    `  filename: ${yamlString(binary_filename)}`,
    `  content_type: ${yamlString(args.content_type || 'application/octet-stream')}`,
    `  bytes: ${stored_bytes}`,
    `  original_bytes: ${original_bytes}`,
    `  compressed: ${compressed}`,
    `  sha256: ${yamlString(sha256)}`,
    `  source: ${yamlString('upload')}`,
  ].join('\n');
  await writeFile(mdTarget, `${m[1]}${fm}\n${block}${m[3]}${m[4]}`, 'utf8');
  return { corpus_path, binary_filename, bytes: stored_bytes, original_bytes, compressed, updated: true };
}

// extract.add — append a pasted extract under the right ## heading in a source file.
export type AppendExtractArgs = {
  client_slug: string;
  domain_type: string;
  domain_slug: string;
  source_slug: string;
  kind: string; // Quotes | Stats | References | Mentions
  text: string;
};

export async function appendExtract(args: AppendExtractArgs): Promise<{ corpus_path: string }> {
  const dir = join(CLIENTS_ROOT, args.client_slug, 'corpus', domainFolder(args.domain_type), args.domain_slug, 'sources');
  const target = join(dir, `${args.source_slug}.md`);
  const corpus_path = target.replace(`${CLIENTS_ROOT}/`, '');
  let content = '';
  try {
    content = await readFile(target, 'utf8');
  } catch {
    throw new Error('source file not found — add or fetch the source first');
  }
  const text = args.text.trim();
  if (!text) return { corpus_path };
  const heading = `## ${args.kind}`;
  const lines = content.split('\n');
  const i = lines.findIndex((l) => l.trim() === heading);
  if (i < 0) {
    content = content.trimEnd() + `\n\n${heading}\n\n${text}\n`;
  } else {
    lines.splice(i + 1, 0, '', text);
    content = lines.join('\n');
  }
  await writeFile(target, content, 'utf8');
  return { corpus_path };
}

function buildFrontmatter(args: AddCorpusArgs): string {
  const lines: string[] = [];
  // published_at is lifted from extra_metadata when present (see jina.ts
  // preamble parse). It's the source content's authored date — distinct
  // from fetched_at (when WE pulled it). Lifted to top-level because
  // sort/filter UIs read it as a first-class field, not metadata
  // miscellany. Removed from the extra block to avoid duplication.
  const { extra, publishedAt } = liftPublishedAt(args.extra_metadata);
  lines.push('---');
  lines.push(`title: ${yamlString(args.title)}`);
  lines.push(`exact_url: ${yamlString(args.exact_url)}`);
  lines.push(`fetched_at: ${args.fetched_at}`);
  if (publishedAt) lines.push(`published_at: ${yamlString(publishedAt)}`);
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
  const extraYaml = renderExtraMetadata(extra, 2);
  if (extraYaml.length === 0) {
    lines.push('extra_metadata: {}');
  } else {
    lines.push('extra_metadata:');
    lines.push(...extraYaml);
  }
  lines.push('---');
  return lines.join('\n');
}

function liftPublishedAt(extra: Record<string, unknown>): {
  extra: Record<string, unknown>;
  publishedAt: string | null;
} {
  const raw = extra?.published_at;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { extra, publishedAt: null };
  }
  const { published_at: _drop, ...rest } = extra;
  return { extra: rest, publishedAt: raw.trim() };
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
