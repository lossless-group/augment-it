// corpora-curator's component library.
//
// This file is the member's half of the bargain: @augment-it/gallery owns how a
// library is browsed, isolated, deep-linked and audited; this owns what is IN
// one. Nothing here is discovered by convention — the expensive knowledge in a
// component library is not "which files exist" but "which states are worth
// pinning", and that only ever comes from whoever owns the component.
//
// Reachable three ways:
//   · in the shell   — Developers → Component libraries → corpora-curator
//   · standalone     — http://localhost:3017/#/gallery
//   · one specimen   — http://localhost:3017/#/gallery/source-row/active?iso=1
//
// The third is the one that matters for review: it is a bare URL on this
// member's own origin, so it opens on a phone against the LAN address, goes in
// a bug report, or gets screenshotted without the shell running at all.

import { defineGallery } from '@augment-it/gallery';
import SourceDetail from '../SourceDetail.svelte';
import SourceList from '../SourceList.svelte';
import CorpusPicker from '../CorpusPicker.svelte';
import TagBar from '../TagBar.svelte';
import {
  attachedFile,
  banner,
  buttons,
  card,
  chips,
  emptyState,
  fields,
  headerBar,
  sourceRow,
  statusIndicator,
  tags,
} from './patterns.svelte';
import { seed, SOURCES, STRATEGIES } from './fixtures';

