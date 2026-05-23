---
title: "All Data Continues — the rule augment-it actually obeys now"
lede: "augment-it is a multi-tenant pipeline tool. Different clients will upload spreadsheets with wildly different columns. The code cannot have opinions about specific field names. Today we ripped out every place where it did: no hardcoded reserved-field lists, no field-name-aware special rendering, no schema decisions imposed on tenant data. The cell renderer is type-driven (scalar → text, object/array → JSON), the canonical-schema union is presence-driven (any key with values is a column), the promote-fold is type-driven (arrays merge, objects merge, scalars overwrite). One rule everywhere: whatever a tenant puts in row.fields stays in row.fields and ends up in the promoted record. This entry shows the messy middle — what we got wrong, how the user pushed back twice, and what the corrected discipline reads like."
publish: true
date_created: 2026-05-23
date_modified: 2026-05-23
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
tags:
  - Augment-It
  - Multi-Tenant
  - Generic-Rendering
  - Schema-Free
  - Type-Driven
  - Principle-Correction
  - Promote-Fold
  - Record-Collector
  - Enhanced-Records-List
files_changed:
  - apps/record-collector/src/App.svelte
  - apps/record-collector/src/app.css
  - apps/enhanced-records-list/src/App.svelte
  - apps/enhanced-records-list/src/app.css
  - services/row-store/src/store.ts
---

## Why Care?

augment-it is heading toward being used by many clients — eventually any
user who creates an account, uploading any spreadsheet they have. There
is no canonical schema. There won't be one. A nonprofit's fundraising
pipeline, a VC's deal flow, a recruiter's candidate list — every one of
those is "structured tabular data" but the columns are whatever the user
happened to put in their sheet.

So a hard rule on the code: **no hardcoded knowledge of any specific
column name**. Anywhere. The fold can't say *"if helpful_links, then
merge"*. The renderer can't say *"if record_uuid, then hide"*. The
schema union can't say *"these reserved keys aren't real columns"*. Each
of those decisions IS a tenant-specific assumption — when the next
tenant's CSV happens to use a column named `record_uuid` for their own
purposes, every line of code that special-cases it breaks silently.

The corrected rule has two clauses:

1. **All data continues**: every field in `row.fields` flows verbatim into
   every derivation, every promotion, every render. The promote-fold
   never filters; the schema union declares every key with a value as a
   column.
2. **Behavior is type-driven, not name-driven**: an array MERGES across
   derivations regardless of its column name; an object MERGES by key
   regardless of its column name; a scalar overwrites regardless of its
   column name. The renderer JSON-stringifies any object/array regardless
   of its column name; toString's any scalar regardless of its column
   name.

Both clauses were violated in the code that shipped earlier today. This
entry is the correction, written down so the next agent (or the next
me) doesn't backslide.

## What's New?

- **Record Collector's row renderer** no longer string-coerces objects to
  `[object Object]`. Structured values render as JSON in a monospace,
  muted, read-only cell. Editing structured data inline would be a
  data-loss vector (one accidental keystroke replaces an array with a
  string); the read-only treatment is the safe default until a richer
  structured editor is its own feature.
- **Enhanced Records' cell renderer** is now a single generic
  `formatCell(value)` function: null/empty → blank, object/array →
  `JSON.stringify`, scalar → `String()`. No name-aware branches. The
  dedicated `🔗` link-count column is gone — `helpful_links` shows up as
  a regular column with its JSON visible, same as any other structured
  field would.
- **Enhanced Records' enrichment-column list** declares every key not in
  the parent CSV as a column. The `INTERNAL_HIDE` set that was filtering
  out `record_uuid` and `archived` is gone. If a row has a field, the
  column appears; if not, it doesn't.
- **The promote-fold** in `services/row-store/src/store.ts` is purely
  type-driven. The previous version had two named special cases —
  `helpful_links` merged as an ID-keyed array, `triage_states` merged
  as a prompt-id-keyed object. Both are now subsumed by the generic
  rule: *if both sides are arrays, concat + shallow-dedupe; if both are
  objects, merge by key; otherwise overwrite*. The fold doesn't know the
  word "helpful_links" anywhere; it just knows the shape of the data
  passing through it.
- **The canonical-schema union** declares every key found in any
  contributing row as a column. The previous `RESERVED_FIELD_KEYS` set
  (which excluded `record_uuid`, `helpful_links`, `archived`,
  `triage_states` from being schema columns) is gone. If data exists,
  it's declared. Period.

