import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 1280px)';
const subscribe = (cb: () => void) => { const m = window.matchMedia(QUERY); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };

/** Whether the screen is wide enough for seven days side by side (1280 px); below it the board shows one day at a time with a stepper. */
export const useWideBoard = (): boolean => useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
