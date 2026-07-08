<script lang="ts">
  // SignInWall — the shell's full pre-auth wall (Build-Order Step 7).
  // Mounted INSTEAD OF the header + stage when the instance reports
  // DIDI_AUTH=required (workspace.didi_auth_mode) and no didi_id has
  // verified on the WS session — no remote gets a chance to mount, so a
  // single-tenant deploy never shows so much as a flash of another
  // client's surface to an unauthenticated visitor.
  //
  // Sign-in mechanics mirror DidiBadge.svelte's (headless contract: this
  // panel owns the pixels, calls the id service's magic-link endpoints
  // directly) — duplicated rather than shared, since the wall's full-page
  // layout and DidiBadge's popover have nothing else in common.

  const ID_BASE =
    ((import.meta as { env?: Record<string, string> }).env?.PUBLIC_ID_BASE as
      | string
      | undefined) ?? 'http://localhost:4000';

  let email = $state('');
  let busy = $state(false);
  let notice = $state('');
  let emailInput = $state<HTMLInputElement | undefined>(undefined);

  $effect(() => {
    emailInput?.focus();
  });

  async function signIn(e: SubmitEvent) {
    e.preventDefault();
    if (!email || busy) return;
    busy = true;
    notice = '';
    try {
      const issue = await fetch(`${ID_BASE}/api/magic-links`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, app: 'augment-it' }),
      }).then((r) => r.json());

      if (issue.dev_token) {
        const redeem = await fetch(`${ID_BASE}/api/magic-links/redeem`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: issue.dev_token }),
        });
        if (redeem.ok) {
          // Cookie is set — reload so the WS upgrade carries it and the
          // session frame re-verifies with a real didi_id.
          window.location.reload();
          return;
        }
        notice = 'Redeem failed — token expired?';
      } else {
        // Invite-only: unknown emails get the same 202 (no enumeration).
        notice = 'If that address has a didi.sh ID, a sign-in link was just sent — check your inbox.';
      }
    } catch {
      notice = `id service unreachable at ${ID_BASE}`;
    }
    busy = false;
  }
</script>

<div class="wall">
  <div class="wall-card">
    <img class="wall-mark" src="/didi-avatar.png" alt="" aria-hidden="true" />
    <h1>Sign in to augment-it</h1>
    <p class="wall-sub">This instance requires a didi.sh ID with access to its workspace.</p>
    <form onsubmit={signIn}>
      <input
        class="wall-input"
        type="email"
        placeholder="you@example.com"
        bind:value={email}
        bind:this={emailInput}
        required
      />
      <button class="wall-btn" disabled={busy}>
        {busy ? 'signing in…' : 'Send magic link'}
      </button>
    </form>
    {#if notice}<p class="wall-notice">{notice}</p>{/if}
    <p class="wall-fine">Invite-only · no passwords · one login across didi.sh</p>
  </div>
</div>

<style>
  .wall {
    height: 100vh;
    width: 100vw;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background);
  }
  .wall-card {
    width: 340px;
    max-width: calc(100vw - 2rem);
    padding: 2rem 1.75rem;
    border: 1px solid var(--color-border-strong, rgba(255, 255, 255, 0.2));
    border-radius: 10px;
    background: var(--color-surface-raised);
    box-shadow: var(--fx-card-shadow);
    text-align: center;
  }
  .wall-mark {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    object-fit: cover;
    margin-bottom: 0.75rem;
  }
  h1 {
    margin: 0 0 0.4rem;
    font-size: 1.1rem;
    color: var(--color-text);
  }
  .wall-sub {
    margin: 0 0 1.25rem;
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .wall-input {
    width: 100%;
    box-sizing: border-box;
    padding: 9px 11px;
    margin-bottom: 10px;
    border: 1px solid var(--color-border-strong, rgba(255, 255, 255, 0.2));
    border-radius: 6px;
    background: var(--color-background);
    color: var(--color-text);
    font-size: 13px;
  }
  .wall-btn {
    width: 100%;
    padding: 9px 11px;
    border: 1px solid var(--color-accent, #4ecf95);
    border-radius: 6px;
    background: var(--color-accent, #4ecf95);
    color: var(--color-on-accent, #101014);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .wall-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .wall-notice {
    margin: 12px 0 0;
    font-size: 11px;
    color: var(--color-accent-warm, #d29a62);
  }
  .wall-fine {
    margin: 14px 0 0;
    font-size: 10px;
    color: var(--color-text-muted);
  }
</style>
