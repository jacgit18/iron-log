import type { CatalogItem } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { exInfo, EQUIPMENT } from '../../lib/data.js';
import { muscleList } from '../../lib/exerciseLibrary.js';
import { exerciseOptions } from '../../lib/exerciseOptions.js';
import { goalExercises } from '../../lib/goalRows.js';
import { liftGoalsOf } from '../../lib/liftGoal.js';
import { pickerKey, type PickerChoice } from '../../lib/picker.js';
import { nameCmp } from '../../lib/sort.js';
import { useExIdsInUse } from '../../hooks/useExIdsInUse.js';
import ItemPicker from '../ItemPicker.jsx';
import LiftGoal, { GoalForm } from './LiftGoal.jsx';
import './GoalsPanel.css';

const catalogMeta = (c: CatalogItem) => [c.data.eq ? EQUIPMENT[c.data.eq] : '', c.data.muscles?.p?.length ? muscleList(c.data.muscles.p) : ''].filter(Boolean).join(' · ');

// "Set a goal" for any exercise: pick one from your library or the catalog, then the goal form. A catalog pick joins your library when the goal is saved.
function NewGoal({ onDone }: { onDone: () => void }) {
  const cfg = useAppStore(s => s.cfg);
  const inUse = useExIdsInUse(cfg);
  const [name, setName] = useState('');
  const [pick, setPick] = useState<PickerChoice | null>(null);
  const [err, setErr] = useState('');
  const exId = pick?.kind === 'mine' ? pick.id : null;
  const prepare = () => {
    if (pick?.kind === 'catalog') { const err = useAppStore.getState().addCatalogExercise(pick.item); if (err && err !== 'Already in your library.') { setErr(err); return null; } setErr(''); return pick.item.id; }
    return exId;
  };
  const onText = (v: string) => { setName(v); if (pick && pickerKey(v) !== pickerKey(pick.kind === 'catalog' ? pick.item.name : exInfo(cfg, exId as string).n)) setPick(null); };
  const chosen = pick && pick.kind !== 'create' ? pick : null;
  const goalId = chosen ? (chosen.kind === 'catalog' ? chosen.item.id : (chosen.id)) : '';
  const taken = goalId ? liftGoalsOf(cfg, goalId).map(([k]) => k) : [];
  return (
    <div className="newgoal">
      <ItemPicker id="goalpick" label="Exercise" kind="exercise" value={name} mine={exerciseOptions(cfg, inUse)} catalogMeta={catalogMeta}
        placeholder="Type to search, e.g. Barbell Curl" onText={onText} onPick={setPick} autoFocus />
      {chosen?.kind === 'catalog' && <p className="note">From the catalog. It will be added to your exercise library when you save.</p>}
      {err && <p className="note" role="alert">{err}</p>}
      {chosen && <GoalForm key={goalId} exId={goalId} prepare={prepare} taken={taken} tags={chosen.kind === 'catalog' ? chosen.item.data.muscles : undefined} onDone={onDone} />}
      {!chosen && <div className="actions"><button type="button" className="btn sm" onClick={onDone}>Cancel</button></div>}
    </div>
  );
}

// Every exercise with a weight goal, logged or not, and a way to set one on any exercise. The goal itself is the same one the exercise's detail sheet edits.
export default function GoalsPanel() {
  const cfg = useAppStore(s => s.cfg);
  const [adding, setAdding] = useState(false);
  const rows = goalExercises(cfg);
  // A row whose last goal was just removed stays until you leave the screen, so its Undo notice has somewhere to show.
  const [seen, setSeen] = useState<string[]>([]); const [seenKey, setSeenKey] = useState('');
  const key = rows.map(r => r.id).join('|');
  if (key !== seenKey) { setSeenKey(key); setSeen(s => [...new Set([...s, ...rows.map(r => r.id)])]); }
  const shown = [...new Map([...rows, ...seen.map(id => ({ id, name: exInfo(cfg, id).n }))].map(r => [r.id, r])).values()].sort(nameCmp(r => r.name, r => r.id));
  return (
    <section className="panel goalspanel" aria-labelledby="goals-h">
      <div className="goalshead">
        <h2 id="goals-h">Weight goals</h2>
        {!adding && <button type="button" className="btn sm" onClick={() => setAdding(true)}>New exercise goal</button>}
      </div>
      {!rows.length && !shown.length && !adding && <p className="note">The most weight you want to lift on an exercise, in one phase or any. Tap New exercise goal to set one on any exercise, even one you have not logged yet.</p>}
      {shown.map(r => (
        <div className="goalrow" key={r.id}>
          {liftGoalsOf(cfg, r.id).length > 0 && <h3>{r.name}</h3>}
          <LiftGoal exId={r.id} bare />
        </div>
      ))}
      {adding && <NewGoal onDone={() => setAdding(false)} />}
    </section>
  );
}
