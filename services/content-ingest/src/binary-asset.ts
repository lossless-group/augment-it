// Binary-asset downloader. Plan: [[Download-PDFs-into-Corpus-Inbox]].
//
// Companion to fetchViaJina(): when the operator inboxes a URL whose
// canonical form is a binary (PDF first; docx/pptx/xlsx later), Jina's
// markdown extraction is the *index* into the content and the binary is
// the source of truth. This module fetches the binary so the inbox
// handler can write it alongside the .md.
//
// Probe ladder: HEAD → URL-suffix fallback → GET (with size cap +
// sha256). HEAD-first because servers that lie about Content-Type tend
// to do so on GET too, so paying a tiny extra round-trip beats GETing a
// 50MB PDF and then deciding to bail.

import { createHash } from 'node:crypto';

export type BinaryAssetOk = {
  ok: true;
  content_type: string;
  size_bytes: number;
  sha256: string;
  buffer: Buffer;
  status: 'ok' | 'size_capped';
};

export type BinaryAssetFail = {
  ok: false;
  status: 'http_error' | 'unsupported_type' | 'fetch_failed';
  error: string;
};

export type BinaryAssetResult = BinaryAssetOk | BinaryAssetFail;

export type DownloadBinaryAssetOptions = {
  max_bytes?: number;
  accepted_types?: string[];
};

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_ACCEPTED_TYPES = ['application/pdf'];

const SUFFIX_TO_TYPE: Record<string, string> = {
  '.pdf': 'application/pdf',
};

export async function downloadBinaryAsset(
  url: string,
  options: DownloadBinaryAssetOptions = {},
): Promise<BinaryAssetResult> {
  const max_bytes = options.max_bytes ?? DEFAULT_MAX_BYTES;
  const accepted_types = options.accepted_types ?? DEFAULT_ACCEPTED_TYPES;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, status: 'fetch_failed', error: 'invalid url' };
  }

  // Probe via HEAD. Some servers reject HEAD or lie; the URL-suffix
  // fallback below catches PDFs served with text/html or octet-stream.
  let probedType: string | null = null;
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (head.ok) {
      probedType = normalizeContentType(head.headers.get('content-type'));
    }
  } catch {
    // ignore — fall through to suffix detection
  }

  const suffixType = typeFromUrlSuffix(parsed);
  const resolvedType =
    probedType && accepted_types.includes(probedType)
      ? probedType
      : suffixType && accepted_types.includes(suffixType)
        ? suffixType
        : null;

  if (!resolvedType) {
    return {
      ok: false,
      status: 'unsupported_type',
      error: `content-type ${probedType ?? 'unknown'} (suffix ${suffixType ?? 'none'}) not in accepted_types`,
    };
  }

  let res: Response;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch (err) {
    return {
      ok: false,
      status: 'fetch_failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: 'http_error',
      error: `HTTP ${res.status} ${res.statusText}`,
    };
  }

  // Content-Length, when present, lets us bail before reading bytes.
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max_bytes) {
    return {
      ok: false,
      status: 'http_error',
      error: `size_capped: declared ${declared} > max_bytes ${max_bytes}`,
    };
  }

  // Stream so we can stop reading at the cap, rather than buffer first
  // and reject after (a 1GB PDF would still consume 1GB of memory).
  const reader = res.body?.getReader();
  if (!reader) {
    return { ok: false, status: 'fetch_failed', error: 'no response body' };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  let capped = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max_bytes) {
      capped = true;
      try { await reader.cancel(); } catch { /* noop */ }
      break;
    }
    chunks.push(value);
  }
  if (capped) {
    return {
      ok: false,
      status: 'http_error',
      error: `size_capped: streamed > max_bytes ${max_bytes}`,
    };
  }

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  // Prefer the server's content-type if it agrees with what we accepted;
  // otherwise the suffix-derived type stands.
  const finalType =
    probedType && accepted_types.includes(probedType) ? probedType : resolvedType;
  return {
    ok: true,
    content_type: finalType,
    size_bytes: buffer.byteLength,
    sha256,
    buffer,
    status: 'ok',
  };
}

function normalizeContentType(raw: string | null): string | null {
  if (!raw) return null;
  // strip any parameters like "; charset=utf-8"
  return raw.split(';')[0].trim().toLowerCase() || null;
}

function typeFromUrlSuffix(u: URL): string | null {
  // Hanover's hubfs URLs add tracking query params; strip them before
  // matching. We only care about the pathname's suffix.
  const path = u.pathname.toLowerCase();
  for (const [suffix, type] of Object.entries(SUFFIX_TO_TYPE)) {
    if (path.endsWith(suffix)) return type;
  }
  return null;
}

export function extensionFromContentType(content_type: string): string | null {
  for (const [suffix, type] of Object.entries(SUFFIX_TO_TYPE)) {
    if (type === content_type) return suffix;
  }
  return null;
}
