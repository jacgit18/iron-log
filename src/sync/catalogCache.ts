/* The exercise and stretch catalogs for the item picker (ADR 036): each fetched once per app session, the first time a picker needs it,
   and searched on the device. Only a good answer is kept, so after offline or a server error the next picker asks again. Kept in memory
   only: nothing is stored for offline (ADR 025). */
import type { CatalogKind } from '../types.ts';
import { fetchCatalog, type CatalogResult } from './catalog.js';

type ListKind = Exclude<CatalogKind, 'supplement'>;
const kept = new Map<ListKind, Promise<CatalogResult>>();

export function loadCatalog(kind: ListKind, headers: () => Record<string, string>, doFetch: typeof fetch = fetch): Promise<CatalogResult> {
  const have = kept.get(kind);
  if (have) return have;
  const p = fetchCatalog(kind, headers, doFetch).then(r => { if (!r.ok) kept.delete(kind); return r; });
  kept.set(kind, p); // set before it settles, so two pickers opening together share one request
  return p;
}

/** Forget both lists (tests). The catalog is the same for every account, so nothing here needs clearing on sign-out. */
export function forgetCatalogs() { kept.clear(); }
