// ==UserScript==
// @name         Lossless — LinkedIn Network Capture
// @namespace    https://github.com/lossless-group/augment-it
// @version      1.0.0
// @description  Auto-extracts profile data from any LinkedIn profile page and (optionally) walks a queue of profile URLs at human-shaped delays. Pairs with the queue-starter snippet at tools/browser-snippets/linkedin/linkedin-queue-start.js.
// @author       Lossless Group
// @match        https://www.linkedin.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
//
// HOW THIS WORKS
// --------------
// Two responsibilities, one script:
//
// 1. Auto-extract on profile pages (/in/<slug>/)
//    - Waits for the top card to render (LinkedIn lazy-loads sections)
//    - Runs the same extraction the manual snippet does
//    - Saves the row into localStorage["lossless:li-profiles"] (deduped
//      by profile_url — same key, same shape, so manual + auto runs
//      mingle correctly)
//    - Signals capture-complete via localStorage so the queue walker
//      knows to advance
//
// 2. Queue walker (anywhere on linkedin.com when a queue is active)
//    - Reads the URL queue from localStorage["lossless:li-queue"]
//    - After capture-complete (on profile pages) or immediately (anywhere
//      else): sleeps a randomized 35-65s, then navigates to the next URL
//      via window.location.href (full navigation in the same tab, so
//      Tampermonkey fires again on the new page)
//    - Tracks current index so resumes survive tab close
//
// HOW TO START A WALK
// -------------------
// 1. Install this userscript in Tampermonkey.
// 2. In any linkedin.com tab, open DevTools Console.
// 3. Paste the queue-starter snippet
//    (tools/browser-snippets/linkedin/linkedin-queue-start.js), provide
//    your list of URLs, hit Enter. It sets the queue, sets the active
//    flag, navigates to the first URL. Walk away.
//
// HOW TO PAUSE / RESUME / STOP
// ----------------------------
//   Pause:  localStorage.setItem('lossless:li-queue-active', 'false')
//   Resume: localStorage.setItem('lossless:li-queue-active', 'true');
//           location.reload()  // re-arm the walker on current page
//   Stop:   localStorage.removeItem('lossless:li-queue')
//           localStorage.removeItem('lossless:li-queue-active')
//           localStorage.removeItem('lossless:li-queue-index')
//
// ACCOUNT-RISK NOTES
// ------------------
// Same shape as manual browsing — single tab, full page navigations,
// 35-65s human-shaped delays between profiles, no parallel requests.
// LinkedIn's auto-detection thresholds target rate, fingerprint, and
// behavioral patterns; this walks under all of them. Still TOS-violating
// in the formal sense; risk profile is much lower than headless / proxy
// approaches.
//
// For ~252 profiles at 45s avg: ~3.2 hours unattended. Spread across two
// sessions if you want to be extra cautious.

