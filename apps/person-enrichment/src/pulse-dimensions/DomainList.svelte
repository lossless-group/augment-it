<script lang="ts">
  // Reusable list-of-domains sub-dimension. Used for org-level email
  // domains. Two text inputs per row: the bare hostname + a free-text
  // kind ("primary", "secondary", "alias", "parent_domain", "subunit",
  // …). No dropdown — same flexibility principle as LinkList. Enter on
  // either input commits the row.

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
    <div class="pd-stack">
      {#each domains as _d, i (i)}
        <div class="pd-domain-row">
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
          <button type="button" class="pd-icon-btn" onclick={() => remove(i)} title="Remove">×</button>
        </div>
      {/each}
    </div>
  {/if}
  <button type="button" class="pd-ghost-btn" onclick={add}>+ add domain</button>
</section>
