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
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  // Spelled variant, per the decision doc: the file name says which axis this
  // picks (what you click), and `rg 'SelectWrapper--'` is the whole query.
  import SelectWrapperClickBody from '@augment-it/shared-ui/SelectWrapper--ClickBody.svelte';
  import ExternalLink from '@augment-it/shared-ui/ExternalLink.svelte';
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
      <ExternalLink
        class="lib-link"
        href={`${selected.lib.origin}/#/gallery`}
        label={`open on ${selected.lib.origin}`}
        noTruncate
      >
        open on {selected.lib.origin} <span aria-hidden="true">↗</span>
      </ExternalLink>
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
          <ExternalLink
            class="lib-error-link"
            href={`${selected.lib.origin}/#/gallery`}
            label={selected.lib.origin}
            noTruncate
          />
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

    <!-- rung 0: the OUTER margin is the page's, not the layout's — ListContainer
         owns the tracks, the stretch and the gap, and exposes no margin. -->
    <div class="lib-cards-slot">
      <ListContainer layout="grid" gap="sm" trackMin="280px">
        {#each MEMBER_LIBRARIES as member (member.id)}
          <!-- NO `direction` HERE. `layout="grid"` publishes `column` through
               context, which is the whole point of the container owning it: a
               tile is a CardRow in a narrow track, and the track is the
               container's fact, not the card's. -->
          <CardRow density="compact">
            <SelectWrapperClickBody
              label={`Open the ${member.name} library`}
              onselect={() => (selected = { kind: 'member', lib: member })}
            >
              <!-- The wrapper's button is inline-flex on the ROW axis, and this
                   card's label stacks — so one slot child owns the stacking.
                   Rung 0: placement, in the only place that knows the shape. -->
              <span class="lib-card-main">
                <span class="lib-card-head">
                  <strong>{member.name}</strong>
                  <code>.{member.prefix}-*</code>
                </span>
                <span class="lib-card-summary">{member.summary}</span>
              </span>
            </SelectWrapperClickBody>
            <!-- The sibling control the --ClickBody contract exists for. It carries
                 position:relative so it sits ABOVE the click overlay and stays
                 clickable; the component hit-tests for exactly this and console-
                 errors if it is buried. -->
            <ExternalLink
              class="lib-link"
              href={`${member.origin}/#/gallery`}
              label={member.origin}
              noTruncate
            >
              {member.origin} <span aria-hidden="true">↗</span>
            </ExternalLink>
          </CardRow>
        {/each}
      </ListContainer>
    </div>

    <p class="note">
      Members without a library yet publish no <code>./gallery</code> expose. Adding one is a
      catalog file, a federation expose, and a hash branch in the standalone entry — the recipe is
      in <code>context-v/specs/Federated-Component-Libraries.md</code>.
    </p>
  </section>
{/if}
