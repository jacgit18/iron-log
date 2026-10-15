/* The search over an Experiments list: it appears once the list is long enough to need it, and matches the name or the note. */
export const FILTER_AT = 6; // entries; at or below this the list is short enough to see whole

export const hasFilter = (count: number) => count > FILTER_AT;

export function matchesQuery(q: string, ...texts: (string | undefined)[]) {
  const needle = q.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!needle) return true;
  return texts.some(t => (t || '').toLowerCase().replace(/\s+/g, ' ').includes(needle));
}
