<script lang="ts">
  // One search in the queue. Collapsed: target chip · org · status · elapsed
  // vs typical (spec D6's honest waiting) · arrival dot. Expanded: results
  // fetched on demand (spec D5) into the per-target accept surface, with
  // Mark complete / Retry in the footer (spec D8). A card whose done results
  // still hold unreviewed candidates asks once inline before dismissing
  // (spec open question — leaning yes, as specced).

  import ResultsAccept from './ResultsAccept.svelte';
  import TeamAccept from './TeamAccept.svelte';
  import { dismissSearch, fetchSearchResults, fmtDuration, submitSearch } from './lib/search-client';
  import type { SearchCard, SearchResults } from './lib/types';

  let {
    card,
    client,
    now,
    ondismiss,
  }: {
    card: SearchCard;
    client: string;
    now: number;
    ondismiss: () => void;
  } = $props();

  const TARGET_LABEL: Record<SearchCard['target'], string> = {
    links: 'links',
    streams: 'streams',
    team: 'team',
  };

  const orgLabel = $derived(card.entity.display_name ?? card.entity.org_slug);
  const inFlight = $derived(card.status === 'queued' || card.status === 'running');
  const elapsedMs = $derived.by(() => {
    const from = card.started_at ?? card.submitted_at;
    const to = card.finished_at ? new Date(card.finished_at).getTime() : now;
    return to - new Date(from).getTime();
  });
  const overdue = $derived(inFlight && elapsedMs > card.typical_ms * 1.5);

  let expanded = $state(false);
  let results = $state<SearchResults | null>(null);
  let resultsError = $state<string | null>(null);
  let fetching = $state(false);
  // Reported up by the accept surface — how many candidates are still
  // neither accepted nor skipped, for the dismiss warn.
  let remaining = $state(0);
  let confirmDismiss = $state(false);
  let retrying = $state(false);

  async function toggle() {
    expanded = !expanded;
    if (expanded && !results && !inFlight) void fetchResults();
  }

  async function fetchResults() {
    fetching = true;
    resultsError = null;
    try {
      results = await fetchSearchResults(card.search_id);
      remaining = results.results?.length ?? results.people?.length ?? 0;
    } catch (err) {
      resultsError = err instanceof Error ? err.message : String(err);
    } finally {
      fetching = false;
    }
  }

  // A card that settles while expanded (operator watching) fetches on arrival.
  $effect(() => {
    if (expanded && card.status === 'done' && !results && !fetching) void fetchResults();
  });

  function markComplete() {
    if (card.status === 'done' && remaining > 0 && !confirmDismiss) {
      confirmDismiss = true;
      return;
    }
    ondismiss();
  }

  // The collapsed-row × — dismiss THIS search without expanding (the header's
  // "clear done" clears the whole queue; this is its per-card twin). One tap
  // for failed/running/empty cards; a done card with candidates the operator
  // never reviewed asks once (the ✓? step, auto-reset) — same conscience as
  // the expanded Mark complete.
  let quickConfirm = $state(false);
  let quickConfirmTimer: ReturnType<typeof setTimeout> | undefined;
  function quickDismiss() {
    const unreviewed = results ? remaining : (card.result_summary?.count ?? 0);
    if (card.status === 'done' && unreviewed > 0 && !quickConfirm) {
      quickConfirm = true;
      clearTimeout(quickConfirmTimer);
      quickConfirmTimer = setTimeout(() => (quickConfirm = false), 4_000);
      return;
    }
    clearTimeout(quickConfirmTimer);
    ondismiss();
  }

  // Retry (failed cards): resubmit the same entity + target, drop this card.
  async function retry() {
    retrying = true;
    try {
      await submitSearch({ entity: card.entity, target: card.target, client });
      await dismissSearch(card.search_id).catch(() => {});
      ondismiss();
    } catch (err) {
      resultsError = err instanceof Error ? err.message : String(err);
    } finally {
      retrying = false;
    }
  }
