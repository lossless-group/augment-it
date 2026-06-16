#!/usr/bin/env node
// ============================================================================
// gatsby-parse-paste.mjs
//
// Parses a copy-paste of the right-hand columns from a Gatsby Events public
// table tab (names are missing because they live in a sticky left column
// that text selection usually skips — that's OK; email is the join key).
//
// Input format (between blank lines, in order per attendee):
//   rsvp_event:  "Invited <date>" | "Visited <date>" | "Bounced <date>" | …
//   email:       single email line
//   warnings*:   "Hasn't RSVP'd yet" | "Unlikely to RSVP" | "Email Bounced or Failed" | …
//   company?:    free text (often glued to the last warning block, no blank line)
//   position?:   free text (follows company, no blank line)
//
// Output: writes a JSON array to <input>.parsed.json.
// Optionally accumulates: if <input>.parsed.json already exists, merges
// new rows in (deduped by email).
//
// Usage:
//   node scripts/gatsby-parse-paste.mjs <input.txt> [--out <output.json>]
// ============================================================================

import { readFile, writeFile, access } from 'node:fs/promises';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.log('Usage: node scripts/gatsby-parse-paste.mjs <input.txt> [--out <output.json>]');
  process.exit(args.length === 0 ? 1 : 0);
}
const inputPath = args[0];
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : inputPath.replace(/\.[^.]+$/, '') + '.parsed.json';

const RSVP_EVENT = /^(Invited|Visited|Bounced|RSVP|Replied|Accepted|Declined|Sent|Reminded)\b/;
const WARNING_PATTERNS = [
  /^Hasn't RSVP'd yet$/i,
  /^Unlikely to (RSVP|Accept|Attend)$/i,
  /^Likely to (Accept|Attend)$/i,
  /^Email Bounced or Failed$/i,
  /^Declined$/i,
  /^Accepted$/i,
  /^Maybe$/i,
];
const isWarning = (s) => WARNING_PATTERNS.some((r) => r.test(s));
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const newRow = (rsvp_event = '') => ({
  rsvp_event,
  email: '',
  warnings: [],
  q2_company: '',
  q3_position: '',
});

const text = await readFile(inputPath, 'utf8');
const blocks = text.split(/\r?\n\s*\r?\n+/).map((b) => b.trim()).filter(Boolean);

// Hard-stop markers (footer junk that pollutes the last data row if we
// process it as free-text continuation).
const FOOTER_HARD_STOP = /^(Grand totals|Not RSVPd Yet|Showing \d+|Page \d+)/i;

const rows = [];
let cur = null;
let started = false;  // becomes true after first rsvp_event or email — until
                       // then, ignore all preamble blocks (page header / chrome).

let footerSeen = false;
for (const block of blocks) {
  if (footerSeen) break;
  const firstLine = block.split('\n')[0].trim();

  // Footer hard-stop — match any line in the block (footer markers sometimes
  // get glued to the previous row's warning line with no blank between).
  const blockLines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const footerIdx = blockLines.findIndex((l) => FOOTER_HARD_STOP.test(l));
  if (footerIdx === 0) break;
  if (footerIdx > 0) {
    // Footer starts mid-block. Truncate to lines before the footer line,
    // then continue processing as a normal free-text block.
    footerSeen = true;
    const trimmed = blockLines.slice(0, footerIdx).join('\n');
    if (!trimmed) break;
    // Substitute the truncated block in place and fall through. We re-enter
    // free-text handling below with the truncated content.
    if (!started) break;
    if (!cur) cur = newRow();
    for (const line of blockLines.slice(0, footerIdx)) {
      if (isWarning(line)) cur.warnings.push(line);
      else if (!cur.q2_company) cur.q2_company = line;
      else if (!cur.q3_position) cur.q3_position = line;
      else cur.q3_position += ` | ${line}`;
    }
    break;
  }

  // RSVP event block → start a new row
  if (RSVP_EVENT.test(firstLine) && block.split('\n').length === 1) {
    if (cur) rows.push(cur);
    cur = newRow(firstLine);
    started = true;
    continue;
  }

  // Email block (single line) → assign to current row, or start a new row
  // if the current row already has an email (handles the no-rsvp-event case).
  if (isEmail(firstLine) && block.split('\n').length === 1) {
    if (!cur || cur.email) {
      if (cur) rows.push(cur);
      cur = newRow();
    }
    cur.email = firstLine;
    started = true;
    continue;
  }

  // Skip preamble: any non-row block before we've seen our first email/rsvp.
  if (!started) continue;

  // Otherwise: walk lines, sort into warnings / company / position.
  if (!cur) cur = newRow();
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (isWarning(line)) {
      cur.warnings.push(line);
    } else if (!cur.q2_company) {
      cur.q2_company = line;
    } else if (!cur.q3_position) {
      cur.q3_position = line;
    } else {
      // Extra free-text we didn't expect — append to position to avoid losing it.
      cur.q3_position += ` | ${line}`;
    }
  }
}
if (cur) rows.push(cur);

// Drop trivially empty rows
const cleaned = rows.filter((r) => r.email || r.rsvp_event || r.warnings.length);

// Merge with existing parsed file if present (dedup by email)
let existing = [];
try {
  await access(outPath);
  existing = JSON.parse(await readFile(outPath, 'utf8'));
  if (!Array.isArray(existing)) existing = [];
} catch {}

const byEmail = new Map();
for (const r of existing) {
  if (r.email) byEmail.set(r.email.toLowerCase(), r);
}
let added = 0;
let merged = 0;
let dropped_no_email = 0;
for (const r of cleaned) {
  if (!r.email) {
    // Skip — can't identify or dedup without an email. (Most common cause:
    // an orphan rsvp_event at the end of a paste where the selection got
    // cut off before the email cell.)
    dropped_no_email += 1;
    continue;
  }
  const key = r.email.toLowerCase();
  if (byEmail.has(key)) {
    // Merge: keep existing, fill in any blank fields from new
    const ex = byEmail.get(key);
    if (!ex.rsvp_event && r.rsvp_event) ex.rsvp_event = r.rsvp_event;
    if (!ex.q2_company && r.q2_company) ex.q2_company = r.q2_company;
    if (!ex.q3_position && r.q3_position) ex.q3_position = r.q3_position;
    const wset = new Set(ex.warnings);
    for (const w of r.warnings) wset.add(w);
    ex.warnings = Array.from(wset);
    merged += 1;
  } else {
    existing.push(r);
    byEmail.set(key, r);
    added += 1;
  }
}

await writeFile(outPath, JSON.stringify(existing, null, 2));

console.log(`parsed ${cleaned.length} blocks from input`);
console.log(`  added:   ${added}`);
console.log(`  merged:  ${merged}`);
if (dropped_no_email) console.log(`  dropped (no email): ${dropped_no_email}`);
console.log(`  total:   ${existing.length}`);
console.log(`  out:     ${outPath}`);

// Quick triage report
const noEmail = existing.filter((r) => !r.email).length;
const withCompany = existing.filter((r) => r.q2_company).length;
const personalDomain = existing.filter((r) => /@(gmail|yahoo|hotmail|outlook|me|icloud|aol|protonmail|live)\./i.test(r.email || '')).length;
console.log('');
console.log(`triage:`);
console.log(`  rows w/o email:      ${noEmail}`);
console.log(`  rows w/ company:     ${withCompany}`);
console.log(`  rows w/ personal-email domain: ${personalDomain}`);