(function () {
  'use strict';

  // ---- KEYS ------------------------------------------------------------
  const STORAGE_KEY_PROFILES = 'lossless:li-profiles';
  const STORAGE_KEY_QUEUE = 'lossless:li-queue';
  const STORAGE_KEY_QUEUE_INDEX = 'lossless:li-queue-index';
  const STORAGE_KEY_QUEUE_ACTIVE = 'lossless:li-queue-active';
  const STORAGE_KEY_LAST_CAPTURE = 'lossless:li-last-capture';

  // ---- PACING ----------------------------------------------------------
  // Randomized delay between capture-complete and next navigation.
  // Human-shaped: someone reads a profile for 30-60s before moving on.
  const PACE_MIN_MS = 35_000;
  const PACE_MAX_MS = 65_000;
  const pacedDelay = () => PACE_MIN_MS + Math.floor(Math.random() * (PACE_MAX_MS - PACE_MIN_MS));

  // Max time we'll wait for the top card to render before giving up.
  const RENDER_TIMEOUT_MS = 15_000;

  // ---- LOGGING ---------------------------------------------------------
  const log = (...args) => console.error('[li-walker]', ...args);

  // ---- PROFILE-PAGE DETECTION -----------------------------------------
  const isProfilePage = () => /^\/in\/[^/]+\/?$/.test(location.pathname);

  // ---- STORAGE HELPERS -------------------------------------------------
  const loadProfiles = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };
  const saveProfiles = (rows) => {
    try { localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(rows)); return true; }
    catch (err) { log('storage write failed:', err && err.message); return false; }
  };

  // ---- EXTRACTION (same shape as linkedin-profile-to-row.js) ----------
  const cleanText = (s) => (s || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  const normalizeProfileUrl = () => {
    try {
      const u = new URL(location.href);
      const m = u.pathname.match(/^\/in\/[^/]+/);
      const path = m ? m[0] : u.pathname.replace(/\/$/, '');
      return `${u.origin}${path}`;
    } catch { return location.href; }
  };

  const extract = () => {
    const main = document.querySelector('main') || document.body;
    const topCard =
      main.querySelector('section[componentkey$="Topcard"]') ||
      main.querySelector('section');
    if (!topCard) return null;

    let name = '';
    const heading = topCard.querySelector('h1, h2');
    if (heading) name = cleanText(heading.textContent);

    const ps = Array.from(topCard.querySelectorAll('p'))
      .map((p) => cleanText(p.textContent))
      .filter(Boolean);

    const isDegreeMarker = (t) => /^·\s*\d+(st|nd|rd|th)\+?$/i.test(t);
    const isConnectionCount = (t) => /\bconnections?\b/i.test(t) && t.length < 40;
    const isContactInfo = (t) => /^contact info$/i.test(t);
    const isJustDot = (t) => /^·$/.test(t);
    const looksLikeLocation = (t) =>
      t.length < 80 &&
      (
        /^[A-Z][\w-]+(?:[\s,][A-Z][\w-]+)*,\s*[A-Z][\w-]+/.test(t) ||
        /\b(Area|Region|Metropolitan)\b/.test(t)
      );
    const looksLikeCompanyLine = (t) =>
      /\s·\s/.test(t) && !/^·\s*\d+/.test(t) && t.length < 120 && !looksLikeLocation(t);

    let headline = '', companyLine = '', loc = '';
    for (const t of ps) {
      if (isDegreeMarker(t) || isConnectionCount(t) || isContactInfo(t) || isJustDot(t)) continue;
      if (t === name) continue;
      if (!loc && looksLikeLocation(t)) { loc = t; continue; }
      if (!companyLine && looksLikeCompanyLine(t)) { companyLine = t; continue; }
      if (!headline && t.length >= 30 && !looksLikeLocation(t) && !looksLikeCompanyLine(t)) {
        headline = t;
      }
    }

    const tiles = topCard.querySelectorAll('div[role="button"]');
    const tileNames = [];
    for (const tile of tiles) {
      if (!tile.querySelector('figure')) continue;
      const span = tile.querySelector('p span');
      if (!span) continue;
      const t = cleanText(span.textContent);
      if (t && t.length < 80 && !tileNames.includes(t)) tileNames.push(t);
    }
    let current_company = tileNames[0] || '';
    let current_school = tileNames[1] || '';
    if (!current_company && companyLine) {
      const parts = companyLine.split(/\s·\s/).map((s) => s.trim()).filter(Boolean);
      current_company = parts[0] || '';
      current_school = parts[1] || '';
    }

    let about = '';
    const aboutSection = main.querySelector('section[componentkey$="About"]');
    if (aboutSection) {
      const expandable = aboutSection.querySelector('[data-testid="expandable-text-box"]');
      const target = expandable || aboutSection.querySelector('p');
      if (target) {
        const clone = target.cloneNode(true);
        clone.querySelectorAll('button').forEach((b) => b.remove());
        about = cleanText(clone.textContent);
      }
    }

    return {
      name,
      profile_url: normalizeProfileUrl(),
      headline,
      location: loc,
      current_company,
      current_school,
      about,
      captured_at: new Date().toISOString(),
    };
  };

  // Refuse-empty discipline. Returns true if saved, false otherwise.
  const tryCapture = () => {
    const row = extract();
    if (!row) return false;
    const hasContent = row.name || row.headline || row.location || row.current_company || row.about;
    if (!hasContent) return false;

    const persisted = loadProfiles();
    const idx = persisted.findIndex((r) => r.profile_url === row.profile_url);
    if (idx >= 0) persisted[idx] = row;
    else persisted.push(row);
    saveProfiles(persisted);

    localStorage.setItem(STORAGE_KEY_LAST_CAPTURE, JSON.stringify({
      profile_url: row.profile_url,
      captured_at: row.captured_at,
    }));

    log(
      `captured ${row.name || '(no name)'} — ${persisted.length} unique in storage`,
      `[name:${row.name ? '✓' : '✗'} headline:${row.headline ? '✓' : '✗'} loc:${row.location ? '✓' : '✗'} co:${row.current_company ? '✓' : '✗'} about:${row.about ? '✓' : '✗'}]`,
    );
    return true;
  };

  // ---- WAIT FOR PROFILE TO RENDER, THEN CAPTURE -----------------------
  const waitAndCapture = () => {
    return new Promise((resolve) => {
      const start = Date.now();
      const interval = setInterval(() => {
        if (tryCapture()) {
          clearInterval(interval);
          resolve(true);
          return;
        }
        if (Date.now() - start > RENDER_TIMEOUT_MS) {
          clearInterval(interval);
          log('🚨 render timeout — profile not fully loaded after 15s, skipping');
          resolve(false);
        }
      }, 500);
    });
  };

  // ---- QUEUE WALKING ---------------------------------------------------
  const queueActive = () => localStorage.getItem(STORAGE_KEY_QUEUE_ACTIVE) === 'true';
  const getQueue = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_QUEUE);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };
  const getQueueIndex = () => {
    const v = parseInt(localStorage.getItem(STORAGE_KEY_QUEUE_INDEX) || '0', 10);
    return Number.isFinite(v) ? v : 0;
  };
  const setQueueIndex = (i) => localStorage.setItem(STORAGE_KEY_QUEUE_INDEX, String(i));
  const stopQueue = () => {
    localStorage.removeItem(STORAGE_KEY_QUEUE_ACTIVE);
    log('queue exhausted — stopping');
  };

  const advanceQueue = (reason) => {
    const queue = getQueue();
    const idx = getQueueIndex();
    const nextIdx = idx + 1;
    if (nextIdx >= queue.length) {
      stopQueue();
      return;
    }
    setQueueIndex(nextIdx);
    const nextUrl = queue[nextIdx];
    const delay = pacedDelay();
    log(`${reason} — advancing to ${nextIdx + 1}/${queue.length} in ${Math.round(delay / 1000)}s: ${nextUrl}`);
    setTimeout(() => {
      location.href = nextUrl;
    }, delay);
  };

  // ---- MAIN ------------------------------------------------------------
  // On every page load, decide what to do based on URL + queue state.
  if (isProfilePage()) {
    waitAndCapture().then((captured) => {
      if (queueActive()) advanceQueue(captured ? 'captured' : 'render-failed');
    });
  } else if (queueActive()) {
    // Not a profile page but queue is active — kick to first/next URL.
    const queue = getQueue();
    const idx = getQueueIndex();
    if (idx < queue.length) {
      const url = queue[idx];
      log(`queue active, navigating to ${idx + 1}/${queue.length}: ${url}`);
      // Small delay to let the page settle before navigation.
      setTimeout(() => { location.href = url; }, 1500);
    } else {
      stopQueue();
    }
  }
})();
