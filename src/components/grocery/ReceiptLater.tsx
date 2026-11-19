import { useEffect, useRef, useState } from 'react';
import { monthLabel } from '../../lib/grocery.js';
import { removeReceipt, type SavedReceipt } from '../../lib/receiptsClient.js';
import { toLogTitle } from '../../lib/receiptToLog.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './Receipts.css';
import './ReceiptToLog.css';

// The unread receipt (brief receipt-snap-now-log-later): a saved photo opened from To log, before anything is read. It shows the photo; Read this receipt runs the scan on it (Scan receipt's
// `onRead`, which replaces this sheet with the review sheet); nothing on the list or its prices changes before Apply there. Delete asks first and removes the stored photo too.
export default function ReceiptLater() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const receipt = modal?.receipt as SavedReceipt | undefined;
  const blob = modal?.blob as Blob | undefined;
  const onRead = modal?.onRead as (() => Promise<string | null>) | undefined;
  const onChanged = modal?.onChanged as ((r: SavedReceipt | null) => void) | undefined;
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!receipt) return null;
  const title = toLogTitle(receipt);
  const read = async () => {
    setBusy(true); setMsg('');
    const err = await onRead?.();
    if (!mounted.current) return;
    setBusy(false);
    if (err) setMsg(err);
  };
  const del = async () => {
    setBusy(true); setMsg('');
    const r = await removeReceipt(receipt.id);
    if (!mounted.current) return;
    setBusy(false);
    if (!r.ok) { setMsg(r.reason === 'offline' ? 'You are offline. The receipt was not deleted.' : 'Could not delete the receipt.'); return; }
    onChanged?.(null);
    closeModal();
  };
  return (
    <Sheet className="rcview rclater">
      <h2 className="cond">Receipt to log</h2>
      <p className="rcmeta"><span>Saved <b>{title}</b></span><span>Month <b>{monthLabel(receipt.month)}</b></span></p>
      <div className="rcphoto">{url ? <img src={url} alt={`Photo of the receipt ${title}`} /> : <p className="note" role="status">Loading the photo...</p>}</div>
      <p className="note">Nothing on your list changes until you read this receipt and press Apply.</p>
      {msg && <p className="note rcwarn" role="alert">{msg}</p>}
      {confirm ? (
        <div className="rcconfirm" role="group" aria-label="Delete this receipt?">
          <p>Delete this receipt and its photo? This cannot be undone.</p>
          <div className="actions">
            <button type="button" className="btn" id="rcl-keep" onClick={() => setConfirm(false)}>Keep it</button>
            <button type="button" className="btn primary" id="rcl-delete-yes" disabled={busy} onClick={() => void del()}>Delete</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button type="button" className="btn" id="rcl-close" onClick={closeModal}>Close</button>
          <button type="button" className="btn" id="rcl-delete" disabled={busy} onClick={() => setConfirm(true)}>Delete this receipt</button>
          <button type="button" className="btn primary" id="rcl-read" disabled={busy || !url} onClick={() => void read()}>{busy ? 'Reading receipt...' : 'Read this receipt'}</button>
        </div>
      )}
    </Sheet>
  );
}
