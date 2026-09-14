// The component-library registry.
//
// The portal AGGREGATES; it does not own. Each member entry is a federation
// remote exposing `./gallery`, loaded on demand — so the index of libraries is
// central (one place to go look), while every library itself still ships from
// the member that owns it, built from that member's own components and its own
// stylesheet. A central library that imported from members would have re-created
// exactly the single queue federation exists to avoid.
//
// Adding a member is three lines here plus three in that member's own repo:
// a `./gallery` expose, a catalog, and the standalone hash branch. The recipe
// is in context-v/specs/Federated-Component-Libraries.md.
//
// ---------------------------------------------------------------------------
// THE FEDERAL LIBRARY IS NOT ONE OF THEM, AND IT IS DELIBERATELY FIRST.
//
// `packages/shared-ui` publishes Button (292 call sites across 20 units) and
// Chip (103 across 13, counted the same way on 2026-09-13) — the two
// most-consumed components in the system by a wide margin. Its library is declared SEPARATELY below rather than appended to
// MEMBER_LIBRARIES, because it differs from a member in all three of the things
// this file records:
//
//   · It is not a remote. There is no server on the other end of a package, so
//     it loads as an ordinary workspace import rather than over Module
//     Federation. Nothing has to be running for it to mount, which is why it is
//     also the only library that cannot fail with "the member is not running".
//   · It has no origin of its own. THIS app serves it, so its isolate links
//     point back here, and src/index.ts carries the gallery hash branch a member
//     normally carries for itself.
//   · It has no prefix in the member sense. `ui-*` is a reserved FEDERAL
//     namespace, not one member's claim on a name.
//
// The asymmetry in the data is the asymmetry in the architecture, and flattening
// it into an array with a `kind` field would have hidden exactly the distinction
// the page exists to teach. The federal layer is what every member consumes; it
// reads first, above the grid, not as the twentieth card in it.
//
// What is NOT weakened by this: the portal still never imports a MEMBER's
// components. The federal catalog ships from the same package that ships the
// components it documents — the same "the owner declares it" rule every member
// follows.
// ---------------------------------------------------------------------------

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

export type FederalLibrary = {
  id: string;
  name: string;
  /** The reserved federal class namespace, shown the same way a prefix is. */
  prefix: string;
  /** Where the package lives, since there is no origin to point at. */
  source: string;
  summary: string;
  importGallery: () => Promise<Record<string, unknown>>;
};

const env = (import.meta as { env?: Record<string, string> }).env ?? {};

// `||` not `??`: an unset Docker ARG becomes an EMPTY STRING once assigned to
// ENV, and `??` would ship the empty string. That bug has bitten this repo
// before — see the remotes block in shell/rsbuild.config.ts.
const CORPORA_CURATOR_ORIGIN = env.PUBLIC_CORPORA_CURATOR_ORIGIN || 'http://localhost:3017';
const REQUEST_REVIEWER_ORIGIN = env.PUBLIC_REQUEST_REVIEWER_ORIGIN || 'http://localhost:3004';

/** The platform's own library. One, and there will only ever be one. */
export const FEDERAL_LIBRARY: FederalLibrary = {
  id: 'sharedUi',
  name: 'shared-ui',
  prefix: 'ui',
  source: 'packages/shared-ui',
  summary:
    'The federal primitives every member shares — Button (6 variants × 4 sizes, 292 call sites across 20 units) and Chip (6 tones × 2 sizes, 103 across 13), the five-rung override ladder, and the rule for deciding which of the two a thing is. Not a member and not a remote: a workspace package, so this library mounts whether or not anything else is running.',
  // A plain workspace import, not a federation remote — see the block above.
  // This resolves through packages/shared-ui's `./gallery` export to
  // src/gallery/mount.ts, which is the same makeGalleryMount() call every
  // member's ./gallery expose makes.
  importGallery: () => import('@augment-it/shared-ui/gallery') as Promise<Record<string, unknown>>,
};

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
  {
    // Registered 2026-09-13. The catalog, the `./gallery` expose and the
    // standalone hash branch had all shipped with the Button rollout; the row
    // here had not, so the library existed and was invisible to everyone who did
    // not already know the member's port. That is the same hand-maintained-list
    // failure design-drift's S5 check exists to catch one level up, and it is
    // worth noting that nothing failed — the library simply was not there.
    id: 'requestReviewer',
    name: 'request-reviewer',
    prefix: 'req',
    origin: REQUEST_REVIEWER_ORIGIN,
    summary:
      'Request Reviewer — 4 federal-primitive entries, 8 local recipes, 20 fixtures. Tier C, debt: none. The first member to adopt the shared Button: nine hand-rolled buttons replaced, 41 lines of CSS deleted, zero override rungs spent.',
    // @ts-expect-error — federation remote, type comes from the MF runtime
    importGallery: () => import('requestReviewer/gallery'),
  },
];
