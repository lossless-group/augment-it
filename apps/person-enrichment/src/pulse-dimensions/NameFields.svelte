<script lang="ts">
  // Pulse-dimension: name. Three editable fields, all bidirectional.
  // Enter on any field commits the name to the canonical layer.

  let {
    first_name = $bindable(''),
    surname    = $bindable(''),
    onSave,
  }: {
    first_name: string;
    surname:    string;
    onSave:     () => Promise<void>;
  } = $props();

  let input_value = $state('');
  let lastComposed = $state('');
  let savedFlash = $state(false);
  let saving = $state(false);

  $effect(() => {
    const composed = [first_name, surname].filter(Boolean).join(' ');
    if (composed !== lastComposed) {
      input_value = composed;
      lastComposed = composed;
    }
  });

  function onFullNameInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    input_value = val;
    savedFlash = false;
    const parts = val.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      first_name = '';
      surname    = '';
    } else if (parts.length === 1) {
      first_name = parts[0];
      surname    = '';
    } else {
      surname    = parts[parts.length - 1];
      first_name = parts.slice(0, -1).join(' ');
    }
    lastComposed = [first_name, surname].filter(Boolean).join(' ');
  }

  async function commit() {
    if (saving) return;
    saving = true;
    try {
      await onSave();
      savedFlash = true;
      setTimeout(() => { savedFlash = false; }, 1200);
    } finally {
      saving = false;
    }
  }

  function onEnter(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
  }
</script>

<section class="pd-section">
  <h3 class="pd-title">Name {#if savedFlash}<span class="pd-saved">✓ saved</span>{/if}</h3>
  <div class="pd-stack">
    <div class="pd-field">
      <label for="full_name">full_name <span class="pd-hint">— paste or type, Enter to save</span></label>
      <input id="full_name" type="text" class:pd-flash={savedFlash} value={input_value} oninput={onFullNameInput} onkeydown={onEnter} placeholder="Charlene Kuo" />
    </div>
    <div class="pd-grid-2">
      <div class="pd-field">
        <label for="first_name">first_name</label>
        <input id="first_name" type="text" class:pd-flash={savedFlash} bind:value={first_name} onkeydown={onEnter} oninput={() => savedFlash = false} />
      </div>
      <div class="pd-field">
        <label for="surname">surname</label>
        <input id="surname" type="text" class:pd-flash={savedFlash} bind:value={surname} onkeydown={onEnter} oninput={() => savedFlash = false} />
      </div>
    </div>
  </div>
</section>
