/* A list's chosen sort order, remembered per list on this device only (browser storage, never synced). Nothing here throws: a browser
   that blocks storage, or a stored value that is no longer an option, gives the default. */
export interface SortOption<K extends string = string> { key: K; label: string }

const PREFIX = 'ironlog:sort:';

/** The stored choice for `listKey` if it is one of `options`, else `fallback`. */
export function readSortChoice<K extends string>(listKey: string, options: readonly SortOption<K>[], fallback: K, storage?: Pick<Storage, 'getItem'>): K {
  try {
    const v = (storage ?? localStorage).getItem(PREFIX + listKey);
    return options.find(o => o.key === v)?.key ?? fallback;
  } catch { return fallback; }
}

/** Remember `key` for `listKey`; the default is stored as nothing, so changing a default later reaches everyone who never chose. */
export function writeSortChoice(listKey: string, key: string, fallback: string, storage?: Pick<Storage, 'setItem' | 'removeItem'>): void {
  try {
    const s = storage ?? localStorage;
    if (key === fallback) s.removeItem(PREFIX + listKey); else s.setItem(PREFIX + listKey, key);
  } catch { /* storage blocked: the choice lasts until the page is reloaded */ }
}
