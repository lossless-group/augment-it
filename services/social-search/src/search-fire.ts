// search.fire — the generic query-shaped fire for Augment-from-DB's
// search-and-add surface. Resolves through the registry: explicit provider
// wins, else best available for the intent (free-tier first per resolve()'s
// ordering), else error. One query, one provider, one reply — the operator's
// re-fire loop lives in the UI, not here.
//
// Spec: context-v/specs/Augment-From-DB-Flow.md §Capability contract.
// Plan: context-v/plans/Augment-From-DB-Phase-1-Service-Capabilities.md.

import { getRegistry } from './registry/registry';
import type { Capability } from './registry/capabilities';
import type { ConnectorResult } from './connectors/types';

export type SearchFireInput = {
  query: string;
  intent?: Capability;
  // Registry id ('exa', 'searxng', 'serpapi-google', …) — NOT the legacy
  // ProviderId ('serpapi'). The palette gets these ids from
  // connectors.inventory, so the two stay consistent by construction.
  provider?: string;
  include_domains?: string[];
  max_results?: number;
};

export async function fireSearch(
  input: SearchFireInput,
): Promise<{ provider: string; results: ConnectorResult[] }> {
  if (!input.query?.trim()) throw new Error('search.fire: query is required');
  const registry = getRegistry();
  const intent = input.intent ?? ('search.web' as Capability);
  const reg = input.provider
    ? registry.byId(input.provider)
    : registry.resolve(intent)[0];
  if (!reg) {
    throw new Error(
      input.provider
        ? `unknown connector: ${input.provider}`
        : `no available connector for intent: ${intent}`,
    );
  }
  if (reg.status !== 'available') {
    throw new Error(`connector ${reg.id} is ${reg.status}`);
  }
  const results = await reg.fire({
    intent,
    query: input.query,
    max_results: input.max_results ?? 10,
    include_domains: input.include_domains,
  });
  return { provider: reg.id, results };
}
