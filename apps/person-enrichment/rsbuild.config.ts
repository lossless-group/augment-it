import { defineConfig } from '@rsbuild/core';
import { pluginSvelte } from '@rsbuild/plugin-svelte';
import { pluginModuleFederation } from '@module-federation/rsbuild-plugin';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Federated remote — person-enrichment. Per-event UI for turning email-only
// sparse `persons` rows into named persons with socials, attached to the
// right organization. v0 hardcodes the Turning-Jobs-Into-Degrees event;
// event-picker is a later slice.
//
// Talks directly to SurrealDB Cloud via the browser-compatible SDK.
// Credentials come in through rsbuild's `source.define` at build time —
// dev only, single-operator. A proper proxy service replaces this when a
// second operator shows up or when we ship beyond local.

// Hand-parse the augment-it repo root .env so the operator doesn't have
// to `set -a; . ./.env; set +a` before every dev run. process.env wins
// when set, so `SURREAL_CLIENT=humain-vc pnpm dev` still works for
// switching workspaces ad-hoc.
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const ENV_PATH  = resolve(REPO_ROOT, '.env');

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let [, k, v] = m;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const fileEnv  = parseEnvFile(ENV_PATH);
const E = (k: string): string => process.env[k] ?? fileEnv[k] ?? '';

export default defineConfig({
  plugins: [
    pluginSvelte(),
    pluginModuleFederation({
      name: 'personEnrichment',
      filename: 'remoteEntry.js',
      exposes: {
        './mount': './src/mount.ts',
      },
      dts: false,
    }),
  ],
  source: {
    entry: { index: './src/index.ts' },
    define: {
      'import.meta.env.SURREAL_URL':    JSON.stringify(E('SURREAL_URL')),
      'import.meta.env.SURREAL_NS':     JSON.stringify(E('SURREAL_NS')),
      'import.meta.env.SURREAL_DB':     JSON.stringify(E('SURREAL_DB')),
      'import.meta.env.SURREAL_USER':   JSON.stringify(E('SURREAL_USER')),
      'import.meta.env.SURREAL_PASS':   JSON.stringify(E('SURREAL_PASS')),
      'import.meta.env.SURREAL_CLIENT': JSON.stringify(E('SURREAL_CLIENT') || 'reach-edu'),
    },
  },
  output: {
    target: 'web',
    overrideBrowserslist: ['last 2 Chrome versions', 'last 2 Firefox versions', 'last 2 Safari versions'],
  },
  tools: {
    swc: {
      jsc: { target: 'es2022' },
    },
  },
  html: {
    title: 'augment-it · person-enrichment',
  },
  server: {
    port: 3015,
    cors: { origin: ['http://localhost:3100'] }, // the federation shell
  },
  dev: {
    assetPrefix: 'http://localhost:3015',
  },
});
