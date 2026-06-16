#!/usr/bin/env node
// ============================================================================
// surreal-write-event-attendees.mjs
//
// Loads a parsed gatsby-events attendee JSON file and writes:
//   - persons rows (deduped by email; UNIQUE INDEX on persons.email)
//   - has_email observation (subject=person, object=email_string)
//   - funnel observation (predicate maps from rsvp_event):
//        "Invited <date>"  → predicate="invited_to",        observed_at=<date>
//        "Visited <date>"  → predicate="visited_event_page", observed_at=<date>
//        "Bounced <date>"  → predicate="email_bounced",      observed_at=<date>
//   - organizations row (where q2_company is filled; deduped by slugified name)
//   - affiliated_with observation (subject=person, object=org, qualifiers
//     {kind: "operator-confirmed", source: "gatsby-events"})
//
// All writes carry --client <slug> per the Client-Tagging spec.
//
// Out of scope for this slice: gatsby warnings (Hasn't RSVP'd yet etc.),
// q3_position, email-domain → org inference. Those land in v2 once the
// personal-email denylist + multi-domain org model are in.
//
// Usage:
//   node scripts/surreal-write-event-attendees.mjs \
//     --json clients/reach-edu/inputs/2026-05-21_Turning-Jobs-Into-Degrees-attendees-paste-1.parsed.json \
//     --event-slug 2026-05-21-turning-jobs-into-degrees \
//     --client reach-edu
// ============================================================================

import { readFile } from 'node:fs/promises';
import { Surreal } from 'surrealdb';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--json') { out.json = argv[i + 1]; i += 1; }
    else if (argv[i] === '--event-slug') { out.eventSlug = argv[i + 1]; i += 1; }
    else if (argv[i] === '--client') { out.client = argv[i + 1]; i += 1; }
    else if (argv[i] === '--help' || argv[i] === '-h') { out.help = true; }
  }
  return out;
}

const args = parseArgs(process.argv);
if (args.help || !args.json || !args.eventSlug || !args.client) {
  console.log('Usage: node scripts/surreal-write-event-attendees.mjs \\');
  console.log('         --json <parsed.json> --event-slug <slug> --client <slug>');
  process.exit(args.help ? 0 : 1);
}

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

// ---------------------------------------------------------------------------
// Parsers + slug helpers
// ---------------------------------------------------------------------------
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const EVENT_YEAR = 2026;

function parseRsvpEvent(s) {
  if (!s) return null;
  const m = s.match(/^(Invited|Visited|Bounced)\s+([A-Z][a-z]{2})\s+(\d{1,2})$/);
  if (!m) return null;
  const verb = m[1];
  const mo = MONTHS[m[2]];
  const day = parseInt(m[3], 10);
  if (!mo) return null;
  const date = new Date(Date.UTC(EVENT_YEAR, mo - 1, day));
  const predicate =
    verb === 'Invited' ? 'invited_to' :
    verb === 'Visited' ? 'visited_event_page' :
    'email_bounced';
  return { predicate, observed_at: date };
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ---------------------------------------------------------------------------
// Load attendees
// ---------------------------------------------------------------------------
const attendees = JSON.parse(await readFile(args.json, 'utf8'));
if (!Array.isArray(attendees)) {
  console.error('expected JSON array of attendees');
  process.exit(1);
}
console.log(`json:        ${args.json}`);
console.log(`attendees:   ${attendees.length}`);
console.log(`event-slug:  ${args.eventSlug}`);
console.log(`client:      ${args.client}`);
console.log('');

// ---------------------------------------------------------------------------
// Connect + look up event
// ---------------------------------------------------------------------------
const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}`);

const evResult = await db.query('SELECT id FROM events WHERE slug = $slug LIMIT 1', { slug: args.eventSlug });
const eventId = evResult?.[0]?.[0]?.id;
if (!eventId) {
  console.error(`event with slug "${args.eventSlug}" not found. Run surreal-write-event.mjs first.`);
  process.exit(1);
}
console.log(`event:     ${eventId}`);

// ---------------------------------------------------------------------------
// Indexes (idempotent)
// ---------------------------------------------------------------------------
await db.query(`
  DEFINE INDEX IF NOT EXISTS email ON persons       FIELDS email UNIQUE;
  DEFINE INDEX IF NOT EXISTS slug  ON organizations FIELDS slug  UNIQUE;
