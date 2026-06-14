// ============================================================================
// linkedin-profile-to-row.js
//
// Paste-into-DevTools-Console snippet. Run while viewing an individual
// LinkedIn profile page in your own authenticated browser — typically:
//
//   https://www.linkedin.com/in/<slug>/
//
// Companion to linkedin-search-results-to-csv.js. Where that snippet pulls
// names/URLs/location from a search results page, this one drills into one
// specific person and extracts richer fields useful for triaging high-value
// invites: full headline, current role, About paragraph, top three
// Experience entries, location.
//
// What it does
// ------------
// Walks the rendered profile DOM, returns one structured object, appends
// to window.__liProfiles, and console.logs the JSON so you can copy. Also
// puts the JSON onto your clipboard automatically when permitted.
//
// How to use
// ----------
// 1. Navigate to the profile page in a normal browser tab.
// 2. Open DevTools (Cmd+Option+I / F12), Console tab.
// 3. Paste this entire file, Enter.
// 4. The structured object prints. JSON is in your clipboard (if the page
//    grants clipboard permission — Chrome usually does once you've focused
//    the page first; if it doesn't, copy from the console output).
// 5. Move to the next profile. Re-run — accumulates into window.__liProfiles.
// 6. Call window.__liProfilesDownloadJson() to download all accumulated
//    profiles as a single .json file.
//
// Selector maintenance
// --------------------
// Same as the search-results snippet: LinkedIn rotates classes regularly.
// SELECTORS at top of file is the only place to update. Each field tries
// several candidate selectors in order until one matches.
// ============================================================================

(() => {
  // ---- SELECTORS — UPDATE WHEN LINKEDIN ROTATES CLASS NAMES --------------
  //
  // Profile pages use a different DOM than search results. The top card
  // contains name + headline + location; sections below it are
  // about / experience / education / skills.
  const SELECTORS = {
    // The "top card" wrapper — name + headline + location + photo.
    topCard: [
      'section.pv-top-card',
      'section.artdeco-card.pv-top-card',
      'main section:first-of-type',
    ],
    // Name — large <h1> in the top card.
    name: ['h1.text-heading-xlarge', 'h1.top-card-layout__title', 'h1'],
    // Headline — the role / company line under the name.
    headline: [
      'div.text-body-medium.break-words',
      'div.pv-top-card--list-bullet',
      'div.top-card-layout__headline',
    ],
    // Location — the geographic city line, usually a small text span
    // nestled near the headline.
    location: [
      'span.text-body-small.inline.t-black--light.break-words',
      'span.pv-top-card--list-bullet > li',
      'div.pb2 span',
    ],
    // About section. LinkedIn anchor IDs are unusually stable — preferred.
    aboutSection: [
      'section#about-section',
      'section[data-section="about"]',
      'div#about ~ div',
    ],
    aboutText: [
      'div.display-flex.full-width div.inline-show-more-text',
      'div.pv-shared-text-with-see-more',
      'div.display-flex span[aria-hidden="true"]',
    ],
    // Experience section's list items — we'll take the top 3.
    experienceSection: [
      'section#experience-section',
      'section[data-section="experience"]',
      'div#experience ~ div',
    ],
    experienceItem: [
      'li.artdeco-list__item',
      'li.pv-entity__position-group-pager',
      'li',
    ],
  };

  // ---- ACCUMULATOR -------------------------------------------------------
  if (!window.__liProfiles) window.__liProfiles = [];

  // ---- HELPERS -----------------------------------------------------------
  const cleanText = (s) =>
    (s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');

  const firstText = (root, list) => {
    for (const sel of list) {
      const el = root.querySelector(sel);
      if (el) {
        const t = cleanText(el.textContent);
        if (t) return { text: t, selectorUsed: sel };
      }
    }
    return { text: '', selectorUsed: null };
  };

  const firstEl = (root, list) => {
    for (const sel of list) {
      const el = root.querySelector(sel);
      if (el) return { el, selectorUsed: sel };
    }
    return { el: null, selectorUsed: null };
  };

  // ---- EXTRACT THE TOP CARD ----------------------------------------------
  const topCardMatch = firstEl(document, SELECTORS.topCard);
  if (!topCardMatch.el) {
    console.error(
      '[li-profile] top card not found — selectors are stale. Update SELECTORS.topCard.',
    );
    return;
  }
  const topCard = topCardMatch.el;

  const name = firstText(topCard, SELECTORS.name).text;
  const headline = firstText(topCard, SELECTORS.headline).text;
  const location = firstText(topCard, SELECTORS.location).text;

  // ---- ABOUT -------------------------------------------------------------
  const aboutSection = firstEl(document, SELECTORS.aboutSection).el;
  const about = aboutSection
    ? firstText(aboutSection, SELECTORS.aboutText).text
    : '';

  // ---- EXPERIENCE — TOP 3 ENTRIES ----------------------------------------
  const experienceSection = firstEl(document, SELECTORS.experienceSection).el;
  const experience = [];
  if (experienceSection) {
    const items = [];
    for (const sel of SELECTORS.experienceItem) {
      const found = experienceSection.querySelectorAll(sel);
      if (found.length > 0) {
        items.push(...found);
        break;
      }
    }
    for (const item of Array.from(items).slice(0, 3)) {
      // Best-effort: collect non-empty text spans inside the item, dedup,
      // join with " · ". Tune by inspecting if the resulting strings look
      // garbled — LinkedIn frequently wraps the same text in nested spans
      // to defeat naive extractors.
      const spans = Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
        .map((s) => cleanText(s.textContent))
        .filter(Boolean);
      const deduped = [];
      for (const t of spans) {
        if (!deduped.includes(t)) deduped.push(t);
      }
      if (deduped.length > 0) experience.push(deduped.join(' · '));
    }
  }

  // ---- ASSEMBLE + REPORT -------------------------------------------------
  const profile_url = (() => {
    try {
      const u = new URL(location.protocol === undefined ? window.location.href : window.location.href);
      return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
    } catch {
      return window.location.href;
    }
  })();

  const row = {
    name,
    profile_url,
    headline,
    location,
    about,
    experience,
    captured_at: new Date().toISOString(),
  };

  window.__liProfiles.push(row);

  console.info(
    `[li-profile] captured ${row.name || '(no name found — selectors may be stale)'} — ${window.__liProfiles.length} profile(s) accumulated this session.`,
  );
  console.log(row);
  const json = JSON.stringify(row, null, 2);

  // Try to put JSON on the clipboard. navigator.clipboard requires the
  // page to be focused; we ignore failure quietly because the user can
  // copy from the console output below regardless.
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(
      () => console.info('[li-profile] JSON copied to clipboard.'),
      () => console.info('[li-profile] clipboard write blocked — copy from the log above.'),
    );
  }
  console.log(json);

  // ---- DOWNLOAD HELPER (defined once) ------------------------------------
  if (!window.__liProfilesDownloadJson) {
    window.__liProfilesDownloadJson = () => {
      if (!window.__liProfiles || window.__liProfiles.length === 0) {
        console.warn('[li-profile] nothing to download yet.');
        return;
      }
      const blob = new Blob(
        [JSON.stringify(window.__liProfiles, null, 2)],
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
      console.info(
        `[li-profile] downloaded ${window.__liProfiles.length} profile(s) as ${link.download}`,
      );
    };
  }
  if (!window.__liProfilesClear) {
    window.__liProfilesClear = () => {
      window.__liProfiles = [];
      console.info('[li-profile] accumulator cleared.');
    };
  }
})();
