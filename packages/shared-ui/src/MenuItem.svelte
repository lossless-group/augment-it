<script lang="ts">
  /**
   * MenuItem — one row of a menu. Appearance only; `Selector--Menu` owns the
   * keyboard.
   *
   * Same split as `ListContainer` and `CardRow`: the composite widget owns the
   * roving tabindex and the arrow keys, the item owns how it looks. An item that
   * handled its own keydown would give the widget N tab stops, which is the
   * defect the Selector exists to replace.
   *
   * `danger` sets `data-danger`, not just a colour. A destructive action
   * distinguished by hue alone is WCAG 1.4.1, and a data attribute is something
   * the member — and a test — can read.
   */
  import type { Snippet } from 'svelte';

  type Props = {
    label: string;
    danger?: boolean;
    disabled?: boolean;
    /** Right-aligned hint — a keyboard shortcut or a count. */
    hint?: string;
    /** Leading icon. SVG, never a glyph — same rule as Button. */
    icon?: Snippet;
    children?: Snippet;
    [key: string]: unknown;
  };

  let { label, danger = false, disabled = false, hint, icon, children, ...rest }: Props = $props();
</script>

<span class="ui-menuitem" data-danger={danger || undefined} data-disabled={disabled || undefined} {...rest}>
  {#if icon}<span class="ui-menuitem__icon" aria-hidden="true">{@render icon()}</span>{/if}
  <span class="ui-menuitem__label">{#if children}{@render children()}{:else}{label}{/if}</span>
  {#if hint}<span class="ui-menuitem__hint">{hint}</span>{/if}
</span>

<style>
  .ui-menuitem {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    inline-size: 100%;
    min-inline-size: 0;
    font-family: var(--font-sans);
    font-size: var(--text-body);
    color: inherit;
  }
  .ui-menuitem__icon { display: inline-flex; flex: 0 0 auto; }
  .ui-menuitem__icon :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .ui-menuitem__label {
    flex: 1 1 auto;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ui-menuitem__hint {
    flex: 0 0 auto;
    color: var(--color-text-muted);
    font-size: var(--text-label);
  }
  .ui-menuitem[data-danger] { color: var(--color-error-fg); }
  .ui-menuitem[data-disabled] { color: var(--color-text-muted); }
</style>
