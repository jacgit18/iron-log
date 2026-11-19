import { keepMeta, type ChangeFailure, type KeepMeta, type ReceiptChange, type SavedList, type SavedReceipt, type SaveFailure } from './receiptsClient.js';
import type { Receipt } from '../shared/receipt.js';

// Snap now, log later (brief receipt-snap-now-log-later): the pure parts. A photo saved unread has status `to_log`; Apply moves the same row to `logged`, Undo moves it back.
// The calls are in receiptsClient.ts and covered by e2e/receiptSnap.spec.js; what each list shows, what is sent and the words are here and unit-tested.

/** What a To log row's photo box does: show the photo, wait out a refused load (429) before another try, or offer the try now. */
export function thumbState(url: string | undefined, retryAt: number | undefined, now: number): 'photo' | 'wait' | 'retry' | 'loading' {
  if (url) return 'photo';
  if (retryAt === undefined) return 'loading';
  return retryAt > now ? 'wait' : 'retry';
}

/** The most To log rows that load a small photo; the rest show a plain box, so opening Shopping never asks for a long run of pictures (30 calls a minute). */
export const MAX_THUMBS = 6;

export const toLogRows = (list: readonly SavedReceipt[]): SavedReceipt[] => list.filter(r => r.status === 'to_log');
export const loggedRows = (list: readonly SavedReceipt[]): SavedReceipt[] => list.filter(r => r.status !== 'to_log');
export const thumbIds = (rows: readonly SavedReceipt[]): string[] => rows.slice(0, MAX_THUMBS).map(r => r.id);

/** What a snap saves: the month on screen, nothing read yet. */
export const snapMeta = (mk: string): KeepMeta => ({ month: mk, store: '', receiptDate: null, totalCents: null });

