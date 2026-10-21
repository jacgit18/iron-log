import { useState, type DragEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, exInfo } from '../../lib/data.js';
import { DAYS, colOf, describe, lastSession, todayCol } from '../../lib/logic.js';
import { ymd, weekStartOf } from '../../shared/dates.js';
import { hasFilter, matchesQuery } from '../../lib/experimentFilter.js';
import ExperimentCard from '../ExperimentCard.jsx';
import ExperimentSearch from '../ExperimentSearch.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import './Experiments.css';

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
  const [q, setQ] = useState('');
  if (q && !hasFilter(items.length)) setQ(''); // the search hides on a short list: forget its text, so it does not come back filled in
  const shown = hasFilter(items.length) ? items.filter(e => matchesQuery(q, exInfo(cfg, e.ex).n, e.note)) : items; // the search shows only on a long list
  const days = DAYS.filter(d => !rest.includes(d));
  const start = ymd(weekStartOf(today)) === ymd(weekStart) ? todayCol(today) : day;
  const def = days.includes(start) ? start : days[0];
  return (
    <section className="experiments" aria-labelledby="exp-h">
      <div className="exphead">
        <h2 id="exp-h" className="cond" tabIndex={-1}>Experiments</h2>
        <button type="button" className="btn sm" onClick={() => st.openModal({ type: 'experiment' })}>+ Add experiment</button>
      </div>
      <RemovedNotice scope="experiments" />
      {hasFilter(items.length) && <ExperimentSearch id="exp-q" q={q} onQ={setQ} shown={shown.length} total={items.length} what="exercises" />}
      {!items.length ? <p className="note">Keep exercises you want to try here, then add them to a day.</p> : !shown.length ? <p className="note">No exercise matches. Clear the search.</p> : (
        <ul className="explist">
          {shown.map(e => {
            const n = exInfo(cfg, e.ex).n; const last = lastSession(logs, e.ex); // a ticked-off card writes an auto entry for a weight never lifted; only a session you logged is "Last"
            const on = [...new Set((week.extra || []).filter(x => x.ex === e.ex).map(x => colOf(week, week.moved?.[x.id] || x.day)))].sort((a, b) => a - b); // the days of this week it is already on, where a dragged card now sits
            const to = days.includes(pick[e.id]) ? pick[e.id] : def;
            return (
              <ExperimentCard key={e.id} id={e.id} prefix="exp" name={n} tag={e.ph ? PHASES[e.ph].label : undefined} note={e.note}
                detail={<>{on.length > 0 && <div className="note onday">On {on.map(d => `Day ${d}`).join(', ')} this week</div>}{last && <div className="lastlog">Last: {describe(last)}</div>}</>}
                days={days.map(d => ({ value: d, label: `Day ${d}` }))} to={to} onTo={d => setPick(p => ({ ...p, [e.id]: d }))} addLabel="This week only" onAdd={() => st.addToDay(e.id, to)}
                extra={<button type="button" className="btn sm ghost" aria-label={`Add ${n} to the program, Day ${to}`} onClick={() => st.openAddToProgram(to, e.id)}>To program</button>}
                onEdit={() => st.openModal({ type: 'experiment', id: e.id })} onDelete={() => st.deleteExperiment(e.id)}
                drag={{ onStart: ev => onDragStart(ev, 'exp:' + e.id), onEnd: onDragEnd }} />
            );
          })}
        </ul>
      )}
    </section>
  );
}
