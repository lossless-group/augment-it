/**
 * The refusal stub. Anything that would open a socket resolves to this.
 *
 * person-enrichment reaches SurrealDB DIRECTLY from the browser with build-time
 * credentials (src/lib/surreal.ts), so "the test accidentally talked to a
 * service" is not a hypothetical here — it is a write against the canonical
 * database. Every export throws, including the constructor, so the failure is a
 * stack trace naming this file rather than a silent success against production.
 */
const refuse = (what: string): never => {
  throw new Error(`no-service stub: refusing ${what} — tests never talk to a service`);
};

export class Surreal {
  constructor() {
    refuse('new Surreal()');
  }
}

export const workspace = new Proxy(
  {},
  {
    get(_t, prop) {
      return () => refuse(`workspace.${String(prop)}()`);
    },
  },
);

export function getDb(): never {
  return refuse('getDb()');
}
export function query(): never {
  return refuse('query()');
}
export const CLIENT = 'stub-client';
export const SURREAL_NS = 'stub-ns';
export const SURREAL_DB = 'stub-db';
