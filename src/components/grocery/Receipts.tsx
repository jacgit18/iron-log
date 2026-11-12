import { useCallback, useEffect, useRef, useState } from 'react';
import { monthLabel } from '../../lib/grocery.js';
import { fetchPhoto, groupByMonth, listReceipts, receiptTitle, usageText, type SavedList, type SavedReceipt } from '../../lib/receiptsClient.js';
import { receiptsZip } from '../../lib/receiptsExport.js';
import { useAppStore } from '../../store/useAppStore.js';
import EmptyState from '../EmptyState.jsx';
import { goUp } from '../useRoute.js';
import './Receipts.css';

// The Receipts page (brief receipt-save-photo), #/daily/grocery/receipts: the photos kept after Scan receipt, newest month first, as plain text rows (no
// thumbnails, so opening the page loads no pictures). A row opens the viewer sheet (ReceiptViewer.tsx); the list is read from the server every time the page opens.
const allWords = (skipped: number) => (skipped ? `Downloaded. ${skipped} ${skipped === 1 ? 'photo' : 'photos'} could not be loaded and ${skipped === 1 ? 'is' : 'are'} left out; ${skipped === 1 ? 'it is' : 'they are'} still saved. Try again for ${skipped === 1 ? 'it' : 'those'}.` : 'Downloaded all your saved receipts.');
const WORDS = { offline: 'You are offline. Saved receipts need a connection.', unavailable: 'Could not load your saved receipts right now.' } as const;

export default function Receipts() {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; text: string } | { kind: 'ok'; data: SavedList }>({ kind: 'loading' });
  const [all, setAll] = useState<{ busy: boolean; text: string }>({ busy: false, text: '' }); // Download all: the photos are fetched one at a time, then zipped in the browser
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const r = await listReceipts();
    if (!mounted.current) return;
    setState(r.ok ? { kind: 'ok', data: r } : { kind: 'error', text: WORDS[r.reason] });
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The viewer reports a changed note (the new row) or a deleted receipt (null): the list follows without another fetch.
  const changed = (id: string) => (row: SavedReceipt | null) => setState(s => {
    if (s.kind !== 'ok') return s;
    const receipts = row ? s.data.receipts.map(x => (x.id === id ? row : x)) : s.data.receipts.filter(x => x.id !== id);
    return { kind: 'ok', data: { ...s.data, receipts, count: receipts.length, bytes: row ? s.data.bytes : s.data.bytes - (s.data.receipts.find(x => x.id === id)?.sizeBytes ?? 0) } };
  });
  const downloadAll = async (list: SavedReceipt[]) => {
    const photos = new Map<string, Uint8Array>();
    for (const [i, r] of list.entries()) {
      setAll({ busy: true, text: `Getting photo ${i + 1} of ${list.length}...` });
      const blob = await fetchPhoto(r.id, true); // patient: the per-minute limit is waited out, not counted as a missing photo
      if (!mounted.current) return;
      if (blob) photos.set(r.id, new Uint8Array(await blob.arrayBuffer()));
    }
    const { zip, skipped } = receiptsZip(list, photos);
    const url = URL.createObjectURL(new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }));
    const a = document.createElement('a'); a.href = url; a.download = `receipts-${new Date().toLocaleDateString('en-CA')}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setAll({ busy: false, text: allWords(skipped) });
  };
  const open = (r: SavedReceipt) => useAppStore.getState().openModal({ type: 'receiptview', receipt: r, onChanged: changed(r.id) });
  return (
    <>
      <div className="rcspagehead">
        <button type="button" className="btn sm" id="rcs-back" onClick={() => goUp('daily/grocery/shopping')}>Back to groceries</button>
        <h2 id="rcs-h">Saved receipts</h2>
      </div>
      {state.kind === 'loading' && <p className="note" role="status">Loading...</p>}
      {state.kind === 'error' && (
        <div className="rcsempty" role="alert">
          <p>{state.text}</p>
          <button type="button" className="btn sm" id="rcs-retry" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {state.kind === 'ok' && (
        <>
          <p className="note" id="rcs-usage">{usageText(state.data)}</p>
          {state.data.receipts.length > 0 && (
            <div className="rcsall">
              <button type="button" className="btn sm" id="rcs-all" disabled={all.busy} onClick={() => void downloadAll(state.data.receipts)}>Download all</button>
              {all.text && <span className="note" id="rcs-all-note" role="status">{all.text}</span>}
            </div>
          )}
          {state.data.receipts.length === 0 ? (
            <EmptyState id="rcs-empty">No saved receipts yet. When you scan a receipt, tick Keep a copy of this photo and it shows up here.</EmptyState>
          ) : groupByMonth(state.data.receipts).map(g => (
            <section key={g.month} className="rcsgroup" aria-labelledby={`rcs-m-${g.month}`}>
              <h3 id={`rcs-m-${g.month}`}>{monthLabel(g.month)}</h3>
              <ul className="rcslist">
                {g.receipts.map(r => (
                  <li key={r.id}>
                    <button type="button" className="rcsrow" onClick={() => open(r)}>
                      <span>{receiptTitle(r)}</span>
                      {r.note && <small>{r.note}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
