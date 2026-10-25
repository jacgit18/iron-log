import { useSyncExternalStore } from 'react';

// A wide screen is anything above the 700px phone breakpoint. The Board draws its body weight in a different place on each (next to the mode
// menu on a wide screen, under the notices on a phone), and draws it once, so it asks the screen instead of hiding a copy with CSS.
const WIDE = '(min-width:701px)';
const subscribe = (notify: () => void) => { const m = window.matchMedia(WIDE); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify); };
const isWide = () => window.matchMedia(WIDE).matches;

export const useWide = (): boolean => useSyncExternalStore(subscribe, isWide, () => true);
