#!/usr/bin/env node
// ============================================================================
// export-branded-briefing.mjs
//
// Takes a markdown briefing + a PDF folder + a memopop brand-config YAML
// and emits a branded HTML at <out-dir>/index.html with the firm's
// colors, fonts, logo, and confidential footer. Also copies the PDFs
// into <out-dir>/pdfs/ so the relative links in the markdown resolve.
//
// Usage:
//   node scripts/export-branded-briefing.mjs \
//     --md <briefing.md> \
//     --pdf-dir <pdfs/> \
//     --brand-config <brand-config.yaml> \
//     --out-dir <export-dir> \
//     [--title "Tagged network — briefing"]
//
// Notes
// -----
// We do a focused subset of Markdown (headers, bullets, paragraphs,
// links, bold, hr) because we control the input. A full Markdown parser
// would be overkill and pull in deps.
//
// The brand-config YAML is read with a small regex parser tuned to the
// memopop brand-*.yaml shape (flat keys + nested colors.* and fonts.*
// and logo.*). Not a general YAML parser.
// ============================================================================

import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i], v = argv[i + 1];
    if (a === '--md') { out.md = v; i += 1; }
    else if (a === '--pdf-dir') { out.pdfDir = v; i += 1; }
    else if (a === '--brand-config') { out.brandConfig = v; i += 1; }
    else if (a === '--out-dir') { out.outDir = v; i += 1; }
    else if (a === '--title') { out.title = v; i += 1; }
    else if (a === '--help' || a === '-h') { out.help = true; }
  }
  return out;
}

// Tiny YAML reader, hand-tuned for the memopop brand-config shape.
// Reads flat scalar keys at the document root, and one level of nesting
// (e.g., colors.primary, fonts.family, logo.light_mode). Ignores
// comments and blank lines. Quoted string values are unquoted.
function readBrandConfig(text) {
  const out = {};
  const lines = text.split(/\r?\n/);
  let section = null;     // top-level section name (e.g., "colors")
  let subSection = null;  // sub-section under section (e.g., "light")
  for (const raw of lines) {
    // Strip YAML comments — but ONLY when the `#` is preceded by whitespace
    // (or at start of line). Otherwise a hex color like "#29a380" gets eaten.
    const line = raw.replace(/(^|\s)#.*$/, '$1').trimEnd();
    if (!line.trim()) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    const stripped = line.trim();
    const sectionMatch = stripped.match(/^([a-zA-Z_][\w]*):\s*$/);
    const kvMatch = stripped.match(/^([a-zA-Z_][\w]*):\s*(.+)$/);

    // Section header at root.
    if (sectionMatch && indent === 0) {
      section = sectionMatch[1]; subSection = null;
      out[section] = out[section] || {};
      continue;
    }
    // Sub-section header under root section (e.g. "  light:" under "colors:").
    if (sectionMatch && indent >= 2 && indent < 4 && section) {
      subSection = sectionMatch[1];
      out[section][subSection] = out[section][subSection] || {};
      continue;
    }
    if (!kvMatch) continue;
    let [, key, val] = kvMatch;
    val = val.trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Root key:value
    if (indent === 0) { out[key] = val; section = null; subSection = null; continue; }
    // Deeper than sub-section: under sub-section.
    if (indent >= 4 && section && subSection) {
      out[section][subSection][key] = val;
      continue;
    }
    // Under section.
    if (section) {
      out[section][key] = val;
      subSection = null; // reset: subsequent indent-2 lines are section-level
    }
  }
  return out;
}

// Escape HTML in arbitrary text — used for inline content.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Convert inline markdown to HTML: links [text](url), bold **x**, italics _x_.
function renderInline(text) {
  let s = esc(text);
  // Links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
    const safeUrl = u.startsWith('http') || u.startsWith('#') || u.startsWith('pdfs/') || u.startsWith('./') ? u : '#';
    return `<a href="${safeUrl}">${t}</a>`;
  });
  // Bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return s;
}

