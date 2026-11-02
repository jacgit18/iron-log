/** Whether two JSON-like values are equal key by key (objects and arrays compared deep, in any key order). Shared by the lists' "is this already clean" checks (recipes, diet entries). */
export const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => k in b && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};
