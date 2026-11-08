import { useCallback, useSyncExternalStore } from 'react';

// Whether the screen is at least `px` wide, asked of the browser so one thing is drawn (the phone's total bar or the desktop's summary and rail) instead of two copies hidden by CSS.
// Own copy, as the Board's and the Program editor's `useWide`, so Groceries imports nothing from another feature. `subscribe` is rebuilt only when `px` changes, so the store is not
// unsubscribed and subscribed again on every render.
export default function useMinWidth(px: number): boolean {
  const query = `(min-width:${px}px)`;
  const subscribe = useCallback((notify: () => void) => { const m = window.matchMedia(query); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify); }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
}
