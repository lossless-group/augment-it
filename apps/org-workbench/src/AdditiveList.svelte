<script lang="ts">
  // Generic additive list — the org card's repeated organ. Renders shaped
  // entries (kind badge · name-or-host+path · date) with an inline ➕ form that
  // hands the URL (+ optional kind, + optional name when nameable) to a
  // caller-supplied add function. Entries are additive: no delete — canonical
  // writes are append + dedup server-side. When the caller supplies onedit,
  // an entry's kind/name become patchable in place (✎ or the kind badge) —
  // fields on an entry are correctable; the entry itself is still additive.
  // Busy/error states are localized to this list; a failed add or edit never
  // disturbs the sibling lists.

  import type { ShapedLink } from './lib/types';

  type Entry = ShapedLink & { name?: string };

  let {
    title,
    entries,
    kindHint = 'auto-detected from URL',
    nameable = false,
    onadd,
    onsearch,
    onedit,
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
    // Optional per-entry patch (kind/name matched by URL server-side) —
    // presence turns on the in-place editor.
    onedit?: (entry: Entry, patch: { kind?: string; name?: string }) => Promise<void>;
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
  let editKind = $state('');
  let editName = $state('');
  let editBusy = $state(false);
  let editError = $state<string | null>(null);

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
    editKind = entry.kind;
    editName = entry.name ?? '';
    editError = null;
  }

  function abortEdit() {
    editUrl = null;
    editError = null;
  }

  async function commitEdit(e: SubmitEvent, entry: Entry) {
    e.preventDefault();
    if (!onedit) return;
    const patch: { kind?: string; name?: string } = {};
    const k = editKind.trim();
    const n = editName.trim();
    if (k && k !== entry.kind) patch.kind = k;
    if (n && n !== (entry.name ?? '')) patch.name = n;
    if (!patch.kind && !patch.name) {
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
            {#if onedit}
              <button
                type="button"
                class="ow-entry-action"
                title="edit kind{nameable ? ' / name' : ''}"
                onclick={() => startEdit(e)}
              >
                ✎
              </button>
            {/if}
            {#if entryaction}
              <button type="button" class="ow-entry-action" onclick={() => entryaction.fn(e)}>
                {entryaction.label}
              </button>
            {/if}
            <span class="ow-date">{(e.added_at ?? '').slice(0, 10)}</span>
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
</style>
