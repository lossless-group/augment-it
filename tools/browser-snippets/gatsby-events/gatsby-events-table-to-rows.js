// =============================================================================
// gatsby-events-table-to-rows.js
//
// Paste into the DevTools console while you're on a Gatsby Events public
// table tab (e.g. gatsby.events/public-table-tab/<org>/<id>).
//
// What it does
// ------------
// • Finds Gatsby's virtualized grid (custom React table — absolute-positioned
//   cells keyed by `offset` for column and CSS `top:` for row).
// • Reads the header row to build the column map dynamically, so it works
//   on ANY Gatsby table no matter which questions/columns the host added.
// • Auto-scrolls the grid from top to bottom in chunks, extracting visible
//   rows each step, deduping by email (or name+row-coord if email is blank).
// • Persists progress to localStorage every step (`lossless:gatsby-events`),
//   so a refresh doesn't lose work mid-run.
// • Auto-downloads a JSON file when finished.
//
// Helpers exposed on `window` for manual control:
//     __gatsbyEventsDownloadJson()  — save what's in storage
//     __gatsbyEventsDownloadCsv()   — same, as CSV
//     __gatsbyEventsClear()         — wipe storage
//     __gatsbyEventsCount()         — how many rows captured so far
//     __gatsbyEventsExtract()       — one-shot extract of the currently-rendered rows (no scroll)
// =============================================================================

