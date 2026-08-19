---
title: "URL Auto-Detector and Clickable Rendering for List Fields — make socials, helpful_links, and official_updates_index_urls open-in-tab links instead of opaque JSON"
lede: >-
  `socials` and its list-shaped siblings render as 12px JSON; a shape-detecting extractor makes every URL clickable and drops the clutter.
date_created: 2026-06-05
date_modified: 2026-06-05
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-05 — Initial draft.
tags:
  - Plan
  - Augment-It
  - Record-Collector
  - Field-Rendering
  - URL-Detection
  - Clickable-Links
  - Socials
  - Helpful-Links
  - Official-Updates-Index-Urls
  - Audit-Affordance
status: Draft
site_uuid: be33495c-dd37-4f37-b8e4-d18e158e61a7
hex_code: dlrdzb
date_authored_initial_draft: 2026-06-05
date_authored_current_draft: 2026-06-05
publish: true
---

# URL Auto-Detector and Clickable Rendering for List Fields

## Why this plan

The next bundle the operator wants to build fires only against rows
whose `socials`, `helpful_links`, and `official_updates_index_urls`
each carry ≥1 URL. That makes "do these three fields, on this row,
already have the URLs I need?" the single most-asked question Record
Collector will answer for the next several sessions. Today the answer
is buried in 12px monospace JSON:

```
official_updates_index_urls
["https://blankfoundation.org/news/","https://blankfoundation.org/blog/"]
socials
[{"socials_id":"soc_…","pack_id":"linkedin-pack","url":"https://www.linkedin.com/…","display_name":"Arthur Blank","confidence":85,"snippet":"…","source_metadata":{},"response_id":"rsp_…","accepted_at":"2026-…"}]
```

Legible, but not actionable. The operator can't click to confirm the
link still resolves; can't tell at a glance which of three URLs is
the LinkedIn vs the X vs the Wikipedia; and the wall of `socials_id`
/ `response_id` / `source_metadata` / `accepted_at` strings drowns
the one piece of data the next bundle actually needs (the URL
itself).

Per the audit in
[[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]], the
"junk URLs" the operator initially read as a promote bug were
actually 122 URLs accumulated across multiple records-surface
sessions, now visible for the first time because today's
field-renderer fix surfaced array contents. That issue's
recommended recovery split into **audit** (let the operator skim
quickly) and **curate** (let them remove individual entries). This
plan ships the audit half. The curate half is a sibling follow-up
(per-entry `×` button in the same renderer) — out of scope here,
named in §Out of scope so a future plan can pick it up cleanly.

## Use case forcing the shape

Operator's flow in the next bundle:

1. Promote the current canonical to v9.
2. Open Record Collector → variant family → v9 leaf.
3. For each row that's about to enter the new bundle's fan-out:
   - **Glance** at `official_updates_index_urls`. Does it have ≥1
     URL? Do those URLs look like news/blog/stories/press indices,
     not directories or grant-recipient lists?
   - **Glance** at `socials`. Are there entries for LinkedIn / X /
     Wikipedia? Do the display names match the entity?
   - **Glance** at `helpful_links`. Is there anything useful the
     human added during triage that the bundle should be aware of?
4. Click a URL to verify it still resolves and points where expected.
5. Move to the next row.

The unit of work is "scan one row, click two-to-five URLs, move on."
The current renderer makes step 4 impossible (URLs in JSON are
text, not links) and steps 1-3 slow (the eye has to parse JSON
syntax to find the `url` field). Both regressions are removed by the
work in this plan.

## What this plan ships

### 1. A pluggable shape detector in `format.ts`

`apps/record-collector/src/logic/format.ts` today returns a flat
`{ text, isStructured, isEmpty }`. Extend it to also return a
**rendering shape** — one of:

```ts
type FieldShape =
  | { kind: 'scalar';      text: string }
  | { kind: 'scalar_url';  url: string }
  | { kind: 'url_list';    urls: string[] }
  | { kind: 'json';        text: string }   // fallback for arbitrary objects
  | { kind: 'empty' };
```

The detector function picks the shape based on value shape — never
on field name — so the affordance applies uniformly to any future
column that carries URLs, not just the three named here:

