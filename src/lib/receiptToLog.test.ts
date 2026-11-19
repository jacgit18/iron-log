import { describe, expect, it } from 'vitest';
import { MAX_THUMBS, applyChange, changeFailText, loggedRows, openCheck, snapFailText, snapMeta, thumbIds, toLogRows, toLogTitle, undoChange, withSnapped } from './receiptToLog.js';
import type { SavedList, SavedReceipt } from './receiptsClient.js';

const r = (id: string, over: Partial<SavedReceipt> = {}): SavedReceipt => ({ id, savedAt: '2026-11-18T15:00:00.000Z', month: '2026-11', receiptDate: null, store: '', totalCents: null, note: '', sizeBytes: 100, status: 'to_log', ...over });
const list = (receipts: SavedReceipt[]): SavedList => ({ receipts, count: receipts.length, bytes: 100 * receipts.length, maxReceipts: 200, maxBytes: 60 * 1024 * 1024 });

describe('To log list', () => {
  it('splits the saved list into waiting and logged', () => {
    const all = [r('1'), r('2', { status: 'logged' }), r('3')];
    expect(toLogRows(all).map(x => x.id)).toEqual(['1', '3']);
    expect(loggedRows(all).map(x => x.id)).toEqual(['2']);
  });
  it('loads a photo for at most MAX_THUMBS rows', () => {
    const rows = Array.from({ length: 10 }, (_, i) => r(String(i)));
    expect(thumbIds(rows)).toHaveLength(MAX_THUMBS);
  });
  it('snaps with the month on screen and nothing read', () => {
    expect(snapMeta('2026-11')).toEqual({ month: '2026-11', store: '', receiptDate: null, totalCents: null });
  });
  it('titles a row with the day it was snapped, and the store when known', () => {
    expect(toLogTitle(r('1'))).toMatch(/^snapped /);
    expect(toLogTitle(r('1', { store: "BJ's" }))).toMatch(/^BJ's, snapped /);
  });
  it('puts a new snap first and counts it', () => {
    const next = withSnapped(list([r('1', { sizeBytes: 50 })]), r('2', { sizeBytes: 70 }))!;
    expect(next.receipts.map(x => x.id)).toEqual(['2', '1']);
    expect(next.count).toBe(2);
    expect(next.bytes).toBe(100 + 70);
    expect(withSnapped(null, r('2'))).toBeNull();
  });
});

describe('Open, Apply and Undo', () => {
  it('opens only a receipt that still waits; changes nothing by looking', () => {
    const all = [r('1'), r('2', { status: 'logged' })];
    expect(openCheck(all, '1')).toBe('ready');
    expect(openCheck(all, '2')).toBe('logged');
    expect(openCheck(all, '9')).toBe('gone');
    expect(all).toEqual([r('1'), r('2', { status: 'logged' })]);
  });
  it('applies the reviewed receipt to the same row, only if it still waits', () => {
    expect(applyChange({ store: "BJ's", date: '2026-11-02', totalCents: 14231, lines: [] }, '2026-11')).toEqual({ status: 'logged', ifStatus: 'to_log', month: '2026-11', store: "BJ's", receiptDate: '2026-11-02', totalCents: 14231 });
  });
  it('undoes back to To log, only if it is still logged', () => {
    expect(undoChange).toEqual({ status: 'to_log', ifStatus: 'logged' });
  });
});

describe('words', () => {
  it('says why a snap did not save and what to do', () => {
    expect(snapFailText('offline')).toContain('offline');
    expect(snapFailText('limit')).toContain('minute');
    expect(snapFailText('unavailable')).toMatch(/not saved/);
    expect(snapFailText('cap')).toContain('200 saved receipts (or 60 MB)');
    expect(snapFailText('cap', { maxReceipts: 5, maxBytes: 2 * 1024 * 1024 })).toContain('5 saved receipts (or 2 MB)');
  });
  it('says what happened when the saved row could not follow Apply or Undo', () => {
    expect(changeFailText('taken', 'apply')).toContain('already logged');
    expect(changeFailText('gone', 'apply')).toContain('deleted');
    expect(changeFailText('offline', 'undo')).toContain('offline');
    expect(changeFailText('unavailable', 'apply')).toContain('could not be updated');
  });
});