/** A row's title: "Snapped Nov 18" (the day it was saved, on this device's clock), with the store when one was known. */
export function toLogTitle(r: Pick<SavedReceipt, 'savedAt' | 'store'>): string {
  const day = new Date(r.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${r.store ? `${r.store}, ` : ''}snapped ${day}`;
}

/** The list after a successful snap: the new row first (the server lists newest first), counts and bytes following it. */
export function withSnapped(list: SavedList | null, row: SavedReceipt): SavedList | null {
  if (!list) return null;
  return { ...list, receipts: [row, ...list.receipts.filter(r => r.id !== row.id)], count: list.count + 1, bytes: list.bytes + row.sizeBytes };
}

/** The list without one receipt (deleted here, or opened and found gone): counts and bytes follow. */
export function withoutReceipt(list: SavedList | null, id: string): SavedList | null {
  const gone = list?.receipts.find(r => r.id === id);
  return list && gone ? { ...list, receipts: list.receipts.filter(r => r.id !== id), count: list.count - 1, bytes: list.bytes - gone.sizeBytes } : list;
}

/** What Apply sends for a receipt that was waiting: what the person reviewed, moved to logged, only if it still waits (the first device to apply wins). */
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x1f\x7f]+/g;
export const applyChange = (receipt: Receipt, mk: string): ReceiptChange => {
  const m = keepMeta(receipt, mk);
  return { status: 'logged', ifStatus: 'to_log', month: m.month, store: m.store.replace(CONTROL, ' ').trim(), receiptDate: m.receiptDate, totalCents: m.totalCents };
};
/** Undo puts it back under To log, only if it is still logged. */
export const undoChange: ReceiptChange = { status: 'to_log', ifStatus: 'logged' };

/** Whether an opened row can be read: it is still waiting, already logged (another device applied it), or gone (deleted elsewhere). Nothing is changed by looking. */
export function openCheck(list: readonly SavedReceipt[], id: string): 'ready' | 'logged' | 'gone' {
  const r = list.find(x => x.id === id);
  return !r ? 'gone' : r.status === 'to_log' ? 'ready' : 'logged';
}
/** Open needs a checked status: a list call that failed is not "ready" (an already-logged or deleted receipt would open). */
export function openGate(l: { ok: true; receipts: readonly SavedReceipt[] } | { ok: false; reason: 'offline' | 'unavailable' }, id: string): 'ready' | 'logged' | 'gone' | 'offline' | 'unchecked' {
  return l.ok ? openCheck(l.receipts, id) : l.reason === 'offline' ? 'offline' : 'unchecked';
}
/** Read needs the account's data loaded to match the receipt against the list. Only a load still in progress blocks it: an empty list (every one-time item used, or none yet) reads, and the sheet creates items from unmatched lines. */
export const readBlockedText = (loading: boolean): string | null => (loading ? 'Your data is still loading on this device, so the receipt cannot be matched to your list yet. Wait a moment, then try Read again.' : null);

/** Which photos a load run should fetch: not already held and not already being fetched by another run (a changed list starts a second run while the first still awaits). Marks them in flight. */
export function claimLoads(ids: readonly string[], have: { has(id: string): boolean }, inFlight: Set<string>): string[] {
  const take = ids.filter(id => !have.has(id) && !inFlight.has(id));
  for (const id of take) inFlight.add(id);
  return take;
}

/** Photos that did not load, by when another try may go. A refused load (429) marks the failed one and the rest of the run as waiting (nothing is requested meanwhile); any other failure marks only the photo that failed, so rows still loading do not flash Retry. */
export function markMissed(ids: readonly string[], failedAt: number, reason: 'limit' | 'failed', now: number, waitMs = 0): Record<string, number> {
  const at = reason === 'limit' ? now + waitMs : 0;
  return Object.fromEntries((reason === 'limit' ? ids.slice(failedAt) : [ids[failedAt]!]).map(id => [id, at]));
}

export const openText = { unchecked: 'Could not check that receipt just now, so it was not opened.', logged: 'That receipt was already logged on another device. It is under Saved receipts.', gone: 'That receipt is gone. It was deleted on another device.', photo: 'Could not load the photo. Try again.', offline: 'You are offline. Opening a saved receipt needs a connection.' } as const;

/** The notice when a snap did not save. The photo stays in memory for Try again, except when the account is full. */
export function snapFailText(reason: SaveFailure['reason'], limits?: { maxReceipts: number; maxBytes: number }): string {
  if (reason === 'cap') return `You have ${limits?.maxReceipts ?? 200} saved receipts (or ${Math.round((limits?.maxBytes ?? 60 * 1024 * 1024) / 1024 / 1024)} MB). Delete some in Saved receipts to save more.`;
  if (reason === 'offline') return 'The photo was not saved. You are offline. Try again when you are back online.';
  if (reason === 'limit') return 'The photo was not saved. Too many saves just now. Try again in a minute.';
  return 'The photo was not saved. Try again.';
}

/** Why Apply stopped before writing anything: another device already moved or deleted the saved receipt. */
export const claimText = { taken: 'Another device already logged this receipt, so nothing was applied here. Close this sheet.', gone: 'This receipt was deleted on another device, so nothing was applied here. Close this sheet.' } as const;

/** Apply for a To log receipt: claim the saved row first, then write on this device. When the write stops after the claim (a store that cannot be made), the claim is released, or the row would stay "logged" with no prices and every retry would be refused as taken. Returns the text when another device got there first. */
export async function claimThenApply(claim: () => Promise<string | null>, write: () => boolean, release: () => Promise<void>): Promise<string | null> {
  const blocked = await claim();
  if (blocked) return blocked;
  let wrote = false;
  try { wrote = write(); } catch (e) { await release(); throw e; } // a write that threw after the claim must not leave the row logged with no prices
  if (!wrote) await release();
  return null;
}

/** Words when moving a receipt on or back did not go through (after the prices were already applied or undone on this device). */
export function changeFailText(reason: ChangeFailure['reason'], what: 'apply' | 'undo'): string {
  if (reason === 'taken') return what === 'apply' ? 'Applied here, but another device had already logged this receipt.' : 'Undone here, but this receipt was already moved on another device.';
  if (reason === 'gone') return 'Applied here, but the saved photo was deleted on another device.';
  return `${what === 'apply' ? 'Applied' : 'Undone'} here, but the saved receipt could not be updated${reason === 'offline' ? ' (you are offline)' : ''}. It may still show under To log.`;
}
