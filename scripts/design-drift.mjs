#!/usr/bin/env node

/*
 * design-drift.mjs — Phase 0 instrumentation. The F1–F11 enforcement checks
 * and contrast measurement for the augment-it federated design system.
 *
 * Author: RawNuke
 * Copyright (c) 2026 RawNuke. All rights reserved.
 *
 * Zero dependencies, pure Node. Reads the member registry from DESIGN.md
 * frontmatter. Adoption ramp (warn/fail) controls exit code.
 *
 * Usage:
 *   pnpm design:drift                           full sweep
 *   pnpm design:contrast                        contrast-only
 *   pnpm design:structure                       S1-S5 structural invariants only (gating)
 *   node scripts/design-drift.mjs --resolve     dump resolved Tier-2/3 values
 *   node scripts/design-drift.mjs --member sc   sweep one member
 *   node scripts/design-drift.mjs --json        machine-readable output
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DESIGN_MD = resolve(REPO_ROOT, 'DESIGN.md');
const THEME_CSS = resolve(REPO_ROOT, 'packages', 'theme', 'theme.css');
const MEMBER_EXCLUDE = new Set(['splash', 'packages', 'services', 'scripts', 'shell']);
const TIER1_COLOR_PREFIX = '--color__';
const TIER1_FONT_PREFIX = '--font__';
const ADOPTION = { warn: 0, fail: 1 };

const args = process.argv.slice(2);
const FLAG = {
  json: args.includes('--json'),
  resolve: args.includes('--resolve'),
  contrast: args.includes('--contrast'),
  structure: args.includes('--structure'),
  member: null,
};
{
  const mi = args.indexOf('--member');
  if (mi !== -1 && mi + 1 < args.length) FLAG.member = args[mi + 1];
}

function readIf(filePath) {
  try { return readFileSync(filePath, 'utf8'); } catch { return null; }
}

function normaliseLineEndings(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseFrontmatter(text) {
  const n = normaliseLineEndings(text);
  if (!n.startsWith('---\n')) return { content: n, data: null, raw: n };
  const end = n.indexOf('\n---\n', 4);
  if (end === -1) return { content: n, data: null, raw: n };
  const raw = n.slice(4, end);
  const content = n.slice(end + 5);
  try {
    const data = {};
    let key = null;
    for (const line of raw.split('\n')) {
      const m = line.match(/^(\s*)(\w[\w_-]*)\s*:\s*(.*)/);
      if (m) {
        key = m[2];
        let val = m[3].trim();
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else {
          const quoted = val.match(/^"(.*)"$/);
          if (quoted) val = quoted[1];
        }
        data[key] = val;
      } else if (key && line.trim().startsWith('-')) {
        const item = line.trim().replace(/^-\s*\{?\s*/, '').replace(/\s*\}?\s*$/, '');
        if (!Array.isArray(data[key])) data[key] = [];
        data[key].push(item);
      }
    }
    return { content, data, raw };
  } catch {
    return { content, data: null, raw };
  }
}

function parseMemberList(fm) {
  if (!fm || !fm.members) return [];
  const list = Array.isArray(fm.members) ? fm.members : [];
  const members = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      // `(\S+)` was greedy across the comma that separates frontmatter fields,
      // so `path: shell, prefix: …` yielded the path "shell," — and
      // resolve(REPO_ROOT, "shell,", "src") does not exist. findMemberFiles()
      // then returned [] for EVERY member, so every per-file check (F4 z-index,
      // F8 hardcoded hex / box-shadow, F1a Tier-1 consumption, leaked
      // selectors) silently found nothing and the run reported near-clean.
      // The only surviving symptom was F6 failing for all 19 members, which
      // reads as "per-member DESIGN.md files are Phase 8 work" rather than
      // "the checker cannot see the tree".
      //
      // This is the same failure this script's own notes warn about: a checker
      // reporting success because it failed to look. Stop each field at the
      // comma, and strip the quotes root_class carries.
      const parts = entry.match(/name:\s*([^,\s]+).*?path:\s*([^,\s]+).*?prefix:\s*([^,\s]+).*?root_class:\s*([^,\s]+)/);
      if (parts) {
        members.push({
          name: parts[1],
          path: parts[2],
          prefix: parts[3],
          rootClass: parts[4].replace(/^["']|["']$/g, ''),
        });
      }
    }
  }
  return members;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return null;
}

