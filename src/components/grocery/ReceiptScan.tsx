import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { keepFailText, saveReceipt, type KeepMeta, type SaveFailure } from '../../lib/receiptsClient.js';
import { withoutUsed } from '../../lib/grocery.js';
import { applySavedNames } from '../../lib/groceryReceipt.js';
import { RECEIPT_TEXT, scanReceipt } from '../../lib/scanPhoto.js';
import { takeReadyResume } from '../../lib/sharingIntent.js';
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
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [applied, setApplied] = useState<(Applied & { mk: string; t: number }) | null>(null);
  const [kept, setKept] = useState<{ image: string; meta: KeepMeta; busy: boolean; fail: SaveFailure['reason'] | null } | null>(null);
  const months = useAppStore(s => s.groceryMonths);
  const canScan = withoutUsed(g, months).items.length > 0;

  // Uploads the photo kept in memory. On a failure the photo stays here for Try again until the notice is dismissed or the page closes.
  const keep = async (image: string, meta: KeepMeta) => {
    setKept({ image, meta, busy: true, fail: null });
    const r = await saveReceipt(image, meta);
    if (!mounted.current) return;
    if (r.ok) { setKept(null); setMsg('Photo saved. Find it under Receipts.'); return; }
    setKept({ image, meta, busy: false, fail: r.reason });
  };

  // Back from making a sharing group (brief receipt-share): the same receipt reopens with this screen's own callbacks, so Apply shows the Applied notice and its Undo.
  useEffect(() => {
    const back = takeReadyResume();
    if (!back) return;
    const image = typeof back.image === 'string' ? back.image : undefined;
    useAppStore.getState().openModal({ ...back, type: 'receipt', onApplied: (a: Applied) => setApplied({ ...a, mk: String(back.mk ?? mk), t: Date.now() }), onKeep: (meta: KeepMeta) => { if (image) void keep(image, meta); } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when Shopping opens

  const scan = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true); setMsg(''); setApplied(null); setKept(null);
    const lines = useAppStore.getState().groceryMonths[mk]?.lines ?? {}; // the items ticked this month go with `got`, so the scan prefers them for a close name (brief receipt-reconcile-ticked)
    const catalogue = withoutUsed(useAppStore.getState().grocery, useAppStore.getState().groceryMonths); // a used one-time item is not offered to the scan
    const items: ItemRef[] = catalogue.items.map(i => ({ id: i.id, n: i.n, ...(i.unit ? { unit: i.unit } : {}), ...(lines[i.id]?.got ? { got: true as const } : {}) }));
    const r = await scanReceipt(file, items);
    if (!mounted.current) return;
    setBusy(false);
    if (!r.ok) { setMsg(RECEIPT_TEXT[r.reason]); return; }
    if (r.result.kind !== 'ok') { setMsg(RECEIPT_TEXT.unreadable); return; }
    const { receipt, remembered } = applySavedNames(r.result.receipt, catalogue.items); // the person's saved receipt names win over the model's guess (brief receipt-rename-memory)
    useAppStore.getState().openModal({ type: 'receipt', receipt, remembered, mk, image: r.image, onApplied: (a: Applied) => setApplied({ ...a, mk, t: Date.now() }), onKeep: (meta: KeepMeta) => void keep(r.image, meta) });
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
  return { canScan, busy, inputs, notes, hasNotes, openCamera: () => camera.current?.click(), openLibrary: () => library.current?.click() };
}
export type ReceiptScanState = ReturnType<typeof useReceiptScan>;

/** Saved receipts as the entry of Shopping's More menu on a phone (the same button, id and gate as the row's). Picking a saved photo is in the Scan receipt chooser (brief receipt-pick-photo). */
export function ReceiptMenu({ r }: { r: ReceiptScanState }) {
  const shut = (e: MouseEvent<HTMLButtonElement>) => e.currentTarget.closest('details')?.removeAttribute('open'); // the menu closes when its receipt button is pressed, so it cannot sit over the page that opens next
  return <button type="button" className="btn sm ghost" id="groc-receipts" onClick={e => { shut(e); navigate('daily/grocery/receipts', 'push'); }}>Saved receipts</button>;
}

// Scan receipt opens a small chooser, Camera or Photos (brief receipt-pick-photo, owner picked option B from a preview): the camera input has `capture`, the library input has none, so Android's
// photo picker opens for Photos. The chooser closes on a pick, on Escape and on a second press of Scan receipt. On a phone it is the full-width row's second line; Saved receipts stays in More.
export default function ReceiptScan({ r, phone }: { r: ReceiptScanState; phone?: boolean }) {
  const [choosing, setChoosing] = useState(false);
  const scanBtn = useRef<HTMLButtonElement>(null);
  const open = choosing && r.canScan && !r.busy;
  if (phone && !r.canScan && !r.hasNotes) return null;
  const pick = (go: () => void) => { setChoosing(false); go(); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Escape' && open) { setChoosing(false); scanBtn.current?.focus(); } };
  return (
    <div className={phone ? 'rcscan rcphone' : 'rcscan'} onKeyDown={onKey}>
      {r.inputs}
      {r.canScan && <button type="button" ref={scanBtn} className="btn sm" id="groc-scan" disabled={r.busy} aria-expanded={open} aria-controls="groc-scan-choose" onClick={() => setChoosing(c => !c)}>{r.busy ? 'Reading receipt...' : 'Scan receipt'}</button>}
      {!phone && <ReceiptMenu r={r} />}
      {open && (
        <div className="rcchoose" id="groc-scan-choose" role="group" aria-label="Scan receipt from">
          <button type="button" className="btn sm" id="groc-scan-camera" autoFocus onClick={() => pick(r.openCamera)}>Camera</button>
          <button type="button" className="btn sm" id="groc-scan-pick" onClick={() => pick(r.openLibrary)}>Photos</button>
        </div>
      )}
      {r.notes}
    </div>
  );
}
