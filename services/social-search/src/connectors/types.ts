// The connector seam — search provider as a first-class concern.
//
// A pack declares a default provider; the dispatcher can override it per-fire
// (provider_override) so the same pack can be re-run through a different
// search engine without editing the pack definition. This is what makes the
// per-row iteration loop possible.
//
// Spec: context-v/issues/Search-Providers-as-First-Class-SearXNG-Default.md

export type ProviderId = 'tavily' | 'searxng';

// Normalized result shape every connector returns. Identical to the old
// TavilyResult so scoring + verification consume it unchanged.
export type ConnectorResult = {
  url: string;
  title: string;
  content: string;
  score?: number;
  published_date?: string; // ISO-8601 when the provider can extract it
};

export type ConnectorOpts = {
  // Providers that support server-side domain restriction (Tavily) use this.
  // Providers that filter post-hoc via the pack's domain_whitelist (SearXNG)
  // ignore it — the whitelist in pickCandidate is the real gate either way.
  include_domains?: string[];
  max_results: number;
  signal?: AbortSignal;
};

// A connector takes a query string + opts and returns normalized results.
// Throws on transport errors; the caller maps that to outcome: 'error'.
export type Connector = (query: string, opts: ConnectorOpts) => Promise<ConnectorResult[]>;
