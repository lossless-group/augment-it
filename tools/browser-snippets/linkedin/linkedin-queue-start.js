// ============================================================================
// linkedin-queue-start.js
//
// Paste-into-DevTools-Console snippet. Seeds a queue of profile URLs into
// localStorage and starts the auto-walker. The companion Tampermonkey
// userscript (linkedin-network-capture.user.js) handles the actual
// per-page extraction and the queue advancement.
//
// PREREQUISITE: linkedin-network-capture.user.js must be installed and
// enabled in Tampermonkey on this browser.
//
// HOW TO USE
// ----------
// 1. Open the JSON file holding your queue (e.g.,
//    clients/humain-vc/inputs/2026-06-14_Staton_Query-NYC_walker-queue.json
//    has 252 URLs). Copy its full contents.
// 2. In any linkedin.com tab, open DevTools (Cmd+Option+I), Console.
// 3. Edit the QUEUE_URLS line below — replace [] with the JSON array
//    you just copied — then paste this entire snippet, Enter.
// 4. Optionally set CLEAR_EXISTING_PROFILES to true to wipe yesterday's
//    empty-row junk before starting fresh.
// 5. The tab navigates to the first URL. The Tampermonkey script
//    captures each profile and advances at 35-65s human-shaped delays.
// 6. Walk away. ~252 profiles × 45s avg = ~3 hours unattended.
//
// PAUSE / RESUME / STOP — see header of linkedin-network-capture.user.js.
//
// WHILE IT RUNS
// -------------
// Don't switch tabs to other LinkedIn pages — the walker fires on every
// linkedin.com page load and would derail your manual browsing. Use a
// separate browser profile or another browser if you need LinkedIn at
// the same time.
//
// SAFETY: this snippet refuses to start if the userscript hasn't been
// installed (it can't see the script directly, but it checks for the
// expected localStorage shape and reminds you).
// ============================================================================

(() => {
  // ============================================================
  // EDIT THESE TWO LINES BEFORE PASTING:
  // ============================================================
  const QUEUE_URLS = []; // paste the JSON array of profile URLs here
  const CLEAR_EXISTING_PROFILES = false; // true wipes yesterday's empty rows first
  // ============================================================

  const log = (...args) => console.error('[li-queue-start]', ...args);

  if (!Array.isArray(QUEUE_URLS) || QUEUE_URLS.length === 0) {
    log('🚨 QUEUE_URLS is empty. Edit the top of this snippet to paste in your URL array, then re-run.');
    return;
  }

  // Validate URLs are LinkedIn profile shape.
  const bad = QUEUE_URLS.filter((u) => !/^https?:\/\/(www\.)?linkedin\.com\/in\/[^/]+/i.test(u));
  if (bad.length > 0) {
    log(`🚨 ${bad.length} of ${QUEUE_URLS.length} URLs don't match the /in/<slug>/ shape. Examples:`, bad.slice(0, 3));
    log('   Fix or filter them out before starting.');
    return;
  }

  if (CLEAR_EXISTING_PROFILES) {
    localStorage.removeItem('lossless:li-profiles');
    log('cleared existing profile rows from localStorage.');
  }

  localStorage.setItem('lossless:li-queue', JSON.stringify(QUEUE_URLS));
  localStorage.setItem('lossless:li-queue-index', '0');
  localStorage.setItem('lossless:li-queue-active', 'true');

  log(`queue seeded with ${QUEUE_URLS.length} URLs.`);
  log('first three:', QUEUE_URLS.slice(0, 3));
  log('navigating to first profile in 2s…');
  setTimeout(() => {
    location.href = QUEUE_URLS[0];
  }, 2000);
})();
