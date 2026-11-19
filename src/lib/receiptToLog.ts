import { keepMeta, type ChangeFailure, type KeepMeta, type ReceiptChange, type SavedList, type SavedReceipt, type SaveFailure } from './receiptsClient.js';
import type { Receipt } from '../shared/receipt.js';

// Snap now, log later (brief receipt-snap-now-log-later): the pure parts. A photo saved unread has status `to_log`; Apply moves the same row to `logged`, Undo moves it back.
// The calls are in receiptsClient.ts and covered by e2e/receiptSnap.spec.js; what each list shows, what is sent and the words are here and unit-tested.

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

/** What Apply sends for a receipt that was waiting: what the person reviewed, moved to logged, only if it still waits (the first device to apply wins). */
export const applyChange = (receipt: Receipt, mk: string): ReceiptChange => {
  const m = keepMeta(receipt, mk);
  return { status: 'logged', ifStatus: 'to_log', month: m.month, store: m.store, receiptDate: m.receiptDate, totalCents: m.totalCents };
};
/** Undo puts it back under To log, only if it is still logged. */
export const undoChange: ReceiptChange = { status: 'to_log', ifStatus: 'logged' };

/** Whether an opened row can be read: it is still waiting, already logged (another device applied it), or gone (deleted elsewhere). Nothing is changed by looking. */
export function openCheck(list: readonly SavedReceipt[], id: string): 'ready' | 'logged' | 'gone' {
  const r = list.find(x => x.id === id);
  return !r ? 'gone' : r.status === 'to_log' ? 'ready' : 'logged';
}
export const openText = { logged: 'That receipt was already logged on another device. It is under Saved receipts.', gone: 'That receipt is gone. It was deleted on another device.', photo: 'Could not load the photo. Try again.', offline: 'You are offline. Opening a saved receipt needs a connection.' } as const;

/** The notice when a snap did not save. The photo stays in memory for Try again, except when the account is full. */
export function snapFailText(reason: SaveFailure['reason'], limits?: { maxReceipts: number; maxBytes: number }): string {
  if (reason === 'cap') return `You have ${limits?.maxReceipts ?? 200} saved receipts (or ${Math.round((limits?.maxBytes ?? 60 * 1024 * 1024) / 1024 / 1024)} MB). Delete some in Saved receipts to save more.`;
  if (reason === 'offline') return 'The photo was not saved. You are offline. Try again when you are back online.';
  if (reason === 'limit') return 'The photo was not saved. Too many saves just now. Try again in a minute.';
  return 'The photo was not saved. Try again.';
}

/** Words when moving a receipt on or back did not go through (after the prices were already applied or undone on this device). */
export function changeFailText(reason: ChangeFailure['reason'], what: 'apply' | 'undo'): string {
  if (reason === 'taken') return what === 'apply' ? 'Applied here, but another device had already logged this receipt.' : 'Undone here, but this receipt was already moved on another device.';
  if (reason === 'gone') return 'Applied here, but the saved photo was deleted on another device.';
  return `${what === 'apply' ? 'Applied' : 'Undone'} here, but the saved receipt could not be updated${reason === 'offline' ? ' (you are offline)' : ''}. It may still show under To log.`;
}
