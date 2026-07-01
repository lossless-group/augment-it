#!/usr/bin/env node
// ============================================================================
// decile-import-voicenotes.mjs
//
// Match a folder of per-person markdown "voice note" files (Apple Voice Memo
// transcripts, one .md per LP, named `First-Last.md`) against the prospects in
// a Decile Hub investor pipeline, and append each transcript as a NOTE on the
// matched pipeline prospect.
//
// WHY name-matching: Apple Voice Memos carry no email. The filename is the only
// identity we have — but it's typed by hand and is reliable. Decile prospects
// DO carry email; once we match by name we recover everything else.
//
// Connection: reads the per-client .env (clients/<slug>/.env) for
//   DECILE_API_URL / DECILE_HUB_API_KEY  (falls back to the legacy aliases
//   DECILE_API_BASE_URL / DECILE_API_KEY). Token is sent RAW (no Bearer).
//   See the decile-hub-connector skill + clients/humain-vc/inputs/decilehub/
//   202506_decilehub-docs_swagger.yaml for the authoritative contract.
//
// Usage:
//   node scripts/decile-import-voicenotes.mjs                 # DRY RUN (default)
//   node scripts/decile-import-voicenotes.mjs --apply         # actually append notes
//   node scripts/decile-import-voicenotes.mjs --pipeline "Fund I"
//   node scripts/decile-import-voicenotes.mjs --client humain-vc \
//        --dir clients/humain-vc/inputs/2026-06-11_Aneil-VoiceNotes
//
// Flags:
//   --client <slug>   tenant whose .env to load          (default: humain-vc)
//   --dir <path>      folder of *.md voice notes          (default: the Aneil set)
//   --pipeline <q>    pipeline id OR name-substring        (default: "Fund I")
//   --apply           append notes for real (omit = dry run, mutates nothing)
//   --verbose         print each transcript body in the report
//   --help
//
// Behavior:
//   - Resolves the target investor pipeline (name-substring or id).
//   - Indexes every prospect in that pipeline by normalized full name.
//   - For each .md: derive the name from the filename, normalize, match.
//       exact match          -> queued to append
//       unique last-name only -> reported as a SUGGESTION (never auto-applied)
//       none / multiple      -> reported for human review
//   - Each appended note is prefixed with a stable marker
//       [voice-note:<recording-date>:<file-slug>]
//     so re-running is IDEMPOTENT — a prospect that already carries that marker
//     is skipped, never duplicated. (Additive enrichment, never overwrite.)
//   - Stage is REPORT-ONLY: we show the prospect's current Decile stage next to
//     the note; we do NOT move stages (that's a human decision).
// ============================================================================