</script>

<li class="srq-card status-{card.status}">
  <div class="srq-card-top">
  <button type="button" class="srq-card-row" onclick={toggle} aria-expanded={expanded}>
    <span class="srq-chip srq-chip-{card.target}">{TARGET_LABEL[card.target]}</span>
    <span class="srq-org" title={card.entity.org_slug}>{orgLabel}</span>
    {#if inFlight}
      <span class="srq-status srq-status-running">
        {card.status === 'queued' ? 'queued' : 'running'}
        · {fmtDuration(elapsedMs)} <span class="srq-typical">/ typically ~{fmtDuration(card.typical_ms)}</span>
        {#if overdue}<span class="srq-overdue" title="past 1.5× the typical duration — it may still land">slow</span>{/if}
      </span>
    {:else if card.status === 'done'}
      <span class="srq-status srq-status-done">
        <span class="srq-dot" aria-hidden="true"></span>
        {card.result_summary?.count ?? 0} candidate{(card.result_summary?.count ?? 0) === 1 ? '' : 's'}
        · {fmtDuration(elapsedMs)}
      </span>
    {:else}
      <span class="srq-status srq-status-failed">failed</span>
    {/if}
  </button>
  <span class="srq-card-side">
    <button
      type="button"
      class="srq-quick-x"
      class:confirming={quickConfirm}
      title={quickConfirm
        ? `${results ? remaining : (card.result_summary?.count ?? 0)} candidate${(results ? remaining : (card.result_summary?.count ?? 0)) === 1 ? '' : 's'} not reviewed — click again to dismiss`
        : 'Dismiss this search'}
      onclick={quickDismiss}
    >
      {quickConfirm ? '✓?' : '×'}
    </button>
    <button type="button" class="srq-caret-btn" onclick={toggle} aria-expanded={expanded} aria-label={expanded ? 'Collapse' : 'Expand'}>
      {expanded ? '▾' : '▸'}
    </button>
  </span>
  </div>

  {#if expanded}
    <div class="srq-card-body">
      {#if inFlight}
        <!-- Phase 4 reserves this slot for search.progress beats (gh #35). -->
        <p class="srq-progress">didi is crawling — the card will signal when candidates land.</p>
      {:else if card.status === 'failed'}
        <div class="srq-error">{card.error ?? 'the crawl failed'}</div>
      {:else if fetching}
        <p class="srq-progress">fetching results…</p>
      {:else if resultsError}
        <div class="srq-error">{resultsError}</div>
      {:else if results}
        {#if results.filtered_note}<p class="srq-note">{results.filtered_note}</p>{/if}
        {#if card.target === 'team'}
          <TeamAccept
            people={results.people ?? []}
            source_urls={results.source_urls ?? []}
            org_slug={card.entity.org_slug}
            orgName={orgLabel}
            {client}
            onremaining={(n) => (remaining = n)}
          />
        {:else}
          <ResultsAccept
            results={results.results ?? []}
            target={card.target}
            org_slug={card.entity.org_slug}
            {client}
            onremaining={(n) => (remaining = n)}
          />
        {/if}
      {/if}

      <footer class="srq-card-actions">
        {#if card.status === 'failed'}
          <button type="button" class="srq-action" disabled={retrying} onclick={retry}>
            {retrying ? 'resubmitting…' : 'Retry'}
          </button>
        {/if}
        {#if !inFlight}
          {#if confirmDismiss}
            <span class="srq-confirm">
              {remaining} candidate{remaining === 1 ? '' : 's'} not reviewed —
              <button type="button" class="srq-action srq-danger" onclick={ondismiss}>dismiss anyway</button>
              <button type="button" class="srq-action" onclick={() => (confirmDismiss = false)}>keep</button>
            </span>
          {:else}
            <button type="button" class="srq-action" onclick={markComplete}>Mark complete</button>
          {/if}
        {/if}
      </footer>
    </div>
  {/if}
</li>
