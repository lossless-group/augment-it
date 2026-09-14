<script lang="ts">
  // The component-library index, and the host that mounts one.
  //
  // Same generic loader contract as the shell's MountHost: a `./gallery` module
  // exposes a single mount function under any name, and the host takes whatever
  // callable it finds. Members keep distinct export names because Module
  // Federation exposes them by name; nothing here needs to know them.
  //
  // TWO KINDS OF LIBRARY, RENDERED AS TWO KINDS. The federal library
  // (packages/shared-ui) reads first, full width, with the loader contract it
  // actually has — a workspace import that cannot fail with "the member is not
  // running". The members follow, in a grid, each a federation remote on its own
  // origin. See ./members.ts for why the asymmetry is in the data rather than
  // flattened into one array with a discriminator.

  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import { FEDERAL_LIBRARY, MEMBER_LIBRARIES, type FederalLibrary, type MemberLibrary } from './members';

  type Selection =
    | { kind: 'federal'; lib: FederalLibrary }
    | { kind: 'member'; lib: MemberLibrary };

  let selected = $state<Selection | null>(null);
  let host = $state<HTMLDivElement | undefined>();
  let error = $state<string | null>(null);
  let loading = $state(false);

  // Keyed on the selected library so the previous one is torn down before the
  // next one mounts — two galleries in one document would each inject their own
  // copy of a stylesheet and the specimens would cross-style.
  $effect(() => {
    const current = selected;
    const el = host;
    if (!current || !el) return;

    let handle: { destroy: () => void } | null = null;
    let cancelled = false;
    loading = true;
    error = null;

    void (async () => {
      try {
        const mod = await current.lib.importGallery();
        const fn = (mod.default ?? Object.values(mod).find((v) => typeof v === 'function')) as
          | ((target: HTMLElement) => { destroy: () => void })
          | undefined;
        if (typeof fn !== 'function') throw new Error('module exposes no gallery mount function');
        if (cancelled) return;
        handle = fn(el);
      } catch (e: unknown) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        loading = false;
      }
    })();

    return () => {
      cancelled = true;
      handle?.destroy();
    };
  });
</script>

{#if selected}
  <div class="lib-bar">
    <!-- The '‹' this carried was a glyph doing an icon's job. On the page that
         renders the design system that is the worst place for one, so it is an
         <svg> now and Button sizes it from --icon-sm. -->
    <Button size="sm" onclick={() => (selected = null)}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 3L5 8l5 5" />
      </svg>
      all libraries
    </Button>
    <strong>{selected.lib.name}</strong>
    {#if selected.kind === 'federal'}
      <Chip tone="accent" size="sm">federal</Chip>
      <code>.{selected.lib.prefix}-*</code>
    {:else}
      <code>{selected.lib.prefix}</code>
    {/if}
    <span class="lib-spacer"></span>
    {#if selected.kind === 'federal'}
      <code>{selected.lib.source}</code>
    {:else}
      <a class="lib-link" href={`${selected.lib.origin}/#/gallery`} target="_blank" rel="noopener noreferrer">
        open on {selected.lib.origin} ↗
      </a>
    {/if}
  </div>

  {#if loading}<p class="note">Loading {selected.lib.name}'s library…</p>{/if}
  {#if error}
    <div class="lib-error">
      <strong>{selected.lib.name}</strong> did not load — <code>{error}</code>
      {#if selected.kind === 'member'}
        <p class="note">
          The member has to be running for its library to mount. Start it with
          <code>pnpm --filter @augment-it/{selected.lib.name} dev</code>, or open
          <a href={`${selected.lib.origin}/#/gallery`} target="_blank" rel="noopener noreferrer">{selected.lib.origin}</a>
          directly.
        </p>
      {:else}
        <p class="note">
          Nothing has to be running for this one — it is a workspace import, not a
          remote. A failure here is a build problem in
          <code>{selected.lib.source}</code>, not a member that is down.
        </p>
      {/if}
    </div>
  {/if}

  <div class="lib-host" bind:this={host}></div>
{:else}
  <section aria-labelledby="libs-h">
    <h2 id="libs-h">Component libraries</h2>

    <!-- The federal layer, first and on its own. Not a card in the members'
         grid: it is what every member in that grid consumes. -->
    <div class="lib-federal">
      <button class="lib-federal-main" onclick={() => (selected = { kind: 'federal', lib: FEDERAL_LIBRARY })}>
        <span class="lib-federal-head">
          <Chip tone="accent" size="sm">federal</Chip>
          <strong>{FEDERAL_LIBRARY.name}</strong>
          <code>.{FEDERAL_LIBRARY.prefix}-*</code>
        </span>
        <span class="lib-federal-summary">{FEDERAL_LIBRARY.summary}</span>
      </button>
      <p class="note lib-federal-note">
        Every library below is a member's — what that member is made of. This one
        is the platform's: the primitives the members are made of. It is a
        workspace package rather than a federation remote, which is why it needs
        nothing running to mount and has no origin of its own —
        <code>{FEDERAL_LIBRARY.source}</code> is served from here, and every
        specimen in it has its own address on this origin.
      </p>
    </div>

    <h3 class="lib-members-h">Member libraries</h3>
    <p class="note">
      One library per member, published by the member. Each is a federation remote exposing
      <code>./gallery</code> alongside its <code>./mount</code> — the same bundle and the same
      stylesheet as the product surface, so a specimen here is the real component and not a copy
      that drifted. Every one is also reachable on the member's own origin, and every individual
      specimen has its own address there.
    </p>

    <div class="lib-cards">
      {#each MEMBER_LIBRARIES as member (member.id)}
        <CardRow density="compact">
          <!-- CardRow is a one-direction flex and this card stacks, so the
               member owns the internal arrangement in a single slot child.
               That is rung 0 — placement, not a deviation. -->
          <div class="lib-card-body">
            <!-- NOT <SelectWrapper--ClickBody>, and it was measured rather than
                 assumed. That component renders its <button> as
                 `display: contents`, and a display:contents button generates no
                 box in Chromium: getBoundingClientRect() is 0x0 and .focus() is
                 a no-op even though tabIndex is 0. Driven with real Tab presses,
                 the card's primary action disappeared from the tab order
                 entirely — a WCAG 2.1.1 (Keyboard, Level A) failure, strictly
                 worse than this raw button. The mouse half works perfectly
                 (the ::after overlay covers the card and the sibling link stays
                 on top), so the defect is invisible to anyone who only clicks.
                 Raised against packages/shared-ui, not worked around here. -->
            <button class="lib-card-main" onclick={() => (selected = { kind: 'member', lib: member })}>
              <span class="lib-card-head">
                <strong>{member.name}</strong>
                <code>.{member.prefix}-*</code>
              </span>
              <span class="lib-card-summary">{member.summary}</span>
            </button>
            <a class="lib-link" href={`${member.origin}/#/gallery`} target="_blank" rel="noopener noreferrer">
              {member.origin} ↗
            </a>
          </div>
        </CardRow>
      {/each}
    </div>

    <p class="note">
      Members without a library yet publish no <code>./gallery</code> expose. Adding one is a
      catalog file, a federation expose, and a hash branch in the standalone entry — the recipe is
      in <code>context-v/specs/Federated-Component-Libraries.md</code>.
    </p>
  </section>
{/if}
