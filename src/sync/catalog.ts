/* The shared catalog (ADR 025): GET /api/catalog?kind=..., read when the browse sheet opens. Not part of the sync: nothing is pulled in
   the background and nothing is kept for offline, so with no connection the sheet says so. What the account adds is copied into its own
   synced data (ADR 026). Untrusted JSON: each item is checked before the app uses it. */
import type { CatalogData, CatalogItem, CatalogKind } from '../types.ts';
import { EQUIPMENT } from '../lib/data.js';
import { M_KEYS } from '../lib/muscles.js';

export type CatalogResult = { ok: true; items: CatalogItem[] } | { ok: false; reason: 'offline' | 'refused' | 'unreachable' };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() && v.length <= max ? v.trim() : null);
const muscleKeys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is (typeof M_KEYS)[number] => typeof k === 'string' && (M_KEYS as string[]).includes(k)) : []);

/** One listed item, or null when it is not what the API sends. */
export function cleanCatalogItem(raw: unknown): CatalogItem | null {
  if (!isObj(raw)) return null;
  const id = text(raw.id, 100); const name = text(raw.name, 300); const brand = text(raw.brand, 300);
  if (!id || !id.startsWith('c:') || !name) return null;
  const d = isObj(raw.data) ? raw.data : {};
  const data: CatalogData = {};
  if (typeof d.eq === 'string' && Object.hasOwn(EQUIPMENT, d.eq)) data.eq = d.eq as CatalogData['eq'];
  if (isObj(d.muscles)) {
    const p = muscleKeys(d.muscles.p); const s = muscleKeys(d.muscles.s);
    data.muscles = { ...(p.length ? { p } : {}), ...(s.length ? { s } : {}), ...(d.muscles.mob === true ? { mob: true as const } : {}) };
  }
  for (const k of ['level', 'force', 'mechanic', 'category', 'form'] as const) { const v = text(d[k], 100); if (v) data[k] = v; }
  return { id, name, ...(brand ? { brand } : {}), data };
}

export async function fetchCatalog(kind: CatalogKind, headers: () => Record<string, string>, doFetch: typeof fetch = fetch): Promise<CatalogResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  try {
    const res = await doFetch(`/api/catalog?kind=${kind}`, { headers: { accept: 'application/json', ...headers() }, credentials: 'same-origin' });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'refused' };
    if (!res.ok) return { ok: false, reason: 'unreachable' };
    const body = (await res.json().catch(() => undefined)) as { items?: unknown } | undefined;
    if (!Array.isArray(body?.items)) return { ok: false, reason: 'unreachable' };
    return { ok: true, items: body.items.map(cleanCatalogItem).filter((x): x is CatalogItem => x !== null) };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export type CatalogSearchResult = { ok: true; items: CatalogItem[]; more: boolean } | { ok: false; reason: 'offline' | 'refused' | 'unreachable' };

/** GET /api/catalog/search: one page of the supplement catalog for the typed words (ADR 029). */
export async function searchCatalog(q: string, offset: number, headers: () => Record<string, string>, doFetch: typeof fetch = fetch): Promise<CatalogSearchResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'offline' };
  try {
    const params = new URLSearchParams({ kind: 'supplement', q, offset: String(offset) });
    const res = await doFetch(`/api/catalog/search?${params}`, { headers: { accept: 'application/json', ...headers() }, credentials: 'same-origin' });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'refused' };
    if (!res.ok) return { ok: false, reason: 'unreachable' };
    const body = (await res.json().catch(() => undefined)) as { items?: unknown; more?: unknown } | undefined;
    if (!Array.isArray(body?.items)) return { ok: false, reason: 'unreachable' };
    return { ok: true, items: body.items.map(cleanCatalogItem).filter((x): x is CatalogItem => x !== null), more: body.more === true };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
