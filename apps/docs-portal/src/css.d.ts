// Side-effect CSS imports carry no type declarations — rsbuild resolves them at
// build time. Declare them ambiently so svelte-check can resolve the imports.
declare module '*.css';