## The messy middle — what we got wrong

Two pushbacks from the user during the build session. Both legitimate.
Capturing them because the lesson is portable.

### Pushback #1

After the first version of promote shipped, the user noticed the canonical
didn't have `helpful_links` as a column even though the rows underneath
had `helpful_links` data. The code's response: *that data is in
`row.fields.helpful_links`; the count badge shows it in the table; the
schema didn't declare it as a column because it's "reserved"*. That logic
came from a spec written before the multi-tenant principle was load-
bearing. The user's response:

> *You were supposed to include all data, not try to match the schema.
> This is not the kind of project where you can try to define schema
> upfront and have hard validations and clearly defined
> properties/columns. ALL DATA MUST CONTINUE THE PROCESS AT ALL TIMES.*

The correction at this stage was incomplete. The `RESERVED_FIELD_KEYS`
set got removed from the schema union, but the UI still had an
`INTERNAL_HIDE` set, a name-aware cell renderer with `if (col ===
'helpful_links')`, and a dedicated `🔗` column with a click-to-expand
affordance. All of those were the SAME bug in different clothes: the
code knowing column names.

### Pushback #2

The user looked at the next round and saw `helpful_links` was now
declared but the click-to-expand UI was still field-name-specific:

> *The helpful links feature is cool, I like it, but it should just be
> adding it to the records as a column with a json object syntax.*

Translation: stop being clever. Render it like every other column would
be rendered — as a value. If it's a complex value, show its JSON. The
user reads JSON. They don't need a custom popover. And critically, the
SAME treatment has to apply to whatever ELSE shows up — `triage_states`
when that lands, themed link clusters in v2 of the prompt model, any
tenant's arbitrary structured field. Type-driven, not name-driven.

That correction landed, INTERNAL_HIDE removed, generic `formatCell`,
generic type-driven fold. Then a third moment that was less of a
pushback and more of a category error on my side:

> *WHY ARE YOU STRIPPING OUT "record_uuid" ??????*

In the cleanup pass I also removed `createRecordSet`'s `record_uuid`
mint, reasoning *"record_uuid is a hardcoded field name I'm injecting
into rows, that's also schema-imposing"*. But it isn't the same thing.
The user's rule is **don't HIDE data**. Minting `record_uuid` ADDS data
— specifically, the load-bearing cross-derivation identity that the
entire canonical-set model relies on. The corrected test is *"does it
make data harder for the user to see?"* not *"does the code mention a
field name anywhere?"*. Restored the mint. record_uuid is now a column
the user can see — visible like any other field — and the lineage
property is preserved.

## How it Works

### The cell renderer (Enhanced Records)

```ts
function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); }
    catch { return String(value); }
  }
  return String(value);
}
```

Five lines. No column-name knowledge. Every cell in the table goes
through this one function. The HTML uses the `title` attribute to
provide a tooltip with the full JSON when the cell content is truncated
by CSS.

### Record Collector's structured-cell treatment

```svelte
{#if value !== null && typeof value === 'object'}
  <div class="field-value field-value-json"
       title="structured value (read-only here)">
    {JSON.stringify(value)}
  </div>
{:else}
  <div class="field-value" contenteditable="true" ...>
    {value ?? ''}
  </div>
{/if}
```

The split: scalar values stay editable (Record Collector's primary job
is cell-by-cell editing of imported data); structured values render as
JSON with `contenteditable` disabled so the user can't accidentally
overwrite an array with a string. A richer structured-data editor — a
JSON-aware editor, or a per-field-type editor — is a future feature,
not a v0.0.1 concern.

### The promote fold

```ts
const isEffectivelyEmpty = (v: unknown): boolean => {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && v !== null && Object.keys(v as object).length === 0) return true;
  return false;
};

for (const [k, v] of Object.entries(dr.fields)) {
  if (isEffectivelyEmpty(v)) continue;
  const existing = folded[k];
  if (Array.isArray(existing) && Array.isArray(v)) {
    folded[k] = dedupShallow([...existing, ...v]);
  } else if (isPlainObject(existing) && isPlainObject(v)) {
    folded[k] = { ...existing, ...v };
  } else {
    folded[k] = v;
  }
}
```

Three branches:

