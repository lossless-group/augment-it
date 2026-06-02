// In-memory ConnectorRegistry implementation.
//
// Spec: [[../../../../context-v/specs/Connector-Inventory-and-Per-Record-Palette]]
// §"ConnectorRegistry — runtime introspection".
//
// Runtime registration; no persistence. Each connector module registers
// itself at boot (or whenever it's imported). The dispatcher + UI query
// the registry to discover what's available for a given intent. Env
// detection happens at register() time — connectors with missing required
// env vars get status: 'needs-env' so the UI can surface them as dark.
//
// Adding a connector at runtime is the smoke test for the whole pattern:
// drop a file, call register(), refresh the triage view, see the new
// chip-menu entry. No rebuild.

import type { Capability } from './capabilities';
import type {
  ConnectorRegistration,
  UserPrefs,
} from './types';

export interface ConnectorRegistry {
  register(reg: ConnectorRegistration): void;
  unregister(id: string): void;
  resolve(intent: Capability, prefs?: UserPrefs): ConnectorRegistration[];
  byId(id: string): ConnectorRegistration | undefined;
  all(): ConnectorRegistration[];
  availableFor(intent: Capability): ConnectorRegistration[];
  setStatus(id: string, status: ConnectorRegistration['status']): void;
}

// Default cost-tier preference order. When the user hasn't set a
// preferred_cost, free wins, then free-tier, then paid (per spec open
// question lean: "free first by default").
const COST_TIER_ORDER: Record<ConnectorRegistration['cost_tier'], number> = {
  'free': 0,
  'free-tier': 1,
  'paid': 2,
};

class InMemoryConnectorRegistry implements ConnectorRegistry {
  private readonly map = new Map<string, ConnectorRegistration>();

  register(reg: ConnectorRegistration): void {
    // Env detection at registration. requires_env empty → always available
    // unless the registrant pre-set a different status (e.g. 'disabled').
    const status =
      reg.status === 'disabled'
        ? 'disabled'
        : envSatisfied(reg.requires_env)
          ? reg.status
          : 'needs-env';
    this.map.set(reg.id, { ...reg, status });
  }

  unregister(id: string): void {
    this.map.delete(id);
  }

  byId(id: string): ConnectorRegistration | undefined {
    return this.map.get(id);
  }

  all(): ConnectorRegistration[] {
    return [...this.map.values()];
  }

  availableFor(intent: Capability): ConnectorRegistration[] {
    return [...this.map.values()].filter(
      (r) => r.capabilities.includes(intent) && r.status === 'available',
    );
  }

  // Resolve connectors that serve an intent, ordered for default-chain
  // walking. Honors user prefs (explicit ordering wins; banned ids drop;
  // cost-tier preference shapes the rest). Disabled / needs-env / auth-
  // failed connectors are filtered out — the dispatcher only sees
  // candidates it can actually fire.
  resolve(intent: Capability, prefs: UserPrefs = {}): ConnectorRegistration[] {
    const banned = new Set(prefs.disabled_connector_ids ?? []);
    const candidates = [...this.map.values()].filter(
      (r) =>
        r.capabilities.includes(intent) &&
        r.status === 'available' &&
        !banned.has(r.id),
    );

    const explicit = prefs.preferred_order ?? [];
    return candidates.sort((a, b) => {
      // 1. Explicit user ordering (any id in preferred_order beats anything not in it).
      const aIdx = explicit.indexOf(a.id);
      const bIdx = explicit.indexOf(b.id);
      if (aIdx !== -1 || bIdx !== -1) {
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
      }
      // 2. Cost-tier preference. Default: free-first.
      const aCost = COST_TIER_ORDER[a.cost_tier];
      const bCost = COST_TIER_ORDER[b.cost_tier];
      if (aCost !== bCost) {
        if (prefs.prefer_cost === 'paid') return bCost - aCost;
        return aCost - bCost;
      }
      // 3. Stable: display_name alphabetical.
      return a.display_name.localeCompare(b.display_name);
    });
  }

  setStatus(id: string, status: ConnectorRegistration['status']): void {
    const existing = this.map.get(id);
    if (!existing) return;
    this.map.set(id, { ...existing, status });
  }
}

function envSatisfied(requires: string[]): boolean {
  return requires.every((key) => Boolean(process.env[key]));
}

// Module-level singleton. The service process has one registry; tests can
// build their own via new InMemoryConnectorRegistry() if they need
// isolation.
let SINGLETON: ConnectorRegistry | null = null;

export function getRegistry(): ConnectorRegistry {
  if (!SINGLETON) SINGLETON = new InMemoryConnectorRegistry();
  return SINGLETON;
}

// Reset hook for tests. NOT exported from index.ts — explicit import only.
export function _resetRegistryForTests(): void {
  SINGLETON = null;
}
