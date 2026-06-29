// Strategy-curator state — a Svelte 5 runes singleton, per
// [[Per-App-Workspace-Conventions]]. Single source of truth; components read
// derived getters and call actions. Every mutation goes through a workspace
// capability (strategy.* / source.* / extract.* / tag.*) — no direct storage
// access. Capability calls degrade gracefully so the surface renders standalone
// before the resolver / content-ingest handlers are wired (Increment 2).
//
// $state is assigned in the constructor (not as a class-field initializer) to
// match the workspace package's placement-invariant note about field lowering.

import { workspace, type WorkspaceSummary } from '@augment-it/workspace';
import type { ExtractKind, Source, Strategy } from './types';

const TOKEN_KEY = 'augment-it:session-token';
const WS_URL = 'ws://localhost:3001/ws';
const ACTIVE_STRATEGY_KEY = 'augment-it:active-strategy';
// This surface is the type='strategy' view of the generic domain catalog;
// every domain.* / source.* call carries this type.
const DOMAIN_TYPE = 'strategy';

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Tags: enforce dashes-not-spaces but PRESERVE the casing the user typed, so
// "Impact of AI" → "Impact-of-AI" (not "Impact-Of-Ai"). The user owns the casing.
export function toDashed(s: string): string {
  return s
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .join('-');
}

type ConnStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

class CurationState {
  connection: ConnStatus;
  lastError: string | null;
  clientSlug: string | null; // active workspace/client — threaded into every capability call

  strategies: Strategy[];
  activeSlug: string | null;

  sources: Source[];
  focusIdx: number;
  listFilter: string;

  tagVocab: string[];
  saveStatus: string;

  constructor() {
    this.connection = $state<ConnStatus>('idle');
    this.lastError = $state<string | null>(null);
    this.clientSlug = $state<string | null>(null);
    this.strategies = $state<Strategy[]>([]);
    this.activeSlug = $state<string | null>(null);
    this.sources = $state<Source[]>([]);
    this.focusIdx = $state<number>(0);
    this.listFilter = $state<string>('');
    this.tagVocab = $state<string[]>([]);
    this.saveStatus = $state<string>('');
  }

  // --- derived (plain getters read $state reactively) ---
  get active(): Strategy | null {
    return this.strategies.find((s) => s.slug === this.activeSlug) ?? null;
  }
  get focused(): Source | null {
    return this.sources[this.focusIdx] ?? null;
  }
  get filtered(): { source: Source; index: number }[] {
    const q = this.listFilter.trim().toLowerCase();
    return this.sources
      .map((source, index) => ({ source, index }))
      .filter(({ source }) => {
        if (!q) return true;
        const hay = [source.title, source.publisher, source.url, (source.tags ?? []).join(' '), (source.funder_slugs ?? []).join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
  }

  // --- lifecycle ---
  init(): void {
    if (this.connection === 'open' || this.connection === 'connecting') return;
    workspace.connect({
      url: WS_URL,
      getToken: () => (typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null),
      saveToken: (t: string) => {
        if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, t);
      },
      onStatus: (s) => {
        this.connection = s as ConnStatus;
        if (s === 'open') void this.bootstrap();
      },
    });
  }

  private async call<T>(capability: string, args: unknown): Promise<T | null> {
    try {
      const r = (await workspace.invoke(capability, args)) as T & { ok?: boolean; error?: string };
      // A handler that caught an error replies { ok:false, error } WITHOUT
      // throwing — treat that as a failure, don't let it masquerade as success.
      if (r && typeof r === 'object' && (r as { ok?: boolean }).ok === false) {
        this.lastError = `${capability}: ${(r as { error?: string }).error ?? 'failed'}`;
        return null;
      }
      this.lastError = null;
      return r as T;
    } catch (e) {
      this.lastError = `${capability}: ${(e as Error)?.message ?? String(e)}`;
      return null;
    }
  }

  // --- strategies ---
  // Resolve the active workspace once, then load its strategies. Every
  // capability that's workspace-scoped gets client_slug threaded in (dispatch
  // does NOT inject it — args pass through verbatim).
  async bootstrap(): Promise<void> {
    await workspace.loadWorkspaces(); // loads the workspace list + resolves the active one
    this.clientSlug = workspace.active_client_id ?? null;
    await this.loadStrategies();
  }

  get workspaces(): WorkspaceSummary[] {
    return workspace.workspaces;
  }

  // Switch the client/workspace strategies are written into. The active workspace
  // is the (client) corpus everything lands in — make it explicit, never implicit.
  async switchWorkspace(client_id: string): Promise<void> {
    if (!client_id || client_id === this.clientSlug) return;
    await workspace.activateWorkspace(client_id);
    this.clientSlug = client_id;
    this.activeSlug = null;
    this.sources = [];
    this.saveStatus = `workspace → ${client_id}`;
    await this.loadStrategies();
  }

  async loadStrategies(): Promise<void> {
    const r = await this.call<{ domains: Strategy[] }>('domain.list', { type: DOMAIN_TYPE, client_slug: this.clientSlug });
    this.strategies = r?.domains ?? [];
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_STRATEGY_KEY) : null;
    if (saved && this.strategies.some((s) => s.slug === saved)) void this.select(saved);
  }

  async createStrategy(input: { title: string; slug: string; tags: string[] }): Promise<void> {
    const title = input.title.trim();
    const strategy_slug = slugify(input.slug || title);
    if (!title || !strategy_slug) return;
    const tags = input.tags.map(toDashed).filter(Boolean);
    const r = await this.call<{ domain: Strategy; corpus_path?: string }>('domain.create', {
      type: DOMAIN_TYPE,
      slug: strategy_slug,
      title,
      client_slug: this.clientSlug,
      tags,
    });
    // No fabrication — only proceed if the backend confirmed (wrote index.md + DB).
    if (!r?.domain) {
      this.saveStatus = this.lastError ?? 'create failed';
      return;
    }
    if (!this.strategies.some((s) => s.slug === r.domain.slug)) {
      this.strategies = [...this.strategies, r.domain];
    }
    this.saveStatus = r.corpus_path ? `created ${r.corpus_path}` : 'created';
    await this.select(r.domain.slug);
  }

  async select(slug: string): Promise<void> {
    this.activeSlug = slug;
    this.focusIdx = 0;
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_STRATEGY_KEY, slug);
    const r = await this.call<{ sources: Source[] }>('domain.assemble', { type: DOMAIN_TYPE, slug, client_slug: this.clientSlug });
    this.sources = r?.sources ?? [];
    const tv = await this.call<{ tags: string[] }>('tag.suggest', { prefix: '', client_slug: this.clientSlug });
    this.tagVocab = tv?.tags ?? [];
  }

