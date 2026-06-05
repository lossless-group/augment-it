// Render a field value as a display string AND classify its shape so the
// template can pick the right rendering branch. The shape detection is
// purely value-based (never field-name-based) so the same affordance
// applies to any future column whose value matches a known shape — no
// special-cased name list to maintain. See
// context-v/plans/URL-Auto-Detector-and-Clickable-Rendering-for-List-Fields.md.

// One link entry surfaced from a url_list. When the original value was a
// plain string[] we just carry the url and leave chip/label undefined.
// When the original was Array<{ url, ... }> we additionally surface a
// chip (from pack_id, when present) and a label (when present), so the
// rendering layer can decorate without having to re-parse the shape.
export interface UrlEntry {
  url: string;
  chip?: string;
  label?: string;
}

export type FieldShape =
  | { kind: 'empty' }
  | { kind: 'scalar'; text: string }
  | { kind: 'scalar_url'; url: string }
  | { kind: 'url_list'; entries: UrlEntry[] }
  | { kind: 'json'; text: string };

export interface FormattedField {
  // Backwards-compatible flat surface — callers that were using the
  // pre-shape API still work. Maps from `shape` as follows:
  //   empty       → { text: '',           isStructured: false, isEmpty: true }
  //   scalar      → { text,               isStructured: false, isEmpty: false (or empty for '') }
  //   scalar_url  → { text: url,          isStructured: false, isEmpty: false }
  //   url_list    → { text: JSON.stringify(original), isStructured: true,  isEmpty: false }
  //   json        → { text: JSON.stringify(original), isStructured: true,  isEmpty: '[]' | '{}' }
  text: string;
  isStructured: boolean;
  isEmpty: boolean;
  shape: FieldShape;
}

// Tolerant URL detector. Render-hint, not validation. Accepts http://,
// https://, and protocol-relative // prefixes after trimming. Bare
// domains and paths are NOT treated as URLs — that would link entity
// names and other prose by accident.
function isLikelyUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return /^(https?:\/\/|\/\/)/i.test(trimmed);
}

// True iff the value is an array AND every element is a string AND every
// element passes the URL heuristic. Empty arrays return false (handled
// as `empty` upstream).
function isStringUrlArray(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((v) => isLikelyUrl(v));
}

// True iff the value is an array AND every element is a non-null object
// AND every element has a `url` property that passes the URL heuristic.
// Empty arrays return false. Auxiliary fields (display_name, confidence,
// label, note, pack_id, response_id, source_metadata, accepted_at, ...)
// are ignored here; the rendering layer pulls chip/label from a small
// fixed allow-list, the rest is intentionally dropped from view.
function isObjectUrlArray(value: unknown): value is Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (v) =>
      v !== null && typeof v === 'object' && isLikelyUrl((v as Record<string, unknown>).url),
  );
}

function objectArrayToEntries(arr: Array<Record<string, unknown>>): UrlEntry[] {
  return arr.map((o) => {
    const entry: UrlEntry = { url: String(o.url).trim() };
    // Pack chip — from pack_id when present (socials). Strip the trailing
    // '-pack' so the chip reads "linkedin" / "x" / "wikipedia" instead of
    // "linkedin-pack" — same convention as the existing .socials chip-row.
    const pack = o.pack_id;
    if (typeof pack === 'string' && pack.length > 0) {
      entry.chip = pack.replace(/-pack$/, '');
    }
    // Label — from `label` when non-empty (helpful_links). Falls back to
    // `display_name` (socials) when label is absent; the rendering layer
    // can decide whether to surface either, both, or neither.
    const label = o.label;
    if (typeof label === 'string' && label.trim().length > 0) {
      entry.label = label.trim();
    } else {
      const display = o.display_name;
      if (typeof display === 'string' && display.trim().length > 0) {
        entry.label = display.trim();
      }
    }
    return entry;
  });
}

export function formatFieldValue(value: unknown): FormattedField {
  if (value == null) {
    return {
      text: '',
      isStructured: false,
      isEmpty: true,
      shape: { kind: 'empty' },
    };
  }

  if (typeof value === 'string') {
    if (value.length === 0) {
      return {
        text: '',
        isStructured: false,
        isEmpty: true,
        shape: { kind: 'empty' },
      };
    }
    if (isLikelyUrl(value)) {
      const url = value.trim();
      return {
        text: url,
        isStructured: false,
        isEmpty: false,
        shape: { kind: 'scalar_url', url },
      };
    }
    return {
      text: value,
      isStructured: false,
      isEmpty: false,
      shape: { kind: 'scalar', text: value },
    };
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value);
    return {
      text,
      isStructured: false,
      isEmpty: false,
      shape: { kind: 'scalar', text },
    };
  }

  // Arrays + plain objects from here. First try the URL-shape branches —
  // they're more specific than the json fallback and take precedence.
  if (isStringUrlArray(value)) {
    const entries: UrlEntry[] = value.map((u) => ({ url: u.trim() }));
    return {
      text: JSON.stringify(value),
      isStructured: true,
      isEmpty: false,
      shape: { kind: 'url_list', entries },
    };
  }

  if (isObjectUrlArray(value)) {
    const entries = objectArrayToEntries(value);
    return {
      text: JSON.stringify(value),
      isStructured: true,
      isEmpty: false,
      shape: { kind: 'url_list', entries },
    };
  }

  // Generic JSON fallback for everything else — mixed-shape arrays,
  // plain objects, arrays of non-URL strings, etc.
  const text = JSON.stringify(value);
  const isEmpty = text === '[]' || text === '{}';
  return {
    text,
    isStructured: true,
    isEmpty,
    shape: { kind: 'json', text },
  };
}
