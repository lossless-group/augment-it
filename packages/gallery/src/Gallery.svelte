<script lang="ts">
  // The gallery chrome. Renders any Catalog; knows nothing about any member.
  //
  // Everything the chrome paints is built from Tier-2 tokens and prefixed
  // `agx-`, for the same reason the swatch page is: a documentation surface
  // that smuggled in colours of its own would make a broken token look fine.
  // The chrome is deliberately quiet — what you are judging is the specimen.

  import { onMount } from 'svelte';
  import { getMode, onModeChange, type Mode } from '@augment-it/theme/mode-switcher';
  import SpecimenFrame from './SpecimenFrame.svelte';
  import ControlsPanel from './ControlsPanel.svelte';
  import AuditPanel from './AuditPanel.svelte';
  import { auditSettled, type AuditReport } from './audit';
  import {
    DEFAULT_ROUTE,
    isolatedUrl,
    onHashChange,
    readRoute,
    serializeRoute,
    writeRoute,
    type ModeView,
    type Route,
  } from './router';
  import type { Catalog, Entry, Fixture } from './types';

  let {
    catalog,
    /**
     * Own the document hash. True standalone on the member's own origin; false
     * when federated into the shell, whose hash is not this remote's to spend.
     */
    hashRouting = false,
  }: { catalog: Catalog; hashRouting?: boolean } = $props();

  const SURFACES = [
    '--color-background',
    '--color-surface',
    '--color-surface-2',
    '--color-surface-raised',
    '--color-bg-elevated',
  ];
  // Option values are STRINGS. `<select value={…}>` matches an option by
  // identity, so a numeric option value against a stringified route value
  // silently selects nothing — the control renders blank while the width is in
  // fact applied. Keep both sides strings and convert at the boundary.
  const WIDTHS: Array<{ label: string; value: string }> = [
    { label: 'fluid', value: '' },
    { label: '320', value: '320' },
    { label: '420', value: '420' },
    { label: '640', value: '640' },
    { label: '960', value: '960' },
  ];

  const entries = $derived(catalog.sections.flatMap((s) => s.entries));

  // svelte-ignore state_referenced_locally — reading hashRouting once, at init,
  // is the intent: it decides where the route COMES FROM, and it never changes
  // for the life of a mount (federated mounts pass false, standalone true).
  let route = $state<Route>(hashRouting ? readRoute() : { ...DEFAULT_ROUTE });
  let filter = $state('');
  let tab = $state<'controls' | 'usage' | 'audit'>('audit');
  let docMode = $state<Mode>('dark');
  let copied = $state(false);

  const entry = $derived<Entry | null>(entries.find((e) => e.id === route.entry) ?? null);
  const fixture = $derived<Fixture | null>(
    entry ? (entry.fixtures.find((f) => f.id === route.fixture) ?? entry.fixtures[0] ?? null) : null,
  );

  // Control overrides live per entry+fixture, so flipping between fixtures does
  // not silently carry a knob you set on a different state.
  let overrides = $state<Record<string, Record<string, unknown>>>({});
  const overrideKey = $derived(entry && fixture ? `${entry.id}:${fixture.id}` : '');

  const resolvedProps = $derived.by<Record<string, unknown>>(() => {
    if (!entry || !fixture) return {};
    const fromControls = Object.fromEntries(
      Object.entries(entry.controls ?? {}).map(([k, spec]) => [k, spec.value]),
    );
    return { ...fromControls, ...(fixture.props ?? {}), ...(overrides[overrideKey] ?? {}) };
  });

  const dirty = $derived(Object.keys(overrides[overrideKey] ?? {}).length > 0);

  const shownModes = $derived<Array<Mode | null>>(
    route.modes === 'all' ? ['dark', 'light', 'vibrant'] : route.modes === 'current' ? [null] : [route.modes as Mode],
  );

  const visibleSections = $derived(
    catalog.sections
      .map((s) => ({
        ...s,
        entries: s.entries.filter(
          (e) =>
            !filter.trim() ||
            `${e.name} ${e.id} ${e.summary} ${e.source}`.toLowerCase().includes(filter.trim().toLowerCase()),
        ),
      }))
      .filter((s) => s.entries.length > 0),
  );

  /* -------------------------------------------------------------- routing */

  function go(patch: Partial<Route>): void {
    route = { ...route, ...patch };
    if (hashRouting) writeRoute(route);
  }

  function open(e: Entry, f?: Fixture): void {
    go({ entry: e.id, fixture: (f ?? e.fixtures[0])?.id ?? null });
  }

  onMount(() => {
    docMode = getMode();
    const offMode = onModeChange((m) => {
      docMode = m;
      remeasure();
    });
    const offHash = hashRouting
      ? onHashChange(() => {
          route = readRoute();
        })
      : () => {};
    return () => {
      offMode();
      offHash();
    };
  });

  /* --------------------------------------------------------------- audit */

  let primaryRoot = $state<HTMLElement | undefined>();
  let report = $state<AuditReport | null>(null);

  // Everything that changes what is on screen. Reading these inside the effect
  // is what makes the audit re-run — including `docMode`, because a specimen
  // showing 'current' repaints when the shell switches mode and a stale report
  // would then be grading colours that are no longer there.
  const measureKey = $derived(
    [route.entry, route.fixture, route.modes, route.surface, route.width, docMode, JSON.stringify(resolvedProps)].join(
      '|',
    ),
  );

  let frame = 0;
  function remeasure(): void {
    cancelAnimationFrame(frame);
    // Two frames: one for the DOM to commit, one for the cascade to settle.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (!primaryRoot || !primaryRoot.isConnected) return;
        report = auditSettled(primaryRoot, {
          prefix: catalog.prefix,
          rootClass: catalog.rootClass,
          exemptClasses: catalog.exemptClasses,
        });
      });
    });
  }

  $effect(() => {
    void measureKey;
    void primaryRoot;
    report = null;
    remeasure();
  });

  /* ---------------------------------------------------------------- links */

  // Standalone, the member IS this origin — including when "this origin" is a
  // LAN IP or a non-default port. Using location.origin there is what makes an
  // isolate link openable on the phone you are holding rather than on the
  // laptop that generated it. Federated, this document is the SHELL, so the
  // catalog's declared origin is the only correct answer.
  const linkOrigin = $derived(hashRouting ? location.origin : catalog.origin);

  const isoHref = $derived(
    entry && fixture ? isolatedUrl(linkOrigin, { ...route, entry: entry.id, fixture: fixture.id }) : '',
  );

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(isoHref);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      // Clipboard is permission-gated and unavailable on some plain-http
      // origins — which includes the LAN IP this link is most useful on.
      console.info('[gallery] isolated link:', isoHref);
    }
  }
