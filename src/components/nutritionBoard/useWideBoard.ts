import { useSyncExternalStore } from 'react';
import { daysShown, type DaysShown } from '../../lib/nutritionBoard.js';

const QUERIES = ['(min-width: 768px)', '(min-width: 1000px)', '(min-width: 1440px)'];
const subscribe = (cb: () => void) => { const ms = QUERIES.map(q => window.matchMedia(q)); ms.forEach(m => m.addEventListener('change', cb)); return () => ms.forEach(m => m.removeEventListener('change', cb)); };
const snapshot = (): DaysShown => daysShown(QUERIES.reduce((w, q, i) => (window.matchMedia(q).matches ? [768, 1000, 1440][i]! : w), 0));

/** How many day columns fit side by side: seven from 1440 px (at 1280 px a column was only 171 px and its labels wrapped), three from 1000, two from 768, else one day with the stepper (rule in `daysShown`, lib/nutritionBoard.ts). */
export const useDaysShown = (): DaysShown => useSyncExternalStore(subscribe, snapshot, () => 1);

const PHONE = '(max-width: 699px)';
const subPhone = (cb: () => void) => { const m = window.matchMedia(PHONE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };

/** True on a phone (699 px and under, the same break as the phone block in NutritionBoard.css): Targets and Manage are text links under the day stepper there, buttons beside the week switcher above it. */
export const usePhoneHeader = (): boolean => useSyncExternalStore(subPhone, () => window.matchMedia(PHONE).matches, () => false);
