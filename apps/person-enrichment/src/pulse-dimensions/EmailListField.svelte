<script lang="ts">
  // Pulse-dimension: additional emails. Each row commits its own
  // email on Enter; visual confirmation per row.

  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';

  let {
    emails = $bindable<string[]>([]),
    onAppend,
  }: {
    emails: string[];
    onAppend: (email: string) => Promise<void>;
  } = $props();

  let saved = $state<boolean[]>([]);

  function add()       { emails = [...emails, '']; saved = [...saved, false]; }
  function remove(i: number) {
    emails = emails.filter((_, idx) => idx !== i);
    saved  = saved.filter((_, idx) => idx !== i);
  }
  async function commit(i: number) {
    const email = (emails[i] ?? '').trim();
    if (!email) return;
    await onAppend(email);
    saved[i] = true;
    setTimeout(() => { saved[i] = false; }, 1200);
  }
  function onKey(i: number, e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(i); }
  }
</script>

<section class="pd-section">
  <h3 class="pd-title">Additional emails</h3>
  {#if emails.length > 0}
    <ListContainer gap="sm">
      {#each emails as _email, i (i)}
        <CardRow density="compact">
          <!-- rung 0: .pd-row carries the row's own flex tracks. CardRow is
               display:flex / align-items:flex-start at (0,2,0); this repeater
               needs align-items:stretch so the remove control matches the
               input's height, which a member class at (0,1,0) cannot reach. -->
          <span class="pd-row">
            <input type="email" class:pd-flash={saved[i]} bind:value={emails[i]} oninput={() => saved[i] = false} onkeydown={(e) => onKey(i, e)} placeholder="other@example.com — Enter to save" />
            {#if saved[i]}<span class="pd-saved">✓</span>{/if}
            <Button
              variant="secondary"
              size="icon"
              onclick={() => remove(i)}
              title="Remove this email row"
              aria-label="Remove email row {i + 1}"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4 L12 12 M12 4 L4 12" /></svg>
            </Button>
          </span>
        </CardRow>
      {/each}
    </ListContainer>
  {/if}
  <Button variant="outline" size="sm" onclick={add} class="pd-add">
    + add email
  </Button>
</section>
