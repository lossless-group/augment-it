#!/usr/bin/env node
// ============================================================================
// build-aspen-tags-relevance-report.mjs
//
// Regenerates the Aspen Institute tags/relevance HTML report straight from
// the canonical SurrealDB layer — no CSV round-trip. Run this any time a
// tag, relevance, bio, or contact-detail observation changes and the report
// needs to reflect it. Reuses the FreedomFest report's brand stylesheet
// (fonts + palette + card/chip/tier system) verbatim, extends it with a
// faceted filter bar (relevance / contact channels / tags, all multi-select,
// OR within a facet, AND across facets) and clickable LinkedIn/X icons.
//
// Sort is always relevance tier then alphabetical, independent of filters.
// Reach University's own staff are excluded from the report (their full
// observation history stays in the canonical layer either way).
//
// Usage:
//   node scripts/build-aspen-tags-relevance-report.mjs
// ============================================================================

import { writeFile, readFile } from 'node:fs/promises';
import { Surreal } from 'surrealdb';

const CLIENT = 'reach-edu';
const EVENT_SLUG = 'aspen-institute-summer-socrates-seminars';
const OLD_REPORT = 'clients/reach-edu/outputs/reports/Reach-Edu-FreedomFest-2026-Affiliation-Relevance-Report.html';
const OUT_PATH = 'clients/reach-edu/outputs/reports/Reach-Edu-Aspen-Institute-2026-Tags-Relevance-Report.html';
const EXCLUDE_ORG = 'Reach University';

const RELEVANCE_ORDER = ['Very-Relevant', 'Highly-Relevant', 'Relevant', 'Skip', 'Irrelevant'];
const RELEVANCE_CLASS = {
  'Very-Relevant': 'tier-very_relevant', 'Highly-Relevant': 'tier-highly_relevant',
  'Relevant': 'tier-relevant', 'Skip': 'tier-skip', 'Irrelevant': 'tier-irrelevant', null: 'tier-skip',
};

const ICON_LINKEDIN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.86 0-2.15 1.45-2.15 2.94v5.66H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.28 2.38 4.28 5.47v6.27zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.24 3H21l-6.5 7.43L22 21h-6.19l-4.84-6.34L5.4 21H2.62l6.96-7.95L2 3h6.34l4.37 5.79L18.24 3zm-1.08 16.17h1.53L7.9 4.73H6.26l10.9 14.44z"/></svg>';

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

for (const k of ['SURREAL_URL', 'SURREAL_NS', 'SURREAL_DB', 'SURREAL_USER', 'SURREAL_PASS']) {
  if (!process.env[k]) { console.error(`missing env: ${k}`); process.exit(1); }
}

const db = new Surreal();
await db.connect(process.env.SURREAL_URL);
await db.signin({ username: process.env.SURREAL_USER, password: process.env.SURREAL_PASS });
await db.use({ namespace: process.env.SURREAL_NS, database: process.env.SURREAL_DB });

const eventRow = await db.query(`SELECT id, name, starts_at, ends_at FROM events WHERE slug = $slug LIMIT 1;`, { slug: EVENT_SLUG });
const event = eventRow?.[0]?.[0];
if (!event) { console.error('event not found:', EVENT_SLUG); process.exit(1); }
const eventId = event.id;

const attRes = await db.query(
  `SELECT VALUE subject FROM observations WHERE predicate = 'attended' AND object = $eventId AND client = $client;`,
  { eventId, client: CLIENT },
);
const seen = new Set();
const uniqueSubjects = [];
for (const s of attRes?.[0] ?? []) {
  const key = JSON.stringify(s);
  if (!seen.has(key)) { seen.add(key); uniqueSubjects.push(s); }
}

