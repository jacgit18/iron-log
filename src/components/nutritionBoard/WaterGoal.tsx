import { useState } from 'react';
import { OZ_PER_LB, fmtOz, goalFor } from '../../lib/water.js';
import { useAppStore } from '../../store/useAppStore.js';
import '../supplements/Supplements.css';

// The base water goal (moved from the drink sheet in PR 2 of brief nutrition-board): a fixed number of ounces, or half your body weight in pounds. Hot days and training add to it per day, in the drink sheet.
export default function WaterGoal({ day }: { day: string }) {
  const supp = useAppStore(s => s.supp);
  const body = useAppStore(s => s.body);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const gi = goalFor(supp, body, day);
  const st = () => useAppStore.getState();
  if (!editing) {
    return (
      <div className="wgoal">
        <span>Base goal <b>{fmtOz(gi.baseOz)} oz</b> <span className="note">{supp.waterMode === 'fixed' ? 'fixed' : `half your weight (${OZ_PER_LB} oz per lb)`}</span></span>
        <button type="button" className="btn sm ghost" id="water-goal-edit" onClick={() => { setText(fmtOz(gi.baseOz)); setEditing(true); }}>Change base goal</button>
      </div>
    );
  }
  return (
    <form className="wgoalform" noValidate onSubmit={e => { e.preventDefault(); if (st().setWaterGoal(text)) setEditing(false); }}>
      <label className="field">Fixed daily goal (oz)<input type="number" inputMode="decimal" min="8" max="500" step="any" value={text} autoFocus onChange={e => setText(e.target.value)} /></label>
      <button type="submit" className="btn sm primary">Use this amount</button>
      {supp.waterMode === 'fixed' && <button type="button" className="btn sm" onClick={() => { st().setWaterByWeight(); setEditing(false); }}>Use my weight ({OZ_PER_LB} oz per lb)</button>}
      <button type="button" className="btn sm ghost" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}
