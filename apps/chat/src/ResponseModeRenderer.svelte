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
