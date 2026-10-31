// Screen addresses (brief navigation-urls): the part of the address after `#` names a screen, never a person or a record. Pure, so
// the table and the parser are unit-tested; src/components/useRoute.ts does the browser side (history, popstate).

export const PROGRESS_PAGES = ['goals', 'hist', 'freq', 'lifts', 'trends'] as const;

/** Every address the app knows, as a path with no `#/`. A tab is the first part. */
export const PATHS: readonly string[] = [
  'board', 'board/stretches', 'board/workout',
  'daily', 'daily/grocery', 'daily/grocery/get', 'daily/grocery/home', 'daily/grocery/spend', 'daily/medical', 'daily/recipes',
  'daily/recipes/form', 'daily/recipes/library', 'daily/nutrition', 'daily/recipes/mine',
  'plans',
  'program', 'program/a', 'program/b', 'program/exercises', 'program/stretches',
  'progress', ...PROGRESS_PAGES.map(p => `progress/${p}`),
  'settings',
];
const KNOWN = new Set(PATHS);

export interface Route { tab: string; path: string }

/** An address that was renamed: the old one still opens the same screen. */
const RENAMED: Readonly<Record<string, string>> = { 'daily/supplements': 'daily/nutrition' };
/** The Daily sections whose address is not their key: the Nutrition section's key is still `supplements` (saved views and button ids use it). */
const DAILY_ADDRESS: Readonly<Record<string, string>> = { supplements: 'nutrition' };
const dailyAddress = (key: string): string => DAILY_ADDRESS[key] ?? key;

/** The screen a `location.hash` names. An unknown ending falls back to the nearest known screen above it (`#/progress/zzz` is Progress); nothing known is null. */
export function parseRoute(hash: string): Route | null {
  const raw = hash.replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '').toLowerCase();
  if (!raw) return null;
  const parts = (RENAMED[raw] ?? raw).split('/');
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
  const key = s && (Object.entries(DAILY_ADDRESS).find(([, a]) => a === s)?.[0] ?? s);
  return key && keys.includes(key) ? key : null;
}

/** Where to rewrite the address so it names the Daily section shown (`cur`), or null when it already does or is not a Daily address. */
export function dailyFix(path: string, cur: string): string | null {
  return path.startsWith('daily') && path.split('/')[1] !== dailyAddress(cur) ? `daily/${dailyAddress(cur)}` : null;
}

/** The part of `path` under `base` (`progress/trends` under `progress` is `trends`), or null when it is not under it or not a known screen. */
export function pageOf(path: string, base: string): string | null {
  return path.startsWith(`${base}/`) && KNOWN.has(path) ? path.slice(base.length + 1) : null;
}

export const BOARD_VIEWS = ['workout', 'stretches'] as const;

/** The Board section an address names (`board/stretches`), or null for plain `board` or another screen. */
export const boardView = (path: string): (typeof BOARD_VIEWS)[number] | null => BOARD_VIEWS.find(v => path === `board/${v}`) ?? null;

/** Where to rewrite the address so it names the Board section shown (`cur`), or null when it already does or is not a Board address. */
export const boardFix = (path: string, cur: string): string | null => (path === 'board' ? `board/${cur}` : null);

/** The program an address names (`program/b` is `B`), or null for any other screen. */
export const programKey = (path: string): 'A' | 'B' | null => (path === 'program/a' ? 'A' : path === 'program/b' ? 'B' : null);

/** The address of a program in the rotation (`A` is `program/a`); null for a library program (its id is not put in an address). */
export const programPath = (key: string): string | null => (key === 'A' || key === 'B' ? `program/${key.toLowerCase()}` : null);
