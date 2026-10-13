import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import RemovedNotice from '../RemovedNotice.jsx';
import { SLOT_OPTIONS, slotLabel } from '../../lib/supplements.js';
import CatalogMatches from '../program/CatalogMatches.jsx';

// Every supplement you keep, with when it is on the Supplements tab. Library-only ones are kept to schedule later. Shown under the
// schedule on Daily → Supplements while Edit is on (spec inline-catalog-picker step 6; it was a Program tab view before).
// Syncing, each is badged Library (added from the catalog, with its brand) or Custom, with a Source filter once both kinds are listed
// (ADR 027, 029). Local mode has no catalog, so no badges.
export default function SupplementLibrary() {
  const items = useAppStore(s => s.supp.items);
  const syncing = useAppStore(s => s.sync !== null);
  const { openModal, moveSupplement } = useAppStore.getState();
  const [q, setQ] = useState(''); const [src, setSrc] = useState('');
  const needle = q.trim().toLowerCase();
  const sources = syncing && items.some(i => i.catalogId) && items.some(i => !i.catalogId);
  const shown = items.filter(i => (!needle || i.n.toLowerCase().includes(needle) || (i.brand || '').toLowerCase().includes(needle))
    && (!sources || !src || (i.catalogId ? 'library' : 'custom') === src));
  const filtering = !!needle || (sources && !!src);
  return (
    <section className="panel edpanel exlib">
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 id="suplib-h" tabIndex={-1}>Supplement library</h2>
        <div className="inline">
          <button type="button" className="btn primary" id="suplib-new" onClick={() => openModal({ type: 'supplement' })}>+ New supplement</button>
        </div>
      </div>
      <p className="note">Your supplements. Ones set to Morning, Noon or Night are on the schedule above every day; “Library only” ones are kept here to schedule later.</p>
      <div className="filterbar" role="search">
        <label className="field">Search<input type="search" value={q} placeholder="Name or brand" onChange={e => setQ(e.target.value)} /></label>
        {sources && <label className="field">Source
          <select value={src} onChange={e => setSrc(e.target.value)}>
            <option value="">All</option>
            <option value="custom">Custom</option>
            <option value="library">Library</option>
          </select>
        </label>}
        <span className="note" role="status">{filtering ? `${shown.length} of ${items.length} supplements` : `${items.length} supplement${items.length === 1 ? '' : 's'}`}</span>
      </div>
      <RemovedNotice scope="supplements" />
      <div className="exrows">
        {SLOT_OPTIONS.map(([slot]) => {
          const rows = shown.filter(i => i.slot === slot);
          if (!rows.length) return null;
          return (
            <div key={slot || 'lib'}>
              <div className="sect">{slotLabel(slot)}</div>
              {rows.map(r => (
                <div className="exrow" key={r.id}>
                  <div className="exmain">
                    <b>{r.n}{syncing && (r.catalogId
                      ? <span className="pill custom" title="Added from the catalog; the dose and note are yours">Library</span>
                      : <span className="pill custom" title="You created this supplement; it is not from the catalog">Custom</span>)}</b>
                    <span className="note">{[r.brand, r.dose, r.note].filter(Boolean).join(' · ') || 'No dose or note'}</span>
                  </div>
                  <div className="actions" style={{ margin: 0 }}>
                    {!filtering && <>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} up`} onClick={() => moveSupplement(r.id, -1)}><span aria-hidden="true">↑</span></button>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} down`} onClick={() => moveSupplement(r.id, 1)}><span aria-hidden="true">↓</span></button>
                    </>}
                    <button type="button" className="btn sm" id={`suplib-${r.id}`} aria-label={`Edit ${r.n}`} onClick={() => openModal({ type: 'supplement', id: r.id })}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {!shown.length && <p className="note">{syncing && needle && src !== 'custom' ? 'None of yours match. Add one from the catalog below, or with + New supplement.' : items.length ? 'No supplement matches. Clear the search or the Source filter.' : 'No supplements yet. Add one with + New supplement.'}</p>}
      </div>
      {src !== 'custom' && (
        <CatalogMatches kind="supplement" q={q} unit="products" source="Products from the NIH Dietary Supplement Label Database. Added as Library only, with no dose: edit one to schedule it."
          mine={items.map(i => ({ id: i.id, name: i.n, ...(i.brand ? { brand: i.brand } : {}), ...(i.catalogId ? { catalogId: i.catalogId } : {}) }))}
          meta={c => [c.brand, c.data.form].filter(Boolean).join(' · ') || 'No brand'} onAdd={c => useAppStore.getState().addCatalogSupplement(c)} />
      )}
    </section>
  );
}
