import { useState } from 'react';
import { kcalFromMacros } from '../../lib/foodMacros.js';
import { liveRows, microOfRows, rowsFromMicro } from '../../lib/foodAmountRows.js';
import type { AmountRow } from '../../lib/foodAmountRows.js';
import type { Micro } from '../../shared/foodMicro.js';
import { portionAmounts, portionMaxFor, portionValues, portionWords, shownPer, stepPortionCount } from '../../lib/portionBasis.js';
import type { PortionBasis } from '../../lib/portionBasis.js';
import { fmtNum } from '../../lib/macroLine.js';
import Icon from '../Icon.js';
import FoodAmountRows from './FoodAmountRows.js';
import './EntryForm.css';

/** One food as typed: carbs and fat are optional (`null` when the box was left empty, so an edit can clear one). */
export interface EntryValues { n: string; kcal: number; p: number; c: number | null; f: number | null; /** The typed or kept vitamins and minerals; `null` when the amounts section was shown and left empty. Absent when the section is not shown. */ micro?: Micro | null; /** Per-portion mode only: the portions the numbers above are totals for. */ x?: number; /** Per-portion mode only: one portion's typed or kept amounts, for the optional save to the recipe (`null` for none). */ microPer?: Micro | null; /** Per-portion mode only: the "also save to the recipe" tick. */ saveToRecipe?: boolean }

const num = (t: string) => (t.trim() === '' ? NaN : Number(t));
const opt = (t: string) => (t.trim() === '' ? null : Number(t));
const str = (n: number | undefined) => (n !== undefined ? String(n) : '');