const allPeople = [];
for (const personId of uniqueSubjects) {
  const personRes = await db.query(`SELECT id, name, email, linkedin_profile_url FROM $id;`, { id: personId });
  const person = personRes?.[0]?.[0];
  if (!person) continue;

  const tagRes = await db.query(
    `SELECT VALUE object FROM observations WHERE subject = $id AND predicate = 'has_tag' AND related_event = $eventId AND client = $client;`,
    { id: personId, eventId, client: CLIENT },
  );
  const tags = [...new Set(tagRes?.[0] ?? [])];

  const relRes = await db.query(
    `SELECT VALUE object FROM observations WHERE subject = $id AND predicate = 'has_relevance_assessment' AND related_event = $eventId AND client = $client ORDER BY observed_at DESC LIMIT 1;`,
    { id: personId, eventId, client: CLIENT },
  );
  const relevance = relRes?.[0]?.[0] ?? null;

  const bioRes = await db.query(
    `SELECT VALUE object FROM observations WHERE subject = $id AND predicate = 'has_bio' AND client = $client ORDER BY observed_at DESC LIMIT 1;`,
    { id: personId, client: CLIENT },
  );
  const bio = bioRes?.[0]?.[0] ?? null;

  const xRes = await db.query(
    `SELECT VALUE object FROM observations WHERE subject = $id AND predicate = 'has_x_handle' AND client = $client ORDER BY observed_at DESC LIMIT 1;`,
    { id: personId, client: CLIENT },
  );
  const x_url = xRes?.[0]?.[0] ?? null;

  const affRes = await db.query(`SELECT out.complete_name AS org_name, kind FROM affiliations WHERE in = $id LIMIT 1;`, { id: personId });
  const aff = affRes?.[0]?.[0] ?? {};

  allPeople.push({
    name: person.name ?? null,
    email: person.email ?? null,
    linkedin_url: person.linkedin_profile_url ?? null,
    x_url,
    org: aff.org_name ?? null,
    role: aff.kind ?? null,
    tags,
    relevance,
    bio,
  });
}
await db.close();

const people = allPeople.filter((p) => (p.org || '').trim() !== EXCLUDE_ORG);
const excluded = allPeople.length - people.length;
const allTags = [...new Set(people.flatMap((p) => p.tags || []))].sort();

const old = await readFile(OLD_REPORT, 'utf8');
const styleStart = old.indexOf('<style>');
const styleEnd = old.indexOf('</style>') + '</style>'.length;
const baseStyle = old.slice(styleStart, styleEnd);

const dist = Object.fromEntries(RELEVANCE_ORDER.map((k) => [k, 0]));
for (const p of people) if (p.relevance in dist) dist[p.relevance]++;

const nLinkedin = people.filter((p) => p.linkedin_url).length;
const nX = people.filter((p) => p.x_url).length;
const nEmail = people.filter((p) => p.email).length;

const extraStyle = `
<style>
.filterbar { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 1rem 1.1rem; margin-bottom: 2rem; }
.filterbar h3 { font-family: 'Public Sans', sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin: 0 0 0.55rem; }
.filtergroup { margin-bottom: 0.9rem; }
.filtergroup:last-child { margin-bottom: 0; }
.filterchips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.fchip { font-size: 0.76rem; font-weight: 600; color: var(--muted); background: transparent; border: 1px solid var(--border); border-radius: 999px; padding: 0.28rem 0.75rem; cursor: pointer; font-family: inherit; transition: all 0.12s ease; display: inline-flex; align-items: center; gap: 0.35rem; }
.fchip:hover { border-color: var(--teal); color: var(--teal); }
.fchip.active { color: #fff; background: var(--teal); border-color: var(--teal); }
.fchip.active svg { filter: brightness(0) invert(1); }
.fchip.active[data-rel="Very-Relevant"] { background: var(--very); border-color: var(--very); }
.fchip.active[data-rel="Highly-Relevant"] { background: var(--highly); border-color: var(--highly); }
.fchip.active[data-rel="Relevant"] { background: var(--relevant); border-color: var(--relevant); }
.fchip.active[data-rel="Skip"] { background: var(--skip); border-color: var(--skip); color: var(--ink-deep); }
.fchip.active[data-rel="Irrelevant"] { background: var(--irrelevant); border-color: var(--irrelevant); color: var(--ink-deep); }
.filterbar-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 0.9rem; padding-top: 0.75rem; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--muted); }
.clearbtn { font: inherit; font-size: 0.76rem; font-weight: 600; color: var(--teal); background: none; border: none; cursor: pointer; padding: 0; }
.clearbtn:hover { text-decoration: underline; }
.count { font-variant-numeric: tabular-nums; }
.chip.clickable { cursor: pointer; border: 1px solid color-mix(in srgb, var(--teal) 35%, transparent); }
.chip.clickable:hover { background: color-mix(in srgb, var(--teal) 22%, transparent); }
.chip.clickable.active { background: var(--teal); color: #fff; }
.bio-toggle { font-size: 0.76rem; font-weight: 600; color: var(--teal); background: none; border: none; cursor: pointer; padding: 0.2rem 0 0; font-family: inherit; }
.bio-full { display: none; margin-top: 0.4rem; }
.bio-full.open { display: block; }
.empty-state { color: var(--muted); font-style: italic; padding: 2rem 0; text-align: center; }
.contact-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.35rem 0 0.55rem; flex-wrap: wrap; }
.contact-icon { display: inline-flex; align-items: center; justify-content: center; width: 1.5rem; height: 1.5rem; border-radius: 4px; border: 1px solid var(--border); color: var(--ink); text-decoration: none; transition: all 0.12s ease; flex: none; }
.contact-icon svg { width: 0.85rem; height: 0.85rem; }
a.contact-icon:hover { border-color: var(--teal); color: var(--teal); background: color-mix(in srgb, var(--teal) 10%, transparent); }
.contact-icon.linkedin:hover { border-color: #0a66c2; color: #0a66c2; background: color-mix(in srgb, #0a66c2 10%, transparent); }
.contact-icon.x:hover { border-color: var(--ink); background: color-mix(in srgb, var(--ink) 8%, transparent); }
.email-line { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; color: var(--muted); }
.unverified-mark { display: inline-flex; align-items: center; justify-content: center; width: 1.05rem; height: 1.05rem; border-radius: 50%; border: 1px solid var(--muted); color: var(--muted); font-size: 0.68rem; font-weight: 700; cursor: help; flex: none; }

/* Two-column layout: sidebar (masthead + filters) sticks in place while
   results scroll independently — the report's audience reads it as a long
   scroll, and the filter controls stay reachable the whole way down
   instead of scrolling out of view after the first screen. */
.wrap { max-width: 78rem; display: flex; align-items: flex-start; gap: 2.5rem; }
.sidebar { flex: 0 0 23rem; position: sticky; top: 1.5rem; max-height: calc(100vh - 3rem); overflow-y: auto; overflow-x: hidden; padding-right: 0.4rem; }
.sidebar h1.title { font-size: clamp(1.6rem, 3vw, 2.1rem); }
.sidebar .subtitle { font-size: 0.88rem; }
.main { flex: 1 1 auto; min-width: 0; }
@media (max-width: 960px) {
  .wrap { flex-direction: column; }
  .sidebar { position: static; max-height: none; width: 100%; flex-basis: auto; }
}

.tags-chips-wrap { max-height: 5.4rem; overflow: hidden; position: relative; }
.tags-chips-wrap.expanded { max-height: none; }
.tags-toggle { margin-top: 0.5rem; font-size: 0.76rem; font-weight: 600; color: var(--teal); background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; }
.tags-toggle:hover { text-decoration: underline; }
</style>
`;

