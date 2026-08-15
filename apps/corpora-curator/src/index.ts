// Standalone entry (:3017). theme.css for tokens + mode-switcher for theme;
// both load before app.css so component styles' var() refs resolve. In the
// shell, mount.ts is the entry instead.
//
// One branch: `#/gallery…` serves the component library instead of the app.
// Standalone, this member owns its own hash, so the gallery routes on it —
// which is what makes a single specimen addressable at
// http://localhost:3017/#/gallery/source-row/active?iso=1 (or the LAN IP,
// where the point is that a reviewer needs neither the shell nor this repo).
// Federated, the hash belongs to the shell and the gallery keeps its route in
// state instead — see packages/gallery/src/router.ts.
//
// The catalog is imported DYNAMICALLY. It pulls in every component, every
// fixture and the pattern file; a static import would put all of that in the
// product bundle for the benefit of a URL almost nobody visits.
import '@augment-it/theme/theme.css';
import '@augment-it/theme/mode-switcher';
import { galleryRequested, mountGalleryStandalone } from '@augment-it/gallery';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('root');
if (!target) throw new Error('no #root');

if (galleryRequested()) {
  void import('./gallery/catalog').then(({ default: catalog }) => {
    mountGalleryStandalone(catalog, target);
  });
} else {
  mount(App, { target });
}

// Crossing INTO or OUT OF the gallery swaps which root component owns the page,
// so it is a reload rather than a re-render. Route changes WITHIN the gallery
// are handled by the gallery itself and must not trip this.
let inGallery = galleryRequested();
window.addEventListener('hashchange', () => {
  if (galleryRequested() !== inGallery) {
    inGallery = !inGallery;
    location.reload();
  }
});