// Slugify a header for an id anchor matching the markdown TOC links.
const slugifyHeader = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Block-level markdown → HTML, line by line. Handles: # h1, ## h2,
// ### h3, --- hr, "- item" bullets (with optional continuation lines),
// blank-line-separated paragraphs.
function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      flushParagraph();
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }
    const hMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      flushParagraph();
      if (inList) { out.push('</ul>'); inList = false; }
      const level = hMatch[1].length;
      const txt = hMatch[2].trim();
      // Strip the parenthetical count "(40)" from header text for the id
      const idText = txt.replace(/\s*\(\d+\)\s*$/, '');
      const id = slugifyHeader(idText);
      out.push(`<h${level} id="${id}">${renderInline(txt)}</h${level}>`);
      continue;
    }
    if (/^---\s*$/.test(line)) {
      flushParagraph();
      if (inList) { out.push('</ul>'); inList = false; }
      out.push('<hr>');
      continue;
    }
    const bulletMatch = line.match(/^- (.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (!inList) { out.push('<ul>'); inList = true; }
      // Greedy multi-line bullet: capture indented continuation lines
      const buf = [bulletMatch[1]];
      while (i + 1 < lines.length && /^  \S/.test(lines[i + 1])) {
        buf.push(lines[++i].trim());
      }
      // Join multi-line bullet with <br> for readability.
      out.push(`<li>${buf.map(renderInline).join('<br>')}</li>`);
      continue;
    }
    // Paragraph accumulator
    if (inList) { out.push('</ul>'); inList = false; }
    paragraph.push(line.trim());
  }
  flushParagraph();
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function buildHtml({ title, bodyHtml, brand }) {
  const company = brand.company?.name || 'Firm';
  const tagline = brand.company?.tagline || '';
  const footer = (brand.company?.confidential_footer || '').replace('{company_name}', company);
  const primary = brand.colors?.primary || '#000';
  const secondary = brand.colors?.secondary || '#222';
  const bgAlt = brand.colors?.background_alt || '#eef';
  const lightBg = brand.colors?.light?.background || '#fff';
  const bodyText = brand.colors?.light?.text_body || '#222';
  const headText = brand.colors?.light?.text_header || '#000';
  const headerFont = brand.fonts?.header_family || 'system-ui';
  const bodyFont = brand.fonts?.family || 'system-ui';
  const fallback = brand.fonts?.fallback || 'sans-serif';
  const logoUrl = brand.logo?.light_mode || '';
  const logoAlt = brand.logo?.alt || company;

  const fontsLink = `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(headerFont).replace(/%20/g, '+')}:wght@500;700&family=${encodeURIComponent(bodyFont).replace(/%20/g, '+')}:wght@400;500;700&display=swap" rel="stylesheet">`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} — ${esc(company)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
${fontsLink}
<style>
  :root {
    --primary: ${primary};
    --secondary: ${secondary};
    --bg-alt: ${bgAlt};
    --bg: ${lightBg};
    --text: ${bodyText};
    --head: ${headText};
    --header-font: "${headerFont}", system-ui, sans-serif;
    --body-font: "${bodyFont}", ${fallback};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--body-font);
    font-size: 15px; line-height: 1.55;
  }
  .frame { max-width: 880px; margin: 0 auto; padding: 48px 32px 80px; }
  header.brand {
    border-bottom: 1px solid color-mix(in srgb, var(--secondary) 12%, transparent);
    padding-bottom: 24px; margin-bottom: 36px;
    display: flex; flex-direction: column; gap: 16px;
  }
  header.brand img.logo { height: 40px; width: auto; }
  header.brand .tagline {
    font-family: var(--header-font);
    font-size: 14px; color: var(--primary); letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  h1, h2, h3 {
    font-family: var(--header-font);
    color: var(--head); letter-spacing: -0.01em;
    margin-top: 1.4em; margin-bottom: 0.5em;
  }
  h1 { font-size: 32px; border-bottom: 2px solid var(--primary); padding-bottom: 8px; }
  h2 { font-size: 22px; margin-top: 2em; }
  h3 { font-size: 16px; }
  hr { border: 0; border-top: 1px solid color-mix(in srgb, var(--secondary) 10%, transparent); margin: 32px 0; }
  a { color: var(--primary); text-decoration: none; }
  a:hover { text-decoration: underline; }
  ul { padding-left: 20px; }
  li { margin-bottom: 14px; }
  li strong { font-family: var(--header-font); color: var(--head); }
  p { margin: 0.6em 0; }
  .contents ul li { margin-bottom: 4px; }
  footer.confidential {
    border-top: 1px solid color-mix(in srgb, var(--secondary) 12%, transparent);
    padding-top: 16px; margin-top: 48px;
    font-size: 12px; color: color-mix(in srgb, var(--text) 55%, var(--bg));
    text-align: center;
  }
  /* Pill / chip for section counts in <h2> like "VCs (40)" */
  h2 { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
</style>
</head>
<body>
<div class="frame">
  <header class="brand">
    ${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="${esc(logoAlt)}">` : `<div class="logo-text" style="font-family:var(--header-font);font-size:24px;color:var(--head);">${esc(company)}</div>`}
    ${tagline ? `<div class="tagline">${esc(tagline)}</div>` : ''}
  </header>
  <main>
${bodyHtml}
  </main>
  ${footer ? `<footer class="confidential">${esc(footer)}</footer>` : ''}
</div>
</body>
</html>
`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.md || !args.brandConfig || !args.outDir) {
    console.log(`Usage:
  node scripts/export-branded-briefing.mjs \\
    --md <briefing.md> \\
    [--pdf-dir <pdfs/>] \\
    --brand-config <brand-config.yaml> \\
    --out-dir <export-dir> \\
    [--title "Tagged network — briefing"]
`);
    process.exit(args.help ? 0 : 1);
  }

  const mdText = await readFile(args.md, 'utf8');
  const brandText = await readFile(args.brandConfig, 'utf8');
  const brand = readBrandConfig(brandText);

  // Title: explicit, else use the first H1 from the markdown.
  const h1 = mdText.match(/^#\s+(.+)$/m);
  const title = args.title || (h1 ? h1[1].trim() : 'Briefing');

  const bodyHtml = renderMarkdown(mdText);
  const html = buildHtml({ title, bodyHtml, brand });

  await mkdir(resolve(args.outDir), { recursive: true });
  await writeFile(join(args.outDir, 'index.html'), html);

  // Also drop the source markdown alongside, for editability.
  await writeFile(join(args.outDir, 'index.md'), mdText);

  let copied = 0;
  if (args.pdfDir) {
    await mkdir(join(args.outDir, 'pdfs'), { recursive: true });
    const files = await readdir(args.pdfDir);
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.pdf')) continue;
      await copyFile(join(args.pdfDir, f), join(args.outDir, 'pdfs', f));
      copied += 1;
    }
  }

  console.log(`title:   ${title}`);
  console.log(`brand:   ${brand.company?.name || '(no name)'}`);
  console.log(`html:    ${join(args.outDir, 'index.html')}`);
  console.log(`md:      ${join(args.outDir, 'index.md')}`);
  console.log(`pdfs:    ${copied} copied into ${join(args.outDir, 'pdfs')}`);
}

main().catch((err) => { console.error('crashed:', err); process.exit(1); });