// One food: a name, calories, protein and optional carbs and fat. Used to add (quick add) and to edit an entry. `onSubmit` returns an error text, or null when it was saved.
export default function EntryForm({ idp, initial, start, submitLabel, onSubmit, onCancel, amounts, portion }: { idp: string; initial?: { n: string; kcal: number; p: number; c?: number; f?: number }; /** Numbers to begin with in an add form (a food picked from the search); the caller changes `key` to apply a new one. */ start?: { n: string; kcal: number; p: number; c?: number; f?: number }; submitLabel: string; onSubmit: (v: EntryValues) => string | null; onCancel?: () => void; /** Shows the "Vitamins and minerals (optional)" section: the amounts to begin with and the calories they came with (the caller decides). */ amounts?: { micro?: Micro; kcal?: number }; /** Per-portion mode (brief portion-scaled-micros): the boxes are ONE portion, a stepper sets how many were eaten, the total is live, and what is saved is the total at that portion. `amounts` and `initial` are ignored; `offerRecipeSave` shows the "also save to the recipe" tick (on by default). */ portion?: { basis: PortionBasis; offerRecipeSave: boolean } }) {
  const shown = portion ? shownPer(portion.basis.per) : undefined;
  const from = portion ? { n: initial?.n ?? '', kcal: Number(shown!.kcal), p: Number(shown!.p), ...(shown!.c !== '' ? { c: Number(shown!.c) } : {}), ...(shown!.f !== '' ? { f: Number(shown!.f) } : {}) } : initial ?? start;
  // Vitamins and minerals (brief type-food-amounts): shown only when the caller passes `amounts`; rows from a lookup, a scan or an earlier save go when calories change, rows typed here stay.
  const [rows, setRows] = useState<AmountRow[]>(() => rowsFromMicro(portion ? portion.basis.per.micro : amounts?.micro, true));
  const [x, setX] = useState(portion?.basis.x ?? 1);
  const [tick, setTick] = useState(true);
  const [n, setN] = useState(from?.n ?? '');
  const [kcal, setKcal] = useState(str(from?.kcal));
  const [p, setP] = useState(str(from?.p));
  const [c, setC] = useState(str(from?.c));
  const [f, setF] = useState(str(from?.f));
  const [err, setErr] = useState('');
  const amt = portion ? portionAmounts(rows, kcal, portion.basis) : undefined;
  const live = amt ?? (amounts ? liveRows(rows, num(kcal), amounts.kcal) : undefined);
  const microPer = amt ? amt.microPer : live ? microOfRows(live.rows).micro ?? null : null;
  const typed = { kcal: kcal.trim() === '' ? '' : kcal, p, c, f };
  const pv = portion ? portionValues({ shown: shown!, typed, exact: portion.basis.per, x, microPer }) : undefined;
  const max = pv ? portionMaxFor(pv.per) : 10;
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
      const out = pv
        ? pv.totals ? onSubmit({ n, kcal: pv.totals.kcal, p: pv.totals.p, c: pv.totals.c, f: pv.totals.f, micro: pv.totals.micro, x, microPer, saveToRecipe: portion!.offerRecipeSave && tick }) : (Number.isNaN(pv.per.kcal) || Number.isNaN(pv.per.p) ? onSubmit({ n, kcal: pv.per.kcal, p: pv.per.p, c: pv.per.c, f: pv.per.f }) : 'Those numbers are out of range for that many portions.')
        : onSubmit({ n, kcal: num(kcal), p: num(p), c: opt(c), f: opt(f), ...(live ? { micro: microOfRows(live.rows).micro ?? null } : {}) });
      if (out) setErr(out); else { setErr(''); if (!initial && !portion) { setN(''); setKcal(''); setP(''); setC(''); setF(''); setTypedKcal(false); setRows([]); } }
    }}>
      <div className="fields">
        <label className="field" htmlFor={`${idp}-n`}>Food<input id={`${idp}-n`} value={n} maxLength={80} onChange={e => { setN(e.target.value); setErr(''); }} /></label>
        {field('k', 'Calories', kcal, v => { setKcal(v); setTypedKcal(v.trim() !== ''); }, { inputMode: 'numeric', min: '1' })}
        {field('p', 'Protein (g)', p, macro(setP, 'p'), { inputMode: 'decimal' })}
        {field('c', 'Carbs (g), optional', c, macro(setC, 'c'), { inputMode: 'decimal' })}
        {field('f', 'Fat (g), optional', f, macro(setF, 'f'), { inputMode: 'decimal' })}
      </div>
      {!initial && <p className="note">Fill in protein, carbs and fat and the calories fill in. Type calories yourself to keep your number.</p>}
      {portion && (
        <div className="pf-portion">
          <div className="pf-step" role="group" aria-label="Portions eaten">
            <button type="button" className="btn" id={`${idp}-px-less`} aria-label="Less portions" disabled={x <= 0.5} onClick={() => setX(stepPortionCount(x, -1, max))}><Icon name="minus" /></button>
            <output id={`${idp}-px`} className="pf-x" aria-live="polite">{fmtNum(x)}</output>
            <button type="button" className="btn" id={`${idp}-px-more`} aria-label="More portions" disabled={x >= max} onClick={() => setX(stepPortionCount(x, 1, max))}><Icon name="plus" /></button>
          </div>
          <p className="note" id={`${idp}-total`} role="status">You ate {portionWords(x)}{pv?.totals ? `: ${fmtNum(pv.totals.kcal)} kcal · P ${fmtNum(pv.totals.p)} g${pv.totals.micro ? ' · amounts scaled' : ''}` : ''}.</p>
          {!portion.basis.recorded && <p className="note" id={`${idp}-unrec`}>The portion was not recorded when this was logged, so the numbers above are for 1 portion.</p>}
        </div>
      )}
      {live && <FoodAmountRows idp={idp} rows={live.rows} onChange={setRows} cleared={live.cleared} perServing={!!portion} />}
      {portion?.offerRecipeSave && live && live.rows.length > 0 && (
        <label className="pf-tick"><input type="checkbox" id={`${idp}-tick`} checked={tick} onChange={e => setTick(e.target.checked)} />Also save these amounts to the recipe (per serving)</label>
      )}
      {err && <p className="note" role="alert">{err}</p>}
      <div className="actions">
        {onCancel && <button type="button" className="btn sm" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn sm primary">{submitLabel}</button>
      </div>
    </form>
  );
}