function relativeLuminance(r, g, b) {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseTokens(css) {
  const tokens = {};
  const blocks = css.split(/\n(?=\[|:root|@media|\*|body)/);
  const modeTokenSets = { dark: {}, light: {}, vibrant: {} };

  const tier1 = {};
  const tier2 = { dark: {}, light: {}, vibrant: {} };
  const tier3 = { dark: {}, light: {}, vibrant: {} };

  const propRe = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/gm;
  let match;

  let currentMode = null;
  const full = normaliseLineEndings(css);
  const lines = full.split('\n');
  let inRoot = false;
  let inDark = false;
  let inLight = false;
  let inVibrant = false;

  for (const line of lines) {
    if (line.includes(':root {') || line.includes(':root{')) {
      inRoot = true; inDark = false; inLight = false; inVibrant = false; continue;
    }
    if (line.includes('[data-mode=\'dark\']') || line.includes('[data-mode="dark"]')) {
      inDark = true; inRoot = false; continue;
    }
    if (line.includes('[data-mode=\'light\']') || line.includes('[data-mode="light"]')) {
      inLight = true; inDark = false; inRoot = false; continue;
    }
    if (line.includes('[data-mode=\'vibrant\']') || line.includes('[data-mode="vibrant"]')) {
      inVibrant = true; inLight = false; inDark = false; continue;
    }
    if (line.trim() === '}') {
      if (inVibrant) inVibrant = false;
      else if (inLight) inLight = false;
      else if (inDark) inDark = false;
      else if (inRoot) inRoot = false;
      continue;
    }
    const pm = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/);
    if (!pm) continue;
    const name = pm[1];
    const value = pm[2].trim();

    if (name.startsWith('--color__') || name.startsWith('--font__') || name.startsWith('--color__shadow')) {
      tier1[name] = value;
    }
    if (inDark) {
      if (name.startsWith('--fx-')) tier3.dark[name] = value;
      else if (!name.startsWith('--color__') && !name.startsWith('--font__') && !name.startsWith('--color__shadow')) {
        tier2.dark[name] = value;
      }
    } else if (inLight) {
      if (name.startsWith('--fx-')) tier3.light[name] = value;
      else if (!name.startsWith('--color__') && !name.startsWith('--font__') && !name.startsWith('--color__shadow')) {
        tier2.light[name] = value;
      }
    } else if (inVibrant) {
      if (name.startsWith('--fx-')) tier3.vibrant[name] = value;
      else if (!name.startsWith('--color__') && !name.startsWith('--font__') && !name.startsWith('--color__shadow')) {
        tier2.vibrant[name] = value;
      }
    }
  }

  tokens.tier1 = tier1;
  tokens.tier2 = tier2;
  tokens.tier3 = tier3;
  return tokens;
}

function resolveToken(token, tier2, tier1) {
  let value = token;
  let depth = 0;
  while (depth < 10) {
    const m = value.match(/var\((--[\w-]+)(?:\s*,\s*(.+?))?\)/);
    if (!m) break;
    const ref = m[1];
    const fallback = m[2] || '';
    if (tier2[ref]) {
      value = value.replace(m[0], tier2[ref]);
    } else if (tier1[ref]) {
      return tier1[ref];
    } else if (fallback) {
      value = value.replace(m[0], fallback);
    } else {
      return null;
    }
    depth++;
  }
  return null;
}

function findMemberFiles(memberPath) {
  const abs = resolve(REPO_ROOT, memberPath, 'src');
  if (!existsSync(abs)) return [];
  const files = [];
  function walk(dir) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(p);
        } else if (entry.isFile() && /\.(css|svelte|ts|js|mjs|svelte\.ts)$/.test(entry.name)) {
          files.push(p);
        }
      }
    } catch {}
  }
  walk(abs);
  return files;
}

