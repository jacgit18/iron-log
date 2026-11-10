import type { SupplementSlot } from '../../types.ts';
import { useEffect, useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { afterSheetClose } from '../../lib/backNav.js';
import { MIN_LETTERS, useCatalogSearch } from '../../hooks/useCatalogSearch.js';
import { useSupplementLabel } from '../../hooks/useSupplementLabel.js';
import { pickerOptions, type PickerChoice } from '../../lib/picker.js';
import { isTouchScreen } from '../../lib/revealField.js';
import { SLOT_OPTIONS, slotLabel } from '../../lib/supplements.js';
import { planAddMine } from '../../lib/supplementAddPlan.js';
import { planFill } from '../../lib/supplementLabelFill.js';
import { catalogLine, mineOption, newestFirst, oneOfEach, upcLine } from '../../lib/supplementResultLine.js';
import Sheet from '../Sheet.js';
import { LabelAmounts } from './LabelPreview.js';
import './SupplementAddSheet.css';

const SHOWN = 8; const SHOWN_MORE = 30;

// The one way to add a supplement (brief supplement-add-redesign): one search over yours and the catalog, the label of the picked product
// before Add, one time of day, a dose. `backToManage`: opened from Manage, so closing it reopens that editor.
export default function SupplementAddSheet({ backToManage }: { backToManage?: boolean }) {
  const s = useAppStore.getState();
  const syncing = useAppStore(x => x.sync !== null);
  const items = useAppStore(x => x.supp.items);
  useEffect(() => () => { if (backToManage && useAppStore.getState().modal === null) afterSheetClose(window.history, window, () => useAppStore.getState().openModal({ type: 'nbmanage', view: 'editor' })); }, [backToManage]); // after the sheet's own Back step (lib/backNav.ts)
  const [q, setQ] = useState(''); const [pick, setPick] = useState<PickerChoice | null>(null);
  const [slot, setSlot] = useState<SupplementSlot>('morning'); const [dose, setDose] = useState('');
  const [all, setAll] = useState(false); const [err, setErr] = useState('');
  const { state: cat, retry: retrySearch } = useCatalogSearch('supplement', q, !pick);
  const { state: lab, retry: retryLabel } = useSupplementLabel(pick?.kind === 'catalog' ? pick.item.id : null);
  const fill = lab.status === 'ready' ? planFill({}, lab.label).result : undefined;
  const o = pickerOptions(q, oneOfEach(items).map(i => mineOption(i, syncing)), cat.status === 'ready' ? newestFirst(cat.items) : [],
    { byBrand: true, serverFiltered: !(cat.status === 'ready' && cat.searching), max: all ? SHOWN_MORE : SHOWN });
  const hidden = o.mine.hidden + o.catalog.hidden;
  const searching = cat.status === 'loading' || (cat.status === 'ready' && !!cat.searching);
  const note = cat.status === 'short' && !q.trim() ? `Type ${MIN_LETTERS} letters of a name or brand.`
    : cat.status === 'short' ? `Type at least ${MIN_LETTERS} letters to search the catalog.`
    : searching ? 'Searching the catalog…'
    : cat.status === 'failed' ? (cat.reason === 'offline' ? 'The catalog needs a connection.' : cat.reason === 'refused' ? 'The catalog is not available to this account.' : 'The catalog could not be loaded.')
    : !syncing && q.trim() ? 'No catalog here: this device keeps its own supplements only.' : '';
  const noResults = !!q.trim() && !searching && !o.mine.shown.length && !o.catalog.shown.length && cat.status !== 'failed';
  const heldItem = pick?.kind === 'mine' ? items.find(i => i.id === pick.id) : undefined;
  const typed = q.trim().replace(/\s+/g, ' ');
  const canAdd = !!pick || !!typed;

  const choose = (c: PickerChoice) => { setPick(c); setErr(''); if (c.kind === 'mine') setQ(items.find(i => i.id === c.id)?.n ?? q); else if (c.kind === 'catalog') setQ(c.item.name); else setQ(c.name); };
  const clear = () => { setPick(null); setErr(''); };
  // Add: one of yours moves into the time of day or gets another instance, a catalog product joins your library in it with its label's amounts, anything else is a new supplement.
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (pick?.kind === 'mine') {
      const plan = planAddMine(items, pick.id, slot);
      if (!plan) return;
      if (plan.kind === 'exists') { setErr(plan.message); return; }
      if (plan.kind === 'move' ? s.setSupplementSlot(plan.id, slot, dose) : s.addSupplementInstance(plan.id, slot, dose)) s.closeModal();
      return;
    }
    if (pick?.kind === 'catalog') {
      const m = s.addCatalogSupplement(pick.item, { slot, dose, ...(fill?.nutrients.length || fill?.serving ? { nutrients: fill.nutrients, serving: fill.serving } : {}) });
      if (m) setErr(m); else if (useAppStore.getState().supp.items.some(i => i.catalogId === pick.item.id)) s.closeModal();
      return;
    }
    if (!pick && (o.mine.shown.length || o.catalog.shown.length)) { setErr('Pick a result, or pick “Add … as a new supplement”.'); return; }
    const name = pick?.kind === 'create' ? pick.name : typed;
    if (!slot) { setErr('Pick Morning, Noon or Night for a new supplement, or open the full form to keep it in the library only.'); return; }
    if (s.addSupplement(slot, name, dose)) s.closeModal(); else setErr(`Could not add ${name}. You may already have it in ${slotLabel(slot)}.`);
  };
  const row = (key: string, choice: PickerChoice, name: string, meta?: string, badge?: string) => (
    <li key={key}>
      <button type="button" className="sasopt" aria-label={`${name}${badge ? ` ${badge}` : ''}${meta ? `, ${meta}` : ''}`} onClick={() => choose(choice)}>
        <span className="sasname">{name}{badge && <span className="pill custom">{badge}</span>}</span>
        {meta && <span className="note">{meta}</span>}
      </button>
    </li>
  );
  return (
    <Sheet>
      <h2 className="cond">Add a supplement</h2>
      <form id="suppadd-form" noValidate onSubmit={add} className="sas">
        <label className="field">Name or brand
          <input id="suppadd-q" type="search" autoComplete="off" maxLength={100} value={q} placeholder="e.g. creatine, Nature Made" autoFocus={!isTouchScreen()}
            onChange={e => { setQ(e.target.value); setPick(null); setErr(''); setAll(false); }} />
        </label>
        {!pick && (
          <>
            {note && <p className={`note${cat.status === 'failed' ? ' err' : ''}`} role="status">{note}{cat.status === 'failed' && cat.reason !== 'refused' && <> <button type="button" className="btn sm ghost" onClick={retrySearch}>Try again</button></>}</p>}
            {noResults && <p className="note">No match.</p>}
            {(o.mine.shown.length > 0 || o.catalog.shown.length > 0 || o.create) && (
              <ul className="sasresults" aria-label="Results">
                {o.mine.shown.map(m => row(`m-${m.id}`, { kind: 'mine', id: m.id }, m.name, m.meta, m.badge))}
                {o.catalog.shown.map(c => row(`c-${c.id}`, { kind: 'catalog', item: c }, c.name, catalogLine(c)))}
                {o.create && row('create', { kind: 'create', name: o.create }, `Add “${o.create}” as a new supplement`)}
              </ul>
            )}
            {hidden > 0 && !all && <button type="button" className="btn sm ghost sasmore" onClick={() => setAll(true)}>Show {hidden} more</button>}
          </>
        )}
        {pick && (
          <div className="sasbox">
            <div className="sasboxhead">
              <h3 className="sasboxname">{pick.kind === 'catalog' ? pick.item.name : pick.kind === 'mine' ? heldItem?.n : pick.name}</h3>
              <button type="button" className="btn sm ghost" onClick={clear}>Change</button>
            </div>
            {pick.kind === 'catalog' && <p className="note">{[catalogLine(pick.item), upcLine(pick.item)].filter(Boolean).join(' · ')}. From the catalog: it joins your supplements.</p>}
            {pick.kind === 'mine' && heldItem && <p className="note">{heldItem.slot ? `Yours, in ${slotLabel(heldItem.slot)}. Adding it to another time of day makes another instance.` : 'Yours, in the library only. Adding it schedules it.'}</p>}
            {pick.kind === 'create' && <p className="note">A new supplement of your own.</p>}
            {pick.kind === 'catalog' && lab.status === 'loading' && <p className="note" role="status">Reading the label... Add now and it is added without amounts.</p>}
            {pick.kind === 'catalog' && lab.status === 'failed' && <p className="note" role="status">Could not load this product's amounts. You can type them in the supplement's sheet. <button type="button" className="btn sm" onClick={retryLabel}>Try again</button></p>}
            {pick.kind === 'catalog' && lab.status === 'ready' && <LabelAmounts label={lab.label} />}
          </div>
        )}
        <fieldset className="sasslot">
          <legend>Time of day</legend>
          {SLOT_OPTIONS.map(([k, l]) => (
            <label key={k || 'lib'} className={`sasradio${slot === k ? ' on' : ''}`}><input type="radio" name="suppadd-slot" value={k} checked={slot === k} onChange={() => { setSlot(k); setErr(''); }} />{l}</label>
          ))}
        </fieldset>
        <label className="field">Dose (optional)<input id="suppadd-dose" type="text" placeholder="e.g. 5 g" maxLength={40} value={dose} onChange={e => setDose(e.target.value)} /></label>
        {!pick || pick.kind !== 'catalog' ? <button type="button" className="btn sm ghost sasfull" id="suppadd-full" onClick={() => useAppStore.getState().openModal({ type: 'supplement', from: backToManage ? 'manage' : undefined })}>Open the full form, with amounts</button> : null}
        {err && <p className="note err" role="alert">{err}</p>}
      </form>
      <div className="actions">
        <button type="button" className="btn" onClick={s.closeModal}>Cancel</button>
        <button type="submit" form="suppadd-form" className="btn primary" id="suppadd-go" disabled={!canAdd}>Add</button>
      </div>
    </Sheet>
  );
}
