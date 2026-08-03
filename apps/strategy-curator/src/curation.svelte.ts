// Strategy-curator state — a Svelte 5 runes singleton, per
// [[Per-App-Workspace-Conventions]]. Single source of truth; components read
// derived getters and call actions. Every mutation goes through a workspace
// capability (strategy.* / source.* / extract.* / tag.*) — no direct storage
// access. Capability calls degrade gracefully so the surface renders standalone
// before the resolver / content-ingest handlers are wired (Increment 2).
//
// $state is assigned in the constructor (not as a class-field initializer) to
// match the workspace package's placement-invariant note about field lowering.

import { workspace, WORKSPACE_CHANGED_EVENT, type WorkspaceSummary } from '@augment-it/workspace';
import type { ExtractKind, Source, Strategy } from './types';

const TOKEN_KEY = 'augment-it:session-token';
// No `shared` block in federation (shell/rsbuild.config.ts) — this remote
// owns its own workspace singleton and connects independently even when
// mounted inside the shell, so it needs the same env-configured WS_URL the
// shell and chat each read (rsbuild inlines PUBLIC_-prefixed vars into
// import.meta.env at build time — applies to plain .ts modules too, not
// just .svelte files).
const WS_URL =
  ((import.meta as { env?: Record<string, string> }).env?.PUBLIC_WS_URL as string | undefined) ||
  'ws://localhost:3001/ws';
const ACTIVE_STRATEGY_KEY = 'augment-it:active-strategy';
// The operator-chosen domain type this surface is currently browsing/
// writing into ('strategy', 'thesis', or any other value they type at
// create time — the domain catalog itself is type-agnostic; see
// domains.ts's comment: type ∈ strategy | topic | thesis | market-segment |
// category | …). Defaults per-workspace (WorkspaceSummary.default_domain_type,
// from that client's DEFAULT_DOMAIN_TYPE .env — humain-vc: 'thesis', reach-edu:
// 'strategy'), NOT persisted globally — a global localStorage override was
// exactly the bug that made humain-vc keep showing 'strategy'.
const DEFAULT_DOMAIN_TYPE = 'strategy';

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

// Split a raw tag entry into one-or-more dashed tags. Commas and newlines are
// tag SEPARATORS; spaces within a segment stay word-joiners (handled by
// toDashed). "Quantum Computing, Computational Biology" →
// ["Quantum-Computing", "Computational-Biology"]. A single token (e.g. a
// suggestion click) returns a one-element array unchanged.
export function splitTags(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map(toDashed)
    .filter(Boolean);
}

type ConnStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error' | 'auth_required';

class CurationState {
  connection: ConnStatus;
  lastError: string | null;
  clientSlug: string | null; // active workspace/client — threaded into every capability call
  domainType: string; // active domain type — threaded into every domain.* / source.* call

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
    this.domainType = $state<string>(DEFAULT_DOMAIN_TYPE); // resolved per-workspace once bootstrap/applyWorkspaceChange runs
    this.strategies = $state<Strategy[]>([]);
    this.activeSlug = $state<string | null>(null);
    this.sources = $state<Source[]>([]);
    this.focusIdx = $state<number>(0);
    this.listFilter = $state<string>('');
    this.tagVocab = $state<string[]>([]);
    this.saveStatus = $state<string>('');