const starts = new Date(event.starts_at).toISOString().slice(0, 10);
const ends = new Date(event.ends_at).toISOString().slice(0, 10);
const colorvar = { 'Very-Relevant': 'var(--very)', 'Highly-Relevant': 'var(--highly)', 'Relevant': 'var(--relevant)', 'Skip': 'var(--skip)', 'Irrelevant': 'var(--irrelevant)' };
const total = Math.max(people.length, 1);

let html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(event.name)} — Tags &amp; Relevance Report</title>
${baseStyle}
${extraStyle}
</head>
<body>
<div class="report">
<div class="wrap">
<aside class="sidebar">
<header class="masthead">
  <p class="eyebrow">Reach.Edu · Event Report</p>
  <h1 class="title">${esc(event.name)}</h1>
  <p class="subtitle">Tag-based relevance classification for ${people.length} attendees (${starts} – ${ends}). Click any tag, relevance, or contact-channel pill to filter; click a tag on a person's card to drill in from there.${excluded ? ` Excludes ${excluded} Reach University staff (captured in the underlying data, kept out of this external-facing view).` : ''}</p>
  <div class="meta-row">
    <span><strong>${people.length}</strong> people</span>
    <span><strong>${allTags.length}</strong> tags</span>
    <span><strong>${dist['Very-Relevant']}</strong> very relevant</span>
    <span><strong>${dist['Highly-Relevant']}</strong> highly relevant</span>
  </div>
  <div class="distbar">
`;
for (const k of RELEVANCE_ORDER) {
  const pct = (dist[k] / total) * 100;
  if (pct > 0) html += `    <span style="width:${pct.toFixed(2)}%;background:${colorvar[k]}"></span>\n`;
}
html += `  </div>\n  <div class="distlegend">\n`;
for (const k of RELEVANCE_ORDER) {
  html += `    <span class="item"><span class="swatch" style="background:${colorvar[k]}"></span>${k.replace('-', ' ')} <strong>${dist[k]}</strong></span>\n`;
}
html += `  </div>\n</header>\n`;

html += `
<div class="filterbar">
  <div class="filtergroup">
    <h3>Relevance</h3>
    <div class="filterchips" id="rel-filters">
