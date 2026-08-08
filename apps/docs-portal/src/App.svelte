<script lang="ts">
  // Phase 2a — the P0 swatch page.
  // Spec: context-v/specs/Design-System-Portal.md §3
  //
  // The point of this page is that it is the FIRST surface on which the token
  // system has ever been looked at. Phases 0 and 1 shipped 35 tokens verified
  // entirely by static analysis and contrast arithmetic; not one had been
  // rendered in a browser. Everything here is deliberately shallow so that what
  // you are judging is the tokens, not the page.
  //
  // Two rules keep it honest:
  //
  //  1. It NEVER paints from the manifest's recorded values. It sets data-mode
  //     and lets the browser resolve `var(--token)` through the real cascade.
  //     A page that painted from JSON would prove the JSON is well-formed and
  //     nothing about the stylesheet.
  //  2. Contrast is measured from getComputedStyle AFTER paint, not computed
  //     from the theme source. Same reason.
  import { onMount } from 'svelte';
  import { MODES, getMode, setMode, onModeChange, type Mode } from '@augment-it/theme/mode-switcher';
  import manifest from '../../../design-manifest.json';

  const SURFACES: string[] = manifest.surfaces;
  const COLOR_TOKENS: string[] = manifest.groups.color;
  const EFFECT_TOKENS: string[] = manifest.groups.effect;
  const TIER1 = Object.entries(manifest.tier1 as Record<string, string>)
    .filter(([n]) => n.startsWith('--color__'));

  let mode = $state<Mode>('dark');
  let ratios = $state<Record<string, number>>({});
  let probe: HTMLDivElement;

  function luminance(rgb: number[]): number {
    const a = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }

  function parseRgb(s: string): number[] | null {
    const m = s.match(/\d+(\.\d+)?/g);
    return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
  }

  /**
   * Measure every (token, surface) pair from the PAINTED cell.
   *
   * Not from the custom-property values: getPropertyValue('--color-text')
   * returns the substituted token value, which in this theme is a hex string
   * (`#e8eaf0`), and a naive rgb parse silently matches the digits inside the
   * hex and returns nonsense. Reading `color` / `backgroundColor` off the cell
   * always yields `rgb(...)`, and — more importantly — it measures what the
   * browser actually rendered rather than what the stylesheet says it should.
   * That distinction is the whole reason this page exists.
   */
  function measure(): void {
    if (!probe) return;
    // theme.css:289 transitions background-color/color/border-color over 75ms
    // on the theme swap. Measuring inside that window reads colours that are
    // still animating — it reported the dark page background as a light grey
    // and every vibrant foreground token as failing, none of which was real.
    // Suppress transitions, force a synchronous style flush, measure the
    // settled values, then restore.
    document.documentElement.classList.add('measuring');
    void document.documentElement.offsetHeight;
    const next: Record<string, number> = {};
    for (const cell of probe.querySelectorAll<HTMLElement>('.swatch[data-token]')) {
      const token = cell.dataset.token;
      const surface = cell.dataset.surface;
      if (!token || !surface) continue;
      const cs = getComputedStyle(cell);
      const fg = parseRgb(cs.color);
      const bg = parseRgb(cs.backgroundColor);
      if (!fg || !bg) continue;
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      next[`${token}|${surface}`] = Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
    }
    const acc: Record<string, number> = {};
    for (const cell of probe.querySelectorAll<HTMLElement>('.accent-cell[data-fill]')) {
      const cs = getComputedStyle(cell);
      const fg = parseRgb(cs.color);
      const bg = parseRgb(cs.backgroundColor);
      if (!fg || !bg) continue;
      const l1 = luminance(fg);
      const l2 = luminance(bg);
      acc[cell.dataset.fill!] = Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
    }
    document.documentElement.classList.remove('measuring');
    ratios = next;
    accentRatios = acc;
  }

  function pick(next: Mode): void {
    // setMode dispatches mode-change, which the onModeChange subscription above
    // turns into the state update + remeasure. One path, so a click and an
    // external change behave identically.
    setMode(next);
  }

  onMount(() => {
    mode = getMode();
    remeasure();
    // The mode can change from outside this component — another tab, or (once
    // the portal is federated) the shell, which owns data-mode for every
    // remote. Without this the toggle keeps showing whatever was last clicked
    // here while the page renders something else entirely.
    return onModeChange((next) => {
      mode = next;
      remeasure();
    });
  });

  /** Two frames: one for the attribute to land, one for the cascade to settle. */
  function remeasure(): void {
    requestAnimationFrame(() => requestAnimationFrame(measure));
  }

  // Only FOREGROUND tokens get a pass/fail grade.
  //
  // The grid is a full cross-product, so most cells are pairings the product
  // never makes — `--color-surface` painted as text on `--color-surface-2` is
  // not a thing. Grading all 150 produced 75 "failures", none of which were
  // real, and a checker that cries wolf is one nobody reads. Structural tokens
  // still show their measured ratio (useful for spotting a token that has
  // collided with a surface), just without a verdict attached.
  // --color-on-accent is deliberately absent: DESIGN.md calls it "mandatory on
  // any accent fill — never assume white", so it belongs ON the accent, never
  // on a surface. Grading it against surfaces reported 15 failures that were
  // purely an artefact of testing it somewhere it is never used. It gets its
  // own accent-fill check below instead.
  const FOREGROUND = /^--color-(text|link|accent|accent-2|accent-warm|ok-text|error-text|warn-text|confidence-)/;
  const isForeground = (token: string) => FOREGROUND.test(token);

  // Structural tokens are meant to be seen AS a surface or a line, not read
  // through. 3:1 is the WCAG 1.4.11 bar for a UI boundary.
  // --color-thread is here on DESIGN.md's own classification: "Connector lines
  // — the chat thread rail. A line, so it tracks --color-border", target 3.
  const BOUNDARY = /^--color-(border|border-strong|focus|thread)/;

  // The one pairing DESIGN.md makes mandatory, tested where it actually occurs.
  const ACCENT_FILLS = ['--color-accent', '--color-accent-2', '--color-accent-warm'];
  let accentRatios = $state<Record<string, number>>({});

  // WCAG AA: 4.5:1 for body text, 3:1 for large text and UI boundaries.
  function grade(token: string, r: number | undefined): string {
    if (r === undefined) return 'unknown';
    if (BOUNDARY.test(token)) return r >= 3 ? 'pass' : 'fail';
    if (!isForeground(token)) return 'ungraded';
    if (r >= 4.5) return 'pass';
    if (r >= 3) return 'large';
    return 'fail';
  }
