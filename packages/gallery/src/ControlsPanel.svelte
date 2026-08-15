<script lang="ts">
  // Live knobs. The declared control values are defaults; a fixture's `props`
  // override them; edits here override both, and reset returns to the fixture.
  //
  // Controls are what separate a gallery from a screenshot: the states worth
  // pinning get fixtures, and everything else — the long title, the 0 and the
  // 100, the empty string — is one drag away instead of one commit away.

  import type { ControlSpec } from './types';

  let {
    controls,
    values,
    onchange,
    onreset,
    dirty,
  }: {
    controls: Record<string, ControlSpec>;
    values: Record<string, unknown>;
    onchange: (key: string, value: unknown) => void;
    onreset: () => void;
    dirty: boolean;
  } = $props();

  const keys = $derived(Object.keys(controls));
</script>

{#if keys.length === 0}
  <p class="agx-empty">
    This entry declares no controls. Add a <code>controls</code> block to its catalog entry to make
    its props adjustable here.
  </p>
{:else}
  <div class="agx-controls">
    {#each keys as key (key)}
      {@const spec = controls[key]}
      <label class="agx-control">
        <span class="agx-control-name">{spec.label ?? key}</span>

        {#if spec.kind === 'text'}
          <input
            type="text"
            value={String(values[key] ?? '')}
            oninput={(e) => onchange(key, e.currentTarget.value)}
          />
        {:else if spec.kind === 'number'}
          <span class="agx-control-num">
            <input
              type="range"
              min={spec.min ?? 0}
              max={spec.max ?? 100}
              step={spec.step ?? 1}
              value={Number(values[key] ?? 0)}
              oninput={(e) => onchange(key, Number(e.currentTarget.value))}
            />
            <output>{values[key]}</output>
          </span>
        {:else if spec.kind === 'boolean'}
          <input
            type="checkbox"
            checked={Boolean(values[key])}
            onchange={(e) => onchange(key, e.currentTarget.checked)}
          />
        {:else if spec.kind === 'select'}
          <select value={String(values[key] ?? '')} onchange={(e) => onchange(key, e.currentTarget.value)}>
            {#each spec.options as opt (opt)}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        {/if}
      </label>
    {/each}
  </div>

  <button class="agx-btn" onclick={onreset} disabled={!dirty}>Reset to fixture</button>
{/if}
