import { useState, type DragEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, exInfo } from '../../lib/data.js';
import { DAYS, lastLog, describe, todayCol } from '../../lib/logic.js';
import { ymd, weekStartOf } from '../../shared/dates.js';
import ExperimentCard from '../ExperimentCard.jsx';
import RemovedNotice from '../RemovedNotice.jsx';

// The Experiment board: exercises to try, added to a day of the viewed week. `day` is the column shown on phones.
export default function Experiments({ day, onDragStart, onDragEnd }: { day: number; onDragStart: (e: DragEvent, id: string) => void; onDragEnd: () => void }) {
  const cfg = useAppStore(s => s.cfg);
  const items = useAppStore(s => s.experiments);
  const logs = useAppStore(s => s.logs);
  const rest = useAppStore(s => s.week.rest) || [];
  const weekStart = useAppStore(s => s.weekStart);
  const today = useToday(s => s.today);
  const st = useAppStore.getState();
  const [pick, setPick] = useState<Record<string, number>>({});
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
            const n = exInfo(cfg, e.ex).n; const last = lastLog(logs, e.ex); const to = days.includes(pick[e.id]) ? pick[e.id] : def;
            return (
              <ExperimentCard key={e.id} id={e.id} prefix="exp" name={n} tag={e.ph ? PHASES[e.ph].label : undefined} note={e.note}
                detail={last && <div className="lastlog">Last: {describe(last)}</div>}
                days={days.map(d => ({ value: d, label: `Day ${d}` }))} to={to} onTo={d => setPick(p => ({ ...p, [e.id]: d }))} onAdd={() => st.addToDay(e.id, to)}
                onEdit={() => st.openModal({ type: 'experiment', id: e.id })} onDelete={() => st.deleteExperiment(e.id)}
                drag={{ onStart: ev => onDragStart(ev, 'exp:' + e.id), onEnd: onDragEnd }} />
            );
          })}
        </ul>
      )}
    </section>
  );
}
