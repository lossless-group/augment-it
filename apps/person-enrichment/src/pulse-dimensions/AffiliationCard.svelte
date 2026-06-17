<script lang="ts">
  // Pulse-dimension: ONE affiliation. The person-enrichment surface
  // hosts a list of these — primary employer + board + advisor + past
  // roles. Each card has its own role (free-text), org name fields,
  // and nested LinkLists for org_links + org_corpus + DomainList for
  // email-domains the org owns.
  //
  // Collapsed: pill showing `role · conventional_name`.
  // Expanded: full card with role + name fields + autocomplete + links
  //           + corpus + domains.

  import LinkList   from './LinkList.svelte';
  import DomainList from './DomainList.svelte';
  import type { AffiliationState, Link, OrgDomain, OrgSuggestion } from '../lib/types';

  let {
    affiliation = $bindable<AffiliationState>(),
    onSaveOrgName,
    onAppendOrgLink,
    onAppendOrgCorpus,
    onAppendOrgDomain,
    onLookupOrgs,
    onPickOrg,
    onExpand,
    onRemove,
  }: {
    affiliation:       AffiliationState;
    onSaveOrgName:     () => Promise<void>;
    onAppendOrgLink:   (link: Link) => Promise<void>;
    onAppendOrgCorpus: (link: Link) => Promise<void>;
    onAppendOrgDomain: (d: OrgDomain) => Promise<void>;
    onLookupOrgs:      (q: string) => Promise<OrgSuggestion[]>;
    onPickOrg:         (o: OrgSuggestion) => void;
    onExpand?:         () => Promise<void> | void;
    onRemove:          () => void;
  } = $props();

  let hydrating = $state(false);

  let savedFlash = $state(false);
  let saving = $state(false);

  // ---- Autocomplete -----------------------------------------------------
  let suggestions  = $state<OrgSuggestion[]>([]);
  let lookupSeq    = $state(0);                  // monotone — drops stale responses
  let lookupTimer: ReturnType<typeof setTimeout> | null = null;
  let suggestOpen  = $state(false);

  function scheduleLookup(q: string) {
    if (lookupTimer) clearTimeout(lookupTimer);
    const seq = ++lookupSeq;
    if (!q || q.trim().length < 2) { suggestions = []; suggestOpen = false; return; }
    lookupTimer = setTimeout(async () => {
      try {
        const r = await onLookupOrgs(q);
        if (seq !== lookupSeq) return;           // a newer request landed first
        suggestions = r;
        suggestOpen = r.length > 0;
      } catch {
        if (seq === lookupSeq) { suggestions = []; suggestOpen = false; }
      }
    }, 180);
  }

  function pick(o: OrgSuggestion) {
    onPickOrg(o);
    suggestions = [];
    suggestOpen = false;
  }
  function onCompleteInput() {
    savedFlash = false;
    affiliation.activeOrgId = null;              // user editing the name dissociates the picked org
    scheduleLookup(affiliation.completeName);
  }

  // ---- Save-name -------------------------------------------------------
  async function commitName() {
    if (saving || !affiliation.completeName.trim()) return;
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
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (suggestOpen && suggestions.length > 0) {
        pick(suggestions[0]);                    // Enter on the input → first match
        return;
      }
      commitName();
    } else if (e.key === 'Escape' && suggestOpen) {
      suggestOpen = false;
    }
  }
  async function expand() {
    affiliation.expanded = true;
    if (!onExpand) return;
    hydrating = true;
    try { await onExpand(); } finally { hydrating = false; }
  }
  function collapse() { affiliation.expanded = false; }
</script>

