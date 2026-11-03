import { useEffect, useRef, useState } from 'react';
import { useFeature } from '../../features.js';
import { RECEIPT_TEXT, scanReceipt } from '../../lib/scanPhoto.js';
import type { ItemRef } from '../../shared/receipt.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Grocery } from '../../types.ts';
import Notice, { UNDO_MS } from '../Notice.js';
import './ReceiptScan.css';

// Scan receipt (brief receipt-scan): admin only. Two buttons (the camera, and the photo library: Android's photo picker offers no camera), the call to
// /api/scan/receipt, and the review sheet (ReceiptSheet.tsx, opened through the store's `modal`). Nothing is written until Apply in the sheet; the sheet hands
// back a one-step Undo, which this row shows because the sheet is closed by then.
export interface Applied { text: string; undo: () => void }

export default function ReceiptScan({ g, mk }: { g: Grocery; mk: string }) {
  const on = useFeature('scan');
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [applied, setApplied] = useState<(Applied & { mk: string; t: number }) | null>(null);
  if (!on || g.items.length === 0) return null;

  const scan = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true); setMsg(''); setApplied(null);
    const items: ItemRef[] = g.items.map(i => ({ id: i.id, n: i.n, ...(i.unit ? { unit: i.unit } : {}) }));
    const r = await scanReceipt(file, items);
    if (!mounted.current) return;
    setBusy(false);
    if (!r.ok) { setMsg(RECEIPT_TEXT[r.reason]); return; }
    if (r.result.kind !== 'ok') { setMsg(RECEIPT_TEXT.unreadable); return; }
    useAppStore.getState().openModal({ type: 'receipt', receipt: r.result.receipt, mk, onApplied: (a: Applied) => setApplied({ ...a, mk, t: Date.now() }) });
  };
  return (
    <div className="rcscan">
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Receipt camera" onChange={e => { void scan(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={library} type="file" accept="image/*" hidden aria-label="Receipt photo" onChange={e => { void scan(e.target.files?.[0]); e.target.value = ''; }} />
      <button type="button" className="btn sm" id="groc-scan" disabled={busy} onClick={() => camera.current?.click()}>{busy ? 'Reading receipt...' : 'Scan receipt'}</button>
      <button type="button" className="btn sm ghost" id="groc-scan-pick" disabled={busy} onClick={() => library.current?.click()}>Choose photo</button>
      {msg && <p className="note" role="status">{msg}</p>}
      {applied && applied.mk === mk && (
        <Notice kind="undo" expire={{ ms: UNDO_MS, onExpire: () => setApplied(null), key: applied.t }}
          actions={[{ label: 'Undo', onClick: () => { applied.undo(); setApplied(null); } }, { label: 'Dismiss', ghost: true, onClick: () => setApplied(null) }]}>{applied.text}</Notice>
      )}
    </div>
  );
}
