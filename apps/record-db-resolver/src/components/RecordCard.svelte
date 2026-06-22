<script lang="ts">
  // Read-only view of the normalized record the operator is resolving — the
  // left side of the match/create decision. Shows exactly the web-presence
  // facts that will land on a canonical org (name/url/socials → org_links,
  // official-updates → media_streams, helpful_links → org_corpus).

  import type { NormRecord } from '../lib/types';

  let { record }: { record: NormRecord } = $props();
</script>

<div class="rdr-record">
  <div class="rdr-record-head">
    <span class="rdr-eyebrow">record</span>
    <h2 class="rdr-record-name">{record.name || '(no name)'}</h2>
    {#if record.slug_hint}
      <code class="rdr-slug">slug hint: {record.slug_hint}</code>
    {/if}
  </div>

  {#if record.url}
    <div class="rdr-field">
      <span class="rdr-label">url → org_links</span>
      <a class="rdr-link" href={record.url} target="_blank" rel="noopener">{record.url}</a>
    </div>
  {/if}

  {#if record.socials && record.socials.length}
    <div class="rdr-field">
      <span class="rdr-label">socials → org_links ({record.socials.length})</span>
      <ul class="rdr-urls">
        {#each record.socials as s (typeof s === 'string' ? s : s.url)}
          <li><a class="rdr-link" href={typeof s === 'string' ? s : s.url} target="_blank" rel="noopener">{typeof s === 'string' ? s : s.url}</a></li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if record.streams && record.streams.length}
    <div class="rdr-field">
      <span class="rdr-label rdr-label-stream">official updates → media_streams ({record.streams.length})</span>
      <ul class="rdr-urls">
        {#each record.streams as s (typeof s === 'string' ? s : s.url)}
          <li><a class="rdr-link" href={typeof s === 'string' ? s : s.url} target="_blank" rel="noopener">{typeof s === 'string' ? s : s.url}</a></li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if record.corpus && record.corpus.length}
    <div class="rdr-field">
      <span class="rdr-label">helpful links → org_corpus ({record.corpus.length})</span>
      <ul class="rdr-urls">
        {#each record.corpus as s (typeof s === 'string' ? s : s.url)}
          <li><a class="rdr-link" href={typeof s === 'string' ? s : s.url} target="_blank" rel="noopener">{typeof s === 'string' ? s : s.url}</a></li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