`;
for (const k of RELEVANCE_ORDER) {
  html += `      <button type="button" class="fchip" data-rel="${esc(k)}">${esc(k.replace('-', ' '))} (${dist[k]})</button>\n`;
}
html += `    </div>
  </div>
  <div class="filtergroup">
    <h3>Contact Channels</h3>
    <div class="filterchips" id="channel-filters">
      <button type="button" class="fchip" data-channel="linkedin">${ICON_LINKEDIN} LinkedIn (${nLinkedin})</button>
      <button type="button" class="fchip" data-channel="x">${ICON_X} X (${nX})</button>
      <button type="button" class="fchip" data-channel="email">Email (${nEmail})</button>
    </div>
  </div>
  <div class="filtergroup">
    <h3>Tags</h3>
    <div class="tags-chips-wrap" id="tags-chips-wrap">
    <div class="filterchips" id="tag-filters">
`;
const tagCounts = {};
for (const p of people) for (const t of p.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
for (const t of allTags) {
  html += `      <button type="button" class="fchip" data-tag="${esc(t)}">${esc(t.replace('-', ' '))} (${tagCounts[t]})</button>\n`;
}
html += `    </div>
    </div>
    <button type="button" class="tags-toggle" id="tags-toggle">show all ${allTags.length} tags</button>
  </div>
  <div class="filterbar-foot">
    <span class="count" id="result-count"></span>
    <button type="button" class="clearbtn" id="clear-filters">clear filters</button>
  </div>
</div>
</aside>

<main class="main">
<div id="results"></div>

<footer class="colophon">
  Generated from the canonical SurrealDB layer — every tag, relevance value, and contact detail is a source-tagged, timestamped observation, not a static snapshot. Email addresses are flagged unverified (?) — probable based on the original data source, not confirmed deliverable. Sort order is always relevance tier, then alphabetical, independent of active filters.
</footer>
</main>
</div>
</div>

<script>
const DATA = ${JSON.stringify(people)};
const RELEVANCE_ORDER = ${JSON.stringify(RELEVANCE_ORDER)};
const RELEVANCE_CLASS = ${JSON.stringify(RELEVANCE_CLASS)};
const ICON_LINKEDIN = ${JSON.stringify(ICON_LINKEDIN)};
const ICON_X = ${JSON.stringify(ICON_X)};

const state = { tags: new Set(), relevance: new Set(), channels: new Set() };

function tierRank(rel) { const i = RELEVANCE_ORDER.indexOf(rel); return i === -1 ? RELEVANCE_ORDER.length : i; }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function bioExcerpt(bio) { if (!bio) return ''; return bio.length > 220 ? bio.slice(0, 220).trim() + '…' : bio; }

function hasChannel(p, ch) {
  if (ch === 'linkedin') return Boolean(p.linkedin_url);
  if (ch === 'x') return Boolean(p.x_url);
  if (ch === 'email') return Boolean(p.email);
  return false;
}

