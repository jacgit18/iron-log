/* One catalog supplement's label (brief supplement-label-amounts): GET /api/supplement-label/<catalog id>, read when a catalog supplement is picked in the add form or when Fill from label is
   pressed. Pass null to ask nothing. Only the newest answer is used; a failure is "failed" (the add never waits on it). Off when not syncing: local mode has no catalog (ADR 025). */
import { useEffect, useState } from 'react';
import { cleanSupplementLabel, type SupplementLabel } from '../shared/dsldLabel.js';
import { useAppStore } from '../store/useAppStore.js';
import { signIn as devHeaders } from '../sync/devUser.js';

export type LabelState = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; label: SupplementLabel } | { status: 'failed'; reason: 'not-found' | 'unavailable' | 'offline' };

export const isDsldCatalogId = (id: unknown): id is string => typeof id === 'string' && /^c:dsld:\d{1,9}$/.test(id);

/** The label for one catalog id, or why there is none. Untrusted JSON: the answer is cleaned before anything uses it. */
export async function fetchSupplementLabel(catalogId: string, doFetch: typeof fetch = fetch): Promise<Exclude<LabelState, { status: 'idle' | 'loading' }>> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'failed', reason: 'offline' };
  try {
    const res = await doFetch(`/api/supplement-label/${encodeURIComponent(catalogId)}`, { headers: { accept: 'application/json', ...devHeaders() }, credentials: 'same-origin' });
    if (res.status === 404) return { status: 'failed', reason: 'not-found' };
    if (!res.ok) return { status: 'failed', reason: 'unavailable' };
    const body = (await res.json().catch(() => undefined)) as { label?: unknown } | undefined;
    const label = cleanSupplementLabel(body?.label);
    return label ? { status: 'ready', label } : { status: 'failed', reason: 'unavailable' };
  } catch {
    return { status: 'failed', reason: 'offline' };
  }
}

export function useSupplementLabel(catalogId: string | null | undefined): { state: LabelState; retry: () => void } {
  const syncing = useAppStore(s => s.sync !== null);
  const id = syncing && isDsldCatalogId(catalogId) ? catalogId : null;
  const [tries, setTries] = useState(0);
  const key = id ? `${tries}:${id}` : '';
  const [got, setGot] = useState<{ key: string; state: Exclude<LabelState, { status: 'idle' | 'loading' }> } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true; // a later pick or a retry makes this answer stale
    void fetchSupplementLabel(id).then(state => { if (live) setGot({ key, state }); });
    return () => { live = false; };
  }, [id, key]);
  const state: LabelState = !id ? { status: 'idle' } : got?.key === key ? got.state : { status: 'loading' };
  return { state, retry: () => setTries(t => t + 1) };
}
