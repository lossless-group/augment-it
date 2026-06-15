// ============================================================================
// linkedin-profile-save-pdf.js
//
// Paste-into-DevTools-Console snippet. Run while viewing an individual
// LinkedIn profile in your own authenticated browser. Triggers LinkedIn's
// built-in "Save to PDF" feature so you get the full profile (Experience
// array, Education, Skills, About, etc.) as a downloaded PDF — no scraping.
//
// LinkedIn explicitly built Save-to-PDF as a user-facing feature, so this
// is fully TOS-clean. The snippet just automates the three clicks: More
// button → menu opens → "Save to PDF" item → PDF downloads.
//
// Output
// ------
// Browser downloads a PDF named after the person (typically "Profile.pdf"
// or "<FirstName><LastName>.pdf" — LinkedIn picks the filename). Move it
// into clients/<workspace>/inputs/profiles/ to keep things organized.
//
// Why this exists
// ---------------
// The DOM-extraction snippet (linkedin-profile-to-row.js) captures
// top-card data but cannot reach the Experience array because LinkedIn
// moved Experience to a separate /details/experience/ sub-page in the
// late-2025 / 2026 rewrite. Save-to-PDF includes everything in one
// document, no DOM rewriting required.
//
// How to use
// ----------
// 1. Navigate to a profile in a normal browser tab.
// 2. Open DevTools (Cmd+Option+I / F12), Console tab.
// 3. If you haven't already, type "allow pasting" + Enter to bypass
//    Chrome's self-XSS paste guard.
// 4. Paste this entire file, Enter.
// 5. The snippet clicks More → Save to PDF. A PDF downloads to your
//    Downloads folder. Move it where you want it.
// 6. Move to the next profile and repeat.
//
// If LinkedIn renames the menu item (e.g., to "Save Profile as PDF"),
// add the new label to TARGET_LABELS at the top of the file.
// ============================================================================

