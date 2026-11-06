import express, { Router } from 'express';
import { sql, type Kysely } from 'kysely';
import { parseDay } from './backups.ts';
import { inUserTransaction } from './auth.ts';
import type { DB } from './db/types.ts';
import { isJpegBase64 } from '../src/shared/scan.ts';

// Saved receipt photos (brief receipt-save-photo): after Scan receipt the person may keep the picture. The app uploads it in a separate call after Apply,
// never before, and only when the box was ticked. Mounted at /api/receipts behind sign-in, requireAdmin and a per-user limit (app.ts). The photo is bytes in the
// person's own row (row-level security, like backup_snapshots), never logged, never cached, never sent anywhere else. Not synced data: no seq, history or tombstone.

/** Each account keeps at most this many receipts and bytes; past either, a save is refused (409) and nothing is deleted for them. */
export const MAX_RECEIPTS = 200;
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
/** One stored photo. The app sends a 2400 px JPEG of a few hundred kB; this stops a loop or a bad client. */
export const MAX_PHOTO_BYTES = 1024 * 1024;
/** Base64 of MAX_PHOTO_BYTES, rounded up to whole groups of four. */
export const MAX_PHOTO_BASE64 = Math.ceil(MAX_PHOTO_BYTES / 3) * 4;
export const BODY_LIMIT = '2mb';
export const MAX_NOTE = 200;
export const MAX_STORE = 60;
const MAX_TOTAL_CENTS = 10_000_000;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ID = /^\d{1,15}$/;

export interface NewReceipt {
  photo: Buffer;
  month: string;
  receiptDate: string | null;
  store: string;
  totalCents: number | null;
  note: string;
}

/** A trimmed string of at most `max` printable characters, or null when it is not one. */
// oxlint-disable-next-line no-control-regex
const text = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim().length <= max && !/[\x00-\x1f\x7f]/.test(v) ? v.trim() : null);

/** The note a person typed: at most 200 characters, newlines allowed out (one line). Null when it is not text or too long. */
export const cleanNote = (v: unknown): string | null => (v === undefined || v === null ? '' : text(v, MAX_NOTE));

/** Check the upload body. Returns the values to store, or why not (a message that says what to send). */
export function cleanReceipt(body: unknown): { ok: true; value: NewReceipt } | { ok: false; error: string } {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (!isJpegBase64(b.image, MAX_PHOTO_BASE64)) return { ok: false, error: 'send one JPEG photo as base64 in "image"' };
  const photo = Buffer.from(b.image, 'base64');
  if (photo.byteLength > MAX_PHOTO_BYTES || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) return { ok: false, error: 'send one JPEG photo as base64 in "image"' };
  if (typeof b.month !== 'string' || !MONTH.test(b.month)) return { ok: false, error: '"month" must be YYYY-MM' };
  let receiptDate: string | null = null;
  if (b.receiptDate !== undefined && b.receiptDate !== null) {
    receiptDate = parseDay(b.receiptDate);
    if (!receiptDate || receiptDate < '1970-01-01' || receiptDate > '2200-01-01') return { ok: false, error: '"receiptDate" must be YYYY-MM-DD or left out' };
  }
  const store = b.store === undefined || b.store === null ? '' : text(b.store, MAX_STORE);
  if (store === null) return { ok: false, error: `"store" must be text of at most ${MAX_STORE} characters` };
  let totalCents: number | null = null;
  if (b.totalCents !== undefined && b.totalCents !== null) {
    if (typeof b.totalCents !== 'number' || !Number.isInteger(b.totalCents) || b.totalCents < 0 || b.totalCents > MAX_TOTAL_CENTS) return { ok: false, error: '"totalCents" must be a whole number of cents or left out' };
    totalCents = b.totalCents;
  }
  const note = cleanNote(b.note);
  if (note === null) return { ok: false, error: `"note" must be text of at most ${MAX_NOTE} characters` };
  return { ok: true, value: { photo, month: b.month, receiptDate, store, totalCents, note } };
}

export interface ReceiptsDeps {
  db: Kysely<DB>;
}

interface Row { id: string; saved_at: string; month: string; receipt_date: string | null; store: string; total_cents: number | null; note: string; size_bytes: number }
const shape = (r: Row) => ({ id: r.id, savedAt: new Date(r.saved_at).toISOString(), month: r.month, receiptDate: r.receipt_date, store: r.store, totalCents: r.total_cents, note: r.note, sizeBytes: r.size_bytes });
const COLUMNS = sql`id, saved_at, month, to_char(receipt_date, 'YYYY-MM-DD') as receipt_date, store, total_cents, note, size_bytes`;

