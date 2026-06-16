<script lang="ts">
  // Pulse-dimension: additional emails. Each row commits its own
  // email on Enter; visual confirmation per row.

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
    <div class="pd-stack">
      {#each emails as _email, i (i)}
        <div class="pd-row">
          <input type="email" class:pd-flash={saved[i]} bind:value={emails[i]} oninput={() => saved[i] = false} onkeydown={(e) => onKey(i, e)} placeholder="other@example.com — Enter to save" />
          {#if saved[i]}<span class="pd-saved">✓</span>{/if}
          <button type="button" class="pd-icon-btn" onclick={() => remove(i)} title="Remove">×</button>
        </div>
      {/each}
    </div>
  {/if}
  <button type="button" class="pd-ghost-btn" onclick={add}>+ add email</button>
</section>
