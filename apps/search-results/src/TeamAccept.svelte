<script lang="ts">
  // Team accept surface — StagedPeople copy-adapted from org-workbench (spec
  // D7). Candidates in state, never auto-written: accept runs
  // person.candidates first; no-candidate rows flow straight through
  // person.apply(create) + person.affiliate, ambiguous rows open the gate
  // (pick the match or explicitly create). Crawled LinkedIn/bio links land on
  // CREATED persons only (matched ones may already carry them — additive,
  // not duplicative). An accepted row is CONSUMED (gh #37); the entity-updated
  // broadcast refreshes the org card's People list. Skip discards a row.

  import {
    addPersonLink,
    affiliatePerson,
    applyPerson,
    fetchPersonCandidates,
  } from './lib/search-client';
  import type { CrawledPerson, PersonCandidate } from './lib/types';

  let {
    people,
    source_urls,
    org_slug,
    orgName,
    client,
    onremaining,
  }: {
    people: CrawledPerson[];
    source_urls: string[];
    org_slug: string;
    orgName: string;
    client: string;
    onremaining: (n: number) => void;
  } = $props();

  type RowPhase = 'staged' | 'gate' | 'writing';
  type Row = {
    person: CrawledPerson;
    phase: RowPhase;
    candidates: PersonCandidate[];
    error: string | null;
    consumed: boolean;
  };

  // Seed-once by design — the parent fetches results once per expand.
  // svelte-ignore state_referenced_locally
  let rows = $state<Row[]>(
    people.map((person) => ({ person, phase: 'staged', candidates: [], error: null, consumed: false })),
  );

  $effect(() => {
    onremaining(rows.filter((r) => !r.consumed).length);
  });

  function sourceFor(row: Row): string {
    return row.person.bio_url ?? source_urls[0] ?? 'didi-crawl';
  }

  async function accept(row: Row) {
    row.error = null;
    row.phase = 'writing';
    try {
      const candidates = await fetchPersonCandidates(
        { name: row.person.name, linkedin_url: row.person.linkedin_url, role: row.person.role },
        client,
      );
      if (candidates.length === 0) {
        await write(row, 'create');
      } else {
        row.candidates = candidates;
        row.phase = 'gate';
      }
    } catch (err) {
      row.error = err instanceof Error ? err.message : String(err);
      row.phase = 'staged';
    }
  }

  async function write(row: Row, action: 'match' | 'create', person_uuid?: string) {
    row.phase = 'writing';
    row.error = null;
    try {
      const applied = await applyPerson({
        action,
        person_uuid,
        record: {
          name: row.person.name,
          linkedin_url: row.person.linkedin_url,
          role: row.person.role,
          bio: row.person.headline,
        },
        client,
        source: sourceFor(row),
      });
      await affiliatePerson({
        person_uuid: applied.person_uuid,
        org_slug,
        role: row.person.role,
        // The card's context line is didi's judgment — persist it on the
        // edge instead of losing it at Accept (gh #59).
        agent_search_rationale: row.person.headline ?? null,
        client,
        source: sourceFor(row),
      });
      // Soft-fail the link adds: person + affiliation are the core writes.
      if (applied.created) {
        const links = [row.person.linkedin_url, row.person.bio_url].filter(
          (u): u is string => Boolean(u),
        );
        for (const url of links) {
          try {
            await addPersonLink({ person_uuid: applied.person_uuid, url, client });
          } catch {
            /* soft */
          }
        }
      }
      row.consumed = true;
      window.dispatchEvent(
        new CustomEvent('augment-it:entity-updated', { detail: { org_slug } }),
      );
    } catch (err) {
      row.error = err instanceof Error ? err.message : String(err);
      row.phase = row.candidates.length > 0 ? 'gate' : 'staged';
    }
  }
</script>

{#if rows.length === 0}
  <p class="srq-empty">didi staged nobody — retry, or add people from the org card directly</p>
{:else}
  <p class="srq-note">
    accept writes person + affiliation with <strong>{orgName}</strong>
    {#if source_urls.length > 0}
      · from
      {#each source_urls.slice(0, 2) as u (u)}
        <a href={u} target="_blank" rel="noreferrer">{new URL(u).hostname}</a>{' '}
      {/each}
    {/if}
  </p>
  <ul class="srq-staged-list">
    {#each rows as row (row.person.name)}
      {#if !row.consumed}
        <li class="srq-staged-row">
          <div class="srq-staged-main">
            <span class="srq-person-name">{row.person.name}</span>
            {#if row.person.role}<span class="srq-person-role">{row.person.role}</span>{/if}
            {#if row.person.linkedin_url}
              <a class="srq-url" href={row.person.linkedin_url} target="_blank" rel="noreferrer">linkedin</a>
            {/if}
            {#if row.person.bio_url}
              <a class="srq-url" href={row.person.bio_url} target="_blank" rel="noreferrer">bio</a>
            {/if}
            <span class="srq-staged-actions">
              {#if row.phase === 'writing'}
                <span class="srq-busy">writing…</span>
              {:else}
                <button type="button" class="srq-action" onclick={() => accept(row)}>Accept</button>
                <button type="button" class="srq-action" onclick={() => (row.consumed = true)}>Skip</button>
              {/if}
            </span>
          </div>
          {#if row.person.headline}<p class="srq-headline">{row.person.headline}</p>{/if}
          {#if row.phase === 'gate'}
            <div class="srq-gate">
              <p class="srq-gate-note">Existing persons that might be “{row.person.name}” — pick one or create new:</p>
              <ul class="srq-gate-list">
                {#each row.candidates as c (c.person_uuid)}
                  <li>
                    <button type="button" class="srq-gate-pick" onclick={() => write(row, 'match', c.person_uuid)}>
                      <strong>{c.name ?? c.person_uuid}</strong>
                      {#if c.headline}<span class="srq-gate-headline">{c.headline}</span>{/if}
                      <span class="srq-gate-score">{c.score} · {c.match_reason.join(', ')}</span>
                    </button>
                  </li>
                {/each}
              </ul>
              <span class="srq-staged-actions">
                <button type="button" class="srq-action" onclick={() => write(row, 'create')}>
                  Create new person + affiliate
                </button>
                <button type="button" class="srq-action" onclick={() => (row.phase = 'staged')}>Back</button>
              </span>
            </div>
          {/if}
          {#if row.error}<div class="srq-error">{row.error}</div>{/if}
        </li>
      {/if}
    {/each}
  </ul>
{/if}
