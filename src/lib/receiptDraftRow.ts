import { money } from './grocery.js';
import type { Draft } from './receiptDraft.js';

// What a Drafts row says (brief receipt-drafts-list): pure, so the words are node-tested and the component only draws them.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Nov 16" from the receipt's own date (YYYY-MM-DD), else from when the draft was saved; no time zone involved for the receipt's date. */
export function draftDay(d: Draft): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d.receipt.date ?? '');
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
  const t = new Date(d.savedAt);
  return `${MONTHS[t.getMonth()]} ${t.getDate()}`;
}

/** The row's title and the name of its buttons: "BJ'S, Nov 16". */
export const draftLabel = (d: Draft): string => `${d.receipt.store?.trim() || 'Receipt'}, ${draftDay(d)}`;

/** "12 lines, $555.67" (the total is left out when the scan had none). */
export function draftWhat(d: Draft): string {
  const n = d.receipt.lines.length;
  const lines = `${n} ${n === 1 ? 'line' : 'lines'}`;
  return typeof d.receipt.totalCents === 'number' ? `${lines}, ${money(d.receipt.totalCents)}` : lines;
}
