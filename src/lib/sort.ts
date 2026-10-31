// The one name order for every list (ADR: list ordering rule): case and accents ignored, digits as numbers ("Item 2" before "Item 10"),
// and equal names ordered by id so a tie never swaps places between renders. A list that needs another order says why with `// sort-ok: why`.
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Two names in list order. Use `nameCmp` when the items have ids. */
export const byName = (a: string, b: string): number => collator.compare(a, b);

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A comparator for `.sort()`: by name, then by id. */
export const nameCmp = <T>(nameOf: (x: T) => string, idOf: (x: T) => string) =>
  (a: T, b: T): number => byName(nameOf(a), nameOf(b)) || byId(idOf(a), idOf(b));

/** A sorted copy of the list (the input is not changed). */
export const sortByName = <T>(list: readonly T[], nameOf: (x: T) => string, idOf: (x: T) => string): T[] =>
  [...list].sort(nameCmp(nameOf, idOf));
