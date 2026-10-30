import { useState } from 'react';

export interface EntryValues { n: string; kcal: number; p: number }

const num = (t: string) => (t.trim() === '' ? NaN : Number(t));

// One food: a name, calories and protein. Used to add (quick add) and to edit an entry. `onSubmit` returns an error text, or null when it was saved.
export default function EntryForm({ idp, initial, submitLabel, onSubmit, onCancel }: { idp: string; initial?: EntryValues; submitLabel: string; onSubmit: (v: EntryValues) => string | null; onCancel?: () => void }) {
  const [n, setN] = useState(initial?.n ?? '');
  const [kcal, setKcal] = useState(initial ? String(initial.kcal) : '');
  const [p, setP] = useState(initial ? String(initial.p) : '');
  const [err, setErr] = useState('');
  return (
    <form className="dt-form" noValidate onSubmit={e => {
      e.preventDefault();
      const out = onSubmit({ n, kcal: num(kcal), p: num(p) });
      if (out) setErr(out); else { setErr(''); if (!initial) { setN(''); setKcal(''); setP(''); } }
    }}>
      <div className="fields">
        <label className="field" htmlFor={`${idp}-n`}>Food<input id={`${idp}-n`} value={n} maxLength={80} onChange={e => { setN(e.target.value); setErr(''); }} /></label>
        <label className="field" htmlFor={`${idp}-k`}>Calories<input id={`${idp}-k`} type="number" inputMode="numeric" min="1" step="any" value={kcal} onChange={e => { setKcal(e.target.value); setErr(''); }} /></label>
        <label className="field" htmlFor={`${idp}-p`}>Protein (g)<input id={`${idp}-p`} type="number" inputMode="decimal" min="0" step="any" value={p} onChange={e => { setP(e.target.value); setErr(''); }} /></label>
      </div>
      {err && <p className="note" role="alert">{err}</p>}
      <div className="actions">
        {onCancel && <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn sm primary">{submitLabel}</button>
      </div>
    </form>
  );
}
