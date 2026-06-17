#!/usr/bin/env node
// ============================================================================
// export-event-briefing.mjs
//
// Operator-style enrichment briefing for ONE event. Pulls every attendee,
// their affiliations, their orgs, and the populated coverage fields out
// of SurrealDB and emits a single markdown file. Honest about gaps —
// the operator-style report calls out the unfindable bucket, the
// named-but-no-affiliation bucket, etc. so the team can decide what to
// chase next.
//
// Sibling: export-branded-briefing.mjs takes this markdown + a brand
// config and produces branded HTML / PDF for client delivery.
//
// Usage:
//   node scripts/export-event-briefing.mjs \
//     --event-slug 2026-05-21-turning-jobs-into-degrees \
//     --client     reach-edu \
//     --out-dir    clients/reach-edu/briefings/2026-05-21-turning-jobs/
// ============================================================================

import { Surreal } from 'surrealdb';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Personal-email providers — used to identify "operationally unfindable"
// rows (no parseable name + email at a personal domain → nothing to start
// from without external OSINT).
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'ymail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'me.com', 'mac.com', 'icloud.com',
  'aol.com', 'comcast.net', 'verizon.net', 'sbcglobal.net', 'att.net',
  'protonmail.com', 'proton.me', 'pm.me', 'hey.com',
  'fastmail.com', 'gmx.com', 'gmx.us',
]);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--event-slug') { out.eventSlug = v; i += 1; }
    else if (a === '--client') { out.client = v; i += 1; }
    else if (a === '--out-dir') { out.outDir = v; i += 1; }
  }
  return out;
}

const args = parseArgs(process.argv);
if (!args.eventSlug || !args.client || !args.outDir) {
  console.error('usage: --event-slug <slug> --client <slug> --out-dir <path>');
  process.exit(1);
}
for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });

// ---- Pull -------------------------------------------------------------------

const evResult = await db.query(
  `SELECT * FROM events WHERE slug = $slug LIMIT 1;`,
  { slug: args.eventSlug },
);
const event = (evResult?.[0])?.[0];
if (!event) { console.error(`event not found: ${args.eventSlug}`); process.exit(1); }

const peopleResult = await db.query(
  `LET $aids = (SELECT VALUE subject FROM observations
                WHERE object = $ev AND predicate IN ['invited_to', 'visited_event_page', 'email_bounced']);
   SELECT id, email, full_name, first_name, surname, emails,
          personal_links, personal_corpus, warnings, location, source,
          triage_status
     FROM persons WHERE id IN $aids
     ORDER BY full_name ASC, email ASC;`,
  { ev: event.id },
);
const persons = peopleResult?.[peopleResult.length - 1] ?? [];

const affResult = await db.query(
  `LET $aids = (SELECT VALUE subject FROM observations
                WHERE object = $ev AND predicate IN ['invited_to', 'visited_event_page', 'email_bounced']);
   SELECT in              AS person_id,
          kind            AS role,
          added_at,
          out.id          AS org_id,
          out.complete_name     AS complete_name,
          out.conventional_name AS conventional_name,
          out.slug              AS slug
     FROM affiliations WHERE in IN $aids;`,
  { ev: event.id },
);
const affiliations = affResult?.[affResult.length - 1] ?? [];

await db.close();

// ---- Reshape ----------------------------------------------------------------

const affByPerson = new Map();           // person id-string → [{role, org_id, complete_name, ...}]
const memberCountByOrg = new Map();      // org id-string → { complete_name, conventional_name, slug, members:Set }
for (const a of affiliations) {
  const pid = String(a.person_id);
  if (!affByPerson.has(pid)) affByPerson.set(pid, []);
  affByPerson.get(pid).push(a);
  const oid = String(a.org_id);
  if (!memberCountByOrg.has(oid)) {
    memberCountByOrg.set(oid, {
      complete_name:     a.complete_name     ?? '(unnamed)',
      conventional_name: a.conventional_name ?? null,
      slug:              a.slug              ?? null,
      members:           new Set(),
    });
  }
  memberCountByOrg.get(oid).members.add(pid);
}

