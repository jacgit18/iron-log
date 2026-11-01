import { useCallback, useState } from 'react';
import { readSortChoice, writeSortChoice, type SortOption } from '../lib/sortChoice.js';

/** A list's sort choice, remembered on this device (`listKey` names the list). Returns the key and a setter that also remembers it. */
export function useSortChoice<K extends string>(listKey: string, options: readonly SortOption<K>[], fallback: K): [K, (key: K) => void] {
  const [key, setKey] = useState<K>(() => readSortChoice(listKey, options, fallback));
  const choose = useCallback((next: K) => { setKey(next); writeSortChoice(listKey, next, fallback); }, [listKey, fallback]);
  return [key, choose];
}
