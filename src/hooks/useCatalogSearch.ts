/* The catalog part of an item picker (ADR 036). Exercises and stretches: the whole list once per session (catalogCache), filtered by
   pickerOptions on the device. Supplements: about 120,000 products, so the server searches (ADR 029): at least two letters, a short wait
   after the last key, and only the newest answer is used. Off when not syncing: local mode has no catalog (ADR 025). */
import { useEffect, useRef, useState } from 'react';
import type { CatalogKind } from '../types.ts';
import type { CatalogState } from '../lib/picker.ts';
import { useAppStore } from '../store/useAppStore.js';
import { searchCatalog } from '../sync/catalog.js';
import { loadCatalog } from '../sync/catalogCache.js';
import { signIn as devHeaders } from '../sync/devUser.js';

const WAIT_MS = 300;
export const MIN_LETTERS = 2;

/** `active`: the picker is open; nothing is fetched for a picker nobody is using. `retry` asks again after a failure. */
export function useCatalogSearch(kind: CatalogKind, q: string, active: boolean): { state: CatalogState; retry: () => void } {
  const syncing = useAppStore(s => s.sync !== null);
  const [tries, setTries] = useState(0);
  const words = q.trim();
  const server = kind === 'supplement';
  // Each answer is kept with the request it answers; until the current one has an answer, it is loading.
  const key = server ? `${tries}:${words}` : String(tries);
  const [got, setGot] = useState<{ key: string; state: CatalogState } | null>(null);
  const asked = useRef(0); // the newest request; an older answer arriving late is dropped

  useEffect(() => {
    if (!syncing || !active || server) return;
    const n = ++asked.current;
    void loadCatalog(kind, devHeaders).then(r => {
      if (n !== asked.current) return;
      setGot({ key, state: r.ok ? { status: 'ready', items: r.items } : { status: 'failed', reason: r.reason } });
    });
  }, [syncing, active, server, kind, key]);

  useEffect(() => {
    if (!syncing || !active || !server) return;
    const n = ++asked.current;
    if (words.length < MIN_LETTERS) return;
    const t = setTimeout(() => {
      void searchCatalog(words, 0, devHeaders).then(r => {
        if (n !== asked.current) return;
        setGot({ key, state: r.ok ? { status: 'ready', items: r.items, more: r.more } : { status: 'failed', reason: r.reason } });
      });
    }, WAIT_MS);
    return () => clearTimeout(t);
  }, [syncing, active, server, words, key]);

  const retry = () => setTries(t => t + 1);
  if (!syncing) return { state: { status: 'off' }, retry };
  if (server && words.length < MIN_LETTERS) return { state: { status: 'short' }, retry };
  return { state: got?.key === key ? got.state : { status: 'loading' }, retry };
}
