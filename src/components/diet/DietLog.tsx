import { useEffect, useState } from 'react';
import { barPercent, entriesOn, entryText, fmtNum, meterText, missingCarbsFat, roomOn, totalsFor } from '../../lib/dietLog.js';
import { suggestNow } from '../../lib/dietSuggest.js';
import type { Food } from '../../lib/foodMacros.js';
import { ymd } from '../../shared/dates.js';
import type { Targets } from '../../lib/dietTarget.js';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import RemovedNotice from '../RemovedNotice.jsx';
import CopyDay from './CopyDay.js';
import EntryForm, { type EntryValues } from './EntryForm.js';
import FindFood from './FindFood.js';

// One meter: a bar with the numbers in words. Past the target the bar stays full and the text says how far over (no scolding).
function Meter({ label, unit, have, target }: { label: string; unit: string; have: number; target: number | null }) {
  const text = meterText(have, target, unit);
  return (
    <div className="dt-meter">
      <span className="dt-mlabel">{label}</span>
      {target
        ? <div className="bar" role="progressbar" aria-label={`${label} ${text}`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(have, target)}><i style={{ width: `${barPercent(have, target)}%` }} /></div>
        : <div className="bar" role="img" aria-label={`${label} ${text}, no target set`}><i /></div>}
      <span className="dt-mtext">{text}</span>
    </div>
  );
}

// The day's food: totals against the targets, the list, and a way to add and fix entries.
export default function DietLog({ day, targets }: { day: string; targets: Targets }) {
  const diet = useAppStore(s => s.diet);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { setMsg(''); setEditId(null); }, [day]); // a status line and an open edit belong to the day they were made on
  const list = entriesOn(diet, day);
  const tot = totalsFor(diet, day);
  const room = roomOn(diet, day);
  const add = (v: EntryValues): string | null => { const r = useAppStore.getState().addDietEntry({ d: day, n: v.n, kcal: v.kcal, p: v.p, ...(v.c !== null ? { c: v.c } : {}), ...(v.f !== null ? { f: v.f } : {}) }); if (!r.error) setMsg(`Added ${v.n.trim()}.`); return r.error; };
  const now = useToday(s => s.today);
  const suggested = suggestNow(diet, new Date().getHours(), ymd(now));
  const addFood = (f: Food) => { const r = useAppStore.getState().addDietEntry({ d: day, n: f.n, kcal: f.kcal, p: f.p, ...(f.c !== undefined ? { c: f.c } : {}), ...(f.f !== undefined ? { f: f.f } : {}), ...(f.from ? { from: f.from } : {}) }); setMsg(r.error ?? `Added ${f.n}.`); };
  return (
    <div className="dt-log">
      <Meter label="Calories" unit="kcal" have={tot.kcal} target={targets.kcal} />
      <Meter label="Protein" unit="g" have={tot.protein} target={targets.protein} />
      <Meter label="Carbs" unit="g" have={tot.carbs} target={targets.carbs} />
      <Meter label="Fat" unit="g" have={tot.fat} target={targets.fat} />
      {list.length > 0 && missingCarbsFat(diet, day) && <p className="note">Carbs and fat count only what you enter.</p>}
      {list.length === 0 && <p className="note">Nothing logged yet.</p>}
      <ul className="dt-list">
        {list.map(e => (
          <li key={e.id} className="dt-entry">
            {editId === e.id ? (
              <EntryForm idp={`dt-e-${e.id}`} initial={{ n: e.n, kcal: e.kcal, p: e.p }} submitLabel="Save" onCancel={() => setEditId(null)}
                onSubmit={v => { const err = useAppStore.getState().updateDietEntry(e.id, v); if (!err) setEditId(null); return err; }} />
            ) : (
              <>
                <span className="dt-name">{e.n}</span>
                <span className="note">{entryText(e)}</span>
                <button type="button" className="btn sm" aria-label={`Edit ${e.n}`} onClick={() => setEditId(e.id)}>Edit</button>
                <button type="button" className="btn sm" aria-label={`Delete ${e.n}`} onClick={() => useAppStore.getState().removeDietEntry(e.id)}>Delete</button>
              </>
            )}
          </li>
        ))}
      </ul>
      <RemovedNotice scope="diet" expires />
      <h3>Quick add</h3>
      {!room ? <p className="note">That’s 20 things for the day. Delete one to add another.</p> : (
        <>
          {suggested.length > 0 && (
            <>
              <p className="note" id="dt-sugg-h">Suggested now</p>
              <ul className="dt-recents" aria-labelledby="dt-sugg-h">
                {suggested.map(f => <li key={f.n}><button type="button" className="btn sm" onClick={() => addFood(f)}>{f.n} · {fmtNum(f.kcal)} kcal</button></li>)}
              </ul>
            </>
          )}
          <FindFood day={day} onAdded={setMsg} />
          <CopyDay key={day} day={day} onAdded={setMsg} />
          <EntryForm idp="dt-add" submitLabel="Add" onSubmit={add} />
        </>
      )}
      <p className="note" role="status">{msg}</p>
    </div>
  );
}
