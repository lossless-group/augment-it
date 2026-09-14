// Side-effect CSS imports (./app.css, @augment-it/theme/theme.css) carry no
// type declarations — rsbuild resolves them at build time. Declare them
// ambiently so svelte-check / tsc (stricter under TS 6) can resolve the
// side-effect imports instead of erroring on the missing module.
declare module '*.css';
