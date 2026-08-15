<script lang="ts">
  // One fixture, rendered once, in isolation.
  //
  // Three things make this a frame rather than a div:
  //
  //  1. It wraps the specimen in the member's ROOT CLASS. Every member's CSS is
  //     written as `.cc-app .cc-card { … }` (contract F3), so a component
  //     rendered without that ancestor is unstyled — the single most common way
  //     a hand-rolled gallery lies about what it is showing.
  //  2. It carries its own `data-mode`. theme.css scopes the mode blocks to
  //     `[data-mode='…']` rather than `:root[data-mode='…']`, which means an
  //     ordinary div re-points the whole token vocabulary for its subtree. That
  //     is what makes three-modes-side-by-side possible at all.
  //  3. It runs the fixture's setup at INIT — before children render — and its
  //     teardown on destroy. The parent keys on the fixture id, so switching
  //     fixture destroys and rebuilds this component, and the seeding always
  //     happens in the right order.

  import { onDestroy } from 'svelte';
  import type { Entry, Fixture } from './types';

  let {
    entry,
    fixture,
    props,
    rootClass,
    mode,
    surface,
    width,
    onroot,
  }: {
    entry: Entry;
    fixture: Fixture;
    props: Record<string, unknown>;
    rootClass: string;
    /** `null` inherits the document's mode. */
    mode: 'light' | 'dark' | 'vibrant' | null;
    surface: string;
    width: number | null;
    /** Handed the specimen's root element once it exists, for auditing. */
    onroot?: (el: HTMLElement) => void;
  } = $props();

  // Init-time, deliberately: this runs before the {#if} below renders the
  // component, which is the only ordering under which seeding a singleton the
  // component reads at first render actually works.
  // svelte-ignore state_referenced_locally — capturing the initial fixture is
  // the point. The parent renders this inside a {#key} on the fixture id, so a
  // different fixture is a different instance, and setup/teardown pair up.
  fixture.setup?.();
  onDestroy(() => fixture.teardown?.());

  let body = $state<HTMLElement | undefined>();

  $effect(() => {
    if (body) onroot?.(body);
  });

  const frameWidth = $derived(fixture.width ?? width);
</script>

<div class="agx-frame" data-mode={mode ?? undefined} style:width={frameWidth ? `${frameWidth}px` : '100%'}>
  {#if mode}
    <span class="agx-frame-tag">{mode}</span>
  {/if}
  <div
    class="agx-frame-stage"
    style:background={`var(${surface})`}
    style:min-height={fixture.fill ? '460px' : 'auto'}
  >
    <!--
      Two inline overrides, both deliberate, both about the root class:

      `height` — most members' root class sets `height: 100vh` (it is the app
      shell). A chip rendered inside a 100vh box is not a specimen, it is a
      scroll. `fill` fixtures opt back in.

      `background: transparent` — the root class also paints
      `background: var(--color-background)`, which would cover the frame's
      chosen surface and make the surface selector decorative. Neutralising it
      is what lets you ask the real question: does this component still read on
      --color-surface-raised?
    -->
    <div
      bind:this={body}
      class="agx-frame-body {rootClass}"
      style:height={fixture.fill ? '100%' : 'auto'}
      style:background="transparent"
    >
      {#if entry.kind === 'component' && entry.component}
        {@const Specimen = entry.component}
        <Specimen {...props} />
      {:else if entry.snippet}
        {@render entry.snippet(props)}
      {:else}
        <p class="agx-frame-missing">
          Entry <code>{entry.id}</code> declares kind <code>{entry.kind}</code> but supplies no
          {entry.kind === 'component' ? 'component' : 'snippet'}.
        </p>
      {/if}
    </div>
  </div>
</div>
