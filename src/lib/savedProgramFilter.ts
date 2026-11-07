import type { LibraryItem } from '../types.ts';

// The search box on the Saved tab (brief program-tab-desktop-layout): saved programs whose name contains every word typed, in any case and any order. Pure.
export function filterSavedPrograms<T extends Pick<LibraryItem, 'name'>>(items: readonly T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...items];
  return items.filter(it => { const n = it.name.toLowerCase(); return words.every(w => n.includes(w)); });
}
