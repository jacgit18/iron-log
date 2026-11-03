import { jsonFromReply } from './scan.js';

// Receipt scan (brief receipt-scan): turns what the model said about a store receipt into lines the grocery list can use. Pure and shared by the server
// (which asks the model) and the app (which re-checks the answer and builds the review sheet). The model's words are data: only the fixed fields below
// are read, each in a range, a `matchId` is kept only when it is an item id the app sent, and nothing on the receipt (loyalty numbers, card digits, an
// address) is asked for or kept. Nothing here is stored.

export const MAX_LINES = 150;
export const MAX_TEXT = 60;
export const MAX_STORE_TEXT = 40;
export const MAX_RECEIPT_BASE64 = 3_500_000; // characters of base64 the receipt route accepts (about 2.6 MB of JPEG)
export const MAX_ITEMS_SENT = 500;
const MAX_CENTS = 9_999_999; // $99,999.99 a line

export type ReceiptUnit = 'lb' | 'kg' | 'oz';
/** One receipt line. `grossCents` is the printed line total, `discountCents` the savings printed under it (0 when none), so the net price is gross minus discount.
 *  A negative `grossCents` is a return or an unattached discount: it never matches an item. */
export interface ReceiptLine { text: string; qty: number; unit?: ReceiptUnit; grossCents: number; discountCents: number; matchId: string | null }
export interface Receipt { store?: string; date?: string; lines: ReceiptLine[]; taxCents?: number; totalCents?: number }
export type ReceiptResult = { kind: 'ok'; receipt: Receipt } | { kind: 'unreadable' };
/** What the route sends the model about the grocery list: ids and names only (no prices, notes or sharing). */
export interface ItemRef { id: string; n: string; unit?: ReceiptUnit }

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim().slice(0, max).trim();
  return t || undefined;
};
const cents = (v: unknown, min: number): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.round(v) >= min && Math.round(v) <= MAX_CENTS ? Math.round(v) : null);
const UNITS: readonly string[] = ['lb', 'kg', 'oz'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Checks one parsed answer against the item ids the app sent. At least one usable line is required. */
export function cleanReceipt(raw: unknown, known: ReadonlySet<string>): ReceiptResult {
  const o = obj(raw);
  if (!o || !Array.isArray(o.lines)) return { kind: 'unreadable' };
  const lines: ReceiptLine[] = [];
  for (const item of o.lines.slice(0, MAX_LINES)) {
    const l = obj(item);
    if (!l) continue;
    const t = text(l.text, MAX_TEXT);
    const gross = cents(l.total, -MAX_CENTS);
    const qty = typeof l.qty === 'number' && Number.isFinite(l.qty) && l.qty > 0 && l.qty <= 999 ? Math.round(l.qty * 100) / 100 : 1;
    if (!t || gross === null) continue;
    const disc = gross > 0 ? cents(l.discount, 0) ?? 0 : 0;
    const discountCents = Math.min(disc, Math.max(gross, 0));
    const unit = typeof l.unit === 'string' && UNITS.includes(l.unit) ? (l.unit as ReceiptUnit) : undefined;
    const matchId = gross > 0 && typeof l.match === 'string' && known.has(l.match) ? l.match : null;
    lines.push({ text: t, qty, ...(unit ? { unit } : {}), grossCents: gross, discountCents, matchId });
  }
  if (!lines.length) return { kind: 'unreadable' };
  const receipt: Receipt = { lines };
  const store = text(o.store, MAX_STORE_TEXT);
  if (store) receipt.store = store;
  if (typeof o.date === 'string' && DATE_RE.test(o.date) && !Number.isNaN(Date.parse(o.date))) receipt.date = o.date;
  const tax = cents(o.tax, 0);
  if (tax !== null) receipt.taxCents = tax;
  const total = cents(o.total, 1);
  if (total !== null) receipt.totalCents = total;
  return { kind: 'ok', receipt };
}

/** The model's reply text to a checked result. */
export const receiptFromReply = (reply: unknown, known: ReadonlySet<string>): ReceiptResult => cleanReceipt(jsonFromReply(reply), known);

/** The route's answer as the app reads it, re-checked against the ids the app sent. */
export function cleanReceiptAnswer(body: unknown, known: ReadonlySet<string>): ReceiptResult {
  const result = obj(obj(body)?.result);
  if (!result || result.kind !== 'ok') return { kind: 'unreadable' };
  const r = obj(result.receipt);
  if (!r) return { kind: 'unreadable' };
  // The route sends net lines in the app's own shape; map them back to the model's field names for one validator.
  const lines = Array.isArray(r.lines) ? r.lines.map(x => { const l = obj(x) ?? {}; return { text: l.text, qty: l.qty, unit: l.unit, total: l.grossCents, discount: l.discountCents, match: l.matchId }; }) : [];
  return cleanReceipt({ store: r.store, date: r.date, lines, tax: r.taxCents, total: r.totalCents }, known);
}

/** What the request may say about the list: at most MAX_ITEMS_SENT items with an id and a name; anything else is dropped. Null when nothing usable is left. */
export function cleanItemRefs(v: unknown): ItemRef[] | null {
  if (!Array.isArray(v)) return null;
  const out: ItemRef[] = [];
  const seen = new Set<string>();
  for (const x of v.slice(0, MAX_ITEMS_SENT)) {
    const o = obj(x);
    const id = text(o?.id, 60), n = text(o?.n, 80);
    if (!o || !id || !n || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, n, ...(typeof o.unit === 'string' && UNITS.includes(o.unit) ? { unit: o.unit as ReceiptUnit } : {}) });
  }
  return out.length ? out : null;
}
