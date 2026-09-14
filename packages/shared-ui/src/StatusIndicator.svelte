<script lang="ts">
  /**
   * StatusIndicator — one connection state, rendered the same way everywhere.
   *
   * THE FINDING THAT PRODUCED IT: three members drew `connection_status`
   * BYTE-FOR-BYTE the same wrong way, independently, with no shared code —
   * `open` green, `closed` and `error` sharing one red, and `connecting` and
   * `auth_required` sharing one undifferentiated grey. Five states, three
   * appearances. A user watching that strip could not tell a dropped socket from
   * a handshake in progress.
   *
   * A fourth member had only ONE state rule, so four of its five states rendered
   * identically as plain muted text.
   *
   * The mapping is the component. Each state gets its own tone and its own word:
   *
   *   open           ok       connected and healthy
   *   connecting     info     transient, nothing is wrong
   *   auth_required  warn     degraded and ACTIONABLE — the operator can clear it
   *   closed         error    disconnected
   *   error          error    failed
   *   idle           neutral  no attempt made
   *
   * `auth_required` as warn rather than error is the distinction every member
   * lost: it is a gate the operator can walk through, not a failure.
   *
   * NEVER COLOUR ALONE. The dot is `aria-hidden` and the word always renders.
   * That was a live WCAG 1.4.1 defect in one member, where the only signal an
   * agent was running was a pulsing dot — and `theme.css`'s global
   * `prefers-reduced-motion` block sets `animation-iteration-count: 1`, so for a
   * reduced-motion user it pulsed once and then meant nothing at all.
   */
  // Re-exported for compatibility; the declaration lives in ./status.ts, which a
  // member can actually import through the package exports map. Sixteen members
  // had re-declared this union by hand because it was unreachable here.
  import type { ConnectionState } from './status.js';
  export type { ConnectionState };

  type Props = {
    state: ConnectionState;
    /** What is connected — "SurrealDB", "workspace". Prefixes the label. */
    of?: string;
    class?: string;
    [key: string]: unknown;
  };

  let { state, of: subject, class: klass = '', ...rest }: Props = $props();

  const TONE: Record<ConnectionState, 'ok' | 'info' | 'warn' | 'error' | 'neutral'> = {
    open: 'ok',
    connecting: 'info',
    auth_required: 'warn',
    closed: 'error',
    error: 'error',
    idle: 'neutral',
  };

  const WORD: Record<ConnectionState, string> = {
    open: 'connected',
    connecting: 'connecting…',
    auth_required: 'sign-in required',
    closed: 'disconnected',
    error: 'error',
    idle: 'idle',
  };

  const tone = $derived(TONE[state] ?? 'neutral');
  const word = $derived(WORD[state] ?? state);
</script>

<span class="ui-status {klass}" data-tone={tone} data-state={state} {...rest}>
  <span class="ui-status__dot" aria-hidden="true"></span>
  <span class="ui-status__word">{subject ? `${subject} ${word}` : word}</span>
</span>

<style>
  .ui-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2xs);
    min-block-size: var(--control-h-sm);
    font-family: var(--font-sans);
    font-size: var(--text-label);
    white-space: nowrap;
  }
  .ui-status__dot {
    inline-size: var(--space-xs);
    block-size: var(--space-xs);
    border-radius: var(--radius-round);
    background: currentColor;
    flex: 0 0 auto;
  }
  .ui-status[data-tone='ok']      { color: var(--color-ok-fg); }
  .ui-status[data-tone='info']    { color: var(--color-info-fg); }
  .ui-status[data-tone='warn']    { color: var(--color-warn-fg); }
  .ui-status[data-tone='error']   { color: var(--color-error-fg); }
  .ui-status[data-tone='neutral'] { color: var(--color-text-muted); }
</style>
