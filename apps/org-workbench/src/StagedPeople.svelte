<script lang="ts">
  // Staged people from didi's team crawl — candidates in state, never
  // auto-written. Per-row accept follows the didi-chat plan's step-4
  // discipline: no-candidate rows flow straight through person.apply(create)
  // + person.affiliate; ambiguous rows open the candidate gate (pick the
  // match or explicitly create). The team-page URL rides every write as the
  // observation source; the crawled LinkedIn/bio links land on CREATED
  // persons via person.links.add (matched persons may already carry them —
  // additive, not duplicative). An accepted row is CONSUMED — it leaves the
  // staged list; the person appearing in the People list above is the
  // confirmation (gh #37). Skip discards a row; nothing persists until accept.
  // Per context-v/plans/Didi-Crawl-Three-Targets-Relevance-Brief-And-Staged-Team-Ingest.md.

  import {
    fetchPersonCandidates,
    applyPerson,
    affiliatePerson,
    addPersonLink,
    type CrawledPerson,
  } from './lib/org-client';
  import type { PersonCandidate } from './lib/types';

  let {
    org_slug,
    orgName,
    client,
    people,
    filtered_note,
    source_urls,
    onchanged,
    onclear,
  }: {
    org_slug: string;
    orgName: string;
    client: string;
    people: CrawledPerson[];
    filtered_note: string;
    source_urls: string[];
    onchanged: () => void;
    onclear: () => void;
  } = $props();

  type RowPhase = 'staged' | 'gate' | 'writing';
  type Row = {
    person: CrawledPerson;
    phase: RowPhase;
    candidates: PersonCandidate[];
    error: string | null;
    skipped: boolean;
  };

  // Seed-once by design: a fresh crawl remounts this component (keyed block
  // in the parent); rows then evolve independently of the prop.
  // svelte-ignore state_referenced_locally
  let rows = $state<Row[]>(
    people.map((person) => ({ person, phase: 'staged', candidates: [], error: null, skipped: false })),
  );

  const remaining = $derived(rows.filter((r) => !r.skipped).length);

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
        client,
        source: sourceFor(row),
      });
      // The crawl's links ride the accept — created persons only (a matched
      // person may already carry them). Soft-fail: person + affiliation are
      // the core writes; a link hiccup shouldn't fail the accept.
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
      // Consume the row — the person now shows in the People list above;
      // a lingering staged copy is a double-save waiting to happen.
      row.skipped = true;
      onchanged();
    } catch (err) {
      row.error = err instanceof Error ? err.message : String(err);
      row.phase = row.candidates.length > 0 ? 'gate' : 'staged';
    }
  }
</script>

<div class="ow-staged">
  <header class="ow-staged-head">
    <span class="ow-staged-title">
      didi staged <strong>{people.length}</strong> people from
      {#each source_urls.slice(0, 2) as u (u)}
        <a href={u} target="_blank" rel="noreferrer">{u}</a>{' '}
      {/each}
      — accept writes person + affiliation with {orgName}
    </span>
    <button type="button" class="ow-add-go" onclick={onclear}>
      {remaining === 0 ? 'Done — clear' : '× Discard rest'}
    </button>
  </header>
  {#if filtered_note}
    <p class="ow-staged-note">{filtered_note}</p>
  {/if}
  <ul class="ow-staged-list">
    {#each rows as row (row.person.name)}
      {#if !row.skipped}
        <li class="ow-staged-row">
          <div class="ow-staged-main">
            <span class="ow-person-name">{row.person.name}</span>
            {#if row.person.role}<span class="ow-person-role">{row.person.role}</span>{/if}
            {#if row.person.linkedin_url}
              <a class="ow-url" href={row.person.linkedin_url} target="_blank" rel="noreferrer">linkedin</a>
            {/if}
            {#if row.person.bio_url}
              <a class="ow-url" href={row.person.bio_url} target="_blank" rel="noreferrer">bio</a>
            {/if}
            <span class="ow-staged-actions">
              {#if row.phase === 'writing'}
                <span class="ow-staged-busy">writing…</span>
              {:else}
                <button type="button" class="ow-add-go" onclick={() => accept(row)}>Accept</button>
                <button type="button" class="ow-add-go" onclick={() => (row.skipped = true)}>Skip</button>
              {/if}
            </span>
          </div>
          {#if row.person.headline}<p class="ow-staged-headline">{row.person.headline}</p>{/if}
          {#if row.phase === 'gate'}
            <div class="ow-gate">
              <p class="ow-gate-note">Existing persons that might be “{row.person.name}” — pick one or create new:</p>
              <ul class="ow-gate-list">
                {#each row.candidates as c (c.person_uuid)}
                  <li>
                    <button type="button" class="ow-gate-pick" onclick={() => write(row, 'match', c.person_uuid)}>
                      <strong>{c.name ?? c.person_uuid}</strong>
                      {#if c.headline}<span class="ow-gate-headline">{c.headline}</span>{/if}
                      <span class="ow-gate-score">{c.score} · {c.match_reason.join(', ')}</span>
                    </button>
                  </li>
                {/each}
              </ul>
              <span class="ow-addperson-actions">
                <button type="button" class="ow-add-go" onclick={() => write(row, 'create')}>
                  Create new person + affiliate
                </button>
                <button type="button" class="ow-add-go" onclick={() => (row.phase = 'staged')}>Back</button>
              </span>
            </div>
          {/if}
          {#if row.error}<div class="ow-error">{row.error}</div>{/if}
        </li>
      {/if}
    {/each}
  </ul>
</div>
