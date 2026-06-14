// ============================================================================
// linkedin-profile-to-row.js
//
// Paste-into-DevTools-Console snippet. Run while viewing an individual
// LinkedIn profile page in your own authenticated browser session — e.g.:
//
//   https://www.linkedin.com/in/charlene-kuo-a877781/
//
// Companion to linkedin-search-results-to-csv.js. Where that snippet pulls
// name / URL / headline / location off the search-results page, this one
// drills into one specific person and pulls the precise profile-page
// headline (sometimes longer than the search-card version) plus the
// current Experience entry (title + company + dates + optional
// description) — high-leverage fields for personalizing an invite.
//
// Output shape (one object per profile, accumulated across runs)
// --------------------------------------------------------------
//   {
//     name:         "Charlene Kuo",
//     profile_url:  "https://www.linkedin.com/in/charlene-kuo-a877781",
//     headline:     "General Partner @ Insight…",                 // precise
//     location:     "New York, New York, United States",
//     experience: [
//       {
//         title:       "General Partner",
//         company:     "Acme Capital",
//         dates:       "Jan 2023 - Present · 2 yrs",
//         location:    "New York, NY · On-site",                    // optional
//         description: "Paragraph the person wrote about the role"  // optional
//       },
//       { title: "Principal", company: "Acme Capital", dates: "…", … },
//       … (full Experience section, reverse-chronological)
//     ],
//     captured_at:  "2026-06-14T18:42:00.000Z"
//   }
//
// experience[0] is the topmost (most recent / current) entry. People with
// multiple concurrent current roles will have several "Present"-dated
// entries at the top of the array.
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
//    window.__liProfilesDownloadCsv()  — same data, CSV with experience as
//                                        a JSON-string column.
//    window.__liProfilesCount()        — just print the running count.
//    window.__liProfilesClear()        — start over.
//
// Storage detail
// --------------
// Profiles persist in localStorage under the key "lossless:li-profiles" on
// the linkedin.com origin. Shared across every linkedin.com tab, survives
// tab close and browser restart. Cleared by __liProfilesClear() or by
// clearing site data for linkedin.com in browser settings. Quota is ~5MB
// per origin — enough for several hundred profiles with full experience
// arrays. A failed write (quota exceeded, private-browsing mode) logs a
// warning and the row falls back to in-tab only.
//
// DOM strategy (no class-name dependencies)
// -----------------------------------------
// LinkedIn rotates class names too fast to track. This snippet uses:
//   - main h1 → name (stable; H1 is the profile's semantic landmark)
//   - section containing <div id="experience"> anchor → Experience section
//     (the anchor IDs power deep-linking and stay stable)
//   - aria-hidden="true" span pattern for the visible role/company/dates
//     text inside an Experience list item
//   - top-card structural neighborhood of the H1 for headline + location
// If the snippet stops finding fields, the diagnostic log at the end
// names what it found so you can update one selector instead of all.
// ============================================================================

