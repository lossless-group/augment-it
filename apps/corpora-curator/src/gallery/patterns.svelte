<script module lang="ts">
  // The un-componentised half of this member's library.
  //
  // corpora-curator has four .svelte files and roughly thirty class recipes.
  // The recipes are where the design lives — `.cc-card`, `.cc-row`, the chips —
  // and they are exactly the things that drift, because nothing stops a sixth
  // badge treatment from being added to app.css. (The federation-wide
  // measurement that started all this counted 158 button rule-sets and 34 badge
  // treatments; none of them were components.)
  //
  // The BUTTON recipes are no longer among them. `.cc-primary`, `.cc-link`,
  // `.cc-danger`, `.cc-back`, `.cc-tag-x` and the bare `.cc-app button` base
  // were deleted when this member adopted @augment-it/shared-ui's <Button>; the
  // `buttons` specimen below is now a usage catalog of that component's
  // variants as this member spends them, not a catalog of local recipes. Three
  // controls stayed raw — the two list rows and the suggestion option — and
  // each carries its reasoning in app.css.
  //
  // So they get catalogued as first-class entries, as markup rather than as
  // components. Each snippet takes the resolved props object, so the gallery's
  // controls drive them the same way they drive a real component.
  //
  // Exported from `<script module>`: legal because none of these reference
  // instance state — they read only their own parameter.
  import Button from '@augment-it/shared-ui/Button.svelte';

  export {
    buttons,
    card,
    fields,
    chips,
    tags,
    sourceRow,
    headerBar,
    banner,
    attachedFile,
    emptyState,
  };
</script>

