import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches now, and again when it changes (a phone turned sideways, a window resized). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    notify => { const m = window.matchMedia(query); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