  // --- sources ---
  async addSource(rawUrl: string): Promise<void> {
    let url = rawUrl.trim();
    if (!url || !this.activeSlug) return;
    if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    const r = await this.call<{ source: Source }>('source.add', { url, domain_type: DOMAIN_TYPE, domain_slug: this.activeSlug, client_slug: this.clientSlug });
    if (!r?.source) {
      this.saveStatus = this.lastError ?? 'add failed';
      return;
    }
    this.sources = [...this.sources, r.source];
    this.focusIdx = this.sources.length - 1;
    this.saveStatus = `added — ${this.sources.length} sources`;
  }

  async fetchSource(source: Source): Promise<void> {
    this.saveStatus = 'fetching…';
    const r = await this.call<{ source: Source }>('source.fetch', {
      source_uuid: source.source_uuid,
      domain_type: DOMAIN_TYPE,
      domain_slug: this.activeSlug,
      client_slug: this.clientSlug,
    });
    if (!r?.source) {
      this.saveStatus = this.lastError ?? 'fetch failed';
      return;
    }
    // merge so we keep fields the fetch result doesn't echo back (e.g. tags)
    this.replaceSource({ ...source, ...r.source });
    this.saveStatus = 'fetched';
  }

  // retry — re-fetch with a Jina cache bypass (for stale/interstitial results)
  async retrySource(source: Source): Promise<void> {
    if (!this.activeSlug) return;
    this.saveStatus = 'retrying…';
    const r = await this.call<{ source: Source }>('source.retry', {
      source_uuid: source.source_uuid,
      domain_type: DOMAIN_TYPE,
      domain_slug: this.activeSlug,
      client_slug: this.clientSlug,
    });
    if (!r?.source) {
      this.saveStatus = this.lastError ?? 'retry failed';
      return;
    }
    this.replaceSource({ ...source, ...r.source });
    this.saveStatus = 'retried';
  }

  // edit a bibliographic field (registry + file frontmatter). Filename is unchanged.
  async updateSource(field: 'title' | 'publisher' | 'published_date', value: string): Promise<void> {
    const f = this.focused;
    if (!f || !this.activeSlug) return;
    if (f[field] === value) return; // no-op (onchange fires even without a change)
    // Replace the element with a NEW object so the list + field re-render reliably
    // (mutating a nested $state property in place doesn't always invalidate).
    this.replaceSource({ ...f, [field]: value });
    await this.call('source.update', {
      source_uuid: f.source_uuid,
      domain_type: DOMAIN_TYPE,
      domain_slug: this.activeSlug,
      client_slug: this.clientSlug,
      fields: { [field]: value },
    });
    this.saveStatus = this.lastError ? `${field} update failed` : `✓ ${field} saved`;
  }

  // rename the on-disk file directly (sources/<slug>.md). The slug is the
  // filesystem identity; this moves the file + repoints the usage row.
  async renameSource(slug: string): Promise<void> {
    const f = this.focused;
    if (!f || !this.activeSlug) return;
    const next = slug.trim();
    if (!next || next === f.source_slug) return;
    const r = await this.call<{ source_slug?: string }>('source.update', {
      source_uuid: f.source_uuid,
      domain_type: DOMAIN_TYPE,
      domain_slug: this.activeSlug,
      client_slug: this.clientSlug,
      fields: { slug: next },
    });
    if (!r) {
      this.saveStatus = this.lastError ?? 'rename failed';
      return;
    }
    this.replaceSource({ ...f, source_slug: r.source_slug ?? next });
    this.saveStatus = `✓ renamed → ${r.source_slug ?? next}.md`;
  }

