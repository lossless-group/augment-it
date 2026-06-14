// ============================================================================
// linkedin-profile-to-row.js
//
// Paste-into-DevTools-Console snippet. Run while viewing an individual
// LinkedIn profile page in your own authenticated browser — e.g.:
//
//   https://www.linkedin.com/in/charlene-kuo-a877781/
//
// Companion to linkedin-search-results-to-csv.js. Extracts enough about
// one person to personalize an invite: full name, precise profile-page
// headline (often longer than the search-card version), location,
// current company, current school, and the About paragraph.
//
// Output shape (one object per profile, deduped by profile_url across tabs)
// -----------------------------------------------------------------------
//   {
//     name:            "Charlene Kuo",
//     profile_url:     "https://www.linkedin.com/in/charlene-kuo-a877781",
//     headline:        "Co-founding Partner of …",                  // precise
//     location:        "New York, New York, United States",
//     current_company: "Acme Capital",
//     current_school:  "Swarthmore College",
//     about:           "Paragraph from the About section…",
//     captured_at:     "2026-06-14T18:42:00.000Z"
//   }
//
// Note on Experience
// ------------------
// LinkedIn's late-2025/2026 rewrite moved the Experience array off the
// main profile page and onto a separate sub-page at
// /in/<slug>/details/experience/. This snippet does NOT fetch that
// sub-page; capturing it from there is a separate workflow (different
// DOM, different page navigation). The `current_company` field on the
// top card is usually enough for invite personalization; if you need
// the full history for someone specific, click into the experience
// sub-page and copy by hand or extend this snippet to handle it.
//
// How to use
// ----------
// 1. Navigate to the profile in a normal browser tab.
// 2. Open DevTools (Cmd+Option+I / F12), Console tab.
// 3. If you haven't already, type "allow pasting" + Enter to bypass
//    Chrome's self-XSS paste guard.
// 4. Paste this entire file, Enter. The structured object prints.
// 5. JSON is auto-copied to your clipboard when Chrome permits.
// 6. Move to the next profile — including Cmd+Click-into-new-tab — and
//    paste + Enter again. The accumulator is in localStorage on the
//    linkedin.com origin, so every tab sees the same growing list.
// 7. window.__liProfilesDownloadJson() — downloads all accumulated as JSON.
//    window.__liProfilesDownloadCsv()  — same data, CSV.
//    window.__liProfilesCount()        — just print the running count.
//    window.__liProfilesClear()        — start over.
//
// Storage detail
// --------------
// Profiles persist in localStorage under the key "lossless:li-profiles"
// on the linkedin.com origin. Shared across every linkedin.com tab,
// survives tab close and browser restart. Quota is ~5MB per origin —
// enough for several hundred profiles. A failed write logs a warning
// and the row falls back to in-tab only.
//
// Fail-loud discipline
// --------------------
// If every extracted field comes back empty, the snippet REFUSES to
// save and prints a giant red diagnostic banner. Better to scream once
// than to silently accumulate empty rows like the v1 snippet did.
//
// DOM strategy (mostly class-name-free)
// -------------------------------------
// LinkedIn rotates CSS classes constantly but keeps their server-driven
// componentkey attributes stable (they encode section identity).
//   - section[componentkey$="Topcard"] → the top card
//   - section[componentkey$="About"]   → the About section
//   - role-based and structural fallbacks where componentkey isn't enough
// Heading is <h2> on the new profile page (NOT <h1> — that broke v1).
// ============================================================================

