<script lang="ts">
  import { onMount } from 'svelte';
  import { workspace, resolveWsUrl } from '@augment-it/workspace';
  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import StatusIndicator from '@augment-it/shared-ui/StatusIndicator.svelte';
  import { curation } from './curation.svelte';
  import CorpusPicker from './CorpusPicker.svelte';
  import SourceList from './SourceList.svelte';
  import SourceDetail from './SourceDetail.svelte';

  const WS_URL = resolveWsUrl();

  onMount(() => {
    curation.init();
  });

  // Curator liveness (Build-Order Step 6): two people in the same tenant
  // see each other's domain/source edits without a refresh. Broadcasts
  // land on workspace.events (ws.ts's BROADCAST_SUBJECTS); dedup by seq
  // the same way record-collector's App.svelte does, so each event is
  // handled exactly once regardless of how many reactive deps re-fire
  // this effect. domain.retyped carries client_slugs (plural — a domain
  // can span clients); every other subject carries client_slug (singular).
  let lastProcessedSeq = -1;
  $effect(() => {
    const ev = workspace.events[workspace.events.length - 1];
    if (!ev || ev.seq <= lastProcessedSeq) return;
    lastProcessedSeq = ev.seq;

    const payload = ev.payload as {
      client_slug?: string;
      client_slugs?: string[];
      domain_slug?: string;
      type?: string;
      old_type?: string;
    };

    if (ev.subject === 'domain.created' || ev.subject === 'domain.retyped') {
      const inThisClient =
        ev.subject === 'domain.retyped'
          ? (payload.client_slugs ?? []).includes(curation.clientSlug ?? '')
          : payload.client_slug === curation.clientSlug;
      // No type check any more: the list holds every type in the workspace
      // (gh #88), so any domain created or retyped in this client is relevant.
      // The old filter also meant a retype OUT of the active type was missed
      // whenever the guessed type was wrong.
      if (inThisClient) void curation.loadStrategies();
    } else if (
      ev.subject === 'source.added' ||
      ev.subject === 'source.updated' ||
      ev.subject === 'source.removed' ||
      ev.subject === 'extract.added'
    ) {
      if (payload.client_slug === curation.clientSlug && payload.domain_slug === curation.activeSlug) {
        void curation.refreshSources();
      }
    }
  });
</script>

<div class="cc-app">
  <header class="cc-header">
    <span class="cc-brand">Corpora Curator</span>
    {#if curation.workspaces.length}
      <select
        class="cc-ws"
        value={curation.clientSlug ?? ''}
        onchange={(e) => curation.switchWorkspace(e.currentTarget.value)}
        title="Active workspace — the client whose corpus is written into"
      >
        {#each curation.workspaces as w (w.client_id)}<option value={w.client_id}>{w.client_id}</option>{/each}
      </select>
    {:else if curation.connection !== 'open'}
      <!-- THE SECOND CONNECTION RENDERING IN THIS HEADER, and the one that was
           actually broken. It was a hardcoded `tone="info"` chip reading
           "connecting…", shown for every non-open state — so idle, closed,
           error and auth_required all claimed the socket was mid-handshake.
           Five states, one appearance, and four of the five were a lie rather
           than merely undifferentiated. The right-hand indicator was already
           six-way correct; this slot never consulted the map at all.

           No `of=` here on purpose: it sits WHERE THE WORKSPACE PICKER WOULD BE
           and answers "why is there no picker", so the bare word is the whole
           sentence. The right-hand one carries the subject. -->
      <StatusIndicator
        state={curation.connection}
        title="No workspace list yet — this is why"
      />
    {:else}
      <Chip size="sm" title="Active workspace">{curation.clientSlug ?? '— no workspace —'}</Chip>
    {/if}
    <!-- The selected corpus's OWN type when there is one; otherwise this
         client's preferred vocabulary. It labels, it never filters (gh #88). -->
    <Chip
      size="sm"
      title={curation.active ? 'Type of the selected corpus' : 'This workspace’s preferred vocabulary for new corpora'}
    >{curation.active?.type ?? curation.domainType}</Chip>
    {#if curation.active}
      <!-- STILL a Button — it is the only thing in this header you can press —
           but the reason it reads as one has INVERTED, and that was worth
           measuring rather than assuming.

           Before: .cc-pill and Button/secondary painted the IDENTICAL fill
           (--color-surface-raised, rgb(12,13,18) in dark) and were told apart
           only by their boundaries — the pill's --color-border against the
           button's --color-border-strong. That is the comment this one replaces.

           Now: a neutral Chip carries --color-border-strong too, so the boundary
           says nothing. What separates them is the fill — Chip sits on
           --color-surface-2 (rgb(22,24,31)), a step LIGHTER than the button's
           --color-surface-raised — plus --radius-pill against --radius-md and
           17px against 24px. Measured in all three modes with the before/after
           probe, because a chip rollout that quietly made the one control in a
           header indistinguishable from its four labels is a regression no gate
           in this repo can see. -->
      <Button
        variant="secondary"
        size="sm"
        onclick={() => { curation.activeSlug = null; curation.activeType = null; }}
        title="Back to the corpora list / create form"
      >‹ All corpora</Button>
      <span class="cc-strategy">{curation.active.title}</span>
      <Chip size="sm">{curation.sources.length} sources</Chip>
    {/if}
    <span class="cc-spacer"></span>
    <!-- The canonical connection indicator. This one was NOT broken — a local
         CONNECTION_TONE map already gave all six states their own tone, which
         is why this member was the last holdout: there was no colour bug left
         to fix here. What it could not fix from inside the member is the WORD.
         It rendered `{curation.connection}` raw, so the operator read the
         TypeScript union member: `auth_required`, lowercase, underscored, at
         the exact moment they need to be told to sign in. The component says
         "workspace sign-in required".

         `of="workspace"` matches the fifteen other members, so the strip reads
         identically everywhere — which is the whole point of federating a map
         that was already correct locally. -->
    <StatusIndicator state={curation.connection} of="workspace" />
  </header>

  {#if curation.lastError}
    <div class="cc-banner" title="A capability call failed — the backend handler may not be wired yet (Increment 2).">
      {curation.lastError}
    </div>
  {/if}

  {#if !curation.active}
    <div class="cc-pickwrap"><CorpusPicker /></div>
  {:else}
    <main class="cc-main">
      <div class="cc-col cc-listcol"><SourceList /></div>
      <div class="cc-col cc-detailcol"><SourceDetail /></div>
    </main>
  {/if}

  <footer class="cc-footer">
    <code>@augment-it/corpora-curator</code> · <code>{WS_URL}</code>
    {#if curation.saveStatus}· {curation.saveStatus}{/if}
  </footer>
</div>