export function receiptsRoutes({ db }: ReceiptsDeps): Router {
  const router = Router();
  const gone = (res: express.Response) => void res.status(404).json({ ok: false, error: 'no such receipt' });

  // The saved receipts, newest first. No photos here: the list is text, a photo loads when one is opened.
  router.get('/', async (_req, res) => {
    const userId = String(res.locals.userId);
    const out = await inUserTransaction(db, userId, async trx => {
      const { rows } = await sql<Row>`select ${COLUMNS} from receipts order by saved_at desc, id desc limit ${MAX_RECEIPTS}`.execute(trx);
      const { rows: [sum] } = await sql<{ n: string; bytes: string }>`select count(*) as n, coalesce(sum(size_bytes), 0) as bytes from receipts`.execute(trx);
      return { receipts: rows.map(shape), count: Number(sum!.n), bytes: Number(sum!.bytes) };
    });
    res.json({ ok: true, ...out, maxReceipts: MAX_RECEIPTS, maxBytes: MAX_TOTAL_BYTES });
  });

  // Keep one photo. Its own larger body parser runs here, after sign-in, the admin check and the per-user limit (app.ts skips the 100 kb one for this path).
  router.post('/', express.json({ limit: BODY_LIMIT }), async (req, res) => {
    const clean = cleanReceipt(req.body);
    if (!clean.ok) return void res.status(422).json({ ok: false, error: clean.error });
    const v = clean.value;
    const userId = String(res.locals.userId);
    const saved = await inUserTransaction(db, userId, async trx => {
      // One save at a time per account, so two phones cannot both slip past the cap.
      await sql`select pg_advisory_xact_lock(${userId}::bigint)`.execute(trx);
      const { rows: [sum] } = await sql<{ n: string; bytes: string }>`select count(*) as n, coalesce(sum(size_bytes), 0) as bytes from receipts`.execute(trx);
      if (Number(sum!.n) >= MAX_RECEIPTS || Number(sum!.bytes) + v.photo.byteLength > MAX_TOTAL_BYTES) return null;
      const { rows } = await sql<Row>`
        insert into receipts (user_id, month, receipt_date, store, total_cents, note, size_bytes, data)
        values (${userId}::bigint, ${v.month}, ${v.receiptDate}::date, ${v.store}, ${v.totalCents}, ${v.note}, ${v.photo.byteLength}, ${v.photo})
        returning ${COLUMNS}`.execute(trx);
      return rows[0]!;
    });
    if (!saved) return void res.status(409).json({ ok: false, error: `You have ${MAX_RECEIPTS} saved receipts (or ${MAX_TOTAL_BYTES / 1024 / 1024} MB). Delete some to save more.`, why: 'cap' });
    res.status(201).json({ ok: true, receipt: shape(saved) });
  });

  // One photo, as the JPEG that was saved. The id is the caller's own row or nothing: row-level security hides every other account's.
  router.get('/:id/photo', async (req, res) => {
    const id = String(req.params.id);
    if (!ID.test(id)) return gone(res);
    const userId = String(res.locals.userId);
    const data = await inUserTransaction(db, userId, async trx => (await sql<{ data: Buffer }>`select data from receipts where id = ${id}::bigint`.execute(trx)).rows[0]?.data ?? null);
    if (!data) return gone(res);
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).type('image/jpeg').send(data);
  });

  // The note is the only thing that changes after saving.
  router.patch('/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!ID.test(id)) return gone(res);
    const note = cleanNote((req.body as { note?: unknown } | undefined)?.note);
    if (note === null || typeof (req.body as { note?: unknown } | undefined)?.note !== 'string') return void res.status(422).json({ ok: false, error: `"note" must be text of at most ${MAX_NOTE} characters` });
    const userId = String(res.locals.userId);
    const row = await inUserTransaction(db, userId, async trx => (await sql<Row>`update receipts set note = ${note} where id = ${id}::bigint returning ${COLUMNS}`.execute(trx)).rows[0] ?? null);
    if (!row) return gone(res);
    res.json({ ok: true, receipt: shape(row) });
  });

  router.delete('/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!ID.test(id)) return gone(res);
    const userId = String(res.locals.userId);
    const n = await inUserTransaction(db, userId, async trx => (await sql`delete from receipts where id = ${id}::bigint`.execute(trx)).numAffectedRows ?? 0n);
    if (!n) return gone(res);
    res.json({ ok: true });
  });

  return router;
}
