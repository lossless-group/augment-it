<script lang="ts">
  // The relevance brief — the operator's standing intent, per workspace
  // client: the topical scope ("what's relevant") and the people policy
  // ("who from a team page is worth ingesting"). Every didi crawl loads it
  // server-side; this panel is the view/edit door. State-Inspector ethos:
  // what the agent believes should be visible and editable.
  // Per context-v/specs/Augment-From-DB-Flow.md §v1.2.

  import { fetchBrief, saveBrief } from './lib/org-client';

  let { client }: { client: string } = $props();

  let open = $state(false);
  let text = $state('');
  let loadedFor = $state<string | null>(null);
  let updatedAt = $state<string | null>(null);
  let busy = $state(false);
  let saved = $state(false);
  let error = $state<string | null>(null);

  async function load(c: string) {
    busy = true;
    error = null;
    try {
      const r = await fetchBrief(c);
      text = r.brief ?? '';
      updatedAt = r.updated_at;
      loadedFor = c;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    if (open && loadedFor !== client) void load(client);
  });

  async function save() {
    busy = true;
    error = null;
    try {
      await saveBrief(client, text);
      saved = true;
      setTimeout(() => (saved = false), 2000);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<div class="ow-brief">
  <button type="button" class="ow-add-go" onclick={() => (open = !open)}>
    {open ? '× Relevance brief' : '📋 Relevance brief'}
  </button>
  {#if open}
    <div class="ow-brief-panel">
      <p class="ow-brief-hint">
        didi loads this into every crawl for <strong>{client}</strong> — topical scope (what's
        relevant) and the people policy (who from a team page is worth ingesting).
        {#if updatedAt}<span class="ow-brief-date">last saved {updatedAt.slice(0, 10)}</span>{/if}
      </p>
      <textarea
        class="ow-brief-text"
        rows="6"
        placeholder="e.g. Relevant: US higher-education and workforce-development funders, their education-adjacent publication streams. People policy: all major leadership, plus all team members covering Education & Workforce Development and related strategies/topics."
        bind:value={text}
        disabled={busy}
      ></textarea>
      <span class="ow-addperson-actions">
        {#if saved}<span class="ow-added">saved ✓</span>{/if}
        <button type="button" class="ow-add-go" onclick={save} disabled={busy}>
          {busy ? '…' : 'Save brief'}
        </button>
      </span>
      {#if error}<div class="ow-error">{error}</div>{/if}
    </div>
  {/if}
</div>
