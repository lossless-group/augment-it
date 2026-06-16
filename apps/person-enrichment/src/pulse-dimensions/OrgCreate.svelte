<script lang="ts">
  // Pulse-dimension: organization. Operator types name fields and hits
  // Enter — find-or-create runs immediately. After the org exists,
  // each nested LinkList row commits independently on Enter.

  import LinkList from './LinkList.svelte';
  import type { Link } from '../lib/types';

  let {
    complete_name     = $bindable(''),
    conventional_name = $bindable(''),
    org_links         = $bindable<Link[]>([]),
    org_corpus        = $bindable<Link[]>([]),
    onSaveOrgName,
    onAppendOrgLink,
    onAppendOrgCorpus,
  }: {
    complete_name:     string;
    conventional_name: string;
    org_links:         Link[];
    org_corpus:        Link[];
    onSaveOrgName:     () => Promise<void>;
    onAppendOrgLink:   (link: Link) => Promise<void>;
    onAppendOrgCorpus: (link: Link) => Promise<void>;
  } = $props();

  let savedFlash = $state(false);
  let saving = $state(false);

  async function commitName() {
    if (saving || !complete_name.trim()) return;
    saving = true;
    try {
      await onSaveOrgName();
      savedFlash = true;
      setTimeout(() => { savedFlash = false; }, 1200);
    } finally {
      saving = false;
    }
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commitName(); }
  }
</script>

<section class="pd-section">
  <h3 class="pd-title">Organization {#if savedFlash}<span class="pd-saved">✓ saved</span>{/if}</h3>
  <div class="pd-grid-2">
    <div class="pd-field">
      <label for="org_complete">complete_name <span class="pd-hint">— formal · Enter to save</span></label>
      <input id="org_complete" type="text" class:pd-flash={savedFlash} bind:value={complete_name} onkeydown={onKey} oninput={() => savedFlash = false} placeholder="Philanthropy Roundtable" />
    </div>
    <div class="pd-field">
      <label for="org_conventional">conventional_name <span class="pd-hint">— shorthand</span></label>
      <input id="org_conventional" type="text" class:pd-flash={savedFlash} bind:value={conventional_name} onkeydown={onKey} oninput={() => savedFlash = false} placeholder="PR" />
    </div>
  </div>
  {#if complete_name}
    <div class="pd-hint">
      → will <em>find or create</em> by slug:
      <code>{complete_name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)}</code>
    </div>
  {/if}
  <div class="pd-org-links">
    <LinkList label="Org links"  bind:links={org_links}  onAppend={onAppendOrgLink} />
    <LinkList label="Org corpus (content the org publishes)" bind:links={org_corpus} onAppend={onAppendOrgCorpus} />
  </div>
</section>
