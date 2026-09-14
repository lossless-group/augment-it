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
  //
  // THE DEBOUNCE, THE STALE GUARD AND THE KEYBOARD ARE NO LONGER HERE.
  // SearchBox--Autocomplete owns all three. The guard this file used to carry —
  // `if (seq !== lookupSeq) return`, present in the catch as well as the success
  // path — was the COMPLETE one of the two hand-rolls in the federation, and it
  // is the reason the component has one. org-workbench's twin guarded only the
  // success path. Both are gone; the component's is tested in
  // packages/shared-ui/test/searchbox.test.ts.
  //
  // What this file never had: role="combobox", aria-expanded, aria-controls,
  // aria-activedescendant, and any arrow key at all. Enter hard-picked
  // suggestions[0], so the SECOND suggestion was unreachable without a mouse
  // and — worse — the operator could not commit a name they had typed while any
  // suggestion was on screen, because Enter was taken. Both are fixed by the
  // contract rather than by more local code.
  //
  // Spec: context-v/specs/SearchBox-LiveFilter-And-Autocomplete.md

  import Button     from '@augment-it/shared-ui/Button.svelte';
  import SearchBoxAutocomplete from '@augment-it/shared-ui/SearchBox--Autocomplete.svelte';
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
  // `byId` is how a SearchOption id gets back to its OrgSuggestion. Rebuilt per
  // lookup, so it can only ever hold what is currently on screen.
  type OrgOption = { id: string; label: string; conv: string | null };
  let byId = new Map<string, OrgSuggestion>();

  async function lookupOrgs(q: string): Promise<OrgOption[]> {
    const found = await onLookupOrgs(q);
    byId = new Map(found.map((o) => [String(o.id), o]));
    return found.map((o) => ({
      id: String(o.id),
      label: o.complete_name ?? '(unnamed)',
      conv: o.conventional_name && o.conventional_name !== o.complete_name
        ? o.conventional_name
        : null,
    }));
  }

  function onSelectOrg(id: string) {
    const org = byId.get(id);
    // pickOrg() in App.svelte writes complete_name AND conventional_name back
    // onto the affiliation, so `bind:value` carries the chosen name into the box.
    // That is also why `clearOnSelect` is wrong here: this field is the value
    // being saved, not a search term to be thrown away after use.
    if (org) onPickOrg(org);
  }

  // THE DELEGATION RECIPE, not a workaround. `oninput`, `onkeydown` and `value`
  // are refused by the component out loud — they are the keyboard contract — so
  // a member that also wants the keystrokes listens on a WRAPPER. Both handlers
  // below run in the bubble phase, after the widget has had the event.
  function onNameInput(e: Event) {
    if ((e.target as HTMLElement | null)?.tagName !== 'INPUT') return;
    savedFlash = false;
    affiliation.activeOrgId = null;              // user editing the name dissociates the picked org
  }

  function onNameKey(e: KeyboardEvent) {
    // `defaultPrevented` is set IFF the widget picked an active option. Enter
    // with nothing active is the MEMBER's submit — which is the capability this
    // surface did not have, because Enter always belonged to suggestions[0].
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    commitName();
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
  // The role and conventional_name fields are plain inputs — Enter commits.
  // The org-name field is a combobox and uses onNameKey instead; Escape there
  // belongs to the widget.
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    commitName();
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
      <Button variant="ghost" size="sm" onclick={collapse} title="Collapse">collapse</Button>
      <Button
        variant="secondary"
        size="icon"
        onclick={onRemove}
        title="Remove from this person's affiliations (does not delete the org)"
        aria-label="Remove the affiliation with {affiliation.conventionalName || affiliation.completeName || 'this org'} from this person"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4 L12 12 M12 4 L4 12" /></svg>
      </Button>
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
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- The wrapper carries the handlers because the widget refuses `oninput`
           and `onkeydown` — they ARE its keyboard contract. This is the recipe
           the component's own error message names, not a way around it. -->
      <div class="pd-field pe-org-name-field" oninput={onNameInput} onkeydown={onNameKey}>
        <label for="aff_complete_{affiliation.uiId}">
          complete_name <span class="pd-hint">— formal · 2+ chars to search · ↓ to choose</span>
        </label>
        <SearchBoxAutocomplete
          id="aff_complete_{affiliation.uiId}"
          bind:value={affiliation.completeName}
          lookup={lookupOrgs}
          onselect={onSelectOrg}
          label="complete_name"
          placeholder="The Institute for Humane Studies"
          minLength={2}
          debounceMs={180}
        >
          {#snippet option(o)}
            <span class="pe-org-suggest-row">
              <span class="pe-org-suggest-name">{o.label}</span>
              {#if o.conv}<span class="pe-org-suggest-conv">{o.conv}</span>{/if}
            </span>
          {/snippet}
        </SearchBoxAutocomplete>
        <div class="pd-hint">
          <kbd>↓</kbd> then <kbd>↵</kbd> uses an existing org · <kbd>↵</kbd> on its own saves the
          name you typed
        </div>
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
