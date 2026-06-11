<script lang="ts">
  // ResponseModeRenderer — dispatches a transcript turn to the right inline
  // renderer based on turn.kind. The four assistant kinds are the three
  // response modes (answer / propose / invoke) plus capability_result, which
  // is the side-channel acknowledgement of a tool call.
  //
  // PromptDraftPanel is used for any capability_result that produced a
  // Prompt — it renders the draft body inline as part of the conversation,
  // not in a side panel. This is the load-bearing UX move from
  // [[Chat-As-Verb-Surface-Patterns]]: drafts feel like turns in the
  // dialog, not detached artifacts.

  import type { ChatTurn } from './chat-state.svelte';
  import { chatState } from './chat-state.svelte';
  import PromptDraftPanel from './PromptDraftPanel.svelte';

  type Props = { turn: ChatTurn };
  let { turn }: Props = $props();

  function fmtTs(ts: number): string {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  function isPromptCapability(cap: string): boolean {
    return cap === 'prompt.draft' || cap === 'prompt.improve';
  }

  type InboxBinaryAsset = {
    filename: string | null;
    size_bytes: number;
    sha256: string;
    sha256_short: string;
    download_status: 'ok' | 'size_capped' | 'http_error' | 'unsupported_type' | 'fetch_failed';
  };

  type InboxResult = {
    corpus_path?: string;
    written_at?: string;
    binary_asset?: InboxBinaryAsset | null;
  };

  function inboxResult(result: unknown): InboxResult | null {
    if (result && typeof result === 'object') return result as InboxResult;
    return null;
  }

  function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  type PromoteResult = {
    snapshot_path?: string;
    source_version?: string;
    new_version?: string;
    rows_with_corpus?: number;
    rows_without_corpus?: number;
    total_corpus_files_indexed?: number;
    record_set_id?: string;
    record_set_name?: string;
  };

  function promoteResult(result: unknown): PromoteResult | null {
    if (result && typeof result === 'object') return result as PromoteResult;
    return null;
  }
</script>

{#if turn.kind === 'user'}
  <div class="turn user">
    <div class="bubble">{turn.message}</div>
    <div class="meta">{fmtTs(turn.ts)}</div>
  </div>

{:else if turn.kind === 'answer'}
  <div class="turn assistant">
    <div class="bubble answer">{turn.text}</div>
    <div class="meta">{fmtTs(turn.ts)}</div>
  </div>

{:else if turn.kind === 'propose'}
  <div class="turn assistant">
    <div class="bubble propose">{turn.text}</div>
    {#if !turn.resolved}
      <div class="proposals">
        {#each turn.proposals as p, i (i)}
          <div class="proposal-card">
            <div class="proposal-line">
              <strong>{p.capability}</strong>
              <span class="proposal-hint">{p.hint}</span>
            </div>
            <div class="proposal-actions">
              <button class="run" onclick={() => chatState.acceptProposal(turn.id, i)}>
                Run this
              </button>
            </div>
          </div>
        {/each}
        <button class="decline" onclick={() => chatState.declineProposals(turn.id)}>
          Not now
        </button>
      </div>
    {:else}
      <div class="meta muted">— affordance dismissed —</div>
    {/if}
    <div class="meta">{fmtTs(turn.ts)}</div>
  </div>

{:else if turn.kind === 'invoke'}
  <div class="turn assistant">
    <div class="bubble invoke">
      <em>{turn.text}</em>
      <div class="invoke-tag">→ {turn.tool_call.capability}</div>
    </div>
    <div class="meta">{fmtTs(turn.ts)}</div>
  </div>

{:else if turn.kind === 'capability_result'}
  {#if turn.ok && isPromptCapability(turn.capability)}
    <PromptDraftPanel result={turn.result} capability={turn.capability} ts={turn.ts} />
  {:else if turn.ok && turn.capability === 'pipeline.promote_snapshot'}
    {@const p = promoteResult(turn.result)}
    <div class="turn system">
      <div class="bubble result promote">
        ✓ Promoted{#if p?.source_version && p?.new_version} {p.source_version} → <strong>{p.new_version}</strong>{/if}
        {#if p?.snapshot_path}
          <div class="promote-path"><code>{p.snapshot_path}</code></div>
        {/if}
        {#if typeof p?.rows_with_corpus === 'number' && typeof p?.rows_without_corpus === 'number'}
          <div class="promote-counts">
            {p.rows_with_corpus} of {p.rows_with_corpus + p.rows_without_corpus} records have corpus content
            {#if typeof p.total_corpus_files_indexed === 'number'}
              ({p.total_corpus_files_indexed} files indexed)
            {/if}
          </div>
        {/if}
        {#if p?.record_set_id}
          <div class="promote-record-set">
            ⤷ loaded as record set <code>{p.record_set_name ?? p.record_set_id}</code> — available now in the record-set picker
          </div>
        {/if}
      </div>
      <div class="meta">{fmtTs(turn.ts)}</div>
    </div>
  {:else if turn.ok && turn.capability === 'corpus.inbox.add'}
    {@const r = inboxResult(turn.result)}
    <div class="turn system">
      <div class="bubble result inbox">
        ✓ Saved to inbox
        {#if r?.corpus_path}
          <div class="inbox-path"><code>{r.corpus_path}</code></div>
        {/if}
        {#if r?.binary_asset}
          {#if r.binary_asset.download_status === 'ok' && r.binary_asset.filename}
            <div class="inbox-binary">
              📄 PDF saved ({fmtBytes(r.binary_asset.size_bytes)} · <code>{r.binary_asset.sha256_short}</code>)
            </div>
          {:else}
            <div class="inbox-binary failed">
              📄 PDF not saved — {r.binary_asset.download_status}
            </div>
          {/if}
        {/if}
      </div>
      <div class="meta">{fmtTs(turn.ts)}</div>
    </div>
  {:else}
    <div class="turn system">
      <div class="bubble result" class:fail={!turn.ok}>
        {#if turn.ok}
          ✓ {turn.capability} completed
        {:else}
          ✗ {turn.capability} failed — {turn.error}
        {/if}
      </div>
      <div class="meta">{fmtTs(turn.ts)}</div>
    </div>
  {/if}

{:else if turn.kind === 'error'}
  <div class="turn system">
    <div class="bubble error">error — {turn.error}</div>
    <div class="meta">{fmtTs(turn.ts)}</div>
  </div>
{/if}
