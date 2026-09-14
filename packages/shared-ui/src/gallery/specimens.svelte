<script module lang="ts">
  // The federal primitives, rendered.
  //
  // Every snippet below imports the REAL component from this package — the same
  // module every one of the nineteen members imports. There is no copy, no
  // re-implementation and no screenshot. If Button gains a seventh variant, the
  // specimen grows a seventh cell; if it loses one, the page breaks. That is the
  // property that makes this a library rather than a document about a library.
  //
  // THIS FILE HAS NO app.css, AND THAT IS THE POINT. Every member's gallery
  // mount imports `../app.css`, because a member's components are styled by a
  // member stylesheet under a member root class (contract F3), and a specimen
  // rendered without that ancestor is unstyled. The federal primitives are
  // styled by their OWN scoped style blocks and read the federal token
  // vocabulary directly — so they render correctly under any root class, in any
  // member, or under none at all. `rootClass: ''` in the catalog is that fact
  // written down, not an omission.
  //
  // (That sentence deliberately does not spell the tag out. svelte-preprocess's
  // globalStyle transformer scans the RAW FILE for an opening style tag rather
  // than the parsed one, so the literal characters appearing inside a comment
  // make it hand everything after them to postcss as CSS. The failure is
  // `CssSyntaxError: Unknown word` pointing at line 1 of a file whose line 1 is
  // a script tag — twenty minutes of looking in the wrong place. Raised.)
  //
  // THE SCAFFOLDING IS INLINE STYLES, ON PURPOSE. Rows, captions and stacks here
  // are `style="…"` attributes built from federal tokens rather than classes,
  // for two reasons. First, a class invented for this page would be a class that
  // ships nowhere and the containment audit would read it as a leak, so every
  // catalog adopting the federal library would have to exempt it. Second, `ui-*`
  // is now a RESERVED federal namespace (packages/gallery/src/audit.ts), and
  // minting `ui-specimen-row` here would put a name in that namespace that no
  // component emits. The one exception is `demo-rung-4`, which has to be a class
  // because rung 4 of the override ladder IS the `class=` prop — see below.
  //
  // Icons are SVG, never glyphs — the rule the components themselves state. The
  // one place a character appears below is `⌘S`, which is a keyboard shortcut
  // rendered as text, not an icon doing an icon's job.

  import Button from '../Button.svelte';
  import Chip from '../Chip.svelte';

  /* The enums, hoisted to module scope. Two reasons, one of them a compiler
     constraint: `{#each [...] as const as v}` is unparseable, because Svelte
     splits the each expression on ` as ` and hands the parser a fragment. */
  const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
  const TEXT_SIZES = ['sm', 'md', 'lg'] as const;
  const TONES = ['neutral', 'accent', 'ok', 'warn', 'error', 'info'] as const;
  const CHIP_SIZES = ['sm', 'md'] as const;

  /* One icon, drawn once. A plus sign at 16x16 on the same grid every federal
     icon uses; Button sizes it from --icon-* per size step. */
  const PLUS_D = 'M8 3.5v9M3.5 8h9';

  /* --- scaffolding, tokens only ----------------------------------------- */
  const STACK = 'display:flex; flex-direction:column; gap:var(--space-xl); align-items:flex-start;';
  const STACK_TIGHT = 'display:flex; flex-direction:column; gap:var(--space-md); align-items:flex-start;';
  const ROW = 'display:flex; flex-wrap:wrap; gap:var(--space-md); align-items:center;';
  const ROW_WIDE = 'display:flex; flex-wrap:wrap; gap:var(--space-lg); align-items:center;';
  const CAPTION =
    'font-family:var(--font-mono); font-size:var(--text-label); color:var(--color-text-muted); line-height:1.5;';
  const CAPTION_STRONG =
    'font-family:var(--font-mono); font-size:var(--text-label); color:var(--color-text); line-height:1.5;';
  const LABEL_COL =
    'font-family:var(--font-mono); font-size:var(--text-micro); color:var(--color-text-muted); text-transform:uppercase; min-inline-size:11ch;';
  const VERDICT =
    'font-family:var(--font-mono); font-size:var(--text-micro); color:var(--color-accent); text-transform:uppercase; min-inline-size:12ch;';
  const NOT_A =
    'font-family:var(--font-mono); font-size:var(--text-micro); color:var(--color-warn-fg); text-transform:uppercase; min-inline-size:12ch;';
  const RULE_CELL =
    'font-family:var(--font-mono); font-size:var(--text-label); color:var(--color-text-muted); line-height:1.5; max-inline-size:52ch;';
  const HAIRLINE = 'inline-size:100%; block-size:1px; background:var(--color-border);';
  const LINK_STYLE =
    'font-family:var(--font-mono); font-size:var(--text-meta); color:var(--color-link); text-decoration:underline; text-underline-offset:2px;';
  /* A count slot inside a control's label. A RING rather than a fill, and that
     is a measurement not a taste: a `color-mix(currentColor 22%, transparent)`
     ground on `primary` composited to 3.68:1 for its own digits — the Audit tab
     caught it on the first run of this page. currentColor at full strength on a
     hairline keeps the digits at the variant's own 5.69:1 and still reads as a
     slot. Exactly the class of defect this library exists to surface, found in
     the library itself. */
  const COUNT_SLOT =
    'font-variant-numeric:tabular-nums; padding-inline:var(--space-2xs); border:1px solid currentColor; border-radius:var(--radius-pill);';
  const SHORTCUT = 'font-variant-numeric:tabular-nums; opacity:0.75;';

  /**
   * The form specimen's only behaviour. Module scope, not instance state:
   * snippets exported from `<script module>` may not close over instance state,
   * and the whole point of the fixture is that a `type="submit"` fires a submit
   * event where the default `type="button"` does not. That difference cannot be
   * shown statically, so it is shown by writing into the form's own <output>.
   */
  function onDemoSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const out = (event.currentTarget as HTMLFormElement).querySelector('output');
    if (out) out.textContent = 'submit event fired';
  }

  export {
    classification,
    buttonVariants,
    buttonMatrix,
    buttonForm,
    buttonIconName,
    chipTones,
    chipDot,
    chipDismiss,
    overrideLadder,
  };