function contactRow(p) {
  const parts = [];
  if (p.linkedin_url) parts.push(\`<a class="contact-icon linkedin" href="\${esc(p.linkedin_url)}" target="_blank" rel="noopener" title="LinkedIn">\${ICON_LINKEDIN}</a>\`);
  if (p.x_url) parts.push(\`<a class="contact-icon x" href="\${esc(p.x_url)}" target="_blank" rel="noopener" title="X / Twitter">\${ICON_X}</a>\`);
  if (p.email) parts.push(\`<span class="email-line"><span class="unverified-mark" title="probable based on data source, unverified">?</span>\${esc(p.email)}</span>\`);
  return parts.length ? \`<div class="contact-row">\${parts.join('')}</div>\` : '';
}

function render() {
  const filtered = DATA.filter(p => {
    const relOk = state.relevance.size === 0 || state.relevance.has(p.relevance);
    const tagOk = state.tags.size === 0 || (p.tags || []).some(t => state.tags.has(t));
    const chOk = state.channels.size === 0 || [...state.channels].some(ch => hasChannel(p, ch));
    return relOk && tagOk && chOk;
  });
  filtered.sort((a, b) => {
    const r = tierRank(a.relevance) - tierRank(b.relevance);
    if (r !== 0) return r;
    return (a.name || '').localeCompare(b.name || '');
  });

  document.getElementById('result-count').textContent = \`showing \${filtered.length} of \${DATA.length}\`;
  const container = document.getElementById('results');
  container.innerHTML = '';

  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state">No one matches the current filters.</p>';
    return;
  }

  let currentTier = null;
  let tierDiv = null;
  for (const p of filtered) {
    const tierKey = p.relevance || 'Skip';
    if (tierKey !== currentTier) {
      currentTier = tierKey;
      const cls = RELEVANCE_CLASS[p.relevance] || 'tier-skip';
      tierDiv = document.createElement('div');
      tierDiv.className = \`tier \${cls}\`;
      const count = filtered.filter(x => (x.relevance || 'Skip') === tierKey).length;
      tierDiv.innerHTML = \`<div class="tier-head"><h2>\${esc(tierKey.replace('-', ' '))}</h2><span class="tier-count">\${count}</span></div>\`;
      container.appendChild(tierDiv);
    }
    const card = document.createElement('div');
    card.className = 'card';
    const roleLine = [p.role, p.org].filter(Boolean).join(' at ');
    const chips = (p.tags || []).map(t =>
      \`<span class="chip clickable\${state.tags.has(t) ? ' active' : ''}" data-tag="\${esc(t)}">\${esc(t.replace('-', ' '))}</span>\`
    ).join('');
    const bioId = 'bio-' + Math.random().toString(36).slice(2);
    card.innerHTML = \`
      <div class="card-head">
        <p class="person">\${esc(p.name)}</p>
        <p class="role">\${roleLine ? esc(roleLine) : ''}</p>
        \${contactRow(p)}
      </div>
      \${p.bio ? \`<p class="note" id="\${bioId}-excerpt">\${esc(bioExcerpt(p.bio))}</p>
      <p class="bio-full" id="\${bioId}-full">\${esc(p.bio)}</p>
      <button type="button" class="bio-toggle" data-target="\${bioId}">read full bio →</button>\` : ''}
      <div class="chips">\${chips}</div>
    \`;
    tierDiv.appendChild(card);
  }

  container.querySelectorAll('.chip.clickable').forEach(el => el.addEventListener('click', () => toggleTag(el.dataset.tag)));
  container.querySelectorAll('.bio-toggle').forEach(el => {
    el.addEventListener('click', () => {
      const full = document.getElementById(el.dataset.target + '-full');
      const excerpt = document.getElementById(el.dataset.target + '-excerpt');
      const open = full.classList.toggle('open');
      excerpt.style.display = open ? 'none' : '';
      el.textContent = open ? '← show less' : 'read full bio →';
    });
  });
}

function toggleTag(tag) { state.tags.has(tag) ? state.tags.delete(tag) : state.tags.add(tag); syncChipStates(); render(); }
function toggleRelevance(rel) { state.relevance.has(rel) ? state.relevance.delete(rel) : state.relevance.add(rel); syncChipStates(); render(); }
function toggleChannel(ch) { state.channels.has(ch) ? state.channels.delete(ch) : state.channels.add(ch); syncChipStates(); render(); }
function syncChipStates() {
  document.querySelectorAll('#tag-filters .fchip').forEach(el => el.classList.toggle('active', state.tags.has(el.dataset.tag)));
  document.querySelectorAll('#rel-filters .fchip').forEach(el => el.classList.toggle('active', state.relevance.has(el.dataset.rel)));
  document.querySelectorAll('#channel-filters .fchip').forEach(el => el.classList.toggle('active', state.channels.has(el.dataset.channel)));
}

document.getElementById('tag-filters').addEventListener('click', e => { const b = e.target.closest('.fchip'); if (b) toggleTag(b.dataset.tag); });
document.getElementById('rel-filters').addEventListener('click', e => { const b = e.target.closest('.fchip'); if (b) toggleRelevance(b.dataset.rel); });
document.getElementById('channel-filters').addEventListener('click', e => { const b = e.target.closest('.fchip'); if (b) toggleChannel(b.dataset.channel); });
document.getElementById('clear-filters').addEventListener('click', () => { state.tags.clear(); state.relevance.clear(); state.channels.clear(); syncChipStates(); render(); });
document.getElementById('tags-toggle').addEventListener('click', () => {
  const wrap = document.getElementById('tags-chips-wrap');
  const btn = document.getElementById('tags-toggle');
  const expanded = wrap.classList.toggle('expanded');
  btn.textContent = expanded ? 'show fewer tags' : \`show all \${document.querySelectorAll('#tag-filters .fchip').length} tags\`;
});

render();
</script>
</body>
</html>
`;

await writeFile(OUT_PATH, html, 'utf8');
console.log(`wrote ${OUT_PATH}`);
console.log(`people: ${people.length} (excluded ${excluded} ${EXCLUDE_ORG} staff), linkedin: ${nLinkedin}, x: ${nX}, email: ${nEmail}`);