  // attach a locally-downloaded file (e.g. a report PDF the analyst pulled
  // themselves because the citation page isn't the PDF, or it's anti-bot). The
  // source identity (url) is unchanged; this hangs the bytes underneath it and
  // marks it fetched. Rides base64 over the WS → NATS (max_payload 48MB), then
  // content-ingest Ghostscript-compresses PDFs so the stored copy stays small.
  async attachFile(file: File): Promise<void> {
    const f = this.focused;
    if (!f || !this.activeSlug) return;
    if (!f.source_slug) {
      this.saveStatus = 'add/fetch the source first — attach needs a filename';
      return;
    }
    if (file.size > 32_000_000) {
      this.saveStatus = `${file.name} is ${(file.size / 1e6).toFixed(1)}MB — over the ~32MB upload limit`;
      return;
    }
    this.saveStatus = `attaching ${file.name} (${(file.size / 1e6).toFixed(1)}MB)…`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const r = await this.call<{ source: Source & { original_bytes?: number; bytes?: number; compressed?: boolean } }>('source.attach', {
      source_uuid: f.source_uuid,
      domain_type: DOMAIN_TYPE,
      domain_slug: this.activeSlug,
      client_slug: this.clientSlug,
      filename: file.name,
      content_type: file.type || undefined,
      content_base64: btoa(binary),
    });
    if (!r?.source) {
      this.saveStatus = this.lastError ?? 'attach failed';
      return;
    }
    this.replaceSource({ ...f, ...r.source });
    const mb = (n?: number) => (n ? `${(n / 1e6).toFixed(1)}MB` : '?');
    this.saveStatus = r.source.compressed
      ? `✓ attached ${file.name} — compressed ${mb(r.source.original_bytes)} → ${mb(r.source.bytes)}`
      : `✓ attached ${file.name} (${mb(r.source.bytes)})`;
  }

  async removeSource(source: Source): Promise<void> {
    if (!this.activeSlug) return;
    const r = await this.call<{ ok: boolean }>('source.remove', {
      source_uuid: source.source_uuid,
      domain_type: DOMAIN_TYPE,
      domain_slug: this.activeSlug,
      client_slug: this.clientSlug,
    });
    if (!r) {
      this.saveStatus = this.lastError ?? 'remove failed';
      return;
    }
    const idx = this.sources.findIndex((s) => s.source_uuid === source.source_uuid);
    if (idx >= 0) {
      this.sources.splice(idx, 1);
      if (this.focusIdx >= this.sources.length) this.focusIdx = Math.max(0, this.sources.length - 1);
    }
    this.saveStatus = 'removed';
  }

  async addExtract(kind: ExtractKind, text: string): Promise<void> {
    const f = this.focused;
    const body = text.trim();
    if (!f || !body) return;
    await this.call('extract.add', {
      source_uuid: f.source_uuid,
      domain_type: DOMAIN_TYPE,
      domain_slug: this.activeSlug,
      client_slug: this.clientSlug,
      kind,
      text: body,
    });
    this.saveStatus = this.lastError ? 'extract not saved' : `added ${kind.toLowerCase()} extract`;
  }

  // --- tags (Train-Case, workspace vocabulary, auto-complete) ---
  suggestTags(prefix: string): string[] {
    const p = prefix.trim().toLowerCase();
    if (!p) return this.tagVocab.slice(0, 12);
    return this.tagVocab.filter((t) => t.toLowerCase().includes(p)).slice(0, 12);
  }

  async applyTag(raw: string): Promise<void> {
    const f = this.focused;
    const tag = toDashed(raw);
    if (!f || !tag) return;
    await this.call('tag.apply', { source_uuid: f.source_uuid, domain_type: DOMAIN_TYPE, domain_slug: this.activeSlug, client_slug: this.clientSlug, tag, op: 'add' });
    f.tags = Array.from(new Set([...(f.tags ?? []), tag]));
    if (!this.tagVocab.includes(tag)) this.tagVocab = [...this.tagVocab, tag];
  }

  async removeTag(tag: string): Promise<void> {
    const f = this.focused;
    if (!f) return;
    await this.call('tag.apply', { source_uuid: f.source_uuid, domain_type: DOMAIN_TYPE, domain_slug: this.activeSlug, client_slug: this.clientSlug, tag, op: 'remove' });
    f.tags = (f.tags ?? []).filter((t) => t !== tag);
  }

  focus(index: number): void {
    this.focusIdx = index;
  }

  private replaceSource(s: Source): void {
    const i = this.sources.findIndex((x) => x.source_uuid === s.source_uuid);
    if (i >= 0) this.sources[i] = s;
  }
}

export const curation = new CurationState();
