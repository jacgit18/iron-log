import { useState } from 'react';
import { targetNote, targetsFor, type Recommendation } from '../../lib/dietTarget.js';
import { fmtNum } from '../../lib/dietLog.js';
import { targetError, type TargetKey } from '../../shared/diet.js';
import { useAppStore } from '../../store/useAppStore.js';
import type { DietCfg } from '../../types.ts';

const num = (t: string) => (t.trim() === '' ? null : Number(t));
const KEYS: { key: TargetKey; id: string; label: string; unit: string }[] = [
  { key: 'kcal', id: 'dt-tk', label: 'Calories', unit: 'kcal' }, { key: 'protein', id: 'dt-tp', label: 'Protein (g)', unit: 'g protein' },
  { key: 'carbs', id: 'dt-tc', label: 'Carbs (g)', unit: 'g carbs' }, { key: 'fat', id: 'dt-tf', label: 'Fat (g)', unit: 'g fat' },
];

// The daily targets: what you typed, else the recommendation from your weight and goal (an estimate, not advice), with a way to type your own.
export default function DietTargets({ typed, rec, goalLb }: { typed: DietCfg | undefined; rec: Recommendation; goalLb: number | null }) {
  const t = targetsFor(typed, rec);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState<Record<TargetKey, string>>({ kcal: '', protein: '', carbs: '', fat: '' });
  const [err, setErr] = useState('');
  const open = () => { setText({ kcal: str(typed?.kcal), protein: str(typed?.protein), carbs: str(typed?.carbs), fat: str(typed?.fat) }); setErr(''); setEditing(true); };
  const save = () => {
    const bad = KEYS.map(k => targetError(k.key, num(text[k.key]))).find(Boolean); // check all first, so an error never leaves some of them saved
    if (bad) { setErr(bad); return; }
    const st = useAppStore.getState();
    KEYS.forEach(k => st.setDietTarget(k.key, num(text[k.key])));
    setEditing(false);
  };
  const reset = () => { const st = useAppStore.getState(); KEYS.forEach(k => st.setDietTarget(k.key, null)); setEditing(false); };
  const any = t.kcal !== null || t.protein !== null;
  const hasTyped = Object.values(t.typed).some(Boolean);
  if (editing) {
    return (
      <form className="dt-targets" noValidate onSubmit={e => { e.preventDefault(); save(); }}>
        <h3>Daily target</h3>
        <div className="fields">
          {KEYS.map(k => (
            <label className="field" htmlFor={k.id} key={k.key}>{k.label}
              <input id={k.id} type="number" inputMode="numeric" min="0" step="any" placeholder={t[k.key] !== null && !t.typed[k.key] ? String(t[k.key]) : ''} value={text[k.key]} onChange={e => { setText({ ...text, [k.key]: e.target.value }); setErr(''); }} />
            </label>
          ))}
        </div>
        <p className="note">Leave a box empty to use the recommended number. Carbs and fat follow your calories and protein unless you type them.</p>
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
      {any ? (
        <ul className="dt-nums">
          {KEYS.map(k => t[k.key] !== null && <li key={k.key}><b>{fmtNum(t[k.key]!)} {k.unit}</b>{t.typed[k.key] && <span className="note"> your number</span>}</li>)}
        </ul>
      ) : <p className="dt-nums"><b>No target yet</b></p>}
      <p className="note">{targetNote(rec, goalLb)}</p>
      <div className="actions">
        <button type="button" className="btn sm" onClick={open}>{any ? 'Edit target' : 'Set target'}</button>
        {hasTyped && rec.kind === 'ok' && <button type="button" className="btn sm ghost" onClick={reset}>Use recommended</button>}
      </div>
    </div>
  );
}

const str = (n: number | undefined) => (n !== undefined ? String(n) : '');
