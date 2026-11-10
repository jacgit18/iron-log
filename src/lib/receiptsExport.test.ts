import { describe, expect, it } from 'vitest';
import type { SavedReceipt } from './receiptsClient.js';
import { csvCell, exportNames, receiptsCsv, receiptsZip } from './receiptsExport.js';

const r = (id: string, over: Partial<SavedReceipt> = {}): SavedReceipt => ({ id, savedAt: '2026-11-02T10:00:00Z', month: '2026-11', receiptDate: '2026-11-02', store: "BJ's", totalCents: 14231, note: '', sizeBytes: 3, ...over });

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => { expect(csvCell('a,b')).toBe('"a,b"'); expect(csvCell('say "hi"')).toBe('"say ""hi"""'); expect(csvCell('a\nb')).toBe('"a\nb"'); });
  it('defuses a formula', () => { expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)"); expect(csvCell('-1')).toBe("'-1"); expect(csvCell('plain')).toBe('plain'); });
});

describe('exportNames', () => {
  it('numbers a repeated name and leaves the first alone', () => expect(exportNames([r('1'), r('2'), r('3', { store: 'Aldi' })])).toEqual(['receipt-2026-11-02-bjs.jpg', 'receipt-2026-11-02-bjs-2.jpg', 'receipt-2026-11-02-aldi.jpg']));
});

describe('receiptsCsv', () => {
  it('has a header, a row per receipt with dollars, and a blank cell for a missing date or total', () => {
    const csv = receiptsCsv([r('1', { note: 'big, trip' }), r('2', { receiptDate: null, totalCents: null, store: '' })], ['a.jpg', 'b.jpg']);
    expect(csv.split('\r\n')).toEqual(['Saved,Receipt date,Store,Total,Month,Note,File', "2026-11-02,2026-11-02,BJ's,142.31,2026-11,\"big, trip\",a.jpg", '2026-11-02,,,,2026-11,,b.jpg', '']);
  });
});

describe('receiptsZip', () => {
  it('puts the csv first, then each photo, and counts a missing photo', () => {
    const { zip, skipped } = receiptsZip([r('1'), r('2', { store: 'Aldi' })], new Map([['1', new Uint8Array([9, 9])]]));
    expect(skipped).toBe(1);
    const dv = new DataView(zip.buffer);
    expect(dv.getUint16(zip.length - 22 + 10, true)).toBe(2); // receipts.csv + one photo
    expect(new TextDecoder().decode(zip.subarray(30, 30 + 12))).toBe('receipts.csv');
  });
});
