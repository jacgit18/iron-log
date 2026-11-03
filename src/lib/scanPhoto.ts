import { signIn } from '../sync/devUser.js';
import { cleanScanAnswer, type LabelResult } from '../shared/scan.js';

// Label photo scan, app side (brief label-photo-scan): shrink the photo in the browser, send it to /api/scan/label, read the answer. The photo is
// never stored; every failure comes back as a plain reason, never a throw.
export const MAX_SIDE = 1600; // long side in pixels: a label stays readable and the upload stays well under the route's 2 MB limit
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
  per100g: 'That label only shows numbers per 100 g, so nothing was filled in. Type the numbers for one serving.',
} as const;

async function shrinkToJpegBase64(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { w, h } = fitSize(bitmap.width, bitmap.height);
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

export async function scanLabel(file: Blob, signal?: AbortSignal): Promise<{ ok: true; result: LabelResult } | ScanFailure> {
  let image: string;
  try { image = await shrinkToJpegBase64(file); } catch { return { ok: false, reason: 'photo' }; }
  let res: Response;
  try {
    res = await fetch('/api/scan/label', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-version': __APP_VERSION__, ...signIn() }, body: JSON.stringify({ image }), ...(signal ? { signal } : {}) });
  } catch { return { ok: false, reason: 'offline' }; }
  if (res.status === 429) return { ok: false, reason: 'limit' };
  if (!res.ok) { console.warn(`label scan unavailable: status ${res.status}`); return { ok: false, reason: 'unavailable' }; }
  try { return { ok: true, result: cleanScanAnswer(await res.json()) }; } catch { return { ok: false, reason: 'unavailable' }; }
}
