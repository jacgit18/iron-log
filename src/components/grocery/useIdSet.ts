import { useState } from 'react';

// A set of ids (open rows, stores being adjusted) with one setter for any number of ids at once, and a way to empty it.
export default function useIdSet() {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const set = (list: string[], on: boolean) => setIds(prev => { const n = new Set(prev); list.forEach(id => (on ? n.add(id) : n.delete(id))); return n; });
  return [ids, set, () => setIds(new Set())] as const;
}
