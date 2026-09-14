// The federal primitives library.
//
// Every other catalog in this repo belongs to a MEMBER and answers "what is this
// member made of". This one belongs to the platform and answers the question one
// level up: "what is every member made of". Button has 290 call sites across 19
// units and Chip has 98 across 13 — by a wide margin the two most-consumed
// components in the system — and until this file existed neither could be looked
// at. You read the source, or you read a member's catalog and saw one member's
// spending of it.
//
// WHY THIS IS NOT A MEMBER, AND WHAT THAT CHANGES.
//
// context-v/specs/Federated-Component-Libraries.md §2 is emphatic that the INDEX
// is central and the LIBRARIES are not: a central library importing from members
// would re-create the single queue federation exists to avoid. That argument is
// about MEMBER components, and it does not reach this file. `packages/shared-ui`
// IS the shared queue, deliberately and by construction — nineteen members
// already import these two modules directly. Publishing its catalog from the same
// package that publishes the components is the same "the owner declares it" rule
// every member follows, not an exception to it.
//
// Three consequences follow, and each is visible in the declaration below:
//
//   · `rootClass: ''`. A member's CSS is written `.cc-app .cc-card { … }`, so a
//     specimen without that ancestor is unstyled. The federal primitives carry
//     their own scoped <style> and read the federal token vocabulary directly —
//     they render correctly under ANY root class, or none. The empty string is
//     that property recorded, not a field left blank.
//   · `prefix: 'ui'`. `ui-*` is a reserved federal namespace as of 2026-09-13
//     (packages/gallery/src/audit.ts): a federal component's classes can never
//     carry a member's prefix, because they would have to carry nineteen.
//   · NOT a federation remote. This library loads into apps/docs-portal as a
//     workspace import, because there is no server on the other end of a
//     package. The portal still does not OWN it — the catalog ships from the
//     package that ships the components, which is the property that matters.
//
// Reachable two ways rather than the members' three:
//   · in the portal  — Developers → Component libraries → the federal card
//   · one specimen   — http://localhost:3020/#/gallery/button-matrix/matrix?iso=1
//
// There is no member origin to be standalone ON. apps/docs-portal serves this
// library, so it is the origin, and its src/index.ts branches on the gallery hash
// exactly as a member's does — which is what keeps the isolate link, the
// load-bearing one, real for the federal layer too.
//
// NO fixtures.ts, AND THAT IS A FINDING IN ITSELF. corpora-curator needs one
// because every component there reads the `curation` runes singleton, so each
// fixture has to stage a world before rendering. Nothing below needs a `setup()`:
// both primitives are driven entirely by props. That contrast is the argument for
// pushing presentational leaves down to props, and it is visible here rather than
// asserted in a document.

import { defineGallery } from '@augment-it/gallery';
import ConfidencePill from '../ConfidencePill.svelte';
import {
  buttonForm,
  buttonIconName,
  buttonMatrix,
  buttonVariants,
  chipDismiss,
  chipDot,
  chipTones,
  classification,
  overrideLadder,
} from './specimens.svelte';

