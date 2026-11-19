import { useEffect, useRef, useState } from 'react';
import { fetchPhoto, removeReceipt, type SavedReceipt } from '../../lib/receiptsClient.js';
import { thumbIds, toLogTitle } from '../../lib/receiptToLog.js';
import './ReceiptToLog.css';

// The To log card on Shopping (brief receipt-snap-now-log-later, owner picked option I from a preview): the receipts snapped and saved unread, one row each with a small photo,
// on any device signed in to the account. Open reads it in the receipt sheet (Scan receipt's `onOpen`); Delete asks first. The list is text from the server; only the first rows
// load a small photo, one at a time, and the object URLs are released when a row leaves or the card closes.
export default function ReceiptToLog({ rows, opening, onOpen, onDeleted }: { rows: SavedReceipt[]; opening: string | null; onOpen: (r: SavedReceipt) => void; onDeleted: (id: string) => void }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const cache = useRef(new Map<string, string>());
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const want = thumbIds(rows).join(',');
  useEffect(() => {
    let live = true;
    const ids = want ? want.split(',') : [];
    for (const [id, url] of cache.current) if (!ids.includes(id)) { URL.revokeObjectURL(url); cache.current.delete(id); }
    void (async () => {
      for (const id of ids) {
        if (!live) return;
        if (cache.current.has(id)) continue;
        const blob = await fetchPhoto(id);
        if (!live) return;
        if (blob) cache.current.set(id, URL.createObjectURL(blob));
      }
      if (live) setThumbs(Object.fromEntries(cache.current));
    })();
    return () => { live = false; };
  }, [want]);
  useEffect(() => () => { for (const url of cache.current.values()) URL.revokeObjectURL(url); cache.current.clear(); }, []);
  const del = async (r: SavedReceipt) => {
    setBusy(r.id); setMsg('');
    const out = await removeReceipt(r.id);
    setBusy(null);
    if (!out.ok) { setMsg(out.reason === 'offline' ? 'You are offline. The receipt was not deleted.' : 'Could not delete the receipt.'); return; }
    setConfirm(null); onDeleted(r.id);
  };
  if (rows.length === 0) return null;
  return (
    <div className="rctolog" id="groc-tolog" role="group" aria-label="Receipts to log">
      <p className="rctologhead"><b>{`To log (${rows.length})`}</b><span className="rcpill">New</span><span>Snapped and saved. Open one to read it.</span></p>
      <ul className="rctologlist">
        {rows.map(r => {
          const title = toLogTitle(r);
          const url = thumbs[r.id];
          return (
            <li key={r.id} className="rctologrow" data-receipt={r.id}>
              <span className="rctologthumb" aria-hidden="true">{url && <img src={url} alt="" />}</span>
              <span className="rctologwhat"><b>{title}</b><small>{r.month}</small></span>
              {confirm === r.id ? (
                <span className="rctologbtns" role="group" aria-label={`Delete ${title}?`}>
                  <button type="button" className="btn sm" onClick={() => setConfirm(null)}>Keep it</button>
                  <button type="button" className="btn sm primary rctologdelyes" disabled={busy === r.id} onClick={() => void del(r)}>Delete for good</button>
                </span>
              ) : (
                <span className="rctologbtns">
                  <button type="button" className="btn sm primary rctologopen" disabled={opening !== null} onClick={() => onOpen(r)}>{opening === r.id ? 'Opening...' : 'Open'}</button>
                  <button type="button" className="btn sm rctologdel" disabled={opening !== null} onClick={() => setConfirm(r.id)}>Delete</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {msg && <p className="note rcwarn" role="alert">{msg}</p>}
    </div>
  );
}
