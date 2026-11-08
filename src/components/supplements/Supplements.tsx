import type { SupplementItem, SupplementSlot, Supplements, Taken } from '../../types.ts';
import type { MineOption, PickerChoice } from '../../lib/picker.ts';
import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { ymd } from '../../shared/dates.js';
import { SLOTS, scheduled, scheduleOf, slotLabel, slotTally } from '../../lib/supplements.js';
import { pickerKey } from '../../lib/picker.js';
import ItemPicker from '../ItemPicker.jsx';
import Diet from './Diet.js';
import NutritionBoard from '../nutritionBoard/index.js';
import SupplementLibrary from './SupplementLibrary.jsx';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import './Supplements.css';

// One of yours as the add picker lists it: where it is now and its dose; badged Library or Custom only when syncing (ADR 027).
const mineOf = (i: SupplementItem, syncing: boolean): MineOption => ({
  id: i.id, name: i.n, ...(i.brand ? { brand: i.brand } : {}), ...(i.catalogId ? { catalogId: i.catalogId } : {}),
  meta: [i.brand, i.slot ? `In ${slotLabel(i.slot)}` : 'Library only', i.dose].filter(Boolean).join(' · '),
  ...(syncing ? { badge: i.catalogId ? 'Library' : 'Custom' } : {}),
});
// The same supplement: name and brand, any case (instances of one supplement share both).
const sameName = (a: SupplementItem, b: SupplementItem) => a.n.toLowerCase() === b.n.toLowerCase() && (a.brand || '').toLowerCase() === (b.brand || '').toLowerCase();
const pickedName = (c: PickerChoice | null, items: SupplementItem[]) =>
  !c ? null : c.kind === 'mine' ? items.find(i => i.id === c.id)?.n ?? null : c.kind === 'catalog' ? c.item.name : c.name;

function Slot({ slot, label, date, items, taken, editing }: { slot: SupplementSlot; label: string; date: string; items: SupplementItem[]; taken: Taken; editing: boolean }) {
  const s = useAppStore.getState();
  const syncing = useAppStore(x => x.sync !== null);
  const [name, setName] = useState(''); const [dose, setDose] = useState('');
  // What was picked in the name field (ADR 036), used by Add while the name still matches it.
  const [pick, setPick] = useState<PickerChoice | null>(null);
  const [err, setErr] = useState('');
  const [arming, setArming] = useState<string | null>(null); // the supplement whose Remove was pressed once
  const list = scheduleOf(items)[slot]; const t = slotTally(items, taken, date, slot);
  const held = pick && pickerKey(pickedName(pick, items)) === pickerKey(name) ? pick : null;
  const heldItem = held?.kind === 'mine' ? items.find(i => i.id === held.id) : undefined;
  const done = () => { setName(''); setDose(''); setPick(null); setErr(''); };
  // Add: one of yours moves into this section, a catalog product joins your library in it, anything else is a new supplement.
  const add = (e: FormEvent) => {
    e.preventDefault();
    // One of yours that is already scheduled stays where it is and gets another instance here (taken twice a day); a library-only one moves in.
    if (held?.kind === 'mine') { if (heldItem?.slot ? s.addSupplementInstance(held.id, slot, dose) : s.setSupplementSlot(held.id, slot, dose)) done(); return; }
    if (held?.kind === 'catalog') {
      const m = s.addCatalogSupplement(held.item, { slot, dose });
      // null also means nothing was saved (still loading): keep what was typed unless it is really there now.
      if (m) setErr(m); else if (useAppStore.getState().supp.items.some(i => i.catalogId === held.item.id)) done();
      return;
    }
    if (s.addSupplement(slot, name, dose)) done();
  };
  return (
    <section className={`sslot${t.full ? ' done' : ''}`} role="group" aria-labelledby={`supp-h-${slot}`}>
      <div className="sslothead">
        <h3 id={`supp-h-${slot}`}>{label}</h3>
        <span className="note">{t.total ? `${t.done}/${t.total}` : ''}</span>
      </div>
      <RemovedNotice scope={'suppslot:' + slot} />
      {!list.length && <p className="note">{editing ? 'Nothing here yet. Add one below.' : 'Nothing scheduled.'}</p>}
      <ul className="slist">
        {list.map(x => (
          <li key={x.id} className={`srow${(taken[date] || {})[x.id] ? ' taken' : ''}${arming === x.id ? ' removing' : ''}`}>
            <label className="stick">
              <input type="checkbox" className="chk" id={`supp-${x.id}`} checked={!!(taken[date] || {})[x.id]} onChange={e => s.setSupplementTaken(date, x.id, e.target.checked)} />
              <span className="sname"><span className="rmname">{x.n}</span>{x.dose && <span className="sdose">{x.dose}</span>}</span>
            </label>
            {editing && <ArmedButton className={`btn sm ${arming === x.id ? 'danger' : 'ghost'}`} aria-label={`Remove ${x.n} from ${label}`} label="Remove" armedLabel="Tap again to remove" onArmedChange={a => setArming(a ? x.id : null)} onConfirm={() => { setArming(null); s.removeSupplement(x.id); }} />}
          </li>
        ))}
      </ul>
      {editing && (
        <form className="suppadd" onSubmit={add}>
          <ItemPicker id={`suppname-${slot}`} label={`Add to ${label}`} kind="supplement" value={name} maxLength={60} placeholder="Name or brand, e.g. creatine now"
            mine={items.filter((i, k) => i.slot !== slot && !list.some(l => sameName(l, i)) && items.findIndex(j => j.slot !== slot && sameName(j, i)) === k).map(i => mineOf(i, syncing))} also={list.map(i => mineOf(i, syncing))}
            catalogMeta={c => [c.brand, c.data.form].filter(Boolean).join(' · ')} createLabel={n => `Add “${n}” as a new supplement`}
            onText={v => { setName(v); setErr(''); }} onPick={setPick} />
          <label className="field">Dose (optional)<input type="text" id={`suppdose-${slot}`} placeholder="e.g. 5 g" maxLength={40} value={dose} onChange={e => setDose(e.target.value)} /></label>
          <button type="submit" className="btn sm" id={`suppadd-${slot}`} disabled={!name.trim()}>Add</button>
          {held?.kind === 'mine' && <p className="note">{heldItem?.slot
            ? `Adds another ${heldItem.n} to ${label}, so you can take it more than once a day${dose.trim() ? ', with this dose' : ''}.`
            : `Moves it to ${label}${dose.trim() ? ' with this dose' : ''}.`}</p>}
          {held?.kind === 'catalog' && <p className="note">From the catalog. It joins your supplements in {label}.</p>}
          {err && <p className="note err" role="alert">{err}</p>}
        </form>
      )}
    </section>
  );
}