function emailDomain(email) {
  return (email?.split('@')[1] ?? '').toLowerCase().replace(/^www\./, '');
}
function richnessScore(p) {
  let s = 0;
  if (p.full_name)                         s += 1;
  if ((affByPerson.get(String(p.id)) ?? []).length > 0) s += 2;
  if ((p.personal_links ?? []).length > 0) s += 1;
  if ((p.personal_corpus ?? []).length > 0) s += 2;
  if ((p.emails ?? []).length > 0)         s += 1;
  return s;
}

const unfindable = [];                // no full_name + personal email + no affiliation
const namedNoAffiliation = [];        // has name but no affiliation
const unnamedWithOrgDomain = [];      // no full_name but email at non-personal domain (actionable!)
const fullyEnriched = [];             // name + at least one affiliation + (links OR corpus)

for (const p of persons) {
  const hasName = !!p.full_name;
  const hasAff  = (affByPerson.get(String(p.id)) ?? []).length > 0;
  const hasLinks = (p.personal_links ?? []).length > 0;
  const hasCorpus = (p.personal_corpus ?? []).length > 0;
  const dom = emailDomain(p.email);
  const isPersonalDomain = !dom || PERSONAL_EMAIL_DOMAINS.has(dom);

  if (!hasName && isPersonalDomain) {
    unfindable.push(p);
  } else if (!hasName && !isPersonalDomain) {
    unnamedWithOrgDomain.push(p);
  } else if (hasName && !hasAff) {
    namedNoAffiliation.push(p);
  } else if (hasName && hasAff && (hasLinks || hasCorpus)) {
    fullyEnriched.push(p);
  }
}

const total = persons.length;
const hasFullName        = persons.filter((p) => !!p.full_name).length;
const hasAnyAffiliation  = persons.filter((p) => (affByPerson.get(String(p.id)) ?? []).length > 0).length;
const hasPersonalLinks   = persons.filter((p) => (p.personal_links ?? []).length > 0).length;
const hasPersonalCorpus  = persons.filter((p) => (p.personal_corpus ?? []).length > 0).length;
const hasAdditionalEmail = persons.filter((p) => (p.emails ?? []).length > 0).length;

const pct = (n) => total ? `${Math.round((n / total) * 100)}%` : '0%';

// ---- Render -----------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const lines = [];

lines.push('---');
lines.push(`title: "${event.name ?? args.eventSlug} — Attendee Enrichment Briefing"`);
lines.push(`lede: "Operator-facing coverage report on the ${total} attendees of this event. Honest about gaps — what's enriched, what's still findable, what's operationally out of reach without external OSINT. Generated from the canonical SurrealDB layer."`);
lines.push(`date_created: ${today}`);
lines.push(`date_modified: ${today}`);
lines.push(`event_slug: ${args.eventSlug}`);
lines.push(`client: ${args.client}`);
lines.push(`total_attendees: ${total}`);
lines.push(`stats:`);
lines.push(`  named: ${hasFullName}`);
lines.push(`  with_affiliation: ${hasAnyAffiliation}`);
lines.push(`  with_personal_links: ${hasPersonalLinks}`);
lines.push(`  with_personal_corpus: ${hasPersonalCorpus}`);
lines.push(`  unfindable: ${unfindable.length}`);
lines.push(`  named_no_affiliation: ${namedNoAffiliation.length}`);
lines.push(`  unnamed_with_org_domain: ${unnamedWithOrgDomain.length}`);
lines.push(`  fully_enriched: ${fullyEnriched.length}`);
lines.push(`publish: true`);
lines.push(`authors:`);
lines.push(`  - Michael Staton`);
lines.push(`augmented_with:`);
lines.push(`  - Claude Code on Claude Opus 4.7 (1M context)`);
lines.push(`tags:`);
lines.push(`  - Briefing`);
lines.push(`  - Event-Enrichment`);
lines.push(`  - Operator-Facing`);
lines.push(`  - ${args.client}`);
lines.push('---');
lines.push('');
lines.push(`# ${event.name ?? args.eventSlug} — Attendee Enrichment Briefing`);
lines.push('');
lines.push(`> Operator-facing snapshot of where the ${total} attendees of **${event.name ?? args.eventSlug}** stand after the current enrichment pass. Honest coverage — what's done, what's still findable, what's operationally out of reach without external OSINT.`);
lines.push('');

