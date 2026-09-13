// `import.meta.env.DEV` is injected by rsbuild in every member that consumes
// this package. Declared OPTIONAL on purpose: shared-ui is a library, not an
// app, and it must not assume the consumer's bundler defines the field. The
// `?.` at the call site plus this optional declaration means a bundler that
// omits it degrades to "not dev" instead of throwing at module scope.
interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly MODE?: string;
}

interface ImportMeta {
  readonly env?: ImportMetaEnv;
}