function runMemberChecks(member, tokens) {
  const results = [];
  const files = findMemberFiles(member.path);
  const fullPath = resolve(REPO_ROOT, member.path);

  const mountTs = resolve(fullPath, 'src', 'mount.ts');
  const appCss = resolve(fullPath, 'src', 'app.css');
  const allCss = files.filter(f => f.endsWith('.css') || f.endsWith('.svelte'));

  for (const f of allCss) {
    const content = readIf(f);
    if (!content) continue;
    const n = normaliseLineEndings(content);

    // COMMENTS ARE NOT CODE, and treating them as code inverts the incentive.
    //
    // An engineer deleted a rule carrying `z-index: 5`, then wrote a comment
    // explaining the deletion — and F4 re-reported the literal from the prose.
    // The member sat at its old count until the sentence was reworded. So
    // DOCUMENTING A REMOVED DEFECT RE-CREATED IT IN THE GATE, which is a direct
    // incentive never to explain a deletion. F8 has the same blind spot on hex
    // literals, already recorded as a finding twice.
    //
    // This file's own header warns about a checker that reports success because
    // it failed to look. This is the inverse: a checker that reports failure
    // because it looked somewhere it should not.
    //
    // Strip /* */ and // and <!-- --> before any per-file pattern check. Kept as
    // a separate binding so a check that genuinely wants raw text still has `n`.
    // `//` is stripped ONLY outside .css. In CSS it is not a comment, and
    // `background: url(//cdn.example/x.png)` would have swallowed the rest of
    // the line — hiding a real declaration behind a protocol-relative URL. The
    // `[^:]` guard catches `https://` but not `url(//`.
    const isCss = f.endsWith('.css');
    let code = n
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');
    if (!isCss) code = code.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

    if (code.includes('--color__') || code.includes('--font__')) {
      const matches = code.match(/var\((--(?:color|font)__[\w-]+)/g);
      if (matches) {
        for (const m of matches) {
          const token = m.replace('var(', '');
          results.push({
            check: 'F1a',
            status: 'fail',
            file: relative(REPO_ROOT, f),
            detail: `Member consumes Tier 1 token ${token} — use Tier 2 instead`,
          });
        }
      }
    }

    const tier2Declared = code.match(/^\s*(--color-(?!__))[\w-]+\s*:/gm);
    if (tier2Declared) {
      for (const d of tier2Declared) {
        const name = d.match(/--[\w-]+/)[0];
        if (name !== `--${member.prefix}-`) {
          results.push({
            check: 'F1',
            status: 'fail',
            file: relative(REPO_ROOT, f),
            detail: `Member declares federal token ${name}`,
          });
        }
      }
    }

    if (/z-index\s*:\s*\d+/.test(code) && !/var\(--z-/.test(code)) {
      const matches = code.match(/z-index\s*:\s*(\d+)/g);
      if (matches) {
        for (const m of matches) {
          const val = parseInt(m.match(/\d+/)[0]);
          if (val > 0 && val < 900) {
            results.push({
              check: 'F4',
              status: 'fail',
              file: relative(REPO_ROOT, f),
              detail: `Raw z-index: ${val}. Use --z-* tokens.`,
            });
          }
        }
      }
    }

    // Svelte block syntax is not a colour. `{#each` contains `#eac` — three
    // consecutive hex digits — so a bare /#[0-9a-fA-F]{3,8}/ over whole-file text
    // flags every .svelte file with an each-block, forever, whatever its colours.
    //
    // Measured 2026-09-13 before this fix: 38 of 52 F8 hex findings were caused
    // SOLELY by this — 40% of the entire baseline. That matters beyond tidiness.
    // The Button rollout gates on 'the count must not increase', and a real
    // regression can hide inside a number that is mostly noise, while a member
    // 'improves' by deleting an each-block.
    //
    // Strip the block openers first. `{#if`, `{#await` and `{#key` do not produce
    // three hex digits and `{#each` is the only current culprit, but all are
    // stripped so a keyword added upstream cannot reintroduce this.
    // `code`, not `n` — a comment explaining a deleted colour used to re-report
    // it. Same inversion as F4 above. The {#each -> #eac guard stays.
    const hexSearchable = code.replace(/\{#[a-z]+/g, '{');
    const hexHit = hexSearchable.match(/#[0-9a-fA-F]{3,8}/);
    if (hexHit && !f.includes('packages/theme')) {
      results.push({
        check: 'F8',
        status: 'fail',
        file: relative(REPO_ROOT, f),
        detail: 'Hardcoded hex colour outside packages/theme: ' + hexHit[0],
      });
    }

    if (/box-shadow\s*:/.test(code) && !/var\(--fx-/.test(code) && !f.includes('packages/theme')) {
      results.push({
        check: 'F8',
        status: 'fail',
        file: relative(REPO_ROOT, f),
        detail: 'Hardcoded box-shadow outside packages/theme',
      });
    }
  }

  if (existsSync(mountTs)) {
    const mt = normaliseLineEndings(readFileSync(mountTs, 'utf8'));
    if (mt.includes('mode-switcher') || mt.includes("from './mode-switcher'") || mt.includes('from "@augment-it/theme"') && mt.includes('mode-switcher')) {
      results.push({
        check: 'F5',
        status: 'fail',
        file: relative(REPO_ROOT, mountTs),
        detail: 'mount.ts imports mode-switcher. The shell owns the single <html> and its data-mode.',
      });
    }
    if (mt.includes("import '@augment-it/theme/theme.css'") || mt.includes('import "@augment-it/theme/theme.css"') || mt.includes("import './theme.css'")) {
      results.push({
        check: 'F10',
        status: 'fail',
        file: relative(REPO_ROOT, mountTs),
        detail: 'mount.ts imports theme.css. Only the shell loads the token layer.',
      });
    }
  }

  const designMd = resolve(fullPath, 'DESIGN.md');
  if (!existsSync(designMd)) {
    results.push({
      check: 'F6',
      status: 'fail',
      file: relative(REPO_ROOT, fullPath),
      detail: 'No DESIGN.md at member root',
    });
  }

  return results;
}

function runThemeChecks(tokens) {
  const results = [];
  const tier1 = tokens.tier1 || {};
  const tier2c = { ...tokens.tier2?.dark || {}, ...tokens.tier2?.light || {}, ...tokens.tier2?.vibrant || {} };
  const tier3c = { ...tokens.tier3?.dark || {}, ...tokens.tier3?.light || {}, ...tokens.tier3?.vibrant || {} };

  for (const mode of ['dark', 'light', 'vibrant']) {
    const t2 = tokens.tier2[mode] || {};
    const t3 = tokens.tier3[mode] || {};
    const combined = { ...t2, ...t3 };

    for (const [name, value] of Object.entries(combined)) {
      if (/#[0-9a-fA-F]{3,8}/.test(value) && !/color-mix/.test(value)) {
        const hasVar = /var\(--/.test(value);
        if (!hasVar) {
          results.push({
            check: 'F11',
            status: 'fail',
            mode,
            detail: `Token ${name} carries a literal colour in ${mode} mode: ${value.match(/#[0-9a-fA-F]{3,8}/)[0]}`,
          });
        }
      }
    }
  }

  const allT2 = new Set([...Object.keys(tokens.tier2.dark || {}), ...Object.keys(tokens.tier2.light || {}), ...Object.keys(tokens.tier2.vibrant || {})]);
  for (const name of allT2) {
    const inDark = name in (tokens.tier2.dark || {});
    const inLight = name in (tokens.tier2.light || {});
    const inVibrant = name in (tokens.tier2.vibrant || {});
    if (!inDark || !inLight || !inVibrant) {
      results.push({
        check: 'P2',
        status: 'fail',
        detail: `Tier-2 token ${name} missing in ${!inDark ? 'dark ' : ''}${!inLight ? 'light ' : ''}${!inVibrant ? 'vibrant' : ''}`,
      });
    }
  }

  return results;
}

function runContrastChecks(tokens) {
  const results = [];
  const tier1 = tokens.tier1 || {};

  function resolveValue(value) {
    const m = value.match(/var\((--[\w-]+)/);
    if (!m) return hexToRgb(value);
    const ref = m[1];
    if (tier1[ref]) return hexToRgb(tier1[ref]);
    return null;
  }

  const surfaceTokens = ['--color-background', '--color-surface', '--color-surface-2', '--color-surface-raised', '--color-bg-elevated'];
  const textTokens = ['--color-text', '--color-text-muted'];

  let total = 0;
  let pass = 0;
  let fail = 0;

  for (const mode of ['dark', 'light', 'vibrant']) {
    const t2 = tokens.tier2[mode] || {};

    for (const surface of surfaceTokens) {
      for (const text of textTokens) {
        const surfVal = t2[surface];
        const textVal = t2[text];
        if (!surfVal || !textVal) continue;

        const sfRgb = resolveValue(surfVal);
        const txRgb = resolveValue(textVal);
        if (!sfRgb || !txRgb) continue;

        const ratio = contrastRatio(
          relativeLuminance(...sfRgb),
          relativeLuminance(...txRgb)
        );

        total++;
        if (ratio >= 4.5) {
          pass++;
        } else {
          fail++;
          results.push({
            check: 'F7',
            status: 'fail',
            mode,
            pair: `${text} on ${surface}`,
            ratio: ratio.toFixed(2),
          });
        }
      }
    }
  }

  return { results, total, pass, fail };
}

function runResolve(tokens) {
  const tier1 = tokens.tier1 || {};
  const output = {};

  for (const mode of ['dark', 'light', 'vibrant']) {
    output[mode] = {};
    const t2 = tokens.tier2[mode] || {};
    const t3 = tokens.tier3[mode] || {};

    for (const [name, value] of Object.entries({ ...t2, ...t3 })) {
      let resolved = value;
      let depth = 0;
      while (depth < 20) {
        const m = resolved.match(/var\((--[\w-]+)/);
        if (!m) break;
        const ref = m[1];
        if (tier1[ref]) {
          resolved = tier1[ref];
          break;
        } else if (t2[ref]) {
          resolved = resolved.replace(m[0], t2[ref]);
        } else if (t3[ref]) {
          resolved = resolved.replace(m[0], t3[ref]);
        } else {
          break;
        }
        depth++;
      }
      if (/#[0-9a-fA-F]{3,8}/.test(resolved)) {
        output[mode][name] = resolved.match(/#[0-9a-fA-F]{3,8}/)[0];
      }
    }
  }

  return output;
}


/* ---------------------------------------------------------------------------
 * S1–S3 — structural invariants.
 *
 * WHY THESE EXIST. Between 2026-08-06 and 2026-09-13 three units were found
 * whose typecheck had never once passed — shell, then packages/federation —
 * plus e2e/ claimed by no TypeScript project at all and packages/gallery
 * claimed by two under different options. Every one was found by accident, by
 * someone tidying something else.
 *
 * The invariants that would have caught them were real, and were written down:
 * in a comment inside tsconfig.json. Prose cannot fail a build. These three
 * rules are that same prose, executable.
 *
 * They are deliberately pure file-tree logic — no tsc invocation — so the whole
 * sweep costs milliseconds and can gate CI even while F6/F8 cannot.
 * ------------------------------------------------------------------------- */

const UNIT_ROOTS = ['apps', 'packages', 'services'];
const UNIT_SINGLETONS = ['shell', 'e2e'];
const PROFILES = new Set(['tsconfig.base.json', 'tsconfig.services.json']);

function readJsonIf(filePath) {
  const raw = readIf(filePath);
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return undefined; } // undefined = present but unparseable
}

function countSource(dir) {
  let ts = 0, svelte = 0;
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.d.ts')) continue;
      else if (e.name.endsWith('.ts')) ts++;
      else if (e.name.endsWith('.svelte')) svelte++;
    }
  };
  walk(dir);
  return { ts, svelte };
}

function discoverUnits() {
  const units = [];
  const push = (rel) => {
    const abs = resolve(REPO_ROOT, rel);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) return;
    const src = countSource(abs);
    const tsconfigPath = join(abs, 'tsconfig.json');
    const pkgPath = join(abs, 'package.json');
    const tsconfig = existsSync(tsconfigPath) ? readJsonIf(tsconfigPath) : null;
    const pkg = existsSync(pkgPath) ? readJsonIf(pkgPath) : null;
    units.push({
      rel,
      src,
      hasSource: src.ts + src.svelte > 0,
      hasTsconfig: existsSync(tsconfigPath),
      tsconfig,
      pkg,
    });
  };
  for (const root of UNIT_ROOTS) {
    const abs = resolve(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'node_modules') continue;
      push(`${root}/${e.name}`);
    }
  }
  for (const s of UNIT_SINGLETONS) push(s);
  return units.sort((a, b) => a.rel.localeCompare(b.rel));
}

// Does the root tsconfig's exclude list cover this unit path?
function rootExcludes(rootTsconfig, rel) {
  const list = (rootTsconfig && rootTsconfig.exclude) || [];
  return list.some(entry => rel === entry || rel.startsWith(`${entry}/`));
}

// Does a unit declare a script that actually type-checks?
function checkingScripts(pkg) {
  const scripts = (pkg && pkg.scripts) || {};
  return Object.entries(scripts)
    .filter(([, cmd]) => /\btsc\b|\bsvelte-check\b/.test(String(cmd)))
    .map(([name]) => name);
}

function runStructureChecks() {
  const results = [];
  const rootTsconfig = readJsonIf(resolve(REPO_ROOT, 'tsconfig.json'));
  const units = discoverUnits();

  for (const u of units) {
    // A directory with no source is not a unit under these rules. That is how
    // apps/highlight-collector and apps/insight-manager (README-only
    // placeholders) and services/deploy-relay (a single plain-JS Vercel
    // function) stay silent WITHOUT a hand-maintained exemption list — the
    // exemption is derived from the disk, so it cannot go stale.
    if (!u.hasSource) continue;

    const excluded = rootExcludes(rootTsconfig, u.rel);
    // The root's `include` is **/*.ts — so it claims a unit's .ts files
    // whenever the unit is not excluded. .svelte is never claimed by the root.
    const rootClaimsIt = !excluded && u.src.ts > 0;

    /* S1 — claimed by exactly one project: not zero, not two. */
    if (!u.hasTsconfig && excluded) {
      results.push({
        check: 'S1', status: 'fail', file: u.rel,
        detail: `claimed by NO TypeScript project — no tsconfig.json, and the root config excludes it (${u.src.ts} .ts, ${u.src.svelte} .svelte unchecked)`,
      });
    } else if (u.hasTsconfig && rootClaimsIt) {
      results.push({
        check: 'S1', status: 'fail', file: u.rel,
        detail: `claimed TWICE — has its own tsconfig.json but is missing from the root config's exclude list, so its .ts files are checked under two different option sets`,
      });
    } else if (!u.hasTsconfig && u.src.svelte > 0) {
      results.push({
        check: 'S1', status: 'fail', file: u.rel,
        detail: `${u.src.svelte} .svelte file(s) claimed by NO project — the root config's include is **/*.ts and never matches .svelte`,
      });
    }

    /* S2 — every unit config extends a profile; no standalone copies. */
    if (u.hasTsconfig) {
      if (u.tsconfig === undefined) {
        results.push({ check: 'S2', status: 'fail', file: u.rel, detail: 'tsconfig.json is not parseable JSON' });
      } else {
        const ext = u.tsconfig.extends;
        if (!ext) {
          results.push({
            check: 'S2', status: 'fail', file: u.rel,
            detail: 'tsconfig.json extends nothing — a standalone copy is how the 8/7/2 apps split and the ten identical service configs happened',
          });
        } else if (!String(ext).startsWith('astro/') && !PROFILES.has(String(ext).split('/').pop())) {
          results.push({
            check: 'S2', status: 'fail', file: u.rel,
            detail: `extends "${ext}" — expected tsconfig.base.json (browser/Svelte) or tsconfig.services.json (Node)`,
          });
        }
      }
    }

    /* S3 — reachable by an aggregate command. */
    const checkers = checkingScripts(u.pkg);
    if (u.hasTsconfig && checkers.length === 0) {
      results.push({
        check: 'S3', status: 'fail', file: u.rel,
        detail: 'declares no script running tsc or svelte-check, so `pnpm -r` cannot reach it — this is exactly how packages/federation sat red for five weeks',
      });
    }
  }

  /* S5 — the member registry covers every member on disk.
   *
   * design-drift reads its member list from DESIGN.md frontmatter and checks
   * only what that list names. So a member missing from the registry is not
   * "unchecked" in a way anyone notices — it is INVISIBLE, and the federation
   * count reads green for a surface nobody looked at.
   *
   * Measured 2026-09-13: org-workbench, search-and-add and search-results were
   * all live federated remotes, all shipping their own app.css, and none of them
   * had ever been checked. Registering them added 13 findings that had existed
   * the whole time — including org-workbench, which has 61 buttons and, at the
   * time, zero aria attributes.
   *
   * This is the same failure as every other hand-maintained list in this repo:
   * it was true when written and nothing re-measured it. A carve-out is fine —
   * docs-portal documents the federation rather than joining it — but it has to
   * live in out_of_federation where a check can read it, not in a comment in the
   * member's own build config. */
  {
    const fm = parseFrontmatter(readIf(DESIGN_MD) ?? '').data;
    const registered = new Set(parseMemberList(fm).map((m) => m.path));
    // out_of_federation is a TOP-LEVEL key — this frontmatter parser flattens
    // nested YAML — and its entries arrive as raw strings, same as members.
    const carved = new Set(
      (Array.isArray(fm?.out_of_federation) ? fm.out_of_federation : [])
        .map((row) => String(row).match(/path:\s*([^\s,}]+)/)?.[1])
        .filter(Boolean),
    );
    const appsDir = resolve(REPO_ROOT, 'apps');
    if (existsSync(appsDir)) {
      for (const e of readdirSync(appsDir, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name === 'node_modules') continue;
        const rel = `apps/${e.name}`;
        if (registered.has(rel) || carved.has(rel)) continue;
        const src = countSource(resolve(REPO_ROOT, rel));
        if (src.ts + src.svelte === 0) continue; // README-only placeholder
        results.push({
          check: 'S5',
          status: 'fail',
          file: rel,
          detail:
            'ships source but is absent from DESIGN.md federation.members — it is invisible to every F-check, so its violations are not in the federation count',
        });
      }
    }
  }

  return results;
}

function main() {
  // Structure checks depend on neither DESIGN.md nor theme.css, so they run
  // first and can short-circuit. That independence is the point: this gate must
  // not inherit the fragility of the registry it sits next to.
  if (FLAG.structure) {
    const structureResults = runStructureChecks();
    if (FLAG.json) {
      console.log(JSON.stringify({ fail: structureResults.length, warn: 0, results: structureResults }, null, 2));
    } else if (structureResults.length === 0) {
      console.log('S1-S5 structural invariants: all pass');
    } else {
      for (const r of structureResults) console.log(`FAIL ${r.check} [${r.file}]: ${r.detail}`);
      console.log(`\n${structureResults.length} structural violation(s)`);
    }
    process.exit(structureResults.length > 0 ? 1 : 0);
  }

  const designText = readIf(DESIGN_MD);
  if (!designText) {
    console.error('DESIGN.md not found');
    process.exit(1);
  }

  const { data: fm } = parseFrontmatter(designText);
  if (!fm) {
    console.error('Could not parse DESIGN.md frontmatter');
    process.exit(1);
  }

  const members = parseMemberList(fm);
  if (members.length === 0) {
    console.error('No members in DESIGN.md frontmatter');
    process.exit(1);
  }

  const themeCss = readIf(THEME_CSS);
  if (!themeCss) {
    console.error('theme.css not found');
    process.exit(1);
  }

  const tokens = parseTokens(themeCss);

  if (FLAG.resolve) {
    const resolved = runResolve(tokens);
    console.log(JSON.stringify(resolved, null, 2));
    process.exit(0);
  }

  const targetMembers = FLAG.member
    ? members.filter(m => m.name === FLAG.member || m.prefix === FLAG.member)
    : members;

  if (targetMembers.length === 0) {
    console.error(`Member "${FLAG.member}" not found`);
    process.exit(1);
  }

  let totalFail = 0;
  let totalWarn = 0;
  const allResults = [];

  if (!FLAG.contrast) {
    const themeResults = runThemeChecks(tokens);
    allResults.push(...themeResults);

    for (const member of targetMembers) {
      const memberResults = runMemberChecks(member, tokens);
      allResults.push(...memberResults);
    }
  }

  const contrastData = runContrastChecks(tokens);
  allResults.push(...contrastData.results);

  if (!FLAG.contrast) allResults.push(...runStructureChecks());

  const fails = allResults.filter(r => r.status === 'fail').length;
  const warns = allResults.filter(r => r.status === 'warn').length;

  totalFail = fails;
  totalWarn = warns;

  if (FLAG.json) {
    console.log(JSON.stringify({
      fail: totalFail,
      warn: totalWarn,
      contrast: { total: contrastData.total, pass: contrastData.pass, fail: contrastData.fail },
      results: allResults,
    }, null, 2));
  } else {
    if (allResults.length === 0) {
      console.log('All checks passed. 0 fail · 0 warn');
    }
    for (const r of allResults) {
      const prefix = r.status === 'fail' ? 'FAIL' : 'WARN';
      const loc = r.file ? ` [${r.file}]` : '';
      const mode = r.mode ? ` (${r.mode})` : '';
      console.log(`${prefix} ${r.check}${mode}: ${r.detail}${loc}`);
    }
    console.log(`\n${totalFail} fail · ${totalWarn} warn`);
    console.log(`Contrast: ${contrastData.pass}/${contrastData.total} pairs pass`);

    if (!FLAG.contrast && allResults.length > 0 && allResults.some(r => r.check === 'F1a')) {
      const f1a = allResults.filter(r => r.check === 'F1a' && r.status === 'fail');
      if (f1a.length > 0) {
        console.log('\nF1a violations found. Fix: replace var(--font__mono) or var(--color__*) with Tier-2 equivalents.');
      }
    }
  }

  const adoption = (fm.adoption_phase || fm.federation?.adoption_phase || 'warn').toString().trim().toLowerCase();
  const exitCode = adoption === 'fail' ? (totalFail > 0 ? 1 : 0) : 0;
  process.exit(exitCode);
}

main();