if (event.source_url) {
  lines.push(`Source: [Gatsby attendee table](${event.source_url})`);
  lines.push('');
}

// Coverage at a glance
lines.push('## Coverage at a glance');
lines.push('');
lines.push('| Field | Count | % of total |');
lines.push('|---|---:|---:|');
lines.push(`| Has \`full_name\` | ${hasFullName} | ${pct(hasFullName)} |`);
lines.push(`| Has at least one affiliation | ${hasAnyAffiliation} | ${pct(hasAnyAffiliation)} |`);
lines.push(`| Has \`personal_links\` | ${hasPersonalLinks} | ${pct(hasPersonalLinks)} |`);
lines.push(`| Has \`personal_corpus\` | ${hasPersonalCorpus} | ${pct(hasPersonalCorpus)} |`);
lines.push(`| Has additional emails | ${hasAdditionalEmail} | ${pct(hasAdditionalEmail)} |`);
lines.push('');

// Buckets summary
lines.push('## Triage buckets');
lines.push('');
lines.push('| Bucket | Count | What it means |');
lines.push('|---|---:|---|');
lines.push(`| **Fully enriched** | ${fullyEnriched.length} | name + affiliation + (links or corpus) |`);
lines.push(`| **Named but no affiliation** | ${namedNoAffiliation.length} | next session's primary worklist |`);
lines.push(`| **Unnamed, org-domain email** | ${unnamedWithOrgDomain.length} | findable — domain gives a starting point |`);
lines.push(`| **Operationally unfindable** | ${unfindable.length} | no name + personal-email domain → tag \`triage_status = unfindable\` |`);
lines.push('');

// Orgs surfaced
const orgsArr = [...memberCountByOrg.values()]
  .map((o) => ({ ...o, member_count: o.members.size }))
  .sort((a, b) => b.member_count - a.member_count || a.complete_name.localeCompare(b.complete_name));

lines.push('## Orgs that surfaced');
lines.push('');
lines.push(`${orgsArr.length} distinct organizations appear across the ${hasAnyAffiliation} affiliated attendees.`);
lines.push('');
lines.push('| Org | Conv. | Members | Slug |');
lines.push('|---|---|---:|---|');
for (const o of orgsArr) {
  lines.push(`| ${o.complete_name} | ${o.conventional_name && o.conventional_name !== o.complete_name ? o.conventional_name : '—'} | ${o.member_count} | \`${o.slug ?? '—'}\` |`);
}
lines.push('');

// What's still actionable
lines.push('## What\'s still actionable');
lines.push('');

if (namedNoAffiliation.length > 0) {
  lines.push(`### Named but no affiliation (${namedNoAffiliation.length})`);
  lines.push('');
  lines.push('These are the primary worklist for the next enrichment session — we know who they are, we just don\'t know where they work.');
  lines.push('');
  for (const p of namedNoAffiliation.slice().sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))) {
    lines.push(`- **${p.full_name}** — \`${p.email}\``);
  }
  lines.push('');
}

if (unnamedWithOrgDomain.length > 0) {
  lines.push(`### Unnamed, but org-domain email (${unnamedWithOrgDomain.length})`);
  lines.push('');
  lines.push('No first/last name in the source data, but the email domain gives a starting point — operator can search the org\'s team page, LinkedIn company directory, etc.');
  lines.push('');
  for (const p of unnamedWithOrgDomain.slice().sort((a, b) => emailDomain(a.email).localeCompare(emailDomain(b.email)))) {
    lines.push(`- \`${p.email}\` — domain **${emailDomain(p.email)}**`);
  }
  lines.push('');
}

