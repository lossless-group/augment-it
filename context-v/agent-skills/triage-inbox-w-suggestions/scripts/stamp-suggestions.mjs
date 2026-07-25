#!/usr/bin/env node
// Stamp triage_suggestion: blocks into inbox frontmatter from a JSON spec.
// usage: node stamp-suggestions.mjs <suggestions.json> <inbox-dir>
// Spec: [{ file, yaml }] — yaml is the pre-rendered triage_suggestion block
// (starting with "triage_suggestion:"). Inserted just before the closing ---
// of the frontmatter. Refuses to stamp a file that already has one.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [specPath, inboxDir] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
let stamped = 0, skipped = 0;
for (const { file, yaml } of spec) {
  const p = join(inboxDir, file);
  const src = readFileSync(p, 'utf8');
  if (src.includes('\ntriage_suggestion:')) { console.log(`SKIP (already stamped): ${file}`); skipped++; continue; }
  const lines = src.split('\n');
  if (lines[0] !== '---') { console.log(`SKIP (no frontmatter): ${file}`); skipped++; continue; }
  const close = lines.indexOf('---', 1);
  if (close === -1) { console.log(`SKIP (unclosed frontmatter): ${file}`); skipped++; continue; }
  lines.splice(close, 0, ...yaml.trimEnd().split('\n'));
  writeFileSync(p, lines.join('\n'));
  stamped++;
}
console.log(`stamped ${stamped}, skipped ${skipped}`);
