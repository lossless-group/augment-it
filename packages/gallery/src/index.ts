// @augment-it/gallery — the federated component-library runtime.
//
// One runtime, seventeen catalogs. A member declares WHAT it has; this package
// owns HOW it is browsed, isolated, deep-linked and audited. That split is the
// same bargain the design system itself struck: the federal layer owns the
// vocabulary and the enforcement, each member owns its own components — so a
// gallery that lived centrally and imported from members would have re-created
// the single queue federation exists to avoid.
//
// IMPORT ORDER IS LOAD-BEARING, for the reason spelled out at length in
// packages/federation/src/index.ts: token-baseline.css registers every Tier-2
// token with @property and an initial value, giving each one a floor when the
// deployed shell has not caught up. It must evaluate before any stylesheet whose
// rules read those tokens. ES module imports evaluate in declaration order, so
// a member importing THIS module before its own './app.css' is what preserves
// it. Flip those two lines and you are back to unstyled.
import '@augment-it/theme/token-baseline.css';
import '../gallery.css';

import { mount, unmount } from 'svelte';
import Gallery from './Gallery.svelte';
import { isGalleryHash } from './router';
import type { Catalog } from './types';

export { default as Gallery } from './Gallery.svelte';
export * from './types';
export {
  GALLERY_PREFIX,
  isGalleryHash,
  isolatedUrl,
  parseRoute,
  readRoute,
  serializeRoute,
  type Route,
} from './router';
export { audit, auditSettled, type AuditReport, type Finding } from './audit';

/**
 * Identity function with a type. Exists so a catalog file gets completion and
 * errors at the point of authorship rather than at the point of mount.
 */
export function defineGallery(catalog: Catalog): Catalog {
  return catalog;
}

export type MountResult = { destroy: () => void };
export type MountFn = (target: HTMLElement) => MountResult;

/**
 * Build the member's federation-exposed gallery mount.
 *
 *   import { makeGalleryMount } from '@augment-it/gallery';
 *   import '../app.css';
 *   import catalog from './catalog.svelte';
 *
 *   export const mountStrategyCuratorGallery = makeGalleryMount(catalog);
 *
 * `hashRouting` is off here on purpose. Federated, the document hash belongs to
 * the shell; a remote that wrote to it would be reaching outside its own
 * boundary. Deep links still work — they point at `catalog.origin`, where the
 * member owns the hash again. See ./router.ts.
 */
export function makeGalleryMount(catalog: Catalog): MountFn {
  return (target: HTMLElement): MountResult => {
    const component = mount(Gallery, { target, props: { catalog, hashRouting: false } });
    return { destroy: () => unmount(component) };
  };
}

/**
 * Mount the gallery standalone, on the member's own origin, WITH hash routing.
 * Call from the member's src/index.ts when `isGalleryHash()` is true.
 */
export function mountGalleryStandalone(catalog: Catalog, target: HTMLElement): MountResult {
  const component = mount(Gallery, { target, props: { catalog, hashRouting: true } });
  return { destroy: () => unmount(component) };
}

/**
 * The one-line branch a member's standalone entry needs:
 *
 *   if (galleryRequested()) { mountGalleryStandalone(catalog, root); }
 *   else { mount(App, { target: root }); }
 */
export function galleryRequested(): boolean {
  return isGalleryHash();
}
