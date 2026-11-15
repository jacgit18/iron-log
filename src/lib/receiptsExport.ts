import type { SavedReceipt } from './receiptsClient.js';
import { downloadName } from './receiptsClient.js';
import { zipStore } from './zipStore.js';
import type { ZipFile } from './zipStore.js';

// "Download all" on the Receipts page: every saved photo as a file plus receipts.csv with what was kept next to it (store, date, total, month, note).
// The person's own data, so it has to leave the app whole (brief receipts-everyone). Pure: the page fetches the photos and hands them in.

/** A spreadsheet reads a cell that starts with = + - or @ as a formula, so such text gets a leading apostrophe; quotes, commas and newlines are quoted. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const dollars = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2));

/** A file name per receipt: the same as a single download, with -2, -3 for a repeat. */
export function exportNames(list: readonly SavedReceipt[]): string[] {
  const seen = new Map<string, number>();
  return list.map(r => {
    const base = downloadName(r); const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    return n === 1 ? base : base.replace(/\.jpg$/, `-${n}.jpg`);
  });
}

/** receipts.csv: one row per receipt, in list order, with the file it sits in. */
export function receiptsCsv(list: readonly SavedReceipt[], names: readonly string[]): string {
  const rows = list.map((r, i) => [r.savedAt.slice(0, 10), r.receiptDate ?? '', r.store, dollars(r.totalCents), r.month, r.note, names[i] ?? ''].map(csvCell).join(','));
  return ['Saved,Receipt date,Store,Total,Month,Note,File', ...rows].join('\r\n') + '\r\n';
}

/** The zip: receipts.csv first, then each photo that was loaded. A receipt whose photo is missing from `photos` stays in the csv with no file; `skipped` counts them. */
export function receiptsZip(list: readonly SavedReceipt[], photos: ReadonlyMap<string, Uint8Array>, now = new Date()): { zip: Uint8Array; skipped: number } {
  const names = exportNames(list);
  const csvNames = names.map((n, i) => (photos.has(list[i]!.id) ? n : ''));
  const files: ZipFile[] = [{ name: 'receipts.csv', data: new TextEncoder().encode(receiptsCsv(list, csvNames)), date: now }];
  let skipped = 0;
  list.forEach((r, i) => { const p = photos.get(r.id); if (p) files.push({ name: names[i]!, data: p, date: now }); else skipped++; });
  return { zip: zipStore(files), skipped };
}
