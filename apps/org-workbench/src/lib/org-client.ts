// Thin typed wrappers over workspace.invoke('...'). The UI never talks to a
// database — these go WS → workspace-service → NATS → record-surrealdb-
// resolver (spec decision D1: the remote is credential-free).
// Template: apps/record-db-resolver/src/lib/resolver-client.ts.

import { workspace } from '@augment-it/workspace';
import type { OrgSuggestion, OrgDetail, AffiliatedPerson, ShapedLink } from './types';

export async function searchOrgs(q: string, client: string): Promise<OrgSuggestion[]> {
  const r = (await workspace.invoke('resolver.search', { q, client })) as {
    ok: boolean;
    candidates?: OrgSuggestion[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'resolver.search failed');
  return r.candidates ?? [];
}

export async function fetchOrgDetail(org_slug: string, client: string): Promise<OrgDetail> {
  const r = (await workspace.invoke('organization.detail', { org_slug, client })) as {
    ok: boolean;
    org?: OrgDetail;
    error?: string;
  };
  if (!r.ok || !r.org) throw new Error(r.error || 'organization.detail failed');
  return r.org;
}

export async function fetchOrgAffiliations(
  org_slug: string,
  client: string,
): Promise<AffiliatedPerson[]> {
  const r = (await workspace.invoke('organization.affiliations', { org_slug, client })) as {
    ok: boolean;
    people?: AffiliatedPerson[];
    error?: string;
  };
  if (!r.ok) throw new Error(r.error || 'organization.affiliations failed');
  return r.people ?? [];
}

type AddArgs = { org_slug: string; url: string; kind?: string; client: string };

export async function addOrgLink(args: AddArgs): Promise<ShapedLink> {
  const r = (await workspace.invoke('organization.links.add', args)) as {
    ok: boolean;
    link?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.link) throw new Error(r.error || 'organization.links.add failed');
  return r.link;
}

export async function addOrgStream(args: AddArgs): Promise<ShapedLink> {
  const r = (await workspace.invoke('organization.streams.add', args)) as {
    ok: boolean;
    stream?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.stream) throw new Error(r.error || 'organization.streams.add failed');
  return r.stream;
}

export async function addOrgCorpus(args: AddArgs): Promise<ShapedLink> {
  const r = (await workspace.invoke('organization.corpus.add', args)) as {
    ok: boolean;
    entry?: ShapedLink;
    error?: string;
  };
  if (!r.ok || !r.entry) throw new Error(r.error || 'organization.corpus.add failed');
  return r.entry;
}
