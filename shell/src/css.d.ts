// Side-effect CSS imports (@augment-it/theme/theme.css) carry no type
// declarations — rsbuild resolves them at build time. Declare them ambiently
// so svelte-check / tsc (stricter under TS 6) can resolve the side-effect
// imports instead of erroring on the missing module.
//
// Every app under apps/ has carried this shim; the shell never did, because
// its tsconfig omitted "src/**/*.d.ts" from `include` and the file would have
// been ignored anyway. Both halves are fixed together.
declare module '*.css';
