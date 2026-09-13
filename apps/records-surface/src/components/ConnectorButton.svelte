<script lang="ts">
  /**
   * ConnectorButton — a DOMAIN control, not a styling fork.
   *
   * It survives the Button rollout as a WRAPPER rather than being replaced at
   * the call site, because what it owns is not appearance: the connector
   * identity (`data-connector`), the in-flight affordance (spinner +
   * `aria-busy`), and the disabled-reason tooltip. Deleting it would push all
   * three into RecordRow's connector loop, three times over, for no gain. What it
   * no longer owns is the control box — border, radius, padding, hover, disabled,
   * focus ring — all of which now come from the federal <Button>.
   *
   * Variant by ROLE: firing a read-only connector is a quiet, repeatable
   * action, so `outline`. It is not the commit action on this row (that is
   * `pick` in CandidatesPanel, which is `primary`).
   */
  import Button from '@augment-it/shared-ui/Button.svelte';
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

<Button
  variant="outline"
  {disabled}
  {onclick}
  title={disabled ? 'no URL on this row' : `Fire ${label}`}
  data-connector={connector_id}
  aria-busy={firing ? 'true' : undefined}
>
  {#if firing}
    <span class="spinner" aria-hidden="true"></span>
  {/if}
  {label}
</Button>

<style>
  /* All that is left: the in-flight indicator. The spinner rides in the
     children snippet, so it is compiled in THIS component and keeps its
     scoping hash — the one thing that still crosses the component boundary
     cleanly in a scoped member. */
  .spinner {
    width: var(--icon-sm);
    height: var(--icon-sm);
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: var(--radius-round);
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
