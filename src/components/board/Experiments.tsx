import { useState, type DragEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, exInfo } from '../../lib/data.js';
import { DAYS, colOf, lastLog, describe, todayCol } from '../../lib/logic.js';
import { ymd, weekStartOf } from '../../shared/dates.js';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';

// The Experiment board: exercises to try, added to a day of the viewed week. `day` is the column shown on phones.
export default function Experiments({ day, onDragStart, onDragEnd }: { day: number; onDragStart: (e: DragEvent, id: string) => void; onDragEnd: () => void }) {
  const cfg = useAppStore(s => s.cfg);
  const items = useAppStore(s => s.experiments);
  const logs = useAppStore(s => s.logs);
  const week = useAppStore(s => s.week);
  const rest = week.rest || [];
  const weekStart = useAppStore(s => s.weekStart);
  const today = useToday(s => s.today);
  const st = useAppStore.getState();
  const [pick, setPick] = useState<Record<string, number>>({});
  const [arming, setArming] = useState<string | null>(null); // the experiment whose Delete was pressed once
  const days = DAYS.filter(d => !rest.includes(d));
  const start = ymd(weekStartOf(today)) === ymd(weekStart) ? todayCol(today) : day;
  const def = days.includes(start) ? start : days[0];
  return (
    <section className="experiments" aria-labelledby="exp-h">
      <div className="exphead">
        <h2 id="exp-h" className="cond" tabIndex={-1}>Experiments</h2>
        <button type="button" className="btn sm" onClick={() => st.openModal({ type: 'experiment' })}>+ Add exercise</button>
      </div>
      <RemovedNotice scope="experiments" />
      {!items.length ? <p className="note">Keep exercises you want to try here, then add them to a day.</p> : (
        <ul className="explist">
          {items.map(e => {
            const n = exInfo(cfg, e.ex).n; const last = lastLog(logs, e.ex);
            const on = [...new Set((week.extra || []).filter(x => x.ex === e.ex).map(x => colOf(week, x.day)))].sort((a, b) => a - b); // the days of this week it is already on
            const to = days.includes(pick[e.id]) ? pick[e.id] : def;
            return (
              <li key={e.id} className={`expcard${arming === e.id ? ' removing' : ''}`} draggable="true" onDragStart={ev => onDragStart(ev, 'exp:' + e.id)} onDragEnd={onDragEnd}>
                {arming === e.id && <span className="rmtag">Will be deleted · tap Delete again</span>}
                <div><b className="rmname">{n}</b>{e.ph && <> <span className="tag">{PHASES[e.ph].label}</span></>}</div>
                {e.note && <div className="note">{e.note}</div>}
                {on.length > 0 && <div className="note onday">On {on.map(d => `Day ${d}`).join(', ')} this week</div>}
                {last && <div className="lastlog">Last: {describe(last)}</div>}
                <div className="actions">
                  <label htmlFor={`exp-to-${e.id}`}>Add to</label>
                  <select id={`exp-to-${e.id}`} aria-label={`Add to (${n})`} value={to} onChange={ev => setPick(p => ({ ...p, [e.id]: Number(ev.target.value) }))}>
                    {days.map(d => <option key={d} value={d}>Day {d}</option>)}
                  </select>
                  <button type="button" className="btn sm" aria-label={`Add ${n} to Day ${to}`} onClick={() => st.addToDay(e.id, to)}>Add</button>
                  <button type="button" className="btn sm ghost" aria-label={`Edit ${n}`} onClick={() => st.openModal({ type: 'experiment', id: e.id })}>Edit</button>
                  <ArmedButton className={`btn sm ${arming === e.id ? 'danger' : 'ghost'}`} label="Delete" armedLabel="Tap again to delete" aria-label={`Delete ${n}`} onArmedChange={a => setArming(a ? e.id : null)} onConfirm={() => { setArming(null); st.deleteExperiment(e.id); }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
