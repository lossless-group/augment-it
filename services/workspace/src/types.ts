// Shared types for the workspace service.
//
// Exists to break a capabilities.ts ↔ searches.ts import cycle: capabilities
// imports the search handlers, and searches needed `Actor` back from
// capabilities. The cycle was type-only (erased at compile time, so nothing
// was broken at runtime), but it made the module graph lie about which
// direction the dependency runs. Types both sides need live here instead.

// Actor attribution envelope (build-order step 4) — the verified didi.sh
// identity, when the session has one. Rides beside args on every
// NATS-dispatched capability so domain services can stamp created_by /
// updated_by. workspace.* local capabilities have no domain data to stamp
// and ignore it. See [[Workspaces-as-Tenant-Primitive]] § "Tenant-aware
// envelope" for the sibling client_id pattern this mirrors.
export type Actor = { didi_id: string; via?: string };
