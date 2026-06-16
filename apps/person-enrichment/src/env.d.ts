// Environment variables injected at build time via rsbuild's
// `source.define` (see rsbuild.config.ts). All five are required for the
// SurrealDB connection to succeed; the surreal.ts helper throws loud if
// any are empty.

interface ImportMetaEnv {
  readonly SURREAL_URL:    string;
  readonly SURREAL_NS:     string;
  readonly SURREAL_DB:     string;
  readonly SURREAL_USER:   string;
  readonly SURREAL_PASS:   string;
  readonly SURREAL_CLIENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
