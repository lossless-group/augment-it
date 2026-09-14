/**
 * The connection-state vocabulary, in a file a member can actually import.
 *
 * It used to live only in `StatusIndicator.svelte`'s instance script, which no
 * package `exports` map can reach — so all sixteen adopting members re-declared
 * the union by hand. Sixteen copies of one list is sixteen chances to drift, and
 * nothing would have caught a member that added a seventh state or misspelled a
 * sixth.
 *
 * One member's adoption test compares its own union against this one TEXTUALLY,
 * because nothing enforces it at the type level. That test exists because this
 * file did not.
 */
export type ConnectionState =
  | 'open'
  | 'connecting'
  | 'auth_required'
  | 'closed'
  | 'error'
  | 'idle';

/** Every state, in the order a status legend should list them. */
export const CONNECTION_STATES: readonly ConnectionState[] = [
  'open',
  'connecting',
  'auth_required',
  'closed',
  'error',
  'idle',
] as const;
