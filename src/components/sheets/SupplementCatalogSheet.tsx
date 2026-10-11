import type { CatalogItem } from '../../types.ts';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { searchCatalog, type CatalogSearchResult } from '../../sync/catalog.js';
import { signIn as devHeaders } from '../../sync/devUser.js';
import Sheet from '../Sheet.jsx';

type Found = { items: CatalogItem[]; more: boolean } | { failed: Exclude<CatalogSearchResult, { ok: true }>['reason'] } | null;
const WAIT_MS = 300;

// Search the supplement catalog (NIH DSLD brand products, ADR 029) and add one to your library. About 120,000 products, so the server
// searches: you type at least two letters, it answers 30 at a time. Name and brand only: the dose you take is yours to type.
export default function SupplementCatalogSheet() {
  const items = useAppStore(s => s.supp.items);
  const { addCatalogSupplement, closeModal } = useAppStore.getState();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found>(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const asked = useRef(0); // the newest search; an older answer arriving late is dropped

  const run = (words: string, offset: number) => {
    const n = ++asked.current;
    setBusy(true);
    void searchCatalog(words, offset, devHeaders).then(r => {
      if (n !== asked.current) return;
      setBusy(false);
      if (!r.ok) { setFound({ failed: r.reason }); return; }
      // Show more asks for the next page (offset = how many are shown) and appends it.
      setFound(f => ({ items: offset && f && 'items' in f ? [...f.items, ...r.items] : r.items, more: r.more }));
    });
  };
  useEffect(() => {
    const words = q.trim();
    if (words.length < 2) { asked.current++; return; }
    const t = setTimeout(() => run(words, 0), WAIT_MS);
    return () => clearTimeout(t);
  }, [q]);

  const short = q.trim().length < 2;
  const list = !short && found && 'items' in found ? found : null;
  // The store call stays outside the state updater: React may run an updater twice, which would add and then refuse a duplicate.
  const add = (it: CatalogItem) => { const err = addCatalogSupplement(it) || ''; setErrs(e => ({ ...e, [it.id]: err })); };

  return (
    <Sheet className="catalog">
      <h2 className="cond">Supplement catalog</h2>
      <p className="note">Find a product and add it to your library (Library only; edit it to schedule it). Name and brand come from the label database; the dose is yours to add.</p>
      <div className="filterbar" role="search">
        <label className="field">Search<input type="search" value={q} placeholder="Name or brand, e.g. creatine now" autoFocus onChange={e => setQ(e.target.value)} /></label>
        <span className="note" role="status">{short ? 'Type at least 2 letters.' : busy && !list ? 'Searching…' : list ? `${list.items.length}${list.more ? '+' : ''} found` : ''}</span>
      </div>
      {!short && found && 'failed' in found && (
        <div role="alert">
          <p className="note err">{found.failed === 'offline' ? 'Searching the catalog needs a connection.' : found.failed === 'refused' ? 'The catalog is not available to this account.' : 'The search could not be done.'}</p>
          {found.failed !== 'refused' && <button type="button" className="btn sm" onClick={() => run(q.trim(), 0)}>Try again</button>}
        </div>
      )}
      {list && <div className="exrows">
        {list.items.map(it => {
          const added = items.some(x => x.catalogId === it.id);
          return (
            <div className="exrow" key={it.id}>
              <div className="exmain">
                <b>{it.name}</b>
                <span className="note">{[it.brand, it.data.form].filter(Boolean).join(' · ') || 'No brand'}</span>
                {errs[it.id] && <span className="note err" role="alert">{errs[it.id]}</span>}
              </div>
              {added ? <span className="note">In your supplements</span>
                : <button type="button" className="btn sm" aria-label={`Add ${it.name}${it.brand ? ` by ${it.brand}` : ''}`} onClick={() => add(it)}>Add</button>}
            </div>
          );
        })}
        {!list.items.length && <p className="note">Nothing found. Try fewer words, or add it as your own with + New supplement.</p>}
      </div>}
      {list?.more && <button type="button" className="btn sm ghost" disabled={busy} onClick={() => run(q.trim(), list.items.length)}>Show more</button>}
      <p className="note">Products from the NIH Dietary Supplement Label Database.</p>
      <div className="actions">
        <button type="button" className="btn" onClick={closeModal}>Done</button>
      </div>
    </Sheet>
  );
}
