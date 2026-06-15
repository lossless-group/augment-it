#!/usr/bin/env node
// ============================================================================
// rename-linkedin-pdfs.mjs
//
// Walks a directory of LinkedIn "Save to PDF" downloads (all named
// generically as "Profile.pdf" / "Profile (N).pdf" / "Profile - <ts>.pdf"
// by Chrome), extracts the LinkedIn vanity slug from inside each PDF
// (the "linkedin.com/in/<slug>" line that LinkedIn prints in the
// Contact block on page 1), and renames each file to "<slug>.pdf".
//
// Requires: pdftotext on PATH (brew install poppler).
//
// Usage:
//   node scripts/rename-linkedin-pdfs.mjs --dir <pdf-dir> [--dry-run] [--csv <profiles.csv>]
//
// --dry-run         report what would change without renaming
// --csv <path>      cross-check: warn if a slug in a PDF isn't in the CSV
//                   profile_url column (catches drift between extractor
//                   walk and PDF walk).
// ============================================================================

import { readdir, rename, readFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') { out.dir = argv[i + 1]; i += 1; }
    else if (a === '--csv') { out.csv = argv[i + 1]; i += 1; }
    else if (a === '--dry-run') { out.dryRun = true; }
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

// Extract the LinkedIn vanity slug from PDF text. The Contact block has
// "linkedin.com/in/<slug>". pdftotext sometimes line-breaks the URL
// BETWEEN /in/ and the slug:
//   www.linkedin.com/in/
//   caitlinstrandberg (LinkedIn)
// so allow whitespace (including newlines — \s matches \n in JS regex).
function slugFromPdfText(text) {
  const m = text.match(/linkedin\.com\/in\/\s*([A-Za-z0-9_\-%]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.dir) {
    console.log(`Usage:
  node scripts/rename-linkedin-pdfs.mjs --dir <pdf-dir> [--dry-run] [--csv <profiles.csv>]
`);
    process.exit(args.help ? 0 : 1);
  }

  // Cross-check slug set from CSV (optional).
  const csvSlugs = new Set();
  if (args.csv) {
    try {
      const rows = parseCsv(await readFile(args.csv, 'utf8'));
      const headers = rows[0];
      const urlIdx = headers.indexOf('profile_url');
      if (urlIdx === -1) {
        console.warn('  warning: --csv missing "profile_url" header — cross-check disabled');
      } else {
        for (const r of rows.slice(1)) {
          const url = r[urlIdx];
          const m = url && url.match(/\/in\/([^/?#]+)/);
          if (m) csvSlugs.add(decodeURIComponent(m[1]));
        }
        console.log(`csv slugs catalogued: ${csvSlugs.size}`);
      }
    } catch (err) {
      console.warn('  warning: csv read failed —', err.message);
    }
  }

  const entries = await readdir(args.dir);
  const pdfs = entries.filter((f) => f.toLowerCase().endsWith('.pdf'));
  console.log(`pdfs found: ${pdfs.length}`);
  console.log(`dry-run:    ${!!args.dryRun}`);
  console.log('');

  let renamed = 0;
  let skipped = 0;
  let noSlug = 0;
  let notInCsv = 0;
  const slugCounts = new Map(); // slug → count, to detect collisions

  for (const f of pdfs) {
    const src = join(args.dir, f);
    let text;
    try {
      const { stdout } = await run('pdftotext', [src, '-'], { maxBuffer: 8 * 1024 * 1024 });
      text = stdout || '';
    } catch (err) {
      console.log(`  ✗ ${f} — pdftotext failed: ${err.message.slice(0, 80)}`);
      skipped += 1;
      continue;
    }
    const slug = slugFromPdfText(text);
    if (!slug) {
      console.log(`  ⚠ ${f} — no linkedin.com/in/<slug> in PDF text`);
      noSlug += 1;
      continue;
    }
    const csvNote = csvSlugs.size && !csvSlugs.has(slug) ? ' [NOT IN CSV]' : '';
    if (csvNote) notInCsv += 1;

    // Track collisions: if two PDFs claim the same slug, append -2, -3, etc.
    const count = (slugCounts.get(slug) || 0) + 1;
    slugCounts.set(slug, count);
    const suffix = count > 1 ? `-${count}` : '';
    const newName = `${slug}${suffix}.pdf`;
    const dst = join(args.dir, newName);

    if (f === newName) {
      console.log(`  · ${f} — already correctly named, skip`);
      skipped += 1;
      continue;
    }

    if (args.dryRun) {
      console.log(`  → ${f}  →  ${newName}${csvNote}`);
    } else {
      try {
        await rename(src, dst);
        console.log(`  ✓ ${f}  →  ${newName}${csvNote}`);
        renamed += 1;
      } catch (err) {
        console.log(`  ✗ ${f} — rename failed: ${err.message}`);
        skipped += 1;
      }
    }
  }

  // Report collisions (real duplicates that got -2, -3 suffixes).
  const collisions = Array.from(slugCounts.entries()).filter(([, n]) => n > 1);

  console.log('');
  console.log(`done. ${renamed} renamed, ${skipped} skipped, ${noSlug} had no slug${csvSlugs.size ? `, ${notInCsv} not in CSV` : ''}.`);
  if (collisions.length) {
    console.log(`  ${collisions.length} slug collision(s) (same profile saved twice):`);
    for (const [s, n] of collisions) console.log(`    ${s}: ${n} copies`);
  }
}

main().catch((err) => { console.error('crashed:', err); process.exit(1); });
