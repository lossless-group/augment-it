<script lang="ts">
  // The component-library index, and the host that mounts one.
  //
  // Same generic loader contract as the shell's MountHost: a `./gallery` module
  // exposes a single mount function under any name, and the host takes whatever
  // callable it finds. Members keep distinct export names because Module
  // Federation exposes them by name; nothing here needs to know them.

  import { MEMBER_LIBRARIES, type MemberLibrary } from './members';

  let selected = $state<MemberLibrary | null>(null);
  let host = $state<HTMLDivElement | undefined>();
  let error = $state<string | null>(null);
  let loading = $state(false);

  // Keyed on the selected member so the previous library is torn down before
  // the next one mounts — two galleries in one document would each inject their
  // own copy of the member stylesheet and the specimens would cross-style.
  $effect(() => {
    const member = selected;
    const el = host;
    if (!member || !el) return;

    let handle: { destroy: () => void } | null = null;
    let cancelled = false;
    loading = true;
    error = null;

    void (async () => {
      try {
        const mod = await member.importGallery();
        const fn = (mod.default ?? Object.values(mod).find((v) => typeof v === 'function')) as
          | ((target: HTMLElement) => { destroy: () => void })
          | undefined;
        if (typeof fn !== 'function') throw new Error('remote exposes no gallery mount function');
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
    <button class="lib-back" onclick={() => (selected = null)}>‹ all libraries</button>
    <strong>{selected.name}</strong>
    <code>{selected.prefix}</code>
    <span class="lib-spacer"></span>
    <a class="lib-link" href={`${selected.origin}/#/gallery`} target="_blank" rel="noopener noreferrer">
      open on {selected.origin} ↗
    </a>
  </div>

  {#if loading}<p class="note">Loading {selected.name}'s library…</p>{/if}
  {#if error}
    <div class="lib-error">
      <strong>{selected.name}</strong> did not load — <code>{error}</code>
      <p class="note">
        The member has to be running for its library to mount. Start it with
        <code>pnpm --filter @augment-it/{selected.name} dev</code>, or open
        <a href={`${selected.origin}/#/gallery`} target="_blank" rel="noopener noreferrer">{selected.origin}</a>
        directly.
      </p>
    </div>
  {/if}

  <div class="lib-host" bind:this={host}></div>
{:else}
  <section aria-labelledby="libs-h">
    <h2 id="libs-h">Component libraries</h2>
    <p class="note">
      One library per member, published by the member. Each is a federation remote exposing
      <code>./gallery</code> alongside its <code>./mount</code> — the same bundle and the same
      stylesheet as the product surface, so a specimen here is the real component and not a copy
      that drifted. Every one is also reachable on the member's own origin, and every individual
      specimen has its own address there.
    </p>

    <div class="lib-cards">
      {#each MEMBER_LIBRARIES as member (member.id)}
        <div class="lib-card">
          <button class="lib-card-main" onclick={() => (selected = member)}>
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
      {/each}
    </div>

    <p class="note">
      Members without a library yet publish no <code>./gallery</code> expose. Adding one is a
      catalog file, a federation expose, and a hash branch in the standalone entry — the recipe is
      in <code>context-v/specs/Federated-Component-Libraries.md</code>.
    </p>
  </section>
{/if}
