import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { fetchPhotoOnce, keepFailText, listReceipts, saveReceipt, updateReceipt, type KeepMeta, type SavedList, type SavedReceipt, type SaveFailure } from '../../lib/receiptsClient.js';
import { withoutUsed } from '../../lib/grocery.js';
import { applySavedNames } from '../../lib/groceryReceipt.js';
import { dropDraft, readDrafts, relinkDraft, type Draft } from '../../lib/receiptDraft.js';
import { applyChange, changeFailText, claimText, openGate, openText, readBlockedText, snapFailText, snapMeta, toLogRows, undoChange, withSnapped, withoutReceipt } from '../../lib/receiptToLog.js';
import { MAX_RECEIPT_SIDE, RECEIPT_TEXT, scanReceipt, shrinkToJpegBase64 } from '../../lib/scanPhoto.js';
import { takeReadyResume } from '../../lib/sharingIntent.js';
import type { ItemRef, Receipt } from '../../shared/receipt.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { Grocery } from '../../types.ts';
import Notice, { UNDO_MS } from '../Notice.js';
import { navigate } from '../useRoute.js';
import ReceiptResume from './ReceiptResume.js';
import ReceiptToLog from './ReceiptToLog.js';
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
  const snapInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [applied, setApplied] = useState<(Applied & { mk: string; t: number }) | null>(null);
  const [kept, setKept] = useState<{ image: string; meta: KeepMeta; busy: boolean; fail: SaveFailure['reason'] | null; snap?: boolean } | null>(null); // `snap`: a photo saved unread to To log (brief receipt-snap-now-log-later), not a copy kept after Apply
  const [saved, setSaved] = useState<SavedList | null>(null); // the account's saved receipts, text only; To log is the ones still waiting
  const [opening, setOpening] = useState<string | null>(null);
  const [openFail, setOpenFail] = useState<{ row: SavedReceipt; text: string } | null>(null); // Open could not check the receipt's status: a notice with Try again
  const refresh = async () => { const r = await listReceipts(); if (mounted.current && r.ok) setSaved(r); }; // a list that cannot load just leaves the card out
  const months = useAppStore(s => s.groceryMonths);
  const canScan = withoutUsed(g, months).items.length > 0;

  // A receipt left without Apply or Discard stays as a draft on this device for 7 days, up to 5 (briefs receipt-back-guard and receipt-drafts-list): the Drafts rows reopen the sheet with this screen's own callbacks.
  const readNow = () => ({ drafts: readDrafts(Date.now()), at: Date.now() });
  const [left, setLeft] = useState<{ drafts: Draft[]; at: number }>(readNow); // `at`: when it was read, for the age shown
  const drafts = left.drafts;
  const sheetOpen = useAppStore(s => s.modal?.type === 'receipt');
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, when Shopping opens
  useEffect(() => useAppStore.subscribe((s, p) => { if (p.modal?.type === 'receipt' && s.modal?.type !== 'receipt') setLeft(readNow()); }), []);
  useEffect(() => useAppStore.subscribe((s, p) => { const sheets = ['receipt', 'receiptlater']; if (sheets.includes(String(p.modal?.type)) && !sheets.includes(String(s.modal?.type))) void refresh(); }), []); // eslint-disable-line react-hooks/exhaustive-deps -- a receipt sheet just closed: Apply, Undo or Delete may have changed To log // eslint-disable-line react-hooks/exhaustive-deps -- the receipt sheet just closed: read what it left
  useEffect(() => { if (!left.drafts.length) return; const t = window.setInterval(() => setLeft(readNow()), 60_000); return () => window.clearInterval(t); }, [left.drafts.length]); // eslint-disable-line react-hooks/exhaustive-deps -- keeps the ages shown, and drops a row when its draft expires
  const resume = (id: string) => {
    const d = readDrafts(Date.now()).find(x => x.id === id); // read again: it may have expired or been used in another tab since the row was drawn
    if (!d) { setLeft(readNow()); return; }
    const st = useAppStore.getState();
    const r = relinkDraft(d, new Set(withoutUsed(st.grocery, st.groceryMonths).items.map(i => i.id))); // an item deleted since becomes "no match"
    st.openModal({ type: 'receipt', receipt: r.receipt, remembered: {}, mk: d.mk, restore: r.restore, draftId: d.id, relinked: r.n, onApplied: (a: Applied) => setApplied({ ...a, mk: d.mk, t: Date.now() }) });
  };

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

  // The list's items as the scan sees them for a month: the ones ticked this month go with `got`, so the scan prefers them for a close name (brief receipt-reconcile-ticked); a used one-time item is not offered.
  const scanItems = (month: string) => {
    const lines = useAppStore.getState().groceryMonths[month]?.lines ?? {};
    const catalogue = withoutUsed(useAppStore.getState().grocery, useAppStore.getState().groceryMonths);
    const items: ItemRef[] = catalogue.items.map(i => ({ id: i.id, n: i.n, ...(i.unit ? { unit: i.unit } : {}), ...(lines[i.id]?.got ? { got: true as const } : {}) }));
    return { catalogue, items };
  };

  // Snap & save (brief receipt-snap-now-log-later): shrink the photo and save it unread under To log. A failed save keeps the photo in memory for Try again, as Keep a copy does.
  const keepSnap = async (image: string, meta: KeepMeta) => {
    setKept({ image, meta, busy: true, fail: null, snap: true });
    const r = await saveReceipt(image, meta, 'to_log');
    if (!mounted.current) return;
    if (r.ok) { setKept(null); setMsg('Photo saved under To log. Open it later, on any device.'); setSaved(s => withSnapped(s, r.receipt)); return; }
    setKept({ image, meta, busy: false, fail: r.reason, snap: true });
  };
  const snap = async (file: File | undefined) => {
    if (!file || kept?.busy) return;
    setMsg(''); setApplied(null); setKept(null);
    let image: string;
    try { image = await shrinkToJpegBase64(file, MAX_RECEIPT_SIDE); } catch { setMsg(RECEIPT_TEXT.photo); return; }
    await keepSnap(image, snapMeta(mk));
  };

  // Open on a To log row: check it still waits (a second device may have applied or deleted it), load its photo, and show the unread sheet. Nothing is read or changed yet.
  const openRow = async (row: SavedReceipt) => {
    if (opening) return;
    setOpening(row.id); setMsg(''); setApplied(null); setOpenFail(null);
    const [l, blob] = await Promise.all([listReceipts(), fetchPhotoOnce(row.id).then(o => (o.ok ? o.blob : null))]);
    if (!mounted.current) return;
    setOpening(null);
    if (l.ok) setSaved(l);
    const state = openGate(l, row.id); // a status that could not be checked never opens: an already-logged or deleted receipt would open
    if (state === 'unchecked' || state === 'offline') { setOpenFail({ row, text: openText[state] }); return; }
    if (state !== 'ready') { setMsg(openText[state]); return; }
    if (!blob) { setMsg(openText.photo); return; }
    useAppStore.getState().openModal({ type: 'receiptlater', receipt: row, blob, onChanged: (x: SavedReceipt | null) => { if (!x) setSaved(l => withoutReceipt(l, row.id)); }, onRead: () => readSaved(row, blob) });
  };
  // Read this receipt: the same scan as Scan receipt, on the saved photo, then the review sheet. Apply updates the saved row (no second upload); Undo puts it back under To log.
  const readSaved = async (row: SavedReceipt, blob: Blob): Promise<string | null> => {
    const { catalogue, items } = scanItems(row.month);
    const blocked = readBlockedText(useAppStore.getState().blocked()); // data still loading would send no items and match nothing; an empty loaded list is fine
    if (blocked) return blocked;
    const r = await scanReceipt(blob, items, undefined, { asIs: true }); // the saved JPEG goes as it is: no second re-encode per Read
    if (!r.ok) return RECEIPT_TEXT[r.reason];
    if (r.result.kind !== 'ok') return RECEIPT_TEXT.unreadable;
    const { receipt, remembered } = applySavedNames(r.result.receipt, catalogue.items);
    // Apply claims the saved row first (only if it still waits), so a second device that applied earlier stops this one before any price is written; any other failure lets Apply go on and says so.
    const claim = async (done: Receipt): Promise<string | null> => {
      const u = await updateReceipt(row.id, applyChange(done, row.month));
      if (u.ok) { void refresh(); return null; }
      if (u.reason === 'taken' || u.reason === 'gone') { void refresh(); return claimText[u.reason]; }
      setMsg(changeFailText(u.reason, 'apply'));
      return null;
    };
    const release = async () => { const u = await updateReceipt(row.id, undoChange); void refresh(); if (!u.ok && u.reason !== 'taken') setMsg('Nothing was applied, but the saved receipt could not be put back under To log. It may show as logged until you restore it from Saved receipts.'); }; // Apply stopped after the claim (the store could not be made): the row goes back to waiting
    const unlog = async () => { const u = await updateReceipt(row.id, undoChange); if (!u.ok) setMsg(changeFailText(u.reason, 'undo')); void refresh(); };
    useAppStore.getState().openModal({ type: 'receipt', receipt, remembered, mk: row.month, toLogId: row.id, photo: blob, onClaim: claim, onRelease: release, onApplied: (a: Applied) => setApplied({ ...a, undo: () => { a.undo(); void unlog(); }, mk, t: Date.now() }) }); // the notice belongs to the month on screen, so a receipt snapped in another month still shows its Undo
    return null;
  };

  const scan = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true); setMsg(''); setApplied(null); setKept(null);
    const { catalogue, items } = scanItems(mk);
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
      {drafts.length > 0 && !sheetOpen && <ReceiptResume drafts={drafts} now={left.at} onResume={resume} onDiscard={id => { dropDraft(id); setLeft(readNow()); }} />}
      <ReceiptToLog rows={toLogRows(saved?.receipts ?? [])} opening={opening} onOpen={row => void openRow(row)} onDeleted={id => setSaved(l => withoutReceipt(l, id))} />
      {msg && <p className="note" role="status">{msg}</p>}
      {openFail && <Notice kind="warning" actions={[{ label: 'Try again', onClick: () => void openRow(openFail.row) }, { label: 'Dismiss', ghost: true, onClick: () => setOpenFail(null) }]}>{openFail.text}</Notice>}
      {kept && (kept.busy ? <p className="note" role="status">Saving the photo...</p> : (
        <Notice kind="warning" actions={[kept.fail === 'cap'
          ? { label: 'Open Receipts', onClick: () => { setKept(null); navigate('daily/grocery/receipts', 'push'); } }
          : { label: 'Try again', onClick: () => void (kept.snap ? keepSnap(kept.image, kept.meta) : keep(kept.image, kept.meta)) },
        { label: 'Dismiss', ghost: true, onClick: () => setKept(null) }]}>{kept.snap ? snapFailText(kept.fail ?? 'unavailable', saved ?? undefined) : keepFailText(kept.fail ?? 'unavailable')}</Notice>
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
      {canScan && <input ref={snapInput} type="file" accept="image/*" capture="environment" hidden aria-label="Snap and save camera" onChange={e => { void snap(e.target.files?.[0]); e.target.value = ''; }} />}
    </>
  );
  const hasNotes = !!openFail || drafts.length > 0 || toLogRows(saved?.receipts ?? []).length > 0 || !!msg || !!kept || (!!applied && applied.mk === mk);
  return { canScan, busy, inputs, notes, hasNotes, openCamera: () => camera.current?.click(), openLibrary: () => library.current?.click(), openSnap: () => snapInput.current?.click() };
}
export type ReceiptScanState = ReturnType<typeof useReceiptScan>;

/** Saved receipts as the entry of Shopping's More menu on a phone (the same button, id and gate as the row's). Picking a saved photo is in the Scan receipt chooser (brief receipt-pick-photo). */
export function ReceiptMenu() {
  const shut = (e: MouseEvent<HTMLButtonElement>) => e.currentTarget.closest('details')?.removeAttribute('open'); // the menu closes when its receipt button is pressed, so it cannot sit over the page that opens next
  return <button type="button" className="btn sm ghost" id="groc-receipts" onClick={e => { shut(e); navigate('daily/grocery/receipts', 'push'); }}>Saved receipts</button>;
}

// Scan receipt opens a small chooser, Camera or Photos (brief receipt-pick-photo, owner picked option B from a preview): the camera input has `capture`, the library input has none, so Android's
// photo picker opens for Photos. The chooser closes on a pick (focus goes back to Scan receipt, so it is not lost when the pressed button unmounts), on Escape (that key stops here and does not
// reach App's global close), on a second press of Scan receipt, on a tap outside the row and when focus leaves it. It also shuts when scanning becomes unavailable or starts, so it never reopens by itself.
// On a phone it is the full-width row's second line; Saved receipts stays in More.
export default function ReceiptScan({ r, phone }: { r: ReceiptScanState; phone?: boolean }) {
  const [choosing, setChoosing] = useState(false);
  const scanBtn = useRef<HTMLButtonElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const open = choosing && r.canScan && !r.busy;
  if (choosing && (!r.canScan || r.busy)) setChoosing(false); // adjusting state while rendering: it shuts when scanning is unavailable or starts, so it cannot reopen by itself
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!row.current?.contains(e.target as Node)) setChoosing(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  if (phone && !r.canScan && !r.hasNotes) return null;
  const pick = (go: () => void) => { setChoosing(false); scanBtn.current?.focus(); go(); };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setChoosing(false); scanBtn.current?.focus(); } };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => { if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setChoosing(false); };
  return (
    <div ref={row} className={phone ? 'rcscan rcphone' : 'rcscan'} onKeyDown={onKey} onBlur={onBlur}>
      {r.inputs}
      {r.canScan && <button type="button" ref={scanBtn} className="btn sm" id="groc-scan" disabled={r.busy} aria-expanded={open} aria-controls={open ? 'groc-scan-choose' : undefined} onClick={() => setChoosing(c => !c)}>{r.busy ? 'Reading receipt...' : 'Scan receipt'}</button>}
      {!phone && <ReceiptMenu />}
      {open && (
        <div className="rcchoose" id="groc-scan-choose" role="group" aria-label="Scan receipt from">
          <button type="button" className="btn sm" id="groc-scan-camera" autoFocus onClick={() => pick(r.openCamera)}>Camera</button>
          <button type="button" className="btn sm" id="groc-scan-pick" onClick={() => pick(r.openLibrary)}>Photos</button>
          <button type="button" className="btn sm" id="groc-scan-snap" onClick={() => pick(r.openSnap)}>Snap &amp; save</button>
          <p className="note rcsnaphint">Snap &amp; save keeps the photo to read later, on any device.</p>
        </div>
      )}
      {r.notes}
    </div>
  );
}
