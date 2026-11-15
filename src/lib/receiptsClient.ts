import { signIn } from '../sync/devUser.js';
import type { Receipt } from '../shared/receipt.js';
import { money } from './grocery.js';

// Saved receipt photos, app side (brief receipt-save-photo): the opt-in save after Apply, the list, the note, the photo and the delete. The photo goes up in a
// separate call after Apply and only when the box was ticked; every failure comes back as a plain reason, never a throw. The pure parts (what is sent, how a
// row reads, how the list is grouped, the words) are unit-tested; the calls are covered by e2e/receiptSave.spec.js.

export interface SavedReceipt { id: string; savedAt: string; month: string; receiptDate: string | null; store: string; totalCents: number | null; note: string; sizeBytes: number }
export interface SavedList { receipts: SavedReceipt[]; count: number; bytes: number; maxReceipts: number; maxBytes: number }
/** What the person reviewed at Apply, as the server stores it next to the photo. */
export interface KeepMeta { month: string; store: string; receiptDate: string | null; totalCents: number | null }
export type SaveFailure = { ok: false; reason: 'offline' | 'cap' | 'limit' | 'unavailable' };
export const MAX_NOTE = 200;

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

/** The fields the server keeps with the photo: the month on screen and the values the person reviewed. A date or total the scan could not read is left blank. */
export function keepMeta(receipt: Receipt, mk: string): KeepMeta {
  return { month: mk, store: (receipt.store ?? '').slice(0, 60), receiptDate: isDay(receipt.date) ? receipt.date : null, totalCents: Number.isInteger(receipt.totalCents) && receipt.totalCents! >= 0 ? receipt.totalCents! : null };
}

/** The notice under Scan receipt when Apply worked and the photo did not save. `Try again` is offered for every reason except a full account. */
export function keepFailText(reason: SaveFailure['reason'], limits?: { maxReceipts: number; maxBytes: number }): string {
  const base = 'Receipt applied. The photo was not saved.';
  if (reason === 'cap') return `Receipt applied. You have ${limits?.maxReceipts ?? 200} saved receipts (or ${Math.round((limits?.maxBytes ?? 60 * 1024 * 1024) / 1024 / 1024)} MB). Delete some in Receipts to save more.`;
  if (reason === 'offline') return `${base} You are offline.`;
  if (reason === 'limit') return `${base} Too many saves just now.`;
  return base;
}

const shortDay = (day: string): string => new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** One list row: "BJ's, Nov 2, $142.31". A missing store, date or total reads as such. */
export function receiptTitle(r: Pick<SavedReceipt, 'store' | 'receiptDate' | 'totalCents'>): string {
  return `${r.store || 'Receipt'}, ${r.receiptDate ? shortDay(r.receiptDate) : 'no date'}, ${r.totalCents === null ? 'no total' : money(r.totalCents)}`;
}

/** The file name a download gets: receipt-2026-11-02-bjs.jpg. */
export function downloadName(r: Pick<SavedReceipt, 'store' | 'receiptDate' | 'savedAt'>): string {
  const slug = r.store.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  return `receipt-${r.receiptDate ?? r.savedAt.slice(0, 10)}${slug ? `-${slug}` : ''}.jpg`;
}

/** The list grouped by month, newest month first, keeping the server's order inside each month (newest saved first). */
export function groupByMonth(list: readonly SavedReceipt[]): { month: string; receipts: SavedReceipt[] }[] {
  const groups = new Map<string, SavedReceipt[]>();
  for (const r of list) groups.set(r.month, [...(groups.get(r.month) ?? []), r]);
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)).map(([month, receipts]) => ({ month, receipts }));
}

/** "12 saved, 3.4 MB of 60 MB" for the top of the page. */
export function usageText(l: Pick<SavedList, 'count' | 'bytes' | 'maxReceipts' | 'maxBytes'>): string {
  const mb = (n: number) => (n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1);
  return `${l.count} of ${l.maxReceipts} saved, ${mb(l.bytes)} MB of ${mb(l.maxBytes)} MB`;
}

async function call(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response | null> {
  const { json, ...rest } = init;
  try {
    return await fetch(`/api/receipts${path}`, { ...rest, headers: { 'x-client-version': __APP_VERSION__, ...(json === undefined ? {} : { 'content-type': 'application/json' }), ...signIn() }, ...(json === undefined ? {} : { body: JSON.stringify(json) }) });
  } catch { return null; }
}

/** Keep one photo (the base64 JPEG that was scanned) with what the person reviewed. */
export async function saveReceipt(image: string, meta: KeepMeta): Promise<{ ok: true; receipt: SavedReceipt } | SaveFailure> {
  const res = await call('', { method: 'POST', json: { image, month: meta.month, store: meta.store, receiptDate: meta.receiptDate, totalCents: meta.totalCents } });
  if (!res) return { ok: false, reason: 'offline' };
  if (res.status === 409) return { ok: false, reason: 'cap' };
  if (res.status === 429) return { ok: false, reason: 'limit' };
  if (!res.ok) { console.warn(`receipt save unavailable: status ${res.status}`); return { ok: false, reason: 'unavailable' }; }
  try { return { ok: true, receipt: ((await res.json()) as { receipt: SavedReceipt }).receipt }; } catch { return { ok: false, reason: 'unavailable' }; }
}

export async function listReceipts(): Promise<({ ok: true } & SavedList) | { ok: false; reason: 'offline' | 'unavailable' }> {
  const res = await call('');
  if (!res) return { ok: false, reason: 'offline' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  try { return { ok: true, ...((await res.json()) as SavedList) }; } catch { return { ok: false, reason: 'unavailable' }; }
}

export async function saveNote(id: string, note: string): Promise<{ ok: true; receipt: SavedReceipt } | { ok: false; reason: 'offline' | 'unavailable' }> {
  const res = await call(`/${id}`, { method: 'PATCH', json: { note } });
  if (!res) return { ok: false, reason: 'offline' };
  if (!res.ok) return { ok: false, reason: 'unavailable' };
  try { return { ok: true, receipt: ((await res.json()) as { receipt: SavedReceipt }).receipt }; } catch { return { ok: false, reason: 'unavailable' }; }
}

export async function removeReceipt(id: string): Promise<{ ok: true } | { ok: false; reason: 'offline' | 'unavailable' }> {
  const res = await call(`/${id}`, { method: 'DELETE' });
  if (!res) return { ok: false, reason: 'offline' };
  return res.ok || res.status === 404 ? { ok: true } : { ok: false, reason: 'unavailable' }; // already gone is the same as deleted
}

/** How long to wait before a refused call may be tried again: the server's Retry-After seconds, at least 1 and at most 60, 5 when it sent none. */
export const retryWaitMs = (header: string | null): number => { const n = Number(header); return (Number.isFinite(n) && n > 0 ? Math.min(60, Math.max(1, Math.ceil(n))) : 5) * 1000; };

/** The saved JPEG, or null when it could not be loaded. `patient` (Download all, which asks for every photo in a row) waits out the per-minute limit and tries again, up to 5 times, instead of giving up on that photo. */
export async function fetchPhoto(id: string, patient = false): Promise<Blob | null> {
  for (let tries = 0; ; tries++) {
    const res = await call(`/${id}/photo`);
    if (res?.status === 429 && patient && tries < 5) { await new Promise(done => setTimeout(done, retryWaitMs(res.headers.get('Retry-After')))); continue; }
    if (!res || !res.ok) return null;
    try { return await res.blob(); } catch { return null; }
  }
}
