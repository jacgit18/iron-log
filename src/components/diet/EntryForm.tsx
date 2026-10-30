import { useState } from 'react';
import { kcalFromMacros } from '../../lib/foodMacros.js';

/** One food as typed: carbs and fat are optional (`null` when the box was left empty, so an edit can clear one). */
export interface EntryValues { n: string; kcal: number; p: number; c: number | null; f: number | null }

const num = (t: string) => (t.trim() === '' ? NaN : Number(t));
const opt = (t: string) => (t.trim() === '' ? null : Number(t));
const str = (n: number | undefined) => (n !== undefined ? String(n) : '');

// One food: a name, calories, protein and optional carbs and fat. Used to add (quick add) and to edit an entry. `onSubmit` returns an error text, or null when it was saved.
export default function EntryForm({ idp, initial, start, submitLabel, onSubmit, onCancel }: { idp: string; initial?: { n: string; kcal: number; p: number; c?: number; f?: number }; /** Numbers to begin with in an add form (a food picked from the search); the caller changes `key` to apply a new one. */ start?: { n: string; kcal: number; p: number; c?: number; f?: number }; submitLabel: string; onSubmit: (v: EntryValues) => string | null; onCancel?: () => void }) {
  const from = initial ?? start;
  const [n, setN] = useState(from?.n ?? '');
  const [kcal, setKcal] = useState(str(from?.kcal));
  const [p, setP] = useState(str(from?.p));
  const [c, setC] = useState(str(from?.c));
  const [f, setF] = useState(str(from?.f));
  const [err, setErr] = useState('');
  const [typedKcal, setTypedKcal] = useState(from !== undefined); // calories you typed, saved or picked from the search are never overwritten by the macros
  // Protein, carbs and fat all filled in: calories follow (4 4 9), until calories were typed by hand.
  const macro = (set: (v: string) => void, which: 'p' | 'c' | 'f') => (v: string) => {
    set(v);
    if (typedKcal) return;
    const g = { p, c, f, [which]: v };
    const k = kcalFromMacros(g.p.trim() === '' ? null : Number(g.p), g.c.trim() === '' ? null : Number(g.c), g.f.trim() === '' ? null : Number(g.f));
    setKcal(k === null ? '' : String(k));
  };
  const field = (id: string, label: string, value: string, set: (v: string) => void, extra: object) => (
    <label className="field" htmlFor={`${idp}-${id}`}>{label}<input id={`${idp}-${id}`} type="number" step="any" min="0" value={value} onChange={e => { set(e.target.value); setErr(''); }} {...extra} /></label>
  );
  return (
    <form className="dt-form" noValidate onSubmit={e => {
      e.preventDefault();
      const out = onSubmit({ n, kcal: num(kcal), p: num(p), c: opt(c), f: opt(f) });
      if (out) setErr(out); else { setErr(''); if (!initial) { setN(''); setKcal(''); setP(''); setC(''); setF(''); setTypedKcal(false); } }
    }}>
      <div className="fields">
        <label className="field" htmlFor={`${idp}-n`}>Food<input id={`${idp}-n`} value={n} maxLength={80} onChange={e => { setN(e.target.value); setErr(''); }} /></label>
        {field('k', 'Calories', kcal, v => { setKcal(v); setTypedKcal(v.trim() !== ''); }, { inputMode: 'numeric', min: '1' })}
        {field('p', 'Protein (g)', p, macro(setP, 'p'), { inputMode: 'decimal' })}
        {field('c', 'Carbs (g), optional', c, macro(setC, 'c'), { inputMode: 'decimal' })}
        {field('f', 'Fat (g), optional', f, macro(setF, 'f'), { inputMode: 'decimal' })}
      </div>
      {!initial && <p className="note">Fill in protein, carbs and fat and the calories fill in. Type calories yourself to keep your number.</p>}
      {err && <p className="note" role="alert">{err}</p>}
      <div className="actions">
        {onCancel && <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn sm primary">{submitLabel}</button>
      </div>
    </form>
  );
}
