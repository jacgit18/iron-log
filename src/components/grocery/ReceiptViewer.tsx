import { useCallback, useEffect, useRef, useState } from 'react';
import { monthLabel } from '../../lib/grocery.js';
import { MAX_NOTE, downloadName, fetchPhoto, receiptTitle, removeReceipt, saveNote, type SavedReceipt } from '../../lib/receiptsClient.js';
import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.js';
import './Receipts.css';

// The saved-receipt viewer (brief receipt-save-photo): the photo, what was saved with it, an editable note, Download and Delete (asks first). The photo loads when
// the sheet opens and is shown from an object URL that is released when it closes; nothing is cached by the browser (the server answers no-store).
export default function ReceiptViewer() {
  const modal = useAppStore(s => s.modal);
  const closeModal = useAppStore(s => s.closeModal);
  const receipt = modal?.receipt as SavedReceipt | undefined;
  const onChanged = modal?.onChanged as ((r: SavedReceipt | null) => void) | undefined;
  const [row, setRow] = useState<SavedReceipt | undefined>(receipt);
  const [photo, setPhoto] = useState<{ kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; url: string; blob: Blob }>({ kind: 'loading' });
  const [note, setNote] = useState(receipt?.note ?? '');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = receipt?.id;
  const asked = useRef(0); // the newest photo request; a closed sheet or a Retry makes an older one stale, so it creates no object URL that nothing would release
  useEffect(() => () => { asked.current = -1; }, []);
  const load = useCallback(async () => {
    if (!id) return;
    const mine = ++asked.current;
    setPhoto({ kind: 'loading' });
    const blob = await fetchPhoto(id);
    if (asked.current !== mine) return;
    setPhoto(blob ? { kind: 'ok', url: URL.createObjectURL(blob), blob } : { kind: 'error' });
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const url = photo.kind === 'ok' ? photo.url : null;
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (!receipt || !row) return null;

  const save = async () => {
    setBusy(true); setMsg('');
    const r = await saveNote(row.id, note.trim());
    setBusy(false);
    if (!r.ok) { setMsg(r.reason === 'offline' ? 'You are offline. The note was not saved.' : 'Could not save the note.'); return; }
    setRow(r.receipt); setNote(r.receipt.note); onChanged?.(r.receipt); setMsg('Note saved.');
  };
  const del = async () => {
    setBusy(true); setMsg('');
    const r = await removeReceipt(row.id);
    setBusy(false);
    if (!r.ok) { setMsg(r.reason === 'offline' ? 'You are offline. The receipt was not deleted.' : 'Could not delete the receipt.'); return; }
    onChanged?.(null);
    closeModal();
  };
  return (
    <Sheet className="rcview">
      <h2 className="cond">Receipt</h2>
      <p className="rcmeta">
        <span>Store <b>{row.store || 'not read'}</b></span>
        <span>Dated <b>{row.receiptDate ?? 'no date'}</b></span>
        <span>Total <b>{receiptTitle({ ...row, store: '', receiptDate: null }).split(', ').pop()}</b></span>
        <span>Month <b>{monthLabel(row.month)}</b></span>
      </p>
      <div className="rcphoto">
        {photo.kind === 'loading' && <p className="note" role="status">Loading the photo...</p>}
        {photo.kind === 'error' && (
          <div role="alert">
            <p>Could not load the photo.</p>
            <button type="button" className="btn sm" id="rcv-retry" onClick={() => void load()}>Retry</button>
          </div>
        )}
        {photo.kind === 'ok' && <img src={photo.url} alt={`Photo of the receipt: ${receiptTitle(row)}`} />}
      </div>
      <label className="field" htmlFor="rcv-note">Note
        <textarea id="rcv-note" rows={2} maxLength={MAX_NOTE} value={note} onChange={e => { setNote(e.target.value.replace(/\s*\n\s*/g, ' ')); setMsg(''); }} />
        <small>{note.length} of {MAX_NOTE}</small>
      </label>
      {msg && <p className="note" role="status">{msg}</p>}
      {confirm ? (
        <div className="rcconfirm" role="group" aria-label="Delete this receipt?">
          <p>Delete this receipt and its photo? This cannot be undone.</p>
          <div className="actions">
            <button type="button" className="btn" id="rcv-keep" onClick={() => setConfirm(false)}>Keep it</button>
            <button type="button" className="btn primary" id="rcv-delete-yes" disabled={busy} onClick={() => void del()}>Delete</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button type="button" className="btn" id="rcv-close" onClick={closeModal}>Close</button>
          <button type="button" className="btn" id="rcv-save" disabled={busy || note.trim() === row.note} onClick={() => void save()}>Save note</button>
          {photo.kind === 'ok' && <a className="btn" id="rcv-download" href={photo.url} download={downloadName(row)}>Download</a>}
          <button type="button" className="btn" id="rcv-delete" disabled={busy} onClick={() => setConfirm(true)}>Delete this receipt</button>
        </div>
      )}
    </Sheet>
  );
}
