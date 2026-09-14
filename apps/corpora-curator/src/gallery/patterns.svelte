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
  // The BADGE recipes are no longer among them either. `.cc-pill`, `.cc-conn`
  // (with its three state variants), `.cc-status-chip`, `.cc-tag` and
  // `.cc-tag-mini` were deleted when this member adopted <Chip>; the `chips` and
  // `tags` specimens below are usage catalogs of that component too. The `chips`
  // entry used to exist to SHOW a problem — three treatments of one job, side by
  // side, with the note "apart, each looks fine." Keeping it as a tone catalog
  // is deliberate: the specimen that documented the divergence should be the one
  // that documents its resolution, rather than being quietly deleted.
  //
  // The BUTTON recipes are no longer among them. `.cc-primary`, `.cc-link`,
  // `.cc-danger`, `.cc-back`, `.cc-tag-x` and the bare `.cc-app button` base
  // were deleted when this member adopted @augment-it/shared-ui's <Button>; the
  // `buttons` specimen below is now a usage catalog of that component's
  // variants as this member spends them, not a catalog of local recipes.
  //
  // The two list ROWS are no longer among them either. `.cc-strat` and `.cc-row`
  // were the Button rollout's two holdouts, both left raw with the same note —
  // "the organ this wants is a selectable list row; it does not exist yet" — and
  // that organ shipped as <CardRow> + <SelectWrapper--ClickPrimary>. The `source-row`
  // specimen below is now a usage catalog of those two components, which is why
  // it still exists: the specimen that documented the holdout should be the one
  // that documents its resolution. ONE control is still raw — the suggestion
  // option — and it carries its reasoning in app.css.
  //
  // So they get catalogued as first-class entries, as markup rather than as
  // components. Each snippet takes the resolved props object, so the gallery's
  // controls drive them the same way they drive a real component.
  //
  // Exported from `<script module>`: legal because none of these reference
  // instance state — they read only their own parameter.
  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import SelectWrapperClickPrimary from '@augment-it/shared-ui/SelectWrapper--ClickPrimary.svelte';
  import { CONNECTION_TONE, type ConnStatus } from '../types';

  // Every connection state, in the order the divergence is easiest to read.
  const CONN_STATES: ConnStatus[] = ['open', 'connecting', 'auth_required', 'closed', 'error', 'idle'];

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
  <!-- Every variant x size this member spends, and nothing else. FIVE pairs now,
       all at ladder rung 1 — no radius override and no class passthrough anywhere
       in corpora-curator. ghost/icon left when the tag × became a
       <Chip dismissible>; it was the member's only icon-only control and the
       specimen has to shrink with it, because the entry's whole claim is that
       what renders here is what ships. A sixth appearing is now a change to a
       FEDERAL component's API surface rather than a line appended to app.css. -->
  <div class="cc-actions">
    <Button variant="primary" disabled={Boolean(p.disabled)}>{String(p.label ?? '↓ Fetch full content')}</Button>
    <Button variant="secondary" disabled={Boolean(p.disabled)}>⟳ Retry</Button>
    <Button variant="destructive" disabled={Boolean(p.disabled)}>🗑 Remove</Button>
    <Button variant="secondary" size="sm" disabled={Boolean(p.disabled)}>‹ All corpora</Button>
    <Button variant="link" size="sm" disabled={Boolean(p.disabled)}>‹ corpora</Button>
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
  <!-- One treatment, six tones, and every tone here is picked by MEANING. The
       top row is the member's plain labels: a workspace, a corpus type and a
       count are facts, so all three are neutral even though .cc-pill drew them
       with a border and .cc-status-chip drew them without one.

       The bottom row is the one worth reading. All six connection states are
       shown because the old recipe collapsed three of them — idle, connecting
       and auth_required — into one grey, and the specimen that used to prove
       the divergence should be the one that proves it is gone. -->
  <div class="cc-actions">
    <Chip size="sm">reach-edu</Chip>
    <Chip size="sm">strategy</Chip>
    <Chip size="sm">{String(p.count ?? 4)} sources</Chip>
    <Chip size="sm">metadata-only</Chip>
    <Chip size="sm" tone="ok">fetched</Chip>
  </div>
  <div class="cc-actions">
    {#each CONN_STATES as s}
      <Chip size="sm" tone={CONNECTION_TONE[s]}>{s}</Chip>
    {/each}
  </div>
{/snippet}

{#snippet tags(p: Record<string, unknown>)}
  <div class="cc-field">
    <span class="cc-label">Tags <span class="cc-muted cc-mini">— Train-Case, workspace vocabulary</span></span>
    <div class="cc-tags">
      <Chip size="sm" dismissible dismissLabel="remove tag Work-Based-Learning">Work-Based-Learning</Chip>
      <Chip size="sm" dismissible dismissLabel="remove tag Credential-Attainment">Credential-Attainment</Chip>
      <!-- The read-only tag from a source row, shown here beside its editable
           twin on purpose: they were two recipes (.cc-tag and .cc-tag-mini) that
           differed by 1px of type and a border, and they are now one component
           differing by a boolean. -->
      <Chip size="sm">Rural-Access</Chip>
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
    <CardRow density="compact" selected={Boolean(p.active)}>
      <span class="cc-dot"></span>
      <span class="cc-row-body">
        <SelectWrapperClickPrimary
          label={String(p.title ?? 'The degree is not the job')}
          selected={Boolean(p.active)}
        >
          <span class="cc-row-title">{String(p.title ?? 'The degree is not the job')}</span>
        </SelectWrapperClickPrimary>
        <span class="cc-row-meta">
          <span>Brookings</span>
          <Chip size="sm" tone="ok">fetched</Chip>
          <Chip size="sm">Work-Based-Learning</Chip>
        </span>
      </span>
    </CardRow>
    <CardRow density="compact">
      <span class="cc-dot err"></span>
      <span class="cc-row-body">
        <SelectWrapperClickPrimary label="Registered apprenticeship national guidelines">
          <span class="cc-row-title"
            >https://www.dol.gov/agencies/eta/apprenticeship/policy/registered-apprenticeship-national-guidelines</span
          >
        </SelectWrapperClickPrimary>
        <span class="cc-row-meta"><Chip size="sm">metadata-only</Chip></span>
      </span>
    </CardRow>
  </div>
{/snippet}

{#snippet headerBar(p: Record<string, unknown>)}
  <header class="cc-header">
    <span class="cc-brand">Corpora Curator</span>
    <Chip size="sm">reach-edu</Chip>
    <Chip size="sm">strategy</Chip>
    <Button variant="secondary" size="sm">‹ All corpora</Button>
    <span class="cc-strategy">{String(p.strategy ?? 'Turning Jobs Into Degrees')}</span>
    <Chip size="sm">4 sources</Chip>
    <span class="cc-spacer"></span>
    <Chip size="sm" tone={CONNECTION_TONE[(p.status ?? 'open') as keyof typeof CONNECTION_TONE]}
      >{String(p.status ?? 'open')}</Chip
    >
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
