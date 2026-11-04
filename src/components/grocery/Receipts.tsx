import { useCallback, useEffect, useRef, useState } from 'react';
import { monthLabel } from '../../lib/grocery.js';
import { groupByMonth, listReceipts, receiptTitle, usageText, type SavedList, type SavedReceipt } from '../../lib/receiptsClient.js';
import { useAppStore } from '../../store/useAppStore.js';
import { goUp } from '../useRoute.js';
import './Receipts.css';

// The Receipts page (brief receipt-save-photo), #/daily/grocery/receipts: the photos kept after Scan receipt, newest month first, as plain text rows (no
// thumbnails, so opening the page loads no pictures). A row opens the viewer sheet (ReceiptViewer.tsx); the list is read from the server every time the page opens.
const WORDS = { offline: 'You are offline. Saved receipts need a connection.', unavailable: 'Could not load your saved receipts right now.' } as const;

export default function Receipts() {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; text: string } | { kind: 'ok'; data: SavedList }>({ kind: 'loading' });
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
  const open = (r: SavedReceipt) => useAppStore.getState().openModal({ type: 'receiptview', receipt: r, onChanged: changed(r.id) });
  return (
    <>
      <div className="rcspagehead">
        <button type="button" className="btn sm" id="rcs-back" onClick={() => goUp('daily/grocery/get')}>Back to groceries</button>
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
          {state.data.receipts.length === 0 ? (
            <p className="note" id="rcs-empty">No saved receipts yet. Tick Keep a copy of this photo when you scan one.</p>
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
