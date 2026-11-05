import type { ReceiptLine } from '../shared/receipt.js';
import { money } from './grocery.js';
import { splitCents as packsOf } from './groceryReceipt.js';

/* ---------- Receipt: merge repeated lines (brief receipt-merge-lines). The review sheet shows one row for lines that carry the same receipt text; the plan and the totals
   still work on the original lines, so merging changes what the sheet shows and what a new item is prefilled with, nothing that is written. Pure. ---------- */

/** One sheet row: the receipt lines (by index into `receipt.lines`) that share a text, and their sums. A row of one line is an ordinary line. */
export interface ReceiptRow { key: string; text: string; lines: number[]; qty: number; grossCents: number; discountCents: number; netCents: number; packs: number[] }

/** The text two lines must share to be one row: trimmed, spaces collapsed, case folded. */
export const textKey = (text: string): string => text.trim().replace(/\s+/g, ' ').toLowerCase();

const lineNet = (l: ReceiptLine) => l.grossCents - l.discountCents;
const packCount = (l: ReceiptLine) => (Number.isInteger(l.qty) && l.qty >= 1 ? l.qty : 1);

/** A line that may join another: sold by count and with a price. A weighed line (`unit` set) is never merged, because its quantity is a weight and its price is for that weight, so two of
 *  them are two purchases, not two packs; a line with no price (a return or an unattached discount) cannot be matched at all. */
const mergeable = (l: ReceiptLine) => !l.unit && l.grossCents > 0;

/** The receipt's lines as rows, in receipt order: mergeable lines with the same text (not the same price) become one row at the place of the first; a row's text key listed in `separate` stays as its lines. */
export function groupLines(lines: readonly ReceiptLine[], separate: ReadonlySet<string> = new Set()): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  const open = new Map<string, ReceiptRow>();
  lines.forEach((l, i) => {
    const key = textKey(l.text);
    const into = mergeable(l) && !separate.has(key) ? open.get(key) : undefined;
    if (into) {
      into.lines.push(i);
      into.qty = Math.round((into.qty + l.qty) * 100) / 100;
      into.grossCents += l.grossCents; into.discountCents += l.discountCents; into.netCents += lineNet(l);
      into.packs.push(...packsOf(lineNet(l), packCount(l)));
      return;
    }
    const row: ReceiptRow = { key, text: l.text, lines: [i], qty: l.qty, grossCents: l.grossCents, discountCents: l.discountCents, netCents: lineNet(l), packs: l.unit || l.grossCents <= 0 ? [] : packsOf(lineNet(l), packCount(l)) };
    rows.push(row);
    if (mergeable(l)) open.set(key, row);
  });
  return rows;
}

/** The row as one receipt line, for what reads a line (the Add to list form's starting values): the sums, the first line's text. */
export const rowAsLine = (row: ReceiptRow, lines: readonly ReceiptLine[]): ReceiptLine => ({ ...lines[row.lines[0]!]!, qty: row.qty, grossCents: row.grossCents, discountCents: row.discountCents });

/** The small note under a merged row: "$8.99 each" when every pack cost the same, else each pack's own price. Nothing for a row of one line. */
export function mergeNote(row: ReceiptRow): string {
  if (row.lines.length < 2 || !row.packs.length) return '';
  if (row.packs.every(p => p === row.packs[0])) return `${money(row.packs[0]!)} each`;
  return `${row.packs.length} packs, each at its own price: ${row.packs.map(money).join(' + ')}`;
}
