<script lang="ts">
  // Generic additive list — the org card's repeated organ. Renders shaped
  // entries (kind badge · name-or-host+path · date) with an inline ➕ form that
  // hands the URL (+ optional kind, + optional name when nameable) to a
  // caller-supplied add function. When the caller supplies onedit, an entry's
  // url/kind/name become patchable in place (✎ or the kind badge); onremove
  // adds the × with an inline confirm — the correction half of view-and-edit-
  // in-place, per context-v/specs/Entity-Card-Edit-And-Remove-Affordances.md.
  // The micro-buttons are hover/focus-revealed so rows rest quiet.
  // Busy/error states are localized to this list; a failed add, edit, or
  // remove never disturbs the sibling lists.

  import Button from '@augment-it/shared-ui/Button.svelte';
  import CountBadge from '@augment-it/shared-ui/CountBadge.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import ExternalLink from '@augment-it/shared-ui/ExternalLink.svelte';
  import type { ShapedLink } from './lib/types';

  type Entry = ShapedLink & { name?: string };

  let {
    title,
    entries,
    kindHint = 'auto-detected from URL',
    nameable = false,
    onadd,
    onsearch,
    oncrawl,
    onedit,
    onremove,
    removenote,
    entryaction,
    kindSuggestions,
  }: {
    title: string;
    entries: Entry[];
    kindHint?: string;
    // Show a name input on the ➕ form (streams: "Today's Credentials").
    nameable?: boolean;
    // Optional datalist for the kind inputs (add + edit) — autocomplete
    // against kinds already in use; a non-match still creates whatever the
    // operator typed (gh #57).
    kindSuggestions?: string[];
    onadd: (url: string, kind?: string, name?: string) => Promise<void>;
    // Optional 🔍 — launches search-and-add pre-scoped to this list (Phase 3).
    onsearch?: () => void;
    // Optional 🤖 — didi's crawl for this whole list (v1.2): header-level,
    // because the list (not one entry) is the crawl's subject.
    oncrawl?: () => void;
    // Optional per-entry patch (url/kind/name matched by current URL
    // server-side) — presence turns on the in-place editor.
    onedit?: (entry: Entry, patch: { url?: string; kind?: string; name?: string }) => Promise<void>;
    // Optional per-entry remove (matched by URL server-side) — presence
    // turns on the × with its inline confirm.
    onremove?: (entry: Entry) => Promise<void>;
    // Optional caller-supplied caution shown inside the remove confirm
    // (e.g. "this stream fed 3 corpus items — they stay").
    removenote?: (entry: Entry) => string | null;
    // Optional per-entry action (Phase 5 — "scan" on pulse streams).
    entryaction?: { label: string; fn: (entry: Entry) => void };
  } = $props();

  // One datalist per list instance — the id must be unique in the page.
  const kindListId = $derived(`ow-kinds-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);

  let adding = $state(false);
  let open = $state(false);
  let url = $state('');
  let kind = $state('');
  let name = $state('');
  let error = $state<string | null>(null);
  let justAdded = $state(false);

  // In-place editor — one row at a time, keyed by the entry's URL.
  let editUrl = $state<string | null>(null);
  let editNewUrl = $state('');
  let editKind = $state('');
  let editName = $state('');
  let editBusy = $state(false);
  let editError = $state<string | null>(null);

  // Remove confirm — one row at a time, keyed by the entry's URL.
  let removeUrl = $state<string | null>(null);
  let removeBusy = $state(false);
  let removeError = $state<string | null>(null);

  async function commitRemove(entry: Entry) {
    if (!onremove) return;
    removeBusy = true;
    removeError = null;
    try {
      await onremove(entry);
      removeUrl = null;
    } catch (err) {
      removeError = err instanceof Error ? err.message : String(err);
    } finally {
      removeBusy = false;
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    adding = true;
    error = null;
    try {
      await onadd(trimmed, kind.trim() || undefined, name.trim() || undefined);
      url = '';
      kind = '';
      name = '';
      open = false;
      justAdded = true;
      setTimeout(() => (justAdded = false), 2000);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      adding = false;
    }
  }

  function startEdit(entry: Entry) {
    editUrl = entry.url;
    editNewUrl = entry.url;
    editKind = entry.kind;
    editName = entry.name ?? '';
    editError = null;
    removeUrl = null;
  }

  function abortEdit() {
    editUrl = null;
    editError = null;
  }

  async function commitEdit(e: SubmitEvent, entry: Entry) {
    e.preventDefault();
    if (!onedit) return;
    const patch: { url?: string; kind?: string; name?: string } = {};
    const u = editNewUrl.trim();
    const k = editKind.trim();
    const n = editName.trim();
    if (u && u !== entry.url) patch.url = u;
    if (k && k !== entry.kind) patch.kind = k;
    if (n && n !== (entry.name ?? '')) patch.name = n;
    if (!patch.url && !patch.kind && !patch.name) {
      abortEdit();
      return;
    }
    editBusy = true;
    editError = null;
    try {
      await onedit(entry, patch);
      editUrl = null;
    } catch (err) {
      editError = err instanceof Error ? err.message : String(err);
    } finally {
      editBusy = false;
    }
  }

  function onEditKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      abortEdit();
    }
  }

  // Fallback display: host + path, not hostname alone — the path is what
  // tells two entries on one domain apart (a blog_index IS its path). Capped
  // so deep tracking-style URLs don't blow up the row.
  function display(u: string): string {
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.replace(/^www\./, '');
      const path = parsed.pathname.replace(/\/$/, '');
      const full = path ? host + path : host;
      return full.length > 60 ? `${full.slice(0, 57)}…` : full;
    } catch {
      return u;
    }
  }
</script>

<section class="ow-list">
  <header class="ow-list-head">
    <!-- tone="neutral", NOT the default "inherit". This count sits inside the
         <h3>, so `inherit` would tint it from the heading's own colour and make
         it read as part of the title's emphasis — the opposite of what it is.
         A list count is subordinate to the heading it annotates. Measured
         --color-text-muted on --color-surface-2: 4.57:1 light / 5.47:1 dark /
         6.46:1 vibrant. -->
    <h3 class="ow-list-title">{title} <CountBadge count={entries.length} tone="neutral" label={title} /></h3>
    <span class="ow-list-actions">
      {#if justAdded}<span class="ow-added">added ✓</span>{/if}
      {#if oncrawl}
        <Button variant="outline" size="icon" aria-label="didi: crawl the web for {title}" title="didi: crawl the web for {title}" onclick={oncrawl}>
          🤖
        </Button>
      {/if}
      {#if onsearch}
        <Button variant="outline" size="icon" aria-label="Search the web for {title}" title="Search the web for {title}" onclick={onsearch}>
          🔍
        </Button>
      {/if}
      <Button
        variant="outline"
        size="icon"
        aria-expanded={open}
        aria-label={open ? `Close the add form for ${title}` : `Add to ${title}`}
        title="Add to {title}"
        onclick={() => (open = !open)}
      >
        {open ? '×' : '+'}
      </Button>
    </span>
  </header>

  {#if open}
    <form class="ow-add" onsubmit={submit}>
      <input
        class="ow-add-url"
        type="url"
        placeholder="https://…"
        bind:value={url}
        required
        disabled={adding}
      />
      <input
        class="ow-add-kind"
        type="text"
        placeholder={kindHint}
        list={kindSuggestions?.length ? kindListId : undefined}
        bind:value={kind}
        disabled={adding}
      />
      {#if nameable}
        <input
          class="ow-add-kind"
          type="text"
          placeholder="name (optional)"
          bind:value={name}
          disabled={adding}
        />
      {/if}
      <Button type="submit" variant="primary" size="lg" disabled={adding}>{adding ? '…' : 'Add'}</Button>
    </form>
    {#if error}<div class="ow-error">{error}</div>{/if}
  {/if}

  {#if entries.length === 0}
    <p class="ow-empty">none yet</p>
  {:else}
    <ListContainer as="ul" gap="sm" label="{title} entries">
      {#each entries as e (e.url + e.added_at)}
        <li class="ow-entry">
          {#if onedit && editUrl === e.url}
            <form class="ow-add" onsubmit={(ev) => commitEdit(ev, e)}>
              <input
                class="ow-add-url"
                type="url"
                placeholder="https://…"
                bind:value={editNewUrl}
                onkeydown={onEditKey}
                disabled={editBusy}
              />
              <input
                class="ow-add-kind"
                type="text"
                placeholder="kind"
                list={kindSuggestions?.length ? kindListId : undefined}
                bind:value={editKind}
                onkeydown={onEditKey}
                disabled={editBusy}
              />
              {#if nameable}
                <input
                  class="ow-add-kind"
                  type="text"
                  placeholder="name"
                  bind:value={editName}
                  onkeydown={onEditKey}
                  disabled={editBusy}
                />
              {/if}
              <Button type="submit" variant="primary" size="lg" disabled={editBusy}>
                {editBusy ? '…' : 'Save'}
              </Button>
              <Button size="lg" aria-label="Cancel this edit" onclick={abortEdit} disabled={editBusy}>
                ×
              </Button>
            </form>
            {#if editError}<div class="ow-error">{editError}</div>{/if}
          {:else}
            {#if onedit}
              <button
                type="button"
                class="ow-kind ow-kind-editable"
                title="click to edit kind{nameable ? ' / name' : ''}"
                onclick={() => startEdit(e)}
              >
                {e.kind}
              </button>
            {:else}
              <Chip size="sm">{e.kind}</Chip>
            {/if}
            <ExternalLink class="ow-url" href={e.url} label={e.name ?? display(e.url)} />
            {#if onremove && removeUrl === e.url}
              <span class="ow-remove-confirm">
                remove?{#if removenote?.(e)}&nbsp;<em class="ow-remove-note">{removenote(e)}</em>{/if}
                <Button
                  variant="destructive"
                  size="sm"
                  aria-label="Confirm removing {e.url} from {title}"
                  disabled={removeBusy}
                  onclick={() => commitRemove(e)}
                >
                  {removeBusy ? '…' : 'yes'}
                </Button>
                <Button size="sm" aria-label="Keep {e.url}" disabled={removeBusy} onclick={() => (removeUrl = null)}>
                  keep
                </Button>
              </span>
            {:else}
              {#if onedit}
                <span class="ow-micro">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Edit url / kind{nameable ? ' / name' : ''} for {e.url}"
                    title="edit url / kind{nameable ? ' / name' : ''}"
                    onclick={() => startEdit(e)}
                  >
                    ✎
                  </Button>
                </span>
              {/if}
              {#if onremove}
                <span class="ow-micro">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Remove {e.url} from {title}"
                    title="remove from {title}"
                    onclick={() => (removeUrl = e.url)}
                  >
                    ×
                  </Button>
                </span>
              {/if}
            {/if}
            {#if entryaction}
              <Button variant="outline" size="sm" onclick={() => entryaction.fn(e)}>
                {entryaction.label}
              </Button>
            {/if}
            <span class="ow-date">{(e.added_at ?? '').slice(0, 10)}</span>
            {#if removeError && removeUrl === e.url}<div class="ow-error">{removeError}</div>{/if}
          {/if}
        </li>
      {/each}
    </ListContainer>
  {/if}

  {#if kindSuggestions?.length}
    <datalist id={kindListId}>
      {#each kindSuggestions as k (k)}<option value={k}></option>{/each}
    </datalist>
  {/if}
</section>

<style>
  /* HOLDOUT — the kind badge is a BADGE with a click affordance, so it is
     neither a Button (Button contributes height, padding-inline and
     border-radius from its own scoped style at (0,2,0), which rung 4 cannot
     reach) nor a Chip (a Chip is a <span> and may not carry an onclick). The
     missing organ is an interactive Badge/Pill; raised in the migration report.

     Its non-editable twin — rendered from the same template when `onedit` is
     absent — IS a Chip and has been migrated. The earlier note here claimed
     migrating one twin would "split one visual element into two"; measurement
     says the twins were ALREADY two: every painted property of .ow-kind is
     overridden below, so the editable twin renders as bare 13.6px inherited
     text with no ground while the span twin renders as a filled 11.2px badge.
     The two declarations the twin actually kept from the deleted global
     .ow-kind rule-set are folded in here. */
  .ow-kind-editable {
    flex-shrink: 0;
    background: transparent;
    border: 1px dashed transparent;
    border-radius: var(--radius-md);
    font: inherit;
    color: inherit;
    padding: 0;
    cursor: pointer;
  }
  .ow-kind-editable:hover {
    border-color: currentColor;
  }
  /* ✎/× rest invisible so rows stay quiet; hover or keyboard focus reveals
     them (spec D5). entryaction buttons ("scan") stay always-visible. */
  .ow-entry .ow-micro {
    opacity: 0;
    transition: opacity 0.1s ease;
  }
  .ow-entry:hover .ow-micro,
  .ow-entry:focus-within .ow-micro {
    opacity: 1;
  }
  .ow-remove-confirm {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: var(--color-text-muted, #9aa0aa);
  }
  .ow-remove-note {
    font-style: italic;
  }
</style>