{#snippet buttons(p: Record<string, unknown>)}
  <!-- Every variant x size this member spends, and nothing else. Six pairs, all
       at ladder rung 1 — no radius override and no class passthrough anywhere in
       corpora-curator. A seventh appearing here is now a change to the FEDERAL
       component's API surface rather than a line appended to app.css, which is
       the whole point of the swap. -->
  <div class="cc-actions">
    <Button variant="primary" disabled={Boolean(p.disabled)}>{String(p.label ?? '↓ Fetch full content')}</Button>
    <Button variant="secondary" disabled={Boolean(p.disabled)}>⟳ Retry</Button>
    <Button variant="destructive" disabled={Boolean(p.disabled)}>🗑 Remove</Button>
    <Button variant="secondary" size="sm" disabled={Boolean(p.disabled)}>‹ All corpora</Button>
    <Button variant="link" size="sm" disabled={Boolean(p.disabled)}>‹ corpora</Button>
    <Button variant="ghost" size="icon" aria-label="remove tag" disabled={Boolean(p.disabled)}>×</Button>
  </div>
{/snippet}

{#snippet card(p: Record<string, unknown>)}
  <section class="cc-card">
    <h3>{String(p.heading ?? 'Source 1 of 4')}</h3>
    <div class="cc-field">
      <span class="cc-label">Publisher</span>
      <span class="cc-value">{String(p.body ?? 'Brookings')}</span>
    </div>
    <div class="cc-field">
      <span class="cc-label">Published</span>
      <span class="cc-value cc-mono">2025-11-04</span>
    </div>
  </section>
{/snippet}

{#snippet fields(p: Record<string, unknown>)}
  <div>
    <div class="cc-field">
      <span class="cc-label">Title <span class="cc-muted cc-mini">— editable</span></span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class:cc-saved={Boolean(p.saved)} value={String(p.value ?? 'The degree is not the job')} />
    </div>
    <div class="cc-field">
      <span class="cc-label">Slug <span class="cc-muted cc-mini">— lowercase-kebab</span></span>
      <input class="cc-mono" value="the-degree-is-not-the-job" />
    </div>
    <div class="cc-field">
      <span class="cc-label">Extract</span>
      <textarea placeholder="paste a quote…"></textarea>
    </div>
    <div class="cc-field">
      <span class="cc-label">Kind</span>
      <select>
        <option>Quotes</option>
        <option>Stats</option>
        <option>References</option>
        <option>Mentions</option>
      </select>
    </div>
  </div>
{/snippet}

{#snippet chips(p: Record<string, unknown>)}
  <div class="cc-actions">
    <span class="cc-pill">reach-edu</span>
    <span class="cc-pill">strategy</span>
    <span class="cc-pill">{String(p.count ?? 4)} sources</span>
    <span class="cc-status-chip">metadata-only</span>
    <span class="cc-status-chip">fetched</span>
    <span class="cc-conn status-open">open</span>
    <span class="cc-conn status-error">error</span>
    <span class="cc-conn status-closed">closed</span>
    <span class="cc-conn">connecting</span>
  </div>
{/snippet}

{#snippet tags(p: Record<string, unknown>)}
  <div class="cc-field">
    <span class="cc-label">Tags <span class="cc-muted cc-mini">— Train-Case, workspace vocabulary</span></span>
    <div class="cc-tags">
      <span class="cc-tag"
        >Work-Based-Learning<Button variant="ghost" size="icon" aria-label="remove tag">×</Button></span
      >
      <span class="cc-tag"
        >Credential-Attainment<Button variant="ghost" size="icon" aria-label="remove tag">×</Button></span
      >
      <span class="cc-tag-mini">Rural-Access</span>
    </div>
    {#if p.suggesting}
      <div class="cc-tag-input">
        <input value="Emp" />
        <div class="cc-tag-suggest">
          <button>Employer-Partnerships</button>
          <button>Employment-Outcomes</button>
        </div>
      </div>
    {:else}
      <div class="cc-tag-input"><input placeholder="add a tag…" /></div>
    {/if}
  </div>
{/snippet}

{#snippet sourceRow(p: Record<string, unknown>)}
  <div class="cc-list">
    <button class="cc-row" class:active={Boolean(p.active)}>
      <span class="cc-dot"></span>
      <span class="cc-row-body">
        <span class="cc-row-title">{String(p.title ?? 'The degree is not the job')}</span>
        <span class="cc-row-meta">
          <span>Brookings</span>
          <span class="cc-status-chip">fetched</span>
          <span class="cc-tag-mini">Work-Based-Learning</span>
        </span>
      </span>
    </button>
    <button class="cc-row">
      <span class="cc-dot err"></span>
      <span class="cc-row-body">
        <span class="cc-row-title"
          >https://www.dol.gov/agencies/eta/apprenticeship/policy/registered-apprenticeship-national-guidelines</span
        >
        <span class="cc-row-meta"><span class="cc-status-chip">metadata-only</span></span>
      </span>
    </button>
  </div>
{/snippet}

{#snippet headerBar(p: Record<string, unknown>)}
  <header class="cc-header">
    <span class="cc-brand">Corpora Curator</span>
    <span class="cc-pill">reach-edu</span>
    <span class="cc-pill">strategy</span>
    <Button variant="secondary" size="sm">‹ All corpora</Button>
    <span class="cc-strategy">{String(p.strategy ?? 'Turning Jobs Into Degrees')}</span>
    <span class="cc-pill">4 sources</span>
    <span class="cc-spacer"></span>
    <span class="cc-conn status-{String(p.status ?? 'open')}">{String(p.status ?? 'open')}</span>
  </header>
{/snippet}

{#snippet banner(p: Record<string, unknown>)}
  <div class="cc-banner">
    {String(p.message ?? 'source.add failed — capability not registered on this workspace')}
  </div>
{/snippet}

{#snippet attachedFile(p: Record<string, unknown>)}
  <div>
    <div class="cc-attached">
      <span class="cc-attached-dot">●</span>
      <span class="cc-attached-name">{String(p.filename ?? 'apprenticeship-at-scale-2026.pdf')}</span>
      <span class="cc-muted cc-mini">4.0 MB</span>
    </div>
    <a class="cc-urllink" href="https://example.org/reports/apprenticeship-at-scale-2026.pdf"
      >https://example.org/reports/apprenticeship-at-scale-2026.pdf</a
    >
  </div>
{/snippet}

{#snippet emptyState(p: Record<string, unknown>)}
  <p class="cc-muted cc-pad cc-mini">{String(p.message ?? 'No sources yet. Paste a URL to add one.')}</p>
{/snippet}
