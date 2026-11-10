import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 1440px)';
const subscribe = (cb: () => void) => { const m = window.matchMedia(QUERY); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };

/** Whether the screen is wide enough for seven days side by side (1440 px; at 1280 px a column was only 171 px and its labels wrapped); below it the board shows one day at a time with a stepper. */
export const useWideBoard = (): boolean => useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