</script>

<!-- =====================================================================
     Which primitive is this?
     The decision tree from Adopt-The-Shared-Chip-In-One-Member, rendered as
     specimens rather than as a diagram. Every row is the real component, so
     "a filter chip is a Button" is something you can look at rather than a
     claim you have to take on trust.
     ================================================================== -->
{#snippet classification(p: Record<string, unknown>)}
  {@const only = String(p.only ?? 'all')}
  <div style={STACK}>
    {#if only === 'all' || only === 'controls'}
      <p style={CAPTION_STRONG}>Is it clickable?</p>

      <div style={ROW_WIDE}>
        <span style={LABEL_COL}>a tag</span>
        <Chip tone="neutral">Work-Based-Learning</Chip>
        <span style={VERDICT}>Chip</span>
        <span style={RULE_CELL}>
          A small labelled token that is not a control. It renders a
          <code>&lt;span&gt;</code> — no onclick, no tabindex, no role.
        </span>
      </div>

      <div style={ROW_WIDE}>
        <span style={LABEL_COL}>a status</span>
        <Chip tone="ok" dot>connected</Chip>
        <span style={VERDICT}>Chip</span>
        <span style={RULE_CELL}>
          Tone is picked by what the label MEANS, never by the colour the member
          happened to draw. The dot is <code>aria-hidden</code>; the word carries
          the meaning.
        </span>
      </div>

      <div style={ROW_WIDE}>
        <span style={LABEL_COL}>a filter you toggle</span>
        <Button variant="secondary" aria-pressed="false">Rural-Access</Button>
        <Button variant="primary" aria-pressed="true">Apprenticeship</Button>
        <span style={VERDICT}>Button</span>
        <span style={RULE_CELL}>
          Chip-shaped and clickable is still a Button —
          <code>variant="secondary"</code> plus <code>aria-pressed</code>.
          Nineteen members already made this mapping. Do not undo it by giving a
          Chip an onclick.
        </span>
      </div>

      <div style={ROW_WIDE}>
        <span style={LABEL_COL}>a tag you can remove</span>
        <Chip tone="neutral" dismissible dismissLabel="Remove tag Credential-Attainment">
          Credential-Attainment
        </Chip>
        <span style={VERDICT}>Chip · dismissible</span>
        <span style={RULE_CELL}>
          A label whose body is inert and whose × acts. The × is a real nested
          <code>&lt;button&gt;</code> with its own name and its own 28px target —
          legal because the Chip around it is a span.
        </span>
      </div>

      <div style={HAIRLINE}></div>
      <p style={CAPTION}>
        The error this tree exists to prevent: <strong>never nest one control
        inside another.</strong> Where both the body and the × act, the answer is
        a <code>&lt;Button&gt;</code> and a sibling
        <code>&lt;Button size="icon"&gt;</code> in a wrapper — not a Button inside
        a Button, and not a Chip with an onclick.
      </p>
    {/if}

    {#if only === 'all' || only === 'neither'}
      {#if only === 'all'}<div style={HAIRLINE}></div>{/if}
      <p style={CAPTION_STRONG}>Four things that are neither, and stay raw</p>

      <div style={ROW_WIDE}>
        <span style={LABEL_COL}>it navigates</span>
        <a href="https://example.org/profile" target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
          example.org/profile
        </a>
        <span style={NOT_A}>missing organ</span>
        <span style={RULE_CELL}>
          An <code>&lt;a href&gt;</code> drawn as a chip is not a Chip (it acts)
          and not a Button (it navigates —
          <code>variant="link"</code> is for a <code>&lt;button&gt;</code> that
          READS as a link). This is the INTERACTIVE BADGE organ, which does not
          exist: <code>record-collector</code>'s link shape and
          <code>org-workbench</code>'s button shape are two members drawing one
          missing primitive. Leave it raw and raise it — which is why nothing
          styled is rendered here.
        </span>
      </div>

      <div style={ROW_WIDE}>
        <span style={LABEL_COL}>a count in a label</span>
        <Button variant="primary">
          Fire rows <span style={COUNT_SLOT}>12</span>
        </Button>
        <span style={NOT_A}>stays raw</span>
        <span style={RULE_CELL}>
          A token INSIDE a control's label is painted against the CONTROL's
          surface and inherits <code>currentColor</code> from its variant. A Chip
          paints its own ground from page-level tokens and would erase the
          selected-state cue. Raise the count-slot organ; do not reach for a Chip.
        </span>
      </div>

      <div style={ROW_WIDE}>
        <span style={LABEL_COL}>a score</span>
        <span style={CAPTION_STRONG}>82</span>
        <span style={NOT_A}>ConfidencePill</span>
        <span style={RULE_CELL}>
          Confidence already has a primitive in this package and it speaks a
          banded 0–100 vocabulary a six-tone enum cannot. Do not re-derive it as a
          Chip — <code>record-collector</code> did, and landed a hair off. See the
          ConfidencePill entry.
        </span>
      </div>

      <div style={ROW_WIDE}>
        <span style={LABEL_COL}>it wraps</span>
        <span style={CAPTION}>a label long enough to need two lines</span>
        <span style={NOT_A}>not a chip</span>
        <span style={RULE_CELL}>
          Chip is <code>white-space: nowrap</code> by construction. A multi-line
          label is a card or a note. Raise it.
        </span>
      </div>
    {/if}
  </div>
{/snippet}

<!-- =====================================================================
     Button — the six variants.
     ================================================================== -->
{#snippet buttonVariants(p: Record<string, unknown>)}
  {@const label = String(p.label ?? '')}
  {@const disabled = Boolean(p.disabled)}
  <div style={STACK_TIGHT}>
    <div style={ROW}>
      {#each VARIANTS as v (v)}
        <Button variant={v} {disabled}>{label || v}</Button>
      {/each}
    </div>
    <p style={CAPTION}>
      Six, and a seventh would be visibly a seventh. Every filled variant takes
      its text from the token PAIRED with its surface —
      <code>--color-primary</code> / <code>--color-primary-foreground</code>,
      <code>--color-error-bg</code> / <code>--color-error-fg</code> — which is the
      rule that stops a member writing <code>color: #fff</code> into its own
      button recipe.
    </p>
  </div>
{/snippet}

<!-- =====================================================================
     Button — the full 6 x 4 matrix. Twenty-four live controls.
     ================================================================== -->
{#snippet buttonMatrix(p: Record<string, unknown>)}
  {@const disabled = Boolean(p.disabled)}
  <div style={STACK_TIGHT}>
    <div style={ROW}>
      <span style={LABEL_COL}></span>
      <span style={LABEL_COL}>sm · 24px</span>
      <span style={LABEL_COL}>md · 28px</span>
      <span style={LABEL_COL}>lg · 32px</span>
      <span style={LABEL_COL}>icon · 28²</span>
    </div>
    {#each VARIANTS as v (v)}
      <div style={ROW}>
        <span style={LABEL_COL}>{v}</span>
        {#each TEXT_SIZES as s (s)}
          <span style="min-inline-size:11ch;"><Button variant={v} size={s} {disabled}>{v}</Button></span>
        {/each}
        <span style="min-inline-size:11ch;">
          <Button variant={v} size="icon" {disabled} aria-label={`Add — ${v}`}>
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d={PLUS_D} /></svg>
          </Button>
        </span>
      </div>
    {/each}
    <p style={CAPTION}>
      Heights come from <code>--control-h-sm/md/lg</code> (24 / 28 / 32) and
      horizontal padding from <code>--space-sm/md/lg</code>. There is no
      <code>--control-px-*</code> family: a proposed one had a 14px step that
      exists on no scale, so it could only ever have been a literal.
      <code>sm</code> at 24px IS the WCAG 2.2 SC 2.5.8 floor;
      <code>icon</code> is a 28×28 square so it clears the floor in both
      dimensions and lines up with the input beside it.
    </p>
  </div>
{/snippet}

<!-- =====================================================================
     Button — type, and what it does inside a form.
     ================================================================== -->
{#snippet buttonForm(p: Record<string, unknown>)}
  {@const disabled = Boolean(p.disabled)}
  <form style={STACK_TIGHT} onsubmit={onDemoSubmit}>
    <div style={ROW}>
      <Button variant="secondary" {disabled}>type="button" (default)</Button>
      <Button variant="primary" type="submit" {disabled}>type="submit"</Button>
      <output style={CAPTION_STRONG}>nothing fired yet</output>
    </div>
    <p style={CAPTION}>
      Press both. The default does nothing, because
      <code>type="button"</code> is the component's default and a
      <code>&lt;button&gt;</code> with no type attribute defaults to
      <code>submit</code> in HTML — which is how a button parked inside a form
      submits it by accident. The component makes the safe case the default and
      the submitting case something you have to ask for.
    </p>
  </form>
{/snippet}

<!-- =====================================================================
     Button — size="icon" and the accessible-name requirement.
     ================================================================== -->
{#snippet buttonIconName(p: Record<string, unknown>)}
  {@const labelled = p.labelled !== false}
  <div style={STACK_TIGHT}>
    <div style={ROW_WIDE}>
      {#if labelled}
        <Button variant="secondary" size="icon" aria-label="Add a source">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d={PLUS_D} /></svg>
        </Button>
        <span style={VERDICT}>named</span>
        <span style={RULE_CELL}>
          <code>aria-label="Add a source"</code>. The <code>&lt;svg&gt;</code> is
          <code>aria-hidden</code> and <code>focusable="false"</code>, so the
          control has exactly one name and the graphic is not in the tab order.
        </span>
      {:else}
        <Button variant="secondary" size="icon">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d={PLUS_D} /></svg>
        </Button>
        <span style={NOT_A}>unnamed</span>
        <span style={RULE_CELL}>
          Deliberately broken. The component stamps
          <code>data-a11y-error</code> on the element and logs to the console in
          DEV, and the Audit tab reports it under Names — which is the point of
          pinning the failure as a fixture rather than describing it. The sweep
          found unlabelled icon-only buttons in four members.
        </span>
      {/if}
    </div>
    <p style={CAPTION}>
      Icons are SVG, never glyphs. The product carries 35 bare check characters
      and no icon system; a glyph is font-dependent, unstyleable and
      screen-reader-hostile. Pass an <code>&lt;svg&gt;</code> in the children
      snippet and it is sized from <code>--icon-*</code> automatically.
    </p>
  </div>
{/snippet}

<!-- =====================================================================
     Chip — six tones, two sizes.
     ================================================================== -->
{#snippet chipTones(p: Record<string, unknown>)}
  {@const dot = Boolean(p.dot)}
  {@const label = String(p.label ?? '')}
  <div style={STACK_TIGHT}>
    {#each CHIP_SIZES as s (s)}
      <div style={ROW}>
        <span style={LABEL_COL}>size {s}</span>
        {#each TONES as t (t)}
          <Chip tone={t} size={s} {dot}>{label || t}</Chip>
        {/each}
      </div>
    {/each}
    <p style={CAPTION}>
      Twelve cells, and every tone is a token TRIPLE — background, foreground,
      boundary — declared for all three modes by <code>packages/theme</code>.
      <code>accent</code> takes <code>--color-accent-fg</code> and NOT
      <code>--color-primary</code>: the accent ground is an 8–9% wash of primary
      over the page, and in light mode primary on that ground measures 4.42:1,
      under the 4.5 floor this component's header promises. Two independent
      migrations measured that before anyone read the header.
    </p>
  </div>
{/snippet}

<!-- =====================================================================
     Chip — the dot, and why it is never the only signal.
     ================================================================== -->
{#snippet chipDot(p: Record<string, unknown>)}
  {@const showBad = Boolean(p.showBad)}
  <div style={STACK_TIGHT}>
    <div style={ROW}>
      <span style={LABEL_COL}>correct</span>
      <Chip tone="ok" dot>connected</Chip>
      <Chip tone="warn" dot>reconnecting</Chip>
      <Chip tone="error" dot>disconnected</Chip>
      <Chip tone="info" dot>idle</Chip>
    </div>
    {#if showBad}
      <div style={ROW}>
        <span style={NOT_A}>1.4.1 fail</span>
        <Chip tone="ok" dot>socket</Chip>
        <Chip tone="warn" dot>socket</Chip>
        <Chip tone="error" dot>socket</Chip>
        <Chip tone="info" dot>socket</Chip>
      </div>
      <p style={CAPTION}>
        Four states, one word. The only difference between these chips is hue —
        WCAG 1.4.1, and unreadable to anyone who cannot separate the colours or
        is reading a greyscale screenshot in a bug report. The dot does not rescue
        it: <code>dot</code> is <code>aria-hidden</code> by construction, so it is
        decoration and the text has to carry the meaning.
      </p>
    {:else}
      <p style={CAPTION}>
        The dot is a leading status mark, <code>--space-xs</code> square at
        <code>--radius-round</code>, painted from <code>currentColor</code> so it
        can never disagree with the tone around it. It is
        <code>aria-hidden</code>: the text carries the meaning, always.
      </p>
    {/if}
  </div>
{/snippet}

<!-- =====================================================================
     Chip — dismissible, reveal, and the enforced name.
     ================================================================== -->
{#snippet chipDismiss(p: Record<string, unknown>)}
  {@const missingLabel = Boolean(p.missingLabel)}
  <div style={STACK_TIGHT}>
    <div style={ROW_WIDE}>
      <span style={LABEL_COL}>sm</span>
      <Chip size="sm" tone="neutral" dismissible dismissLabel="Remove tag Rural-Access">Rural-Access</Chip>
      <Chip size="sm" tone="neutral">Rural-Access</Chip>
      <span style={RULE_CELL}>
        A dismissible <code>sm</code> chip is TALLER than a plain one, on purpose.
        The × is <code>--control-h-md</code> (28px) in both directions, not
        <code>-sm</code>: at 24px it sat exactly ON the WCAG 2.2 SC 2.5.8 floor
        where the <code>&lt;Button size="icon"&gt;</code> it replaces sat 4px
        clear, so the first adoption measured a target REDUCTION.
      </span>
    </div>

    <div style={ROW_WIDE}>
      <span style={LABEL_COL}>md</span>
      <Chip tone="accent" dismissible dismissLabel="Remove tag Apprenticeship">Apprenticeship</Chip>
      <Chip tone="error" dismissible dismissLabel="Remove failed source">fetch failed</Chip>
      <span style={RULE_CELL}>
        Every dismiss control is a real <code>&lt;button type="button"&gt;</code>
        with its own accessible name and its own focus ring — legal, because the
        Chip around it is a span. The defect this replaces was a
        <code>&lt;span role="button" tabindex="0"&gt;</code> nested inside a
        <code>&lt;button&gt;</code>, named literally "×", measuring 14×14.
      </span>
    </div>

    <div style={ROW_WIDE}>
      <span style={LABEL_COL}>revealOnHover</span>
      <Chip tone="neutral" dismissible revealOnHover dismissLabel="Remove tag HNWI">HNWI</Chip>
      <Chip tone="neutral" dismissible revealOnHover dismissLabel="Remove tag Employer-Partnerships">
        Employer-Partnerships
      </Chip>
      <span style={RULE_CELL}>
        Hover them, then Tab to them. The reveal is <code>:hover</code> OR
        <code>:focus-within</code>, never hover alone, and it moves opacity rather
        than display so revealing never reflows the row. OFF by default: a
        hover-only affordance does not exist on a touch device, which is why
        <code>@media (hover: none)</code> forces it visible.
      </span>
    </div>

    {#if missingLabel}
      <div style={ROW_WIDE}>
        <span style={NOT_A}>no name</span>
        <Chip tone="neutral" dismissible>Rural-Access</Chip>
        <span style={RULE_CELL}>
          Deliberately broken: <code>dismissible</code> without
          <code>dismissLabel</code>. The component draws a dashed error outline,
          logs to the console, and the Audit tab reports the nested button under
          Names. Same enforcement Button applies to <code>size="icon"</code>.
        </span>
      </div>
    {/if}

    <p style={CAPTION}>
      The dismiss controls here are inert on purpose — there is no list to remove
      from in a gallery, and a fake one would be a fixture pretending to be a
      product. What the specimen proves is what can be measured: the control is
      real, focusable, separately named, and ≥24px.
    </p>
  </div>
{/snippet}

<!-- =====================================================================
     The override ladder, rungs 0 through 4.
     ================================================================== -->
{#snippet overrideLadder(p: Record<string, unknown>)}
  {@const rung = String(p.rung ?? 'all')}
  {@const all = rung === 'all'}
  <div style={STACK}>
    {#if all || rung === '0'}
      <div style={STACK_TIGHT}>
        <p style={CAPTION_STRONG}>Rung 0 — layout is the parent's job. Not a deviation at all.</p>
        <div style={ROW_WIDE}>
          <div style="display:flex; flex-direction:column; gap:var(--space-2xs); inline-size:260px; padding:var(--space-md); border:1px solid var(--color-border); border-radius:var(--radius-lg);">
            <span style={NOT_A}>stretched</span>
            <Chip tone="accent">Apprenticeship</Chip>
            <Button variant="secondary">Retry</Button>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-start; gap:var(--space-2xs); inline-size:260px; padding:var(--space-md); border:1px solid var(--color-border); border-radius:var(--radius-lg);">
            <span style={VERDICT}>fixed on the parent</span>
            <Chip tone="accent">Apprenticeship</Chip>
            <Button variant="secondary">Retry</Button>
          </div>
        </div>
        <p style={RULE_CELL}>
          The only difference is <code>align-items: flex-start</code> on the
          right-hand parent. A column-flex parent stretches its children, and
          <code>--radius-pill</code> makes that far more visible than a
          small-radius badge ever was — one chip was measured at 854px wide. It
          stretched before the migration too; a 3px band reads as a band and an
          854px pill reads as a mistake. <strong>Fixing it on the parent is rung
          0, and rung 0 is not an override</strong> — a wrapper may carry CSS and
          still be rung 0. Its own regression mode: a height-capped column-flex
          container SHRINKS its items, which once crushed controls from 26.8px to
          17px, under the very floor the component exists to hold. Add
          <code>flex: 0 0 auto</code> to the items.
        </p>
      </div>
    {/if}

    {#if all || rung === '1'}
      {#if all}<div style={HAIRLINE}></div>{/if}
      <div style={STACK_TIGHT}>
        <p style={CAPTION_STRONG}>Rung 1 — variant + size. The sanctioned API.</p>
        <div style={ROW}>
          <Button variant="primary" size="lg">Fetch full content</Button>
          <Button variant="outline" size="md">Preview</Button>
          <Button variant="link" size="sm">back to corpora</Button>
          <Chip tone="ok" size="sm">fetched</Chip>
        </div>
        <p style={RULE_CELL}>
          Two enums, not ten props. Mapped by ROLE rather than by the appearance
          the member happened to draw, this rung covered every one of the nine
          controls in the first member to adopt — zero overrides used. Both
          catalogs that exist today report the same: no <code>radius=</code>, no
          <code>class=</code>, no <code>data-deviation</code> anywhere.
        </p>
      </div>
    {/if}

    {#if all || rung === '2'}
      {#if all}<div style={HAIRLINE}></div>{/if}
      <div style={STACK_TIGHT}>
        <p style={CAPTION_STRONG}>Rung 2 — radius="lg". A token NAME, never a value.</p>
        <div style={ROW}>
          <Button variant="secondary">default · --radius-md</Button>
          <Button variant="secondary" radius="lg">radius="lg"</Button>
          <Button variant="secondary" radius="pill">radius="pill"</Button>
          <Chip tone="neutral" radius="sm">radius="sm"</Chip>
        </div>
        <p style={RULE_CELL}>
          The shipped scale is five steps — <code>sm md lg pill round</code>.
          There is deliberately no <code>xs</code>, and the circle token is
          <code>round</code>, not <code>full</code>. An unknown step does not
          emit a <code>var()</code> that silently resolves to nothing: it falls
          back to the default and logs loudly, which is precisely the
          phantom-token failure this whole effort exists to close. Pick by ROLE
          from DESIGN.md §Shapes — <code>chat</code> has eleven declarations one
          scale step off because someone picked by eye.
        </p>
      </div>
    {/if}

    {#if all || rung === '3'}
      {#if all}<div style={HAIRLINE}></div>{/if}
      <div style={STACK_TIGHT}>
        <p style={CAPTION_STRONG}>Rung 3 — radius="lg/60". The token, at a percentage.</p>
        <div style={ROW}>
          <Button variant="secondary" radius="lg">lg · 8px</Button>
          <Button variant="secondary" radius="lg/60">lg/60 · 4.8px</Button>
          <Button variant="secondary" radius="lg/25">lg/25 · 2px</Button>
        </div>
        <p style={RULE_CELL}>
          Reads the Tailwind <code>/</code> convention: this token, at N percent,
          resolving to <code>calc(var(--radius-lg) * 0.6)</code>. It is
          deliberately COUNTABLE —
          <code>radius="lg/60"</code> appearing in six members is a measurable
          argument for a missing scale step, where a raw 11px would be invisible
          to every piece of tooling in the repo.
          <strong>The escape hatch is also the detection mechanism.</strong>
        </p>
      </div>
    {/if}

    {#if all || rung === '4'}
      {#if all}<div style={HAIRLINE}></div>{/if}
      <div style={STACK_TIGHT}>
        <p style={CAPTION_STRONG}>Rung 4 — class= plus data-deviation=. Legal, declared, counted.</p>
        <div style="inline-size:240px;">
          <Button
            variant="secondary"
            class="demo-rung-4"
            data-deviation="full-bleed action row — label left, shortcut right; the API centres its content"
          >
            <span>Save corpus</span>
            <span style={SHORTCUT}>⌘S</span>
          </Button>
        </div>
        <p style={RULE_CELL}>
          The component REFUSES a bare <code>class=</code>: without a
          <code>data-deviation</code> reason alongside it, it logs an error in
          DEV. That is what makes rung 4 countable — a declared deviation surfaces
          in the consuming member's catalog under Deviations (F9), where an
          undeclared one is indistinguishable from a bug. The override here is
          <code>justify-content: space-between</code>, which the two-enum API
          genuinely cannot express; anything the API CAN express does not belong
          on this rung. <strong>Measured across both existing catalogs, rung 4 has
          zero real call sites</strong> — this specimen is the only one in the
          repo, which is the number worth watching.
        </p>
        <p style={RULE_CELL}>
          <strong>And rung 4 does not work the way the contract describes it.</strong>
          Measured on this specimen: the rule behind it has to be written
          <code>.ui-btn.demo-rung-4</code>, not <code>.demo-rung-4</code>. Svelte
          compiles the component's own rule to <code>.ui-btn.svelte-1mt4l7c</code>
          — specificity <strong>(0,2,0)</strong> — and a rung-4 class on its own is
          <strong>(0,1,0)</strong>, so it loses every property the component sets.
          The first attempt at this specimen rendered <code>justify-content:
          center</code> and looked exactly like a working override. Even at
          (0,2,0) the two selectors TIE and source order decides, so rung 4 is a
          load-order bet rather than a rule. Raised, not chased: this is a defect
          in the ladder, and the component is not this page's to revise.
        </p>
      </div>
    {/if}

    {#if rung === 'unknown'}
      <div style={STACK_TIGHT}>
        <p style={CAPTION_STRONG}>Rung 2, mis-spelled. What a bad token name does.</p>
        <div style={ROW}>
          <Button variant="secondary" radius="xl">radius="xl"</Button>
          <Button variant="secondary" radius="lg/0">radius="lg/0"</Button>
          <Button variant="secondary">default, for comparison</Button>
        </div>
        <p style={RULE_CELL}>
          There is no <code>--radius-xl</code>, and a zero percentage is not a
          positive percentage. Both fall back to <code>--radius-md</code> and both
          log a named error to the console listing the valid steps. Compare with
          the alternative the component rejected: emitting
          <code>var(--radius-xl)</code> and letting it resolve to nothing, which
          is invisible until someone screenshots it.
        </p>
      </div>
    {/if}
  </div>
{/snippet}

<style>
  /* The ONE class in this file, and the only thing it is allowed to be.
   *
   * Rung 4 of the override ladder IS the `class=` prop, so a specimen of rung 4
   * cannot be built from inline styles the way the rest of this file is — there
   * would be nothing to demonstrate. `:global` because the class travels to the
   * Button as a prop string and never appears on an element in this template,
   * so Svelte's scoping hash is never applied to it.
   *
   * It is listed in the catalog's `exemptClasses` with the same reasoning: it is
   * a specimen-only name that ships in no product surface, and the containment
   * audit would otherwise report it as a leak forever. Tokens only, like
   * everything else. */
  :global(.ui-btn.demo-rung-4) {
    justify-content: space-between;
    inline-size: 100%;
  }
</style>
