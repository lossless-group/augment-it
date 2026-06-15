#!/usr/bin/env node
// ============================================================================
// render-tagged-network.mjs
//
// Reads three files:
//   1. A tagged CSV  (walker-network CSV with a `tags` column)
//   2. An enriched CSV (linkedin-profile rows: about, company, school, etc.)
//   3. A directory of renamed CV PDFs (filenames are <vanity-slug>.pdf)
//
// Joins them on the LinkedIn vanity slug, groups by tag, and emits a
// single Markdown file: a category-organized briefing doc that can be
// sent to a client as-is (paste into Google Doc, attach as .md, etc.).
//
// Numbers exports CSVs with the sheet title as line 1, headers on line 2.
// We auto-detect: if line 1 looks like a single-column non-header row, we
// skip it.
//
// Multi-tag rows: a tags cell with "VCs, Founders" places the person in
// BOTH sections. Splitter is /[,;|\/]/.
//
// Usage:
//   node scripts/render-tagged-network.mjs \
//     --tagged <tagged.csv> \
//     --enriched <enriched.csv> \
//     --pdf-dir <pdf-dir> \
//     --out <out.md>
// ============================================================================

import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { basename, join, dirname } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--tagged') { out.tagged = v; i += 1; }
    else if (a === '--enriched') { out.enriched = v; i += 1; }
    else if (a === '--pdf-dir') { out.pdfDir = v; i += 1; }
    else if (a === '--out') { out.out = v; i += 1; }
    else if (a === '--bundle') { out.bundle = v; i += 1; }
    else if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

function parseCsv(text) {
  const rows = [[]]; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], n = text[i + 1];
    if (q) {
      if (c === '"' && n === '"') { cur += '"'; i += 1; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { rows[rows.length - 1].push(cur); cur = ''; }
      else if (c === '\n') { rows[rows.length - 1].push(cur); cur = ''; rows.push([]); }
      else if (c === '\r') { /* skip */ }
      else cur += c;
    }
  }
  if (cur !== '' || rows[rows.length - 1].length > 0) rows[rows.length - 1].push(cur);
  return rows.filter((r) => r.length > 1);
}

function readCsvAsObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0];
  // Numbers exports drop quotes around fields that contain commas
  // (e.g., "Head of Impact, P.INC" in headline). Result: those rows
  // come back with MORE fields than headers, and the broken-off pieces
  // get shifted into the wrong columns (P.INC ends up as "location",
  // TRUE ends up as "deep_visited_at", etc.).
  //
  // Heuristic fix: when a row has N extras, assume they're all in the
  // headline column (headlines contain commas WAY more often than the
  // other narrow fields in this CSV). Merge them with ", " and clear
  // the location field (data is lost — better empty than wrong).
  const headlineIdx = headers.indexOf('headline');
  const locationIdx = headers.indexOf('location');
  return rows.slice(1).map((r) => {
    const o = {};
    if (r.length > headers.length && headlineIdx >= 0) {
      const extras = r.length - headers.length;
      // Merge fields [headlineIdx .. headlineIdx + extras] into one
      const mergedHeadline = r.slice(headlineIdx, headlineIdx + 1 + extras).map((s) => (s || '').trim()).join(', ');
      // Rebuild: keep 0..headlineIdx-1, then merged headline, then '' for
      // location (data lost — original location was overwritten by the
      // broken-off headline part), then the rest of the row from the
      // position AFTER the merged extras.
      const rebuilt = [
        ...r.slice(0, headlineIdx),
        mergedHeadline,
        '', // empty location — original was overwritten by the broken-off headline part
        ...r.slice(headlineIdx + 1 + extras), // continue from the first field after the merged extras
      ];
      for (let i = 0; i < headers.length; i += 1) o[headers[i]] = rebuilt[i] ?? '';
    } else {
      for (let i = 0; i < headers.length; i += 1) o[headers[i]] = r[i] ?? '';
    }
    return o;
  });
}

function slugFromUrl(url) {
  const m = (url || '').match(/\/in\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]).toLowerCase() : '';
}