</script>

<div class="portal" bind:this={probe}>
  <header class="head">
    <div>
      <h1>augment-it design system</h1>
      <p class="sub">
        {COLOR_TOKENS.length} colour tokens × {SURFACES.length} surfaces, resolved by the browser in
        <strong>{mode}</strong> mode. Contrast measured from what actually painted.
      </p>
    </div>
    <nav class="modes" aria-label="Theme mode">
      {#each MODES as m}
        <button class:active={mode === m} onclick={() => pick(m)} aria-pressed={mode === m}>{m}</button>
      {/each}
    </nav>
  </header>

  <section aria-labelledby="swatches-h">
    <h2 id="swatches-h">Semantic tokens on every surface</h2>
    <p class="note">
      Each cell paints <code>color: var(--token)</code> over <code>background: var(--surface)</code>.
      A cell that vanishes is a token that does not resolve on that surface — the P2/P3 failure this
      page exists to catch. The number is the measured contrast ratio.
    </p>

    <div class="grid" style="--cols: {SURFACES.length}">
      <div class="cell head-cell">token</div>
      {#each SURFACES as surface}
        <div class="cell head-cell">{surface.replace('--color-', '')}</div>
      {/each}

      {#each COLOR_TOKENS as token}
        <div class="cell token-name"><code>{token}</code></div>
        {#each SURFACES as surface}
          {@const r = ratios[`${token}|${surface}`]}
          <div
            class="cell swatch"
            data-token={token}
            data-surface={surface}
            style="background: var({surface}); color: var({token});"
          >
            <span class="sample">Aa</span>
            <span class="ratio {grade(token, r)}">{r ?? '—'}</span>
          </div>
        {/each}
      {/each}
    </div>
  </section>

  <section aria-labelledby="accent-h">
    <h2 id="accent-h">Accent fills — <code>--color-on-accent</code></h2>
    <p class="note">
      DESIGN.md makes this pairing mandatory: <code>--color-on-accent</code> on any accent fill,
      never assumed white. Tested where it is actually used rather than against surfaces it never
      touches.
    </p>
    <div class="effects">
      {#each ACCENT_FILLS as fill}
        {@const r = accentRatios[fill]}
        <div class="accent-cell effect-card" data-fill={fill}
             style="background: var({fill}); color: var(--color-on-accent);">
          <code>on-accent / {fill.replace('--color-', '')}</code>
          <span class="ratio {r === undefined ? 'unknown' : r >= 4.5 ? 'pass' : r >= 3 ? 'large' : 'fail'}">{r ?? '—'}</span>
        </div>
      {/each}
    </div>
  </section>

  <section aria-labelledby="effects-h">
    <h2 id="effects-h">Effect tokens</h2>
    <div class="effects">
      {#each EFFECT_TOKENS as token}
        <div class="effect-card" style="box-shadow: var({token});">
          <code>{token}</code>
        </div>
      {/each}
    </div>
  </section>

  <section aria-labelledby="palette-h">
    <h2 id="palette-h">Tier 1 — the palette</h2>
    <p class="note">
      Raw named values. Components never read these; Tier-2 tokens point at them. Shown so a
      renamed or re-pointed step is visible rather than inferred.
    </p>
    <div class="palette">
      {#each TIER1 as [name, value]}
        <div class="chip">
          <div class="chip-color" style="background: {value};"></div>
          <code>{name.replace('--color__', '')}</code>
          <span class="hex">{value}</span>
        </div>
      {/each}
    </div>
  </section>
</div>
