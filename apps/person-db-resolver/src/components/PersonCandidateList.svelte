<script lang="ts">
  // Ranked canonical persons for the current record. One row per candidate.
  //
  // SELECTION vs COMMIT — the split this surface makes explicit. Clicking the
  // candidate's name ARMS it (SelectWrapper--ClickPrimary → CardRow `selected`);
  // the primary Button COMMITS. They are deliberately different controls with
  // different names, because a match writes to the canonical layer and is not
  // undoable from here.
  import Button from '@augment-it/shared-ui/Button.svelte';
  import SelectWrapperClickPrimary from '@augment-it/shared-ui/SelectWrapper--ClickPrimary.svelte';
  import CardRowCandidate from './CardRow--Candidate.svelte';
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

  let armed = $state<string | null>(null);

  function nameOf(c: PersonCandidate): string {
    return c.name || c.email || c.linkedin_profile_url || '(no identifying info on this record)';
  }
</script>

{#if candidates.length === 0}
  <p class="pdr-muted pdr-no-candidates">
    No canonical person matched by LinkedIn URL or name. Create a new person, skip, or search manually.
  </p>
{:else}
  <ul class="pdr-candidates">
    {#each candidates as c (c.person_uuid)}
      <li>
        <CardRowCandidate selected={armed === c.person_uuid}>
          <div class="pdr-candidate-head">
            <div class="pdr-candidate-id">
              <SelectWrapperClickPrimary
                label={`consider ${nameOf(c)}`}
                selected={armed === c.person_uuid}
                onselect={() => (armed = armed === c.person_uuid ? null : c.person_uuid)}
              >
                <span class="pdr-candidate-name">{nameOf(c)}</span>
              </SelectWrapperClickPrimary>
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
            <Button variant="primary" disabled={busy} onclick={() => onMatch(c)}>
              match this person
            </Button>
          </div>
        </CardRowCandidate>
      </li>
    {/each}
  </ul>
{/if}
