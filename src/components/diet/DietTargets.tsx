import { useState } from 'react';
import { targetNote, targetsFor, type Recommendation } from '../../lib/dietTarget.js';
import { fmtNum } from '../../lib/dietLog.js';
import { targetError } from '../../shared/diet.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { DietCfg } from '../../types.ts';

const num = (t: string) => (t.trim() === '' ? null : Number(t));

// The daily targets: what you typed, else the recommendation from your goal weight (an estimate, not advice), with a way to type your own.
export default function DietTargets({ typed, rec, goalLb }: { typed: DietCfg | undefined; rec: Recommendation; goalLb: number | null }) {
  const t = targetsFor(typed, rec);
  const [editing, setEditing] = useState(false);
  const [kcal, setKcal] = useState(''); const [protein, setProtein] = useState(''); const [err, setErr] = useState('');
  const recKcal = rec.kind === 'ok' ? rec.kcal : null, recProtein = rec.kind === 'ok' ? rec.protein : null;
  const open = () => { setKcal(typed?.kcal !== undefined ? String(typed.kcal) : ''); setProtein(typed?.protein !== undefined ? String(typed.protein) : ''); setErr(''); setEditing(true); };
  const save = () => {
    const k = num(kcal), p = num(protein);
    const bad = targetError('kcal', k) || targetError('protein', p); // check both first, so an error never leaves one of them saved
    if (bad) { setErr(bad); return; }
    const st = useAppStore.getState();
    st.setDietTarget('kcal', k); st.setDietTarget('protein', p);
    setEditing(false);
  };
  const reset = () => { const st = useAppStore.getState(); st.setDietTarget('kcal', null); st.setDietTarget('protein', null); setEditing(false); };
  const why = targetNote(rec, goalLb);
  if (editing) {
    return (
      <form className="dt-targets" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
        <h3>Daily target</h3>
        <div className="fields">
          <label className="field" htmlFor="dt-tk">Calories<input id="dt-tk" type="number" inputMode="numeric" min="0" step="any" placeholder={recKcal ? String(recKcal) : ''} value={kcal} onChange={e => { setKcal(e.target.value); setErr(''); }} /></label>
          <label className="field" htmlFor="dt-tp">Protein (g)<input id="dt-tp" type="number" inputMode="numeric" min="0" step="any" placeholder={recProtein ? String(recProtein) : ''} value={protein} onChange={e => { setProtein(e.target.value); setErr(''); }} /></label>
        </div>
        <p className="note">Leave a box empty to use the recommended number.</p>
        {err && <p className="note" role="alert">{err}</p>}
        <div className="actions">
          <button type="button" className="btn sm" onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className="btn sm primary">Save target</button>
        </div>
      </form>
    );
  }
  return (
    <div className="dt-targets">
      <h3>Daily target</h3>
      <p className="dt-nums">
        <b>{t.kcal ? `${fmtNum(t.kcal)} kcal` : 'No calorie target'}</b>
        <span className="note">{t.kcal ? (t.kcalTyped ? ' your number' : ' recommended') : ''}</span>
        {' · '}
        <b>{t.protein ? `${fmtNum(t.protein)} g protein` : 'No protein target'}</b>
        <span className="note">{t.protein ? (t.proteinTyped ? ' your number' : ' recommended') : ''}</span>
      </p>
      <p className="note">{why}</p>
      <div className="actions">
        <button type="button" className="btn sm" onClick={open}>{t.kcal || t.protein ? 'Edit target' : 'Set target'}</button>
        {(typed?.kcal !== undefined || typed?.protein !== undefined) && rec.kind === 'ok' && <button type="button" className="btn sm ghost" onClick={reset}>Use recommended</button>}
      </div>
    </div>
  );
}
