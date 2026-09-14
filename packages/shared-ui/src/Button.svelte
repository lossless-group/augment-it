<script lang="ts">
  /**
   * Button — the federal control primitive, and the first PROMOTE in the organ
   * registry. Implements the contract in
   * context-v/specs/Component-API-Contract-And-The-Control-Scale.md.
   *
   * API — two enums, not ten props:
   *   variant  primary | secondary | outline | ghost | destructive | link   (default secondary)
   *   size     sm | md | lg | icon                                          (default md)
   *
   * OVERRIDE LADDER. Each rung is more visible than the last; none is blocked.
   *   1  variant + size                  the sanctioned API, covers the majority
   *   2  radius="lg"                     a TOKEN NAME, never a value
   *   3  radius="lg/60"                  calc(var(--radius-lg) * 0.6)
   *   4  style=… + data-deviation=…      legal, declared, and surfaced in the
   *                                      member's catalog under Deviations (F9)
   *
   * RUNG 4 IS style=, NOT class=. Corrected 2026-09-13 after the first real
   * measurement of it. Svelte compiles this component's rules to
   * `.ui-btn.svelte-<hash>` — specificity (0,2,0). A member's rung-4 class is
   * (0,1,0) and LOSES every property this component sets, while rendering
   * perfectly and looking like a working override.
   *
   * Dropping our own selector to `:where(.ui-btn)` does not fix it: Svelte still
   * appends the hash, giving (0,1,0), which TIES with the member's class — and a
   * tie resolves by stylesheet order, which under Module Federation means chunk
   * load order across independently deployed remotes. That is not decidable, and
   * a nondeterministic override is worse than one that reliably loses.
   *
   * An inline style beats every class rule regardless of load order. It is still
   * declared, still requires data-deviation, still appears in the catalog, and is
   * if anything uglier at the call site — which is correct for the last rung.
   *
   * `class=` still passes through, and is still a declared deviation, but it can
   * only win for properties this component does NOT set. Reach for it for a
   * member hook; reach for `style=` to actually override.
   *
   * Rung 3 reads the Tailwind `/` convention ("this token, at N percent") for
   * dimension. It is deliberately COUNTABLE: `radius="lg/60"` appearing in six
   * members is a measurable argument for a missing scale step, where a raw 11px
   * would be invisible. The escape hatch is also the detection mechanism.
   *
   * A11Y CONTRACT (F7, and DESIGN.md's primitive floor):
   *   · renders a real <button>, type="button" by default — never a div
   *   · real `disabled`, never a class, so it leaves the tab order
   *   · disabled SHIFTS COLOUR TOKENS, not only opacity (the floor is explicit
   *     about this: opacity alone is not a state change)
   *   · hover is guarded `:hover:not(:disabled)`
   *   · every size is >= --control-h-sm (24px, WCAG 2.2 2.5.8)
   *   · size="icon" REQUIRES aria-label / aria-labelledby — the sweep found
   *     unlabelled icon-only buttons in four members
   *   · :focus-visible is declared here, so the ring is correct even in a member
   *     that overrides the federal rule
   *
   * ICONS ARE SVG, NEVER GLYPHS. The product carries 35 bare '✓' characters and
   * no icon system. A glyph is a font-dependent, unstyleable, screen-reader-
   * hostile image. Pass an <svg> in the children snippet; it is sized from
   * --icon-* automatically.
   *
   * TOKENS ONLY — no literal colour, no literal dimension, anywhere below.
   */
  import type { Snippet } from 'svelte';

  type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
  type Size = 'sm' | 'md' | 'lg' | 'icon';

  type Props = {
    variant?: Variant;
    size?: Size;
    /** Rung 2/3 — a radius TOKEN NAME, optionally with a /N percentage. */
    radius?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    /**
     * Receives the rendered <button> node.
     *
     * `{...rest}` cannot carry a node, so without this a member that opens a
     * popup from a shared Button has no way to pass it as the popup's `trigger`
     * — and two members independently wrapped the Button in a span and
     * `querySelector('button')`-ed it back out. Two copies of the same seven
     * lines on the first two call sites is the threshold this codebase uses.
     */
    ref?: (el: HTMLButtonElement) => void;
    /** Rung 4 — requires a data-deviation reason alongside it. */
    class?: string;
    children?: Snippet;
    [key: string]: unknown;
  };

  let {
    variant = 'secondary',
    size = 'md',
    radius,
    type: btnType = 'button',
    disabled = false,
    ref,
    class: className,
    children,
    ...rest
  }: Props = $props();

  /* The shipped radius scale — DESIGN.md's Shapes table. Five values; there is
     deliberately no `xs`, and the circle token is `round`, not `full`. Kept as a
     list so an unknown name fails loudly instead of emitting a var() that
     silently resolves to nothing — which is precisely the phantom-token failure
     this whole effort exists to close. */
  const RADIUS_STEPS = ['sm', 'md', 'lg', 'pill', 'round'];

  const DEV = import.meta.env?.DEV === true;

  function complain(message: string): void {
    if (DEV) console.error(`[@augment-it/shared-ui] <Button>: ${message}`);
  }

  /** Rungs 2 and 3. Returns a CSS value, or null to fall through to the default. */
  function resolveRadius(spec: string | undefined): string | null {
    if (!spec) return null;
    const [name, pct] = spec.split('/');
    if (!RADIUS_STEPS.includes(name)) {
      complain(`radius="${spec}" — unknown step "${name}". Valid: ${RADIUS_STEPS.join(', ')}.`);
      return null;
    }
    const token = `var(--radius-${name})`;
    if (pct === undefined) return token;
    const n = Number(pct);
    if (!Number.isFinite(n) || n <= 0) {
      complain(`radius="${spec}" — "${pct}" is not a positive percentage.`);
      return null;
    }
    return `calc(${token} * ${n / 100})`;
  }

  const radiusValue = $derived(resolveRadius(radius));
  const styleAttr = $derived(radiusValue ? `--ui-btn-radius: ${radiusValue}` : undefined);

  const nameError = $derived(
    size === 'icon' && !rest['aria-label'] && !rest['aria-labelledby']
      ? 'size="icon" has no accessible name. Add aria-label — an icon-only button is invisible to a screen reader.'
      : null,
  );

  const deviationError = $derived(
    (className || rest.style) && !rest['data-deviation']
      ? 'class="…" is override-ladder rung 4 and requires a data-deviation reason, which surfaces in the member catalog under Deviations (F9).'
      : null,
  );

  $effect(() => {
    if (nameError) complain(nameError);
  });
  $effect(() => {
    if (deviationError) complain(deviationError);
  });
