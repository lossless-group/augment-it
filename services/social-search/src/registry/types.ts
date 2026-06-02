// The connector registration shape + the function signature every
// capability-style connector implements.
//
// Spec: [[../../../../context-v/specs/Connector-Inventory-and-Per-Record-Palette]]
// §"Code seam".
//
// Parallel to (not replacing) the existing `Connector` type in
// ../connectors/types.ts. Step 1 of the migration plan: this registry is
// parallel infrastructure — existing dispatcher code keeps using the old
// shape. Step 2+ migrates packs to declare intents; step 3+ flips the
// dispatcher to resolve through the registry.

import type { Capability } from './capabilities';
import type { ConnectorResult } from '../connectors/types';

// Re-export so registry consumers don't reach into ../connectors/.
export type { ConnectorResult } from '../connectors/types';

// Per-fire options. Superset of the existing ConnectorOpts on the search
// connector (adds the intent + a per-fire seam for connector-specific
// hints — e.g. SerpApi's `engine` would ride here if a caller wanted to
// force `google_news` instead of `google`).
export type ConnectorFireOpts = {
  intent: Capability;
  query: string;
  max_results: number;
  include_domains?: string[];
  signal?: AbortSignal;
  // Connector-specific hints. Each connector documents what it reads.
  // Avoids re-typing ConnectorFireOpts every time a connector grows a knob.
  hints?: Record<string, unknown>;
};

// The signature every capability-style connector exports. The registry
// invokes it; intent is passed in so connectors that serve multiple
// intents (SerpApi via engine= param) can branch internally.
export type ConnectorFn = (opts: ConnectorFireOpts) => Promise<ConnectorResult[]>;

export type ConnectorStatus =
  | 'available'    // serving requests
  | 'disabled'     // explicitly turned off
  | 'rate-limited' // upstream told us to back off; auto-recovers
  | 'auth-failed'  // env vars present but auth call failed
  | 'needs-env';   // required env vars missing

export type CostTier = 'free' | 'free-tier' | 'paid';

export type RateHints = {
  per_second?: number;
  daily_cap?: number;
};

export type ConnectorRegistration = {
  // Stable id used by chains, history, and per-fire overrides.
  // Convention: <connector>-<flavor> when one connector serves multiple
  // engines, e.g. 'serpapi-google', 'serpapi-google_news'.
  id: string;
  display_name: string;
  // Two- or three-char chip label per the per-record palette spec.
  // Only consulted when a connector overrides the pack-level chip label
  // (rare — usually the intent's SHORT_LABEL_BY_INTENT is what shows).
  short_label: string;
  capabilities: Capability[];
  cost_tier: CostTier;
  // Env vars whose ABSENCE forces status: 'needs-env'. Auth-failed is a
  // runtime determination after a real call fails.
  requires_env: string[];
  rate_hints?: RateHints;
  status: ConnectorStatus;
  fire: ConnectorFn;
};

// User preferences passed into resolve(). Step-1 default: empty. Future
// surface: per-user persisted preferences, cost-tier ordering, banned
// connectors. The interface is here so resolve()'s shape doesn't change
// when these land.
export type UserPrefs = {
  prefer_cost?: CostTier;          // 'free' → free first; 'paid' → paid first
  disabled_connector_ids?: string[];
  preferred_order?: string[];      // explicit ordering for a specific user
};