(() => {
  const log = (...args) => console.error('[li-pdf]', ...args);

  // Labels we'll accept as "the Save-to-PDF menu item" — case-insensitive
  // substring match. Add more if LinkedIn renames.
  const TARGET_LABELS = [
    'save to pdf',
    'save profile as pdf',
    'save as pdf',
    'download as pdf',
    'export pdf',
  ];

  const matchesTarget = (text) => {
    const t = (text || '').toLowerCase();
    return TARGET_LABELS.some((label) => t.includes(label));
  };

  // ---- MANIFEST (cross-tab, localStorage) -------------------------------
  // Every successful Save-to-PDF click is recorded so we know which
  // profile each Chrome-named "Profile.pdf" belongs to without having to
  // pdftotext the file later. Dedup by profile_url; last-wins.
  const MANIFEST_KEY = 'lossless:li-pdf-manifest';
  const loadManifest = () => {
    try {
      const raw = localStorage.getItem(MANIFEST_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };
  const saveManifest = (rows) => {
    try { localStorage.setItem(MANIFEST_KEY, JSON.stringify(rows)); return true; }
    catch (err) { log('warning: localStorage write failed:', err && err.message ? err.message : err); return false; }
  };
  const normalizeProfileUrl = () => {
    try {
      const u = new URL(window.location.href);
      const m = u.pathname.match(/^\/in\/[^/]+/);
      const path = m ? m[0] : u.pathname.replace(/\/$/, '');
      return `${u.origin}${path}`;
    } catch { return window.location.href; }
  };
  const slugFromUrl = (url) => {
    const m = (url || '').match(/\/in\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  };

  // ---- 1. FIND THE MORE BUTTON IN THE TOP CARD --------------------------
  // The top card has a "More" button distinct from any other More buttons
  // on the page (e.g., post-level controls). Strategy: scope to the
  // top-card section via the stable componentkey suffix, then find a
  // <button> whose visible text is exactly "More".
  const main = document.querySelector('main') || document.body;
  const topCard =
    main.querySelector('section[componentkey$="Topcard"]') ||
    main.querySelector('section');
  if (!topCard) {
    log('🚨 top card not found. Are you on a /in/<slug>/ profile page?');
    return;
  }

  // Capture profile identity NOW (while we know we're on the right page).
  const profile_url = normalizeProfileUrl();
  const slug = slugFromUrl(profile_url);
  const nameEl = topCard.querySelector('h1, h2');
  const name = nameEl ? (nameEl.textContent || '').replace(/\s+/g, ' ').trim() : '';

  const buttons = Array.from(topCard.querySelectorAll('button'));
  const moreButton = buttons.find((b) => {
    const t = (b.textContent || '').trim().toLowerCase();
    return t === 'more' || t === 'more actions';
  });
  if (!moreButton) {
    log('🚨 "More" button not found in top card. Selectors may need updating.');
    log('   Buttons seen in top card:', buttons.map((b) => b.textContent.trim()).filter(Boolean));
    return;
  }
  log('opening More menu…');
  moreButton.click();

  // ---- 2. POLL FOR THE MENU ITEM ---------------------------------------
  // The menu renders into a dropdown that may live elsewhere in the DOM
  // tree (often a portal at body-level), so we search the whole document.
  // Polling because the dropdown animates open over ~100-300ms.
  const startTs = Date.now();
  const MAX_WAIT_MS = 3000;
  const POLL_MS = 50;

  const tryFindAndClick = () => {
    // Look for any role="menuitem" / button / a element whose text matches.
    const candidates = document.querySelectorAll(
      '[role="menuitem"], [role="button"], button, a',
    );
    for (const el of candidates) {
      // Skip elements that aren't currently rendered (display:none ancestor).
      // getClientRects() returns 0 length for invisible elements.
      if (!el.getClientRects().length) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      if (matchesTarget(text)) {
        log(`found menu item: "${text}" — clicking`);
        // Record manifest entry BEFORE clicking — if the user dismisses
        // LinkedIn's confirmation dialog, the worst case is a stale entry
        // (which we can spot later by diffing manifest vs. files on disk).
        const triggered_at = new Date().toISOString();
        try {
          const rows = loadManifest();
          const idx = rows.findIndex((r) => r.profile_url === profile_url);
          const entry = { profile_url, slug, name, triggered_at };
          if (idx >= 0) rows[idx] = entry; else rows.push(entry);
          saveManifest(rows);
          log(`manifest: ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} (${slug || '(no slug)'})`);
        } catch (err) {
          log('manifest write failed (non-fatal):', err && err.message ? err.message : err);
        }
        el.click();
        log('PDF download triggered. Check your Downloads folder.');
        return true;
      }
    }
    return false;
  };

  // Try once immediately in case the menu is already cached/open.
  if (tryFindAndClick()) return;

  const interval = setInterval(() => {
    if (tryFindAndClick()) {
      clearInterval(interval);
      return;
    }
    if (Date.now() - startTs > MAX_WAIT_MS) {
      clearInterval(interval);
      log('🚨 "Save to PDF" menu item not found within 3s.');
      log('   - Did the More menu open at all? (Check the page visually.)');
      log('   - Has LinkedIn renamed the item? Update TARGET_LABELS at top of file.');
      log('   - Visible menu items right now:', Array.from(
        document.querySelectorAll('[role="menuitem"], [role="menu"] button, [role="menu"] a'),
      )
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean));
    }
  }, POLL_MS);

  // ---- INSPECT / DOWNLOAD / CLEAR HELPERS -------------------------------
  // Use these from the DevTools console anytime — they read live from
  // localStorage so any tab sees the latest count.
  window.__liPdfManifestCount = () => {
    const n = loadManifest().length;
    log(`${n} entr${n === 1 ? 'y' : 'ies'} in pdf manifest.`);
    return n;
  };
  window.__liPdfManifestDownloadJson = () => {
    const rows = loadManifest();
    if (!rows.length) { log('manifest is empty.'); return; }
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `li-pdf-manifest-${Date.now()}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`downloaded ${rows.length} entries as ${a.download}`);
  };
  window.__liPdfManifestDownloadCsv = () => {
    const rows = loadManifest();
    if (!rows.length) { log('manifest is empty.'); return; }
    const headers = ['slug', 'name', 'profile_url', 'triggered_at'];
    const esc = (s) => {
      const v = String(s ?? '');
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const lines = [headers.join(',')];
    for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `li-pdf-manifest-${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log(`downloaded ${rows.length} entries as ${a.download}`);
  };
  window.__liPdfManifestClear = () => {
    try { localStorage.removeItem(MANIFEST_KEY); } catch {}
    log('pdf manifest cleared.');
  };
})();
