import { useSyncExternalStore } from 'react';
import { onBoard } from './nutritionBoard.js';

/* ---------- The day the Nutrition board has picked, kept for this visit (brief nutrition-items-row-sheet-and-more) ----------
   A tiny in-memory store: leaving Nutrition for Recipes and coming back shows the same day; a reload shows today. It is not in the app store (nothing to sync or save) and not in the address (a viewed date is not a screen name, screen-addresses.md). */

let kept: string | null = null;
const listeners = new Set<() => void>();

export const getPickedDay = (): string | null => kept;
export function setPickedDay(day: string | null): void {
  if (day === kept) return;
  kept = day;
  listeners.forEach(f => f());
}
export function subscribePickedDay(f: () => void): () => void {
  listeners.add(f);
  return () => { listeners.delete(f); };
}
export const usePickedDay = (): string | null => useSyncExternalStore(subscribePickedDay, getPickedDay, getPickedDay);

/** The day to show: the kept one while it is still on the board, else today. */
export const dayToShow = (picked: string | null, today: string): string => (picked && onBoard(today, picked) ? picked : today);
