import { useSyncExternalStore } from 'react';
import { parseRoute, routeHash } from '../lib/route.js';

// The browser side of screen addresses (brief navigation-urls; the table and parser are src/lib/route.ts). The address is the source of truth for
// which screen inside a tab is open: screens read it with useRoutePath() and change it with navigate() / goUp().
export const ROUTE_EVENT = 'ironlog-route';

const read = () => parseRoute(location.hash)?.path ?? '';
const subscribe = (fn: () => void) => {
  for (const e of ['popstate', 'hashchange', ROUTE_EVENT]) window.addEventListener(e, fn);
  return () => { for (const e of ['popstate', 'hashchange', ROUTE_EVENT]) window.removeEventListener(e, fn); };
};
const tell = () => window.dispatchEvent(new Event(ROUTE_EVENT));

/** The screen the address names now (`progress/trends`), or '' when it names none. */
export const useRoutePath = (): string => useSyncExternalStore(subscribe, read, () => '');

/** Moves to a screen. `push` adds a Back step (opening a page); `replace` swaps the current one (a segmented control, a tab). The same screen twice does nothing. */
export function navigate(path: string, how: 'push' | 'replace'): void {
  if (read() === path) return;
  if (how === 'push') history.pushState({ ...history.state, route: true }, '', routeHash(path));
  else history.replaceState(history.state, '', routeHash(path));
  tell();
}

/** One screen up. When the entry below is the screen we came from, that is Back; for a screen opened from an address (reload, pasted link) there is nothing below, so it swaps to the parent. */
export function goUp(parent: string): void {
  if (history.state?.route) history.back();
  else navigate(parent, 'replace');
}
