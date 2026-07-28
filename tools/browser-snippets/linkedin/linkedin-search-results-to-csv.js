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
// for each, appends to a localStorage-backed accumulator (survives
// LinkedIn's full-page-load pagination — re-running on subsequent pages
// adds without losing earlier pages), de-dupes by profile URL, and
// console.table()'s the running total.
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
// DOM strategy (LinkedIn rotates class names; this snippet doesn't depend on them)
// --------------------------------------------------------------------------------
// LinkedIn's late-2025 / 2026 rewrite moved entirely to hashed CSS class names
// (`_502ff069`, `cb81723c`, etc.) that rotate frequently. So this snippet
// avoids class names almost entirely. It relies on:
//   - ARIA roles ([role="list"], [role="listitem"]) — stable, accessibility-driven
//   - Structural attributes ([href*="/in/"], [tabindex="0"]) — stable
//   - aria-labelledby relationships between figure ↔ name container — stable
//   - Single-span-inside-paragraph pattern for the visible text fields
// If the snippet stops finding cards, check the aria roles haven't been
// dropped; LinkedIn is unlikely to drop those without breaking screen readers.
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
  // Use console.error for all status lines so they surface regardless of
  // the DevTools filter level. (Some Chrome installs have Info hidden by
  // default and the original snippet's console.info lines were invisible.)
  const log = (...args) => console.error('[li-scrape]', ...args);

  // ---- ACCUMULATOR — SURVIVES ACROSS RE-RUNS *AND* FULL PAGE LOADS -------
  // Originally a bare window global, which only survives soft (SPA)
  // navigations — but LinkedIn's Next pagination does a FULL page load,
  // wiping window and restarting the table every run (observed 2026-07-27).
  // localStorage survives reloads on the same origin; the window object is
  // kept as a same-context mirror. __liClear() removes the stored copy.
  const STORE_KEY = 'li-scrape-accumulator';
  if (!window.__liScrape) {
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch {
      /* corrupt store → start fresh */
    }
    window.__liScrape = {
      rows: stored?.rows ?? [],
      seenUrls: new Set((stored?.rows ?? []).map((r) => r.profile_url)),
      pagesSeen: stored?.pagesSeen ?? 0,
    };
    if (stored?.rows?.length) {
      log(`restored ${stored.rows.length} rows from a previous page load.`);
    }
  }
  const acc = window.__liScrape;
  const persist = () => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ rows: acc.rows, pagesSeen: acc.pagesSeen }),
      );
    } catch (e) {
      log('warning: could not persist accumulator —', e?.message);
    }
  };

  // ---- HELPERS -----------------------------------------------------------
  const cleanText = (s) =>
    (s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');

  const normalizeProfileUrl = (href) => {
    if (!href) return null;
    try {
      const u = new URL(href, location.origin);
      // Only accept profile URLs (/in/<slug>); strip query + trailing slash.
      if (!/^\/in\/[^/]+\/?$/.test(u.pathname)) return null;
      return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
    } catch {
      return null;
    }
  };

  // ---- FIND CARDS --------------------------------------------------------
  // Each result is a div[role="listitem"]; each contains a card-wrapping
  // <a tabindex="0"> whose href is the profile URL. We start from the
  // listitems for structure, then dive in.
  const cards = document.querySelectorAll('main div[role="listitem"]');
  if (cards.length === 0) {
    log(
      'no result cards found. Are you on the People Search Results page with results rendered? Current URL:',
      window.location.href,
    );
    return;
  }
  log(`found ${cards.length} listitem nodes — extracting…`);

  // ---- EXTRACT EACH CARD -------------------------------------------------
  const newThisRun = [];
  for (const card of cards) {
    // The card-wrapping anchor: tabindex="0" + href to /in/. The inner
    // duplicate anchor (the name link inside the <p>) doesn't have
    // tabindex="0", so this disambiguates.
    const cardLink = card.querySelector('a[tabindex="0"][href*="/in/"]');
    if (!cardLink) continue;

    const profile_url = normalizeProfileUrl(cardLink.getAttribute('href'));
    if (!profile_url) continue;
    if (acc.seenUrls.has(profile_url)) continue;

    // -- name --
    // The figure has aria-labelledby pointing at a sibling div whose first
    // text node is the name. That div's full text contains "<Name> Premium"
    // or "<Name> Verified" because of badge SVGs, so we take just the
    // first text node.
    let name = '';
    const figure = card.querySelector('figure[aria-labelledby]');
    if (figure) {
      const nameContainer = card.querySelector(`#${CSS.escape(figure.getAttribute('aria-labelledby'))}`);
      if (nameContainer) {
        // Prefer the first text node directly (skips badges + whitespace spans).
        for (const node of nameContainer.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const t = cleanText(node.textContent);
            if (t) { name = t; break; }
          }
        }
        if (!name) name = cleanText(nameContainer.textContent.replace(/\b(Premium|Verified)\b/g, ''));
      }
    }
    // Fallback: figure on this card has no aria-labelledby (some cards
    // don't, e.g. when no profile photo). Try the duplicate inner anchor.
    if (!name) {
      const innerAnchor = cardLink.querySelector('a[href*="/in/"]');
      if (innerAnchor) {
        name = cleanText(
          Array.from(innerAnchor.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent)
            .join(' ')
            .replace(/\b(Premium|Verified)\b/g, ''),
        );
      }
    }

    // -- headline + location --
    // Both live inside <p> elements whose ONLY child is a <span> with
    // plain text. The same shape is used for mutual-connections summary
    // text, so we filter out anything that contains "mutual connection"
    // or "followers" or the "• 1st" indicator. After filtering, the
    // first remaining text is the headline; the second is the location.
    const candidateTexts = [];
    for (const p of cardLink.querySelectorAll('p')) {
      // We want <p> whose only meaningful child is a <span> containing plain text.
      const spans = p.querySelectorAll(':scope > span');
      if (spans.length !== 1) continue;
      // The span itself sometimes contains nested spans for the • 1st marker;
      // skip those. The headline/location spans contain only a single
      // text node child wrapped in a single inner <span>.
      const txt = cleanText(p.textContent);
      if (!txt) continue;
      if (txt === name) continue;
      if (/^\s*•/.test(txt)) continue;
      if (/ • 1st\b/.test(txt)) continue;
      if (/mutual connection/i.test(txt)) continue;
      if (/\bfollowers?\b/i.test(txt)) continue;
      if (/is a mutual connection/i.test(txt)) continue;
      candidateTexts.push(txt);
    }
    const headline = candidateTexts[0] || '';
    const location = candidateTexts[1] || '';

    const row = { name, profile_url, headline, location };
    newThisRun.push(row);
    acc.rows.push(row);
    acc.seenUrls.add(profile_url);
  }
  acc.pagesSeen += 1;
  persist();

  // ---- REPORT ------------------------------------------------------------
  log(
    `page ${acc.pagesSeen}: added ${newThisRun.length} new rows; total ${acc.rows.length} unique profiles captured so far.`,
  );
  if (newThisRun.length > 0) console.table(newThisRun);
  log(
    'call window.__liDownloadCsv() to download, window.__liClear() to start over.',
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
      console.error(`[li-scrape] downloaded ${a.rows.length} rows as ${link.download}`);
    };
  }
  if (!window.__liClear) {
    window.__liClear = () => {
      window.__liScrape = { rows: [], seenUrls: new Set(), pagesSeen: 0 };
      try {
        localStorage.removeItem('li-scrape-accumulator');
      } catch {
        /* nothing stored */
      }
      console.error('[li-scrape] accumulator cleared (memory + localStorage).');
    };
  }
})();
