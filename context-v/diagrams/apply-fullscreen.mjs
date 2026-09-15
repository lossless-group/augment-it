#!/usr/bin/env node
/**
 * Post-delivery patch: add an expand-to-full-screen control to an Archify page.
 *
 * Archify's `deliver` regenerates the HTML from the spec, so this is NOT a
 * hand edit — re-run it after every delivery:
 *
 *   node apply-fullscreen.mjs sovereign-tier.html federal-design-system.html
 *
 * Idempotent: a file already carrying the marker is skipped.
 *
 * It fullscreens `.diagram-container` (not the document), because every
 * interactive control — the guide dialog, PATH/MAP/LENS, the zoom rail, the
 * live-region status nodes — is already a child of that element, so they all
 * come along. The :fullscreen sizing mirrors the rules Archify already ships
 * for html[data-present="true"], so the SVG fills the screen exactly the way
 * presentation mode fills the panel.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const MARKER = 'archify-fullscreen-patch';

const STYLE = `
<style id="${MARKER}-style">
  .archify-fs-btn {
    position: absolute; top: .65rem; right: .65rem; z-index: 40;
    display: inline-flex; align-items: center; gap: .4rem;
    padding: .34rem .62rem;
    font: inherit; font-size: .72rem; line-height: 1; letter-spacing: .02em;
    color: var(--text); background: var(--panel);
    border: 1px solid var(--panel-border); border-radius: .5rem;
    cursor: pointer; opacity: .5;
    transition: opacity .15s ease;
  }
  .archify-fs-btn:hover, .archify-fs-btn:focus-visible { opacity: 1; }
  /* The viewer ships a global \`svg { width:100%; min-width:min(900px,100%) }\`
     for the diagram itself. min-width is not overridden by setting width, so
     these icons inflate to the button's full content box without the reset. */
  .archify-fs-btn svg {
    flex: 0 0 auto;
    width: 13px; height: 13px; min-width: 0; max-width: 13px;
    fill: none; stroke: currentColor;
    stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round;
  }
  .archify-fs-btn svg[hidden] { display: none; }
  .archify-fs-label { white-space: nowrap; }
  @media (max-width: 560px) { .archify-fs-label { display: none; } }
  @media print { .archify-fs-btn { display: none; } }

  /* The page chrome is suppressed while the panel is fullscreened. --panel is
     rgba(15,23,42,.5) — half transparent — so a panel painted with it alone
     lets the header, the guided-view rail and the card rail show straight
     through the fullscreen view. Paint the panel tint over the opaque page
     ground instead, and fade the chrome as a second line of defence. */
  html[data-archify-fullscreen="true"] > body > .toolbar,
  html[data-archify-fullscreen="true"] .container > :not(.diagram-container) {
    opacity: 0;
    pointer-events: none;
  }

  /* Separate rules on purpose: a prefixed selector in a group invalidates
     the whole group in engines that do not know it. */
  .diagram-container:fullscreen {
    width: 100vw; height: 100vh; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    padding: 1.25rem; border: 0; border-radius: 0;
    background: linear-gradient(var(--panel), var(--panel)), var(--bg);
  }
  .diagram-container:fullscreen > svg {
    flex: 1 1 auto; width: 100%; height: 100%; min-width: 0; min-height: 0;
  }
  .diagram-container:fullscreen::backdrop { background: var(--bg); }
  .diagram-container:-webkit-full-screen {
    width: 100vw; height: 100vh; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    padding: 1.25rem; border: 0; border-radius: 0;
    background: linear-gradient(var(--panel), var(--panel)), var(--bg);
  }
  .diagram-container:-webkit-full-screen > svg {
    flex: 1 1 auto; width: 100%; height: 100%; min-width: 0; min-height: 0;
  }
  .diagram-container:-webkit-full-screen::backdrop { background: var(--bg); }
