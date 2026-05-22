// {{token}} extraction and substitution.
//
// Tokens are whatever sits between {{ and }}, trimmed. Column names in
// augment-it routinely contain spaces, slashes, parentheses and question
// marks ("Prospect / Organization", "q1: will you be bringing a guest?"),
// so the token is matched verbatim against column names — no normalisation.

const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Distinct {{token}} names found in the template body, in first-seen order. */
export function extractTokens(content: string): string[] {
  const seen = new Set<string>();
  for (const match of content.matchAll(TOKEN_RE)) {
    seen.add(match[1]);
  }
  return [...seen];
}

/**
 * Substitute every {{token}} with the matching value from `fields`.
 * A token with no matching field is left as the literal {{token}} — the
 * bind check in run.ts catches unbound tokens before we ever get here, so
 * in practice every token resolves.
 */
export function fillTemplate(
  content: string,
  fields: Record<string, unknown>,
): string {
  return content.replace(TOKEN_RE, (whole, name: string) => {
    const key = name.trim();
    if (!Object.hasOwn(fields, key)) return whole;
    const v = fields[key];
    return v === null || v === undefined ? '' : String(v);
  });
}
