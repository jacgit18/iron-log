import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { videoLabel } from '../../lib/data.js';
import { TIERS, tierLabel } from '../../lib/stretches.js';
import RemovedNotice from '../RemovedNotice.jsx';
import CatalogMatches from './CatalogMatches.jsx';
import { catalogStretchGroup } from '../../lib/stretches.js';

// Every stretch, by group, with when it shows on the Stretches tab. What is set here is the routine on every day.
// Syncing, each stretch is badged Library (added from the catalog) or Custom (your own), with a Source filter once both kinds are listed
// (ADR 027). Local mode has no catalog, so no badges.
export default function StretchLibrary() {
  const items = useAppStore(s => s.stretches);
  const syncing = useAppStore(s => s.sync !== null);
  const { openModal, moveStretch } = useAppStore.getState();
  const [q, setQ] = useState(''); const [src, setSrc] = useState('');
  const needle = q.trim().toLowerCase();
  const sources = syncing && items.some(i => i.catalogId) && items.some(i => !i.catalogId);
  const srcOf = (i: { catalogId?: string }) => (i.catalogId ? 'library' : 'custom');
  const shown = items.filter(i => (!needle || i.n.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle)) && (!sources || !src || srcOf(i) === src));
  const filtering = !!needle || (sources && !!src);
  return (
    <section className="panel edpanel exlib">
      <div className="inline" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <h2 id="slib-h" tabIndex={-1}>Stretch library</h2>
        <div className="inline">
          <button type="button" className="btn primary" id="slib-new" onClick={() => openModal({ type: 'stretch' })}>+ New stretch</button>
        </div>
      </div>
      <p className="note">Your stretches. “Every day” ones are on the Stretches tab each day, “Once in a while” ones sit under them, and “Library only” ones are kept here to add later.</p>
      <div className="filterbar" role="search">
        <label className="field">Search<input type="search" value={q} placeholder="Name or group" onChange={e => setQ(e.target.value)} /></label>
        {sources && <label className="field">Source
          <select value={src} onChange={e => setSrc(e.target.value)}>
            <option value="">All</option>
            <option value="custom">Custom</option>
            <option value="library">Library</option>
          </select>
        </label>}
        <span className="note" role="status">{filtering ? `${shown.length} of ${items.length} stretches` : `${items.length} stretches`}</span>
      </div>
      <RemovedNotice scope="stretches" />
      <div className="exrows">
        {TIERS.map(([tier]) => {
          const rows = shown.filter(i => i.tier === tier);
          if (!rows.length) return null;
          return (
            <div key={tier || 'lib'}>
              <div className="sect">{tierLabel(tier)}</div>
              {rows.map(r => (
                <div className="exrow" key={r.id}>
                  <div className="exmain">
                    <b>{r.n}{syncing && (r.catalogId
                      ? <span className="pill custom" title="Added from the catalog; what you change on it stays yours">Library</span>
                      : <span className="pill custom" title="You created this stretch; it is not from the catalog">Custom</span>)}</b>
                    <span className="note">{r.group}{r.note ? ` · ${r.note}` : ''}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(r.url)}: ${r.n} (opens in a new tab)`}><span aria-hidden="true">▶ </span>{videoLabel(r.url)}</a>}
                  </div>
                  <div className="actions" style={{ margin: 0 }}>
                    {!filtering && <>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} up`} onClick={() => moveStretch(r.id, -1)}><span aria-hidden="true">↑</span></button>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} down`} onClick={() => moveStretch(r.id, 1)}><span aria-hidden="true">↓</span></button>
                    </>}
                    <button type="button" className="btn sm" id={`slib-${r.id}`} aria-label={`Edit ${r.n}`} onClick={() => openModal({ type: 'stretch', id: r.id })}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
        {!shown.length && <p className="note">{syncing && needle && src !== 'custom' ? 'None of yours match. Add one from the catalog below, or with + New stretch.' : items.length ? 'No stretch matches. Clear the search or the Source filter.' : 'No stretches yet. Add one with + New stretch.'}</p>}
      </div>
      {src !== 'custom' && (
        <CatalogMatches kind="stretch" q={q} unit="stretches" source="Stretches from free-exercise-db (public domain). Added as Library only; edit one to put it on a day."
          mine={items.map(i => ({ id: i.id, name: i.n, ...(i.catalogId ? { catalogId: i.catalogId } : {}) }))}
          meta={catalogStretchGroup} onAdd={c => useAppStore.getState().addCatalogStretch(c)} />
      )}
    </section>
  );
}