`);
console.log('indexes:   persons.email UNIQUE, organizations.slug UNIQUE');
console.log('');

// ---------------------------------------------------------------------------
// Walk attendees
// ---------------------------------------------------------------------------
let persons_created = 0, persons_merged = 0;
let orgs_created = 0, orgs_reused = 0;
let obs_email = 0, obs_funnel = 0, obs_affiliated = 0;
let errored = 0;
const errors = [];
const orgCache = new Map();  // slug → org id
const t0 = Date.now();

for (let i = 0; i < attendees.length; i += 1) {
  const a = attendees[i];
  if (!a.email) { errored += 1; errors.push(`row ${i}: no email`); continue; }
  const emailLc = a.email.toLowerCase();

  try {
    // ----- person ---------------------------------------------------------
    const existing = await db.query('SELECT id FROM persons WHERE email = $email LIMIT 1', { email: emailLc });
    let personId = existing?.[0]?.[0]?.id;
    if (personId) {
      await db.query(
        `UPDATE $id SET
            last_seen_at    = time::now(),
            client_access   = array::union(client_access ?? [], [$client]),
            last_touched_by = $client,
            last_touched_at = time::now()`,
        { id: personId, client: args.client },
      );
      persons_merged += 1;
    } else {
      const created = await db.query(
        `CREATE persons SET
            id = rand::uuid::v7(),
            email = $email,
            source = "gatsby-events",
            client_access = [$client],
            first_touched_by = $client,
            last_touched_by  = $client,
            last_touched_at  = time::now(),
            first_seen_at = time::now(),
            last_seen_at  = time::now()
         RETURN id;`,
        { email: emailLc, client: args.client },
      );
      personId = created?.[0]?.[0]?.id;
      persons_created += 1;
    }

    // ----- has_email observation ------------------------------------------
    await db.query(
      `CREATE observations SET
          id          = rand::uuid::v7(),
          subject     = $subject,
          predicate   = "has_email",
          object      = $email,
          observed_at = time::now(),
          source      = "gatsby-events",
          client      = $client;`,
      { subject: personId, email: emailLc, client: args.client },
    );
    obs_email += 1;

    // ----- funnel observation ---------------------------------------------
    const funnel = parseRsvpEvent(a.rsvp_event);
    if (funnel) {
      await db.query(
        `CREATE observations SET
            id          = rand::uuid::v7(),
            subject     = $subject,
            predicate   = $predicate,
            object      = $object,
            observed_at = $observed_at,
            source      = "gatsby-events",
            client      = $client;`,
        { subject: personId, predicate: funnel.predicate, object: eventId, observed_at: funnel.observed_at, client: args.client },
      );
      obs_funnel += 1;
    }

    // ----- organization (when q2_company filled) --------------------------
    if (a.q2_company) {
      const orgSlug = slugify(a.q2_company);
      let orgId = orgCache.get(orgSlug);
      if (!orgId) {
        const existingOrg = await db.query('SELECT id FROM organizations WHERE slug = $slug LIMIT 1', { slug: orgSlug });
        orgId = existingOrg?.[0]?.[0]?.id;
        if (orgId) {
          await db.query(
            `UPDATE $id SET
                client_access   = array::union(client_access ?? [], [$client]),
                last_touched_by = $client,
                last_touched_at = time::now()`,
            { id: orgId, client: args.client },
          );
          orgs_reused += 1;
        } else {
          const createdOrg = await db.query(
            `CREATE organizations SET
                id = rand::uuid::v7(),
                slug = $slug,
                complete_name = $name,
                conventional_name = $name,
                source = "gatsby-events:q2_company",
                client_access = [$client],
                first_touched_by = $client,
                last_touched_by  = $client,
                last_touched_at  = time::now(),
                first_seen_at = time::now(),
                last_seen_at  = time::now()
             RETURN id;`,
            { slug: orgSlug, name: a.q2_company, client: args.client },
          );
          orgId = createdOrg?.[0]?.[0]?.id;
          orgs_created += 1;
        }
        orgCache.set(orgSlug, orgId);
      }
      // affiliated_with observation
      await db.query(
        `CREATE observations SET
            id          = rand::uuid::v7(),
            subject     = $subject,
            predicate   = "affiliated_with",
            object      = $object,
            observed_at = time::now(),
            source      = "gatsby-events:q2_company",
            qualifiers  = { kind: "operator-confirmed", title: $title },
            client      = $client;`,
        { subject: personId, object: orgId, title: a.q3_position || '', client: args.client },
      );
      obs_affiliated += 1;
    }

    if ((i + 1) % 25 === 0) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`  ${i + 1}/${attendees.length} (persons +${persons_created}/${persons_merged}, obs ${obs_email + obs_funnel + obs_affiliated}, orgs ${orgs_created}/${orgs_reused}) ${elapsed}s\n`);
    }
  } catch (err) {
    errored += 1;
    errors.push(`${a.email}: ${err && err.message ? err.message : err}`);
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
console.log(`done in ${elapsed}s`);
console.log(`  persons created: ${persons_created}`);
console.log(`  persons merged:  ${persons_merged}`);
console.log(`  has_email obs:   ${obs_email}`);
console.log(`  funnel obs:      ${obs_funnel}`);
console.log(`  affiliated obs:  ${obs_affiliated}`);
console.log(`  orgs created:    ${orgs_created}`);
console.log(`  orgs reused:     ${orgs_reused}`);
console.log(`  errored:         ${errored}`);
if (errors.length) {
  console.log('first 5 errors:');
  for (const e of errors.slice(0, 5)) console.log(`  - ${e}`);
}

await db.close();
process.exit(errored ? 1 : 0);
