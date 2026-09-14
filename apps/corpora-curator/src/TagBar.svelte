<script lang="ts">
  import Chip from '@augment-it/shared-ui/Chip.svelte';
  import SearchBoxLiveFilter from '@augment-it/shared-ui/SearchBox--LiveFilter.svelte';
  import { tick } from 'svelte';
  import { curation } from './curation.svelte';

  // --LiveFilter, not --Autocomplete, and the code decides it: the options were
  // `curation.suggestTags(input)`, a synchronous `tagVocab.filter()` over an
  // array this member already holds. There is no request, so there is nothing
  // for a debounce, a stale-response guard, a min-length gate or a loading /
  // empty / error state to do. --Autocomplete would have wrapped a `Promise`
  // around `Array.prototype.filter` and shipped four states that can never
  // occur.
  //
  // `suggestTags` itself is GONE from curation.svelte.ts. Its substring match is
  // SearchBox--LiveFilter's default match, and its `.slice(0, 12)` cap is
  // redundant against the popup's own `max-block-size: 40vh; overflow-y: auto`
  // — a cap that hid matches 13+ with no way to reach them is worse than a
  // scroll.
  const tagOptions = $derived(curation.tagVocab.map((t) => ({ id: t, label: t })));

  // The typed text, mirrored back out of the widget. This member accepts a tag
  // that matches NOTHING, which the spec puts squarely on the member ("free
  // text as a value … stays the member's Enter handler"), and this is the only
  // way the member can see what was typed.
  let typed = $state('');

  // DEVIATION — SearchBox--LiveFilter exposes no way to clear its query after a
  // pick, so the member remounts it. `value` is $bindable on the private
  // SearchBoxCore and is not re-exported by either variant, and `pick()` leaves
  // the query in place — correct for the five members that SEARCH (you picked
  // "Acme Corp", the box should still say "acme") and wrong for the one that
  // PICKS. Without this, adding `Employer-Partnerships` leaves "Emp" in the box
  // and the next tag is typed onto the end of it.
  //
  // Raised, not chased: the fix belongs in packages/shared-ui as a `clearOnSelect`
  // prop or a re-exported `bind:value`, and packages/ is out of bounds here.
  let resetToken = $state(0);
  let wrapEl = $state<HTMLElement | null>(null);

  function apply(tag: string): void {
    void curation.applyTag(tag);
    typed = '';
    resetToken += 1;
    // The remount replaces the input element, so put the caret back. A tag
    // field is used in runs of three or four, not once. `tick()` rather than
    // queueMicrotask: the new input does not exist until Svelte has flushed.
    void tick().then(() => wrapEl?.querySelector('input')?.focus());
  }

  // The member's own Enter, and the ONLY correct spelling of it.
  //
  // Passing `onkeydown` to the component would have REPLACED the keyboard
  // contract rather than added to it — SearchBoxCore spreads `...rest` onto the
  // input AFTER its own `onkeydown`, silently. So the member listens one level
  // up, where the same event arrives by bubbling, and reads the widget's own
  // signal: SearchBoxCore calls `preventDefault()` on Enter if and only if it
  // picked an active option ("with none active, Enter is the member's own
  // submit, not the widget's"). `defaultPrevented` is therefore exactly the
  // discriminator the spec describes, already on the wire.
  function onEnter(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.defaultPrevented) return;
    // Guard BEFORE preventDefault: an Enter on an empty box is nobody's, and
    // swallowing it would break this field the day it lands inside a <form>.
    if (!typed.trim()) return;
    e.preventDefault();
    apply(typed);
  }
</script>

<div class="cc-field">
  <span class="cc-label">Tags <span class="cc-muted cc-mini">— Train-Case, workspace vocabulary, auto-complete</span></span>

  <div class="cc-tags">
    {#each curation.focused?.tags ?? [] as t}
      <!-- One Chip replaces a span wrapping a Button. The span was never
           interactive so this was not the nested-interactive bug, but the
           accessible name was still wrong: five tags, five identical "remove
           tag" buttons.

           NO revealOnHover, and that is a decision rather than an omission.
           This member has no reveal discipline to preserve: checked the whole of
           app.css at HEAD and there is not one `opacity: 0`, `visibility:
           hidden` or hover-reveal rule in it — every × here has always rested
           visible. Passing revealOnHover would have INTRODUCED a hover-only
           affordance, which does not exist on a touch device. -->
      <Chip size="sm" dismissible dismissLabel="remove tag {t}" onDismiss={() => curation.removeTag(t)}>{t}</Chip>
    {/each}
  </div>

  <!-- Rung 0 — a wrapper that exists to catch the bubbled Enter and to hold a
       handle for re-focusing after the remount. No CSS: `.ui-searchbox` is
       already `position: relative`, which is the whole of what the deleted
       `.cc-tag-input` rule did. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- The rule is right about the shape and wrong about this case. The wrapper
       is not an interactive element — it never takes focus, has no role, and
       handles nothing of its own. It is a DELEGATION point: the Enter that
       reaches it was dispatched at the combobox input inside, and bubbled.
       Giving this div a role to satisfy the lint would invent a second widget
       around the one that already exists. -->
  <div bind:this={wrapEl} onkeydown={onEnter}>
    {#key resetToken}
      <SearchBoxLiveFilter
        options={tagOptions}
        label="add a tag"
        placeholder="add a tag…"
        oninput={(t: string) => (typed = t)}
        onselect={(id: string) => apply(id)}
      />
    {/key}
  </div>
</div>