</script>

{#if route.iso && entry && fixture}
  <!-- Isolation view. No chrome at all: this URL exists to be screenshotted,
       iframed, opened on a phone against the LAN address, or handed to someone
       who is not running the shell. -->
  <div class="agx-iso">
    {#each shownModes as m, i (m ?? 'current')}
      <SpecimenFrame
        {entry}
        {fixture}
        props={resolvedProps}
        rootClass={catalog.rootClass}
        mode={m}
        surface={route.surface}
        width={route.width}
        onroot={i === 0 ? (el) => (primaryRoot = el) : undefined}
      />
    {/each}
  </div>
{:else}
  <div class="agx">
    <aside class="agx-nav">
      <header class="agx-nav-head">
        <h1>{catalog.member}</h1>
        <p class="agx-nav-sub">component library</p>
        <dl class="agx-meta">
          <dt>prefix</dt>
          <dd><code>{catalog.prefix}</code></dd>
          <dt>root</dt>
          <dd><code>.{catalog.rootClass}</code></dd>
          <dt>origin</dt>
          <dd><code>{catalog.origin}</code></dd>
        </dl>
        <input class="agx-filter" placeholder="filter…" bind:value={filter} aria-label="Filter entries" />
      </header>

      <nav class="agx-nav-list">
        <button class="agx-nav-item" class:active={!entry} onclick={() => go({ entry: null, fixture: null })}>
          Overview
        </button>
        {#each visibleSections as section (section.id)}
          <p class="agx-nav-section">{section.title}</p>
          {#each section.entries as e (e.id)}
            <button class="agx-nav-item" class:active={entry?.id === e.id} onclick={() => open(e)}>
              <span>{e.name}</span>
              <span class="agx-nav-badges">
                {#if e.status && e.status !== 'stable'}<span class="agx-badge" data-status={e.status}>{e.status}</span>{/if}
                <span class="agx-count">{e.fixtures.length}</span>
              </span>
            </button>
          {/each}
        {/each}
      </nav>
    </aside>

    <main class="agx-stage">
      {#if !entry}
        <!-- Overview: the member's own index, and the one place the gallery
             states what it is for. -->
        <header class="agx-head">
          <h2>{catalog.member} — component library</h2>
          {#if catalog.blurb}<p class="agx-lede">{catalog.blurb}</p>{/if}
          <p class="agx-lede">
            {entries.length} entries · {entries.reduce((n, e) => n + e.fixtures.length, 0)} fixtures. Every
            specimen renders through the member's real stylesheet under
            <code>.{catalog.rootClass}</code>, in whichever of the three modes you pick, and every one
            has its own address on <code>{catalog.origin}</code>.
          </p>
          <p class="agx-lede">
            {#if catalog.doc}<a href={`#${catalog.doc}`} onclick={(e) => e.preventDefault()}><code>{catalog.doc}</code></a>{/if}
            {#if catalog.spec}· <code>{catalog.spec}</code>{/if}
          </p>
        </header>

        {#each catalog.sections as section (section.id)}
          <section class="agx-overview-section">
            <h3>{section.title}</h3>
            {#if section.blurb}<p class="agx-lede">{section.blurb}</p>{/if}
            <div class="agx-cards">
              {#each section.entries as e (e.id)}
                <button class="agx-card" onclick={() => open(e)}>
                  <span class="agx-card-head">
                    <strong>{e.name}</strong>
                    <span class="agx-badge" data-kind={e.kind}>{e.kind}</span>
                  </span>
                  <span class="agx-card-summary">{e.summary}</span>
                  <code class="agx-card-source">{e.source}</code>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      {:else}
        <header class="agx-head">
          <div class="agx-head-row">
            <h2>{entry.name}</h2>
            <span class="agx-badge" data-kind={entry.kind}>{entry.kind}</span>
            {#if entry.status}<span class="agx-badge" data-status={entry.status}>{entry.status}</span>{/if}
            <code class="agx-source">{entry.source}</code>
          </div>
          <p class="agx-lede">{entry.summary}</p>
          {#if entry.deviation}
            <p class="agx-deviation"><strong>Declared deviation (F9)</strong> — {entry.deviation}</p>
          {/if}
        </header>

        <div class="agx-toolbar">
          <div class="agx-fixtures" role="tablist" aria-label="Fixtures">
            {#each entry.fixtures as f (f.id)}
              <button
                role="tab"
                aria-selected={fixture?.id === f.id}
                class:active={fixture?.id === f.id}
                onclick={() => go({ fixture: f.id })}
              >{f.name}</button>
            {/each}
          </div>

          <span class="agx-spacer"></span>

          <label class="agx-select">
            mode
            <select value={route.modes} onchange={(e) => go({ modes: e.currentTarget.value as ModeView })}>
              <option value="current">current ({docMode})</option>
              <option value="all">all three</option>
              <option value="dark">dark</option>
              <option value="light">light</option>
              <option value="vibrant">vibrant</option>
            </select>
          </label>

          <label class="agx-select">
            surface
            <select value={route.surface} onchange={(e) => go({ surface: e.currentTarget.value })}>
              {#each SURFACES as s (s)}
                <option value={s}>{s.replace('--color-', '')}</option>
              {/each}
            </select>
          </label>

          <label class="agx-select">
            width
            <select
              value={String(route.width ?? '')}
              onchange={(e) => go({ width: e.currentTarget.value ? Number(e.currentTarget.value) : null })}
            >
              {#each WIDTHS as w (w.label)}
                <option value={w.value}>{w.label}</option>
              {/each}
            </select>
          </label>

          <a class="agx-btn" href={isoHref} target="_blank" rel="noopener noreferrer">isolate ↗</a>
          <button class="agx-btn" onclick={() => void copyLink()}>{copied ? 'copied' : 'copy link'}</button>
        </div>

        {#if fixture?.note}
          <p class="agx-fixture-note">{fixture.note}</p>
        {/if}

        {#if fixture}
          <!-- `fluid` only when no explicit width: side-by-side modes share the
               row equally by default, but a width the reviewer chose is the
               whole question being asked and must not be stretched away. -->
          <div class="agx-frames" class:multi={shownModes.length > 1} class:fluid={!route.width}>
            {#key `${entry.id}:${fixture.id}`}
              {#each shownModes as m, i (m ?? 'current')}
                <SpecimenFrame
                  {entry}
                  {fixture}
                  props={resolvedProps}
                  rootClass={catalog.rootClass}
                  mode={m}
                  surface={route.surface}
                  width={route.width}
                  onroot={i === 0 ? (el) => (primaryRoot = el) : undefined}
                />
              {/each}
            {/key}
          </div>
        {/if}

        <div class="agx-tabs" role="tablist" aria-label="Specimen detail">
          {#each ['audit', 'controls', 'usage'] as const as t (t)}
            <button role="tab" aria-selected={tab === t} class:active={tab === t} onclick={() => (tab = t)}>{t}</button>
          {/each}
        </div>

        <div class="agx-panel">
          {#if tab === 'audit'}
            <AuditPanel {report} tokens={[...(entry.tokens ?? [])]} />
          {:else if tab === 'controls'}
            <ControlsPanel
              controls={entry.controls ?? {}}
              values={resolvedProps}
              dirty={dirty}
              onchange={(k, v) => (overrides = { ...overrides, [overrideKey]: { ...(overrides[overrideKey] ?? {}), [k]: v } })}
              onreset={() => {
                const next = { ...overrides };
                delete next[overrideKey];
                overrides = next;
              }}
            />
          {:else}
            <div class="agx-usage">
              {#if entry.usage}
                <h4>Usage</h4>
                <pre>{entry.usage}</pre>
              {/if}
              {#if entry.a11y}
                <h4>Accessibility contract</h4>
                <p class="agx-lede">{entry.a11y}</p>
              {/if}
              <h4>Props for this fixture</h4>
              <pre>{JSON.stringify(resolvedProps, null, 2)}</pre>
              {#if fixture?.setup}
                <h4>Ambient dependency</h4>
                <p class="agx-lede">
                  This fixture runs a <code>setup()</code> — the component reads state it does not
                  receive as a prop. It is isolatable, but not by props alone.
                </p>
              {/if}
              <h4>Deep link</h4>
              <pre>{catalog.origin}/{serializeRoute({ ...route, iso: true })}</pre>
            </div>
          {/if}
        </div>
      {/if}
    </main>
  </div>
{/if}
