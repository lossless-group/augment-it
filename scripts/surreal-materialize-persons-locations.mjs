#!/usr/bin/env node
// ============================================================================
// surreal-materialize-persons-locations.mjs
//
// For every person, rebuild from the observations table:
//   persons.observations.locations = [
//     { name, observed_at, source }, …                 // sorted desc by observed_at
//   ]
//   persons.location = observations.locations[0].name  // denormalized "current"
//
// The observations table is the truth. These two fields on persons are a
// materialized cache so that:
//   SELECT location FROM persons:X                   → "Brooklyn, …"
//   SELECT observations.locations FROM persons:X     → full history
// just work without traversing observations every time.
//
// Idempotent. Re-running with the same observations data is a no-op.
//
// Usage:
//   set -a; . ./.env; set +a
//   node scripts/surreal-materialize-persons-locations.mjs
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

const t0 = Date.now();

// Single server-side walk: for every person that has at least one
// located_in observation, rebuild the materialized fields.
const result = await db.query(`
  FOR $p IN (SELECT VALUE id FROM persons
              WHERE id IN (SELECT VALUE subject FROM observations
                             WHERE predicate = "located_in")) {
    LET $obs = (SELECT object.name AS name, observed_at, source
                  FROM observations
                  WHERE subject = $p AND predicate = "located_in"
                  ORDER BY observed_at DESC);
    UPDATE $p SET
      observations.locations = $obs,
      location = $obs[0].name;
  };
  RETURN (SELECT count() FROM persons
            WHERE observations.locations IS NOT NONE GROUP ALL);
`);

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
const count = result?.[1]?.[0]?.count ?? 0;
console.log(`materialized in ${elapsed}s`);
console.log(`persons with observations.locations: ${count}`);

await db.close();
process.exit(0);