import { readdir, readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';

const DEFAULTS = {
  client: 'humain-vc',
  dir: 'clients/humain-vc/inputs/2026-06-11_Aneil-VoiceNotes',
  pipeline: 'Fund I',
};

function parseArgs(argv) {
  const out = { ...DEFAULTS, apply: false, verbose: false, aliases: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--client') { out.client = argv[++i]; }
    else if (a === '--dir') { out.dir = argv[++i]; }
    else if (a === '--pipeline') { out.pipeline = argv[++i]; }
    else if (a === '--alias') { out.aliases.push(argv[++i]); }  // "File Name=Decile Name" (repeatable)
    else if (a === '--apply') { out.apply = true; }
    else if (a === '--verbose') { out.verbose = true; }
    else if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

// Build a norm(filename-name) -> decile-name map from --alias flags and, if
// present, an aliases.json in the notes dir ({ "Stacey Hock": "Stacy Hock" }).
// Aliases redirect the name we look up in Decile; the note's idempotency marker
// still keys off the SOURCE filename, so re-runs stay safe.
async function loadAliases(dir, flagAliases) {
  const map = new Map();
  for (const spec of flagAliases) {
    const eq = spec.indexOf('=');
    if (eq > 0) map.set(norm(spec.slice(0, eq)), spec.slice(eq + 1).trim());
  }
  try {
    const raw = await readFile(join(dir, 'aliases.json'), 'utf8');
    for (const [src, dst] of Object.entries(JSON.parse(raw))) map.set(norm(src), dst);
  } catch { /* no aliases.json — fine */ }
  return map;
}

// ── env loading (no dotenv dep; parse the per-client .env ourselves) ────────
async function loadClientEnv(client) {
  const path = join('clients', client, '.env');
  let raw;
  try { raw = await readFile(path, 'utf8'); }
  catch { throw new Error(`Cannot read ${path} — is the client slug right?`); }
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const baseUrl = (env.DECILE_API_URL || env.DECILE_API_BASE_URL || '').replace(/\/+$/, '');
  const token = env.DECILE_HUB_API_KEY || env.DECILE_API_KEY || '';
  if (!baseUrl) throw new Error(`No DECILE_API_URL in ${path}`);
  if (!token) throw new Error(`No DECILE_HUB_API_KEY in ${path}`);
  return { baseUrl, token };
}

// ── tiny Decile client (raw token; handles wrapped + bare error shapes) ─────
function makeClient({ baseUrl, token }) {
  const h = { Authorization: token, Accept: 'application/json' };
  async function req(method, path, body) {
    const init = { method, headers: { ...h } };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    const res = await fetch(`${baseUrl}/api/v1/${path.replace(/^\/+/, '')}`, init);
    const text = await res.text();
    const json = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const e = json?.error;
      const msg = e && typeof e === 'object' ? (e.message || JSON.stringify(e)) : (typeof e === 'string' ? e : text);
      throw new Error(`HTTP ${res.status} ${method} ${path} — ${msg}`);
    }
    return json;
  }
  return {
    get: (p) => req('GET', p),
    post: (p, b) => req('POST', p, b),
  };
}
function safeJson(t) { try { return JSON.parse(t); } catch { return { _raw: t }; } }

// ── name normalization (diacritics out, lowercase, punctuation→space) ───────
const norm = (s) => (s || '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const lastName = (s) => { const p = norm(s).split(' '); return p[p.length - 1] || ''; };

// ── frontmatter + body split ────────────────────────────────────────────────
function parseMd(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw.trim() };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([a-zA-Z0-9_\-]+):\s*(.*)$/);
    if (mm) fm[mm[1]] = mm[2].replace(/^["']|["']$/g, '').trim();
  }
  return { fm, body: m[2].trim() };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(headerHelp()); return; }

  const { baseUrl, token } = await loadClientEnv(args.client);
  const api = makeClient({ baseUrl, token });

  // recording date from the folder name prefix (YYYY-MM-DD), else "unknown"
  const folderDate = (basename(args.dir).match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || 'unknown';

  // 1. resolve the target pipeline (id or name-substring)
  const pipesResp = await api.get('pipelines?kind=investor');
  const pipes = pipesResp?.data || pipesResp || [];
  const q = args.pipeline.toLowerCase();
  const pipe = pipes.find((p) => String(p.id) === args.pipeline)
    || pipes.find((p) => (p.name || '').toLowerCase().includes(q));
  if (!pipe) {
    console.error(`No investor pipeline matched "${args.pipeline}". Available:`);
    for (const p of pipes) console.error(`  ${p.id}  ${p.name}`);
    process.exit(1);
  }
  console.log(`Pipeline: ${pipe.name}  (id=${pipe.id})`);
  console.log(`Client:   ${args.client}    Folder: ${args.dir}    Recording date: ${folderDate}`);
  console.log(args.apply ? 'Mode:     APPLY (notes will be written)\n' : 'Mode:     DRY RUN (nothing written — pass --apply to write)\n');

  // 2. index prospects in that pipeline by normalized name (Pattern A paging)
  const byName = new Map();       // norm(full name) -> [prospect]
  const byLast = new Map();       // norm(last name) -> [prospect]
  let page = 0;
  for (;;) {
    const r = await api.get(`pipeline_prospects?pipeline_id=${pipe.id}&page=${page}`);
    const rows = r?.data || [];
    for (const p of rows) {
      const k = norm(p.name);
      if (k) { (byName.get(k) || byName.set(k, []).get(k)).push(p); }
      const l = lastName(p.name);
      if (l) { (byLast.get(l) || byLast.set(l, []).get(l)).push(p); }
    }
    const tp = r?.pagination?.total_pages ?? 1;
    if (rows.length === 0 || page >= tp - 1) break;
    page += 1;
  }
  console.log(`Indexed ${[...byName.values()].reduce((n, a) => n + a.length, 0)} prospects in this pipeline.\n`);

  // 3. read voice-note files
  const files = (await readdir(args.dir)).filter((f) => f.endsWith('.md')).sort();
  const aliases = await loadAliases(args.dir, args.aliases);
  if (aliases.size) console.log(`Aliases: ${aliases.size} name override(s) active.\n`);

  const queued = [];   // { file, prospect, marker, body }
  const suggest = [];  // { file, prospect } last-name-only
  const missing = [];  // file
  const multi = [];    // { file, matches }
  let alreadyHas = 0;

  for (const file of files) {
    const raw = await readFile(join(args.dir, file), 'utf8');
    const { body } = parseMd(raw);
    const displayName = file.replace(/\.md$/, '').replace(/[-_]+/g, ' ').trim();
    const slug = file.replace(/\.md$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const marker = `[voice-note:${folderDate}:${slug}]`;
    // an alias redirects the NAME we look up in Decile (spelling mismatch);
    // the marker/slug still key off the source filename, so re-runs stay safe.
    const lookupName = aliases.get(norm(displayName)) || displayName;
    const exact = byName.get(norm(lookupName));

    if (exact && exact.length === 1) {
      const p = exact[0];
      const dup = (p.notes || []).some((n) => (n.body || '').includes(marker));
      if (dup) { alreadyHas += 1; continue; }
      const noteBody = `🎙️ Voice note (${folderDate}, Aneil) ${marker}\n\n${body}`;
      queued.push({ file, displayName, prospect: p, marker, noteBody });
    } else if (exact && exact.length > 1) {
      multi.push({ file, displayName, matches: exact });
    } else {
      const ln = byLast.get(lastName(displayName));
      if (ln && ln.length === 1) suggest.push({ file, displayName, prospect: ln[0] });
      else missing.push({ file, displayName });
    }
  }

  // 4. report
  const stage = (p) => p?.stage?.name || '—';
  console.log('── MATCHED (will append a note) ──────────────────────────────');
  for (const q of queued) {
    console.log(`  ✅ ${q.displayName.padEnd(26)} stage=${stage(q.prospect).padEnd(16)} ${q.prospect.email || '(no email)'}`);
    if (args.verbose) console.log(`       "${q.noteBody.split('\n').slice(2).join(' ').slice(0, 120)}…"`);
  }
  if (alreadyHas) console.log(`  (… ${alreadyHas} already carry this voice-note marker — skipped, idempotent)`);

  if (suggest.length) {
    console.log('\n── SUGGESTIONS (last-name match only — NOT auto-applied) ─────');
    for (const s of suggest) console.log(`  ❔ ${s.displayName.padEnd(26)} → "${s.prospect.name}"  stage=${stage(s.prospect)}`);
  }
  if (multi.length) {
    console.log('\n── MULTIPLE matches in this pipeline (resolve by hand) ───────');
    for (const m of multi) console.log(`  ⚠️  ${m.displayName} → ${m.matches.map((p) => `#${p.id}/${stage(p)}`).join('  ')}`);
  }
  if (missing.length) {
    console.log('\n── NO MATCH in this pipeline (different pipeline? new lead? spelling?) ─');
    for (const m of missing) console.log(`  ❌ ${m.displayName}`);
  }

  console.log(`\nSummary: ${files.length} files — ${queued.length} to append, ${alreadyHas} already done, ` +
    `${suggest.length} suggestions, ${multi.length} multiple, ${missing.length} no-match.`);

  // 5. apply
  if (!args.apply) {
    console.log('\nDRY RUN — re-run with --apply to append the matched notes.');
    return;
  }
  if (!queued.length) { console.log('\nNothing to append.'); return; }
  console.log('\nAppending notes…');
  let ok = 0, fail = 0;
  for (const q of queued) {
    try {
      await api.post(`pipeline_prospects/${q.prospect.id}/notes`, {
        note: { body: q.noteBody, context: pipe.name },
      });
      ok += 1;
      console.log(`  ✅ ${q.displayName}`);
    } catch (e) {
      fail += 1;
      console.log(`  ❌ ${q.displayName} — ${e.message}`);
    }
  }
  console.log(`\nDone: ${ok} appended, ${fail} failed.`);
}

function headerHelp() {
  return `decile-import-voicenotes.mjs — match per-person voice-note .md files to
Decile pipeline prospects and append each transcript as a note.

  --client <slug>   tenant .env to load     (default: humain-vc)
  --dir <path>      folder of *.md files     (default: the Aneil set)
  --pipeline <q>    pipeline id or name-substring (default: "Fund I")
  --apply           write notes (omit = dry run)
  --verbose         show transcript snippets in the report

Default is a DRY RUN that mutates nothing. Notes are idempotent via a
[voice-note:<date>:<slug>] marker; re-running never duplicates.`;
}

main().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1); });
