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
  // each of them as a leak. `status-*` is generated (`cc-conn status-{state}`).
  exemptClasses: ['active', 'err', 'status-open', 'status-error', 'status-closed', 'status-idle', 'status-connecting'],

  sections: [
    {
      id: 'recipes',
      title: 'Recipes',
      blurb:
        'Class-based primitives from app.css. No component behind any of them — which is precisely why they need cataloguing: nothing stops a fifth button variant from being appended to the stylesheet.',
      entries: [
        {
          id: 'buttons',
          name: 'Buttons',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/app.css:129–152',
          summary:
            'Four variants off one base: default (bordered, raised), .cc-primary (accent fill), .cc-link (bare, accent text), .cc-danger (error text + border on hover).',
          usage: '<button class="cc-primary">+ Add</button>',
          a11y:
            'The base button is 26px tall at the default padding — under the 24×24 floor only if a variant strips its padding. .cc-link and .cc-tag-x both do; check the Audit tab before reusing them.',
          tokens: ['--color-text', '--color-surface-raised', '--color-border', '--color-accent', '--color-on-accent', '--color-error-text'],
          snippet: buttons,
          controls: {
            label: { kind: 'text', label: 'default label', value: 'Fetch metadata' },
            disabled: { kind: 'boolean', value: false },
          },
          fixtures: [
            { id: 'rest', name: 'Rest', note: 'All four variants side by side, so a new one is visibly a fifth.' },
            { id: 'disabled', name: 'Disabled', props: { disabled: true }, note: 'opacity: 0.6 — the only disabled treatment this member has.' },
          ],
        },
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
          id: 'chips',
          name: 'Pills & status chips',
          kind: 'pattern',
          status: 'legacy',
          source: 'apps/corpora-curator/src/app.css:26–52',
          summary:
            'Three unrelated small-badge treatments that coexist: .cc-pill (rounded, bordered), .cc-status-chip (square, bordered), .cc-conn (square, filled by state). Same job, three looks.',
          deviation:
            'Not a deviation so much as an unresolved one — this member contributes three of the federation-wide 34 badge treatments. Any consolidation should start here.',
          tokens: ['--color-border', '--color-surface-raised', '--color-ok-bg', '--color-ok-text', '--color-error-bg', '--color-error-text'],
          snippet: chips,
          controls: { count: { kind: 'number', value: 4, min: 0, max: 99 } },
          fixtures: [{ id: 'all', name: 'All treatments', note: 'Deliberately shown together. Apart, each looks fine.' }],
        },
        {
          id: 'tags',
          name: 'Tag bar recipe',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/app.css:189–212',
          summary:
            'Train-Case tag chips with a remove affordance, plus the absolutely-positioned autocomplete popover. The popover is the only z-index in the member.',
          a11y: 'The × is a 12px glyph in a zero-padding button — well under the 24×24 target floor.',
          tokens: ['--color-selected-tint', '--color-border', '--color-surface-raised', '--fx-card-shadow'],
          snippet: tags,
          controls: { suggesting: { kind: 'boolean', label: 'show suggestions', value: false } },
          fixtures: [
            { id: 'rest', name: 'Rest' },
            {
              id: 'suggesting',
              name: 'Suggesting',
              props: { suggesting: true },
              width: 420,
              note: 'z-index: 5, a literal rather than a --z-* token. The Audit tab flags it as F4.',
            },
          ],
        },
        {
          id: 'source-row',
          name: 'Source row',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/corpora-curator/src/app.css:167–188',
          summary:
            'The hairline list row — status dot, title, meta line of publisher + status chip + tag minis. Selection is a tinted background plus a 3px accent rail, with the padding compensated so text does not shift.',
          tokens: ['--color-border', '--color-surface', '--color-selected-tint', '--color-accent', '--color-confidence-high', '--color-confidence-low', '--color-text-muted'],
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
          source: 'apps/corpora-curator/src/App.svelte:56–86',
          summary:
            'The member header: brand, workspace, domain type, back affordance, active corpus, count, and the connection state pushed right.',
          tokens: ['--color-surface', '--color-border', '--color-accent'],
          snippet: headerBar,
          controls: {
            strategy: { kind: 'text', value: 'Turning Jobs Into Degrees' },
            status: { kind: 'select', value: 'open', options: ['open', 'error', 'closed', 'connecting'] },
          },
          fixtures: [
            { id: 'connected', name: 'Connected' },
            { id: 'error', name: 'Errored', props: { status: 'error' } },
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
          a11y: 'The remove button carries aria-label="remove tag"; the input has no associated <label>.',
          tokens: ['--color-selected-tint', '--color-border', '--color-text-muted'],
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
          a11y: 'Commits on blur or Enter and confirms with a 1.6s border flash — a visual-only confirmation with no live region behind it.',
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
          source: 'apps/corpora-curator/src/App.svelte:88–95',
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