</style>`;

const BUTTON = `
<button type="button" class="archify-fs-btn no-print" id="archify-fs-btn"
        aria-pressed="false" title="Expand diagram to full screen"
        aria-label="Expand diagram to full screen">
  <svg viewBox="0 0 16 16" aria-hidden="true" data-fs-icon="expand"><path d="M6 1.5H1.5V6M10 14.5H14.5V10M14.5 6V1.5H10M1.5 10V14.5H6"/></svg>
  <svg viewBox="0 0 16 16" aria-hidden="true" data-fs-icon="collapse" hidden><path d="M1.5 6H6V1.5M14.5 10H10V14.5M10 1.5V6H14.5M6 14.5V10H1.5"/></svg>
  <span class="archify-fs-label">Full screen</span>
</button>`;

const SCRIPT = `
<script id="${MARKER}-script">
(function () {
  var panel = document.querySelector('.diagram-container');
  var btn = document.getElementById('archify-fs-btn');
  if (!panel || !btn) return;

  var expand = btn.querySelector('[data-fs-icon="expand"]');
  var collapse = btn.querySelector('[data-fs-icon="collapse"]');
  var label = btn.querySelector('.archify-fs-label');

  function current() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function active() { return current() === panel; }

  function enter() {
    var fn = panel.requestFullscreen || panel.webkitRequestFullscreen;
    if (!fn) return;
    // Rejects when the gesture is stale or policy forbids it; nothing to do
    // but leave the page as it was.
    try { Promise.resolve(fn.call(panel)).catch(function () {}); } catch (e) {}
  }
  function leave() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (!fn) return;
    try { Promise.resolve(fn.call(document)).catch(function () {}); } catch (e) {}
  }

  function sync() {
    var on = active();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var text = on ? 'Exit full screen' : 'Expand diagram to full screen';
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
    expand.hidden = on;
    collapse.hidden = !on;
    label.textContent = on ? 'Exit' : 'Full screen';
    // Drives the chrome-suppression rules above; removed again on exit so the
    // page returns to exactly how it was.
    if (on) document.documentElement.setAttribute('data-archify-fullscreen', 'true');
    else document.documentElement.removeAttribute('data-archify-fullscreen');
    // The viewer sizes pan/zoom from measured client box; nudge it to re-read.
    window.dispatchEvent(new Event('resize'));
  }

  btn.addEventListener('click', function () { active() ? leave() : enter(); });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);

  // Proves to a headless check that this ran.
  panel.setAttribute('data-fullscreen-ready', 'true');
})();
<\/script>`;

let changed = 0, skipped = 0;
for (const file of process.argv.slice(2)) {
  let html = readFileSync(file, 'utf8');
  if (html.includes(MARKER)) { console.log(`skip   ${file} (already patched)`); skipped++; continue; }

  const head = html.lastIndexOf('</head>');
  if (head === -1) throw new Error(`${file}: no </head>`);
  html = html.slice(0, head) + STYLE + '\n' + html.slice(head);

  // Insert AFTER the diagram's </svg>, never as the container's first child:
  // the viewer measures its stage from the container's first element, so a
  // button in front of the SVG makes the nav dock overlap the stage.
  const open = html.indexOf('<div class="diagram-container"');
  if (open === -1) throw new Error(`${file}: no .diagram-container`);
  const svgEnd = html.indexOf('</svg>', open);
  if (svgEnd === -1) throw new Error(`${file}: no </svg> inside .diagram-container`);
  const at = svgEnd + '</svg>'.length;
  html = html.slice(0, at) + BUTTON + html.slice(at);

  const body = html.lastIndexOf('</body>');
  if (body === -1) throw new Error(`${file}: no </body>`);
  html = html.slice(0, body) + SCRIPT + '\n' + html.slice(body);

  writeFileSync(file, html);
  console.log(`patch  ${file}`);
  changed++;
}
console.log(`\n${changed} patched, ${skipped} skipped`);