export default defineGallery({
  member: 'corpora-curator',
  prefix: 'cc',
  rootClass: 'cc-app',
  origin: 'http://localhost:3017',
  doc: 'apps/corpora-curator/DESIGN.md',
  spec: 'context-v/specs/Strategy-Curator-Entry-Point-for-Augment-It.md',
  blurb:
    'Corpora Curator on screen. Pick a corpus, gather sources metadata-first, fetch them, tag and extract. Tier B in the member registry, debt: high.',
  // State hooks that legitimately carry no `cc-` prefix. They only ever appear
  // alongside a prefixed class, so the containment audit would otherwise report
  // each of them as a leak. TWO entries, and that is the whole list.
  //
  // It used to be longer, and the reason it shrank is worth keeping: federal
  // components' own classes can never carry a member's prefix — they would have
  // to carry nineteen — so `ui-btn` sat here, and Chip's four BEM classes
  // (__label always, __dot and __dismiss conditionally) were queued to join it.
  // packages/gallery/src/audit.ts RESERVED the `ui-*` namespace instead, so a
  // federal component now costs an adopting catalog zero exemptions. The
  // StatusIndicator adoption is the first to arrive after that fix and paid
  // nothing: `ui-status`, `ui-status__dot` and `ui-status__word` are all
  // reserved. The old comment here argued the runtime should know the platform
  // prefix rather than every catalog restating it; it does now.
  //
  // The `status-*` entries are GONE, twice over. They existed for `.cc-conn
  // status-{state}`, which the Chip adoption deleted; the Chip that replaced it
  // is itself gone now, and the connection label is <StatusIndicator>.
  exemptClasses: [
    'active', 'err',
  ],

  sections: [
    {
      id: 'federal',
      title: 'Federal primitives',
      blurb:
        'Owned by packages/shared-ui, consumed here. These specimens import the real component — not a copy — so what renders is what ships. This section is NEW, and it exists because two entries had outgrown the section they were in: Buttons and Pills & status chips were both sourced to packages/shared-ui while sitting under a heading that said "class-based primitives from app.css". A catalog that files a federal component as a local recipe is wrong in the one way this catalog exists to prevent.',
      entries: [
        {
          id: 'buttons',
          name: 'Buttons',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Button.svelte',
          summary:
            'Not a recipe any more. Every control in this member is the federal <Button>, spent as five variant×size pairs: primary/md (fetch, create, add source, add extract), secondary/md (retry), destructive/md (remove source), secondary/sm (‹ All corpora in the header), link/sm (‹ corpora in the list head). It was six until the Chip adoption: ghost/icon existed solely for the tag ×, which is now the dismiss control INSIDE a <Chip dismissible> rather than a Button parked next to a label. The specimen imports the real component, so what renders is what ships.',
          usage: '<Button variant="primary">+ Add</Button>',
          deviation:
            'None — zero override rungs. No radius=, no class= and no data-deviation anywhere in the member. Three controls were NOT adopted as Buttons. Two of them have since been adopted as something else: .cc-strat and .cc-row both wanted "a selectable list row", and that organ shipped as <CardRow> + <SelectWrapper--ClickBody> — see the Source row entry. One is still raw, .cc-tag-suggest button, whose organ (a combobox listbox option) does not exist yet.',
          a11y:
            'The floor moved. Every one of these is at least --control-h-sm (24px) tall, where the treatments they replaced were 19–26px. Boundaries are --color-border-strong (≈3.4:1) rather than --color-border (≈1.3:1, gate A22). disabled is a real attribute that shifts colour tokens, replacing the `opacity: 0.6` that used to stand in for state. The tag × is no longer catalogued here — see Tag bar recipe, which carries both the 12px → 28px → 24px history and the per-tag accessible name.',
          tokens: [
            '--control-h-sm', '--control-h-md', '--color-primary', '--color-primary-foreground',
            '--color-surface-raised', '--color-border-strong', '--color-error-bg', '--color-error-fg',
            '--color-link', '--color-selected-tint', '--color-text-muted', '--color-surface-2', '--focus-ring',
          ],
          snippet: buttons,
          controls: {
            label: { kind: 'text', label: 'primary label', value: '↓ Fetch full content' },
            disabled: { kind: 'boolean', value: false },
          },
          fixtures: [
            {
              id: 'rest',
              name: 'Rest',
              note: 'The whole vocabulary side by side. A seventh pair appearing here is a change to the federal component API, not a line appended to app.css — which is what the swap bought.',
            },
            {
              id: 'disabled',
              name: 'Disabled',
              props: { disabled: true },
              note: 'Colour tokens shift to --color-surface-2 / --color-text-muted and the control leaves the tab order. Compare with what this member did before: `opacity: 0.6` on a bare `.cc-app button` selector — appearance instead of state, and it sat at a specificity that would have painted straight over the component had it survived.',
            },
          ],
        },
        {
          id: 'chips',
          name: 'Pills & tags',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Chip.svelte',
          summary:
            'Every LABEL in this member is the federal <Chip>, spent at one size — sm everywhere, because every label here is chrome — across TWO of the six tones: neutral (workspace, corpus type, source count, metadata-only, tags) and ok (fetched). It was five tones until the StatusIndicator adoption; info, warn and error were only ever spent on connection states, and those are not labels. accent is still unspent — nothing in this member means "selected" as a label. The name changed with the scope: this entry was "Pills & status chips", and it no longer holds a status chip.',
          usage: '<Chip size="sm" tone="ok">fetched</Chip>',
          deviation:
            'None — zero override rungs. No radius=, no class= and no data-deviation, the same as this member\'s Button adoption. What this entry used to say was "three of the federation-wide 34 badge treatments; any consolidation should start here," and .cc-pill, .cc-conn, .cc-status-chip, .cc-tag and .cc-tag-mini were all deleted to make it stop being true.',
          a11y:
            'What is left here is uncontroversial and that is the news: a neutral or ok label on --color-surface-2 with a --color-border-strong boundary, text carrying its own meaning, no state encoded anywhere. The interesting claim MOVED to the StatusIndicator entry along with the connection states — including the correction that this entry used to carry, that tone came from a CONNECTION_TONE map in types.ts. It does not; that map is deleted.',
          tokens: [
            '--color-surface-2', '--color-text-muted', '--color-border-strong', '--radius-pill', '--text-label',
            '--color-ok-bg', '--color-ok-fg',
          ],
          snippet: chips,
          controls: { count: { kind: 'number', value: 4, min: 0, max: 99 } },
          fixtures: [
            {
              id: 'all',
              name: 'All treatments',
              note: 'Was "deliberately shown together — apart, each looks fine," when it held three recipes, then one row of labels plus one row of connection states. It is one row now. Compare it with the StatusIndicator entry: the shrinking of this specimen IS the other one.',
            },
          ],
        },
        {
          id: 'status-indicator',
          name: 'StatusIndicator',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/StatusIndicator.svelte',
          summary:
            'One connection state, rendered the same way in all sixteen members. Six states, six words, five tones — and the component owns BOTH halves, which is the thing a member cannot do for itself. This member had a correct six-way tone map (CONNECTION_TONE, types.ts, now deleted) and still rendered the raw union member as its label, so `auth_required` reached the operator as `auth_required`. Spent in two header slots: the right-hand indicator with of="workspace", and the workspace-picker slot without a subject.',
          usage: '<StatusIndicator state={curation.connection} of="workspace" />',
          deviation:
            'None — zero override rungs, no class= and no data-deviation, consistent with this member\'s Button and Chip adoptions. Worth recording what the adoption COST rather than only what it saved: <Chip> gave the connection label a filled pill with its own paired background, and StatusIndicator gives it a dot plus a word painted straight onto the page. The label reads lighter than it did. That is the federal component\'s call, not a deviation, and it buys the same strip in every member.',
          a11y:
            'Colour was never the only signal here — this member always rendered a word — but the word was a developer string, and "auth_required" at 11px is not an instruction. The words are prose now, and `auth_required` is WARN rather than error on purpose: it is a gate the operator can walk through, not a failure. The dot is aria-hidden, so the word is the whole accessible name, which matters more here than in a member that pulses: theme.css\'s prefers-reduced-motion block sets animation-iteration-count: 1. Contrast is the change the drift gate cannot see — text now sits on --color-surface rather than on a tone-paired background, so it was measured by hand: ok 10.18 / info 7.17 / warn 9.64 / error 7.05 / neutral 4.64 in dark, 6.53 / 6.99 / 5.60 / 6.43 / 5.25 in light, 14.50 / 9.82 / 13.27 / 8.69 / 6.77 in vibrant. All fifteen clear 4.5:1; dark neutral at 4.64 is the floor. design-drift.mjs pairs only surface x text tokens, so none of those fifteen is gate-covered — raised.',
          tokens: [
            '--space-2xs', '--space-xs', '--control-h-sm', '--radius-round', '--font-sans', '--text-label',
            '--color-ok-fg', '--color-info-fg', '--color-warn-fg', '--color-error-fg', '--color-text-muted',
          ],
          snippet: statusIndicator,
          controls: { of: { kind: 'text', label: 'subject (second row)', value: 'workspace' } },
          fixtures: [
            {
              id: 'all-states',
              name: 'All six states',
              note: 'Bare on top, subject-prefixed below — the two ways this member spends it. Read the words: this is the row that used to live in the chips specimen as six raw enum members tinted by a local map.',
            },
            {
              id: 'no-subject',
              name: 'Without a subject',
              props: { of: '' },
              width: 420,
              note: 'What the workspace-picker slot renders. That slot used to be a hardcoded tone="info" chip reading "connecting…" for EVERY non-open state — five states, one appearance, and four of them false. It is the only place in this member where the StatusIndicator rollout changed what the screen says rather than only how it says it.',
            },
          ],
        },
      ],
    },

    {
      id: 'recipes',
      title: 'Recipes',
      blurb:
        'Class-based primitives from app.css. No component behind any of them — which is precisely why they need cataloguing: nothing stops a fourth badge treatment from being appended to the stylesheet. Buttons and Pills & status chips used to head this list and now sit under Federal primitives, where their source paths always said they belonged. What is left is a card, a field stack, a tag row, a list row, a header, a banner, an attachment and an empty state.',
      entries: [
        {
          id: 'card',
          name: 'Card',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/app.css:88–103',
          summary:
            'The one container. Surface fill, 1px border, 8px radius, --fx-card-shadow. Headings inside are uppercase accent labels, not titles.',
          usage: '<section class="cc-card"><h3>Heading</h3>…</section>',
          tokens: ['--color-surface', '--color-border', '--color-accent', '--fx-card-shadow'],
          snippet: card,
          controls: {
            heading: { kind: 'text', value: 'Source 1 of 4' },
            body: { kind: 'text', value: 'Brookings' },
          },
          fixtures: [
            { id: 'default', name: 'Default' },
            {
              id: 'on-raised',
              name: 'On raised',
              note: 'Open this one with surface = surface-raised. The card is --color-surface on a --color-surface-raised frame; in dark mode surface-raised is DARKER than surface, so the elevation ladder reads backwards here.',
            },
          ],
        },
        {
          id: 'fields',
          name: 'Fields',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/app.css:104–128',
          summary:
            'Label-over-control stack. input / textarea / select share one rule, so they focus identically. The .cc-saved class fires the commit flash.',
          usage: '<div class="cc-field"><span class="cc-label">Title</span><input /></div>',
          a11y:
            '.cc-label is a <span>, not a <label> — nothing is programmatically associated with the input. Every field in this member has this defect; the Audit tab reports the missing name.',
          tokens: ['--color-field', '--color-border', '--color-accent', '--focus-ring', '--color-text-muted', '--font-mono'],
          snippet: fields,
          controls: {
            value: { kind: 'text', value: 'The degree is not the job' },
            saved: { kind: 'boolean', label: 'commit flash', value: false },
          },
          fixtures: [
            { id: 'rest', name: 'Rest' },
            {
              id: 'saved',
              name: 'Saved flash',
              props: { saved: true },
              note: 'The 1.6s confirmation pulse. It runs on a local @keyframes in app.css rather than a federal motion token — the kind of thing a per-component view surfaces and a per-member sweep averages away.',
            },
          ],
        },
        {
          id: 'tags',
          name: 'Tag bar recipe',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/TagBar.svelte',
          summary:
            'Train-Case tag chips with a remove affordance, plus the suggestion popup. ONE recipe is left — .cc-tags, the wrapping flex row, which is layout and therefore the parent\'s job. The chips are <Chip dismissible>; the read-only variant that used to be .cc-tag-mini is the same component without the boolean; and the popup is now <SearchBox--LiveFilter>, which took .cc-tag-input, .cc-tag-suggest and .cc-tag-suggest button with it. The member no longer declares a z-index at all.',
          a11y:
            'Three steps. The × went from “a 12px glyph in a zero-padding button, well under the 24×24 floor” to <Button size="icon"> at 28×28 to <Chip dismissible> at 24×24 — still over the WCAG 2.2 SC 2.5.8 floor, sitting exactly ON it where the Button sat 4px clear — and what it bought was the name: every × here announced the identical "remove tag", and dismissLabel now carries the tag itself. The third step is the INPUT, and it is the largest. The suggestions were <button> elements, so every one was a native tab stop: twelve suggestions made this field thirteen tab stops, Tab took the caret out of the input mid-word, and ArrowDown did nothing at all because no key handler existed. The input carried no role, so a screen reader announced a plain text field and never mentioned that suggestions had appeared. <SearchBox--LiveFilter> makes it a role="combobox" with aria-expanded, aria-controls naming a listbox that exists, and aria-activedescendant moving while focus stays in the input. The input still has no associated <label> element — it has an aria-label now, which is what the component takes.',
          tokens: ['--color-surface-2', '--color-text-muted', '--color-border-strong', '--control-h-sm', '--icon-sm', '--z-remote-overlay'],
          snippet: tags,
          controls: { suggesting: { kind: 'boolean', label: 'show suggestions', value: false } },
          fixtures: [
            { id: 'rest', name: 'Rest' },
            {
              id: 'suggesting',
              name: 'Suggesting',
              props: { suggesting: true },
              width: 420,
              note: 'The popup is the component\'s own, opened by typing. It used to be .cc-tag-suggest at a literal z-index: 5 \u2014 one of this member\'s two F4 drift failures; the component spends --z-remote-overlay, so the failure is gone rather than relocated.',
            },
          ],
        },
        {
          id: 'source-row',
          name: 'Source row',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/SourceList.svelte',
          summary:
            'The source list row — status dot, title, meta line of publisher + status chip + tags. It is <CardRow density="compact"> wrapping <SelectWrapper--ClickBody>, so clicking anywhere on the card selects it, and the selected state is CardRow\'s own `selected` prop (accent border + --color-accent-bg) rather than a tint plus a 3px rail. The dot, the title/meta stack and the chips are the member\'s; everything that draws the row is federal.',
          deviation:
            'None any more, and this entry exists to record the reversal. It was the clearest holdout in this member — a raw <button> left un-adopted because it is full-bleed, left-aligned, two-line with a wrapping meta row and of variable height, where Button is inline-flex, centred, nowrap and a fixed --control-h-*. The note read "the organ it wants is a selectable list row." That organ now exists. None. This member rejected --ClickBody once and it is worth keeping the trail: its <button> was `display: contents`, which Chromium gives no box, so all seven rows here were keyboard-unreachable (WCAG 2.1.1, Level A) while rendering and mouse-clicking perfectly. The fallback to --ClickPrimary cost the row 346x79 of hit area for 302x24. The primitive was fixed to a real inline-flex box and --ClickBody came back; the tab-order walk is re-measured against pre-migration HEAD each time.',
          tokens: ['--color-border-strong', '--color-surface', '--color-accent-bg', '--color-primary', '--color-confidence-high', '--color-confidence-low', '--color-text-muted'],
          snippet: sourceRow,
          controls: {
            title: { kind: 'text', value: 'The degree is not the job' },
            active: { kind: 'boolean', value: false },
          },
          fixtures: [
            { id: 'rest', name: 'Rest' },
            { id: 'active', name: 'Selected', props: { active: true } },
            {
              id: 'overflow',
              name: 'Untitled + overflow',
              props: { title: SOURCES[2].url },
              width: 320,
              note: 'An untitled source falls back to its URL. At 320px this is the narrowest the list column ever gets.',
            },
          ],
        },
        {
          id: 'header-bar',
          name: 'Header bar',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/App.svelte:63–140',
          summary:
            'The member header: brand, workspace, domain type, back affordance, active corpus, count, and the connection state pushed right. It carries TWO connection renderings, not one — the right-hand <StatusIndicator of="workspace">, and the workspace slot, which falls back to a bare <StatusIndicator> whenever the workspace list is empty and the socket is not open. The specimen draws the first; the second lives in the StatusIndicator entry, because it is only reachable in a state this layout specimen cannot stage.',
          a11y:
            'Layout only — flex, a border-bottom and a spacer. Everything in it that has an accessible-name obligation is federal now and carries its own.',
          tokens: ['--color-surface', '--color-border', '--color-accent'],
          snippet: headerBar,
          controls: {
            strategy: { kind: 'text', value: 'Turning Jobs Into Degrees' },
            status: {
              kind: 'select',
              value: 'open',
              // SIX, not four. idle and auth_required were missing from this
              // control while the header drew its own status vocabulary, which
              // is the same blind spot that let the workspace slot claim
              // "connecting…" for four states it had never watched happen.
              options: ['open', 'connecting', 'auth_required', 'closed', 'error', 'idle'],
            },
          },
          fixtures: [
            { id: 'connected', name: 'Connected' },
            { id: 'error', name: 'Errored', props: { status: 'error' } },
            {
              id: 'auth-required',
              name: 'Sign-in required',
              props: { status: 'auth_required' },
              note: 'The state this header could not say out loud. It rendered the string `auth_required` — warn-toned, correctly, but spelled as a TypeScript union member. It now reads "workspace sign-in required", which is the only one of the six that asks the operator for something.',
            },
          ],
        },
        {
          id: 'banner',
          name: 'Error banner',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/app.css:54–60',
          summary:
            'The full-width capability-failure strip under the header. In flow, no timer, no dismiss — a banner, not a toast: it states a condition rather than announcing an event.',
          a11y:
            'Not a live region. It appears after an async failure with no role="alert" and no focus move, so a screen-reader user gets no announcement — the one case where the toast pattern would have been the accessible default.',
          deviation:
            'Its content is toast-shaped (the result of one action) but its lifecycle is banner-shaped: lastError only clears on the next SUCCESSFUL capability call, so a failure outlives its context and can still be on screen after you have moved to a different corpus. Either the clear should be scoped to the action, or this should become a real toast.',
          tokens: ['--color-error-bg', '--color-error-text', '--color-border'],
          snippet: banner,
          controls: { message: { kind: 'text', value: 'source.add failed — capability not registered on this workspace' } },
          fixtures: [
            {
              id: 'default',
              name: 'Default',
              note: 'Note what is NOT here: no ×, no timer, no stack. Compare with the footer, which carries the same failures a second time as saveStatus.',
            },
            {
              id: 'long',
              name: 'Long message',
              props: {
                message:
                  'source.fetch failed — the content-ingest service returned 502 after 3 attempts against https://www.dol.gov/agencies/eta/apprenticeship/policy/registered-apprenticeship-national-guidelines-standards-of-apprenticeship-2026-revision',
              },
              width: 640,
              note: 'Real capability errors carry the URL. This is what two lines of it looks like.',
            },
          ],
        },
        {
          id: 'attached-file',
          name: 'Attached file',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/app.css:154–166',
          summary: 'The downloaded-binary chip and the raw URL link beneath it. Border and tint are mixed from the confidence-high token.',
          deviation:
            'Composes its border and background with color-mix() off --color-confidence-high, using a confidence token for a non-confidence meaning. Legal under Derived tokens; worth a semantic token of its own.',
          tokens: ['--color-confidence-high', '--color-border', '--color-accent'],
          snippet: attachedFile,
          controls: { filename: { kind: 'text', value: 'apprenticeship-at-scale-2026.pdf' } },
          fixtures: [{ id: 'default', name: 'Default' }],
        },
        {
          id: 'empty-state',
          name: 'Empty state',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/SourceList.svelte:29',
          summary: 'Muted, padded, small. The member has exactly one empty-state treatment and it is a paragraph.',
          tokens: ['--color-text-muted'],
          snippet: emptyState,
          controls: { message: { kind: 'text', value: 'No sources yet. Paste a URL to add one.' } },
          fixtures: [{ id: 'default', name: 'Default' }],
        },
      ],
    },

    {
      id: 'components',
      title: 'Components',
      blurb:
        'The four .svelte files. Every one of them reads the `curation` singleton instead of taking props, so every fixture below stages that singleton first — see src/gallery/fixtures.ts for why that is worth knowing rather than hiding.',
      entries: [
        {
          id: 'tag-bar',
          name: 'TagBar',
          kind: 'component',
          status: 'stable',
          source: 'apps/corpora-curator/src/TagBar.svelte',
          summary:
            'Tag editor for the focused source. Renders the current tags, removes on ×, adds on Enter, and suggests from the workspace vocabulary as you type.',
          usage: '<TagBar />   <!-- no props: reads curation.focused and curation.tagVocab -->',
          a11y:
            'The remove control is <Chip dismissible> — a real nested <button> inside a <span>, 24×24, named per-tag via dismissLabel rather than the one shared "remove tag" every × used to announce. The input still has no associated <label>.',
          tokens: ['--color-surface-2', '--color-text-muted', '--color-border-strong', '--control-h-sm'],
          component: TagBar,
          fixtures: [
            {
              id: 'tagged',
              name: 'Tagged',
              setup: () => seed(),
              note: 'Focused source has two tags.',
              width: 420,
            },
            {
              id: 'untagged',
              name: 'Untagged',
              setup: () => seed({ focusIdx: 2 }),
              note: 'The failed source — no tags, so only the input renders. Confirms the tag row collapses rather than leaving a gap.',
              width: 420,
            },
            {
              id: 'no-vocabulary',
              name: 'No vocabulary',
              setup: () => seed({ tagVocab: [] }),
              note: 'Autocomplete has nothing to offer. The suggestion popover must not render an empty box.',
              width: 420,
            },
          ],
        },
        {
          id: 'source-list',
          name: 'SourceList',
          kind: 'component',
          status: 'stable',
          source: 'apps/corpora-curator/src/SourceList.svelte',
          summary:
            'The left column: back link, filter, add-by-URL, and the source rows. Selection and filtering both live on the singleton, not in the component.',
          usage: '<SourceList />',
          tokens: ['--color-border', '--color-surface', '--color-selected-tint', '--color-accent'],
          component: SourceList,
          fixtures: [
            { id: 'populated', name: 'Populated', setup: () => seed(), fill: true, width: 360 },
            {
              id: 'empty',
              name: 'Empty',
              setup: () => seed({ sources: [] }),
              fill: true,
              width: 360,
              note: 'A corpus with no sources yet — the first thing a new user sees.',
            },
            {
              id: 'filtered-to-nothing',
              name: 'Filtered to nothing',
              setup: () => seed({ listFilter: 'zzzz' }),
              fill: true,
              width: 360,
              note: 'Four sources, none matching. The component renders an empty list with NO message — indistinguishable from having no sources at all, which is a real defect and the reason this fixture exists.',
            },
          ],
        },
        {
          id: 'strategy-picker',
          name: 'CorpusPicker',
          kind: 'component',
          status: 'stable',
          source: 'apps/corpora-curator/src/CorpusPicker.svelte',
          summary:
            'The entry surface: pick an existing corpus, or create one. Slug auto-derives from the title until edited, and the create button previews the folder it will write.',
          usage: '<CorpusPicker />',
          tokens: ['--color-surface', '--color-border', '--color-accent', '--fx-card-shadow'],
          component: CorpusPicker,
          fixtures: [
            { id: 'populated', name: 'With corpora', setup: () => seed({ activeSlug: null }), width: 640 },
            {
              id: 'first-run',
              name: 'First run',
              setup: () => seed({ strategies: [], activeSlug: null }),
              width: 640,
              note: 'No corpora yet. The create form is the whole surface.',
            },
            {
              id: 'thesis-workspace',
              name: 'Thesis workspace',
              setup: () => seed({ activeSlug: null, domainType: 'thesis', clientSlug: 'humain-vc' }),
              width: 640,
              note: 'domainType drives the folder preview under the create button — humain-vc writes theses/, reach-edu writes strategies/.',
            },
          ],
        },
        {
          id: 'source-detail',
          name: 'SourceDetail',
          kind: 'component',
          status: 'stable',
          source: 'apps/corpora-curator/src/SourceDetail.svelte',
          summary:
            'The right column: every editable field on the focused source, the fetch/retry actions, the tag bar, and the extract composer. The densest surface in the member.',
          usage: '<SourceDetail />',
          a11y:
            'Commits on blur or Enter and confirms with a 1.6s border flash — a visual-only confirmation with no live region behind it. Separately: the leading .cc-dot on each source row encodes verdict_error by hue alone (confidence-high green vs confidence-low red) with no text and no accessible name, which is a live WCAG 1.4.1 failure. It is NOT chip-shaped — a bare 8px circle in the row gutter is not a label — so the Chip rollout left it alone and raised it rather than inventing a chip to hold it.',
          tokens: ['--color-surface', '--color-border', '--color-field', '--color-accent', '--focus-ring'],
          component: SourceDetail,
          fixtures: [
            { id: 'fetched', name: 'Fetched', setup: () => seed(), fill: true, note: 'Complete metadata, content pulled.' },
            {
              id: 'with-binary',
              name: 'With attachment',
              setup: () => seed({ focusIdx: 1 }),
              fill: true,
              note: 'A downloaded PDF sibling — the attached-file chip in situ.',
            },
            {
              id: 'failed',
              name: 'Failed fetch',
              setup: () => seed({ focusIdx: 2 }),
              fill: true,
              note: 'No title, no publisher, verdict_error set. Every placeholder in the member is visible at once.',
            },
            {
              id: 'no-selection',
              name: 'No selection',
              setup: () => seed({ sources: [] }),
              fill: true,
              note: 'Nothing focused. The component renders nothing at all — no placeholder, no prompt.',
            },
          ],
        },
      ],
    },

    {
      id: 'composition',
      title: 'Composition',
      blurb: 'How the pieces sit together. The full App is deliberately absent: mounting it opens a WebSocket to the workspace service, and a component library should not need a backend to render.',
      entries: [
        {
          id: 'two-column',
          name: 'Two-column working state',
          kind: 'component',
          status: 'stable',
          source: 'apps/corpora-curator/src/App.svelte:151–154',
          summary:
            'The list column and the detail column at their real proportions — grid-template-columns: minmax(280px, 360px) 1fr.',
          tokens: ['--color-border'],
          component: SourceList,
          fixtures: [
            {
              id: 'narrow',
              name: 'List column at minimum',
              setup: () => seed(),
              fill: true,
              width: 280,
              note: `The 280px floor from the grid. ${STRATEGIES.length} corpora, ${SOURCES.length} sources staged.`,
            },
            {
              id: 'wide',
              name: 'List column at maximum',
              setup: () => seed(),
              fill: true,
              width: 360,
            },
          ],
        },
      ],
    },
  ],
});
