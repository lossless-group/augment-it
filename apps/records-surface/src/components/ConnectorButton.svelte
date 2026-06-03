<script lang="ts">
  import type { ConnectorId } from '../types';

  type Props = {
    connector_id: ConnectorId;
    label: string;
    disabled: boolean;
    firing: boolean;
    onclick: () => void;
  };
  let { connector_id, label, disabled, firing, onclick }: Props = $props();
</script>

<button
  class="connector-btn"
  class:firing
  {disabled}
  onclick={onclick}
  title={disabled ? 'no URL on this row' : `Fire ${label}`}
  data-connector={connector_id}
>
  {#if firing}
    <span class="spinner" aria-hidden="true"></span>
  {/if}
  <span class="connector-btn-label">{label}</span>
</button>

<style>
  .connector-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: transparent;
    color: var(--color-text);
    font-size: 0.8rem;
    cursor: pointer;
  }
  .connector-btn:hover:not(:disabled) {
    background: var(--color-surface, rgba(0, 0, 0, 0.05));
    border-color: var(--color-text);
  }
  .connector-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .connector-btn.firing {
    border-color: var(--color-accent, var(--color-text));
    color: var(--color-accent, var(--color-text));
  }
  .spinner {
    width: 0.75rem;
    height: 0.75rem;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
