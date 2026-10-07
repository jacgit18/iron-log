import type { LiftGoal as LiftGoalT, LogEntry } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { parseDate, fmtShort } from '../../shared/dates.js';
import { GOAL_KEYS, goalPhaseLabel, liftGoalsOf, liftGoalStatus } from '../../lib/liftGoal.js';
import { fmtLb, signed } from '../../lib/body.js';
import ArmedButton from '../ArmedButton.jsx';

function GoalForm({ exId, from, goal, taken, defKey, onDone }: { exId: string; from?: string; goal?: LiftGoalT; taken: string[]; defKey?: string; onDone: () => void }) {
  const { setLiftGoal } = useAppStore.getState();
  const free = GOAL_KEYS.filter(k => k === from || !taken.includes(k));
  const [key, setKey] = useState(from || (free.includes(defKey as string) ? (defKey as string) : free[0]));
  const [w, setW] = useState(goal ? fmtLb(goal.w) : ''); const [by, setBy] = useState(goal && goal.by ? goal.by : '');
  return (
    <form className="goalform" noValidate onSubmit={e => { e.preventDefault(); if (setLiftGoal(exId, key, w, by, from)) onDone(); }}>
      <div className="fields">
        <label className="field">Phase
          <select value={key} onChange={e => setKey(e.target.value)}>
            {free.map(k => <option key={k} value={k}>{goalPhaseLabel(k)}</option>)}
          </select>
        </label>
        <label className="field">Goal (lb)<input type="number" inputMode="decimal" step="any" min="0" value={w} onChange={e => setW(e.target.value)} /></label>
        <label className="field">By (optional)<input type="date" value={by} onChange={e => setBy(e.target.value)} /></label>
      </div>
      <div className="actions">
        <button type="button" className="btn sm" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn sm primary">Save goal</button>
      </div>
    </form>
  );
}

function GoalView({ exId, k, goal, entries, today, onEdit }: { exId: string; k: string; goal: LiftGoalT; entries: LogEntry[]; today: Date; onEdit: () => void }) {
  const { clearLiftGoal } = useAppStore.getState();
  const g = liftGoalStatus(goal, entries, today, k)!; // a goal on the list always has a weight
  const where = k === 'any' ? '' : ` in ${goalPhaseLabel(k).toLowerCase()}`;
  const lines = [];
  if (g.reached) lines.push(`Reached: ${fmtLb(g.best!.w)} lb on ${fmtShort(parseDate(g.best!.d))}.`);
  else {
    lines.push(g.best ? `Best${where}: ${fmtLb(g.best!.w)} lb (${fmtShort(parseDate(g.best!.d))}), ${fmtLb(g.left)} lb to go.` : `Log a set${where} to start tracking it.`);
    if (g.need != null) lines.push(`To hit it by ${fmtShort(parseDate(g.by!))}: ${signed(g.need, 1)} lb a week.`);
    if (g.by && g.weeksLeft != null && g.weeksLeft <= 0) lines.push(`The date (${fmtShort(parseDate(g.by!))}) has passed.`);
  }
  const name = `${goalPhaseLabel(k)} goal`;
  return (
    <div className="goalitem">
      <h4>{goalPhaseLabel(k)}: {fmtLb(goal.w)} lb{goal.by ? ` by ${fmtShort(parseDate(goal.by))}` : ''}</h4>
      {g.best && (
        <div className="goalbar" role="img" aria-label={`${g.pct}% of the way to ${fmtLb(goal.w)} lb${where}`}>
          <div className="bar"><i style={{ width: `${g.pct}%` }} /></div><span>{g.pct}%</span>
        </div>
      )}
      {lines.map(t => <p className="note" key={t}>{t}</p>)}
      <div className="actions">
        <button type="button" className="btn sm" aria-label={`Change ${name}`} onClick={onEdit}>Change</button>
        <ArmedButton className="btn sm ghost" aria-label={name} label="Remove" armedLabel="Confirm remove" onConfirm={() => clearLiftGoal(exId, k)} />
      </div>
    </div>
  );
}

// The weight you want to lift on this exercise, per phase or in any phase: set it, see your best against it,
// and the weekly gain needed to hit a date.
export default function LiftGoal({ exId }: { exId: string }) {
  const cfg = useAppStore(s => s.cfg);
  const L = useAppStore(s => s.logs[exId]);
  const today = useToday(s => s.today);
  const [editing, setEditing] = useState<string | null>(null); // null, 'new' or the key of the goal being changed
  const goals = liftGoalsOf(cfg, exId); const taken = goals.map(([k]) => k);
  const last = L && L.length ? L[L.length - 1] : null;
  const defKey = goals.length ? (last && last.ph) || 'any' : 'any';
  const done = () => setEditing(null);
  return (
    <div className="bwgoal">
      <h3>Weight goals</h3>
      {!goals.length && editing !== 'new' && <p className="note">The most weight you want to lift, in one phase or any. Your heaviest logged set counts toward it.</p>}
      {goals.map(([k, goal]) => (editing === k
        ? <GoalForm key={k} exId={exId} from={k} goal={goal} taken={taken} onDone={done} />
        : <GoalView key={k} exId={exId} k={k} goal={goal} entries={L} today={today} onEdit={() => setEditing(k)} />))}
      {editing === 'new'
        ? <GoalForm exId={exId} taken={taken} defKey={defKey} onDone={done} />
        : taken.length < GOAL_KEYS.length && <div className="actions"><button type="button" className="btn sm" onClick={() => setEditing('new')}>{goals.length ? 'Add a goal' : 'Set a goal'}</button></div>}
    </div>
  );
}
