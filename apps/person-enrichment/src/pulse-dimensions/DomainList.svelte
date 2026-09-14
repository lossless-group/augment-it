<script lang="ts">
  // Reusable list-of-domains sub-dimension. Used for org-level email
  // domains. Two text inputs per row: the bare hostname + a free-text
  // kind ("primary", "secondary", "alias", "parent_domain", "subunit",
  // …). No dropdown — same flexibility principle as LinkList. Enter on
  // either input commits the row.

  import Button from '@augment-it/shared-ui/Button.svelte';
  import CardRow from '@augment-it/shared-ui/CardRow.svelte';
  import ListContainer from '@augment-it/shared-ui/ListContainer.svelte';
  import type { OrgDomain } from '../lib/types';

  let {
    label,
    domains = $bindable<OrgDomain[]>([]),
    onAppend,
  }: {
    label:    string;
    domains:  OrgDomain[];
    onAppend: (d: OrgDomain) => Promise<void>;
  } = $props();

  let saved = $state<boolean[]>([]);

  function add() {
    domains = [...domains, { domain: '', kind: 'primary' }];
    saved = [...saved, false];
  }
  function remove(i: number) {
    domains = domains.filter((_, idx) => idx !== i);
    saved   = saved.filter((_, idx) => idx !== i);
  }
  function normalize(d: string): string {
    return d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }
  async function commit(i: number) {
    const d = domains[i];
    if (!d || !d.domain.trim()) return;
    d.domain = normalize(d.domain);
    await onAppend({ domain: d.domain, kind: (d.kind || 'primary').trim() });
    saved[i] = true;
    setTimeout(() => { saved[i] = false; }, 1200);
  }
  function onKey(i: number, e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(i); }
  }
</script>

<section class="pd-section">
  <h3 class="pd-title">{label}</h3>
  {#if domains.length > 0}
    <ListContainer gap="sm">
      {#each domains as _d, i (i)}
        <CardRow density="compact">
          <!-- rung 0: .pd-domain-row is a 4-TRACK GRID — same story as LinkList. -->
          <span class="pd-domain-row">
            <input
              type="text"
              class="pd-domain-host"
              class:pd-flash={saved[i]}
              bind:value={domains[i].domain}
              oninput={() => { saved[i] = false; }}
              onkeydown={(e) => onKey(i, e)}
              placeholder="theihs.org · ihs.gmu.edu — Enter to save"
            />
            <input
              type="text"
              class="pd-domain-kind"
              class:pd-flash={saved[i]}
              bind:value={domains[i].kind}
              oninput={() => { saved[i] = false; }}
              onkeydown={(e) => onKey(i, e)}
              placeholder="primary · secondary · alias · parent_domain · subunit"
            />
            {#if saved[i]}<span class="pd-saved">✓</span>{/if}
            <Button
              variant="secondary"
              size="icon"
              onclick={() => remove(i)}
              title="Remove this domain row"
              aria-label="Remove domain row {i + 1}"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4 L12 12 M12 4 L4 12" /></svg>
            </Button>
          </span>
        </CardRow>
      {/each}
    </ListContainer>
  {/if}
  <Button variant="outline" size="sm" onclick={add} class="pd-add">
    + add domain
  </Button>
</section>
