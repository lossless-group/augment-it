// request-reviewer's component library.
//
// The member's half of the bargain: @augment-it/gallery owns how a library is
// browsed, isolated, deep-linked and audited; this owns what is IN one. Nothing
// here is discovered by convention — the expensive knowledge in a component
// library is not "which files exist" but "which states are worth pinning", and
// that only ever comes from whoever owns the component.
//
// Reachable three ways:
//   · in the shell   — Developers → Component libraries → request-reviewer
//                      (pending its importGallery row in docs-portal/src/members.ts)
//   · standalone     — http://localhost:3004/#/gallery
//   · one specimen   — http://localhost:3004/#/gallery/button/variants?iso=1
//
// THIS IS THE FIRST CATALOG TO CARRY A FEDERAL COMPONENT. Entries in the
// Federal primitives section are imported from @augment-it/shared-ui and owned
// by the platform; entries under Local recipes are class recipes this member
// owns. That distinction is the point of the rollout — the catalog shows what
// the member now consumes rather than what it used to hand-roll.
//
// The boundary MOVES, and this file is where that gets recorded. `token-binding`
// started as a Local recipe (app.css:113–129) and moved to Federal on
// 2026-09-13 when the row became <CardRow>. A catalog that only ever gains
// federal entries and never reclassifies its own is out of date the first time
// a recipe is replaced rather than added to.

import { defineGallery } from '@augment-it/gallery';
import {
  buttons,
  buttonSizes,
  buttonStates,
  overrideLadder,
  stepper,
  statusPill,
  fields,
  panel,
  tokenBinding,
  coverage,
  progress,
  feedback,
} from './specimens.svelte';

