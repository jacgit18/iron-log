/** The Daily section to show: the saved view when it is still offered, else Nutrition (key `supplements`, the one that opens first), else the first. */
export const pickView = (keys: readonly string[], view: string): string => (keys.includes(view) ? view : keys.includes('supplements') ? 'supplements' : keys[0] ?? '');
