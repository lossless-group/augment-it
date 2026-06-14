// ============================================================================
// linkedin-search-results-to-csv.js
//
// Paste-into-DevTools-Console snippet. Run while viewing a LinkedIn People
// Search Results page in your own authenticated browser session — typically:
//
//   https://www.linkedin.com/search/results/people/?network=%5B%22F%22%5D&geoUrn=...
//
// (network=["F"] = 1st-degree connections only. geoUrn array selects city /
// metro filters. Build the URL using LinkedIn's UI first; this snippet just
// reads the rendered DOM.)
//
// What it does
// ------------
// Walks every result card visible on the current page, pulls
//   { name, profile_url, headline, location }
// for each, appends to a window-scoped accumulator (so re-running on
// subsequent pages adds without losing earlier pages), de-dupes by
// profile URL, and console.table()'s the running total.
//
// Call window.__liDownloadCsv() at any point to download the accumulated
// rows as a CSV. Call window.__liClear() to start over.
//
// How to use
// ----------
// 1. Navigate to your search URL in a normal browser tab. Confirm you can
//    see your 1st-degree results filtered by geography.
// 2. Open DevTools (Cmd+Option+I on Mac / F12), go to Console tab.
// 3. Paste this entire file, hit Enter. The snippet prints what it found.
// 4. Click LinkedIn's "Next" pagination control.
// 5. Up-arrow + Enter in the Console to re-run the snippet (or paste again).
// 6. Repeat until you've covered the page range you care about.
// 7. Run window.__liDownloadCsv() — downloads `linkedin-network-<ts>.csv`.
//
// Selector maintenance
// --------------------
// LinkedIn rotates class names regularly to break scrapers. If you re-run
// this and get 0 results, the SELECTORS block at the top has gone stale.
// Open DevTools → Elements panel → click one result card → look at the
// enclosing <li> or <div> and its containing list. Replace the values in
// SELECTORS with what you see. Save the file back here so future runs work.
//
// What this snippet IS NOT
// ------------------------
// - Not automation — runs once per manual click. No scheduling, no polling,
//   no headless browser.
// - Not a request — only reads HTML that LinkedIn already rendered to your
//   browser. No fetches to linkedin.com beyond what your normal scrolling
//   makes.
// - Not endorsed by LinkedIn's TOS — TOS broadly forbids automation; see
//   context-v/explorations/LinkedIn-Network-Explorer-For-Curated-Invites.md
//   for the honest posture. Single-shot manual extraction has historically
//   never been the basis for individual enforcement, but you're operating
//   with eyes open.
// ============================================================================