export default defineGallery({
  member: 'request-reviewer',
  prefix: 'req',
  rootClass: 'req-app',
  origin: 'http://localhost:3004',
  doc: 'apps/request-reviewer/DESIGN.md',
  spec: 'context-v/specs/Component-API-Contract-And-The-Control-Scale.md',
  blurb:
    'The pre-flight surface — see exactly what is about to be sent to the model, pick the model, then fire it. Tier C, debt: none. The first member to adopt the shared Button: nine hand-rolled buttons replaced, 41 lines of CSS deleted, zero overrides used.',

  // Two kinds of legitimately-unprefixed class here, and they are worth telling
  // apart because only one of them is this member's doing:
  //
  //  1. `ui-btn` — the federal Button's own class. A SHARED component's classes
  //     can never carry a member's prefix; nineteen catalogs will each need this
  //     exemption, which is an argument for the runtime knowing the platform
  //     prefix rather than every catalog restating it.
  //  2. everything else — this member namespaces its SELECTORS under .req-app
  //     (contract F3, satisfied) but its CLASS NAMES carry no `req-` prefix, so
  //     the containment audit reads each as a leak. That is a real finding about
  //     this member, recorded rather than papered over; renaming ~25 classes is
  //     not this plan's job.
  exemptClasses: [
    'status', 'status-open', 'status-closed', 'status-error', 'status-connecting',
    'field', 'inline', 'muted', 'lede',
    // `unbound` is gone: the unbound row is no longer a member class, it is a
    // rung-4 style= + data-deviation on <CardRow>. `ui-*` needs no exemption —
    // packages/gallery reserves that namespace for shared-ui.
    'panel', 'json', 'bind', 'arrow', 'val', 'nobind',
    'warn', 'result', 'coverage', 'coverage-stat', 'covered', 'needs-rerun', 'remaining',
    'fire-row', 'stepper', 'progress', 'spinner',
  ],

  sections: [
    {
      id: 'federal',
      title: 'Federal primitives',
      blurb:
        'Owned by packages/shared-ui, consumed here. These specimens import the real component — not a copy — so what renders is what ships.',
      entries: [
        {
          id: 'button',
          name: 'Button',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Button.svelte',
          summary:
            'The federal control primitive. Two enums — variant × size — and a four-rung override ladder. Replaces this member\'s entire button stylesheet.',
          usage: '<Button variant="primary" size="md">Fire this row</Button>',
          a11y:
            'Accessible by construction: renders a real <button> with type="button", uses real `disabled` rather than a class so it leaves the tab order, declares its own :focus-visible that sets the SAME properties as the federal rule so it cannot double-paint, and refuses to render size="icon" without an aria-label. Every size clears the 24x24 target floor — --control-h-sm IS 24px.',
          // Reconciled against the Audit tab's token provenance, which reads the
          // real list off the matched CSS rules. Every variant here renders at
          // size md, so the sm/lg control and spacing steps are deliberately NOT
          // listed — a declaration that claims more than the specimen reads is
          // exactly the stale list this diff exists to catch.
          tokens: [
            '--color-primary', '--color-primary-foreground', '--color-accent-hover',
            '--color-surface-raised', '--color-text', '--color-border-strong',
            '--color-bg-elevated', '--color-selected-tint',
            '--color-error-bg', '--color-error-fg', '--color-link',
            '--color-surface-2', '--color-text-muted', '--color-border',
            '--radius-md', '--control-h-md', '--space-md', '--space-2xs', '--focus-ring',
          ],
          snippet: buttons,
          controls: {
            label: { kind: 'text', label: 'label (blank = variant name)', value: '' },
            disabled: { kind: 'boolean', value: false },
          },
          fixtures: [
            {
              id: 'variants',
              name: 'Six variants',
              note: 'All six, side by side, so a seventh would be visibly a seventh. This member needed exactly these — nine buttons mapped with zero overrides.',
            },
            {
              id: 'disabled',
              name: 'Disabled',
              props: { disabled: true },
              note: 'Disabled SHIFTS COLOUR TOKENS rather than dropping opacity — the recipe it replaced was `opacity: 0.4`, which is a state you cannot read at a glance and which fails alongside a low-contrast label.',
            },
          ],
        },
        {
          id: 'button-sizes',
          name: 'Button · sizes',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Button.svelte',
          summary:
            'sm / md / lg / icon. Heights come from --control-h-*, horizontal padding from --space-*. There is no --control-px-* family: a proposed one had a 14px step that exists on no scale, so it could only ever have been a literal.',
          usage: '<Button size="icon" aria-label="Next row"><svg …/></Button>',
          a11y:
            'sm is 24px, which IS the WCAG 2.2 2.5.8 floor and is what contract F7 points at. icon is a 28x28 square so it clears the floor in both dimensions. Icons are SVG, never glyphs — the product carries 35 bare check characters and no icon system; this adds none.',
          // --icon-sm / --icon-lg are NOT listed: this specimen renders its icon
          // button at the default size, so those rules never match here.
          tokens: [
            '--control-h-sm', '--control-h-md', '--control-h-lg',
            '--space-sm', '--space-md', '--space-lg', '--space-2xs', '--icon-md',
            '--color-primary', '--color-primary-foreground', '--color-accent-hover',
            '--color-border', '--color-surface-2', '--color-text-muted',
            '--radius-md', '--focus-ring',
          ],
          snippet: buttonSizes,
          controls: {
            variant: { kind: 'select', value: 'primary', options: ['primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'] },
            label: { kind: 'text', value: 'Fire this row' },
          },
          fixtures: [
            { id: 'sizes', name: 'All sizes', note: 'Measure them: 24 / 28 / 32, and the icon square at 28.' },
            { id: 'quiet', name: 'On a quiet variant', props: { variant: 'ghost' }, note: 'Ghost has no border, so the size scale is carried by height and padding alone — this is where a too-small target hides.' },
          ],
        },
        {
          id: 'button-states',
          name: 'Button · states',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Button.svelte',
          summary:
            'Rest, disabled, and the aria-pressed toggle pair this member uses for its model picker and view switch.',
          usage: '<Button variant={on ? "primary" : "secondary"} aria-pressed={on}>Opus 4.7</Button>',
          a11y:
            'The toggles are aria-pressed buttons, deliberately not role="tab". Correct tab semantics needs aria-controls, role="tabpanel" and arrow-key handling; half-implemented tabs are worse for a screen reader than honest toggle buttons. Full tablist behaviour belongs to the FilterChipRow organ, which is registered separately.',
          tokens: ['--color-primary', '--color-primary-foreground', '--color-surface-raised', '--color-surface-2', '--color-text-muted', '--focus-ring'],
          snippet: buttonStates,
          controls: { disabled: { kind: 'boolean', label: 'icon button disabled', value: true } },
          fixtures: [
            { id: 'states', name: 'Rest · disabled · toggled' },
            { id: 'icon-enabled', name: 'Icon enabled', props: { disabled: false }, note: 'Tab to it. One ring, from --focus-ring, and no second outline — the member\'s own input:focus outline was deleted in the migration precisely because it double-painted against the federal rule.' },
          ],
        },
        {
          id: 'override-ladder',
          name: 'Button · override ladder',
          kind: 'pattern',
          status: 'stable',
          source: 'context-v/specs/Component-API-Contract-And-The-Control-Scale.md',
          summary:
            'Rungs 1-3. Overrides take TOKEN NAMES, never values: radius="lg" resolves to var(--radius-lg), and radius="lg/60" to calc(var(--radius-lg) * 0.6). An unknown step falls back to the default and logs loudly rather than emitting a var() that resolves to nothing.',
          usage: '<Button radius="lg/60">tighter corner</Button>',
          deviation:
            'None in this member — all nine buttons mapped on rung 1. That is the finding worth recording: mapped by ROLE rather than by the appearance the member happened to draw, the six-variant enum covered everything. The cancel button was drawn as a transparent outline and is simply variant="destructive".',
          tokens: ['--radius-md', '--radius-lg', '--radius-pill'],
          snippet: overrideLadder,
          fixtures: [
            { id: 'rungs', name: 'Rungs 1-3', note: 'The /N modifier is deliberately COUNTABLE. radius="lg/60" appearing in six members is a measurable argument for a missing scale step, where a raw 11px would be invisible to tooling.' },
          ],
        },
        {
          id: 'token-binding',
          name: 'Token binding list',
          kind: 'pattern',
          status: 'stable',
          // MOVED SECTION, 2026-09-13. This entry used to be a pure local
          // recipe living at app.css:113–129. The row is now the federal
          // <CardRow density="compact">; app.css keeps only the gap BETWEEN
          // rows. It is catalogued here, under Federal primitives, because the
          // thing a reader needs to open is no longer this member's stylesheet.
          source: 'packages/shared-ui/src/CardRow.svelte',
          summary:
            'One row per {{token}} in the prompt, showing what it resolved to — or that nothing in the record set matches it. The unbound row is the whole reason this member exists. The row surface is CardRow; the <li> survives so the list still announces as a list.',
          usage: '<ul class="bind"><li><CardRow density="compact">…</CardRow></li></ul>',
          a11y:
            'CardRow renders a <div> with no role and no onclick — correct here, because a binding is REPORTED, not selected. No SelectWrapper is used anywhere in this member for that reason. The boundary moved from --color-border (≈1.26:1) to --color-border-strong (≈3.44:1), which clears the 3:1 non-text contrast floor the old recipe missed. Colour is still not the only channel on the failure row: the text says "no matching column in this record set".',
          // Deliberately no --color-border: the compact row is painted by
          // CardRow, which uses --color-border-strong. Listing the old token
          // would be exactly the stale declaration the Audit tab exists to catch.
          tokens: [
            '--color-surface', '--color-border-strong', '--color-text', '--color-error-text',
            '--color-ok-text', '--color-text-muted', '--color-field',
            '--radius-md', '--space-sm', '--space-lg', '--space-md', '--text-body', '--font-sans',
          ],
          deviation:
            'ONE, and it is the pilot\'s headline finding. The unbound row needs a border in --color-error-text, and CardRow\'s first-pass API carries exactly one state axis — `selected`. An invalid/error row state has nowhere sanctioned to live, so it goes on rung 4 as style= + data-deviation (style, not class: a member class lands at (0,1,0) and loses to the component\'s own rule). Reaching rung 4 on the FIRST adoption is the signal the loop says it is — the argument for a `tone`/`state` axis on CardRow, not for this member re-drawing the row. records-surface hit the same gap independently on its accepted-URL row and left it raw.',
          snippet: tokenBinding,
          controls: { unbound: { kind: 'boolean', label: 'second token unbound', value: true } },
          fixtures: [
            { id: 'unbound', name: 'With an unbound token', note: 'The failure state is the important one: firing with an unbound token silently sends a literal {{placeholder}} to the model. This fixture is also the only place in this catalog where a data-deviation renders — CardRow dashes an outline around any row that carries class= or style= without one.' },
            { id: 'bound', name: 'All bound', props: { unbound: false }, note: 'No override, no deviation — the thin base as shipped.' },
          ],
        },
      ],
    },
    {
      id: 'recipes',
      title: 'Local recipes',
      blurb:
        'Class recipes from app.css, with no component behind them. Catalogued because nothing stops a second treatment being appended to the stylesheet — which is how the federation reached 158 button rule-sets before any of this started.',
      entries: [
        {
          id: 'stepper',
          name: 'Row stepper',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/request-reviewer/src/app.css:74–80',
          summary: 'Previous / next across the record set, with the position read-out between. The two controls are federal Buttons; only the flex row is local.',
          usage: '<div class="stepper"><Button size="icon" aria-label="Previous row">…</Button>…</div>',
          a11y: 'Both controls were bare glyph buttons with no accessible name before the migration. They are now labelled icon Buttons; the glyphs are real SVG.',
          tokens: ['--control-h-md', '--icon-md'],
          snippet: stepper,
          controls: { index: { kind: 'number', label: 'row index', value: 0, min: 0, max: 11 } },
          fixtures: [
            { id: 'first', name: 'At first row', note: 'Previous is disabled — real `disabled`, so it is skipped by the tab order rather than merely dimmed.' },
            { id: 'middle', name: 'Mid set', props: { index: 5 } },
          ],
        },
        {
          id: 'status',
          name: 'Connection status bar',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/request-reviewer/src/app.css:8–12, 41–45',
          summary: 'The workspace socket state, as a coloured chip in a hairline bar. Four states share one recipe; only the colour pair changes.',
          usage: '<span class="status status-{status}">{status}</span>',
          a11y: 'Not a live region — the state changes without announcement. Colour is the only channel that distinguishes open from error, though the text label carries the same information.',
          tokens: ['--color-border', '--color-field', '--color-ok-bg', '--color-ok-text', '--color-error-bg', '--color-error-text'],
          snippet: statusPill,
          controls: { status: { kind: 'select', value: 'open', options: ['open', 'closed', 'error', 'connecting'] } },
          fixtures: [
            { id: 'open', name: 'Open' },
            { id: 'error', name: 'Error', props: { status: 'error' }, note: 'error-fg on error-bg measured 4.46:1 in light mode until the token layer darkened red-ink; it now passes on its own merits.' },
            { id: 'connecting', name: 'Connecting', props: { status: 'connecting' }, note: 'No status-connecting rule exists, so this falls through to the base chip. A state with no treatment is still a state.' },
          ],
        },
        {
          id: 'fields',
          name: 'Fields',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/request-reviewer/src/app.css:46–72',
          summary: 'Label-over-control for selects, and an inline label for the numeric knobs. select and input[type=number] share one rule so they focus identically.',
          usage: '<div class="field"><label for="id">Prompt</label><select id="id">…</select></div>',
          a11y:
            'These labels ARE real — a <label for> bound to the select\'s id, and a wrapping <label> around the number input. Both controls report labels.length === 1. THE AUDIT TAB DISAGREES, AND THE AUDIT TAB IS WRONG ON BOTH COUNTS HERE: its accessible-name check reads only aria-label / title / alt / placeholder / textContent and never consults el.labels, so it cannot see a correctly associated label; and its focus check reports "no :focus-visible rule matches this control" because the FEDERAL ring is the only rule covering these controls now that the member-local outline was deleted. Do not silence either finding by bolting an aria-label onto a properly-labelled input — that damages correct markup to satisfy a checker. Both are raised as findings against packages/gallery.',
          tokens: ['--color-field', '--color-border', '--color-text', '--color-text-muted', '--focus-ring'],
          snippet: fields,
          controls: { maxTokens: { kind: 'number', value: 4096, min: 1, max: 200000 } },
          fixtures: [
            {
              id: 'rest',
              name: 'Rest',
              note: 'Tab through both: one ring each, from the federal --focus-ring, with no doubled outline — the member-local input:focus outline was deleted in the Button migration because it double-painted. The Audit tab\'s 1 blocking + 2 advisory findings on this fixture are both false positives; see the a11y note.',
            },
          ],
        },
        {
          id: 'panel',
          name: 'Preview panel',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/request-reviewer/src/app.css:98–112',
          summary: 'The scrolling pre-flight readout. One recipe, two modes: prose for the resolved prompt, monospace for the JSON request.',
          usage: '<pre class="panel json">{jsonText}</pre>',
          tokens: ['--color-field', '--color-border'],
          snippet: panel,
          controls: { json: { kind: 'boolean', label: 'JSON mode', value: false } },
          fixtures: [
            { id: 'resolved', name: 'Resolved prompt' },
            { id: 'json', name: 'JSON request', props: { json: true }, note: '.panel.json re-declares a monospace stack inline instead of reading --font-mono — a literal font family where a token exists.' },
          ],
        },
        {
          id: 'coverage',
          name: 'Coverage strip',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/request-reviewer/src/app.css:136–163',
          summary: 'Three counts of the record set against this prompt — covered, needs-rerun, remaining — each with a colour-coded dot drawn from currentColor.',
          usage: '<span class="coverage-stat covered">8 / 12 covered</span>',
          a11y: 'The ::before dot is decorative and inherits currentColor, so it adds no information the text lacks — the right way round.',
          tokens: ['--color-field', '--color-ok-text', '--color-warn-text', '--color-accent'],
          snippet: coverage,
          controls: { covered: { kind: 'number', value: 8, min: 0, max: 12 } },
          fixtures: [{ id: 'partial', name: 'Partially covered' }],
        },
        {
          id: 'progress',
          name: 'Firing progress',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/request-reviewer/src/app.css:166–188',
          summary: 'The in-flight strip with a rotating spinner. Runs on a member-local @keyframes, namespaced req-spin.',
          usage: '<p class="progress"><span class="spinner" aria-hidden="true"></span>firing… 3 / 12</p>',
          a11y: 'The spinner is aria-hidden and the count is text, so the state is readable without the animation. It is not a live region, so the count does not announce as it changes.',
          tokens: ['--color-field', '--color-accent-2'],
          snippet: progress,
          controls: { done: { kind: 'number', value: 3, min: 0, max: 12 } },
          fixtures: [{ id: 'firing', name: 'Firing', note: 'req-spin is correctly prefixed. @keyframes names are global (F8/E2), and six spinners across the product use four unnamespaced names — this is one of the ones that got it right.' }],
        },
        {
          id: 'feedback',
          name: 'Warning & result',
          kind: 'pattern',
          status: 'stable',
          source: 'apps/request-reviewer/src/app.css:130–134, 190–196',
          summary: 'The two post-action strips: a pre-flight warning that blocks nothing, and the success line after a run.',
          usage: '<p class="warn">2 unbound token(s)…</p>',
          a11y: 'Neither is a live region and neither takes focus, so a screen-reader user gets no announcement that a run finished or that a warning appeared.',
          tokens: ['--color-error-text', '--color-ok-text', '--color-ok-bg'],
          snippet: feedback,
          fixtures: [{ id: 'both', name: 'Both strips', note: 'Shown together on purpose: the warning is advisory and the result is terminal, but they are the same visual weight.' }],
        },
      ],
    },
  ],
});
