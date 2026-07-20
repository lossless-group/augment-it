<script lang="ts">
  import type { PersonCandidate } from '../lib/types';

  let {
    candidates,
    busy,
    onMatch,
  }: {
    candidates: PersonCandidate[];
    busy: boolean;
    onMatch: (c: PersonCandidate) => void;
  } = $props();
</script>

{#if candidates.length === 0}
  <p class="pdr-muted pdr-no-candidates">
    No canonical person matched by LinkedIn URL or name. Create a new person, skip, or search manually.
  </p>
{:else}
  <ul class="pdr-candidates">
    {#each candidates as c (c.person_uuid)}
      <li class="pdr-candidate">
        <div class="pdr-candidate-head">
          <div class="pdr-candidate-id">
            <span class="pdr-candidate-name">
              {c.name || c.email || c.linkedin_profile_url || '(no identifying info on this record)'}
            </span>
            {#if c.headline}<span class="pdr-candidate-headline">{c.headline}</span>{/if}
            {#if !c.name}
              <span class="pdr-candidate-headline">
                stub record — no name on file{c.email ? `, matched by email` : c.linkedin_profile_url ? `, matched by LinkedIn URL` : ''}
              </span>
            {/if}
          </div>
          <div class="pdr-candidate-score">
            <span class="pdr-score" data-tier={c.score >= 90 ? 'high' : c.score >= 60 ? 'mid' : 'low'}>{c.score}</span>
            {#each c.match_reason as r (r)}<span class="pdr-reason">{r}</span>{/each}
          </div>
        </div>
        <div class="pdr-candidate-actions">
          <button type="button" class="pdr-btn pdr-btn-primary" disabled={busy} onclick={() => onMatch(c)}>
            match this person
          </button>
        </div>
      </li>
    {/each}
  </ul>
{/if}