(() => {
  // ---- SELECTORS — UPDATE THESE WHEN LINKEDIN ROTATES CLASS NAMES --------
  //
  // Strategy: prefer structural / role-based selectors over class names. Where
  // we must rely on classes, list multiple candidates so a partial rotation
  // doesn't break us. Each is tried in order until one matches.
  const SELECTORS = {
    // The <ul> (or container) holding all result cards on the current page.
    resultsContainer: [
      'ul.reusable-search__entity-result-list',
      'div.search-results-container',
      'main[role="main"] ul',
    ],
    // Each result card — usually an <li> inside the container.
    resultCard: [
      'li.reusable-search__result-container',
      'li.search-result',
      'li',
    ],
    // The anchor pointing at the person's profile. We then derive name from
    // its text content (or aria-label) and the URL from href.
    profileLink: [
      'a[href*="/in/"][aria-hidden="false"]',
      'a.app-aware-link[href*="/in/"]',
      'a[href*="/in/"]',
    ],
  };

  // ---- ACCUMULATOR — SURVIVES ACROSS RE-RUNS ON LATER PAGES --------------
  if (!window.__liScrape) {
    window.__liScrape = {
      rows: [],
      seenUrls: new Set(),
      pagesSeen: 0,
    };
  }
  const acc = window.__liScrape;

  // ---- HELPERS -----------------------------------------------------------
  const firstMatch = (root, list) => {
    for (const sel of list) {
      const els = root.querySelectorAll(sel);
      if (els.length > 0) return { els, sel };
    }
    return { els: [], sel: null };
  };

  const cleanText = (s) =>
    (s || '')
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '');

  const normalizeProfileUrl = (href) => {
    if (!href) return null;
    try {
      const u = new URL(href, location.origin);
      // Strip tracking params; keep only the /in/<slug>/ path.
      return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
    } catch {
      return null;
    }
  };

  // ---- FIND CARDS --------------------------------------------------------
  const containerMatch = firstMatch(document, SELECTORS.resultsContainer);
  if (containerMatch.els.length === 0) {
    console.error(
      '[li-scrape] no results container found — selectors are stale. Open Elements panel, locate the <ul> holding result cards, and update SELECTORS.resultsContainer at the top of this file.',
    );
    return;
  }
  const container = containerMatch.els[0];
  console.info(
    `[li-scrape] using container selector: ${containerMatch.sel}`,
  );

  const cardMatch = firstMatch(container, SELECTORS.resultCard);
  const cards = cardMatch.els;
  if (cards.length === 0) {
    console.error(
      '[li-scrape] container found but no cards in it. Update SELECTORS.resultCard.',
    );
    return;
  }
  console.info(
    `[li-scrape] using card selector: ${cardMatch.sel} (found ${cards.length} cards on this page)`,
  );

  // ---- EXTRACT EACH CARD -------------------------------------------------
  const newThisRun = [];
  for (const card of cards) {
    const linkMatch = firstMatch(card, SELECTORS.profileLink);
    const link = linkMatch.els[0];
    if (!link) continue;

    const profile_url = normalizeProfileUrl(link.getAttribute('href'));
    if (!profile_url) continue;
    if (acc.seenUrls.has(profile_url)) continue;

    // Name — usually inside a <span aria-hidden="true"> nested in the
    // anchor, or the anchor's aria-label, or its text content.
    let name = '';
    const ariaSpan = link.querySelector('span[aria-hidden="true"]');
    if (ariaSpan) name = cleanText(ariaSpan.textContent);
    if (!name) name = cleanText(link.getAttribute('aria-label'));
    if (!name) name = cleanText(link.textContent);
    // LinkedIn sometimes prefixes with "View <Name>'s profile" — strip.
    name = name.replace(/^View\s+/, '').replace(/'s\s+profile$/, '');

    // Headline + location: text blocks below the name link in the card.
    // We grab all non-empty text spans/divs that aren't part of the
    // link itself and aren't the action button row, then pick by
    // heuristic position (first = headline, last short text = location).
    const textBlocks = [];
    for (const el of card.querySelectorAll('div, span, p')) {
      if (link.contains(el)) continue;
      if (el.querySelector('button, a')) continue;
      const t = cleanText(el.textContent);
      if (!t) continue;
      if (t === name) continue;
      // De-dup nested-textContent duplicates: skip if a longer ancestor's
      // text we'll later add already starts with this text.
      if (textBlocks.some((existing) => existing.includes(t) && existing !== t)) continue;
      textBlocks.push(t);
    }
    // Heuristic: first long-ish block is the headline; a short block that
    // looks city-like is the location. Tune by inspecting console output
    // and adjusting if needed.
    const headline = textBlocks[0] || '';
    const location =
      textBlocks
        .slice(1)
        .find((t) => t.length < 80 && /[A-Z]/.test(t) && !t.includes(' at '))
      || textBlocks[1]
      || '';

    const row = { name, profile_url, headline, location };
    newThisRun.push(row);
    acc.rows.push(row);
    acc.seenUrls.add(profile_url);
  }
  acc.pagesSeen += 1;

  // ---- REPORT ------------------------------------------------------------
  console.info(
    `[li-scrape] page ${acc.pagesSeen}: added ${newThisRun.length} new rows; total ${acc.rows.length} unique profiles captured so far.`,
  );
  if (newThisRun.length > 0) console.table(newThisRun);
  console.info(
    '[li-scrape] call window.__liDownloadCsv() to download, window.__liClear() to start over.',
  );

  // ---- DOWNLOAD + CLEAR HELPERS (defined once, idempotent) ---------------
  if (!window.__liDownloadCsv) {
    window.__liDownloadCsv = () => {
      const a = window.__liScrape;
      if (!a || a.rows.length === 0) {
        console.warn('[li-scrape] nothing to download yet.');
        return;
      }
      const headers = ['name', 'profile_url', 'headline', 'location'];
      const csvEscape = (s) => {
        const v = String(s ?? '');
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      };
      const lines = [headers.join(',')];
      for (const r of a.rows) {
        lines.push(headers.map((h) => csvEscape(r[h])).join(','));
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `linkedin-network-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.info(`[li-scrape] downloaded ${a.rows.length} rows as ${link.download}`);
    };
  }
  if (!window.__liClear) {
    window.__liClear = () => {
      window.__liScrape = { rows: [], seenUrls: new Set(), pagesSeen: 0 };
      console.info('[li-scrape] accumulator cleared.');
    };
  }
})();
