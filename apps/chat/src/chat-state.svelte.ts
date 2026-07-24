// Local Svelte 5 state container for the chat surface — transcript +
// in-flight turn + the workspace connection. The workspace singleton
// owns global state (activeView, record sets, events); this owns only
// what's chat-specific (the conversation).
//
// Why a separate state object instead of putting transcript on the
// workspace singleton: per [[Per-App-Workspace-Conventions]] and
// [[Remote-Mount-Contract-for-In-App-Agent]], chat is a federation
// remote that consumes the workspace adapter but doesn't pollute global
// state with its own surface. Transcript is conversational ephemera,
// not business data — keep it local.

import { workspace, type ChatProposal, type ChatToolCall } from '@augment-it/workspace';

export type ChatTurn =
  | { kind: 'user'; id: string; message: string; ts: number }
  | { kind: 'answer'; id: string; text: string; ts: number }
  | { kind: 'propose'; id: string; text: string; proposals: ChatProposal[]; resolved: boolean; ts: number }
  | { kind: 'invoke'; id: string; text: string; tool_call: ChatToolCall; ts: number }
  | { kind: 'capability_result'; id: string; capability: string; ok: boolean; result?: unknown; error?: string; ts: number }
  | { kind: 'error'; id: string; error: string; ts: number };

class ChatState {
  turns: ChatTurn[];
  sending: boolean;
  thread_id: string;

  constructor() {
    this.turns = $state<ChatTurn[]>([]);
    this.sending = $state<boolean>(false);
    this.thread_id = `thread_${Date.now().toString(36)}`;
  }

  private push(turn: ChatTurn): void {
    this.turns = [...this.turns, turn];
  }

  /**
   * Send a user message through the workspace chatTurn() and append
   * both the user turn and the assistant response to the transcript.
   * The propose / invoke branches don't auto-act — the surface renders
   * affordances and the user clicks to accept.
   */
  async sendMessage(
    message: string,
    context?: {
      focused_prompt_id?: string;
      record_set_id?: string;
      client_id?: string;
      focused_org_slug?: string;
      focused_org_name?: string;
    },
  ): Promise<void> {
    if (this.sending) return;
    if (!message.trim()) return;
    const id = `t_${Date.now().toString(36)}`;
    this.push({ kind: 'user', id, message, ts: Date.now() });
    this.sending = true;

    // Build thread context — full transcript transformed into role/content
    // pairs for the model. User turns are 'user'; everything assistant-side
    // is 'assistant'. Capability results and errors are inlined as system-
    // visible text so the model can react to them.
    const thread = this.threadForModel();

    try {
      const reply = await workspace.chatTurn({ message, thread_id: this.thread_id, context, thread } as Parameters<typeof workspace.chatTurn>[0]);
      const replyId = `r_${id}`;
      if (reply.mode === 'answer') {
        this.push({ kind: 'answer', id: replyId, text: reply.text, ts: Date.now() });
      } else if (reply.mode === 'propose') {
        this.push({ kind: 'propose', id: replyId, text: reply.text, proposals: reply.proposals ?? [], resolved: false, ts: Date.now() });
      } else if (reply.mode === 'invoke') {
        if (reply.tool_call) {
          this.push({ kind: 'invoke', id: replyId, text: reply.text, tool_call: reply.tool_call, ts: Date.now() });
          // In strict mode the model rarely picks this branch, but if it
          // does we run the tool call eagerly. The Window stays in sync
          // via the WebSocket broadcast.
          await this.runToolCall(reply.tool_call);
        }
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this.push({ kind: 'error', id: `e_${id}`, error, ts: Date.now() });
    } finally {
      this.sending = false;
    }
  }

  /**
   * Accept a proposal from a propose-turn. Marks the turn resolved so the
   * UI hides the affordance, then runs the chosen capability.
   */
  async acceptProposal(turn_id: string, proposal_index: number): Promise<void> {
    const turn = this.turns.find((t) => t.id === turn_id && t.kind === 'propose');
    if (!turn || turn.kind !== 'propose') return;
    const proposal = turn.proposals[proposal_index];
    if (!proposal) return;
    // Mark resolved before running so the UI doesn't show stale affordances.
    this.turns = this.turns.map((t) =>
      t.id === turn_id && t.kind === 'propose' ? { ...t, resolved: true } : t,
    );
    await this.runToolCall(proposal);
  }

  /** Decline all proposals on a propose-turn — just dismisses the affordance row. */
  declineProposals(turn_id: string): void {
    this.turns = this.turns.map((t) =>
      t.id === turn_id && t.kind === 'propose' ? { ...t, resolved: true } : t,
    );
  }

  private async runToolCall(tool_call: { capability: string; args: unknown }): Promise<void> {
    const cap_id = `cap_${Date.now().toString(36)}`;
    try {
      const result = await workspace.invoke(tool_call.capability, tool_call.args, 'didi-agent');
      this.push({
        kind: 'capability_result',
        id: cap_id,
        capability: tool_call.capability,
        ok: true,
        result,
        ts: Date.now(),
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      this.push({
        kind: 'capability_result',
        id: cap_id,
        capability: tool_call.capability,
        ok: false,
        error,
        ts: Date.now(),
      });
    }
  }

  /**
   * Transform the local transcript into the role/content shape the model
   * sees on the next turn. Keeps it lean — we don't send every prior
   * capability_result as a full payload, just a short summary line.
   */
  private threadForModel(): { role: 'user' | 'assistant'; content: string }[] {
    return this.turns.map((t): { role: 'user' | 'assistant'; content: string } => {
      if (t.kind === 'user') return { role: 'user', content: t.message };
      if (t.kind === 'answer') return { role: 'assistant', content: t.text };
      if (t.kind === 'propose') {
        const proposalLines = t.proposals.map((p) => `- proposed: ${p.capability} (${p.hint})`).join('\n');
        return { role: 'assistant', content: `${t.text}\n${proposalLines}` };
      }
      if (t.kind === 'invoke') {
        return { role: 'assistant', content: `${t.text}\n(invoked ${t.tool_call.capability})` };
      }
      if (t.kind === 'capability_result') {
        const summary = t.ok ? `succeeded` : `failed: ${t.error ?? 'unknown'}`;
        return { role: 'user', content: `[system: ${t.capability} ${summary}]` };
      }
      return { role: 'user', content: `[system: error — ${t.error}]` };
    });
  }
}

export const chatState = new ChatState();
