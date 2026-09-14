/**
 * corpora-curator — StatusIndicator ADOPTION, not StatusIndicator behaviour.
 *
 * packages/shared-ui/test/badges.test.ts already owns the contract: the six-way
 * tone mapping, auth_required as warn rather than error, the aria-hidden dot,
 * and the claim that every state renders a DISTINCT word. Re-asserting any of
 * that here would be a second copy of a claim that already has an owner, and
 * the second copy is the one that rots.
 *
 * What this member can get wrong is USING it, and this member is the one that
 * proves a source-level test is worth having. Fifteen members were migrated
 * because their colour was wrong. This one's colour was RIGHT — CONNECTION_TONE
 * in types.ts mapped all six states correctly — and the thing it still got
 * wrong was invisible to any colour check: it rendered the raw TypeScript union
 * member as the label, and a hand-written fallback chip in the workspace slot
 * claimed "connecting…" for four states that were not connecting.
 *
 * So these read this member's own source. A local tone map reappearing tomorrow
 * would look correct in every screenshot.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

/**
 * Assertions about what a file DOES must not be able to fail on what it SAYS.
 * Every file this suite reads carries prose naming the thing it no longer does
 * — that prose is the audit trail and deleting it to appease a regex would be
 * the test corrupting the record it exists to protect. So comments come out
 * before any `not.toMatch`.
 */
const code = (src: string) =>
  src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const CONN_STATES = ['idle', 'connecting', 'open', 'closed', 'error', 'auth_required'] as const;

describe('corpora-curator — connection state goes through StatusIndicator', () => {
  it('App.svelte imports the component and renders no hand-rolled tone map', () => {
    const src = read('src/App.svelte');
    expect(src).toMatch(
      /import StatusIndicator from '@augment-it\/shared-ui\/StatusIndicator\.svelte'/,
    );
    expect(src).toMatch(/<StatusIndicator\s+state=\{curation\.connection\}/);
    // The specific regression: a tone chosen in this member rather than read
    // off the component. `tone={SOMETHING[...]}` is the shape CONNECTION_TONE
    // had, and it is the shape any replacement for it would have.
    expect(code(src)).not.toMatch(/tone=\{[A-Z_]+\[/);
  });

  it('BOTH connection renderings in the header are the component', () => {
    // The right-hand indicator was never the broken one. The workspace slot
    // was: a literal tone="info" chip reading "connecting…", shown for every
    // non-open state, so idle / closed / error / auth_required all announced a
    // handshake in progress. Five states, one appearance, four of them false.
    const src = code(read('src/App.svelte'));
    const header = src.slice(src.indexOf('<header'), src.indexOf('</header>'));
    expect(header.match(/<StatusIndicator\b/g)?.length).toBe(2);
    expect(header).not.toMatch(/connecting…<\/Chip>/);
    expect(header).not.toMatch(/tone="info"/);
  });

  it('nothing renders the connection as a bare enum member any more', () => {
    // `{curation.connection}` as a text node is the defect a correct tone map
    // cannot reach: `auth_required` is a union member, not an instruction.
    const src = code(read('src/App.svelte'));
    expect(src).not.toMatch(/>\{curation\.connection\}</);
  });

  it('CONNECTION_TONE is deleted from types.ts, not merely unused', () => {
    // The deletion is the point of the job. A member that adopts the component
    // and keeps its map has added a dependency and removed nothing — and this
    // map in particular would keep looking right while it drifted.
    const src = code(read('src/types.ts'));
    expect(src).not.toMatch(/export const CONNECTION_TONE/);
  });

  it('what CONNECTION_TONE shared types.ts with survives, deliberately', () => {
    // ConnStatus still types curation.connection, and SOURCE_STATUS_TONE is a
    // genuinely member-local decision over a member-local vocabulary. Deleting
    // either of those alongside the connection map would have been the sweep
    // over-reaching.
    const src = read('src/types.ts');
    expect(src).toMatch(/export type ConnStatus/);
    expect(src).toMatch(/export const SOURCE_STATUS_TONE/);
  });

  it('ConnStatus stays the same six members as the component takes', () => {
    // Nothing enforces this at the type level — ConnStatus is declared locally
    // so curation.svelte.ts can type its field without importing from a
    // .svelte module. That makes it exactly the kind of union that drifts, so
    // the union the component declares is read off its source and compared.
    const local = read('src/types.ts').match(/export type ConnStatus = ([^;]+);/)![1];
    const federal = readFileSync(
      resolve(__dirname, '../../../packages/shared-ui/src/StatusIndicator.svelte'),
      'utf8',
    ).match(/export type ConnectionState =\s*([^;]+);/)![1];

    const members = (s: string) => new Set(s.match(/'[a-z_]+'/g) ?? []);
    expect(members(local)).toEqual(members(federal));
    expect(members(local).size).toBe(CONN_STATES.length);
  });

  it('the gallery demonstrates the component, not the map it replaced', () => {
    // The gallery is how another member learns what this one does. A specimen
    // that still tinted six raw enum members from a local map would teach the
    // defect to the next reader — and this member's specimen was the most
    // persuasive copy of it, because the tones in it were correct.
    const src = read('src/gallery/patterns.svelte');
    expect(src).toMatch(
      /import StatusIndicator from '@augment-it\/shared-ui\/StatusIndicator\.svelte'/,
    );
    expect(code(src)).not.toMatch(/CONNECTION_TONE/);
  });

  it('the catalog files it as federal and states all six states', () => {
    // A catalog entry that describes a local recipe which is now a federal
    // component is wrong in the one way this catalog exists to prevent, so the
    // section it lands in is part of the claim.
    const src = read('src/gallery/catalog.ts');
    const federal = src.slice(src.indexOf("id: 'federal'"), src.indexOf("id: 'recipes'"));
    expect(federal).toMatch(/id: 'status-indicator'/);
    expect(federal).toMatch(/packages\/shared-ui\/src\/StatusIndicator\.svelte/);

    // The header-bar control used to offer four of the six. idle and
    // auth_required being absent from a specimen is how a member ends up never
    // looking at the states it renders worst.
    for (const s of CONN_STATES) expect(src).toContain(`'${s}'`);
  });
});
