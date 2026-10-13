import { createElement, lazy, Suspense, type ComponentType } from 'react';

/** The error a tab that could not be downloaded throws. ErrorBoundary offers Reload for it, since Try again cannot work (see below). */
export class ChunkLoadError extends Error {
  name = 'ChunkLoadError';
}

// A tab loaded on first use (backlog: mobile item 9). If the download fails (offline on a first visit, a stale chunk after a
// deploy) the error reaches the tab's ErrorBoundary instead of a white screen. Chromium remembers a failed import() for the life of
// the page, so drawing the tab again cannot succeed: the boundary offers a reload, which also picks up the service worker's copy.
export function lazyTab(load: () => Promise<{ default: ComponentType }>): ComponentType {
  const Inner = lazy(() => load().catch((e: unknown) => { throw new ChunkLoadError(`This screen could not be loaded: ${e instanceof Error ? e.message : String(e)}`); }));
  // The fallback is a fixed-height block, so the page below the tabs does not jump when the tab arrives.
  const fallback = createElement('div', { className: 'view-loading', role: 'status' }, 'Loading…');
  return function LazyTab() { return createElement(Suspense, { fallback }, createElement(Inner)); };
}
