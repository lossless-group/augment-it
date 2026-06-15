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
//     name:              "Charlene Kuo",
//     profile_url:       "https://www.linkedin.com/in/charlene-kuo-a877781",
//     headline:          "Co-founding Partner of …",                // precise
//     pronouns:          "She/Her",                                 // when present
//     location:          "New York, New York, United States",
//     current_company:   "Acme Capital",                            // topcard tile
//     current_school:    "Swarthmore College",                      // topcard tile
//     website:           "https://example.com",                     // decoded from /safety/go/
//     followers_count:   "12,431",
//     connections_count: "500+",
//     about:             "Paragraph from the About section…",
//     profile_image:     "https://media.licdn.com/…/profile-displayphoto-shrink_400_400/…",
//     cover_image:       "https://media.licdn.com/…/profile-displaybackgroundimage-…/…",
//     captured_at:       "2026-06-14T18:42:00.000Z"
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
  // markers (· 1st, · 2nd), the headline (often contains " · " as a
  // separator — "Founder · Investor"), the location, the Contact-info
  // link, follower/connection counters. We classify by content shape.
  //
  // CRITICAL: Exclude paragraphs that live INSIDE the role="button"
  // school/company tiles. Otherwise "Stanford University" leaks into the
  // headline candidate pool for profiles with no actual headline.
  const ps = Array.from(topCard.querySelectorAll('p'))
    .filter((p) => !p.closest('div[role="button"]'))
    .map((p) => cleanText(p.textContent))
    .filter(Boolean);

  // The "· 1st"/"· 2nd" connection-degree markers — skip these.
  const isDegreeMarker = (t) => /^·\s*\d+(st|nd|rd|th)\+?$/i.test(t);
  // "500+ connections" / "1,234 connections" — skip.
  const isConnectionCount = (t) => /\bconnections?\b/i.test(t) && t.length < 40;
  // "4,174 followers" / "12K followers" — skip.
  const isFollowerCount = (t) => /\bfollowers?\b/i.test(t) && t.length < 40;
  // Pronouns standalone — skip from headline candidates.
  const isPronoun = (t) => /^(she|he|they|ze|xe)\/[a-z]+/i.test(t) && t.length < 30;
  // Single-word UI labels — skip ("Website", "More", "Message", etc.)
  const isUiLabel = (t) => /^(website|message|more|follow|connect|contact info)$/i.test(t);
  // "Contact info" — skip.
  const isContactInfo = (t) => /^contact info$/i.test(t);
  // Standalone separator dot.
  const isJustDot = (t) => /^·$/.test(t);

  // ---- LOCATION via DOM anchor (NOT regex) ------------------------------
  // The location <p> sits in the same parent div as the "Contact info"
  // link. That structural anchor is stable across LinkedIn's class
  // rotations — much more reliable than guessing by text shape, which
  // false-matched real headlines like "Principal, Private Equity Fund
  // Investments" against the "Word, Word" pattern.
  let location = '';
  const contactLink = topCard.querySelector('a[href*="/overlay/contact-info/"]');
  if (contactLink) {
    const block = contactLink.closest('div');
    if (block) {
      for (const p of block.querySelectorAll('p')) {
        if (p.closest('div[role="button"]')) continue;
        const t = cleanText(p.textContent);
        if (!t || t === '·' || isContactInfo(t)) continue;
        location = t;
        break;
      }
    }
  }
  // Fallback to text-shape match only if the DOM anchor failed
  // (e.g., 3rd-degree profile with no Contact info link).
  const looksLikeLocation = (t) =>
    t.length < 80 &&
    (/, .+, .+/.test(t) ||  // 2+ commas — "City, State, Country" / "City, Region, Country"
     /\b(Area|Region|Metropolitan|Greater)\b/.test(t));
  if (!location) {
    for (const t of ps) {
      if (looksLikeLocation(t)) { location = t; break; }
    }
  }

  // Headline minimum length. Lowered to 12 to admit short real headlines
  // like "Founder & CEO" (13), "Investor · Advisor" (18). The exclusion
  // filters above (pronoun, follower, connection, UI label, dot, name,
  // degree marker, location) already remove the short non-headline noise.
  const HEADLINE_MIN_LEN = 12;

  let headline = '';
  for (const t of ps) {
    if (isDegreeMarker(t) || isConnectionCount(t) || isFollowerCount(t)) continue;
    if (isContactInfo(t) || isJustDot(t) || isPronoun(t) || isUiLabel(t)) continue;
    if (t === name) continue;
    if (t === location) continue;
    if (t.length >= HEADLINE_MIN_LEN) { headline = t; break; }
  }

  // ---- CURRENT COMPANY + SCHOOL (from logo "tiles" in top card) ---------
  // The top card includes role="button" tiles, each with a <figure> that
  // contains a fallback <svg id="company-accent-4"> for companies and
  // <svg id="school-accent-4"> for schools. Use the svg id (stable across
  // class-name rotations) to classify each tile rather than assuming
  // company-then-school order — some profiles have only one tile, and a
  // school-only profile (e.g., recent grad, retiree) would otherwise
  // populate current_company with the school name.
  let current_company = '';
  let current_school = '';
  const tiles = topCard.querySelectorAll('div[role="button"]');
  for (const tile of tiles) {
    const fig = tile.querySelector('figure');
    if (!fig) continue;
    const span = tile.querySelector('p span');
    if (!span) continue;
    const t = cleanText(span.textContent);
    if (!t || t.length >= 80) continue;
    const svg = fig.querySelector('svg[id]');
    const id = svg ? svg.getAttribute('id') || '' : '';
    if (/^school/i.test(id)) {
      if (!current_school) current_school = t;
    } else if (/^company/i.test(id)) {
      if (!current_company) current_company = t;
    } else {
      // No identifying svg — fallback heuristic: name contains education
      // keyword? Treat as school, else company.
      const isEdu = /\b(University|College|School|Institute|Académie|Academy)\b/i.test(t);
      if (isEdu && !current_school) current_school = t;
      else if (!current_company) current_company = t;
    }
  }

  // ---- PRONOUNS, FOLLOWERS, CONNECTIONS (top-card scalars) --------------
  let pronouns = '';
  let followers_count = '';
  let connections_count = '';
  for (const t of ps) {
    if (!pronouns && /^(she|he|they)\/[a-z]+/i.test(t) && t.length < 30) pronouns = t;
    if (!followers_count) {
      const m = t.match(/^([\d,.KMm+]+)\s+follower/i);
      if (m) followers_count = m[1];
    }
    if (!connections_count) {
      const m = t.match(/^([\d,.KMm+]+)\s+connection/i);
      if (m) connections_count = m[1];
    }
  }

  // ---- WEBSITE (decode LinkedIn's /safety/go/ redirect) -----------------
  // Personal website appears in topcard as a link wrapped through
  // /safety/go/?url=<encoded>. Decode the url param to get the real URL.
  let website = '';
  for (const a of topCard.querySelectorAll('a[href*="/safety/go/"]')) {
    const label = cleanText(a.textContent);
    if (!/website/i.test(label)) continue;
    try {
      const u = new URL(a.href, window.location.origin);
      const encoded = u.searchParams.get('url');
      if (encoded) website = decodeURIComponent(encoded);
    } catch {}
    if (website) break;
  }

  // ---- IMAGES (profile photo + cover photo) -----------------------------
  let profile_image = '';
  let cover_image = '';
  const coverImg = topCard.querySelector('img[alt="Cover photo"]');
  if (coverImg && coverImg.src && /profile-displaybackgroundimage/.test(coverImg.src)) {
    cover_image = coverImg.src;
  }
  for (const img of topCard.querySelectorAll('img[src*="profile-displayphoto"]')) {
    if (img.src) { profile_image = img.src; break; }
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

  // ---- HEADLINE HYGIENE -------------------------------------------------
  // If the headline equals the current company or school name, the
  // classifier picked the tile's text (which already lives in
  // current_company/current_school). That isn't a headline; clear it so
  // downstream consumers can fall back to the company line.
  if (headline && (headline === current_company || headline === current_school)) {
    headline = '';
  }

  // ---- ASSEMBLE ---------------------------------------------------------
  const row = {
    name,
    profile_url: normalizeProfileUrl(),
    headline,
    pronouns,
    location,
    current_company,
    current_school,
    website,
    followers_count,
    connections_count,
    about,
    profile_image,
    cover_image,
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
  const chk = (v) => (v ? '✓' : '✗');
  log(
    `name:${chk(name)} headline:${chk(headline)} pronouns:${chk(pronouns)} location:${chk(location)} ` +
    `company:${chk(current_company)} school:${chk(current_school)} website:${chk(website)} ` +
    `followers:${chk(followers_count)} connections:${chk(connections_count)} about:${chk(about)} ` +
    `photo:${chk(profile_image)} cover:${chk(cover_image)}`,
  );

  // ---- CLIPBOARD ---------------------------------------------------------
  // navigator.clipboard.writeText requires page focus or a transient user
  // activation. Pasting code into DevTools gives neither (DevTools holds
  // focus), so the Promise rejects on most runs. Fall back to a hidden
  // textarea + execCommand('copy'), which still works in Chrome despite
  // being deprecated. If both fail, stay quiet — the row is already in
  // localStorage and printed above, so there's nothing to "rescue."
  const json = JSON.stringify(row, null, 2);
  const tryExecCopy = (text) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch { return false; }
  };
  const tryAsyncCopy = () => {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.reject(new Error('no api'));
    return navigator.clipboard.writeText(json);
  };
  tryAsyncCopy().then(
    () => log('JSON copied to clipboard.'),
    () => {
      if (tryExecCopy(json)) log('JSON copied to clipboard (fallback).');
      // else: silently skip — row is already in storage and printed above.
    },
  );

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
    const headers = ['name', 'profile_url', 'headline', 'pronouns', 'location', 'current_company', 'current_school', 'website', 'followers_count', 'connections_count', 'about', 'profile_image', 'cover_image', 'captured_at'];
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
