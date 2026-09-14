// Standalone entry. theme.css first — it defines the :root tokens and all three
// mode blocks; mode-switcher applies the stored data-mode on import.
import '@augment-it/theme/theme.css';
import '@augment-it/theme/mode-switcher';
import './app.css';
import { mount } from 'svelte';
import { galleryRequested, mountGalleryStandalone } from '@augment-it/gallery';
import App from './App.svelte';

const target = document.getElementById('root') ?? document.body;

// The gallery hash branch a member normally carries for itself.
//
// The federal library lives in a PACKAGE, and a package has no origin — so this
// app is the origin its catalog declares, and this app has to honour the third
// of the three addresses on its behalf:
//
//   http://localhost:3020/#/gallery/button-matrix/matrix?iso=1
//
// That URL is the load-bearing one (Federated-Component-Libraries §3): one
// specimen, no chrome, openable on a phone against the LAN address, droppable
// into a bug report, screenshottable without the shell. Without this branch the
// federal catalog's isolate links would resolve to the token page, which is a
// broken promise on the one library everything else consumes.
//
// Hash routing is ON here and OFF when the same library is mounted inside the
// portal's Components view, for the reason spelled out in packages/gallery's
// router: standalone the hash is this app's to spend; federated into the shell
// it is the SHELL's.
//
// The import is dynamic so the product bundle does not carry the fixtures.
if (galleryRequested()) {
  void import('@augment-it/shared-ui/gallery').then(({ federalCatalog }) => {
    mountGalleryStandalone(federalCatalog, target);
  });
} else {
  mount(App, { target });
}
