<script lang="ts">
  // The candidate canonical orgs for the current record, ranked. Each card
  // shows why it matched (slug / domain / name), what the org already holds,
  // and the append-preview — exactly what would be written on match. The
  // operator confirms ONE (or falls through to create / manual search in the
  // parent). One at a time; no batch accept in v0.

  import type { Candidate } from '../lib/types';

  let {
    candidates,
    busy,
    onMatch,
  }: {
    candidates: Candidate[];
    busy: boolean;
    onMatch: (c: Candidate) => void;
  } = $props();

  let expanded = $state<string | null>(null);
  function toggle(slug: string) {
    expanded = expanded === slug ? null : slug;
  }
  function appendTotal(c: Candidate): number {
    return (
      c.append_preview.org_links.length +
      c.append_preview.media_streams.length +
      c.append_preview.org_corpus.length
    );
  }
</script>

{#if candidates.length === 0}
  <p class="rdr-muted rdr-no-candidates">
    No canonical org matched by slug, domain, or name. Create a new org, or search manually.
  </p>
{:else}
  <ul class="rdr-candidates">
    {#each candidates as c (c.slug)}
      {@const adds = appendTotal(c)}
      <li class="rdr-candidate">
        <div class="rdr-candidate-head">
          <div class="rdr-candidate-id">
            <span class="rdr-candidate-name">{c.complete_name || c.slug}</span>
            <code class="rdr-candidate-slug">{c.slug}</code>
          </div>
          <div class="rdr-candidate-score">
            <span class="rdr-score" data-tier={c.score >= 90 ? 'high' : c.score >= 60 ? 'mid' : 'low'}>{c.score}</span>
            {#each c.match_reason as r (r)}<span class="rdr-reason">{r}</span>{/each}
          </div>
        </div>

        <div class="rdr-candidate-stats">
          <span class="rdr-stat">has {c.existing.org_links} links · {c.existing.media_streams} streams · {c.existing.org_corpus} corpus</span>
          <span class="rdr-stat rdr-stat-add" class:rdr-stat-zero={adds === 0}>
            + {c.append_preview.org_links.length} links · {c.append_preview.media_streams.length} streams · {c.append_preview.org_corpus.length} corpus
          </span>
        </div>

        {#if adds > 0}
          <button type="button" class="rdr-toggle" onclick={() => toggle(c.slug)}>
            {expanded === c.slug ? '▾ hide what would be added' : '▸ preview what would be added'}
          </button>
          {#if expanded === c.slug}
            <div class="rdr-preview">
              {#if c.append_preview.org_links.length}
                <div class="rdr-preview-group"><span class="rdr-label">+ org_links</span>
                  <ul class="rdr-urls">{#each c.append_preview.org_links as l (l.url)}<li><code class="rdr-kind">{l.kind}</code> {l.url}</li>{/each}</ul>
                </div>
              {/if}
              {#if c.append_preview.media_streams.length}
                <div class="rdr-preview-group"><span class="rdr-label rdr-label-stream">+ media_streams</span>
                  <ul class="rdr-urls">{#each c.append_preview.media_streams as l (l.url)}<li><code class="rdr-kind">{l.kind}</code> {l.url}</li>{/each}</ul>
                </div>
              {/if}
              {#if c.append_preview.org_corpus.length}
                <div class="rdr-preview-group"><span class="rdr-label">+ org_corpus</span>
                  <ul class="rdr-urls">{#each c.append_preview.org_corpus as l (l.url)}<li><code class="rdr-kind">{l.kind}</code> {l.url}</li>{/each}</ul>
                </div>
              {/if}
            </div>
          {/if}
        {/if}

        <div class="rdr-candidate-actions">
          <button type="button" class="rdr-btn rdr-btn-primary" disabled={busy} onclick={() => onMatch(c)}>
            {adds > 0 ? `match → enrich (+${adds}) + opportunity` : 'match → record opportunity'}
          </button>
          <span class="rdr-match-note">every match records an opportunity for this org — even when there's nothing new to enrich</span>
        </div>
      </li>
    {/each}
  </ul>
{/if}