{#if !affiliation.expanded}
  <button type="button" class="pe-affiliation-pill" onclick={expand} title="Expand to edit">
    <span class="pe-affiliation-pill-role">{affiliation.role || '(no role)'}</span>
    <span class="pe-affiliation-pill-sep">·</span>
    <span class="pe-affiliation-pill-name">{affiliation.conventionalName || affiliation.completeName || '(unnamed org)'}</span>
    {#if affiliation.affiliationCreated}<span class="pe-affiliation-pill-tag">saved</span>{/if}
    {#if !affiliation.affiliationCreated && affiliation.autoDetectedFrom}<span class="pe-affiliation-pill-tag pe-affiliation-pill-tag-auto">auto-detected</span>{/if}
  </button>
{:else}
  <section class="pd-section pe-affiliation-expanded">
    <div class="pe-affiliation-header">
      <h3 class="pd-title">Affiliation {#if hydrating}<span class="pd-hint">— loading org details…</span>{/if} {#if savedFlash}<span class="pd-saved">✓ saved</span>{/if}</h3>
      <span class="pe-spacer"></span>
      <button type="button" class="pe-btn pe-btn-ghost" onclick={collapse} title="Collapse">collapse</button>
      <button type="button" class="pd-icon-btn" onclick={onRemove} title="Remove from this person's affiliations (does not delete the org)">×</button>
    </div>

    {#if affiliation.autoDetectedFrom}
      <div class="pe-auto-detect">
        ✓ Pre-filled
        {#if affiliation.autoDetectedFrom === 'previous_affiliation'}
          — already on file from a previous session
        {:else}
          — matched email domain
        {/if}
      </div>
    {/if}

    <div class="pe-affiliation-row">
      <div class="pd-field">
        <label for="aff_role_{affiliation.uiId}">role <span class="pd-hint">— free-text · Enter to save</span></label>
        <input
          id="aff_role_{affiliation.uiId}"
          type="text"
          class:pd-flash={savedFlash}
          bind:value={affiliation.role}
          onkeydown={onKey}
          oninput={() => savedFlash = false}
          placeholder="primary · board · advisor · past CFO · investor · …"
        />
      </div>
      <div class="pd-field pe-org-name-field">
        <label for="aff_complete_{affiliation.uiId}">
          complete_name <span class="pd-hint">— formal · type 2+ chars for suggestions</span>
        </label>
        <input
          id="aff_complete_{affiliation.uiId}"
          type="text"
          autocomplete="off"
          class:pd-flash={savedFlash}
          bind:value={affiliation.completeName}
          onkeydown={onKey}
          oninput={onCompleteInput}
          onfocus={() => { if (suggestions.length > 0) suggestOpen = true; }}
          placeholder="The Institute for Humane Studies"
        />
        {#if suggestOpen && suggestions.length > 0}
          <ul class="pe-org-suggest">
            {#each suggestions as o, i (String(o.id))}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <li class="pe-org-suggest-row" onclick={() => pick(o)}>
                <span class="pe-org-suggest-name">{o.complete_name ?? '(unnamed)'}</span>
                {#if o.conventional_name && o.conventional_name !== o.complete_name}
                  <span class="pe-org-suggest-conv">{o.conventional_name}</span>
                {/if}
                {#if i === 0}<span class="pe-org-suggest-enter">↵</span>{/if}
              </li>
            {/each}
            <li class="pe-org-suggest-hint">Click or press <kbd>↵</kbd> to use existing · keep typing to create new</li>
          </ul>
        {/if}
        {#if affiliation.activeOrgId}
          <div class="pd-hint">
            → using existing org <code>{String(affiliation.activeOrgId).slice(0, 38)}…</code>
          </div>
        {:else if affiliation.completeName}
          <div class="pd-hint">
            → no match — will <em>find or create</em> by slug:
            <code>{affiliation.completeName.trim().toLowerCase().replace(/^the\s+/, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)}</code>
          </div>
        {/if}
      </div>
      <div class="pd-field">
        <label for="aff_conventional_{affiliation.uiId}">conventional_name <span class="pd-hint">— shorthand</span></label>
        <input
          id="aff_conventional_{affiliation.uiId}"
          type="text"
          class:pd-flash={savedFlash}
          bind:value={affiliation.conventionalName}
          onkeydown={onKey}
          oninput={() => savedFlash = false}
          placeholder="IHS"
        />
      </div>
    </div>

    <div class="pd-org-links">
      <LinkList   label="Org links"  bind:links={affiliation.orgLinks}  onAppend={onAppendOrgLink} />
      <LinkList   label="Org corpus (content the org publishes)" bind:links={affiliation.orgCorpus} onAppend={onAppendOrgCorpus} />
      <DomainList label="Email domains the org owns / accepts mail at"  bind:domains={affiliation.orgDomains} onAppend={onAppendOrgDomain} />
    </div>
  </section>
{/if}
