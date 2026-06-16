#!/usr/bin/env node
// ============================================================================
// surreal-backfill-client-tagging.mjs
//
// One-shot backfill that brings the existing canonical data up to the
// Client-Tagging-on-Canonical-Writes spec.
//
// What it does (all idempotent — safe to re-run):
//   1. Defines `client_access` indexes on persons, organizations, locations,
//      events.
//   2. Stamps every existing `observations` row with `client = "humain-vc"`
//      WHERE the field is missing. (The pre-2026-06-15 cohort was the
//      LinkedIn-network walker's output, which was a humain-vc workflow.)
//   3. Sets `client_access = ["humain-vc"]` + first/last_touched_by/at on
//      every `persons` and `locations` row WHERE client_access is missing.
//   4. For the existing event (which already has a `client` field from
//      surreal-write-event.mjs), copies that into `client_access = [client]`.
//
// After this, every canonical entity carries a materialized client_access
// array, and every observation knows which client produced it.
// ============================================================================

import { Surreal } from 'surrealdb';

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });
console.log(`connected: ${process.env.SURREAL_NS}/${process.env.SURREAL_DB}`);

// ---------------------------------------------------------------------------
// 1. Indexes on client_access for fast filter.
// ---------------------------------------------------------------------------
await db.query(`
  DEFINE INDEX IF NOT EXISTS client_access ON persons        FIELDS client_access;
  DEFINE INDEX IF NOT EXISTS client_access ON organizations  FIELDS client_access;
  DEFINE INDEX IF NOT EXISTS client_access ON locations      FIELDS client_access;
  DEFINE INDEX IF NOT EXISTS client_access ON events         FIELDS client_access;
`);
console.log('indexes: client_access on persons, organizations, locations, events');
console.log('');

// ---------------------------------------------------------------------------
// 2. Backfill observations with client = "humain-vc" where missing.
// ---------------------------------------------------------------------------
const o0 = Date.now();
const obsResult = await db.query(`
  LET $missing = (SELECT count() FROM observations WHERE client IS NONE GROUP ALL);
  UPDATE observations SET client = "humain-vc" WHERE client IS NONE;
  RETURN $missing;
`);
const obsCount = obsResult?.[2]?.[0]?.count ?? 0;
console.log(`observations: stamped ${obsCount} with client="humain-vc" (${((Date.now() - o0) / 1000).toFixed(1)}s)`);

// ---------------------------------------------------------------------------
// 3. Backfill persons with client_access = ["humain-vc"] where missing.
// ---------------------------------------------------------------------------
const p0 = Date.now();
const pResult = await db.query(`
  LET $missing = (SELECT count() FROM persons WHERE client_access IS NONE GROUP ALL);
  UPDATE persons SET
    client_access    = ["humain-vc"],
    first_touched_by = "humain-vc",
    last_touched_by  = "humain-vc",
    last_touched_at  = time::now()
  WHERE client_access IS NONE;
  RETURN $missing;
`);
const pCount = pResult?.[2]?.[0]?.count ?? 0;
console.log(`persons:      stamped ${pCount} with client_access=["humain-vc"] (${((Date.now() - p0) / 1000).toFixed(1)}s)`);

// ---------------------------------------------------------------------------
// 4. Backfill locations same way.
// ---------------------------------------------------------------------------
const l0 = Date.now();
const lResult = await db.query(`
  LET $missing = (SELECT count() FROM locations WHERE client_access IS NONE GROUP ALL);
  UPDATE locations SET
    client_access    = ["humain-vc"],
    first_touched_by = "humain-vc",
    last_touched_by  = "humain-vc",
    last_touched_at  = time::now()
  WHERE client_access IS NONE;
  RETURN $missing;
`);
const lCount = lResult?.[2]?.[0]?.count ?? 0;
console.log(`locations:    stamped ${lCount} with client_access=["humain-vc"] (${((Date.now() - l0) / 1000).toFixed(1)}s)`);

// ---------------------------------------------------------------------------
// 5. Events — copy existing `client` field into client_access array.
// ---------------------------------------------------------------------------
const e0 = Date.now();
const eResult = await db.query(`
  LET $missing = (SELECT count() FROM events WHERE client_access IS NONE AND client IS NOT NONE GROUP ALL);
  UPDATE events SET
    client_access    = [client],
    first_touched_by = client,
    last_touched_by  = client,
    last_touched_at  = time::now()
  WHERE client_access IS NONE AND client IS NOT NONE;
  RETURN $missing;
`);
const eCount = eResult?.[2]?.[0]?.count ?? 0;
console.log(`events:       stamped ${eCount} with client_access=[client] (${((Date.now() - e0) / 1000).toFixed(1)}s)`);

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------
console.log('');
const verify = await db.query(`
  SELECT count() AS persons_total FROM persons GROUP ALL;
  SELECT count() AS persons_tagged FROM persons WHERE client_access CONTAINS "humain-vc" GROUP ALL;
  SELECT count() AS locations_total FROM locations GROUP ALL;
  SELECT count() AS locations_tagged FROM locations WHERE client_access CONTAINS "humain-vc" GROUP ALL;
  SELECT count() AS observations_total FROM observations GROUP ALL;
  SELECT count() AS observations_tagged FROM observations WHERE client = "humain-vc" GROUP ALL;
  SELECT count() AS events_total FROM events GROUP ALL;
  SELECT count() AS events_tagged FROM events WHERE client_access CONTAINS "reach-edu" GROUP ALL;
`);
console.log('verify:');
console.log(`  persons:       ${verify?.[0]?.[0]?.persons_total ?? 0} total, ${verify?.[1]?.[0]?.persons_tagged ?? 0} humain-vc-tagged`);
console.log(`  locations:     ${verify?.[2]?.[0]?.locations_total ?? 0} total, ${verify?.[3]?.[0]?.locations_tagged ?? 0} humain-vc-tagged`);
console.log(`  observations:  ${verify?.[4]?.[0]?.observations_total ?? 0} total, ${verify?.[5]?.[0]?.observations_tagged ?? 0} humain-vc-tagged`);
console.log(`  events:        ${verify?.[6]?.[0]?.events_total ?? 0} total, ${verify?.[7]?.[0]?.events_tagged ?? 0} reach-edu-tagged`);

await db.close();
process.exit(0);