- Both are arrays → concat + shallow-dedupe by JSON-stringify signature
- Both are plain objects → merge by key (incoming wins ties)
- Otherwise → incoming overwrites (or is skipped if effectively empty)

The fold reads `existing` and `v` for their TYPES, never their NAMES.
Whether `k` is `helpful_links` or `tags` or `categories` or some tenant's
arbitrary list-of-things column, the same rule applies.

### The schema union

```ts
const undeclaredCols: string[] = [];
for (const row of allContributingRows) {
  for (const key of Object.keys(row.fields)) {
    if (parentColNames.includes(key)) continue;
    if (declaredEnrichmentCols.includes(key)) continue;
    if (undeclaredCols.includes(key)) continue;
    undeclaredCols.push(key);
  }
}
```

Walks every row's fields, declares every key that isn't already in the
parent or derivation schemas as an additional column. No filter list.

## Under the Hood

### Why type-driven array merge is safe across tenants

The previous logic special-cased `helpful_links` to merge by `link_id`.
That assumed every array of objects has a `link_id` field. The new
logic dedupes by JSON-stringify signature — works for any shape of
object, including primitives. It's slightly more permissive (two
deeply-equal objects coincidentally produced by two different sources
collapse to one) which is the right semantic for "list of things
accumulated from multiple sources."

### Why the contenteditable lockout matters

`String([{ link_id: 'x', url: 'y' }])` is `"[object Object]"`. If
Record Collector's cell shows that string in a contenteditable, the
user can:

- Glance at the cell, see the string, type to "fix" it
- Tab away (firing `onblur`)
- The `commitEdit` handler sends `row.update` with `helpful_links:
  "the user's typed text"` — overwriting the array of objects with a
  bare string

That's a one-keystroke data-loss vector. Disabling `contenteditable`
for structured values eliminates it. The display reads as JSON (which
makes the cell visibly "different" — monospace, muted) so the user can
see what's there without having any temptation to inline-edit it.

### Why we kept record_uuid in row.fields rather than moving it to a Row
sibling

The "honest" architecture for a system-managed identity field is a
top-level property on `Row` (alongside `row_id`), not a member of
`row.fields`. That keeps system metadata distinct from tenant data.
The refactor would touch types in two packages + the prompt-runner
derivation path + the row-store handlers.

The decision for today: keep record_uuid in `row.fields`. Two reasons:

1. The user's principle is *"all content visible"*. record_uuid is
   content the user can see — visible as a column like any other.
2. Migration cost. Existing rows already have `record_uuid` in their
   fields. A move to a sibling property would require migrating those
   rows. Not worth the churn for a behavioral parity (the user gets
   the same visibility either way).

If a tenant ever uploads a CSV with their own column named
`record_uuid` and a legitimate collision happens, that's the trigger
to do the sibling-property refactor. Until then, record_uuid is data.

## What's Next

- **Type-driven richer editing.** Today: structured cells are read-only
  in Record Collector. Future: a JSON-aware inline editor (or a popover
  with a structured editor for known shapes — arrays of links, arrays
  of strings, etc.). The trigger is the first time a user wants to
  edit an LLM-produced JSON cluster without round-tripping through
  external tools.
- **A multi-tenant audit pass.** This entry codifies the *"no hardcoded
  field names"* rule. Worth a single-purpose audit across every app
  to catch any other places where the rule isn't being honored.
  Candidates to check: Response Reviewer's display, Request Reviewer's
  request-builder, prompt-runner's column-resolution logic.
- **CementedTriage**: triage_states becomes a real field on rows at
  promote time (v0.0.2 work flagged in the companion changelog entry).
  When it lands, the type-driven fold + generic renderer handle it for
  free — *because* the discipline now holds. That's the dividend.

## References

- Companion entry on the build that surfaced this principle:
  `changelog/2026-05-23_02_Enhanced-Records-List-and-Promotion-Mechanic.md`
- The blueprint that says the data shape is a tenant choice, not a
  system choice: `context-v/blueprints/Original-and-Enhanced-Record-Instances.md`
- The relevant ai-labs blueprint (sibling repo): the chat-as-verb-surface
  patterns codify *type-based dispatch, never name-based*
- The earlier feedback memory that drove the dynamic-schema discipline:
  *"row columns always derived per-upload from CSV headers; never
  user-predefined; never validate against a fixed shape"*
