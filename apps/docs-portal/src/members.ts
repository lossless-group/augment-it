// Members that publish a component library.
//
// The portal AGGREGATES; it does not own. Each entry is a federation remote
// exposing `./gallery`, loaded on demand — so the index of libraries is central
// (one place to go look), while every library itself still ships from the member
// that owns it, built from that member's own components and its own stylesheet.
// A central library that imported from members would have re-created exactly the
// single queue federation exists to avoid.
//
// Adding a member is three lines here plus three in that member's own repo:
// a `./gallery` expose, a catalog, and the standalone hash branch. The recipe
// is in context-v/specs/Federated-Component-Libraries.md.

export type MemberLibrary = {
  id: string;
  /** Registry name from DESIGN.md frontmatter. */
  name: string;
  /** Registry prefix — shown so the index doubles as the prefix table. */
  prefix: string;
  /** Where the member serves itself. Standalone links point here. */
  origin: string;
  summary: string;
  importGallery: () => Promise<Record<string, unknown>>;
};

const env = (import.meta as { env?: Record<string, string> }).env ?? {};

// `||` not `??`: an unset Docker ARG becomes an EMPTY STRING once assigned to
// ENV, and `??` would ship the empty string. That bug has bitten this repo
// before — see the remotes block in shell/rsbuild.config.ts.
const CORPORA_CURATOR_ORIGIN = env.PUBLIC_CORPORA_CURATOR_ORIGIN || 'http://localhost:3017';

export const MEMBER_LIBRARIES: MemberLibrary[] = [
  {
    id: 'corporaCurator',
    name: 'corpora-curator',
    prefix: 'cc',
    origin: CORPORA_CURATOR_ORIGIN,
    summary: 'Corpora Curator — 10 class recipes, 5 component entries, 33 fixtures. Tier B, debt: high.',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importGallery: () => import('corporaCurator/gallery'),
  },
];
