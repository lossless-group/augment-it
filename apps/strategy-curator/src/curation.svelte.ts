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

// Tags are Train-Case, no spaces: "workforce development" → "Workforce-Development".
export function toTrainCase(s: string): string {
  return s
    .trim()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
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
    const tags = input.tags.map(toTrainCase).filter(Boolean);
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
      strategy_slug: this.activeSlug,
    });
    if (r?.source) this.replaceSource(r.source);
    else if (!this.lastError) this.replaceSource({ ...source, status: 'fetched', content_pulled: true });
    this.saveStatus = this.lastError ? 'fetch failed' : 'fetched';
  }

  async addExtract(kind: ExtractKind, text: string): Promise<void> {
    const f = this.focused;
    const body = text.trim();
    if (!f || !body) return;
    await this.call('extract.add', {
      source_uuid: f.source_uuid,
      strategy_slug: this.activeSlug,
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
    const tag = toTrainCase(raw);
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
