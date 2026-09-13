// Side-effect CSS imports (@augment-it/theme/token-baseline.css) carry no type
// declarations — rsbuild resolves them at build time. Declare them ambiently
// so svelte-check / tsc (stricter under TS 6) can resolve the side-effect
// imports instead of erroring on the missing module.
//
// Same fix as shell/src/css.d.ts, and the same two halves: the shim is inert
// unless "src/**/*.d.ts" is in this package's tsconfig `include`. federation
// had neither half, and nothing surfaced it — the package's `typecheck` script
// exists but no root script sweeps it, so `tsc --noEmit` here has been red on
// TS2882 for as long as line 42 of src/index.ts has imported the token
// baseline.
declare module '*.css';
