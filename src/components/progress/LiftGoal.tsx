import type { LiftGoal as LiftGoalT, LogEntry, MuscleTags } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { parseDate, fmtShort } from '../../shared/dates.js';
import { GOAL_KEYS, goalFromMultiplier, goalPhaseLabel, liftGoalsOf, liftGoalStatus, multiplierOf, suggestedMultiplier } from '../../lib/liftGoal.js';
import { tagsOf } from '../../lib/muscles.js';
import { bwSorted, fmtLb, signed } from '../../lib/body.js';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';

// `prepare` gives the exercise id when the form is saved, for an exercise that joins the library only then (a catalog pick); null stops the save.
// `tags`: the muscles of a catalog exercise that is not in the library yet, for the suggested multiplier.
export function GoalForm({ exId, prepare, from, goal, taken, defKey, tags, onDone }: { exId: string; prepare?: () => string | null; from?: string; goal?: LiftGoalT; taken: string[]; defKey?: string; tags?: MuscleTags | null; onDone: () => void }) {
  const { setLiftGoal } = useAppStore.getState();
  const free = GOAL_KEYS.filter(k => k === from || !taken.includes(k));
  const [key, setKey] = useState(from || (free.includes(defKey as string) ? (defKey as string) : free[0]));
  const [w, setW] = useState(goal ? fmtLb(goal.w) : ''); const [by, setBy] = useState(goal && goal.by ? goal.by : '');
  const bodyLb = useAppStore(s => { const L = bwSorted(s.body); return L.length ? Number(L[L.length - 1].w) : 0; });
  const hasBody = bodyLb > 0;
  const suggested = useAppStore(s => suggestedMultiplier(tags ?? tagsOf(s.cfg, exId)));
  const [scale, setScale] = useState(!!goal?.bw);
  const [mult, setMult] = useState(goal?.bw ? String(multiplierOf(goal.w, goal.bw)) : '');
  // Goal and multiplier follow each other at your latest body weight: the goal in steps of 5 lb, the multiplier to two places.
  const onScale = (on: boolean) => {
    setScale(on);
    if (!on) return;
    const n = Number(w);
    if (n > 0) setMult(String(multiplierOf(n, bodyLb)));
    else { setMult(String(suggested)); setW(String(goalFromMultiplier(suggested, bodyLb))); }
  };
  const onMult = (v: string) => { setMult(v); const n = Number(v); if (n > 0) setW(String(goalFromMultiplier(n, bodyLb))); };
  const onW = (v: string) => { setW(v); const n = Number(v); if (scale && n > 0 && hasBody) setMult(String(multiplierOf(n, bodyLb))); };
  return (
    <form className="goalform" noValidate onSubmit={e => { e.preventDefault(); const id = prepare ? prepare() : exId; if (id && setLiftGoal(id, key, w, by, from, scale)) onDone(); }}>
      <div className="fields">
        <label className="field">Phase
          <select value={key} onChange={e => setKey(e.target.value)}>
            {free.map(k => <option key={k} value={k}>{goalPhaseLabel(k)}</option>)}
          </select>
        </label>
        <label className="field">Goal (lb)<input type="number" inputMode="decimal" step="any" min="0" value={w} onChange={e => onW(e.target.value)} /></label>
        <label className="field">By (optional)<input type="date" value={by} onChange={e => setBy(e.target.value)} /></label>
      </div>
      <label className="inline"><input type="checkbox" checked={scale} disabled={!hasBody && !scale} onChange={e => onScale(e.target.checked)} /> Scale with my body weight</label>
      {scale && <label className="field">Multiplier (× body weight)<input type="number" inputMode="decimal" step="0.1" min="0" value={mult} onChange={e => onMult(e.target.value)} /></label>}
      <p className="note">{!hasBody && !scale ? 'Log your body weight first. ' : ''}The goal rises with your body weight in steps of 5 lb, and stays put if your weight drops.</p>
      <div className="actions">
        <button type="button" className="btn sm" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn sm primary">Save goal</button>
      </div>
    </form>
  );
}

function GoalView({ exId, k, goal, base, entries, today, onEdit }: { exId: string; k: string; goal: LiftGoalT; base: LiftGoalT; entries: LogEntry[]; today: Date; onEdit: () => void }) {
  const { clearLiftGoal } = useAppStore.getState();
  const g = liftGoalStatus(goal, entries, today, k)!; // a goal on the list always has a weight
  const where = k === 'any' ? '' : ` in ${goalPhaseLabel(k).toLowerCase()}`;
  const lines = [];
  if (base.bw) lines.push(`Scales with your body weight: ${fmtLb(base.w)} lb at ${fmtLb(base.bw)} lb body weight.`);
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
        <ArmedButton className="btn sm ghost" aria-label={name} label="Remove" armedLabel="Tap again to remove" onConfirm={() => clearLiftGoal(exId, k)} />
      </div>
    </div>
  );
}

// The weight you want to lift on this exercise, per phase or in any phase: set it, see your best against it,
// and the weekly gain needed to hit a date.
// `bare`: inside the Weight goals panel, where the exercise's name and the panel already head it.
export default function LiftGoal({ exId, bare = false }: { exId: string; bare?: boolean }) {
  const cfg = useAppStore(s => s.cfg); const body = useAppStore(s => s.body);
  const L = useAppStore(s => s.logs[exId]);
  const today = useToday(s => s.today);
  const [editing, setEditing] = useState<string | null>(null); // null, 'new' or the key of the goal being changed
  const goals = liftGoalsOf(cfg, exId, body); const taken = goals.map(([k]) => k);
  const last = L && L.length ? L[L.length - 1] : null;
  const defKey = goals.length ? (last && last.ph) || 'any' : 'any';
  const done = () => setEditing(null);
  return (
    <div className={bare ? 'goalbare' : 'bwgoal'}>
      {!bare && <h3>Weight goals</h3>}
      <RemovedNotice scope={'liftgoal:' + exId} />
      {!goals.length && !bare && editing !== 'new' && <p className="note">The most weight you want to lift, in one phase or any. Your heaviest logged set counts toward it.</p>}
      {goals.map(([k, goal]) => { const base = cfg.liftGoals![exId]![k]!; return (editing === k
        ? <GoalForm key={k} exId={exId} from={k} goal={base} taken={taken} onDone={done} />
        : <GoalView key={k} exId={exId} k={k} goal={goal} base={base} entries={L} today={today} onEdit={() => setEditing(k)} />); })}
      {editing === 'new'
        ? <GoalForm exId={exId} taken={taken} defKey={defKey} onDone={done} />
          : taken.length < GOAL_KEYS.length && !(bare && !goals.length) && <div className="actions"><button type="button" className="btn sm" onClick={() => setEditing('new')}>{goals.length ? 'Add a goal' : 'Set a goal'}</button></div>}
    </div>
  );
}
