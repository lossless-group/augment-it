<script lang="ts">
  /**
   * Chip — the federal LABEL primitive, and the second PROMOTE in the organ
   * registry. Implements the contract in
   * context-v/specs/Component-API-Contract-And-The-Control-Scale.md.
   *
   * WHAT A CHIP IS, AND WHAT IT IS NOT. This is the distinction that decides
   * every call site, so read it before mapping anything:
   *
   *   A Chip is a SMALL LABELLED TOKEN THAT IS NOT A CONTROL.
   *   A tag, a badge, a pill, a status label, a count, a category.
   *   It renders a <span>. It has no onclick, no tabindex, no role.
   *
   *   If the thing is CLICKABLE, it is a Button — `variant="secondary"` plus
   *   `aria-pressed` for a filter toggle. Nineteen members proved that mapping
   *   in the Button rollout; do not undo it by wrapping a Button in a Chip or
   *   by giving a Chip an onclick.
   *
   *   If the thing is a label WITH a dismiss affordance, it is a Chip that
   *   carries `dismissible` — which renders a real nested <button>. See the
   *   NESTING rule below; it fixes a live HTML validity bug.
   *
   * API — two enums and two booleans:
   *   tone  neutral | accent | ok | warn | error | info   (default neutral)
   *   size  sm | md                                       (default md)
   *   dismissible + onDismiss                             (renders a real button)
   *   dot                                                 (leading status dot)
   *
   * TONE IS SEMANTIC, NOT DECORATIVE. Pick by what the label MEANS, not by what
   * colour the member happened to draw. A tag with no state is `neutral` even
   * if it was green. The sweep found eleven renderings of one status value
   * precisely because tone was being chosen by eye.
   *
   * NESTING — the bug this component exists to stop. `sort-filter-lens` shipped a
   *   <span role="button" tabindex="0"> nested INSIDE a <button>
   * which is invalid HTML: interactive content may not contain interactive
   * content.
   *
   * CORRECTED 2026-09-13, measured at the call site: an earlier version of this
   * comment claimed the outer control's accessible name "absorbs the glyph". It
   * does NOT — that button carries an explicit aria-label, so its name was always
   * correct. The real defects were HTML validity, an inner control whose
   * accessible name was literally "x", and a target measuring 14x14 — 196 square
   * pixels against a 576 square pixel floor, THIRTY-FOUR PERCENT of WCAG 2.2
   * SC 2.5.8. Do not go looking for a name defect on the outer control.
   *
   * A Chip is a <span>, so its dismiss <button> is legal, focusable, and
   * separately named. `dismissible` REQUIRES `dismissLabel`.
   *
   * A11Y CONTRACT (F7, and DESIGN.md's primitive floor):
   *   · renders a <span> — never a div, never a button, never role="button"
   *   · the dismiss control is a real <button type="button"> with its own name
   *   · dismiss target is >= 24px (WCAG 2.2 2.5.8) at BOTH sizes — this is why
   *     a dismissible sm Chip is taller than a plain sm Chip, deliberately
   *   · `dot` is aria-hidden; the tone must ALSO be carried by the text, never
   *     by colour alone (WCAG 1.4.1)
   *   · every tone clears 4.5:1 for its text on its own background, in all
   *     three modes
   *
   * ICONS ARE SVG, NEVER GLYPHS — same rule as Button. The dismiss affordance
   * below is an inline <svg>, not a '×' character.
   *
   * TOKENS ONLY — no literal colour, no literal dimension, anywhere below.
   */
  import type { Snippet } from 'svelte';

  type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'error' | 'info';
  type Size = 'sm' | 'md';

  type Props = {
    tone?: Tone;
    size?: Size;
    /** Renders a real nested <button>. Requires dismissLabel. */
    dismissible?: boolean;
    dismissLabel?: string;
    onDismiss?: () => void;
    /** Leading status dot. Decorative — the text must carry the meaning too. */
    dot?: boolean;
    /**
     * Rest the dismiss control invisible, revealing it on hover OR focus-within.
     * For members with a reveal discipline — see
     * context-v/specs/Entity-Card-Edit-And-Remove-Affordances.md D5.
     * OFF by default, deliberately: a hover-only affordance does not exist on a
     * touch device, so always-visible is the safer default and reveal is the
     * opt-in. The reveal is :hover OR :focus-within, never :hover alone, so the
     * control stays reachable by keyboard.
     */
    revealOnHover?: boolean;
    /** Rung 2/3 — a radius TOKEN NAME, optionally with a /N percentage. */
    radius?: string;
    /** Rung 4 — requires a data-deviation reason alongside it. */
    class?: string;
    /**
     * Rung 4, the one that actually overrides. See Button's header: a member
     * class is (0,1,0) and loses to this component's (0,2,0) scoped rules, and
     * `:where()` only converts the loss into a load-order-dependent tie. An
     * inline style wins deterministically. Requires `data-deviation`.
     */
    style?: string;
    children?: Snippet;
    [key: string]: unknown;
  };

  let {
    tone = 'neutral',
    size = 'md',
    dismissible = false,
    dismissLabel,
    onDismiss,
    dot = false,
    revealOnHover = false,
    radius,
    class: klass = '',
    style: styleProp,
    children,
    ...rest
  }: Props = $props();

  const TONES = ['neutral', 'accent', 'ok', 'warn', 'error', 'info'];
  const SIZES = ['sm', 'md'];

  // Fail loudly and fall back, exactly as Button does — a typo'd enum should be
  // visible in the console, not silently rendered as a default.
  const safeTone = $derived.by(() => {
    if (TONES.includes(tone)) return tone;
    console.error(`[@augment-it/shared-ui] <Chip> unknown tone="${tone}". Falling back to "neutral". Valid: ${TONES.join(' | ')}`);
    return 'neutral';
  });
  const safeSize = $derived.by(() => {
    if (SIZES.includes(size)) return size;
    console.error(`[@augment-it/shared-ui] <Chip> unknown size="${size}". Falling back to "md". Valid: ${SIZES.join(' | ')}`);
    return 'md';
  });

  // A dismissible chip with no accessible name for its button is an unreachable
  // control. Same enforcement Button applies to size="icon".
  const a11yError = $derived(
    dismissible && !dismissLabel
      ? 'dismissible requires dismissLabel — the nested button would have no accessible name'
      : undefined,
  );
  $effect(() => {
    if (a11yError) console.error(`[@augment-it/shared-ui] <Chip> ${a11yError}`);
  });

  // Rung 2/3 — a token NAME, optionally "name/N" meaning N percent of it.
  const radiusStyle = $derived.by(() => {
    if (!radius) return undefined;
    const [name, pct] = radius.split('/');
    const token = `var(--radius-${name})`;
    return pct ? `border-radius: calc(${token} * ${Number(pct) / 100});` : `border-radius: ${token};`;
  });
