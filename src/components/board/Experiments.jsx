import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, exInfo } from '../../lib/data.js';
import { DAYS, lastLog, describe, todayCol } from '../../lib/logic.js';
import { ymd, monday } from '../../lib/dates.js';
import ArmedButton from '../ArmedButton.jsx';

// The Experiment board: exercises to try, added to a day of the viewed week. `day` is the column shown on phones.
export default function Experiments({ day, onDragStart, onDragEnd }) {
  const cfg = useAppStore(s => s.cfg);
  const items = useAppStore(s => s.experiments);
  const logs = useAppStore(s => s.logs);
  const rest = useAppStore(s => s.week.rest) || [];
  const weekStart = useAppStore(s => s.weekStart);
  const today = useToday(s => s.today);
  const st = useAppStore.getState();
  const [pick, setPick] = useState({});
  const days = DAYS.filter(d => !rest.includes(d));
  const start = ymd(monday(today)) === ymd(weekStart) ? todayCol(today) : day;
  const def = days.includes(start) ? start : days[0];
  return (
    <section className="experiments" aria-labelledby="exp-h">
      <div className="exphead">
        <h2 id="exp-h" className="cond" tabIndex={-1}>Experiments</h2>
        <button type="button" className="btn sm" onClick={() => st.openModal({ type: 'experiment' })}>+ Add exercise</button>
      </div>
      {!items.length ? <p className="note">Keep exercises you want to try here, then add them to a day.</p> : (
        <ul className="explist">
          {items.map(e => {
            const n = exInfo(cfg, e.ex).n; const last = lastLog(logs, e.ex); const to = days.includes(pick[e.id]) ? pick[e.id] : def;
            return (
              <li key={e.id} className="expcard" draggable="true" onDragStart={ev => onDragStart(ev, 'exp:' + e.id)} onDragEnd={onDragEnd}>
                <div><b>{n}</b>{e.ph && <> <span className="tag">{PHASES[e.ph].label}</span></>}</div>
                {e.note && <div className="note">{e.note}</div>}
                {last && <div className="lastlog">Last: {describe(last)}</div>}
                <div className="actions">
                  <label htmlFor={`exp-to-${e.id}`}>Add to</label>
                  <select id={`exp-to-${e.id}`} aria-label={`Add to (${n})`} value={to} onChange={ev => setPick(p => ({ ...p, [e.id]: Number(ev.target.value) }))}>
                    {days.map(d => <option key={d} value={d}>Day {d}</option>)}
                  </select>
                  <button type="button" className="btn sm" aria-label={`Add ${n} to Day ${to}`} onClick={() => st.addToDay(e.id, to)}>Add</button>
                  <button type="button" className="btn sm ghost" aria-label={`Edit ${n}`} onClick={() => st.openModal({ type: 'experiment', id: e.id })}>Edit</button>
                  <ArmedButton className="btn sm ghost" label="Delete" armedLabel="Confirm delete" aria-label={`Delete ${n}`} onConfirm={() => { st.deleteExperiment(e.id); if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => document.getElementById('exp-h')?.focus()); }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
