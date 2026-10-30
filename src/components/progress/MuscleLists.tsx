import { useState } from 'react';
import type { MuscleKey } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { exInfo } from '../../lib/data.js';
import { describe, lastLog } from '../../lib/logic.js';
import { newestFirst } from '../../lib/exerciseOrder.js';
import { goalExercises } from '../../lib/goalRows.js';
import { fmtLb } from '../../lib/body.js';
import { goalPhaseLabel, liftGoalsOf, liftGoalsStatus } from '../../lib/liftGoal.js';
import { trainsMuscle } from '../../lib/muscleFilter.js';
import { MUSCLES } from '../../lib/muscles.js';
import Icon from '../Icon.jsx';
import LiftGoal from './LiftGoal.jsx';
import './MuscleLists.css';

const CAP = 5;
const filtered = () => !!useAppStore.getState().bodySel;
const trainsNone = (cfg: Parameters<typeof liftGoalsOf>[0], id: string) => !liftGoalsOf(cfg, id).length;

// The chip that says a muscle is filtering the lists below.
export function MuscleChip() {
  const sel = useAppStore(s => s.bodySel);
  if (!sel) return <p className="note chiprow">Tap a muscle to filter goals and exercises.</p>;
  return (
    <p className="chiprow">
      <span className="fchip">Showing: {MUSCLES[sel].n}<button type="button" aria-label={`Clear ${MUSCLES[sel].n} filter`} onClick={() => useAppStore.getState().selectMuscle(null)}><Icon name="close" /></button></span>
    </p>
  );
}

function useFiltered(ids: string[]) {
  const cfg = useAppStore(s => s.cfg); const sel = useAppStore(s => s.bodySel) as MuscleKey | null; const withSec = useAppStore(s => s.bodySec);
  return ids.filter(id => trainsMuscle(cfg, id, sel, withSec));
}

// One line per goal: name, bar, percent. Tap a row for its edit form.
export function GoalRows({ onAll }: { onAll: () => void }) {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs); const body = useAppStore(s => s.body);
  const today = useToday(s => s.today);
  const [open, setOpen] = useState<string | null>(null);
  const ids = useFiltered(goalExercises(cfg).map(r => r.id));
  // An exercise whose last goal was just removed stays until you leave the page, so its Undo notice has somewhere to show.
  const [seen, setSeen] = useState<string[]>([]); const key = ids.join('|'); const [seenKey, setSeenKey] = useState('');
  if (key !== seenKey) { setSeenKey(key); setSeen(s => [...new Set([...s, ...ids])]); }
  const rows = ids.flatMap(id => liftGoalsStatus(cfg, id, logs[id] || [], today, undefined, body).map(g => ({ id, g }))).sort((a, b) => b.g.pct - a.g.pct);
  const shownRows = rows.slice(0, CAP);
  const gone = seen.filter(id => !ids.includes(id) && trainsNone(cfg, id));
  // One block per exercise, so the goal form (and its Undo notice) stays mounted when the last goal is removed and the row goes.
  const blocks = [...new Set([...shownRows.map(r => r.id), ...gone])];
  return (
    <section className="panel mlists" aria-labelledby="gr-h">
      <h2 id="gr-h">Weight goals</h2>
      {!rows.length && !gone.length && <p className="note">{filtered() ? 'No goals on exercises for this muscle.' : 'Set a goal on any exercise to track it here.'}</p>}
      {blocks.map(id => (
        <div key={id}>
          {shownRows.filter(r => r.id === id).map(({ g }) => (
            <button type="button" className="mlrow" key={g.key} aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
              <span className="mln">{exInfo(cfg, id).n}{g.key !== 'any' && <> · {goalPhaseLabel(g.key)}</>}<small>{g.now != null ? `${fmtLb(g.now)} of ${fmtLb(g.target)} lb` : `Goal ${fmtLb(g.target)} lb`}</small>
                <span className="mlbar"><i className={g.reached ? 'ok' : ''} style={{ width: `${g.pct}%` }} /></span></span>
              <b>{g.reached ? 'Reached' : `${g.pct}%`}</b>
            </button>
          ))}
          {(open === id || gone.includes(id)) && <LiftGoal exId={id} bare />}
        </div>
      ))}
      <div className="actions"><button type="button" className="btn sm" onClick={onAll}>{rows.length > CAP ? `All ${rows.length} goals` : 'Manage goals'}</button></div>
    </section>
  );
}

// One line per logged exercise: last session and a goal chip. Tap to open its chart.
export function ExerciseRows({ onAll }: { onAll: () => void }) {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs);
  const openModal = useAppStore(s => s.openModal);
  const ids = newestFirst(useFiltered(Object.keys(logs)), logs, id => exInfo(cfg, id).n);
  return (
    <section className="panel mlists" aria-labelledby="er-h">
      <h2 id="er-h">Exercises</h2>
      {!ids.length && <p className="note">{filtered() ? 'Nothing logged for this muscle yet.' : 'No sessions logged yet. Tap Log on any exercise card to record weight, sets and reps.'}</p>}
      {ids.slice(0, CAP).map(id => (
        <button type="button" className="mlrow" key={id} onClick={() => openModal({ type: 'detail', exId: id })}>
          <span className="mln">{exInfo(cfg, id).n}<small>Last {describe(lastLog(logs, id)!)}</small></span><Icon name="chevron-right" />
        </button>
      ))}
      <div className="actions"><button type="button" className="btn sm" onClick={onAll}>Exercise charts</button></div>
    </section>
  );
}