</script>

<span
  class="ui-chip {klass}"
  data-tone={safeTone}
  data-size={safeSize}
  data-dismissible={dismissible || undefined}
  data-reveal={revealOnHover || undefined}
  data-a11y-error={a11yError}
  {...rest}
  style={[radiusStyle, styleProp].filter(Boolean).join(' ') || undefined}
>
  {#if dot}
    <span class="ui-chip__dot" aria-hidden="true"></span>
  {/if}
  <span class="ui-chip__label">{@render children?.()}</span>
  {#if dismissible}
    <button
      type="button"
      class="ui-chip__dismiss"
      aria-label={dismissLabel}
      onclick={onDismiss}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" fill="none" />
      </svg>
    </button>
  {/if}
</span>

<style>
  .ui-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    font-family: var(--font-sans);
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    background: var(--color-surface-2);
    color: var(--color-text);
    /* A chip is not a control, so it does not sit on the control scale. It sizes
       from its own padding — EXCEPT when dismissible, below, where the nested
       button has to clear the 24px target floor. */
  }

  .ui-chip[data-size='sm'] { font-size: var(--text-label); padding: var(--space-3xs) var(--space-sm); }
  .ui-chip[data-size='md'] { font-size: var(--text-meta); padding: var(--space-2xs) var(--space-md); }

  /* WCAG 2.2 2.5.8. A dismissible chip is deliberately taller than a plain one
     at the same size: the nested button must be >= 24px, and a chip that
     shrink-wrapped it would ship a target failure at every call site. The
     horizontal padding drops on the dismiss side so the button owns that space
     instead of adding to it. */
  .ui-chip[data-dismissible] { padding-inline-end: var(--space-3xs); }
  .ui-chip[data-dismissible][data-size='sm'] { padding-block: var(--space-3xs); }
  .ui-chip[data-dismissible][data-size='md'] { padding-block: var(--space-3xs); }

  .ui-chip__label { display: inline-block; }

  .ui-chip__dot {
    inline-size: var(--space-xs);
    block-size: var(--space-xs);
    border-radius: var(--radius-round);
    background: currentColor;
    flex: 0 0 auto;
  }

  /* Tones. Every one is a token pair — background, foreground, boundary — and
     every one is declared for all three modes by packages/theme. */
  .ui-chip[data-tone='neutral'] {
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    border-color: var(--color-border-strong);
  }
  .ui-chip[data-tone='accent'] {
    background: var(--color-accent-bg);
    /* --color-accent-fg, NOT --color-primary. The accent ground is an 8-9% wash
       of primary over the page, and in LIGHT mode primary on that ground measures
       4.42:1 — under the 4.5 floor this component's header promises. Two
       independent migrations measured it before anyone read the header. */
    color: var(--color-accent-fg);
    border-color: var(--color-accent-fg);
  }
  .ui-chip[data-tone='ok'] {
    background: var(--color-ok-bg);
    color: var(--color-ok-fg);
    border-color: var(--color-ok-fg);
  }
  .ui-chip[data-tone='warn'] {
    background: var(--color-warn-bg);
    color: var(--color-warn-fg);
    border-color: var(--color-warn-fg);
  }
  .ui-chip[data-tone='error'] {
    background: var(--color-error-bg);
    color: var(--color-error-fg);
    border-color: var(--color-error-fg);
  }
  .ui-chip[data-tone='info'] {
    background: var(--color-info-bg);
    color: var(--color-info-fg);
    border-color: var(--color-info-fg);
  }

  /* The dismiss control. A real button, its own accessible name, its own focus
     ring, and >= 24px in both directions. */
  .ui-chip__dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* --control-h-md, not -sm. At -sm this sat EXACTLY on the 24px WCAG 2.2
       SC 2.5.8 floor, where the <Button size="icon"> it replaces sat 4px clear —
       so the first dismissible adoption measured a target REDUCTION, 28 -> 24.
       A dismiss is a real control and gets the real control size. */
    inline-size: var(--control-h-md);
    block-size: var(--control-h-md);
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: var(--radius-round);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
  }
  /* D5 reveal. :focus-within as well as :hover, so a keyboard user can still
     reach it, and the control keeps its box either way — opacity, not display,
     so revealing it never reflows the row. */
  .ui-chip[data-reveal] .ui-chip__dismiss {
    opacity: 0;
    transition: opacity 120ms ease;
  }
  .ui-chip[data-reveal]:hover .ui-chip__dismiss,
  .ui-chip[data-reveal]:focus-within .ui-chip__dismiss {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .ui-chip[data-reveal] .ui-chip__dismiss { transition: none; }
  }
  /* A coarse pointer has no hover, so a revealed control would be unreachable.
     Always show it there — this is why reveal is opt-in rather than default. */
  @media (hover: none) {
    .ui-chip[data-reveal] .ui-chip__dismiss { opacity: 1; }
  }

  .ui-chip__dismiss:hover {
    /* Surface-independent, for the same reason Button's ghost hover is: a chip
       may itself be painted with any tone's background. */
    background: color-mix(in srgb, var(--color-text) 22%, transparent);
    /* 14% was surface-independent and therefore CORRECT, and measured
       1.32-1.47:1 against the chip's own ground — correct is not the same as
       perceptible. 22% is the smallest step that reads as a state change on
       every tone. */
  }
  .ui-chip__dismiss:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
  }
  .ui-chip__dismiss svg {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  .ui-chip[data-a11y-error] {
    outline: var(--space-3xs) dashed var(--color-error-fg);
  }
</style>