export default defineGallery({
  member: 'shared-ui',
  prefix: 'ui',
  // Empty on purpose — see the header. The gallery chrome renders "any root"
  // rather than a stray dot when this is blank.
  rootClass: '',
  origin: 'http://localhost:3020',
  doc: 'DESIGN.md',
  spec: 'context-v/specs/Component-API-Contract-And-The-Control-Scale.md',
  blurb:
    'The two primitives every member shares, and the rules for choosing between them. Button: 6 variants x 4 sizes, 292 call sites across 20 units. Chip: 6 tones x 2 sizes, 103 across 13. (Counted 2026-09-13 by matching <Button / <Chip tags in every .svelte under apps/, shell/ and packages/, excluding this gallery. The Chip rollout reported 290 and 98; the small difference is adoption since, plus whether docs-portal is counted as a unit.) Both primitives are documented by their own header comments, which are normative — this library renders what those comments describe, from the same modules the members import.',

  // One name, and it is not a leak.
  //
  // `demo-rung-4` exists because rung 4 of the override ladder IS the `class=`
  // prop: a specimen of it cannot be built from the inline styles the rest of
  // specimens.svelte uses, because there would be nothing to demonstrate. It
  // ships in no product surface.
  //
  // Note what is NOT listed. Every adopting member's catalog has had to exempt
  // `ui-btn`, and Chip costs four more (`ui-chip`, `ui-chip__label`,
  // `ui-chip__dot`, `ui-chip__dismiss`) — a permanent, growing tax on nineteen
  // catalogs. That is fixed at the runtime now: `ui-*` is a reserved namespace
  // in packages/gallery/src/audit.ts, matched as a namespace rather than as a
  // list, precisely because buttons and chips are EXPECTED to accumulate classes
  // as the system grows. `prefix: 'ui'` here makes the same names pass by the
  // ordinary prefix rule as well, so this catalog would be clean under either.
  exemptClasses: ['demo-rung-4'],

  sections: [
    /* ------------------------------------------------------------------ */
    {
      id: 'choosing',
      title: 'Choosing',
      blurb:
        'Read this section before either of the others. Button\'s hard question is WHICH VARIANT; Chip\'s hard question is WHETHER THE THING IS A CHIP AT ALL, and getting that wrong is how the Chip rollout would undo the Button rollout. The tree below is rendered rather than drawn, so "a filter chip is a Button" is something you can look at instead of a claim you have to take on trust.',
      entries: [
        {
          id: 'classification',
          name: 'Button, Chip, or neither',
          kind: 'pattern',
          status: 'stable',
          source: 'context-v/loops/Adopt-The-Shared-Chip-In-One-Member.md',
          summary:
            'The decision tree, as live specimens. One question decides almost every call site — is it clickable? — and four leaves fall outside both primitives and stay raw. The single most likely error in this system is converting an interactive control into a Chip because it LOOKS like one.',
          usage: [
            'Is it clickable?',
            '  ├─ an <a href> drawn as a chip  → neither. It navigates, and variant="link"',
            '  │                                 is for a <button> that READS as a link.',
            '  │                                 Leave it raw; raise the INTERACTIVE BADGE organ.',
            '  ├─ YES → Button.  variant="secondary" + aria-pressed for a toggle.',
            '  └─ NO  → a small labelled token — tag, badge, pill, status, count?',
            '           ├─ YES → Chip.  dismissible? <Chip dismissible dismissLabel="…">',
            '           └─ NO  → not one of these. Raise it.',
          ].join('\n'),
          a11y:
            'The rule that carries the most a11y weight is the one about nesting: interactive content may not contain interactive content. A clickable chip with a clickable x is never a Button inside a Button — it is either a <Chip dismissible> (the body is inert, only the x acts) or a <Button> plus a sibling <Button size="icon"> in a wrapper (both act). The shipped defect this replaced was a <span role="button" tabindex="0"> inside a <button>, whose inner control was named literally "x" and measured 14x14 — 196 square pixels against a 576 square pixel floor, 34% of WCAG 2.2 SC 2.5.8. Note what was NOT wrong with it: the outer control carried an explicit aria-label and its accessible name was always correct. Do not go looking for a name defect there.',
          tokens: [
            '--color-accent-hover', '--color-bg-elevated', '--color-border',
            '--color-border-strong', '--color-ok-bg', '--color-ok-fg', '--color-primary',
            '--color-primary-foreground', '--color-surface-2', '--color-surface-raised',
            '--color-text', '--color-text-muted', '--control-h-md', '--focus-ring',
            '--font-mono', '--font-sans', '--icon-sm', '--radius-md', '--radius-pill',
            '--radius-round', '--space-2xs', '--space-3xs', '--space-md', '--space-xs',
            '--text-meta', '--ui-btn-radius'
          ],
          snippet: classification,
          fixtures: [
            {
              id: 'tree',
              name: 'The whole tree',
              props: { only: 'all' },
              note: 'Eight rows. Four resolve to a primitive, four do not — and the four that do not are the more useful half, because they are where a well-meaning migration does damage. The Audit tab is NOT clean on this fixture, deliberately: the raw <a> reports under the target floor, which is the finding the missing-organ row exists to produce.',
            },
            {
              id: 'controls',
              name: 'The clickable fork',
              props: { only: 'controls' },
              note: 'A tag, a status, a filter toggle and a removable tag. Only the third is a Button, and it is a Button precisely because it acts — nineteen members already made that mapping. Tone is picked by MEANING, never by the colour the member happened to draw: the original sweep found seventeen of nineteen packages observing one connection_status and rendering it eleven ways, because tone was being chosen by eye.',
            },
            {
              id: 'neither',
              name: 'The four that stay raw',
              props: { only: 'neither' },
              note: 'An anchor drawn as a chip, a count inside a control label, a confidence score, and a label that wraps. Each is a missing organ or an existing primitive, and none of them is a Chip. The anchor row deliberately renders an UNSTYLED link, because the interactive-badge organ does not exist and there is nothing honest to draw — and the Audit tab then reports it at 137x17, under the 24x24 floor. That finding is the argument for the organ, not a defect in this page: an unstyled inline link is what members ship today. (It is also reported as having no :focus-visible rule, which is FALSE — the federal `*:focus-visible` in packages/theme covers it. See the library overview: the audit cannot see a bare pseudo-class selector.)',
            },
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'button',
      title: 'Button',
      blurb:
        'The federal control primitive, and the first PROMOTE in the organ registry. Two enums — variant x size — and nothing else: 6 x 4 is the entire surface, and a seventh variant is a change to a federal API rather than a line appended to someone\'s app.css. It renders a real <button> with type="button", takes a real `disabled` attribute so the control leaves the tab order, and declares its own :focus-visible setting the SAME properties as the federal rule so the two can never double-paint.',
      entries: [
        {
          id: 'button-variants',
          name: 'Button · variants',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Button.svelte',
          summary:
            'All six, side by side, at the default size. Every filled variant takes its text from the token PAIRED with its surface, which is the rule that stops `.pdr-btn-primary { color: #fff }` from ever being written again.',
          usage: '<Button variant="primary">Fetch full content</Button>',
          a11y:
            'Hover is guarded `:hover:not(:disabled)` on every variant. `disabled` SHIFTS COLOUR TOKENS — background to --color-surface-2, text to --color-text-muted, border to --color-border — rather than dropping opacity: DESIGN.md\'s primitive floor is explicit that opacity alone is not a state change, and `opacity: 0.4` on a bare `button` selector is the recipe this replaces. `secondary` and `outline` take --color-border-strong and NOT --color-border, because gate A22 measured the latter at 1.2-1.5:1, under F7\'s 3:1 floor for a control boundary.',
          tokens: [
            '--color-accent-hover', '--color-bg-elevated', '--color-border',
            '--color-border-strong', '--color-error-bg', '--color-error-fg',
            '--color-link', '--color-primary', '--color-primary-foreground',
            '--color-surface-2', '--color-surface-raised', '--color-text',
            '--color-text-muted', '--control-h-md', '--focus-ring', '--font-mono',
            '--radius-md', '--space-2xs', '--space-md', '--ui-btn-radius'
          ],
          snippet: buttonVariants,
          controls: {
            label: { kind: 'text', label: 'label (blank = the variant name)', value: '' },
            disabled: { kind: 'boolean', value: false },
          },
          fixtures: [
            {
              id: 'rest',
              name: 'Rest',
              note: 'Look at `destructive` against its surround. Its boundary is a color-mix of --color-error-fg into --color-error-bg, because the fill alone measured 1.02-1.32:1 on every plausible parent — under F7\'s 3:1 floor in both modes. Every contrast gate in this repo is a TEXT gate, and the text here is 7.19:1, which is why that shipped unnoticed through nineteen migrations. The one control where the edge matters most is the one that deletes things.',
            },
            {
              id: 'disabled',
              name: 'Disabled',
              props: { disabled: true },
              note: 'All six collapse to one treatment, on purpose. The `:disabled` rule is declared LAST in the stylesheet because `.ui-btn:disabled` and `.ui-btn[data-variant=\'x\']` tie at specificity (0,2,0) — source order is what decides, and the rule has to come after every variant to win.',
            },
          ],
        },
        {
          id: 'button-matrix',
          name: 'Button · the full matrix',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Button.svelte',
          summary:
            'Six variants x four sizes: the entire API surface in one frame, twenty-four live controls. This is the specimen that did not exist — the reason nobody could see all six variants at once without reading source.',
          usage: '<Button variant="ghost" size="icon" aria-label="Add a source"><svg …/></Button>',
          a11y:
            'Every size clears the WCAG 2.2 SC 2.5.8 target floor: sm IS 24px (--control-h-sm is the floor, not merely above it), md is 28, lg is 32, and icon is a 28x28 square so it clears in both dimensions and lines up with the input beside it. Every icon cell here carries an aria-label; the component refuses size="icon" without one. The svgs are aria-hidden and focusable="false", so each control has exactly one accessible name.',
          tokens: [
            '--color-accent-hover', '--color-bg-elevated', '--color-border',
            '--color-border-strong', '--color-error-bg', '--color-error-fg',
            '--color-link', '--color-primary', '--color-primary-foreground',
            '--color-surface-2', '--color-surface-raised', '--color-text',
            '--color-text-muted', '--control-h-lg', '--control-h-md', '--control-h-sm',
            '--focus-ring', '--font-mono', '--icon-md', '--radius-md', '--space-2xs',
            '--space-lg', '--space-md', '--space-sm', '--ui-btn-radius'
          ],
          snippet: buttonMatrix,
          controls: { disabled: { kind: 'boolean', value: false } },
          fixtures: [
            {
              id: 'matrix',
              name: '6 × 4',
              note: 'Twenty-four controls. Measure any of them: heights come from --control-h-*, horizontal padding from --space-*. There is no --control-px-* family and there deliberately never was — a proposed one had a 14px step that exists on no scale, so it could only ever have been a literal.',
            },
            {
              id: 'matrix-disabled',
              name: '6 × 4, disabled',
              props: { disabled: true },
              note: 'The whole matrix at once is where you can see that disabled is size-independent and variant-independent: one treatment, twenty-four cells, and every one of them out of the tab order.',
            },
          ],
        },
        {
          id: 'button-form',
          name: 'Button · type and forms',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Button.svelte',
          summary:
            'The component defaults to type="button". A bare <button> in HTML defaults to type="submit", which is how a control parked inside a form submits it by accident — so the safe case is the default and the submitting case is something you ask for.',
          usage: '<Button variant="primary" type="submit">Save</Button>',
          a11y:
            'A submit button inside a <form> is the keyboard-accessible way to submit: Enter in any text field fires it, and that behaviour comes free from the platform rather than from a keydown handler. Prefer the platform primitive (authoring contract E4) — a div with an onclick gets none of this.',
          tokens: [
            '--color-accent-hover', '--color-bg-elevated', '--color-border',
            '--color-border-strong', '--color-primary', '--color-primary-foreground',
            '--color-surface-2', '--color-surface-raised', '--color-text',
            '--color-text-muted', '--control-h-md', '--focus-ring', '--font-mono',
            '--radius-md', '--space-2xs', '--space-md', '--ui-btn-radius'
          ],
          snippet: buttonForm,
          controls: { disabled: { kind: 'boolean', value: false } },
          fixtures: [
            {
              id: 'types',
              name: 'button vs submit',
              note: 'Press both, and watch the <output>. This is behaviour, not appearance — the two controls are pixel-identical apart from their variant, and the only way to see the difference is to fire them.',
            },
            {
              id: 'disabled',
              name: 'Disabled submit',
              props: { disabled: true },
              note: 'A disabled submit cannot be reached by Tab and cannot be fired by Enter from a field, because `disabled` is a real attribute here rather than a class. That is the whole argument for the attribute: a class-based "disabled" is a control that still submits.',
            },
          ],
        },
        {
          id: 'button-icon-name',
          name: 'Button · size="icon"',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Button.svelte',
          summary:
            'The one size with a hard requirement attached: an icon-only button REQUIRES aria-label or aria-labelledby. The component enforces it — it stamps data-a11y-error on the element and logs a named error in DEV rather than rendering a silently unreachable control.',
          usage: '<Button size="icon" aria-label="Add a source"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">…</svg></Button>',
          a11y:
            'The sweep that motivated this found unlabelled icon-only buttons in four members. An icon-only control with no accessible name is not a degraded experience for a screen-reader user, it is an invisible one. The enforcement is deliberately loud rather than silent-and-correct: a component that quietly generated a name from its svg would make the defect unfindable.',
          tokens: [
            '--color-bg-elevated', '--color-border', '--color-border-strong',
            '--color-surface-2', '--color-surface-raised', '--color-text',
            '--color-text-muted', '--control-h-md', '--focus-ring', '--font-mono',
            '--icon-md', '--radius-md', '--space-2xs', '--ui-btn-radius'
          ],
          snippet: buttonIconName,
          fixtures: [
            {
              id: 'labelled',
              name: 'Named',
              props: { labelled: true },
              note: '28x28, one accessible name, svg out of the tab order. This is the shape every icon-only call site should have.',
            },
            {
              id: 'unlabelled',
              name: 'Unnamed — the failure',
              props: { labelled: false },
              note: 'Deliberately broken, and pinned as a fixture rather than described in prose. Open the Audit tab on this fixture: the control reports under Names. Open the console: the component says so too. A fixture that renders the failure is worth more than a paragraph claiming the failure is caught.',
            },
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'chip',
      title: 'Chip',
      blurb:
        'The federal LABEL primitive, and the second PROMOTE. A chip is a SMALL LABELLED TOKEN THAT IS NOT A CONTROL — a tag, a badge, a pill, a status, a count, a category. It renders a <span>; it has no onclick, no tabindex and no role. It has no size="lg" either: a chip larger than md is a card or a banner. Where it DOES carry a control — `dismissible` — that control is a real nested <button>, which is legal only because the thing around it is a span.',
      entries: [
        {
          id: 'chip-tones',
          name: 'Chip · tones and sizes',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Chip.svelte',
          summary:
            'Six tones x two sizes, twelve cells. TONE IS SEMANTIC, NOT DECORATIVE: pick by what the label means, never by the colour the member happened to draw. A tag with no state is `neutral` even if it was green.',
          usage: '<Chip tone="ok" size="sm">fetched</Chip>',
          a11y:
            'Every tone ships >=4.5:1 for its text on its OWN background — which is the pair to measure, since a chip paints its own ground rather than sitting on the page\'s. `accent` takes --color-accent-fg and NOT --color-primary: the accent ground is an 8-9% wash of primary over the page, and in light mode primary on that ground measures 4.42:1, under the floor. Two independent migrations measured that before anyone read the component header.',
          tokens: [
            '--color-accent-bg', '--color-accent-fg', '--color-border-strong',
            '--color-error-bg', '--color-error-fg', '--color-info-bg', '--color-info-fg',
            '--color-ok-bg', '--color-ok-fg', '--color-surface-2', '--color-text',
            '--color-text-muted', '--color-warn-bg', '--color-warn-fg', '--font-mono',
            '--font-sans', '--radius-pill', '--space-2xs', '--space-3xs', '--space-md',
            '--space-sm', '--text-label', '--text-meta'
          ],
          snippet: chipTones,
          controls: {
            label: { kind: 'text', label: 'label (blank = the tone name)', value: '' },
            dot: { kind: 'boolean', value: false },
          },
          fixtures: [
            {
              id: 'tones',
              name: '6 × 2',
              note: 'The two sizes differ in type step and padding only — --text-label at sm, --text-meta at md. A Chip does not sit on the control scale at all, because it is not a control; it sizes from its own padding. The one exception is dismissible, which has to clear the target floor.',
            },
            {
              id: 'tones-dot',
              name: '6 × 2, with dot',
              props: { dot: true },
              note: 'The dot is --space-xs square at --radius-round, painted from currentColor so it can never disagree with the tone around it.',
            },
          ],
        },
        {
          id: 'chip-dot',
          name: 'Chip · the dot, and colour alone',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Chip.svelte',
          summary:
            'A leading status mark, and the rule attached to it. `dot` is aria-hidden by construction, so it is decoration — the tone must ALSO be carried by the text, never by colour alone.',
          usage: '<Chip tone="ok" dot>connected</Chip>',
          a11y:
            'WCAG 1.4.1. A chip whose only difference from its neighbour is hue fails, and the dot does not rescue it — an aria-hidden mark adds nothing to the accessible name. This is not hypothetical for this codebase: the sweep found one connection_status value rendered eleven ways, and the states that collapsed into each other collapsed because the words were the same and only the colour differed.',
          tokens: [
            '--color-error-bg', '--color-error-fg', '--color-info-bg', '--color-info-fg',
            '--color-ok-bg', '--color-ok-fg', '--color-surface-2', '--color-text',
            '--color-warn-bg', '--color-warn-fg', '--font-mono', '--font-sans',
            '--radius-pill', '--radius-round', '--space-2xs', '--space-md', '--space-xs',
            '--text-meta'
          ],
          snippet: chipDot,
          fixtures: [
            {
              id: 'dot',
              name: 'Correct',
              note: 'Four states, four different words. Greyscale this and it still reads.',
            },
            {
              id: 'colour-alone',
              name: 'Colour alone — the failure',
              props: { showBad: true },
              note: 'The same four tones with one word between them. Pinned as a fixture because this is the defect that looks fine to the person who shipped it: on their screen, in their mode, the hues are obviously different.',
            },
          ],
        },
        {
          id: 'chip-dismiss',
          name: 'Chip · dismissible',
          kind: 'pattern',
          status: 'stable',
          source: 'packages/shared-ui/src/Chip.svelte',
          summary:
            'A label with a remove affordance. The x is a real <button type="button"> with its own accessible name, its own focus ring and its own 28px target — and `dismissible` REQUIRES `dismissLabel`, enforced the same way size="icon" is.',
          usage: '<Chip dismissible dismissLabel="Remove tag Rural-Access" onDismiss={() => drop(tag)}>Rural-Access</Chip>',
          a11y:
            'Three things are load-bearing here. (1) The dismiss target is --control-h-md, not -sm: at 24px it sat EXACTLY on the WCAG 2.2 SC 2.5.8 floor where the <Button size="icon"> it replaced sat 4px clear, so the first adoption measured a target REDUCTION. (2) A dismissible sm chip is therefore TALLER than a plain sm chip, deliberately — a chip that shrink-wrapped its button would ship a target failure at every call site. (3) revealOnHover reveals on :hover OR :focus-within, never hover alone, and @media (hover: none) forces it visible, because a hover-only affordance does not exist on a touch device.',
          tokens: [
            '--color-accent-bg', '--color-accent-fg', '--color-border-strong',
            '--color-error-bg', '--color-error-fg', '--color-surface-2', '--color-text',
            '--color-text-muted', '--control-h-md', '--focus-ring', '--font-mono',
            '--font-sans', '--icon-sm', '--radius-pill', '--radius-round', '--space-2xs',
            '--space-3xs', '--space-md', '--space-sm', '--text-label', '--text-meta'
          ],
          snippet: chipDismiss,
          fixtures: [
            {
              id: 'dismiss',
              name: 'Both sizes, and reveal',
              note: 'Tab through this one. Every x is reachable, separately named, and >=24px — including the two that are invisible until you reach them. The dismiss handlers are inert on purpose: there is no list to remove from in a gallery, and a fake one would be a fixture pretending to be a product.',
            },
            {
              id: 'missing-label',
              name: 'No dismissLabel — the failure',
              props: { missingLabel: true },
              note: 'A dismissible chip with no name for its button is an unreachable control. The component draws a dashed --color-error-fg outline, logs, and the Audit tab reports the nested button under Names.',
            },
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'ladder',
      title: 'The override ladder',
      blurb:
        'Five rungs, each more visible than the last, and none of them blocked. This is the part of the contract that makes the system survivable: a design system with no escape hatch gets forked, and a design system whose escape hatch is invisible gets forked quietly. Every rung above 1 is COUNTABLE by construction — which is the real design, because the escape hatch is also the detection mechanism.',
      entries: [
        {
          id: 'override-ladder',
          name: 'Rungs 0 → 4',
          kind: 'pattern',
          status: 'stable',
          source: 'context-v/specs/Component-API-Contract-And-The-Control-Scale.md',
          summary:
            'Rung 0 is layout and is not a deviation at all. Rung 1 is the two-enum API. Rungs 2 and 3 take a token NAME and a token name at a percentage — never a value. Rung 4 is class= plus a mandatory data-deviation reason, which surfaces in the consuming member\'s catalog under Deviations (F9).',
          usage: [
            'rung 0  <div style="align-items:flex-start"><Button …/></div>   layout — the parent\'s job',
            'rung 1  <Button variant="outline" size="lg">                    the sanctioned API',
            'rung 2  <Button radius="lg">                                    a token NAME',
            'rung 3  <Button radius="lg/60">                                 calc(var(--radius-lg) * 0.6)',
            'rung 4  <Button class="…" data-deviation="why">                 legal, declared, counted',
          ].join('\n'),
          a11y:
            'Rung 0 has the a11y regression mode, not rungs 2-4. Three self-inflicted bugs in one migration run came from layout fixes and no gate caught any of them: making a popover column-flex to stop Buttons sitting inline crushed every item from 26.8px to 17px — under the very 24px floor the migration existed to fix — because a height-capped column-flex container shrinks its items. Add `flex: 0 0 auto`. The general rule for the top of the ladder: if an override would NEGATE the base recipe rather than adjust it, it is a different organ, and the answer is to leave the thing raw and raise the organ rather than to spend rung 4 on it.',
          deviation:
            'Two, and the second is a finding rather than a declaration. (1) Rung 4 has ZERO real call sites in this repo. Both catalogs that exist report the same — no radius=, no class=, no data-deviation anywhere in corpora-curator or request-reviewer, and the Button rollout mapped nine controls across nineteen members entirely on rung 1. The specimen below is the only rung-4 usage in the tree, which makes it the number worth watching: the first REAL one is a signal about a missing organ, not about a member being careless. (2) RUNG 4 DOES NOT WORK AS SPECIFIED, measured while building this specimen. A rung-4 class is (0,1,0); Svelte compiles the component\'s own rule to .ui-btn.svelte-<hash>, which is (0,2,0). A bare class therefore loses every property the component sets — the first draft of this fixture rendered justify-content: center and looked like a working override. The rule here had to be written .ui-btn.demo-rung-4 to land, and even then it only wins on source order, because (0,2,0) ties. That rung-4 has no real call sites is very likely WHY nobody had noticed.',
          tokens: [
            '--color-accent-bg', '--color-accent-fg', '--color-accent-hover',
            '--color-bg-elevated', '--color-border', '--color-border-strong',
            '--color-link', '--color-ok-bg', '--color-ok-fg', '--color-primary',
            '--color-primary-foreground', '--color-surface-2', '--color-surface-raised',
            '--color-text', '--color-text-muted', '--control-h-lg', '--control-h-md',
            '--control-h-sm', '--focus-ring', '--font-mono', '--font-sans', '--radius-md',
            '--radius-pill', '--space-2xs', '--space-3xs', '--space-lg', '--space-md',
            '--space-sm', '--text-label', '--text-meta', '--ui-btn-radius'
          ],
          snippet: overrideLadder,
          fixtures: [
            { id: 'all', name: 'All five', props: { rung: 'all' }, note: 'The ladder end to end, so the escape hatch is visible and countable in one frame. Read it downward: each rung is legal, and each is louder than the one above it.' },
            { id: 'rung-0', name: 'Rung 0 · layout', props: { rung: '0' }, note: 'Two identical parents differing by one declaration. A column-flex parent stretches its children, and --radius-pill makes that far more visible than a small-radius badge ever was — one chip was measured at 854px wide. It stretched BEFORE the migration too; what changed is that a 3px band reads as a band and an 854px pill reads as a mistake.' },
            { id: 'rung-1', name: 'Rung 1 · the API', props: { rung: '1' }, note: 'Where the overwhelming majority of call sites live and should stay. Map by ROLE, not by the appearance the member happened to draw: one member\'s cancel button was drawn as a transparent outline and is simply variant="destructive".' },
            { id: 'rung-2', name: 'Rung 2 · a token name', props: { rung: '2' }, note: 'Five steps: sm md lg pill round. There is deliberately no xs, and the circle token is `round`, not `full`. Held as a list in the component so an unknown name fails loudly instead of emitting a var() that silently resolves to nothing.' },
            { id: 'rung-3', name: 'Rung 3 · a percentage of one', props: { rung: '3' }, note: 'The Tailwind `/` convention for dimension. A raw 11px would be invisible to every piece of tooling in this repo; radius="lg/60" is greppable, and six of them are an argument for a missing scale step.' },
            { id: 'rung-4', name: 'Rung 4 · class + data-deviation', props: { rung: '4' }, note: 'justify-content: space-between — something the two-enum API genuinely cannot express, which is the only thing rung 4 is for. Drop the data-deviation attribute and the component logs an error: an undeclared deviation is indistinguishable from a bug. Read the second paragraph in the specimen: building this fixture MEASURED that a bare rung-4 class does not win, because Svelte compiles the component rule to .ui-btn.svelte-hash at (0,2,0). That is a defect in the ladder, found by rendering it.' },
            { id: 'unknown-step', name: 'A mis-spelled token', props: { rung: 'unknown' }, note: 'radius="xl" and radius="lg/0". Both fall back to the default and both log a named error listing the valid steps. Compare with the alternative the component rejected — emitting var(--radius-xl) and letting it resolve to nothing, which is invisible until someone screenshots it.' },
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: 'also',
      title: 'Also in shared-ui',
      blurb:
        'Everything else this package exports. Catalogued at less depth than Button and Chip on purpose — these are not federal primitives with a rollout behind them, and the gallery should say so rather than flatten the difference.',
      entries: [
        {
          id: 'confidence-pill',
          name: 'ConfidencePill',
          kind: 'component',
          status: 'legacy',
          source: 'packages/shared-ui/src/ConfidencePill.svelte',
          summary:
            'A numeric badge for pack-response confidence, 0-100, banded low / med / high. It is NOT a Chip and must not be re-derived as one: it speaks a banded numeric vocabulary a six-tone enum cannot, and record-collector already re-implemented it inline and landed a hair off.',
          usage: '<ConfidencePill confidence={82} tooltip="Confidence 82/100 — three corroborating sources" />',
          a11y:
            'The value is rendered as text, so the number is available without colour — the band is reinforcement, not the signal. The `title` attribute is the weak point: DESIGN.md\'s primitive floor says title= is never the only way to access information, and here it carries the only explanation of what the number means. 123 native title= attributes exist in the product against 7 accessible ones; the replacement is specced at context-v/specs/Tooltip-System.md.',
          deviation:
            'Three, all pre-dating the federal contract and all visible in the Audit tab rather than argued here. (1) Its class is `.pill` — unprefixed, and outside the reserved `ui-*` federal namespace, so the containment audit reports it as a leak and this catalog deliberately does NOT exempt it. (2) It hardcodes `999px` where --radius-pill exists, plus `2.25em`, `0.1em 0.55em` and `0.78em` — DESIGN.md\'s authoring contract names this component when it says "a component with a hardcoded 999px is a component with a bug". (3) It sizes type in `em`, which compounds through nesting; DESIGN.md §Typography rule 4 forbids it. Raised, not fixed: this catalog documents the primitives, it does not revise them.',
          // Reconciled against the Audit tab, which reads the real list off the
          // matched rules. Only `high` is listed because the DEFAULT fixture is
          // `high`, and only the band that painted has a matched rule —
          // --color-confidence-low and --color-confidence-med appear on their own
          // fixtures. A declaration that claims more than the specimen reads is
          // exactly the stale list this diff exists to catch.
          tokens: [
            '--color-confidence-high', '--font-mono'
          ],
          component: ConfidencePill,
          controls: {
            confidence: { kind: 'number', label: 'confidence 0-100', value: 82, min: -20, max: 120, step: 1 },
            tooltip: { kind: 'text', value: '' },
          },
          fixtures: [
            { id: 'high', name: 'High · 82', props: { confidence: 82 }, note: '70-100. The only entry in this library rendered through the gallery\'s `component` path rather than a snippet — because it is the only federal export that takes no children. See the library overview for why that is a contract gap and not a preference.' },
            { id: 'med', name: 'Med · 55', props: { confidence: 55 }, note: '40-69.' },
            { id: 'low', name: 'Low · 12', props: { confidence: 12 }, note: '0-39.' },
            { id: 'boundaries', name: 'Boundaries · 39/40/69/70', props: { confidence: 40 }, note: 'Drive the control across 39 → 40 and 69 → 70 and watch the band flip. Banding is >=70 high, >=40 med, else low — inclusive at the bottom of each band, which is the kind of thing that is worth being able to check by dragging rather than by reading.' },
            { id: 'out-of-range', name: 'Out of range · 120', props: { confidence: 120 }, note: 'Clamped to 100 and rounded, so a float or an out-of-range input renders sanely rather than painting a four-character pill. Drive the control to -20 as well.' },
          ],
        },
      ],
    },
  ],
});