// Operationally unfindable
if (unfindable.length > 0) {
  lines.push(`## Operationally unfindable (${unfindable.length})`);
  lines.push('');
  lines.push('No parseable name in the source data **and** a personal email domain (gmail, yahoo, hotmail, etc.). Without external OSINT there\'s nothing to start from — recommend tagging \`triage_status = unfindable\` so they drop out of the worklist.');
  lines.push('');
  const byDom = new Map();
  for (const p of unfindable) {
    const d = emailDomain(p.email) || '(no-domain)';
    if (!byDom.has(d)) byDom.set(d, []);
    byDom.get(d).push(p);
  }
  for (const [d, list] of [...byDom.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${d} (${list.length})`);
    for (const p of list) lines.push(`- \`${p.email}\``);
    lines.push('');
  }
}

// Notable enrichments
const richSorted = fullyEnriched
  .slice()
  .sort((a, b) => richnessScore(b) - richnessScore(a) || (a.full_name ?? '').localeCompare(b.full_name ?? ''));

if (richSorted.length > 0) {
  lines.push('## Notable enrichments (richest profiles)');
  lines.push('');
  lines.push(`Top ${Math.min(20, richSorted.length)} of the ${richSorted.length} fully-enriched attendees, ranked by depth of coverage.`);
  lines.push('');
  for (const p of richSorted.slice(0, 20)) {
    const affs = affByPerson.get(String(p.id)) ?? [];
    const links = (p.personal_links ?? []).length;
    const corp = (p.personal_corpus ?? []).length;
    const role = affs[0]?.role ? ` (${affs[0].role})` : '';
    const org  = affs[0]?.complete_name ?? '(no org)';
    const extraAffs = affs.length > 1 ? ` + ${affs.length - 1} more` : '';
    lines.push(`- **${p.full_name}** — ${org}${role}${extraAffs}. ${links} link${links === 1 ? '' : 's'}, ${corp} corpus item${corp === 1 ? '' : 's'}, \`${p.email}\``);
  }
  lines.push('');
}

// Footer
lines.push('---');
lines.push('');
lines.push('## Methodology + provenance');
lines.push('');
lines.push(`- **Source of truth:** SurrealDB canonical layer (ns=\`${process.env.SURREAL_NS}\`, db=\`${process.env.SURREAL_DB}\`).`);
lines.push(`- **Attendee set:** every \`persons\` row reachable from \`events:${args.eventSlug}\` via an \`observations\` row with predicate in \`[invited_to, visited_event_page, email_bounced]\`.`);
lines.push(`- **Affiliation set:** every \`affiliations\` graph edge where \`in\` is in the attendee set.`);
lines.push(`- **"Personal email domain" set:** ${[...PERSONAL_EMAIL_DOMAINS].sort().join(', ')}.`);
lines.push(`- **Richness score** (for ranking notable enrichments): \`full_name + 2×affiliation + personal_links + 2×personal_corpus + additional_emails\`.`);
lines.push('');
lines.push('To regenerate:');
lines.push('');
lines.push('```bash');
lines.push(`node scripts/export-event-briefing.mjs \\`);
lines.push(`  --event-slug ${args.eventSlug} \\`);
lines.push(`  --client ${args.client} \\`);
lines.push(`  --out-dir ${args.outDir}`);
lines.push('```');
lines.push('');

const outPath = resolve(args.outDir, 'briefing.md');
await mkdir(args.outDir, { recursive: true });
await writeFile(outPath, lines.join('\n'), 'utf8');

console.log(`wrote: ${outPath}`);
console.log(`stats: ${total} attendees · ${hasFullName} named · ${hasAnyAffiliation} affiliated · ${unfindable.length} unfindable · ${orgsArr.length} orgs surfaced`);
