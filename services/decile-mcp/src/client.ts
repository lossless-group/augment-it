// Typed client for the Decile Hub API v1.
//
// Connection contract (see the decile-hub-connector skill + the on-disk
// swagger.yaml for the authoritative source):
//   - Base URL is the PER-TENANT subdomain, e.g. https://humain.decilehub.com,
//     read from DECILE_API_URL. All routes live under /api/v1/.
//   - Auth is the RAW API token in the Authorization header (NO "Bearer"),
//     read from DECILE_HUB_API_KEY.
//   - There are THREE pagination patterns; this client exposes a helper per
//     pattern rather than pretending the API is uniform.
//   - Errors come back either wrapped ({ error: { code, message, ... } }) or,
//     on a few endpoints, bare ({ error: "string" }). normalizeError handles both.

export class DecileError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string | null,
    public validValues?: string[] | null,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'DecileError';
  }
}

export interface DecileClientOptions {
  /** e.g. https://humain.decilehub.com — DECILE_API_URL */
  baseUrl: string;
  /** raw API token from /settings/api — DECILE_HUB_API_KEY */
  token: string;
  /** override fetch (tests); defaults to global fetch */
  fetchImpl?: typeof fetch;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export class DecileClient {
  private readonly base: string;
  private readonly token: string;
  private readonly f: typeof fetch;

  constructor(opts: DecileClientOptions) {
    if (!opts.baseUrl) throw new Error('DECILE_API_URL is required (e.g. https://humain.decilehub.com)');
    if (!opts.token) throw new Error('DECILE_HUB_API_KEY is required (raw API token from /settings/api)');
    // strip any trailing slash so we can join cleanly
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token;
    this.f = opts.fetchImpl ?? fetch;
  }

  /** Low-level request. `path` is the part AFTER /api/v1/, e.g. "people" or "people/42". */
  async request<T = unknown>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown } = {},
  ): Promise<T> {
    const url = new URL(`${this.base}/api/v1/${path.replace(/^\/+/, '')}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      Authorization: this.token, // RAW token — no "Bearer"
      Accept: 'application/json',
    };
    const init: RequestInit = { method, headers };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    const res = await this.f(url.toString(), init);
    const text = await res.text();
    const json = text ? safeJson(text) : undefined;

    if (!res.ok) throw normalizeError(res.status, json, text);
    return json as T;
  }

  get<T = unknown>(path: string, query?: Query) {
    return this.request<T>('GET', path, { query });
  }
  post<T = unknown>(path: string, body?: unknown, query?: Query) {
    return this.request<T>('POST', path, { body, query });
  }
  patch<T = unknown>(path: string, body?: unknown, query?: Query) {
    return this.request<T>('PATCH', path, { body, query });
  }

  // ── Pagination helpers — one per pattern (see endpoint-inventory.md) ──

  /** Pattern A: offset, 0-indexed; envelope { data, pagination: { total_count, current_page, total_pages } }. */
  listA<T = unknown>(path: string, query: Query = {}) {
    return this.get<{ data: T[]; pagination: { total_count: number; current_page: number; total_pages: number } }>(
      path,
      query,
    );
  }

  /** Pattern B: offset, 1-indexed; envelope { <key>: [...], page, per_page, total }. Pass the resource key. */
  async listB<T = unknown>(path: string, key: string, query: Query = {}) {
    const r = await this.get<Record<string, unknown>>(path, query);
    return {
      items: (r[key] ?? []) as T[],
      page: r.page as number,
      per_page: r.per_page as number,
      total: r.total as number,
    };
  }

  /** Pattern C: keyset/cursor; envelope { data, pagination: { next_page_token, has_more } }. */
  listC<T = unknown>(path: string, query: Query = {}) {
    return this.get<{ data: T[]; pagination: { next_page_token: string | null; has_more: boolean } }>(path, query);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

/** Handles BOTH the wrapped ErrorResponse and the bare { error: "string" } shape. */
function normalizeError(status: number, json: any, raw: string): DecileError {
  const e = json?.error;
  if (e && typeof e === 'object') {
    return new DecileError(status, e.code ?? 'error', e.message ?? raw, e.field ?? null, e.valid_values ?? null, e.details);
  }
  if (typeof e === 'string') return new DecileError(status, 'error', e);
  return new DecileError(status, 'error', raw || `HTTP ${status}`);
}
