import { useEffect, useRef, useState } from 'react';
import { fetchPhotoOnce, removeReceipt, type SavedReceipt } from '../../lib/receiptsClient.js';
import { claimLoads, holdLeft, markMissed, stillWanted, thumbIds, thumbState, toLogTitle } from '../../lib/receiptToLog.js';
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
  const [missed, setMissed] = useState<Record<string, number>>({}); // a photo that did not load: when another try may go (a refused load waits out Retry-After; any other failure may retry now)
  const [now, setNow] = useState(() => Date.now());
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  // One photo at a time. A refused load (429) stops the run: the rest are marked as waiting for the same time, so nothing hammers the 30 a minute limit.
  const blockedUntil = useRef(0); // set by a refused load (429): every run, including one started later by a changed list, waits it out
  const wantNow = useRef('');
  const inFlight = useRef(new Set<string>()); // a changed list starts a second run while the first awaits: one fetch per id
  const load = async (all: string[]) => {
    const ids = claimLoads(all, cache.current, inFlight.current);
    for (const [i, id] of ids.entries()) {
      if (!live.current) return;
      const held = holdLeft(Date.now(), blockedUntil.current);
      if (held > 0) { setNow(Date.now()); setMissed(m => ({ ...m, ...markMissed(ids, i, 'limit', Date.now(), held) })); for (const rest of ids.slice(i)) inFlight.current.delete(rest); break; }
      const out = await fetchPhotoOnce(id);
      inFlight.current.delete(id);
      if (!live.current) return;
      if (out.ok) {
        if (!stillWanted(wantNow.current, id)) continue; // the row left while its photo was loading: nothing to keep
        const old = cache.current.get(id);
        if (old) URL.revokeObjectURL(old);
        cache.current.set(id, URL.createObjectURL(out.blob));
        setMissed(m => { const { [id]: _gone, ...rest } = m; return rest; });
        continue;
      }
      setNow(Date.now());
      const wait = out.reason === 'limit' ? out.waitMs : 0;
      setMissed(m => ({ ...m, ...markMissed(ids, i, out.reason, Date.now(), wait) }));
      if (out.reason === 'limit') { blockedUntil.current = Date.now() + out.waitMs; for (const rest of ids.slice(i + 1)) inFlight.current.delete(rest); break; }
    }
    if (live.current) setThumbs(Object.fromEntries(cache.current));
  };
  useEffect(() => {
    wantNow.current = want;
    const ids = want ? want.split(',') : [];
    for (const [id, url] of cache.current) if (!ids.includes(id)) { URL.revokeObjectURL(url); cache.current.delete(id); }
    void load(ids);
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps -- load reads refs and setters only
  const nextTry = Math.min(Infinity, ...Object.values(missed).filter(t => t > now));
  useEffect(() => {
    if (!Number.isFinite(nextTry)) return;
    const t = window.setTimeout(() => setNow(Date.now()), Math.max(0, nextTry - Date.now()) + 50);
    return () => window.clearTimeout(t);
  }, [nextTry]);
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
          const ts = thumbState(url, missed[r.id], now);
          return (
            <li key={r.id} className="rctologrow" data-receipt={r.id}>
              <span className="rctologthumb" aria-hidden="true">{url && <img src={url} alt="" />}</span>
              <span className="rctologwhat"><b>{title}</b><small>{r.month}</small>{(ts === 'wait' || ts === 'retry') && <button type="button" className="btn sm ghost rctologretry" disabled={ts === 'wait'} onClick={() => void load([r.id])}>{ts === 'wait' ? 'Photo busy, retry soon' : 'Retry photo'}</button>}</span>
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
