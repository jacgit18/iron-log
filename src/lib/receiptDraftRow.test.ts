import { describe, expect, it } from 'vitest';
import type { Draft } from './receiptDraft';
import { draftDay, draftLabel, draftWhat } from './receiptDraftRow';

const line = { text: 'A', qty: 1, grossCents: 100, discountCents: 0, matchId: null };
const d = (receipt: Draft['receipt'], savedAt = new Date(2026, 10, 17, 12).getTime()): Draft => ({ id: 'a', savedAt, mk: '2026-11', receipt, restore: null });

describe('draft row words', () => {
  it("names a draft by store and the receipt's own date", () => {
    expect(draftLabel(d({ store: "BJ'S", date: '2026-11-16', lines: [line] }))).toBe("BJ'S, Nov 16");
    expect(draftDay(d({ date: '2026-01-05', lines: [line] }))).toBe('Jan 5');
  });
  it('falls back to Receipt and the saved day when the scan has no store or date, or a date it cannot read', () => {
    expect(draftLabel(d({ lines: [line] }))).toBe('Receipt, Nov 17');
    expect(draftLabel(d({ store: '  ', date: '2026-13-40', lines: [line] }))).toBe('Receipt, Nov 17');
  });
  it('counts the lines and shows the total when there is one', () => {
    expect(draftWhat(d({ lines: [line] }))).toBe('1 line');
    expect(draftWhat(d({ totalCents: 55567, lines: [line, line] }))).toMatch(/^2 lines, \$555\.67$/);
  });
});