    // Each federation remote loads its OWN workspace singleton (no `shared`
    // block in the shell's rsbuild config), so `workspace.active_client_id`
    // updating elsewhere (e.g. the shell's WorkspaceSwitcher) does NOT, on
    // its own, update this class's local `clientSlug` mirror — every
    // capability call above threads `this.clientSlug`, not the package's
    // active_client_id, so without this listener the curator silently kept
    // scoping to a stale (or never-set) workspace while the header showed
    // the real one. Listen for the same cross-remote broadcast the package
    // dispatches on every switch, from anywhere.
    if (typeof window !== 'undefined') {
      window.addEventListener(WORKSPACE_CHANGED_EVENT, (ev: Event) => {
        const detail = (ev as CustomEvent).detail as { client_id?: string } | undefined;
        const next = detail?.client_id ?? null;
        if (next && next !== this.clientSlug) void this.applyWorkspaceChange(next);
      });
    }
  }

  // Single place "the workspace changed" is handled, whether the switch
  // originated here (switchWorkspace) or anywhere else in the shell
  // (the WORKSPACE_CHANGED_EVENT listener above).
  private async applyWorkspaceChange(client_id: string): Promise<void> {
    this.clientSlug = client_id;
    this.activeSlug = null;
    this.sources = [];
    // Reset to THIS workspace's default type on every switch — without
    // this, switching e.g. humain-vc('thesis') → reach-edu would silently
    // query domain.list with type: 'thesis' against a workspace that only
    // has 'strategy' domains, rendering an empty "no corpora yet" that's
    // indistinguishable from actually having none.
    this.setDomainType(this.defaultDomainTypeFor(client_id));
    this.saveStatus = `workspace → ${client_id}`;
    await this.loadStrategies();
  }

  // WorkspaceSummary.default_domain_type comes from that client's
  // DEFAULT_DOMAIN_TYPE .env (services/workspace/src/workspaces.ts);
  // `workspace.workspaces` may not have loaded yet on the very first call
  // (bootstrap fires this before loadWorkspaces resolves its own promise's
  // continuation) — falls back to the flat default in that case only.
  private defaultDomainTypeFor(client_id: string): string {
    return workspace.workspaces.find((w) => w.client_id === client_id)?.default_domain_type ?? DEFAULT_DOMAIN_TYPE;
  }

  private setDomainType(type: string): void {
    this.domainType = type;
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
    if (this.clientSlug) this.setDomainType(this.defaultDomainTypeFor(this.clientSlug));
    await this.loadStrategies();
  }

  get workspaces(): WorkspaceSummary[] {
    return workspace.workspaces;
  }

  // Switch the client/workspace strategies are written into. The active workspace
  // is the (client) corpus everything lands in — make it explicit, never implicit.
  // Delegates the actual state reset + reload to applyWorkspaceChange, the
  // same path the cross-remote WORKSPACE_CHANGED_EVENT listener uses — one
  // place this logic lives, regardless of where the switch originated.
  async switchWorkspace(client_id: string): Promise<void> {
    if (!client_id || client_id === this.clientSlug) return;
    await workspace.activateWorkspace(client_id);
  }

  async loadStrategies(): Promise<void> {
    const r = await this.call<{ domains: Strategy[] }>('domain.list', { type: this.domainType, client_slug: this.clientSlug });
    this.strategies = r?.domains ?? [];
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_STRATEGY_KEY) : null;
    if (saved && this.strategies.some((s) => s.slug === saved)) void this.select(saved);
  }

  // `type` is operator-chosen at create time (see StrategyPicker's Type
  // field) — defaults to the currently-active type if omitted. Creating a
  // domain of a NEW type switches the active type and does a full reload
  // (the in-memory list is scoped to one type at a time; appending a
  // different-type domain into it would silently mix types in the view).
  async createStrategy(input: { title: string; slug: string; tags: string[]; type?: string }): Promise<void> {
    const title = input.title.trim();
    const strategy_slug = slugify(input.slug || title);
    const type = (input.type ?? this.domainType).trim() || DEFAULT_DOMAIN_TYPE;
    if (!title || !strategy_slug) return;
    const tags = input.tags.map(toDashed).filter(Boolean);
    const r = await this.call<{ domain: Strategy; corpus_path?: string }>('domain.create', {
      type,
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
    if (type !== this.domainType) {
      this.setDomainType(type);
      await this.loadStrategies(); // fresh, scoped to the new type — includes the domain just created
    } else if (!this.strategies.some((s) => s.slug === r.domain.slug)) {
      this.strategies = [...this.strategies, r.domain];
    }
    this.saveStatus = r.corpus_path ? `created ${r.corpus_path}` : 'created';
    await this.select(r.domain.slug);
  }

  async select(slug: string): Promise<void> {
    this.activeSlug = slug;
    this.focusIdx = 0;
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_STRATEGY_KEY, slug);
    const r = await this.call<{ sources: Source[] }>('domain.assemble', { type: this.domainType, slug, client_slug: this.clientSlug });
    this.sources = (r?.sources ?? []).map(withSlug);
    const tv = await this.call<{ tags: string[] }>('tag.suggest', { prefix: '', client_slug: this.clientSlug });
    this.tagVocab = tv?.tags ?? [];
  }

  // --- sources ---
  async addSource(rawUrl: string): Promise<void> {
    let url = rawUrl.trim();
    if (!url || !this.activeSlug) return;
    if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    const r = await this.call<{ source: Source }>('source.add', { url, domain_type: this.domainType, domain_slug: this.activeSlug, client_slug: this.clientSlug });
    if (!r?.source) {
      this.saveStatus = this.lastError ?? 'add failed';
      return;
    }
    this.sources = [...this.sources, withSlug(r.source)];
    this.focusIdx = this.sources.length - 1;
    this.saveStatus = `added — ${this.sources.length} sources`;
  }

  async fetchSource(source: Source): Promise<void> {
    this.saveStatus = 'fetching…';
    const r = await this.call<{ source: Source }>('source.fetch', {
      source_uuid: source.source_uuid,
      domain_type: this.domainType,
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
      domain_type: this.domainType,
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
  // authors is an array (one author → one-element array); the form edits it as a
  // comma-separated string. Splits, trims, writes to registry + file frontmatter.
  async updateAuthors(value: string): Promise<void> {
    const f = this.focused;
    if (!f || !this.activeSlug) return;
    const authors = value.split(',').map((s) => s.trim()).filter(Boolean);
    if ((f.authors ?? []).join('|') === authors.join('|')) return; // no-op
    this.replaceSource({ ...f, authors });
    await this.call('source.update', {
      source_uuid: f.source_uuid,
      domain_type: this.domainType,
      domain_slug: this.activeSlug,
      client_slug: this.clientSlug,
      fields: {},
      authors,
    });
    this.saveStatus = this.lastError ? 'authors update failed' : '✓ authors saved';
  }

  async updateSource(field: 'title' | 'publisher' | 'published_date', value: string): Promise<void> {
    const f = this.focused;
    if (!f || !this.activeSlug) return;
    if (f[field] === value) return; // no-op (onchange fires even without a change)
    // Replace the element with a NEW object so the list + field re-render reliably
    // (mutating a nested $state property in place doesn't always invalidate).
    this.replaceSource({ ...f, [field]: value });
    await this.call('source.update', {
      source_uuid: f.source_uuid,
      domain_type: this.domainType,
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
      domain_type: this.domainType,
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
      domain_type: this.domainType,
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
      domain_type: this.domainType,
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
      domain_type: this.domainType,
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
    if (!f) return;
    // Commas split into multiple tags; add each new one, deduped, in order.
    for (const tag of splitTags(raw)) {
      if ((f.tags ?? []).includes(tag)) continue;
      await this.call('tag.apply', { source_uuid: f.source_uuid, domain_type: this.domainType, domain_slug: this.activeSlug, client_slug: this.clientSlug, tag, op: 'add' });
      f.tags = Array.from(new Set([...(f.tags ?? []), tag]));
      if (!this.tagVocab.includes(tag)) this.tagVocab = [...this.tagVocab, tag];
    }
  }

  async removeTag(tag: string): Promise<void> {
    const f = this.focused;
    if (!f) return;
    await this.call('tag.apply', { source_uuid: f.source_uuid, domain_type: this.domainType, domain_slug: this.activeSlug, client_slug: this.clientSlug, tag, op: 'remove' });
    f.tags = (f.tags ?? []).filter((t) => t !== tag);
  }

  focus(index: number): void {
    this.focusIdx = index;
  }

  private replaceSource(s: Source): void {
    const i = this.sources.findIndex((x) => x.source_uuid === s.source_uuid);
    if (i >= 0) this.sources[i] = withSlug(s);
  }

  // Re-fetch the active domain's sources without resetting focus/tags —
  // the curator-liveness path (App.svelte's workspace.events effect, Step
  // 6) calls this when a REMOTE session's mutation lands, as opposed to
  // select() which is the user-driven "switch domain" path and resets
  // focus deliberately.
  async refreshSources(): Promise<void> {
    if (!this.activeSlug) return;
    const r = await this.call<{ sources: Source[] }>('domain.assemble', { type: this.domainType, slug: this.activeSlug, client_slug: this.clientSlug });
    if (!r) return;
    const nextSources = (r.sources ?? []).map(withSlug);
    this.sources = nextSources;
    if (this.focusIdx >= nextSources.length) this.focusIdx = Math.max(0, nextSources.length - 1);
  }
}

// Belt-and-suspenders: if a source arrives without source_slug but with a
// corpus_path, derive the on-disk filename from the path so the Filename field
// (and rename) always connect to a file that exists.
function withSlug(s: Source): Source {
  if (s.source_slug || !s.corpus_path) return s;
  const base = s.corpus_path.split('/').pop() ?? '';
  const slug = base.replace(/\.md$/, '');
  return slug ? { ...s, source_slug: slug } : s;
}

export const curation = new CurationState();
