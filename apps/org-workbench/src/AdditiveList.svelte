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
  }: {
    title: string;
    entries: Entry[];
    kindHint?: string;
    // Show a name input on the ➕ form (streams: "Today's Credentials").
    nameable?: boolean;
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
    <h3 class="ow-list-title">{title} <span class="ow-list-count">{entries.length}</span></h3>
    <span class="ow-list-actions">
      {#if justAdded}<span class="ow-added">added ✓</span>{/if}
      {#if oncrawl}
        <button type="button" class="ow-plus" title="didi: crawl the web for {title}" onclick={oncrawl}>
          🤖
        </button>
      {/if}
      {#if onsearch}
        <button type="button" class="ow-plus" title="Search the web for {title}" onclick={onsearch}>
          🔍
        </button>
      {/if}
      <button type="button" class="ow-plus" title="Add to {title}" onclick={() => (open = !open)}>
        {open ? '×' : '+'}
      </button>
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
      <button type="submit" class="ow-add-go" disabled={adding}>{adding ? '…' : 'Add'}</button>
    </form>
    {#if error}<div class="ow-error">{error}</div>{/if}
  {/if}

  {#if entries.length === 0}
    <p class="ow-empty">none yet</p>
  {:else}
    <ul class="ow-entries">
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
              <button type="submit" class="ow-add-go" disabled={editBusy}>
                {editBusy ? '…' : 'Save'}
              </button>
              <button type="button" class="ow-add-go" onclick={abortEdit} disabled={editBusy}>
                ×
              </button>
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
              <span class="ow-kind">{e.kind}</span>
            {/if}
            <a class="ow-url" href={e.url} target="_blank" rel="noreferrer">{e.name ?? display(e.url)}</a>
            {#if onremove && removeUrl === e.url}
              <span class="ow-remove-confirm">
                remove?{#if removenote?.(e)}&nbsp;<em class="ow-remove-note">{removenote(e)}</em>{/if}
                <button
                  type="button"
                  class="ow-add-go ow-remove-yes"
                  disabled={removeBusy}
                  onclick={() => commitRemove(e)}
                >
                  {removeBusy ? '…' : 'yes'}
                </button>
                <button type="button" class="ow-add-go" disabled={removeBusy} onclick={() => (removeUrl = null)}>
                  keep
                </button>
              </span>
            {:else}
              {#if onedit}
                <button
                  type="button"
                  class="ow-entry-action ow-micro"
                  title="edit url / kind{nameable ? ' / name' : ''}"
                  onclick={() => startEdit(e)}
                >
                  ✎
                </button>
              {/if}
              {#if onremove}
                <button
                  type="button"
                  class="ow-entry-action ow-micro"
                  title="remove from {title}"
                  onclick={() => (removeUrl = e.url)}
                >
                  ×
                </button>
              {/if}
            {/if}
            {#if entryaction}
              <button type="button" class="ow-entry-action" onclick={() => entryaction.fn(e)}>
                {entryaction.label}
              </button>
            {/if}
            <span class="ow-date">{(e.added_at ?? '').slice(0, 10)}</span>
            {#if removeError && removeUrl === e.url}<div class="ow-error">{removeError}</div>{/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .ow-kind-editable {
    background: transparent;
    border: 1px dashed transparent;
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
  .ow-remove-yes {
    border-color: var(--color-error-text, #f3a3a3);
    color: var(--color-error-text, #f3a3a3);
  }
</style>
