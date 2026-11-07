import { useEffect, useRef, useState } from 'react';
import { useFeature } from '../../features.js';
import { keepFailText, saveReceipt, type KeepMeta, type SaveFailure } from '../../lib/receiptsClient.js';
import { RECEIPT_TEXT, scanReceipt } from '../../lib/scanPhoto.js';
import type { ItemRef } from '../../shared/receipt.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Grocery } from '../../types.ts';
import Notice, { UNDO_MS } from '../Notice.js';
import { navigate } from '../useRoute.js';
import './ReceiptScan.css';

// Scan receipt (brief receipt-scan): admin only. Two buttons (the camera, and the photo library: Android's photo picker offers no camera), the call to
// /api/scan/receipt, and the review sheet (ReceiptSheet.tsx, opened through the store's `modal`). Nothing is written until Apply in the sheet; the sheet hands
// back a one-step Undo, which this row shows because the sheet is closed by then.
// Keep a copy of the photo (brief receipt-save-photo): the shrunk photo stays in memory while the sheet is open; only when the person ticks the box and presses
// Apply does the sheet hand it to `onKeep`, which uploads it here in a separate call. A failed save leaves the prices applied and a notice with Try again.
export interface Applied { text: string; undo: () => void }

export function useReceiptScan(g: Grocery, mk: string) {
  const on = useFeature('scan');
  const keepOn = useFeature('receipts');
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [applied, setApplied] = useState<(Applied & { mk: string; t: number }) | null>(null);
  const [kept, setKept] = useState<{ image: string; meta: KeepMeta; busy: boolean; fail: SaveFailure['reason'] | null } | null>(null);
  const canScan = on && g.items.length > 0;

  // Uploads the photo kept in memory. On a failure the photo stays here for Try again until the notice is dismissed or the page closes.
  const keep = async (image: string, meta: KeepMeta) => {
    setKept({ image, meta, busy: true, fail: null });
    const r = await saveReceipt(image, meta);
    if (!mounted.current) return;
    if (r.ok) { setKept(null); setMsg('Photo saved. Find it under Receipts.'); return; }
    setKept({ image, meta, busy: false, fail: r.reason });
  };

  const scan = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true); setMsg(''); setApplied(null); setKept(null);
    const lines = useAppStore.getState().groceryMonths[mk]?.lines ?? {}; // the items ticked this month go with `got`, so the scan prefers them for a close name (brief receipt-reconcile-ticked)
    const items: ItemRef[] = g.items.map(i => ({ id: i.id, n: i.n, ...(i.unit ? { unit: i.unit } : {}), ...(lines[i.id]?.got ? { got: true as const } : {}) }));
    const r = await scanReceipt(file, items);
    if (!mounted.current) return;
    setBusy(false);
    if (!r.ok) { setMsg(RECEIPT_TEXT[r.reason]); return; }
    if (r.result.kind !== 'ok') { setMsg(RECEIPT_TEXT.unreadable); return; }
    useAppStore.getState().openModal({ type: 'receipt', receipt: r.result.receipt, mk, image: keepOn ? r.image : null, onApplied: (a: Applied) => setApplied({ ...a, mk, t: Date.now() }), onKeep: (meta: KeepMeta) => void keep(r.image, meta) });
  };
  const notes = (
    <>
      {msg && <p className="note" role="status">{msg}</p>}
      {kept && (kept.busy ? <p className="note" role="status">Saving the photo...</p> : (
        <Notice kind="warning" actions={[kept.fail === 'cap'
          ? { label: 'Open Receipts', onClick: () => { setKept(null); navigate('daily/grocery/receipts', 'push'); } }
          : { label: 'Try again', onClick: () => void keep(kept.image, kept.meta) },
        { label: 'Dismiss', ghost: true, onClick: () => setKept(null) }]}>{keepFailText(kept.fail ?? 'unavailable')}</Notice>
      ))}
      {applied && applied.mk === mk && (
        <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: () => setApplied(null), key: applied.t }}
          actions={[{ label: 'Undo', onClick: () => { applied.undo(); setApplied(null); } }, { label: 'Dismiss', ghost: true, onClick: () => setApplied(null) }]}>{applied.text}</Notice>
      )}
    </>
  );
  const inputs = (
    <>
      {canScan && <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Receipt camera" onChange={e => { void scan(e.target.files?.[0]); e.target.value = ''; }} />}
      {canScan && <input ref={library} type="file" accept="image/*" hidden aria-label="Receipt photo" onChange={e => { void scan(e.target.files?.[0]); e.target.value = ''; }} />}
    </>
  );
  const hasNotes = !!msg || !!kept || (!!applied && applied.mk === mk);
  return { canScan, keepOn, busy, inputs, notes, hasNotes, openCamera: () => camera.current?.click(), openLibrary: () => library.current?.click() };
}
export type ReceiptScanState = ReturnType<typeof useReceiptScan>;

/** Pick from photos and Saved receipts as the entries of Shopping's More menu on a phone (the same buttons, ids and gates as the row's). */
export function ReceiptMenu({ r }: { r: ReceiptScanState }) {
  return (
    <>
      {r.canScan && <button type="button" className="btn sm ghost" id="groc-scan-pick" disabled={r.busy} onClick={r.openLibrary}>Pick from photos</button>}
      {r.keepOn && <button type="button" className="btn sm ghost" id="groc-receipts" onClick={() => navigate('daily/grocery/receipts', 'push')}>Saved receipts</button>}
    </>
  );
}

// `phone`: only Scan receipt shows here, full width; Pick from photos and Saved receipts are in the More menu (ReceiptMenu) and their notices still show under it.
export default function ReceiptScan({ r, phone }: { r: ReceiptScanState; phone?: boolean }) {
  if (!r.canScan && !r.keepOn) return null;
  if (phone && !r.canScan && !r.hasNotes) return null;
  return (
    <div className={phone ? 'rcscan rcphone' : 'rcscan'}>
      {r.inputs}
      {r.canScan && <button type="button" className="btn sm" id="groc-scan" disabled={r.busy} onClick={r.openCamera}>{r.busy ? 'Reading receipt...' : 'Scan receipt'}</button>}
      {!phone && <ReceiptMenu r={r} />}
      {r.notes}
    </div>
  );
}
