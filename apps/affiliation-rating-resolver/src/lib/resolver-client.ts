// Thin typed wrappers over workspace.invoke(...). The UI never talks to a
// database — every call goes WS → workspace-service → NATS →
// record-surrealdb-resolver, same as every other resolver remote.

import { workspace } from '@augment-it/workspace';
import type { AffiliationRateResult, AffiliationDetail, Link, CorpusEntry } from './types';

export async function rateAffiliation(args: {
  person_uuid: string;
  org_slug: string;
  relevance: string;
  relevance_note?: string | null;
  client: string;
}): Promise<AffiliationRateResult> {
  const r = (await workspace.invoke('affiliation.rate', args)) as AffiliationRateResult;
  if (!r.ok) throw new Error(r.error || 'affiliation.rate failed');
  return r;
}

export async function fetchAffiliationDetail(person_uuid: string, org_slug: string): Promise<AffiliationDetail> {
  const r = (await workspace.invoke('affiliation.detail', { person_uuid, org_slug })) as AffiliationDetail;
  if (!r.ok) throw new Error(r.error || 'affiliation.detail failed');
  return r;
}

export async function addPersonLink(args: { person_uuid: string; url: string; client: string }): Promise<Link> {
  const r = (await workspace.invoke('person.links.add', args)) as { ok: boolean; link?: Link; error?: string };
  if (!r.ok || !r.link) throw new Error(r.error || 'person.links.add failed');
  return r.link;
}

export async function addPersonCorpus(args: { person_uuid: string; url: string; client: string }): Promise<CorpusEntry> {
  const r = (await workspace.invoke('person.corpus.add', args)) as { ok: boolean; entry?: CorpusEntry; error?: string };
  if (!r.ok || !r.entry) throw new Error(r.error || 'person.corpus.add failed');
  return r.entry;
}

export async function addOrgLink(args: { org_slug: string; url: string; client: string }): Promise<Link> {
  const r = (await workspace.invoke('organization.links.add', args)) as { ok: boolean; link?: Link; error?: string };
  if (!r.ok || !r.link) throw new Error(r.error || 'organization.links.add failed');
  return r.link;
}

export async function addOrgCorpus(args: { org_slug: string; url: string; client: string }): Promise<CorpusEntry> {
  const r = (await workspace.invoke('organization.corpus.add', args)) as { ok: boolean; entry?: CorpusEntry; error?: string };
  if (!r.ok || !r.entry) throw new Error(r.error || 'organization.corpus.add failed');
  return r.entry;
}
