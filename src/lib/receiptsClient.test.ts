import { describe, expect, it } from 'vitest';
import { downloadName, groupByMonth, keepFailText, keepMeta, receiptTitle, retryWaitMs, usageText, type SavedReceipt } from './receiptsClient.js';

const r = (over: Partial<SavedReceipt> = {}): SavedReceipt => ({ id: '1', savedAt: '2026-11-03T12:00:00.000Z', month: '2026-11', receiptDate: '2026-11-02', store: "BJ's", totalCents: 14231, note: '', sizeBytes: 300_000, ...over });

describe('keepMeta', () => {
  it('carries the reviewed store, date and total with the month on screen', () => {
    expect(keepMeta({ store: "BJ's", date: '2026-11-02', totalCents: 14231, lines: [] }, '2026-11')).toEqual({ month: '2026-11', store: "BJ's", receiptDate: '2026-11-02', totalCents: 14231 });
  });
  it('leaves out a date that is not a real day and a total that is missing', () => {
    expect(keepMeta({ date: '2026-02-30', lines: [] }, '2026-02')).toEqual({ month: '2026-02', store: '', receiptDate: null, totalCents: null });
    expect(keepMeta({ date: 'last Tuesday', totalCents: -5, lines: [] }, '2026-02')).toMatchObject({ receiptDate: null, totalCents: null });
  });
});

describe('keepFailText', () => {
  it('always says the prices were applied and the photo was not saved, and names what to do when the account is full', () => {
    for (const reason of ['offline', 'limit', 'unavailable'] as const) expect(keepFailText(reason)).toMatch(/^Receipt applied\. The photo was not saved\./);
    expect(keepFailText('offline')).toContain('offline');
    expect(keepFailText('cap')).toBe('Receipt applied. You have 200 saved receipts (or 60 MB). Delete some in Receipts to save more.');
    expect(keepFailText('cap', { maxReceipts: 5, maxBytes: 2 * 1024 * 1024 })).toContain('5 saved receipts (or 2 MB)');
  });
});

describe('receiptTitle and downloadName', () => {
  it('reads store, date and total', () => {
    expect(receiptTitle(r())).toMatch(/^BJ's, Nov 2, \$142\.31$/);
  });
  it('says no date, no total and Receipt for a blank store', () => {
    expect(receiptTitle(r({ store: '', receiptDate: null, totalCents: null }))).toBe('Receipt, no date, no total');
    expect(receiptTitle(r({ totalCents: 0 }))).toContain('$0.00');
  });
  it('names the download from the date and store, falling back to the day it was saved', () => {
    expect(downloadName(r())).toBe('receipt-2026-11-02-bjs.jpg');
    expect(downloadName(r({ store: '', receiptDate: null }))).toBe('receipt-2026-11-03.jpg');
    expect(downloadName(r({ store: '../../etc/passwd' }))).toBe('receipt-2026-11-02-etcpasswd.jpg');
  });
});

describe('groupByMonth', () => {
  it('puts the newest month first and keeps the server order inside a month', () => {
    const g = groupByMonth([r({ id: 'a', month: '2026-10' }), r({ id: 'b', month: '2026-11' }), r({ id: 'c', month: '2026-10' }), r({ id: 'd', month: '2026-11' })]);
    expect(g.map(x => x.month)).toEqual(['2026-11', '2026-10']);
    expect(g.map(x => x.receipts.map(y => y.id))).toEqual([['b', 'd'], ['a', 'c']]);
  });
  it('is empty for no receipts', () => { expect(groupByMonth([])).toEqual([]); });
});

describe('usageText', () => {
  it('counts receipts and megabytes against the caps', () => {
    expect(usageText({ count: 12, bytes: 3.4 * 1024 * 1024, maxReceipts: 200, maxBytes: 60 * 1024 * 1024 })).toBe('12 of 200 saved, 3.4 MB of 60 MB');
  });
});

describe('retryWaitMs', () => {
  it('uses the server\'s seconds, kept between 1 and 60, and 5 when there are none', () => {
    expect(retryWaitMs('12')).toBe(12_000);
    expect(retryWaitMs('0')).toBe(5000);
    expect(retryWaitMs('900')).toBe(60_000);
    expect(retryWaitMs(null)).toBe(5000);
    expect(retryWaitMs('soon')).toBe(5000);
  });
});
