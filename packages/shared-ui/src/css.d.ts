// Side-effect CSS imports carry no type declarations — the consuming bundler
// resolves them at build time. Declared ambiently so svelte-check / tsc can.
//
// This package imports no CSS of its own. The declaration is needed because
// src/gallery/mount.ts imports @augment-it/gallery, whose index.ts pulls in
// token-baseline.css and gallery.css; svelte-check follows across the workspace
// link and type-checks that file under THIS project's options, where the
// neighbouring package's own css.d.ts is not in scope.
declare module '*.css';