- `null` / `undefined` / `''` → `empty`.
- `string` that passes `isLikelyUrl(s)` → `scalar_url`.
- `string` otherwise → `scalar`.
- `string[]` where every entry passes `isLikelyUrl` → `url_list`.
- `Array<object>` where every entry has a `url: string` that
  passes `isLikelyUrl` → `url_list` (drop the metadata; surface
  only the URLs).
- Anything else (mixed-shape arrays, plain objects, etc.) → `json`.

`isLikelyUrl(s)` accepts any string that starts with `http://`,
`https://`, or `//` after trimming. Tolerant — we are not
validating, we are rendering — but rejects bare paths and obviously
non-URL strings so we don't turn entity names into broken links.

The same detector is reused by the existing CSV exporter
(`apps/record-collector/src/logic/download.ts:7 csvEscape`) so the
export and the on-screen render stay in lockstep — when the export
sees a URL-list shape it can decide to flatten to a single
comma-joined URL field on the CSV side or keep the JSON; that's a
follow-up but the detector exposes the right primitive.

### 2. Updated rendering in `App.svelte`

The structured-value branch in
`apps/record-collector/src/App.svelte:286` switches on the new
`shape.kind` instead of `isStructured`:

- `scalar` → existing contenteditable, unchanged.
- `scalar_url` → contenteditable with a leading 🔗 icon-button
  next to the value that opens the URL in a new tab. (The text
  stays editable; the icon is the affordance.)
- `url_list` → a vertical list, one URL per row. Each row is the
  URL text rendered as a clickable
  `<a href={url} target="_blank" rel="noopener noreferrer">`.
  The link text shows the **hostname + path** trimmed to a
  reasonable length (so the column stays narrow), with the full URL
  in `title=` for hover-preview. Read-only by design — editing the
  array is the curate-affordance's job and lives in a sibling plan.
- `json` → today's behavior, unchanged. Fallback for genuinely
  arbitrary structured values.
- `empty` → today's `(empty)` placeholder, unchanged.

### 3. Per-field visual polish

The three load-bearing fields get small affordances on top of
`url_list`:

- **`socials`** — each link prefixed with a small pack chip
  (`linkedin` / `x` / `wikipedia` / `youtube` etc.), pulled from
  the entry's `pack_id`. The chip helps the operator scan "yes
  LinkedIn is present, yes X is present" without reading the URL.
  Existing `.socials` chip-row above the fields stays — this is
  the inline-in-the-row rendering, complementary to the
  chip-row's at-a-glance summary.
- **`helpful_links`** — each link prefixed with the entry's
  `label` if non-empty, otherwise the URL's hostname. The `note`
  field, if present, renders as a small muted tooltip on hover.
- **`official_updates_index_urls`** — plain `url_list` rendering;
  no per-entry metadata exists in the data, so no chip / label
  affordance is needed.

For all three, the metadata that isn't surfaced (e.g.,
`source_metadata`, `confidence`, `accepted_at`, `response_id`) is
deliberately invisible in this surface. That metadata IS preserved
in the row (export still includes it; future surfaces still see
it), it just doesn't compete for visual attention here.

### 4. CSS

New utility classes in
`apps/record-collector/src/app.css`:

- `.field-value-urls` — the wrapper for `url_list` rendering.
  Flex column, small gap, compact line-height.
- `.field-value-url` — one URL entry. `display: flex` with the
  optional chip / label prefix on the left and the link text on
  the right. Truncates long paths via `text-overflow: ellipsis`.
- `.field-value-url a` — link styling. Use the theme's accent
  color for the underline, no underline by default, on hover
  underlined. `target="_blank"` opens in a new tab.
- `.field-value-url-chip` — pack chip / source label. Compact,
  uppercase, muted.

## Implementation order

1. **`format.ts` shape detector.** Extend `FormattedField` to
   include `shape: FieldShape`. Backwards-compatible: keep the
   existing `{ text, isStructured, isEmpty }` fields so any
   downstream consumer that hasn't migrated still works. Unit-test
   shape detection against representative payloads from
   `socials` / `helpful_links` / `official_updates_index_urls`,
   plus edge cases (mixed-type arrays, objects without `url`,
   strings that look like URLs but lack scheme).
