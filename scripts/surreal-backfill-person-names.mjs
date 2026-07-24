// Scope + (with APPLY=1) backfill: persons rows missing `name` but holding
// full_name (or first_name/surname). Additive — fills a missing field only,
// never overwrites an existing name.
import { Surreal } from 'surrealdb';

const { SURREAL_URL, SURREAL_NS, SURREAL_DB, SURREAL_USER, SURREAL_PASS, APPLY } = process.env;
const db = new Surreal();
await db.connect(SURREAL_URL);
await db.signin({ username: SURREAL_USER, password: SURREAL_PASS });
await db.use({ namespace: SURREAL_NS, database: SURREAL_DB });

const counts = await db.query(`
  RETURN {
    total: (SELECT VALUE count() FROM persons GROUP ALL)[0],
    with_name: (SELECT VALUE count() FROM persons WHERE name IS NOT NONE AND name != '' GROUP ALL)[0],
    missing_name_has_full: (SELECT VALUE count() FROM persons WHERE (name IS NONE OR name = '') AND full_name IS NOT NONE AND full_name != '' GROUP ALL)[0],
    missing_name_parts_only: (SELECT VALUE count() FROM persons WHERE (name IS NONE OR name = '') AND (full_name IS NONE OR full_name = '') AND first_name IS NOT NONE GROUP ALL)[0],
    missing_everything: (SELECT VALUE count() FROM persons WHERE (name IS NONE OR name = '') AND (full_name IS NONE OR full_name = '') AND first_name IS NONE GROUP ALL)[0]
  };
`);
console.log('scope:', JSON.stringify(counts?.[0]));

if (APPLY === '1') {
  const r1 = await db.query(`
    UPDATE persons SET name = full_name
      WHERE (name IS NONE OR name = '') AND full_name IS NOT NONE AND full_name != ''
      RETURN person_uuid, name;
  `);
  console.log('backfilled from full_name:', (r1?.[0] ?? []).length);
  const r2 = await db.query(`
    UPDATE persons SET name = string::trim(string::concat(first_name ?? '', ' ', surname ?? ''))
      WHERE (name IS NONE OR name = '') AND (full_name IS NONE OR full_name = '') AND first_name IS NOT NONE
      RETURN person_uuid, name;
  `);
  console.log('backfilled from first+surname:', (r2?.[0] ?? []).length);
  const check = await db.query(
    `SELECT VALUE name FROM persons WHERE person_uuid = '019f3b9c-52ac-7a91-b47e-cfab416eb33d';`,
  );
  console.log('melanie now:', JSON.stringify(check?.[0]));
}
await db.close();
