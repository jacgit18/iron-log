// Collapsible stores in Inventory's Edit mode (brief groceries-inventory-edit-list). Pure; the page keeps the state.

/** Whether a store's rows are hidden: it was folded, and no search is running (a search always shows its matches). */
export const isCollapsed = (folded: ReadonlySet<string>, store: string, q: string): boolean => folded.has(store) && !q.trim();

/** The folded stores after tapping one store's header. */
export function toggleFolded(folded: ReadonlySet<string>, store: string): Set<string> {
  const next = new Set(folded);
  if (!next.delete(store)) next.add(store);
  return next;
}

/** Folded stores that gained an item since `before` (an added item must show), dropped from the set; `counts` maps store to item count. */
export function unfoldGrown(folded: ReadonlySet<string>, before: ReadonlyMap<string, number>, counts: ReadonlyMap<string, number>): Set<string> {
  const next = new Set(folded);
  for (const store of folded) if ((counts.get(store) ?? 0) > (before.get(store) ?? 0)) next.delete(store);
  return next;
}
