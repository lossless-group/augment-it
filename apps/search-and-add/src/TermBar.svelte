<script lang="ts">
  // THE editable search term — the flow's standing constraint made chrome:
  // every fired term is displayed here and the operator rewrites it freely,
  // because phrasing intuition beats any fixed template. Enter or the button
  // re-fires; the parent owns the actual firing.

  import Button from '@augment-it/shared-ui/Button.svelte';

  let {
    term = $bindable(),
    firing,
    onfire,
  }: {
    term: string;
    firing: boolean;
    onfire: () => void;
  } = $props();

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!firing && term.trim()) onfire();
  }
</script>

<form class="saa-termbar" onsubmit={submit}>
  <input
    class="saa-term"
    type="text"
    bind:value={term}
    placeholder="search term — edit freely, variants find different things"
    autocomplete="off"
    spellcheck="false"
  />
  <Button type="submit" variant="primary" size="lg" disabled={firing || !term.trim()}>
    {firing ? 'searching…' : 'Search'}
  </Button>
</form>
