import type { ProductName } from '../shared/barcode.js';
import { signIn } from '../sync/devUser.js';
import type { SuppBarcodeFailure } from './supplementBarcodeQuery.js';

/** A product's name and brand for a UPC (brief supplement-barcode-search): GET /api/supplement-barcode/<digits>. 404 with the route's own `why` is "not found", never a service failure. The answer is read again before it reaches a search box. */
export async function lookupSupplementBarcode(digits: string, signal?: AbortSignal): Promise<{ ok: true; product: ProductName } | { ok: false; reason: Extract<SuppBarcodeFailure, 'notfound' | 'limit' | 'offline' | 'unavailable'> }> {
  let res: Response;
  try {
    res = await fetch(`/api/supplement-barcode/${encodeURIComponent(digits)}`, { headers: { accept: 'application/json', 'x-client-version': __APP_VERSION__, ...signIn() }, ...(signal ? { signal } : {}) });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 429) return { ok: false, reason: 'limit' };
  const body = (await res.json().catch(() => undefined)) as { name?: unknown; brand?: unknown; why?: unknown } | undefined;
  if (res.status === 404 && body?.why === 'not-found') return { ok: false, reason: 'notfound' };
  if (!res.ok) { console.warn(`supplement barcode unavailable: status ${res.status}, ${typeof body?.why === 'string' ? body.why : 'no reason given'}`); return { ok: false, reason: 'unavailable' }; }
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 100) : '';
  const brand = typeof body?.brand === 'string' && body.brand.trim() ? body.brand.trim().slice(0, 60) : undefined;
  return name ? { ok: true, product: { name, ...(brand ? { brand } : {}) } } : { ok: false, reason: 'unavailable' };
}
