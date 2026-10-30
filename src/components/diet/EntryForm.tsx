import { useState } from 'react';

/** One food as typed: carbs and fat are optional (`null` when the box was left empty, so an edit can clear one). */
export interface EntryValues { n: string; kcal: number; p: number; c: number | null; f: number | null }

const num = (t: string) => (t.trim() === '' ? NaN : Number(t));
const opt = (t: string) => (t.trim() === '' ? null : Number(t));
const str = (n: number | undefined) => (n !== undefined ? String(n) : '');

// One food: a name, calories, protein and optional carbs and fat. Used to add (quick add) and to edit an entry. `onSubmit` returns an error text, or null when it was saved.
export default function EntryForm({ idp, initial, submitLabel, onSubmit, onCancel }: { idp: string; initial?: { n: string; kcal: number; p: number; c?: number; f?: number }; submitLabel: string; onSubmit: (v: EntryValues) => string | null; onCancel?: () => void }) {
  const [n, setN] = useState(initial?.n ?? '');
  const [kcal, setKcal] = useState(str(initial?.kcal));
  const [p, setP] = useState(str(initial?.p));
  const [c, setC] = useState(str(initial?.c));
  const [f, setF] = useState(str(initial?.f));
  const [err, setErr] = useState('');
  const field = (id: string, label: string, value: string, set: (v: string) => void, extra: object) => (
    <label className="field" htmlFor={`${idp}-${id}`}>{label}<input id={`${idp}-${id}`} type="number" step="any" min="0" value={value} onChange={e => { set(e.target.value); setErr(''); }} {...extra} /></label>
  );
  return (
    <form className="dt-form" noValidate onSubmit={e => {
      e.preventDefault();
      const out = onSubmit({ n, kcal: num(kcal), p: num(p), c: opt(c), f: opt(f) });
      if (out) setErr(out); else { setErr(''); if (!initial) { setN(''); setKcal(''); setP(''); setC(''); setF(''); } }
    }}>
      <div className="fields">
        <label className="field" htmlFor={`${idp}-n`}>Food<input id={`${idp}-n`} value={n} maxLength={80} onChange={e => { setN(e.target.value); setErr(''); }} /></label>
        {field('k', 'Calories', kcal, setKcal, { inputMode: 'numeric', min: '1' })}
        {field('p', 'Protein (g)', p, setP, { inputMode: 'decimal' })}
        {field('c', 'Carbs (g), optional', c, setC, { inputMode: 'decimal' })}
        {field('f', 'Fat (g), optional', f, setF, { inputMode: 'decimal' })}
      </div>
      {err && <p className="note" role="alert">{err}</p>}
      <div className="actions">
        {onCancel && <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn sm primary">{submitLabel}</button>
      </div>
    </form>
  );
}