// The editor behind Edit supplements: every time of day with its add form, and the whole library under it. `date` is today (the ticks here are shown for today).
function Schedule({ date, supp, editing }: { date: string; supp: Supplements; editing: boolean }) {
  const all = scheduled(supp.items); const done = all.filter(x => (supp.taken[date] || {})[x.id]).length;
  return (
    <section className="panel suppanel" aria-labelledby="sched-h">
      <div className="sstop">
        <h2 id="sched-h">Supplements</h2>
        <span className="sstopend"><span className="note" role="status">{all.length ? `${done} of ${all.length} taken` : ''}</span></span>
      </div>
      {!all.length && !editing && <p className="note">Nothing scheduled yet. Use Edit to add what you take in the morning, at noon and at night; Edit also shows your whole supplement list.</p>}
      {SLOTS.map(([k, l]) => <Slot key={k} slot={k} label={l} date={date} items={supp.items} taken={supp.taken} editing={editing} />)}
    </section>
  );
}

// Nutrition (brief nutrition-board): one week board of meals, Supplements and Hydration per day, with the Targets block under it. Edit supplements opens the supplement editor and library below the board; PR 2 of the brief moves it into Manage.
export default function Supplements() {
  const supp = useAppStore(s => s.supp);
  const today = useToday(s => s.today);
  const [editing, setEditing] = useState(false);
  return (
    <div>
      <NutritionBoard actions={<button type="button" className="btn sm ghost" id="sched-edit" aria-pressed={editing} onClick={() => setEditing(v => !v)}>{editing ? 'Done editing supplements' : 'Edit supplements'}</button>} />
      {editing && (
        <>
          <div className="mt-16"><Schedule date={ymd(today)} supp={supp} editing /></div>
          <div className="mt-16"><SupplementLibrary /></div>
        </>
      )}
      <div className="mt-16"><Diet /></div>
    </div>
  );
}