(() => {
  // console.error so logs surface regardless of Console filter level.
  const log = (...args) => console.error('[li-profile]', ...args);

  // ---- ACCUMULATOR -------------------------------------------------------
  // localStorage so accumulation works across multiple tabs — operator's
  // typical workflow is Cmd+Click profiles from the search results page
  // into new tabs. window.__liProfiles is per-tab; localStorage is shared
  // across all linkedin.com tabs in the same browser profile and survives
  // tab close.
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
  // Keep window.__liProfiles as an in-tab convenience for legacy code paths,
  // but localStorage is the source of truth.
  window.__liProfiles = loadProfiles();

  // ---- HELPERS -----------------------------------------------------------
  const cleanText = (s) => (s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');

  const normalizeProfileUrl = () => {
    try {
      const u = new URL(window.location.href);
      // Strip query + fragment + trailing slash; keep /in/<slug> path only.
      const m = u.pathname.match(/^\/in\/[^/]+/);
      const path = m ? m[0] : u.pathname.replace(/\/$/, '');
      return `${u.origin}${path}`;
    } catch {
      return window.location.href;
    }
  };

  // Collect the visible text from an Experience list item. LinkedIn wraps
  // every visible string in <span aria-hidden="true"> with a parallel
  // <span class="visually-hidden"> duplicate for screen readers. Reading
  // only aria-hidden="true" spans avoids picking up the duplicates.
  const visibleSpansText = (root) => {
    const out = [];
    for (const span of root.querySelectorAll('span[aria-hidden="true"]')) {
      // Skip nested spans whose text is already captured by an ancestor.
      if (span.querySelector('span[aria-hidden="true"]')) continue;
      const t = cleanText(span.textContent);
      if (!t) continue;
      // Dedup adjacent repeats.
      if (out[out.length - 1] === t) continue;
      out.push(t);
    }
    return out;
  };

  // Heuristic: classify Experience-item text fragments into structured fields.
  // The conventional order on a single-role entry is:
  //   [0] title
  //   [1] company (sometimes with " · Full-time" appended)
  //   [2] dates  (contains "·" plus year/month words OR "Present")
  //   [3] location (optional; contains " · On-site" / " · Remote" / " · Hybrid"
  //                 or a city-state-country string)
  //   [4+] description paragraphs / bullets / skills row
  // We classify by content sniffing rather than position, so a missing
  // optional field doesn't shift the others.
  const looksLikeDates = (s) =>
    /\bPresent\b/.test(s) ||
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(s) ||
    /\b\d{4}\b\s*[-–]\s*(\b\d{4}\b|Present)/i.test(s);
  const looksLikeLocation = (s) =>
    /\b(On-site|Remote|Hybrid)\b/i.test(s) ||
    /,\s*[A-Z][a-zA-Z]+/.test(s);
  const looksLikeSkills = (s) => /^Skills:?\s/i.test(s);

  // ---- NAME --------------------------------------------------------------
  const main = document.querySelector('main') || document.body;
  const h1 = main.querySelector('h1');
  const name = h1 ? cleanText(h1.textContent) : '';

  // ---- HEADLINE + LOCATION (top-card neighborhood of h1) -----------------
  // Walk forward from the h1's parent looking for nearby text blocks. The
  // headline is typically the next div with rich text under the h1;
  // location is a shorter, location-shaped string further down.
  let headline = '';
  let location = '';
  if (h1) {
    const topCard = h1.closest('section') || h1.parentElement?.parentElement || main;
    // Gather all text from divs/spans inside the top-card whose textContent
    // is short-to-medium and doesn't include link/button structure.
    const candidates = [];
    for (const el of topCard.querySelectorAll('div, span')) {
      if (el.querySelector('button, a, h1, ul, section')) continue;
      const t = cleanText(el.textContent);
      if (!t || t === name) continue;
      if (t.length > 250) continue;
      if (candidates.includes(t)) continue;
      candidates.push(t);
    }
    // Headline: first candidate that isn't location-shaped and isn't a
    // pronoun/connection-degree indicator and isn't a contact-info button label.
    for (const t of candidates) {
      if (/^(He\/Him|She\/Her|They\/Them)\b/i.test(t)) continue;
      if (/^\d+(st|nd|rd|th) (degree|connection)/i.test(t)) continue;
      if (/^Contact info$/i.test(t)) continue;
      if (/^Open to /i.test(t)) continue;
      if (looksLikeLocation(t) && t.length < 80) continue;
      headline = t;
      break;
    }
    // Location: shortest candidate that looks location-shaped.
    const locCandidates = candidates
      .filter((t) => looksLikeLocation(t) && t.length < 80 && t !== headline)
      .sort((a, b) => a.length - b.length);
    location = locCandidates[0] || '';
  }

  // ---- EXPERIENCE SECTION ------------------------------------------------
  // Find the Experience section. LinkedIn deep-links to /details/experience/
  // and keeps stable anchor IDs like <div id="experience"> for that.
  const experience = [];
  const experienceAnchor =
    document.getElementById('experience') ||
    document.querySelector('[id^="experience"]') ||
    document.querySelector('[data-section="experience"]');
  let experienceSection = null;
  if (experienceAnchor) {
    experienceSection =
      experienceAnchor.closest('section') ||
      experienceAnchor.parentElement;
  }
  // Fallback: find a <section> whose first h2/h3 text is "Experience".
  if (!experienceSection) {
    for (const sec of main.querySelectorAll('section')) {
      const heading = sec.querySelector('h2, h3');
      if (heading && /^Experience\b/i.test(cleanText(heading.textContent))) {
        experienceSection = sec;
        break;
      }
    }
  }

  // Classify a single item's visible-span text into a structured entry.
  // Content-sniffing rather than position-based so missing optional fields
  // (location / description) don't shift the others.
  const parseExperienceItem = (item) => {
    const texts = visibleSpansText(item).filter((t) => !looksLikeSkills(t));
    if (texts.length === 0) return null;
    const title = texts[0] || '';
    const datesIdx = texts.findIndex(looksLikeDates);
    const company = texts[1] && texts[1] !== title ? texts[1] : '';
    const dates = datesIdx >= 0 ? texts[datesIdx] : '';
    const locIdx = texts.findIndex(
      (t, i) => datesIdx >= 0 && i > datesIdx && looksLikeLocation(t) && t.length < 80,
    );
    const locStr = locIdx >= 0 ? texts[locIdx] : '';
    const descStart = Math.max(datesIdx, locIdx) + 1;
    const descParts = texts.slice(descStart);
    const description = descParts.join('\n');
    return { title, company, dates, location: locStr, description };
  };

  if (experienceSection) {
    // Find all top-level entries. LinkedIn uses <li>, sometimes
    // role="listitem" divs, sometimes data-view-name entity nodes.
    // We try in order of specificity and take the first non-empty set.
    let items = [];
    const candidates = [
      'div[data-view-name^="profile-component-entity"]',
      'div[role="listitem"]',
      ':scope > div > ul > li',
      'ul > li',
      'li',
    ];
    for (const sel of candidates) {
      const found = experienceSection.querySelectorAll(sel);
      if (found.length > 0) { items = Array.from(found); break; }
    }
    // De-dup ancestor/descendant matches (when a candidate selector
    // captures both an outer wrapper and an inner item).
    items = items.filter((el, i, arr) =>
      !arr.some((other, j) => j !== i && other !== el && other.contains(el))
    );
    for (const item of items) {
      const entry = parseExperienceItem(item);
      if (entry && entry.title) experience.push(entry);
    }
  }

  // ---- ASSEMBLE + STORE --------------------------------------------------
  const row = {
    name,
    profile_url: normalizeProfileUrl(),
    headline,
    location,
    experience,
    captured_at: new Date().toISOString(),
  };
  // Reload from storage at write time so concurrent tabs don't clobber
  // each other's writes (two profiles captured in two tabs simultaneously
  // would race if we relied only on the in-memory window.__liProfiles
  // snapshot from this snippet's onload).
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
    `${action} ${name || '(no name — selectors stale?)'} — ${persisted.length} unique profile(s) in storage${saved ? '' : ' (in-memory only; localStorage write failed)'}.`,
  );
  log('row:', row);
  // Diagnostic so a partially-stale run is easy to debug:
  log(`name: ${name ? '✓' : '✗'} | headline: ${headline ? '✓' : '✗'} | location: ${location ? '✓' : '✗'} | experience entries: ${experience.length}`);

  // ---- CLIPBOARD ---------------------------------------------------------
  const json = JSON.stringify(row, null, 2);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(
      () => log('JSON copied to clipboard.'),
      () => log('clipboard write blocked — copy from the row log above.'),
    );
  }

  // ---- DOWNLOAD + CLEAR HELPERS (idempotent, read from localStorage) -----
  // Always defined fresh so the helpers see the current STORAGE_KEY value
  // even if the snippet has been edited and re-pasted.
  window.__liProfilesDownloadJson = () => {
    const rows = loadProfiles();
    if (rows.length === 0) {
      console.warn('[li-profile] nothing to download yet.');
      return;
    }
    const blob = new Blob(
      [JSON.stringify(rows, null, 2)],
      { type: 'application/json' },
    );
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
  // CSV variant — for parity with the search-results snippet and easy
  // import into augment-it / spreadsheets. The experience array is
  // serialized as a JSON string in a single cell.
  window.__liProfilesDownloadCsv = () => {
    const rows = loadProfiles();
    if (rows.length === 0) {
      console.warn('[li-profile] nothing to download yet.');
      return;
    }
    const headers = ['name', 'profile_url', 'headline', 'location', 'experience_json', 'captured_at'];
    const csvEscape = (s) => {
      const v = String(s ?? '');
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([
        csvEscape(r.name),
        csvEscape(r.profile_url),
        csvEscape(r.headline),
        csvEscape(r.location),
        csvEscape(JSON.stringify(r.experience ?? [])),
        csvEscape(r.captured_at),
      ].join(','));
    }
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
