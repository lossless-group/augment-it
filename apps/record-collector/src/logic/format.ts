// Render a field value as a display string. Mirrors the CSV serializer
// (logic/download.ts → csvEscape) so what the user sees matches what the
// export writes. Returns { text, isStructured, isEmpty } so the caller can
// pick the right branch + styling.

export interface FormattedField {
  text: string;
  isStructured: boolean;
  isEmpty: boolean;
}

export function formatFieldValue(value: unknown): FormattedField {
  if (value == null) {
    return { text: '', isStructured: false, isEmpty: true };
  }
  if (typeof value === 'string') {
    return { text: value, isStructured: false, isEmpty: value.length === 0 };
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return { text: String(value), isStructured: false, isEmpty: false };
  }
  const text = JSON.stringify(value);
  const isEmpty = text === '[]' || text === '{}';
  return { text, isStructured: true, isEmpty };
}
