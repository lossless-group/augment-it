<script lang="ts">
  // DidiBadge — the shell's didi.sh identity affordance (spec increment 2,
  // shell half). Lives in the header so it carries across every mounted
  // micro-app: the identity is shell-level, not per-remote.
  //
  // Signed-in state comes from the WORKSPACE session frame (didi_id is
  // server-verified on the WS upgrade — never client-asserted); the email
  // shown alongside comes from the id service's /api/me. Sign-in follows
  // the headless contract: this panel owns the pixels and calls the
  // magic-link endpoints directly. In dev the id service echoes the raw
  // token (echo_login_tokens), so sign-in completes without a mailbox;
  // in prod the same panel becomes "check your email".

  import { workspace } from '@augment-it/workspace';

  // Rsbuild injects PUBLIC_* env at build; shell tsconfig has no env
  // typings, hence the cast. Defaults to the local dev id service.
  const ID_BASE =
    ((import.meta as { env?: Record<string, string> }).env?.PUBLIC_ID_BASE as
      | string
      | undefined) ?? 'http://localhost:4000';

  let email = $state('');
  let busy = $state(false);
  let notice = $state('');
  let me = $state<{ email?: string; name?: string } | null>(null);

  const didiId = $derived(workspace.user?.didi_id ?? null);

  $effect(() => {
    if (didiId && !me) {
      fetch(`${ID_BASE}/api/me`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          me = j;
        })
        .catch(() => {});
    }
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
          // workspace re-verifies. (A transport reconnect would also work;
          // reload is the honest v0.)
          window.location.reload();
          return;
        }
        notice = 'Redeem failed — token expired?';
      } else {
        // Invite-only: unknown emails get the same 202 (no enumeration).
        notice =
          'If that address has a didi.sh ID, a sign-in link was sent. ' +
          '(dev: seed with `mix id.seed` — no dev token came back)';
      }
    } catch {
      notice = `id service unreachable at ${ID_BASE}`;
    }
    busy = false;
  }

  async function signOut() {
    try {
      await fetch(`${ID_BASE}/api/session`, { method: 'DELETE', credentials: 'include' });
    } catch {
      // cookie may outlive an unreachable id service; reload clears state
    }
    window.location.reload();
  }
</script>

<details class="didi">
  <summary
    class="didi-badge"
    class:on={didiId !== null}
    title={didiId ? `didi.sh · ${didiId}` : 'No didi.sh ID connected'}
  >
    <img class="didi-mark" src="/didi-avatar.png" alt="" aria-hidden="true" />
    {#if didiId}
      <span class="didi-label">{me?.email ?? didiId.slice(0, 8)}</span>
    {:else}
      <span class="didi-label didi-label--muted">sign in</span>
    {/if}
  </summary>

  <div class="didi-pop">
    {#if didiId}
      <p class="didi-pop__head">didi.sh ID · connected</p>
      {#if me?.name}<p class="didi-row"><span>name</span>{me.name}</p>{/if}
      {#if me?.email}<p class="didi-row"><span>email</span>{me.email}</p>{/if}
      <p class="didi-row"><span>sub</span>{didiId}</p>
      <p class="didi-row"><span>verified</span>on WS upgrade · JWKS</p>
      <button class="didi-btn" onclick={signOut}>Sign out everywhere</button>
    {:else}
      <p class="didi-pop__head">Connect your didi.sh ID</p>
      <form onsubmit={signIn}>
        <input
          class="didi-input"
          type="email"
          placeholder="you@example.com"
          bind:value={email}
          required
        />
        <button class="didi-btn didi-btn--primary" disabled={busy}>
          {busy ? 'signing in…' : 'Send magic link'}
        </button>
      </form>
      {#if notice}<p class="didi-notice">{notice}</p>{/if}
      <p class="didi-fine">Invite-only · no passwords · one login across didi.sh</p>
    {/if}
  </div>
</details>

<style>
  .didi {
    position: relative;
  }
  .didi-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border: 1px solid var(--color-border-strong, rgba(255, 255, 255, 0.2));
    border-radius: 999px;
    cursor: pointer;
    list-style: none;
    font-size: 11px;
    color: var(--color-text-dim, #9a9a9a);
    background: transparent;
    user-select: none;
  }
  .didi-badge::-webkit-details-marker {
    display: none;
  }
  .didi-badge.on {
    color: var(--color-thread, #55e0d2);
    border-color: color-mix(in oklab, var(--color-thread, #55e0d2) 45%, transparent);
    background: color-mix(in oklab, var(--color-thread, #55e0d2) 10%, transparent);
  }
  .didi-mark {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }
  .didi-label--muted {
    opacity: 0.8;
  }

  .didi-pop {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    z-index: 90;
    width: 280px;
    padding: 12px 14px;
    border: 1px solid var(--color-border-strong, rgba(255, 255, 255, 0.2));
    border-radius: 8px;
    background: var(--color-bg-elevated, #1b1b22);
    box-shadow: 0 18px 40px -18px rgba(0, 0, 0, 0.6);
    font-size: 12px;
  }
  .didi-pop__head {
    margin: 0 0 8px;
    font-family: var(--font__mono, monospace);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--color-text-dim, #9a9a9a);
  }
  .didi-row {
    display: flex;
    gap: 8px;
    margin: 3px 0;
    font-family: var(--font__mono, monospace);
    font-size: 11px;
    overflow-wrap: anywhere;
  }
  .didi-row span {
    flex: 0 0 56px;
    color: var(--color-text-dim, #9a9a9a);
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.12em;
    padding-top: 2px;
  }
  .didi-input {
    width: 100%;
    padding: 7px 9px;
    margin-bottom: 8px;
    border: 1px solid var(--color-border-strong, rgba(255, 255, 255, 0.2));
    border-radius: 5px;
    background: var(--color-bg, #101014);
    color: var(--color-text, #eee);
    font-size: 12px;
  }
  .didi-btn {
    width: 100%;
    padding: 7px 9px;
    border: 1px solid var(--color-border-strong, rgba(255, 255, 255, 0.25));
    border-radius: 5px;
    background: transparent;
    color: var(--color-text, #eee);
    font-size: 12px;
    cursor: pointer;
  }
  .didi-btn--primary {
    background: var(--color-accent, #4ecf95);
    border-color: var(--color-accent, #4ecf95);
    color: var(--color-bg, #101014);
    font-weight: 600;
  }
  .didi-btn:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .didi-notice {
    margin: 8px 0 0;
    color: var(--color-accent-warm, #d29a62);
    font-size: 11px;
  }
  .didi-fine {
    margin: 10px 0 0;
    color: var(--color-text-dim, #9a9a9a);
    font-size: 10px;
  }
</style>
