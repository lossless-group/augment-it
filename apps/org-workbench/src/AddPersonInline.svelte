<script lang="ts">
  // Add a person IN org context — spec step 6's "magic". The operator only
  // resolves the person (candidates are ALWAYS gated: pick a match or
  // explicitly create); the affiliation edge + its paired observation come
  // from person.affiliate with this card's org pre-bound. No affiliation UI
  // exists because none is needed — and the same person can gain more orgs
  // later (N-affiliation assumption, never 1:1).

  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import SelectWrapperClickBody from '@augment-it/shared-ui/SelectWrapper--ClickBody.svelte';
  import { fetchPersonCandidates, applyPerson, affiliatePerson } from './lib/org-client';
  import type { PersonCandidate, PersonNormRecord } from './lib/types';

  let {
    org_slug,
    orgName,
    client,
    onadded,
  }: {
    org_slug: string;
    orgName: string;
    client: string;
    onadded: () => void;
  } = $props();

  let open = $state(false);
  let name = $state('');
  let linkedin = $state('');
  let role = $state('');
  let phase = $state<'form' | 'gate' | 'writing'>('form');
  let candidates = $state<PersonCandidate[]>([]);
  let error = $state<string | null>(null);

  function record(): PersonNormRecord {
    return {
      name: name.trim(),
      linkedin_url: linkedin.trim() || null,
      role: role.trim() || null,
    };
  }

  async function findCandidates(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    error = null;
    try {
      candidates = await fetchPersonCandidates(record(), client);
      phase = 'gate'; // always gate — even zero candidates gets an explicit "create"
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function resolve(action: 'match' | 'create', person_uuid?: string) {
    phase = 'writing';
    error = null;
    try {
      const applied = await applyPerson({
        action,
        person_uuid,
        record: record(),
        client,
        source: 'org-workbench',
      });
      await affiliatePerson({
        person_uuid: applied.person_uuid,
        org_slug,
        role: role.trim() || null,
        client,
      });
      name = '';
      linkedin = '';
      role = '';
      candidates = [];
      phase = 'form';
      open = false;
      onadded();
      window.dispatchEvent(
        new CustomEvent('augment-it:entity-updated', { detail: { org_slug } }),
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      phase = 'gate';
    }
  }
</script>

<div class="ow-addperson">
  {#if !open}
    <Button variant="outline" aria-expanded={open} onclick={() => (open = true)}>
      + Add a person to {orgName}
    </Button>
  {:else}
    <form class="ow-addperson-form" onsubmit={findCandidates}>
      <input class="ow-add-url" type="text" placeholder="Full name (required)" bind:value={name} required disabled={phase !== 'form'} />
      <input class="ow-add-url" type="url" placeholder="LinkedIn URL (optional)" bind:value={linkedin} disabled={phase !== 'form'} />
      <input class="ow-add-kind" type="text" placeholder="Role at {orgName} (optional)" bind:value={role} disabled={phase !== 'form'} />
      {#if phase === 'form'}
        <span class="ow-addperson-actions">
          <Button type="submit" variant="primary" size="lg" disabled={!name.trim()}>Find matches</Button>
          <Button size="lg" onclick={() => { open = false; error = null; }}>Cancel</Button>
        </span>
      {/if}
    </form>

    {#if phase === 'gate'}
      <div class="ow-gate">
        {#if candidates.length > 0}
          <p class="ow-gate-note">Existing persons that might be “{name}” — pick one or create new:</p>
          <ListContainer as="ul" gap="sm" label="Existing persons that might match">
            {#each candidates as c (c.person_uuid)}
              <CardRow as="li" density="compact">
                  <SelectWrapperClickBody
                    label="Match {c.name ?? c.person_uuid}"
                    onselect={() => resolve('match', c.person_uuid)}
                  >
                    <span class="ow-gate-pick">
                      <strong>{c.name ?? c.person_uuid}</strong>
                      {#if c.headline}<span class="ow-gate-headline">{c.headline}</span>{/if}
                      <span class="ow-gate-score">{c.score} · {c.match_reason.join(', ')}</span>
                    </span>
                  </SelectWrapperClickBody>
                  </CardRow>
            {/each}
          </ListContainer>
        {:else}
          <p class="ow-gate-note">No existing person matches “{name}”.</p>
        {/if}
        <span class="ow-addperson-actions">
          <Button variant="primary" onclick={() => resolve('create')}>
            Create new person + affiliate with {orgName}
          </Button>
          <Button onclick={() => (phase = 'form')}>Back</Button>
        </span>
      </div>
    {:else if phase === 'writing'}
      <p class="ow-gate-note">writing person + affiliation…</p>
    {/if}
    {#if error}<div class="ow-error">{error}</div>{/if}
  {/if}
</div>