(() => {
  // console.error so logs surface regardless of Console filter level.
  const log = (...args) => console.error('[li-profile]', ...args);

  // ---- ACCUMULATOR (localStorage, cross-tab) -----------------------------
  const STORAGE_KEY = 'lossless:li-profiles';
  const loadProfiles = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const saveProfiles = (rows) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
      return true;
    } catch (err) {
      log('warning: localStorage write failed (quota? private mode?):', err && err.message ? err.message : err);
      return false;
    }
  };
  window.__liProfiles = loadProfiles();

  // ---- HELPERS -----------------------------------------------------------
  const cleanText = (s) => (s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');

  const normalizeProfileUrl = () => {
    try {
      const u = new URL(window.location.href);
      const m = u.pathname.match(/^\/in\/[^/]+/);
      const path = m ? m[0] : u.pathname.replace(/\/$/, '');
      return `${u.origin}${path}`;
    } catch {
      return window.location.href;
    }
  };

  // ---- LOCATE THE TOP CARD ----------------------------------------------
  const main = document.querySelector('main') || document.body;
  // Primary: stable componentkey suffix.
  // Fallback: first <section> in <main> (the top card is always first).
  const topCard =
    main.querySelector('section[componentkey$="Topcard"]') ||
    main.querySelector('section');

  if (!topCard) {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('🚨 NO TOP CARD FOUND. selectors are stale or page not loaded.');
    log('   Are you on a profile page (linkedin.com/in/<slug>/)? Is the page fully rendered?');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return;
  }

  // ---- NAME --------------------------------------------------------------
  // LinkedIn's new profile uses <h2>, not <h1>. Take the first heading
  // inside the top card.
  let name = '';
  const heading = topCard.querySelector('h1, h2');
  if (heading) name = cleanText(heading.textContent);

  // ---- CLASSIFY THE TOP CARD'S <p> ELEMENTS -----------------------------
  // The top card has several <p> tags in a column: connection-degree
  // markers (· 1st, · 2nd), the headline (long prose), the company·school
  // line, the location, and the Contact-info link. We classify by
  // content shape rather than class names.
  const ps = Array.from(topCard.querySelectorAll('p')).map((p) => cleanText(p.textContent)).filter(Boolean);

  // The "· 1st"/"· 2nd" connection-degree markers — skip these.
  const isDegreeMarker = (t) => /^·\s*\d+(st|nd|rd|th)\+?$/i.test(t);
  // "500+ connections" / "1,234 connections" — skip.
  const isConnectionCount = (t) => /\bconnections?\b/i.test(t) && t.length < 40;
  // "Contact info" — skip.
  const isContactInfo = (t) => /^contact info$/i.test(t);
  // Standalone separator dot.
  const isJustDot = (t) => /^·$/.test(t);
  // Location patterns: City/Region with country, or "Greater <area>"
  const looksLikeLocation = (t) =>
    t.length < 80 &&
    (
      /^[A-Z][\w-]+(?:[\s,][A-Z][\w-]+)*,\s*[A-Z][\w-]+/.test(t) ||  // "City, State, Country" or "City, Country"
      /\b(Area|Region|Metropolitan)\b/.test(t)
    );
  // Company · School line: has middle-dot separator and is mostly proper nouns.
  const looksLikeCompanyLine = (t) =>
    /\s·\s/.test(t) &&
    !/^·\s*\d+/.test(t) &&
    t.length < 120 &&
    !looksLikeLocation(t);

  let headline = '';
  let companyLine = '';
  let location = '';
  for (const t of ps) {
    if (isDegreeMarker(t) || isConnectionCount(t) || isContactInfo(t) || isJustDot(t)) continue;
    if (t === name) continue;
    if (!location && looksLikeLocation(t)) {
      location = t;
      continue;
    }
    if (!companyLine && looksLikeCompanyLine(t)) {
      companyLine = t;
      continue;
    }
    // Headline: prefer the first long-text paragraph that isn't location
    // or company-line. The headline can be 60–400 characters.
    if (!headline && t.length >= 30 && !looksLikeLocation(t) && !looksLikeCompanyLine(t)) {
      headline = t;
    }
  }

  // ---- CURRENT COMPANY + SCHOOL (from logo "tiles" in top card) ---------
  // The top card includes role="button" tiles that link to the current
  // company and education entity pages — each tile has a <figure> with
  // the org logo and a <p><span>Name</span></p>. Order is company first,
  // school second (the tiles render in a fixed two-row stack).
  const tiles = topCard.querySelectorAll('div[role="button"]');
  const tileNames = [];
  for (const tile of tiles) {
    if (!tile.querySelector('figure')) continue;
    const span = tile.querySelector('p span');
    if (!span) continue;
    const t = cleanText(span.textContent);
    if (t && t.length < 80 && !tileNames.includes(t)) tileNames.push(t);
  }
  // Fallback: if no tiles, try to split the companyLine on " · ".
  let current_company = tileNames[0] || '';
  let current_school = tileNames[1] || '';
  if (!current_company && companyLine) {
    const parts = companyLine.split(/\s·\s/).map((s) => s.trim()).filter(Boolean);
    current_company = parts[0] || '';
    current_school = parts[1] || '';
  }

  // ---- ABOUT -------------------------------------------------------------
  let about = '';
  const aboutSection = main.querySelector('section[componentkey$="About"]');
  if (aboutSection) {
    const expandable = aboutSection.querySelector('[data-testid="expandable-text-box"]');
    const target = expandable || aboutSection.querySelector('p');
    if (target) {
      // Strip any "...more" expandable button text before reading.
      const clone = target.cloneNode(true);
      clone.querySelectorAll('button').forEach((b) => b.remove());
      about = cleanText(clone.textContent);
    }
  }

  // ---- ASSEMBLE ---------------------------------------------------------
  const row = {
    name,
    profile_url: normalizeProfileUrl(),
    headline,
    location,
    current_company,
    current_school,
    about,
    captured_at: new Date().toISOString(),
  };

  // ---- FAIL LOUD: refuse to save empty rows -----------------------------
  // The v1 snippet silently accumulated 262 empty rows because every
  // selector was stale. Never again: if nothing extracted, scream.
  const hasContent = name || headline || location || current_company || about;
  if (!hasContent) {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('🚨 NOTHING EXTRACTED. Refusing to save an empty row.');
    log('   Selectors are stale or the page hasn\'t finished rendering.');
    log('   - URL:', window.location.href);
    log('   - Top card found:', !!topCard);
    log('   - <p> elements in top card:', ps.length);
    log('   Paste the bottom-half of <main>\'s outerHTML into the chat and');
    log('   I\'ll fix the selectors.');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return;
  }

  // ---- STORE (dedup by profile_url; last-wins) --------------------------
  const persisted = loadProfiles();
  const existingIdx = persisted.findIndex((r) => r.profile_url === row.profile_url);
  let action = 'added';
  if (existingIdx >= 0) {
    persisted[existingIdx] = row;
    action = 'updated';
  } else {
    persisted.push(row);
  }
  const saved = saveProfiles(persisted);
  window.__liProfiles = persisted;

  log(
    `${action} ${name || '(no name)'} — ${persisted.length} unique in storage${saved ? '' : ' (in-memory only; localStorage write failed)'}.`,
  );
  log('row:', row);
  log(
    `name: ${name ? '✓' : '✗'} | headline: ${headline ? '✓' : '✗'} | location: ${location ? '✓' : '✗'} | current_company: ${current_company ? '✓' : '✗'} | current_school: ${current_school ? '✓' : '✗'} | about: ${about ? '✓' : '✗'}`,
  );

  // ---- CLIPBOARD ---------------------------------------------------------
  const json = JSON.stringify(row, null, 2);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(
      () => log('JSON copied to clipboard.'),
      () => log('clipboard write blocked — copy from the row log above.'),
    );
  }

  // ---- DOWNLOAD + CLEAR HELPERS (always read from localStorage) ---------
  window.__liProfilesDownloadJson = () => {
    const rows = loadProfiles();
    if (rows.length === 0) {
      console.warn('[li-profile] nothing to download yet.');
      return;
    }
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `linkedin-profiles-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    log(`downloaded ${rows.length} profile(s) as ${link.download}`);
  };
  window.__liProfilesDownloadCsv = () => {
    const rows = loadProfiles();
    if (rows.length === 0) {
      console.warn('[li-profile] nothing to download yet.');
      return;
    }
    const headers = ['name', 'profile_url', 'headline', 'location', 'current_company', 'current_school', 'about', 'captured_at'];
    const esc = (s) => {
      const v = String(s ?? '');
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [headers.join(',')];
    for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `linkedin-profiles-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    log(`downloaded ${rows.length} profile(s) as ${link.download}`);
  };
  window.__liProfilesClear = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    window.__liProfiles = [];
    log('accumulator cleared (localStorage + in-memory).');
  };
  window.__liProfilesCount = () => {
    const rows = loadProfiles();
    log(`${rows.length} profile(s) in storage.`);
    return rows.length;
  };
})();
