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
  // The CONNECTION half of that tone catalog has since left it. `chips` carried
  // a second row of all six connection states, tinted from a CONNECTION_TONE map
  // in this member's types.ts; that map is deleted and the row is the
  // `statusIndicator` specimen. The move is the second time this file has had to
  // record a boundary shifting INWARD past something that was already correct:
  // the tone map was right, and it still had to go, because the word it was
  // paired with was the raw enum and no local map can fix that.
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
  // that organ shipped as <CardRow> + <SelectWrapper--ClickBody>. The `source-row`
  // specimen below is now a usage catalog of those two components, which is why
  // it still exists: the specimen that documented the holdout should be the one
  // that documents its resolution. The LAST raw control — the suggestion option —
  // is raw no longer: `.cc-tag-suggest button` wanted "a combobox listbox
  // option, which nobody has built", and that organ shipped as
  // <SearchBox--LiveFilter>. Nothing in this member is hand-rolled now.
  //
  // So they get catalogued as first-class entries, as markup rather than as
  // components. Each snippet takes the resolved props object, so the gallery's
  // controls drive them the same way they drive a real component.
  //
  // Exported from `<script module>`: legal because none of these reference
  // instance state — they read only their own parameter.
  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import ExternalLink from '@augment-it/shared-ui/ExternalLink.svelte';
  import SearchBoxLiveFilter from '@augment-it/shared-ui/SearchBox--LiveFilter.svelte';
  import SelectWrapperClickBody from '@augment-it/shared-ui/SelectWrapper--ClickBody.svelte';
  import StatusIndicator from '@augment-it/shared-ui/StatusIndicator.svelte';
  import { type ConnStatus } from '../types';

  // Every connection state, in the order the divergence is easiest to read.
  const CONN_STATES: ConnStatus[] = ['open', 'connecting', 'auth_required', 'closed', 'error', 'idle'];

  // Types a query into a freshly-mounted SearchBox so the Suggesting fixture
  // shows the real popup. Drives the component through the same `input` event a
  // keystroke would, so nothing here depends on its internals beyond "it renders
  // one text input".
  function seedQuery(node: HTMLElement, q: string) {
    if (!q) return;
    const el = node.querySelector('input');
    if (!el) return;
    el.value = q;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // The specimen's vocabulary. A real one comes from the workspace summary.
  const SPECIMEN_TAGS = [
    { id: 'Employer-Partnerships', label: 'Employer-Partnerships' },
    { id: 'Employment-Outcomes', label: 'Employment-Outcomes' },
    { id: 'Rural-Access', label: 'Rural-Access' },
  ];

  export {
    buttons,
    card,
    fields,
    chips,
    statusIndicator,
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
  <!-- One treatment, and after the StatusIndicator adoption only TWO tones are
       left in it: neutral and ok. Every tone here is picked by MEANING. The
       labels are facts — a workspace, a corpus type, a count, a source's
       resting status — so they are neutral even though .cc-pill drew them with
       a border and .cc-status-chip drew them without one. `fetched` is ok
       because it is the affirmative RESULT of an action.

       The second row is gone from here, and its absence is the specimen. It
       held all six connection states as Chips, and it existed to prove the old
       .cc-conn recipe's three-into-one-grey collapse had been fixed. A Chip is
       a label that is not a control and carries no vocabulary of its own; a
       connection state is a fixed six-member enum with a right word for each.
       That row is the StatusIndicator specimen now — a component with the
       words, not a tone map with the raw enum. Three of this member's six tones
       (info, warn, error) left WITH it: nothing else in the member means
       "transient", "actionable" or "failed" as a label. -->
  <div class="cc-actions">
    <Chip size="sm">reach-edu</Chip>
    <Chip size="sm">strategy</Chip>
    <Chip size="sm">{String(p.count ?? 4)} sources</Chip>
    <Chip size="sm">metadata-only</Chip>
    <Chip size="sm" tone="ok">fetched</Chip>
  </div>
{/snippet}

{#snippet statusIndicator(p: Record<string, unknown>)}
  <!-- All six connection states, in the order the old divergence was easiest to
       read. This is the row that used to be the second half of the `chips`
       specimen, and moving it here is the whole point of the entry: it was six
       Chips whose tone came from a member-local map and whose LABEL was the raw
       TypeScript union member, and it is now one federal component that owns
       both halves.

       Read the words, not the colours. `auth_required` → "sign-in required" is
       the one that mattered: warn rather than error, because it is a gate the
       operator can walk through. And `closed` / `error` share a tone on purpose
       — they are both failures — so the WORD is the only thing telling them
       apart, which is why the component refuses to render a dot without one. -->
  <div class="cc-actions">
    {#each CONN_STATES as s}
      <StatusIndicator state={s} />
    {/each}
  </div>
  <!-- The same six with a subject, as the header spends them. `of=` prefixes
       rather than replaces, so the state word survives the prefix intact. -->
  <div class="cc-actions">
    {#each CONN_STATES as s}
      <StatusIndicator state={s} of={String(p.of ?? 'workspace')} />
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
    <!-- The specimen tracks the real surface: the raw input plus the
         `.cc-tag-suggest` stack of <button>s is gone from TagBar and
         CorpusPicker, so it is gone from here. The `suggesting` fixture opens
         the component's OWN popup the way a user does — by typing — rather than
         drawing an imitation of it. Both variants keep their query private, so
         `seedQuery` is the specimen's way in and is deliberately not a pattern
         for a real surface to copy. -->
    {#key p.suggesting}
      <div use:seedQuery={p.suggesting ? 'Emp' : ''}>
        <SearchBoxLiveFilter options={SPECIMEN_TAGS} label="add a tag" placeholder="add a tag…" />
      </div>
    {/key}
  </div>
{/snippet}

{#snippet sourceRow(p: Record<string, unknown>)}
  <!-- The specimen tracks the real surface: `.cc-list` is deleted from app.css
       and SourceList now renders a ListContainer, so the specimen does too.
       `as="li"` on the rows below, because the layout renders a <ul>. -->
  <ListContainer as="ul" gap="2xs" label="Sources (specimen)">
    <CardRow as="li" density="compact" selected={Boolean(p.active)}>
      <SelectWrapperClickBody
        label={String(p.title ?? 'The degree is not the job')}
        selected={Boolean(p.active)}
      >
        <span class="cc-dot"></span>
        <span class="cc-row-body">
          <span class="cc-row-title">{String(p.title ?? 'The degree is not the job')}</span>
          <span class="cc-row-meta">
            <span>Brookings</span>
            <Chip size="sm" tone="ok">fetched</Chip>
            <Chip size="sm">Work-Based-Learning</Chip>
          </span>
        </span>
      </SelectWrapperClickBody>
    </CardRow>
    <CardRow as="li" density="compact">
      <SelectWrapperClickBody label="Registered apprenticeship national guidelines">
        <span class="cc-dot err"></span>
        <span class="cc-row-body">
          <span class="cc-row-title"
            >https://www.dol.gov/agencies/eta/apprenticeship/policy/registered-apprenticeship-national-guidelines</span
          >
          <span class="cc-row-meta"><Chip size="sm">metadata-only</Chip></span>
        </span>
      </SelectWrapperClickBody>
    </CardRow>
  </ListContainer>
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
    <!-- The real header's right-hand indicator, spent exactly as App.svelte
         spends it. The `status` control now offers all SIX states rather than
         the four it used to: idle and auth_required were missing from the
         specimen for the same reason the workspace slot got them wrong — a
         member drawing its own status vocabulary tends to pin only the states
         it has personally watched happen. -->
    <StatusIndicator state={(p.status ?? 'open') as ConnStatus} of="workspace" />
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
    <ExternalLink href="https://example.org/reports/apprenticeship-at-scale-2026.pdf" />
  </div>
{/snippet}

{#snippet emptyState(p: Record<string, unknown>)}
  <p class="cc-muted cc-pad cc-mini">{String(p.message ?? 'No sources yet. Paste a URL to add one.')}</p>
{/snippet}