2. **`App.svelte` switch.** Replace the structured-value branch's
   `if (isStructured)` with a `switch (shape.kind)`. Render
   `url_list` as the new flex column. Leave `scalar` /
   `scalar_url` / `json` branches working. Don't ship
   `scalar_url`'s icon-button until #5; it's optional and out of
   scope for the first cut.
3. **Per-field affordances.** Detect by-shape AND by-name where
   the name unlocks better rendering (pack chips for `socials`,
   label prefix for `helpful_links`). The name-based hook is
   thin: a small `fieldHints(fieldName: string)` helper returns
   `{ chipFrom?: 'pack_id', labelFrom?: 'label' }`. Render uses
   those hints to extract the chip / label from each entry when
   the entry is an object.
4. **CSS.** Add the three classes named in §4 above; verify in
   light, dark, and vibrant modes.
5. **(Optional, deferred to follow-up plan)** `scalar_url`
   icon-button for the contenteditable branch. Not needed for the
   forcing-function use case.

## Out of scope

These are real and adjacent, but live in sibling plans / issues so
this plan can stay shippable in one branch:

- **Per-entry remove affordance** (the `×` button beside each URL
  in `url_list`). The audit half of
  [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]] is
  what this plan ships; the curate half is a sibling. The detector
  this plan adds is the right substrate for it — the curate plan
  can iterate `url_list` entries and call `row.update` with the
  filtered array — but the affordance itself is a separate UX
  decision (inline `×`? hover-reveal `×`? a "manage" sub-mode?)
  and a separate plan.
- **Pre-promote audit step in PromoteBar.** Also from the
  OfficialPulse issue's prevention list. Records-surface
  concern, separate plan.
- **Pick-time URL-shape hint in Records Surface.** Same.
- **CSV-export shape changes.** The detector enables a future
  "export URL columns as one URL per row, exploded" if that
  becomes useful. Out of scope for this plan; mentioned so the
  detector's API is shaped right.

## Open questions

- **Link text length.** The natural hostname-plus-path rendering
  truncates well for most domains, but Wikipedia URLs with long
  article slugs and Substack URLs with title-in-path can blow
  past the column width. Truncate to N chars with ellipsis? Show
  hostname only with the path in a tooltip? Need to look at the
  real corpus in a sample render before deciding.
- **`scalar_url` heuristic.** Right now any string starting with
  `http://` or `https://` becomes a clickable link. That's
  almost certainly fine for the working corpus, but a column
  literally named `notes` that happens to contain a URL as part
  of a longer string would be mis-rendered. Two paths: trust the
  heuristic (link every URL-shaped string) or only auto-detect
  when the ENTIRE field value is a URL (not "URL embedded in
  prose"). Leaning toward the latter as more conservative; defer
  the decision until the operator sees the first round of
  renders.
- **Read-only vs. editable.** `url_list` is read-only in this
  plan because the curate affordance is a follow-up. But the
  contenteditable branch IS editable for scalar text. Is the
  operator going to expect editable URL-lists too? If yes, the
  remove-affordance plan should land soon after this one.

## See also

- [[OfficialPulse-URLs-Appear-as-Junk-in-Promoted-Versions]] —
  the issue that motivated this plan; the audit half is what
  this plan delivers.
- [[Flow-for-Bundles-Packs]] §"The connectors" — where the
  three target fields are populated; their data shapes are
  defined there.
- [[Packs-and-Bundles-Pattern]] §"Row write-back" — the
  invariant that `socials` is a row-level array column with
  replace-by-`pack_id` semantics; the renderer's `socials` chip
  treatment respects that.
- [[Enhanced-Records-List-and-Promotion-Checkpoint]] §4 —
  `record_uuid` carries identity across promotes; this plan
  doesn't touch promote but its renderer applies to every
  generation of a row.
- [[Record-Set-Family-Grouping]] — the spec whose sibling
  affordances (variant-family suggestion prompt) used the same
  suggestion-only / non-blocking pattern recommended for
  `scalar_url` linkification.
