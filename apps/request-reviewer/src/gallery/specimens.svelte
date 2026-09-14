<script module lang="ts">
  // request-reviewer's specimens.
  //
  // The Button entries render the REAL @augment-it/shared-ui component — same
  // import the product uses, same bundle, same stylesheet. That is the whole
  // premise of a federated gallery: a specimen that is a copy has already
  // drifted by the time anyone looks at it.
  //
  // WHY THESE ARE SNIPPETS AND NOT kind: 'component'. The runtime renders a
  // component entry as `<Specimen {...props} />` — props only, no children. A
  // Button's label arrives through the `children` snippet, so a component entry
  // would render an empty button. Every primitive whose content is a child has
  // this problem, which is most of them. Snippets are the honest workaround
  // today; see the Phase 5 findings.
  //
  // The rest are class recipes from app.css, which is where the remaining design
  // in this member lives. They are catalogued as first-class entries for the
  // same reason corpora-curator's are: nothing stops a second panel treatment
  // from being appended to the stylesheet, and a gallery that listed only
  // .svelte files would show none of them.
  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';

  export { buttons, buttonSizes, buttonStates, overrideLadder, statusPill, fields, panel, tokenBinding, coverage, progress, feedback, stepper };

  const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
  const SIZES = ['sm', 'md', 'lg'] as const;
</script>

{#snippet chevron(dir: 'left' | 'right')}
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d={dir === 'left' ? 'M10 3 L5 8 L10 13' : 'M6 3 L11 8 L6 13'} />
  </svg>
{/snippet}

{#snippet buttons(p: Record<string, unknown>)}
  <div class="fire-row">
    {#each VARIANTS as v}
      <Button variant={v} disabled={Boolean(p.disabled)}>{String(p.label || v)}</Button>
    {/each}
  </div>
{/snippet}

{#snippet buttonSizes(p: Record<string, unknown>)}
  <div class="fire-row">
    {#each SIZES as s}
      <Button variant={String(p.variant ?? 'primary') as 'primary'} size={s}>{s} · {String(p.label || 'Fire this row')}</Button>
    {/each}
    <Button variant={String(p.variant ?? 'primary') as 'primary'} size="icon" aria-label="Next row">
      {@render chevron('right')}
    </Button>
  </div>
{/snippet}

{#snippet buttonStates(p: Record<string, unknown>)}
  <div class="fire-row">
    <Button variant="primary">Rest</Button>
    <Button variant="primary" disabled>Disabled</Button>
    <Button variant="secondary" aria-pressed="false">Toggle, off</Button>
    <Button variant="primary" aria-pressed="true">Toggle, on</Button>
    <Button size="icon" aria-label="Previous row" disabled={Boolean(p.disabled)}>
      {@render chevron('left')}
    </Button>
  </div>
{/snippet}

{#snippet overrideLadder(p: Record<string, unknown>)}
  <div class="fire-row">
    <Button variant="primary">rung 1 — variant + size</Button>
    <Button variant="primary" radius="lg">rung 2 — radius="lg"</Button>
    <Button variant="primary" radius="lg/60">rung 3 — radius="lg/60"</Button>
    <Button variant="primary" radius="pill">radius="pill"</Button>
  </div>
{/snippet}

{#snippet stepper(p: Record<string, unknown>)}
  <div class="stepper">
    <Button size="icon" aria-label="Previous row" disabled={Number(p.index ?? 0) === 0}>
      {@render chevron('left')}
    </Button>
    <span>row {Number(p.index ?? 0) + 1} / 12</span>
    <Button size="icon" aria-label="Next row">{@render chevron('right')}</Button>
  </div>
{/snippet}

{#snippet statusPill(p: Record<string, unknown>)}
  <div class="req-status-bar">
    consumes <code>@augment-it/workspace</code> · <code>ws://localhost:3001/ws</code> ·
    <span class="status status-{String(p.status ?? 'open')}">{String(p.status ?? 'open')}</span>
  </div>
{/snippet}

{#snippet fields(p: Record<string, unknown>)}
  <div>
    <div class="field">
      <label for="gx-prompt">Prompt</label>
      <select id="gx-prompt"><option>Classify the institution → institution_type</option></select>
    </div>
    <label class="inline">
      max_tokens
      <input type="number" value={Number(p.maxTokens ?? 4096)} />
    </label>
  </div>
{/snippet}

{#snippet panel(p: Record<string, unknown>)}
  <pre class="panel" class:json={Boolean(p.json)}>{String(
      p.json
        ? '{\n  "model": "claude-opus-4-7",\n  "max_tokens": 4096\n}'
        : 'You are classifying institutions.\n\nInstitution: Prairie State College',
    )}</pre>
{/snippet}

{#snippet tokenBinding(p: Record<string, unknown>)}
  <ul class="bind">
    <li>
      <CardRow density="compact">
        <code>{'{{'}name{'}}'}</code>
        <span class="arrow">→</span> <span class="val">Prairie State College</span>
      </CardRow>
    </li>
    <li>
      <CardRow
        density="compact"
        style={(p.unbound ?? true) ? 'border-color: var(--color-error-text)' : undefined}
        data-deviation={(p.unbound ?? true)
          ? 'unbound-token row state. CardRow has ONE state axis — `selected` — and an invalid/error row has nowhere sanctioned to live.'
          : undefined}
      >
        <code>{'{{'}enrollment{'}}'}</code>
        {#if p.unbound ?? true}
          <span class="nobind">no matching column in this record set</span>
        {:else}
          <span class="arrow">→</span> <span class="val">4,182</span>
        {/if}
      </CardRow>
    </li>
  </ul>
{/snippet}

{#snippet coverage(p: Record<string, unknown>)}
  <div class="coverage">
    <span class="coverage-stat covered">{Number(p.covered ?? 8)} / 12 covered</span>
    <span class="coverage-stat needs-rerun">2 needs-rerun</span>
    <span class="coverage-stat remaining">4 remaining</span>
  </div>
{/snippet}

{#snippet progress(p: Record<string, unknown>)}
  <p class="progress">
    <span class="spinner" aria-hidden="true"></span>
    firing… {Number(p.done ?? 3)} / 12
  </p>
{/snippet}

{#snippet feedback(p: Record<string, unknown>)}
  <div>
    <p class="warn">2 unbound token(s) — fix the prompt or choose a record set that has these columns before firing.</p>
    <div class="result">fired 12 rows · 12 responses stored</div>
  </div>
{/snippet}
