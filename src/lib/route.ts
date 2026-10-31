// Screen addresses (brief navigation-urls): the part of the address after `#` names a screen, never a person or a record. Pure, so
// the table and the parser are unit-tested; src/components/useRoute.ts does the browser side (history, popstate).

export const PROGRESS_PAGES = ['goals', 'hist', 'freq', 'lifts', 'trends', 'body', 'muscles'] as const;

/** Every address the app knows, as a path with no `#/`. A tab is the first part. */
export const PATHS: readonly string[] = [
  'board',
  'daily', 'daily/grocery', 'daily/grocery/get', 'daily/grocery/home', 'daily/grocery/spend', 'daily/medical', 'daily/recipes',
  'daily/recipes/form', 'daily/recipes/library', 'daily/recipes/mine', 'daily/supplements',
  'plans',
  'program', 'program/exercises', 'program/stretches',
  'progress', ...PROGRESS_PAGES.map(p => `progress/${p}`),
  'settings',
];
const KNOWN = new Set(PATHS);

export interface Route { tab: string; path: string }

/** The screen a `location.hash` names. An unknown ending falls back to the nearest known screen above it (`#/progress/zzz` is Progress); nothing known is null. */
export function parseRoute(hash: string): Route | null {
  const raw = hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  if (!raw) return null;
  const parts = raw.split('/');
  while (parts.length) {
    const path = parts.join('/');
    if (KNOWN.has(path)) return { tab: parts[0], path };
    parts.pop();
  }
  return null;
}

/** The hash for a path. */
export const routeHash = (path: string): string => `#/${path}`;

/** The Daily section an address names (`daily/recipes/mine` is `recipes`) when it is one of the `keys` offered, else null. */
export function dailySection(path: string, keys: readonly string[]): string | null {
  const s = pageOf(path, 'daily')?.split('/')[0];
  return s && keys.includes(s) ? s : null;
}

/** Where to rewrite the address so it names the Daily section shown (`cur`), or null when it already does or is not a Daily address. */
export function dailyFix(path: string, cur: string): string | null {
  return path.startsWith('daily') && path.split('/')[1] !== cur ? `daily/${cur}` : null;
}

/** The part of `path` under `base` (`progress/trends` under `progress` is `trends`), or null when it is not under it or not a known screen. */
export function pageOf(path: string, base: string): string | null {
  return path.startsWith(`${base}/`) && KNOWN.has(path) ? path.slice(base.length + 1) : null;
}
