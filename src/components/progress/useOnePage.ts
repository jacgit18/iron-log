import { useSyncExternalStore } from 'react';
import { ONE_PAGE_MIN } from '../../lib/progressPage.js';

// From 1280px Progress is one page. The page asks the screen instead of hiding a copy with CSS, so the hub's tiles and the sections are never both drawn.
const WIDE = `(min-width:${ONE_PAGE_MIN}px)`;
const subscribe = (notify: () => void) => { const m = window.matchMedia(WIDE); m.addEventListener('change', notify); return () => m.removeEventListener('change', notify); };
const isWide = () => window.matchMedia(WIDE).matches;

export const useOnePage = (): boolean => useSyncExternalStore(subscribe, isWide, () => false);