// Trim about text to ~280 chars and rstrip at a sentence boundary if
// possible, so the deliverable reads tight.
function snipAbout(s, maxLen = 280) {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSentence = cut.lastIndexOf('. ');
  return (lastSentence > maxLen * 0.5 ? cut.slice(0, lastSentence + 1) : cut + '…');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.tagged || !args.out) {
    console.log(`Usage:
  node scripts/render-tagged-network.mjs \\
    --tagged <tagged.csv> \\
    [--enriched <enriched.csv>] \\
    [--pdf-dir <dir>] \\
    --out <out.md>
`);
    process.exit(args.help ? 0 : 1);
  }

  // --- 1. Read tagged CSV ------------------------------------------------
  let taggedText = await readFile(args.tagged, 'utf8');
  // Numbers sometimes prefixes the export with the sheet title (single
  // column on line 1). Our parser filters those out, so headers land at
  // rows[0]. Nothing to do here.
  const taggedRows = readCsvAsObjects(taggedText);
  const taggedHeaders = Object.keys(taggedRows[0] || {});
  if (!taggedHeaders.includes('tags')) {
    console.error('🚨 tagged CSV has no "tags" column. Found headers:', taggedHeaders.join(', '));
    process.exit(1);
  }

  // --- 2. Read enriched CSV (optional) ----------------------------------
  const enrichedBySlug = new Map();
  if (args.enriched) {
    const text = await readFile(args.enriched, 'utf8');
    for (const r of readCsvAsObjects(text)) {
      const slug = slugFromUrl(r.profile_url);
      if (slug) enrichedBySlug.set(slug, r);
    }
  }

  // --- 3. Read PDF directory (optional) ---------------------------------
  const pdfSlugs = new Set();
  if (args.pdfDir) {
    try {
      const files = await readdir(args.pdfDir);
      for (const f of files) {
        if (!f.toLowerCase().endsWith('.pdf')) continue;
        // Strip "-2", "-3" collision suffixes our renamer adds.
        const slug = basename(f, '.pdf').replace(/-\d+$/, '').toLowerCase();
        pdfSlugs.add(slug);
        // Also keep the raw slug, in case it actually ends in a digit.
        pdfSlugs.add(basename(f, '.pdf').toLowerCase());
      }
    } catch (err) {
      console.warn(`  warning: pdf dir read failed: ${err.message}`);
    }
  }

  // --- 4. Group tagged people by tag ------------------------------------
  // A row with "VCs, Founders" goes into BOTH groups.
  const byTag = new Map();
  let taggedRowCount = 0;
  let enrichedHits = 0, pdfHits = 0;
  for (const t of taggedRows) {
    const tagsRaw = (t.tags || '').trim();
    if (!tagsRaw) continue;
    taggedRowCount += 1;
    const tags = tagsRaw.split(/[,;|\/]/).map((s) => s.trim()).filter(Boolean);
    const slug = slugFromUrl(t.profile_url);
    const enriched = slug ? enrichedBySlug.get(slug) : null;
    if (enriched) enrichedHits += 1;
    const hasPdf = slug && pdfSlugs.has(slug);
    if (hasPdf) pdfHits += 1;
    const person = {
      name: enriched?.name || t.name || '',
      profile_url: t.profile_url || enriched?.profile_url || '',
      slug,
      headline: enriched?.headline || t.headline || t.deep_headline || '',
      location: enriched?.location || t.location || t.deep_location || '',
      current_company: enriched?.current_company || '',
      current_school: enriched?.current_school || '',
      about: snipAbout(enriched?.about || ''),
      followers_count: enriched?.followers_count || '',
      hasPdf,
      tagsRaw,
    };
    for (const tag of tags) {
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag).push(person);
    }
  }

  // Sort tags by population descending; within each tag, sort people by
  // current_company → name so similar shops cluster.
  const tagOrder = Array.from(byTag.keys()).sort((a, b) => byTag.get(b).length - byTag.get(a).length);
  for (const tag of tagOrder) {
    byTag.get(tag).sort((a, b) =>
      (a.current_company || 'zzz').localeCompare(b.current_company || 'zzz') ||
      a.name.localeCompare(b.name));
  }

  // --- 5. Render Markdown -----------------------------------------------
  const lines = [];
  const today = args.tagged.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
  lines.push(`# Tagged network — briefing`);
  lines.push('');
  lines.push(`Curated from ${taggedRows.length} contacts. ${taggedRowCount} tagged across ${byTag.size} categor${byTag.size === 1 ? 'y' : 'ies'}. ${enrichedHits} have rich bio data, ${pdfHits} have a CV PDF on disk${today ? '. Source date ' + today : ''}.`);
  lines.push('');
  lines.push('Each person includes name, role one-liner, current org · school, location, an about excerpt where we have it, and links: LinkedIn and (if present) a relative path to a local CV PDF.');
  lines.push('');

  // Table of contents
  lines.push('## Contents');
  lines.push('');
  for (const tag of tagOrder) {
    lines.push(`- [${tag} (${byTag.get(tag).length})](#${tag.toLowerCase().replace(/[^a-z0-9]+/g, '-')})`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const tag of tagOrder) {
    const ps = byTag.get(tag);
    lines.push(`## ${tag} (${ps.length})`);
    lines.push('');
    for (const p of ps) {
      const orgLine = [p.current_company, p.current_school].filter(Boolean).join(' · ');
      const meta = [p.headline, orgLine, p.location].filter(Boolean).join('. ');
      const pdfPart = p.hasPdf ? ` · [CV](pdfs/${p.slug}.pdf)` : '';
      const liPart = p.profile_url ? `[LinkedIn](${p.profile_url})` : '';
      lines.push(`- **${p.name}** — ${meta}${meta && !meta.endsWith('.') ? '.' : ''}`);
      if (p.about) lines.push(`  ${p.about}`);
      if (liPart || pdfPart) lines.push(`  ${liPart}${pdfPart}`);
      lines.push('');
    }
  }

  await writeFile(args.out, lines.join('\n'));

  // --- 6. Optional: bundle the deliverable -------------------------------
  // Writes the markdown to <bundle>/index.md and copies only the
  // referenced PDFs into <bundle>/pdfs/. The result is a self-contained
  // folder you can zip and send.
  let copiedPdfs = 0;
  if (args.bundle) {
    await mkdir(join(args.bundle, 'pdfs'), { recursive: true });
    await writeFile(join(args.bundle, 'index.md'), lines.join('\n'));
    if (args.pdfDir) {
      const referenced = new Set();
      for (const people of byTag.values()) for (const p of people) if (p.hasPdf && p.slug) referenced.add(p.slug);
      for (const slug of referenced) {
        // Find the actual file on disk (may have a -2 collision suffix).
        const candidates = [`${slug}.pdf`];
        try {
          const all = await readdir(args.pdfDir);
          for (const f of all) {
            const base = basename(f, '.pdf').toLowerCase();
            if (base === slug.toLowerCase() || base.replace(/-\d+$/, '') === slug.toLowerCase()) {
              candidates.push(f);
            }
          }
        } catch {}
        const found = candidates.find((c) => c);
        if (found) {
          try {
            await copyFile(join(args.pdfDir, found), join(args.bundle, 'pdfs', `${slug}.pdf`));
            copiedPdfs += 1;
          } catch {}
        }
      }
    }
  }

  console.log(`tagged rows:      ${taggedRowCount} / ${taggedRows.length}`);
  console.log(`enriched matches: ${enrichedHits}`);
  console.log(`pdf matches:      ${pdfHits}`);
  console.log(`categories:       ${byTag.size}`);
  console.log(`output:           ${args.out}`);
  if (args.bundle) console.log(`bundle:           ${args.bundle}/  (index.md + ${copiedPdfs} pdfs/)`);
}

main().catch((err) => { console.error('crashed:', err); process.exit(1); });
