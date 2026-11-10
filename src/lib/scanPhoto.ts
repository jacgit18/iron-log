import { signIn } from '../sync/devUser.js';
import { markUsedUp, rememberAllowance } from './labelAllowance.js';
import { cleanReceiptAnswer, type ItemRef, type ReceiptResult } from '../shared/receipt.js';
import { cleanScanAnswer, type LabelResult } from '../shared/scan.js';
import { cleanSupplementScanAnswer, type SupplementScanResult } from '../shared/supplementScan.js';
import { markSupplementUsedUp, rememberSupplementAllowance, SUPPLEMENT_USED_UP_TEXT } from './supplementAllowance.js';

// Label photo scan, app side (brief label-photo-scan): shrink the photo in the browser, send it to /api/scan/label, read the answer. The photo is
// never stored; every failure comes back as a plain reason, never a throw.
export const MAX_SIDE = 1600; // long side in pixels: a label stays readable and the upload stays well under the route's 2 MB limit
export const MAX_RECEIPT_SIDE = 2400; // a receipt is tall and its print small: more pixels than a label, still a few hundred kB as JPEG (brief receipt-scan)
export const JPEG_QUALITY = 0.82;

/** The size a photo is drawn at: the long side at most `max`, never enlarged, whole pixels. */
export function fitSize(width: number, height: number, max = MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export type ScanFailure = { ok: false; reason: 'offline' | 'limit' | 'unavailable' | 'photo' };

/** The words under the button for each way a scan can fail or come back empty. */
export const SCAN_TEXT = {
  offline: 'You are offline. You can still type the numbers.',
  limit: 'Too many scans just now. Try again in a minute, or type the numbers.',
  unavailable: 'Scan is not available right now. You can still type the numbers.',
  photo: 'Could not open that photo. Try another one, or type the numbers.',
  unreadable: 'Could not read the numbers. Try a closer, flatter photo or type them in.',
  cap: 'Label photos are used up for today. You can still type the numbers.',
  per100g: 'That label only shows numbers per 100 g, so nothing was filled in. Type the numbers for one serving.',
} as const;

async function shrinkToJpegBase64(file: Blob, maxSide = MAX_SIDE): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitSize(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/jpeg', JPEG_QUALITY));
  if (!jpeg) throw new Error('no jpeg');
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** A label scan can also fail because today's label cap is used up (the route answers 503 with why "cap"). */
export type LabelFailure = ScanFailure | { ok: false; reason: 'cap' };

export async function scanLabel(file: Blob, signal?: AbortSignal): Promise<{ ok: true; result: LabelResult } | LabelFailure> {
  let image: string;
  try { image = await shrinkToJpegBase64(file); } catch { return { ok: false, reason: 'photo' }; }
  let res: Response;
  try {
    res = await fetch('/api/scan/label', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': __APP_VERSION__, ...signIn() }, body: JSON.stringify({ image }), ...(signal ? { signal } : {}) });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 429) return { ok: false, reason: 'limit' };
  if (!res.ok) {
    const why = await res.json().then((b: { why?: unknown; retryAfterSec?: unknown }) => b, () => ({} as { why?: unknown; retryAfterSec?: unknown }));
    if (res.status === 503 && why.why === 'cap') { markUsedUp(why.retryAfterSec); return { ok: false, reason: 'cap' }; }
    console.warn(`label scan unavailable: status ${res.status}`);
    return { ok: false, reason: 'unavailable' };
  }
  try { const body: unknown = await res.json(); rememberAllowance(body); return { ok: true, result: cleanScanAnswer(body) }; } catch { return { ok: false, reason: 'unavailable' }; }
}

/** Words for the receipt sheet's failures and empty results (brief receipt-scan). */
export const RECEIPT_TEXT = {
  offline: 'You are offline. You can still tick items and type prices.',
  limit: 'Too many scans just now. Try again in a minute, or type the prices.',
  unavailable: 'Scan is not available right now. You can still tick items and type prices.',
  photo: 'Could not open that photo. Try another one.',
  unreadable: 'Could not read that receipt. Try a flatter photo with the whole receipt in view. Nothing on your list changed.',
} as const;

/** One receipt photo and the list's item ids and names to /api/scan/receipt. The answer is re-checked against the same ids; every failure is a plain reason. The shrunk photo comes back too, held in memory so the sheet can offer to keep it (receiptsClient.ts); it goes nowhere unless the person ticks that box. */
export async function scanReceipt(file: Blob, items: ItemRef[], signal?: AbortSignal): Promise<{ ok: true; result: ReceiptResult; image: string } | ScanFailure> {
  let image: string;
  try { image = await shrinkToJpegBase64(file, MAX_RECEIPT_SIDE); } catch { return { ok: false, reason: 'photo' }; }
  let res: Response;
  try {
    res = await fetch('/api/scan/receipt', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': __APP_VERSION__, ...signIn() }, body: JSON.stringify({ image, items }), ...(signal ? { signal } : {}) });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 429) return { ok: false, reason: 'limit' };
  if (!res.ok) { console.warn(`receipt scan unavailable: status ${res.status}`); return { ok: false, reason: 'unavailable' }; }
  try { return { ok: true, result: cleanReceiptAnswer(await res.json(), new Set(items.map(i => i.id))), image }; } catch { return { ok: false, reason: 'unavailable' }; }
}

/** Words under the bottle-scan button for each way it can fail or come back empty (brief supplement-label-scan). Adding the supplement without amounts always still works. */
export const SUPPLEMENT_SCAN_TEXT = {
  offline: 'You are offline. You can still add it and type the amounts.',
  limit: 'Too many scans just now. Try again in a minute, or type the amounts.',
  unavailable: 'Bottle scan is not available right now. You can still add it and type the amounts.',
  photo: 'Could not open that photo. Try another one, or type the amounts.',
  unreadable: 'Could not read the amounts. Try a closer, flatter photo, or type them in the supplement\u2019s sheet.',
  cap: SUPPLEMENT_USED_UP_TEXT,
  check: 'Read from your photo. Check each amount against the bottle.',
} as const;

/** One photo of a bottle's Supplement Facts panel to /api/scan/supplement. The answer is checked again with the same validator as the server's; every failure is a plain reason, never a throw. The photo is not kept. */
export async function scanSupplement(file: Blob, signal?: AbortSignal): Promise<{ ok: true; result: SupplementScanResult } | LabelFailure> {
  let image: string;
  try { image = await shrinkToJpegBase64(file); } catch { return { ok: false, reason: 'photo' }; }
  let res: Response;
  try {
    res = await fetch('/api/scan/supplement', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': __APP_VERSION__, ...signIn() }, body: JSON.stringify({ image }), ...(signal ? { signal } : {}) });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 429) return { ok: false, reason: 'limit' };
  if (!res.ok) {
    const why = await res.json().then((b: { why?: unknown; retryAfterSec?: unknown }) => b, () => ({} as { why?: unknown; retryAfterSec?: unknown }));
    if (res.status === 503 && why.why === 'cap') { markSupplementUsedUp(why.retryAfterSec); return { ok: false, reason: 'cap' }; }
    console.warn(`bottle scan unavailable: status ${res.status}`);
    return { ok: false, reason: 'unavailable' };
  }
  try { const body: unknown = await res.json(); rememberSupplementAllowance(body); return { ok: true, result: cleanSupplementScanAnswer(body) }; } catch { return { ok: false, reason: 'unavailable' }; }
}
