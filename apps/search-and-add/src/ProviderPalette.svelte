<script lang="ts">
  // Provider palette — pick the connector that fires the next search, or leave
  // it on `auto` and let the registry resolve free-tier-first.
  //
  // THIS SHIPPED AS role="radiogroup" WITH ZERO RADIOS, which is the worst of
  // the nine composite-role surfaces in the plan: the other eight promise a
  // keyboard and fail to deliver one, while this described a widget that did not
  // exist at all. Selection lived in `class:active` alone — invisible to a
  // screen reader — and unavailable providers were dimmed with `opacity: 0.35`,
  // appearance standing in for state.
  //
  // IT IS NOT RADIOS, and that is a judgement, not an omission. There is no
  // form, no `name`, no submit; `auto` is a behavioural default rather than a
  // value; and a real <input type="radio" name="…"> is a hazard in a federated
  // remote, because two mounted copies of this member would share one group name
  // and merge into a single group. It has a selected state, so it is a LISTBOX,
  // drawn as a horizontal chip row. (There is also no Selector--Radio, and one
  // sighting is not the evidence for building one.)
  //
  // Borrowed shape: apps/pack-runner's ConnectorPalette/ConnectorChip.

  import SelectorListbox from '@augment-it/shared-ui/Selector--Listbox.svelte';
  import type { ConnectorInfo } from './lib/types';

  let {
    connectors,
    selected = $bindable(),
  }: {
    connectors: ConnectorInfo[];
    selected: string | null; // null = auto (registry default)
  } = $props();

  // Search-shaped connectors only — a palette chip must be able to serve
  // search.fire's default intent.
  const searchable = $derived(
    connectors.filter((c) => c.capabilities.some((cap) => cap.startsWith('search.'))),
  );

  // `auto` is the registry default, not a connector, so it is the one option
  // with no ConnectorInfo behind it.
  const AUTO = 'auto';

  const options = $derived([
    { id: AUTO, label: AUTO },
    ...searchable.map((c) => ({
      id: c.id,
      label: c.short_label,
      // A provider that cannot fire is DISABLED, which the Selector both
      // announces (aria-disabled) and honours (arrows step over it). The
      // opacity that used to say this said it only to sighted users.
      disabled: c.status !== 'available',
    })),
  ]);

  const infoFor = (id: string): ConnectorInfo | undefined =>
    connectors.find((c) => c.id === id);

  function pick(id: string) {
    selected = id === AUTO ? null : id;
  }
</script>

<div class="saa-palette">
  <SelectorListbox
    {options}
    label="Search provider"
    value={selected ?? AUTO}
    option={providerOption}
    onselect={pick}
    aria-orientation="horizontal"
    style="flex-direction: row; flex-wrap: wrap; gap: var(--space-2xs);"
    data-deviation="Selector--Listbox hard-codes flex-direction:column and exposes no `orientation` prop, so a horizontal palette cannot be drawn from the API. Its own arrow handling already treats Left/Right as Up/Down, so the component is half-aware of horizontal and refuses to draw it. Raised — the fix is an `orientation` prop that sets both flex-direction and aria-orientation, not this attribute."
  />
</div>

<!-- One provider chip. Appearance only: Selector--Listbox owns the keyboard and
     the selected state. Cost tier and unavailability are now TEXT rather than a
     dashed border and an opacity — they are meaning, so they get words, and
     they are visible to touch and keyboard users the `title` never reached. -->
{#snippet providerOption(o: { id: string; label: string })}
  {@const c = infoFor(o.id)}
  <span class="saa-provider-label">{o.label}</span>
  {#if c}
    <span class="saa-provider-tier">{c.cost_tier}</span>
    {#if c.status !== 'available'}
      <span class="saa-provider-status">{c.status}</span>
    {/if}
  {:else}
    <span class="saa-provider-tier">registry default</span>
  {/if}
{/snippet}
