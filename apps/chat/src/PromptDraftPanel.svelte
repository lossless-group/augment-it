<script lang="ts">
  // PromptDraftPanel — renders a prompt.draft or prompt.improve result
  // inline in the chat conversation. The load-bearing UX move: drafts
  // appear as a turn the user reacts to, not as a side-panel artifact.
  //
  // Two affordances: "Refine this" (becomes a propose for prompt.improve
  // via natural-language feedback the user types) and "Run this" (becomes
  // a propose for prompt.apply against the record set the draft was built
  // against). Both go through chatState.sendMessage so they land in the
  // model and produce a normal propose turn — keeps the strict-alignment
  // discipline intact.

  import { chatState } from './chat-state.svelte';
  import Button from '@augment-it/shared-ui/Button.svelte';
  import Chip from '@augment-it/shared-ui/Chip.svelte';

  type DraftResult = {
    ok?: boolean;
    prompt_id?: string;
    content?: string;
    output_column?: string;
  };

  type Props = { result: unknown; capability: string; ts: number };
  let { result, capability, ts }: Props = $props();

  const draft = $derived<DraftResult>((result ?? {}) as DraftResult);

  let refineOpen = $state<boolean>(false);
  let refineText = $state<string>('');

  function fmtTs(ts: number): string {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  async function submitRefine(): Promise<void> {
    const feedback = refineText.trim();
    if (!feedback || !draft.prompt_id) return;
    refineOpen = false;
    refineText = '';
    // Send a message that names the parent prompt + the feedback. The
    // model is biased (strict alignment) to chat_propose with
    // prompt.improve as the suggested verb.
    await chatState.sendMessage(
      `Improve prompt ${draft.prompt_id} with this feedback: ${feedback}`,
      { focused_prompt_id: draft.prompt_id },
    );
  }

  async function runThis(): Promise<void> {
    if (!draft.prompt_id) return;
    await chatState.sendMessage(
      `Run prompt ${draft.prompt_id} against the current record set.`,
      { focused_prompt_id: draft.prompt_id },
    );
  }
</script>

<div class="turn assistant">
  <div class="bubble draft">
    <div class="draft-header">
      <Chip size="sm">{capability === 'prompt.improve' ? 'Refined draft' : 'Draft'}</Chip>
      {#if draft.output_column}
        <span class="draft-col">→ <strong>{draft.output_column}</strong></span>
      {/if}
    </div>
    {#if draft.content}
      <pre class="draft-body">{draft.content}</pre>
    {/if}
    {#if draft.prompt_id}
      <div class="draft-id">id: {draft.prompt_id}</div>
    {/if}
    <div class="draft-actions">
      <Button variant="outline" size="sm" onclick={() => (refineOpen = !refineOpen)}>
        {refineOpen ? 'Cancel' : 'Refine this'}
      </Button>
      <Button variant="primary" size="sm" onclick={() => runThis()}>Run this</Button>
    </div>
    {#if refineOpen}
      <div class="refine-row">
        <textarea
          bind:value={refineText}
          placeholder="What should be different about the next version?"
          rows="2"
        ></textarea>
        <Button variant="primary" size="sm" onclick={() => submitRefine()} disabled={!refineText.trim()}>
          Send feedback
        </Button>
      </div>
    {/if}
  </div>
  <div class="meta">{fmtTs(ts)}</div>
</div>
