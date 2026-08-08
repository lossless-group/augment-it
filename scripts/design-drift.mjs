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

    if (n.includes('--color__') || n.includes('--font__')) {
      const matches = n.match(/var\((--(?:color|font)__[\w-]+)/g);
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

    const tier2Declared = n.match(/^\s*(--color-(?!__))[\w-]+\s*:/gm);
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

    if (/z-index\s*:\s*\d+/.test(n) && !/var\(--z-/.test(n)) {
      const matches = n.match(/z-index\s*:\s*(\d+)/g);
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

    if (/#[0-9a-fA-F]{3,8}/.test(n) && !f.includes('packages/theme')) {
      results.push({
        check: 'F8',
        status: 'fail',
        file: relative(REPO_ROOT, f),
        detail: 'Hardcoded hex colour outside packages/theme',
      });
    }

    if (/box-shadow\s*:/.test(n) && !/var\(--fx-/.test(n) && !f.includes('packages/theme')) {
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

function main() {
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
