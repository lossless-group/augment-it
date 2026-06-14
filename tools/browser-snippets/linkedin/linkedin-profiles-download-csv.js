// ============================================================================
// linkedin-profiles-download-csv.js
//
// Paste-into-DevTools-Console one-liner. Reads every profile previously
// captured by linkedin-profile-to-row.js from localStorage, dedupes
// defensively by profile_url (last-wins), and downloads as a CSV.
//
// CSV columns:
//   name, profile_url, headline, location, experience_json, captured_at
//
// `experience_json` is the experience array serialized as a JSON string in
// one cell — keeps the row tabular for spreadsheet import while preserving
// the structured data. To get back to an object array in Numbers / Sheets:
// reverse with JSON.parse on the column.
//
// Standalone — does NOT require linkedin-profile-to-row.js to be loaded
// in the current tab. The accumulator lives in localStorage on the
// linkedin.com origin under "lossless:li-profiles".
//
// How to use
// ----------
// 1. Open any LinkedIn tab. DevTools (Cmd+Option+I) → Console.
// 2. If you haven't already, type "allow pasting" + Enter to bypass
//    Chrome's self-XSS paste guard.
// 3. Paste this entire file, Enter. A file
//    `linkedin-profiles-<timestamp>.csv` downloads.
// 4. The log line reports the dedup story:
//    `[download] 47 stored, 47 unique, …` — no dups, healthy capture
//    `[download] 50 stored, 47 unique, …` — 3 duplicates collapsed
// ============================================================================

(() => {
  const all = JSON.parse(localStorage.getItem('lossless:li-profiles') || '[]');
  const byUrl = new Map();
  for (const r of all) byUrl.set(r.profile_url, r); // last-wins
  const rows = Array.from(byUrl.values());
  if (rows.length === 0) {
    console.warn('[download] nothing in localStorage["lossless:li-profiles"] to download.');
    return;
  }
  const headers = ['name', 'profile_url', 'headline', 'location', 'experience_json', 'captured_at'];
  const esc = (s) => {
    const v = String(s ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      esc(r.name),
      esc(r.profile_url),
      esc(r.headline),
      esc(r.location),
      esc(JSON.stringify(r.experience ?? [])),
      esc(r.captured_at),
    ].join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `linkedin-profiles-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  console.error(`[download] ${all.length} stored, ${rows.length} unique, downloaded as ${a.download}`);
})();
