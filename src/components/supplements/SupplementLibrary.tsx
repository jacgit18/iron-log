import { useState } from 'react';
import type { SupplementSlot } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import Icon from '../Icon.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import { SLOTS } from '../../lib/supplements.js';
import { chipTap, filterRows, groupSupplements, hasBothSources, perDay, rowCounts, rowSub, type ListFilter, type ListRow, type ListSource } from '../../lib/supplementList.js';
import '../Pill.css';
import './SupplementList.css';

// Every supplement you keep, once, in Manage > Supplements and library (brief supplement-merged-list; it replaced a schedule list and a library list that repeated each other).
// A row is a product: Morning, Noon and Night chips schedule it right there (the rules are `lib/supplementList.ts`), Edit opens its sheet for amounts per time and Delete.
// Syncing, each is badged Library (added from the catalog, with its brand) or Custom, with a Source filter once both kinds are listed (ADR 027, 029). Local mode has no catalog, so no badges.
const FILTERS: [ListFilter, string][] = [['all', 'All'], ['scheduled', 'Scheduled'], ['library', 'Library only']];

export default function SupplementLibrary() {
  const items = useAppStore(s => s.supp.items);
  const syncing = useAppStore(s => s.sync !== null);
  const { openModal, moveSupplement, removeSupplement, saveSupplementTimes } = useAppStore.getState();
  const [q, setQ] = useState(''); const [src, setSrc] = useState<ListSource>(''); const [filter, setFilter] = useState<ListFilter>('all'); const [reorder, setReorder] = useState(false);
  const rows = groupSupplements(items); const n = rowCounts(rows);
  const sources = syncing && hasBothSources(rows);
  const shown = filterRows(rows, { q, filter, source: sources ? src : '' });
  const filtering = !!q.trim() || filter !== 'all' || (sources && !!src);
  const label = (r: ListRow) => (r.brand ? `${r.n}, ${r.brand}` : r.n); // two brands of one name are two rows: say which
  const tap = (r: ListRow, slot: SupplementSlot) => {
    const act = chipTap(items, r.id, slot); if (!act) return;
    if (act.kind === 'remove') removeSupplement(act.id); else saveSupplementTimes(r.id, act.times);
  };
  const bucket = (r: ListRow) => rows.filter(x => x.primary === r.primary);
  return (
    <section className="panel edpanel exlib">
      <div className="inline spread">
        <h2 id="suplib-h" tabIndex={-1}>Your supplements</h2>
        <div className="inline">
          <button type="button" className="btn primary" id="suplib-add" onClick={() => openModal({ type: 'suppadd', from: 'manage' })}>+ Add</button>
        </div>
      </div>
      <p className="note">Tap Morning, Noon or Night to put a supplement on the schedule every day; a supplement with no time lit is kept here to schedule later. + Add searches yours and the catalog.</p>
      <div className="filterbar" role="search">
        <label className="field">Search<input type="search" value={q} placeholder="Name or brand" onChange={e => setQ(e.target.value)} /></label>
        {sources && <label className="field">Source
          <select value={src} onChange={e => setSrc(e.target.value as ListSource)}>
            <option value="">All</option>
            <option value="custom">Custom</option>
            <option value="library">Library</option>
          </select>
        </label>}
      </div>
      <div className="slbar">
        <div className="slfilter" role="group" aria-label="Show">
          {FILTERS.map(([k, l]) => <button key={k} type="button" className="pillbtn" id={`suplib-filter-${k}`} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <span>{k === 'all' ? n.all : k === 'scheduled' ? n.scheduled : n.library}</span></button>)}
        </div>
        {!filtering && rows.length > 1 && <button type="button" className="btn sm ghost" id="suplib-reorder" aria-pressed={reorder} onClick={() => setReorder(!reorder)}>{reorder ? 'Done reordering' : 'Reorder'}</button>}
      </div>
      {reorder && !filtering && <p className="note">Moves a supplement among those at its first time of day, which is the order on the Board.</p>}
      <span className="note" role="status">{filtering ? `${shown.length} of ${n.all} supplements` : ''}</span>
      <RemovedNotice scope="supplements" />
      {SLOTS.map(([k]) => <RemovedNotice key={k} scope={'suppslot:' + k} />)}
      <div className="exrows">
        {shown.map(r => {
          const peers = bucket(r); const at = peers.indexOf(r);
          return (
            <div className="exrow slrow" key={r.id}>
              <div className="sltop">
                <div className="exmain">
                  <b>{r.n}{syncing && (r.catalogId
                    ? <span className="pill custom" title="Added from the catalog; the dose and note are yours">Library</span>
                    : <span className="pill custom" title="You created this supplement; it is not from the catalog">Custom</span>)}</b>
                  <span className="note">{rowSub(r)} · {perDay(r)}</span>
                </div>
                <div className="actions flush">
                  {reorder && !filtering && <>
                    <button type="button" className="btn sm ghost" disabled={at === 0} aria-label={`Move ${label(r)} up`} onClick={() => moveSupplement(r.id, -1)}><Icon name="arrow-up" /></button>
                    <button type="button" className="btn sm ghost" disabled={at === peers.length - 1} aria-label={`Move ${label(r)} down`} onClick={() => moveSupplement(r.id, 1)}><Icon name="arrow-down" /></button>
                  </>}
                  <button type="button" className="btn sm" id={`suplib-${r.id}`} aria-label={`Edit ${label(r)}`} onClick={() => openModal({ type: 'supplement', id: r.id, from: 'manage' })}>Edit</button>
                </div>
              </div>
              <div className="slchips" role="group" aria-label={`When to take ${label(r)}`}>
                {SLOTS.map(([k, l]) => <button key={k} type="button" className="pillbtn" id={`suplib-${r.id}-${k}`} aria-pressed={r.slots.includes(k)} onClick={() => tap(r, k)}>{l}</button>)}
              </div>
            </div>
          );
        })}
        {!shown.length && <p className="note">{syncing && q.trim() && src !== 'custom' ? 'None of yours match. Find it in the catalog with + Add.' : rows.length ? 'No supplement matches. Clear the search or the filters.' : 'No supplements yet. Add one with + Add.'}</p>}
      </div>
    </section>
  );
}
