// Deep links.
//
//   #/gallery                                     the index
//   #/gallery/source-row                          an entry, first fixture
//   #/gallery/source-row/error                    an entry, one fixture
//   #/gallery/source-row/error?iso=1              JUST that fixture, no chrome
//   #/gallery/source-row/error?iso=1&mode=light   …in one named mode
//   #/gallery/source-row/error?modes=all          …in all three, side by side
//   #/gallery/source-row/error?surface=--color-surface-raised&w=420
//
// `iso=1` is the link that answers "show me the isolated element at its own
// address": it renders one specimen and nothing else, so the URL can be opened
// on the member's own origin (localhost:3017, or the LAN IP), screenshotted,
// iframed, or handed to someone who does not have the shell running.
//
// Hash routing is OPT-IN, not automatic. Standalone the hash is the member's to
// spend; federated into the shell it is the SHELL's, and a remote that wrote to
// it would be reaching outside its own boundary. So the federated gallery keeps
// its route in component state, and its "open isolated" links point at
// catalog.origin — a new tab on the member's own address, where the hash is
// once again free.

export type ModeView = 'current' | 'all' | 'light' | 'dark' | 'vibrant';

export type Route = {
  entry: string | null;
  fixture: string | null;
  iso: boolean;
  modes: ModeView;
  surface: string;
  width: number | null;
};

export const GALLERY_PREFIX = '/gallery';
export const DEFAULT_SURFACE = '--color-background';

export const DEFAULT_ROUTE: Route = {
  entry: null,
  fixture: null,
  iso: false,
  modes: 'current',
  surface: DEFAULT_SURFACE,
  width: null,
};

/** True when the current document hash is asking for the gallery. */
export function isGalleryHash(hash: string = location.hash): boolean {
  return hash.replace(/^#/, '').split('?')[0].startsWith(GALLERY_PREFIX);
}

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean); // ['gallery', entry?, fixture?]

  const modes = params.get('modes') ?? params.get('mode') ?? 'current';
  const w = Number(params.get('w'));

  return {
    entry: parts[1] ?? null,
    fixture: parts[2] ?? null,
    iso: params.get('iso') === '1',
    modes: (['current', 'all', 'light', 'dark', 'vibrant'] as const).includes(modes as ModeView)
      ? (modes as ModeView)
      : 'current',
    surface: params.get('surface') ?? DEFAULT_SURFACE,
    width: Number.isFinite(w) && w > 0 ? w : null,
  };
}

export function serializeRoute(route: Route): string {
  const path = [GALLERY_PREFIX, route.entry, route.fixture].filter(Boolean).join('/');
  const params = new URLSearchParams();
  if (route.iso) params.set('iso', '1');
  if (route.modes !== 'current') params.set('modes', route.modes);
  if (route.surface !== DEFAULT_SURFACE) params.set('surface', route.surface);
  if (route.width) params.set('w', String(route.width));
  const q = params.toString();
  return `#${path}${q ? `?${q}` : ''}`;
}

/** An absolute URL to one specimen on the member's OWN origin. */
export function isolatedUrl(origin: string, route: Route): string {
  return `${origin.replace(/\/$/, '')}/${serializeRoute({ ...route, iso: true })}`;
}

export function readRoute(): Route {
  return isGalleryHash() ? parseRoute(location.hash) : { ...DEFAULT_ROUTE };
}

export function writeRoute(route: Route, replace = false): void {
  const next = serializeRoute(route);
  if (location.hash === next) return;
  if (replace) history.replaceState(null, '', next);
  else location.hash = next;
}

export function onHashChange(fn: () => void): () => void {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}