(async () => {
  const STORAGE_KEY = 'lossless:gatsby-events';
  const log = (...a) => console.log('[gatsby-events]', ...a);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cleanText = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  // ---------------------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------------------
  const loadStored = () => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
    catch { return []; }
  };
  const saveStored = (rows) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); return true; }
    catch (err) { log('localStorage write failed:', err.message); return false; }
  };

  // ---------------------------------------------------------------------
  // Find the scrollable grid container
  // (style with `overflow: auto` AND `will-change: transform` AND a big
  //  width — Gatsby's outer scroll wrapper)
  // ---------------------------------------------------------------------
  const findScroller = () => {
    const all = document.querySelectorAll('div[style*="will-change: transform"]');
    for (const el of all) {
      const s = el.getAttribute('style') || '';
      if (/overflow:\s*auto/.test(s)) return el;
    }
    return null;
  };

  // ---------------------------------------------------------------------
  // Build column map from header row
  //   header cells live at top:0px under z-index:17 sticky container,
  //   have an `offset` attribute (data columns) and an <h4> inside
  //   with the column name.
  // ---------------------------------------------------------------------
  const buildColumnMap = () => {
    const headers = document.querySelectorAll('div[offset]:has(h4)');
    const map = {};
    for (const h of headers) {
      // header rows have `top: 0px` (the sticky header sits at the top of the grid)
      const style = h.getAttribute('style') || '';
      if (!/top:\s*0px/.test(style)) continue;
      const offset = h.getAttribute('offset');
      const h4 = h.querySelector('h4');
      if (offset != null && h4) {
        map[offset] = cleanText(h4);
      }
    }
    return map;
  };

  // Friendly slug for a header name (used as JS object key).
  const slug = (s) => (s || '')
    .toLowerCase()
    .replace(/^q\d+:\s*/, 'q$1_')  // "Q1: Will you bring a guest?" → "q1_will_you_bring_a_guest"
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'col';

  // ---------------------------------------------------------------------
  // Extract every row currently rendered in the DOM.
  // Returns: array of { row_top, name, email, <cols>... }
  // ---------------------------------------------------------------------
  const extractVisibleRows = (columnMap, slugMap) => {
    const byTop = new Map();

    // Data column cells (have offset attr + are positioned by `top:`)
    const dataCells = document.querySelectorAll('div[offset]');
    for (const cell of dataCells) {
      const style = cell.getAttribute('style') || '';
      const m = style.match(/top:\s*([\d.]+)px/);
      if (!m) continue;
      const top = parseFloat(m[1]);
      if (top < 50) continue;  // header row sits at top:0; skip it
      const offset = cell.getAttribute('offset');
      if (!columnMap[offset]) continue;

      if (!byTop.has(top)) byTop.set(top, { row_top: top });
      const row = byTop.get(top);

      // Some cells contain MULTIPLE <p> badges (e.g., the Warnings column
      // can hold "Hasn't RSVP'd yet" + "Unlikely to RSVP" + "Unlikely to Accept").
      // Join with "; " so all signals survive.
      const ps = cell.querySelectorAll('p');
      let text;
      if (ps.length > 1) {
        text = Array.from(ps).map((p) => cleanText(p)).filter(Boolean).join('; ');
      } else if (ps.length === 1) {
        text = cleanText(ps[0]);
      } else {
        text = cleanText(cell);
      }

      row[slugMap[offset]] = text;
    }

    // Name column cells (sticky left, class `lolOuG`, have id + <p>)
    const nameCells = document.querySelectorAll('div.lolOuG[id]');
    for (const cell of nameCells) {
      const style = cell.getAttribute('style') || '';
      const m = style.match(/top:\s*([\d.]+)px/);
      if (!m) continue;
      const top = parseFloat(m[1]);
      if (top < 50) continue;
      if (!byTop.has(top)) byTop.set(top, { row_top: top });
      const row = byTop.get(top);
      const p = cell.querySelector('p');
      row.name = p ? cleanText(p) : cleanText(cell);
    }

    // Capture-time provenance
    const captured_at = new Date().toISOString();
    const source_url = window.location.href;
    for (const r of byTop.values()) {
      r.captured_at = captured_at;
      r.source_url = source_url;
    }

    return Array.from(byTop.values());
  };

  // ---------------------------------------------------------------------
  // Dedup key — prefer email (stable), fall back to name (for rows with
  // a blank email cell).
  // ---------------------------------------------------------------------
  const keyOf = (r) => {
    if (r.email) return `e:${r.email.toLowerCase()}`;
    if (r.name)  return `n:${r.name.toLowerCase()}`;
    return null;
  };

  // ---------------------------------------------------------------------
  // Read event metadata visible at the top of the page
  // (host name, event title, etc. — Gatsby renders these in the header).
  // Best-effort, optional.
  // ---------------------------------------------------------------------
  const readEventMeta = () => ({
    page_title: document.title || '',
    source_url: window.location.href,
    captured_at: new Date().toISOString(),
  });

  // ---------------------------------------------------------------------
  // Main: build column map, then auto-scroll-and-extract
  // ---------------------------------------------------------------------
  const columnMap = buildColumnMap();
  if (Object.keys(columnMap).length === 0) {
    log('🚨 no headers found — DOM probe failed. Aborting.');
    log('   Right-click a header cell → Inspect → tell us what changed.');
    return;
  }
  // Always include `name` (sticky column, no offset) and `email` (offset 150).
  const slugMap = {};
  for (const [offset, label] of Object.entries(columnMap)) {
    slugMap[offset] = slug(label);
  }
  log('columns:', Object.entries(slugMap).map(([o, s]) => `${o}→${s}`).join(', '));

  const scroller = findScroller();
  if (!scroller) {
    log('🚨 no scrollable grid container found. Aborting.');
    return;
  }
  log(`grid scrollHeight=${scroller.scrollHeight}px clientHeight=${scroller.clientHeight}px`);

  // Reset to top
  scroller.scrollTop = 0;
  await sleep(600);

  // Load existing dedup set from storage (so resuming a partial run works)
  const stored = loadStored();
  const seen = new Set();
  for (const r of stored) {
    const k = keyOf(r);
    if (k) seen.add(k);
  }
  log(`resuming with ${stored.length} rows already in storage`);

  const meta = readEventMeta();
  log('event meta:', meta);

  const PAGE_STEP_FRACTION = 0.85;
  const RENDER_WAIT_MS = 450;
  const STABLE_NEEDED = 3;  // stop after N consecutive no-new-rows passes

  let stableTicks = 0;
  let totalAdded = 0;
  let scrollIters = 0;

  while (true) {
    scrollIters += 1;
    const visible = extractVisibleRows(columnMap, slugMap);
    let addedThisStep = 0;
    for (const r of visible) {
      const k = keyOf(r);
      if (!k) continue;          // can't dedup a no-email no-name row
      if (seen.has(k)) continue;
      seen.add(k);
      stored.push(r);
      addedThisStep += 1;
    }
    if (addedThisStep > 0) saveStored(stored);
    totalAdded += addedThisStep;

    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 5;
    log(`step ${scrollIters}: +${addedThisStep} (total ${stored.length}) scrollTop=${Math.round(scroller.scrollTop)} ${atBottom ? '[bottom]' : ''}`);

    if (addedThisStep === 0) stableTicks += 1;
    else stableTicks = 0;

    if (atBottom && stableTicks >= 1) break;
    if (stableTicks >= STABLE_NEEDED) break;
    if (scrollIters > 500) { log('safety: 500-iter cap'); break; }

    scroller.scrollBy({ top: scroller.clientHeight * PAGE_STEP_FRACTION, behavior: 'auto' });
    await sleep(RENDER_WAIT_MS);
  }

  log(`done. captured ${totalAdded} new rows this run. total in storage: ${stored.length}.`);

  // ---------------------------------------------------------------------
  // Auto-download JSON if we got anything
  // ---------------------------------------------------------------------
  if (stored.length > 0) {
    const payload = { meta, columns: columnMap, attendees: stored };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gatsby-events-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`auto-saved ${stored.length} rows as ${a.download}`);
  }

  // ---------------------------------------------------------------------
  // Console helpers
  // ---------------------------------------------------------------------
  window.__gatsbyEventsCount = () => loadStored().length;
  window.__gatsbyEventsExtract = () => extractVisibleRows(columnMap, slugMap);
  window.__gatsbyEventsDownloadJson = () => {
    const rows = loadStored();
    if (!rows.length) { log('nothing to download.'); return; }
    const payload = { meta: readEventMeta(), columns: columnMap, attendees: rows };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gatsby-events-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`saved ${rows.length} rows as ${a.download}`);
  };
  window.__gatsbyEventsDownloadCsv = () => {
    const rows = loadStored();
    if (!rows.length) { log('nothing to download.'); return; }
    const allKeys = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set()));
    const esc = (s) => {
      const v = String(s ?? '');
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [allKeys.join(',')];
    for (const r of rows) lines.push(allKeys.map((k) => esc(r[k])).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gatsby-events-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`saved ${rows.length} rows as ${a.download}`);
  };
  window.__gatsbyEventsClear = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    log('storage cleared.');
  };
})();
