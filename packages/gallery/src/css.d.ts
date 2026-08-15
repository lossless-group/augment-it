// Side-effect CSS imports carry no type declarations — rsbuild resolves them at
// build time. Declared ambiently so svelte-check / tsc can resolve them.
declare module '*.css';
