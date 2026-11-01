import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { videoLabel } from '../../lib/data.js';
import { TIERS, tierLabel } from '../../lib/stretches.js';
import Icon from '../Icon.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import CatalogMatches from './CatalogMatches.jsx';
import { catalogStretchGroup } from '../../lib/stretches.js';
import { canReorder, groupHeading, groupOpen, isFiltering, resultText } from '../../lib/libraryFilter.js';
import LibraryChip from './LibraryChip.jsx';
import './Library.css';

// Every stretch, by group, with when it shows on the Stretches tab. What is set here is the routine on every day.
// Syncing, each stretch is badged Library (added from the catalog) or Custom (your own), with a Source filter once both kinds are listed
// (ADR 027). Local mode has no catalog, so no badges.
export default function StretchLibrary() {
  const items = useAppStore(s => s.stretches);
  const syncing = useAppStore(s => s.sync !== null);
  const { openModal, moveStretch } = useAppStore.getState();
  const [q, setQ] = useState(''); const [src, setSrc] = useState('');
  const [userOpen, setUserOpen] = useState<Record<string, boolean | undefined>>({}); // a group the person opened or closed; Every day starts open, the others closed
  const [ordering, setOrdering] = useState(false); // Edit order: the up and down arrows show on each row
  const needle = q.trim().toLowerCase();
  const sources = syncing && items.some(i => i.catalogId) && items.some(i => !i.catalogId);
  const srcOf = (i: { catalogId?: string }) => (i.catalogId ? 'library' : 'custom');
  const shown = items.filter(i => (!needle || i.n.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle)) && (!sources || !src || srcOf(i) === src));
  const filtering = isFiltering({ q, src: sources ? src : '' });
  const reordering = ordering && canReorder(filtering);
  return (
    <section className="panel edpanel exlib exlibwide">
      <div className="inline spread">
        <h2 id="slib-h" tabIndex={-1}>Stretch library</h2>
        <div className="inline">
          <button type="button" className="btn primary" id="slib-new" onClick={() => openModal({ type: 'stretch' })}>+ New stretch</button>
        </div>
      </div>
      <p className="note">Your stretches. “Every day” ones are on the Stretches tab each day, “Once in a while” ones sit under them, and “Library only” ones are kept here to add later.</p>
      <div className="libbar" role="search">
        <input className="libsearch" type="search" aria-label="Search" value={q} placeholder={`Search ${items.length} stretches`} onChange={e => setQ(e.target.value)} />
        <div className="libchips">
          {sources && <LibraryChip label="Source" value={src} onChange={setSrc}>
            <option value="">All sources</option>
            <option value="custom">Custom</option>
            <option value="library">Library</option>
          </LibraryChip>}
          {canReorder(filtering) && <button type="button" className="btn sm" aria-pressed={ordering} onClick={() => setOrdering(o => !o)}>{ordering ? 'Done' : 'Edit order'}</button>}
        </div>
        <span className="note" role="status">{resultText(shown.length, items.length, filtering, 'stretches')}</span>
      </div>
      <RemovedNotice scope="stretches" />
      <div className="exrows">
        {TIERS.map(([tier]) => {
          const rows = shown.filter(i => i.tier === tier);
          if (!rows.length) return null;
          const open = groupOpen(tier, userOpen, filtering);
          return (
            <div key={tier || 'lib'} className="libsect">
              {filtering
                ? <div className="libgroup">{groupHeading(tierLabel(tier), rows.length)}</div> // while searching every group with a match is open and cannot be folded
                : (
                  <button type="button" className="libgroup" id={`slib-g-${tier || 'lib'}`} aria-expanded={open} onClick={() => setUserOpen(o => ({ ...o, [tier]: !open }))}>
                    <span>{groupHeading(tierLabel(tier), rows.length)}</span><Icon name={open ? 'chevron-up' : 'chevron-down'} />
                  </button>
                )}
              {open && rows.map(r => (
                <div className="exrow" key={r.id}>
                  <div className="exmain">
                    <b>{r.n}{syncing && (r.catalogId
                      ? <span className="pill custom" title="Added from the catalog; what you change on it stays yours">Library</span>
                      : <span className="pill custom" title="You created this stretch; it is not from the catalog">Custom</span>)}</b>
                    <span className="note">{r.group}{r.note ? ` · ${r.note}` : ''}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(r.url)}: ${r.n} (opens in a new tab)`}><Icon name="play" />{' '}{videoLabel(r.url)}</a>}
                  </div>
                  <div className="actions flush">
                    {reordering && <>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} up`} onClick={() => moveStretch(r.id, -1)}><Icon name="arrow-up" /></button>
                      <button type="button" className="btn sm ghost" aria-label={`Move ${r.n} down`} onClick={() => moveStretch(r.id, 1)}><Icon name="arrow-down" /></button>
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
