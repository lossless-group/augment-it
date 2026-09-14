/// <reference path="../env.d.ts" />
//
// THE REFERENCE ABOVE IS LOAD-BEARING, and it is papering over a real defect.
//
// Button.svelte reads `import.meta.env?.DEV`, and the ambient declaration that
// makes that legal lives in ../env.d.ts. An ambient .d.ts only enters a program
// when something pulls it in, and a package's `exports` map cannot pull one in —
// so it is in scope inside THIS package and in no consumer's project. Before
// this file existed, apps/docs-portal never had packages/shared-ui/src in its
// diagnosed set at all, so the gate was green by not looking; the first import
// that reached into this directory turned a latent error into a reported one.
// The reference makes env.d.ts part of any program that reaches the gallery,
// which is enough for the portal because the declaration it carries is global.
//
// It is NOT a fix for the general case — a consumer importing only
// Button.svelte still has no declaration — and the real repair belongs to
// packages/shared-ui's TypeScript surface, not to a documentation catalog.
// Raised in the report rather than chased here.

// The federal library's mount — the shape a member's ./gallery expose has, minus
// the two things a member needs and this package does not.
//
// NO `import '../app.css'`. Every member's gallery mount imports its own
// stylesheet immediately after the gallery package, and the ORDER is
// load-bearing: the gallery pulls in token-baseline.css, the @property floor that
// keeps a member legible when it outruns the deployed shell, and a member's rules
// read those tokens. This package has no app.css at all — the primitives carry
// their own scoped <style> blocks and read the federal vocabulary directly, which
// is exactly why they render correctly under any member's root class or none.
// There is nothing here to order.
//
// NO federation expose. A member serves itself and publishes `./gallery`
// alongside `./mount` on its own remote; there is no server on the other end of
// a package, so apps/docs-portal imports this module across the workspace
// instead. That is not the portal OWNING the library — the catalog still ships
// from the package that ships the components, which is the property §2 of
// Federated-Component-Libraries is actually protecting. What the portal must
// never do is import a MEMBER's components, and it still does not.

import { makeGalleryMount } from '@augment-it/gallery';
import catalog from './catalog';

export const mountFederalGallery = makeGalleryMount(catalog);
export { default as federalCatalog } from './catalog';
