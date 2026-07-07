<script lang="ts">
  import type { OrgCandidate } from '../lib/types';

  let {
    candidates,
    busy,
    onMatch,
  }: {
    candidates: OrgCandidate[];
    busy: boolean;
    onMatch: (c: OrgCandidate) => void;
  } = $props();
</script>

{#if candidates.length === 0}
  <p class="pdr-muted pdr-no-candidates">
    No canonical org matched by name. Create a new org, skip, or search manually.
  </p>
{:else}
  <ul class="pdr-candidates">
    {#each candidates as c (c.slug)}
      <li class="pdr-candidate">
        <div class="pdr-candidate-head">
          <div class="pdr-candidate-id">
            <span class="pdr-candidate-name">{c.complete_name || c.slug}</span>
            <code class="pdr-candidate-slug">{c.slug}</code>
          </div>
          <div class="pdr-candidate-score">
            <span class="pdr-score" data-tier={c.score >= 90 ? 'high' : c.score >= 60 ? 'mid' : 'low'}>{c.score}</span>
            {#each c.match_reason as r (r)}<span class="pdr-reason">{r}</span>{/each}
          </div>
        </div>
        <div class="pdr-candidate-actions">
          <button type="button" class="pdr-btn pdr-btn-primary" disabled={busy} onclick={() => onMatch(c)}>
            match this org
          </button>
        </div>
      </li>
    {/each}
  </ul>
{/if}