</script>

<button
  {...rest}
  {@attach (node) => ref?.(node as HTMLButtonElement)}
  type={btnType}
  class={className ? `ui-btn ${className}` : 'ui-btn'}
  data-variant={variant}
  data-size={size}
  data-a11y-error={nameError ? '' : undefined}
  {disabled}
  style={styleAttr}
>
  {@render children?.()}
</button>

<style>
  /* ONE explicit class, plus data-attributes for the enums.
     · An explicit class, never a bare `button` selector — DESIGN.md's primitive
       floor requires it, because `.req-app button` styling every button in a
       member is the exact bug this component replaces.
     · variant/size ride on data-* rather than modifier CLASSES so the element
       carries one class instead of three. The gallery's F2/F3 containment audit
       reports every unprefixed class inside a specimen as a leak, and a FEDERAL
       component's classes can never carry a member's prefix — so each modifier
       class would be a permanent finding in all nineteen catalogs. */
  .ui-btn {
    /* Local knob, composed over a federal token — never a literal (Tier 4). */
    --ui-btn-radius: var(--radius-md);

    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2xs);
    box-sizing: border-box;
    border: 1px solid transparent;
    border-radius: var(--ui-btn-radius);
    /* A button is --radius-md. Picked by ROLE from DESIGN.md's Shapes table
       ("Buttons, inputs, chips, small cards"), not by eye — picking radius by
       appearance is how chat ended up one scale step low on 11 declarations. */
    font: inherit;
    line-height: 1;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
  }

  /* --- size. Every height is >= --control-h-sm, which IS the WCAG 2.2 floor.
         Horizontal padding comes from the spacing scale: there is no
         --control-px-* family, and a raw padding value does not pass review. */
  .ui-btn[data-size='sm'] {
    height: var(--control-h-sm);
    padding-inline: var(--space-sm);
  }
  .ui-btn[data-size='md'] {
    height: var(--control-h-md);
    padding-inline: var(--space-md);
  }
  .ui-btn[data-size='lg'] {
    height: var(--control-h-lg);
    padding-inline: var(--space-lg);
  }
  /* Square, and sized from the md control height so an icon button lines up
     with the input beside it. 28x28 clears the 24x24 target floor. */
  .ui-btn[data-size='icon'] {
    height: var(--control-h-md);
    width: var(--control-h-md);
    padding: 0;
  }

  /* --- variant. Every filled variant takes its text from the token PAIRED with
         its surface. The canonical spelling is --color-primary /
         --color-primary-foreground and --color-error-bg / --color-error-fg rather than
         shadcn's -foreground suffix; the convention is what matters, and adding
         alias names would be two federal names for one value. This is the rule
         that stops `.pdr-btn-primary { color: #fff }` from ever being written. */
  .ui-btn[data-variant='primary'] {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
  }
  .ui-btn[data-variant='primary']:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }

  .ui-btn[data-variant='secondary'] {
    background: var(--color-surface-raised);
    color: var(--color-text);
    /* --color-border-strong, not --color-border: gate A22 measured the latter at
       1.2-1.5:1, under F7's 3:1 floor for a control boundary. */
    border-color: var(--color-border-strong);
  }
  .ui-btn[data-variant='secondary']:hover:not(:disabled) {
    background: var(--color-bg-elevated);
  }

  .ui-btn[data-variant='outline'] {
    background: transparent;
    color: var(--color-text);
    border-color: var(--color-border-strong);
  }
  .ui-btn[data-variant='outline']:hover:not(:disabled) {
    /* Same reasoning as ghost above. */
    background: color-mix(in srgb, var(--color-text) 10%, transparent);
  }

  .ui-btn[data-variant='ghost'] {
    background: transparent;
    color: var(--color-text);
  }
  .ui-btn[data-variant='ghost']:hover:not(:disabled) {
    /* NOT --color-selected-tint: that token is what chips, selected rows and
       tinted panels are already painted with, so a ghost control hosted on one
       composited to 1.122:1 hover-vs-rest — present, imperceptible. A
       translucent wash of the *text* colour is surface-independent: it lightens
       on a dark host and darkens on a light one, whatever the host chose. */
    background: color-mix(in srgb, var(--color-text) 10%, transparent);
  }

  .ui-btn[data-variant='destructive'] {
    background: var(--color-error-bg);
    color: var(--color-error-fg);
    /* A filled control's boundary is its fill against the surround, and
       --color-error-bg measures 1.02-1.32:1 on every plausible parent — under
       F7's 3:1 floor in BOTH modes. Every contrast gate we run is a *text*
       gate, and the text here is 7.19:1, which is why this shipped unnoticed
       through nineteen migrations. The one control where the edge matters most
       is the one that deletes things. */
    border-color: color-mix(in srgb, var(--color-error-fg) 65%, var(--color-error-bg));
  }
  .ui-btn[data-variant='destructive']:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-error-fg) 16%, var(--color-error-bg));
  }

  .ui-btn[data-variant='link'] {
    background: transparent;
    color: var(--color-link);
    /* Not zero: a short label still has to clear the 24px target width. */
    padding-inline: var(--space-2xs);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .ui-btn[data-variant='link']:hover:not(:disabled) {
    color: var(--color-primary);
  }

  /* --- disabled. LAST, deliberately: `.ui-btn:disabled` and
         `.ui-btn[data-variant='x']` tie at (0,2,0), so source order decides and
         this must come after every variant to win.
         Colour tokens SHIFT here rather than opacity alone — DESIGN.md's
         primitive floor is explicit, and `.req-app button:disabled { opacity:
         0.4 }` is the recipe this replaces. */
  .ui-btn:disabled {
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    border-color: var(--color-border);
    cursor: not-allowed;
  }

  /* --- focus. Declared here so the ring survives a member that overrides the
         federal rule.
         MUST set the SAME PROPERTIES as the federal `*:focus-visible`
         (box-shadow + outline). Setting a DIFFERENT property — an outline where
         the federal rule sets a box-shadow — is how request-reviewer's
         `input:focus` ends up painting two rings in two colours at once. Same
         properties means the cascade picks one value; different properties means
         both paint. */
  .ui-btn:focus-visible {
    box-shadow: var(--focus-ring);
    outline: none;
  }

  /* --- icons. :global because the <svg> arrives through the children snippet
         and is owned by the caller, so no scoping class is applied to it. */
  .ui-btn :global(svg) {
    width: var(--icon-md);
    height: var(--icon-md);
    flex: 0 0 auto;
  }
  .ui-btn[data-size='sm'] :global(svg) {
    width: var(--icon-sm);
    height: var(--icon-sm);
  }
  .ui-btn[data-size='lg'] :global(svg) {
    width: var(--icon-lg);
    height: var(--icon-lg);
  }
</style>
