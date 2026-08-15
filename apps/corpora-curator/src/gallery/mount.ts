// Federation-exposed gallery mount — the second thing this member exposes.
//
// A member now publishes two contracts: `./mount` is the product surface, and
// `./gallery` is what it is made of. Same remote, same bundle, same stylesheet,
// so the specimens are the real components and not a copy that drifted.
//
// IMPORT ORDER IS LOAD-BEARING and identical to ./src/mount.ts's: the gallery
// package pulls in token-baseline.css (the @property floor that keeps a member
// legible when it outruns the deployed shell — see packages/federation), so it
// must evaluate BEFORE '../app.css', whose rules read those tokens. ES module
// imports evaluate in declaration order. Swap these two lines and the specimens
// render unstyled.

import { makeGalleryMount } from '@augment-it/gallery';
import '../app.css';
import catalog from './catalog';

export const mountStrategyCuratorGallery = makeGalleryMount(catalog);
